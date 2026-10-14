import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { BedStatus, BookingStatus, MoveInStatus, Prisma, ResidentStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RbacContext } from '../rbac/types/rbac.types';
import { CreateMoveInDto } from './dto/create-move-in.dto';
import { MoveInQueryDto } from './dto/move-in-query.dto';
import { UpdateMoveInDto } from './dto/update-move-in.dto';

@Injectable()
export class MoveInsService {
  private readonly logger = new Logger(MoveInsService.name);

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
        entityType: 'move_ins',
        entityId: params.entityId,
        oldValues: params.oldValues ? JSON.stringify(params.oldValues) : null,
        newValues: params.newValues ? JSON.stringify(params.newValues) : null,
        ipAddress: params.ipAddress ?? null,
      },
    });
  }

  /**
   * Create Move-In with atomic multi-write transaction:
   * 1. Check & occupy bed (row-level lock)
   * 2. Validate resident active stay collision
   * 3. Update booking status to CONVERTED_TO_MOVE_IN
   * 4. Create resident_stays active contract
   * 5. Update resident status & placement
   * 6. Create move_in record
   * 7. Write audit log
   */
  async create(
    dto: CreateMoveInDto,
    rbac: RbacContext,
    ipAddress?: string,
  ) {
    // 1. Verify property
    const property = await this.prisma.properties.findFirst({
      where: { id: dto.propertyId, organizationId: rbac.organizationId, deletedAt: null },
    });
    if (!property) {
      throw new NotFoundException('Property not found in this organization');
    }

    // 2. Verify resident
    const resident = await this.prisma.residents.findFirst({
      where: { id: dto.residentId, organizationId: rbac.organizationId, deletedAt: null },
    });
    if (!resident) {
      throw new NotFoundException('Resident not found in this organization');
    }

    // 3. Verify bed
    const bed = await this.prisma.beds.findFirst({
      where: { id: dto.bedId, propertyId: dto.propertyId, deletedAt: null },
      include: { rooms: true },
    });
    if (!bed) {
      throw new NotFoundException('Bed not found on specified property');
    }

    // 4. Verify booking if provided
    let linkedBooking: any = null;
    if (dto.bookingId) {
      linkedBooking = await this.prisma.bookings.findFirst({
        where: { id: dto.bookingId, organizationId: rbac.organizationId },
      });
      if (!linkedBooking) {
        throw new NotFoundException('Booking not found in this organization');
      }
      if (linkedBooking.status !== BookingStatus.CONFIRMED) {
        throw new BadRequestException(`Booking is not in CONFIRMED status (current: ${linkedBooking.status})`);
      }
      if (linkedBooking.bedId !== dto.bedId) {
        throw new BadRequestException('Booking bedId does not match the move-in bedId');
      }
    }

    const moveInId = randomUUID();
    const stayId = randomUUID();
    const now = new Date();
    const moveInDate = dto.moveInDate ? new Date(dto.moveInDate) : now;

    const moveIn = await this.prisma.$transaction(async (tx) => {
      // 1. Atomic Row-Lock: Transition bed to OCCUPIED
      const lockedBed = await tx.beds.updateMany({
        where: {
          id: dto.bedId,
          organizationId: rbac.organizationId,
          status: { in: [BedStatus.AVAILABLE, BedStatus.RESERVED] },
          deletedAt: null,
        },
        data: {
          status: BedStatus.OCCUPIED,
          updatedAt: now,
        },
      });

      if (lockedBed.count === 0) {
        throw new ConflictException('Bed is already occupied');
      }

      // 2. Check for active stay conflict on this bed
      const activeStayOnBed = await tx.resident_stays.findFirst({
        where: {
          bedId: dto.bedId,
          organizationId: rbac.organizationId,
          status: { in: [ResidentStatus.ACTIVE] },
          checkOutDate: null,
        },
      });
      if (activeStayOnBed) {
        throw new ConflictException('Bed is already occupied by an active resident stay');
      }

      // 3. Resident duplicate active stay check
      const residentActiveStay = await tx.resident_stays.findFirst({
        where: {
          residentId: dto.residentId,
          organizationId: rbac.organizationId,
          status: { in: [ResidentStatus.ACTIVE] },
          checkOutDate: null,
        },
      });
      if (residentActiveStay) {
        throw new ConflictException('Resident already has an active stay in progress');
      }

      // 4. Update linked booking status to CONVERTED_TO_MOVE_IN
      if (dto.bookingId) {
        await tx.bookings.update({
          where: { id: dto.bookingId },
          data: {
            status: BookingStatus.CONVERTED_TO_MOVE_IN,
            residentId: dto.residentId,
            updatedAt: now,
          },
        });
      }

      // 5. Create resident active stay contract
      await tx.resident_stays.create({
        data: {
          id: stayId,
          organizationId: rbac.organizationId,
          residentId: dto.residentId,
          propertyId: dto.propertyId,
          floorId: bed.rooms.floorId ?? null,
          roomId: bed.roomId,
          bedId: dto.bedId,
          checkInDate: moveInDate,
          monthlyRent: new Prisma.Decimal(dto.firstInvoiceAmount),
          securityDeposit: new Prisma.Decimal(dto.securityDepositAmount),
          status: ResidentStatus.ACTIVE,
          notes: dto.notes ? `Move-in: ${dto.notes.trim()}` : 'Created via Move-In workflow',
          createdAt: now,
          updatedAt: now,
        },
      });

      // 6. Update resident profile placement & deposit
      await tx.residents.update({
        where: { id: dto.residentId },
        data: {
          propertyId: dto.propertyId,
          floorId: bed.rooms.floorId ?? null,
          roomId: bed.roomId,
          bedId: dto.bedId,
          status: ResidentStatus.ACTIVE,
          monthlyRent: new Prisma.Decimal(dto.firstInvoiceAmount),
          securityDeposit: new Prisma.Decimal(dto.securityDepositAmount),
          depositPaid: new Prisma.Decimal(dto.depositPaid),
          depositStatus: dto.depositPaid >= dto.securityDepositAmount ? 'PAID' : (dto.depositPaid > 0 ? 'PARTIAL' : 'PENDING'),
          updatedAt: now,
        },
      });

      // 7. Create move_ins record
      const created = await tx.move_ins.create({
        data: {
          id: moveInId,
          organizationId: rbac.organizationId,
          residentId: dto.residentId,
          propertyId: dto.propertyId,
          bedId: dto.bedId,
          moveInDate,
          initialMeterReading: dto.initialMeterReading !== undefined ? new Prisma.Decimal(dto.initialMeterReading) : null,
          securityDepositAmount: new Prisma.Decimal(dto.securityDepositAmount),
          depositPaid: new Prisma.Decimal(dto.depositPaid),
          firstInvoiceAmount: new Prisma.Decimal(dto.firstInvoiceAmount),
          firstInvoicePaid: dto.firstInvoicePaid ?? false,
          status: dto.status ?? MoveInStatus.COMPLETED,
          notes: dto.notes?.trim() ?? null,
          checkedInBy: rbac.userId,
          createdAt: now,
          updatedAt: now,
        },
      });

      // 8. Structured audit log
      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'move_in.created',
        entityId: moveInId,
        newValues: {
          residentId: dto.residentId,
          propertyId: dto.propertyId,
          bedId: dto.bedId,
          bookingId: dto.bookingId,
          stayId,
          status: created.status,
        },
        ipAddress,
      });

      return created;
    });

    this.logger.log(`Move-In completed: ${moveIn.id} for resident ${dto.residentId} on bed ${dto.bedId}`);
    return moveIn;
  }

  /**
   * List move-in records with pagination and filters
   */
  async findAll(query: MoveInQueryDto, rbac: RbacContext) {
    const {
      page = 1,
      limit = 20,
      status,
      propertyId,
      residentId,
      bedId,
      sortBy = 'moveInDate',
      sortOrder = 'desc',
    } = query;

    const skip = (page - 1) * limit;

    const where: Prisma.move_insWhereInput = {
      organizationId: rbac.organizationId,
    };

    if (status) {
      where.status = status;
    }
    if (propertyId) {
      where.propertyId = propertyId;
    }
    if (residentId) {
      where.residentId = residentId;
    }
    if (bedId) {
      where.bedId = bedId;
    }

    const orderBy: Prisma.move_insOrderByWithRelationInput = {
      [sortBy]: sortOrder,
    };

    const [items, total] = await Promise.all([
      this.prisma.move_ins.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          properties: { select: { id: true, name: true, code: true } },
          beds: { select: { id: true, bedNumber: true } },
          residents: { select: { id: true, fullName: true, phone: true, email: true } },
        },
      }),
      this.prisma.move_ins.count({ where }),
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
   * Get single move-in details
   */
  async findOne(id: string, rbac: RbacContext) {
    const moveIn = await this.prisma.move_ins.findFirst({
      where: {
        id,
        organizationId: rbac.organizationId,
      },
      include: {
        properties: { select: { id: true, name: true, code: true, addressLine1: true } },
        beds: { select: { id: true, bedNumber: true, status: true, rooms: true } },
        residents: { select: { id: true, fullName: true, phone: true, email: true, status: true } },
      },
    });

    if (!moveIn) {
      throw new NotFoundException('Move-In record not found');
    }

    return moveIn;
  }

  /**
   * Update move-in details
   */
  async update(
    id: string,
    dto: UpdateMoveInDto,
    rbac: RbacContext,
    ipAddress?: string,
  ) {
    const existing = await this.prisma.move_ins.findFirst({
      where: {
        id,
        organizationId: rbac.organizationId,
      },
    });

    if (!existing) {
      throw new NotFoundException('Move-In record not found');
    }

    const now = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.move_ins.update({
        where: { id },
        data: {
          initialMeterReading: dto.initialMeterReading !== undefined ? new Prisma.Decimal(dto.initialMeterReading) : existing.initialMeterReading,
          securityDepositAmount: dto.securityDepositAmount !== undefined ? new Prisma.Decimal(dto.securityDepositAmount) : existing.securityDepositAmount,
          depositPaid: dto.depositPaid !== undefined ? new Prisma.Decimal(dto.depositPaid) : existing.depositPaid,
          firstInvoiceAmount: dto.firstInvoiceAmount !== undefined ? new Prisma.Decimal(dto.firstInvoiceAmount) : existing.firstInvoiceAmount,
          firstInvoicePaid: dto.firstInvoicePaid !== undefined ? dto.firstInvoicePaid : existing.firstInvoicePaid,
          status: dto.status ?? existing.status,
          notes: dto.notes !== undefined ? dto.notes?.trim() : existing.notes,
          updatedAt: now,
        },
      });

      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'move_in.updated',
        entityId: id,
        oldValues: { status: existing.status },
        newValues: { status: result.status },
        ipAddress,
      });

      return result;
    });

    this.logger.log(`Move-In updated: ${id} by user ${rbac.userId}`);
    return updated;
  }

  /**
   * Delete / Cancel Move-In
   */
  async remove(id: string, rbac: RbacContext, ipAddress?: string) {
    const existing = await this.prisma.move_ins.findFirst({
      where: {
        id,
        organizationId: rbac.organizationId,
      },
    });

    if (!existing) {
      throw new NotFoundException('Move-In record not found');
    }

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.move_ins.update({
        where: { id },
        data: {
          status: MoveInStatus.CANCELLED,
          updatedAt: now,
        },
      });

      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'move_in.cancelled',
        entityId: id,
        oldValues: { status: existing.status },
        newValues: { status: MoveInStatus.CANCELLED },
        ipAddress,
      });
    });

    this.logger.log(`Move-In cancelled / removed: ${id} by user ${rbac.userId}`);
    return {
      success: true,
      message: 'Move-In record cancelled successfully',
      id,
    };
  }
}
