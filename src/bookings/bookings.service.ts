import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { BedStatus, BookingStatus, EnquiryStatus, Prisma, ResidentStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RbacContext } from '../rbac/types/rbac.types';
import { BookingQueryDto } from './dto/booking-query.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';

// State machine for Bookings
const ALLOWED_BOOKING_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  [BookingStatus.CONFIRMED]: [
    BookingStatus.CONVERTED_TO_MOVE_IN,
    BookingStatus.CANCELLED,
  ],
  [BookingStatus.CONVERTED_TO_MOVE_IN]: [], // Terminal state
  [BookingStatus.CANCELLED]: [], // Terminal state
};

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper to write structured audit logs atomically
   */
  private createAuditLogTx(
    tx: Prisma.TransactionClient,
    params: {
      organizationId: string;
      userId: string;
      action: string;
      entityId: string;
      oldValues?: any;
      newValues?: any;
      ipAddress?: string;
    },
  ) {
    return tx.audit_logs.create({
      data: {
        id: randomUUID(),
        organizationId: params.organizationId,
        userId: params.userId,
        action: params.action,
        entityType: 'bookings',
        entityId: params.entityId,
        oldValues: params.oldValues ? JSON.stringify(params.oldValues) : null,
        newValues: params.newValues ? JSON.stringify(params.newValues) : null,
        ipAddress: params.ipAddress ?? null,
      },
    });
  }

  /**
   * Validate physical hierarchy: Org -> Property -> Room -> Bed
   */
  private async verifyHierarchy(
    propertyId: string,
    roomId: string,
    bedId: string,
    organizationId: string,
  ) {
    const property = await this.prisma.properties.findFirst({
      where: { id: propertyId, organizationId, deletedAt: null },
    });
    if (!property) {
      throw new NotFoundException('Property not found in this organization');
    }

    const room = await this.prisma.rooms.findFirst({
      where: { id: roomId, propertyId, deletedAt: null },
    });
    if (!room) {
      throw new NotFoundException('Room not found on specified property');
    }

    const bed = await this.prisma.beds.findFirst({
      where: { id: bedId, roomId, propertyId, deletedAt: null },
    });
    if (!bed) {
      throw new NotFoundException('Bed not found in specified room');
    }

    return { property, room, bed };
  }

  /**
   * Create a new booking with atomic row lock concurrency protection
   */
  async create(
    dto: CreateBookingDto,
    rbac: RbacContext,
    ipAddress?: string,
  ) {
    await this.verifyHierarchy(
      dto.propertyId,
      dto.roomId,
      dto.bedId,
      rbac.organizationId,
    );

    // Verify optional linked enquiry
    if (dto.enquiryId) {
      const enquiry = await this.prisma.enquiries.findFirst({
        where: { id: dto.enquiryId, organizationId: rbac.organizationId, deletedAt: null },
      });
      if (!enquiry) {
        throw new NotFoundException('Linked enquiry not found in this organization');
      }
    }

    // Verify optional linked resident
    if (dto.residentId) {
      const resident = await this.prisma.residents.findFirst({
        where: { id: dto.residentId, organizationId: rbac.organizationId, deletedAt: null },
      });
      if (!resident) {
        throw new NotFoundException('Linked resident not found in this organization');
      }
    }

    const bookingId = randomUUID();
    const now = new Date();
    const receiptNumber = dto.receiptNumber?.trim() || `RCP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const booking = await this.prisma.$transaction(async (tx) => {
      // 1. ATOMIC ROW-LEVEL LOCK: Bed must not be OCCUPIED or RESERVED
      const lockedBed = await tx.beds.updateMany({
        where: {
          id: dto.bedId,
          organizationId: rbac.organizationId,
          status: BedStatus.AVAILABLE,
          deletedAt: null,
        },
        data: {
          status: BedStatus.RESERVED,
          updatedAt: now,
        },
      });

      if (lockedBed.count === 0) {
        throw new ConflictException('Bed is already occupied or booked');
      }

      // 2. Active booking conflict check
      const activeBooking = await tx.bookings.findFirst({
        where: {
          bedId: dto.bedId,
          organizationId: rbac.organizationId,
          status: BookingStatus.CONFIRMED,
        },
      });

      if (activeBooking) {
        throw new ConflictException('Bed already has a confirmed booking');
      }

      // 3. Active stay conflict check
      const activeStay = await tx.resident_stays.findFirst({
        where: {
          bedId: dto.bedId,
          organizationId: rbac.organizationId,
          status: { in: [ResidentStatus.ACTIVE, ResidentStatus.BOOKED, ResidentStatus.RESERVED] },
          checkOutDate: null,
        },
      });

      if (activeStay) {
        throw new ConflictException('Bed is currently occupied by an active resident stay');
      }

      // 4. Create booking
      const created = await tx.bookings.create({
        data: {
          id: bookingId,
          organizationId: rbac.organizationId,
          propertyId: dto.propertyId,
          roomId: dto.roomId,
          bedId: dto.bedId,
          enquiryId: dto.enquiryId ?? null,
          residentId: dto.residentId ?? null,
          bookingAmount: new Prisma.Decimal(dto.bookingAmount),
          bookingDate: dto.bookingDate ? new Date(dto.bookingDate) : now,
          expectedMoveIn: new Date(dto.expectedMoveIn),
          receiptNumber,
          paymentMode: dto.paymentMode ?? 'UPI',
          status: dto.status ?? BookingStatus.CONFIRMED,
          notes: dto.notes?.trim() ?? null,
          createdAt: now,
          updatedAt: now,
        },
      });

      // 5. Update linked enquiry status to BOOKED
      if (dto.enquiryId) {
        await tx.enquiries.update({
          where: { id: dto.enquiryId },
          data: { status: EnquiryStatus.BOOKED, updatedAt: now },
        });
      }

      // 6. Update linked resident status to BOOKED
      if (dto.residentId) {
        await tx.residents.update({
          where: { id: dto.residentId },
          data: {
            status: ResidentStatus.BOOKED,
            propertyId: dto.propertyId,
            roomId: dto.roomId,
            bedId: dto.bedId,
            updatedAt: now,
          },
        });
      }

      // 7. Structured audit log
      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'booking.created',
        entityId: bookingId,
        newValues: {
          propertyId: dto.propertyId,
          bedId: dto.bedId,
          bookingAmount: dto.bookingAmount,
          expectedMoveIn: dto.expectedMoveIn,
          receiptNumber,
          status: created.status,
        },
        ipAddress,
      });

      return created;
    });

    this.logger.log(`Booking created: ${booking.id} on bed ${dto.bedId} by user ${rbac.userId}`);
    return booking;
  }

  /**
   * List bookings with pagination and filters
   */
  async findAll(query: BookingQueryDto, rbac: RbacContext) {
    const {
      page = 1,
      limit = 20,
      search,
      status,
      propertyId,
      roomId,
      bedId,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const skip = (page - 1) * limit;

    const where: Prisma.bookingsWhereInput = {
      organizationId: rbac.organizationId,
    };

    if (search) {
      const term = search.trim();
      where.OR = [
        { receiptNumber: { contains: term, mode: 'insensitive' } },
        { notes: { contains: term, mode: 'insensitive' } },
      ];
    }

    if (status) {
      where.status = status;
    }
    if (propertyId) {
      where.propertyId = propertyId;
    }
    if (roomId) {
      where.roomId = roomId;
    }
    if (bedId) {
      where.bedId = bedId;
    }

    const orderBy: Prisma.bookingsOrderByWithRelationInput = {
      [sortBy]: sortOrder,
    };

    const [items, total] = await Promise.all([
      this.prisma.bookings.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          properties: { select: { id: true, name: true, code: true } },
          rooms: { select: { id: true, roomNumber: true } },
          beds: { select: { id: true, bedNumber: true } },
          residents: { select: { id: true, fullName: true, phone: true, email: true } },
          enquiries: { select: { id: true, name: true, phone: true } },
        },
      }),
      this.prisma.bookings.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  /**
   * Get single booking details
   */
  async findOne(id: string, rbac: RbacContext) {
    const booking = await this.prisma.bookings.findFirst({
      where: {
        id,
        organizationId: rbac.organizationId,
      },
      include: {
        properties: { select: { id: true, name: true, code: true, addressLine1: true } },
        rooms: { select: { id: true, roomNumber: true, roomType: true } },
        beds: { select: { id: true, bedNumber: true, status: true } },
        residents: { select: { id: true, fullName: true, phone: true, email: true, status: true } },
        enquiries: { select: { id: true, name: true, phone: true, source: true } },
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    return booking;
  }

  /**
   * Update booking details and enforce state machine
   */
  async update(
    id: string,
    dto: UpdateBookingDto,
    rbac: RbacContext,
    ipAddress?: string,
  ) {
    const existing = await this.prisma.bookings.findFirst({
      where: {
        id,
        organizationId: rbac.organizationId,
      },
    });

    if (!existing) {
      throw new NotFoundException('Booking not found');
    }

    // State machine check
    if (dto.status && dto.status !== existing.status) {
      const allowed = ALLOWED_BOOKING_TRANSITIONS[existing.status] || [];
      if (!allowed.includes(dto.status)) {
        throw new BadRequestException(
          `Invalid booking transition from ${existing.status} to ${dto.status}. Allowed transitions: ${allowed.join(', ') || 'None'}`,
        );
      }
    }

    const now = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      // If booking cancelled, release bed
      if (dto.status === BookingStatus.CANCELLED) {
        await tx.beds.updateMany({
          where: { id: existing.bedId, status: BedStatus.RESERVED },
          data: { status: BedStatus.AVAILABLE, updatedAt: now },
        });

        if (existing.residentId) {
          await tx.residents.update({
            where: { id: existing.residentId },
            data: { status: ResidentStatus.CLOSED, updatedAt: now },
          });
        }
      }

      const result = await tx.bookings.update({
        where: { id },
        data: {
          bookingAmount: dto.bookingAmount !== undefined ? new Prisma.Decimal(dto.bookingAmount) : existing.bookingAmount,
          expectedMoveIn: dto.expectedMoveIn ? new Date(dto.expectedMoveIn) : existing.expectedMoveIn,
          receiptNumber: dto.receiptNumber !== undefined ? dto.receiptNumber?.trim() : existing.receiptNumber,
          paymentMode: dto.paymentMode !== undefined ? dto.paymentMode?.trim() : existing.paymentMode,
          status: dto.status ?? existing.status,
          notes: dto.notes !== undefined ? dto.notes?.trim() : existing.notes,
          updatedAt: now,
        },
      });

      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: dto.status === BookingStatus.CANCELLED ? 'booking.cancelled' : 'booking.updated',
        entityId: id,
        oldValues: { status: existing.status },
        newValues: { status: result.status },
        ipAddress,
      });

      return result;
    });

    this.logger.log(`Booking updated: ${id} by user ${rbac.userId}`);
    return updated;
  }

  /**
   * Delete / Cancel booking
   */
  async remove(id: string, rbac: RbacContext, ipAddress?: string) {
    const existing = await this.prisma.bookings.findFirst({
      where: {
        id,
        organizationId: rbac.organizationId,
      },
    });

    if (!existing) {
      throw new NotFoundException('Booking not found');
    }

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      // Release bed back to AVAILABLE if RESERVED
      await tx.beds.updateMany({
        where: { id: existing.bedId, status: BedStatus.RESERVED },
        data: { status: BedStatus.AVAILABLE, updatedAt: now },
      });

      // Set booking status to CANCELLED
      await tx.bookings.update({
        where: { id },
        data: {
          status: BookingStatus.CANCELLED,
          updatedAt: now,
        },
      });

      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'booking.deleted',
        entityId: id,
        oldValues: { status: existing.status },
        newValues: { status: BookingStatus.CANCELLED },
        ipAddress,
      });
    });

    this.logger.log(`Booking cancelled / removed: ${id} by user ${rbac.userId}`);
    return {
      success: true,
      message: 'Booking cancelled successfully',
      id,
    };
  }
}
