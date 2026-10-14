import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { BedStatus, Prisma, ResidentStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RbacContext } from '../rbac/types/rbac.types';
import { CreateStayDto } from './dto/create-stay.dto';
import { StayQueryDto } from './dto/stay-query.dto';
import { UpdateStayDto } from './dto/update-stay.dto';

@Injectable()
export class ResidentStaysService {
  private readonly logger = new Logger(ResidentStaysService.name);

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
        entityType: 'resident_stays',
        entityId: params.entityId,
        oldValues: params.oldValues ? JSON.stringify(params.oldValues) : null,
        newValues: params.newValues ? JSON.stringify(params.newValues) : null,
        ipAddress: params.ipAddress ?? null,
      },
    });
  }

  /**
   * Verify resident belongs to organization and is active
   */
  async verifyResident(residentId: string, organizationId: string) {
    const resident = await this.prisma.residents.findFirst({
      where: {
        id: residentId,
        organizationId,
        deletedAt: null,
      },
    });

    if (!resident) {
      throw new NotFoundException('Resident not found');
    }

    return resident;
  }

  /**
   * Verify hierarchy: Property -> Floor -> Room -> Bed
   */
  async verifyHierarchy(
    propertyId: string,
    floorId: string | undefined,
    roomId: string | undefined,
    bedId: string | undefined,
    organizationId: string,
  ) {
    const property = await this.prisma.properties.findFirst({
      where: { id: propertyId, organizationId, deletedAt: null },
    });
    if (!property) {
      throw new NotFoundException('Property not found in this organization');
    }

    if (floorId) {
      const floor = await this.prisma.floors.findFirst({
        where: { id: floorId, propertyId, organizationId, deletedAt: null },
      });
      if (!floor) {
        throw new NotFoundException('Floor does not belong to specified property or organization');
      }
    }

    if (roomId) {
      const roomWhere: Prisma.roomsWhereInput = {
        id: roomId,
        propertyId,
        organizationId,
        deletedAt: null,
      };
      if (floorId) roomWhere.floorId = floorId;
      const room = await this.prisma.rooms.findFirst({ where: roomWhere });
      if (!room) {
        throw new NotFoundException('Room does not belong to specified floor/property or organization');
      }
    }

    if (bedId) {
      const bedWhere: Prisma.bedsWhereInput = {
        id: bedId,
        propertyId,
        organizationId,
        deletedAt: null,
      };
      if (floorId) bedWhere.floorId = floorId;
      if (roomId) bedWhere.roomId = roomId;

      const bed = await this.prisma.beds.findFirst({ where: bedWhere });
      if (!bed) {
        throw new NotFoundException('Bed does not belong to specified room/floor/property or organization');
      }
      return { property, bed };
    }

    return { property, bed: null };
  }

  /**
   * Create a new stay for a resident with strict hierarchy and double-occupancy check
   */
  async create(
    residentId: string,
    dto: CreateStayDto,
    rbac: RbacContext,
    ipAddress?: string,
  ) {
    await this.verifyResident(residentId, rbac.organizationId);
    const { bed } = await this.verifyHierarchy(
      dto.propertyId,
      dto.floorId,
      dto.roomId,
      dto.bedId,
      rbac.organizationId,
    );

    const stayId = randomUUID();
    const now = new Date();

    const stay = await this.prisma.$transaction(async (tx) => {
      // Bed Double-Occupancy Check & Atomic Lock inside transaction
      if (dto.bedId) {
        // If stay is ACTIVE, lock bed row by updating status to OCCUPIED atomically
        if (dto.status === ResidentStatus.ACTIVE || !dto.status) {
          const lockedBed = await tx.beds.updateMany({
            where: {
              id: dto.bedId,
              organizationId: rbac.organizationId,
              status: { not: BedStatus.OCCUPIED },
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
        }

        const activeStay = await tx.resident_stays.findFirst({
          where: {
            bedId: dto.bedId,
            organizationId: rbac.organizationId,
            status: { in: [ResidentStatus.ACTIVE, ResidentStatus.BOOKED, ResidentStatus.RESERVED] },
            checkOutDate: null,
          },
        });

        if (activeStay) {
          throw new ConflictException('Bed is already occupied');
        }
      }

      const created = await tx.resident_stays.create({
        data: {
          id: stayId,
          organizationId: rbac.organizationId,
          residentId,
          propertyId: dto.propertyId,
          floorId: dto.floorId ?? null,
          roomId: dto.roomId ?? null,
          bedId: dto.bedId ?? null,
          checkInDate: new Date(dto.checkInDate),
          expectedCheckOutDate: dto.expectedCheckOutDate ? new Date(dto.expectedCheckOutDate) : null,
          monthlyRent: new Prisma.Decimal(dto.monthlyRent),
          securityDeposit: new Prisma.Decimal(dto.securityDeposit),
          status: dto.status ?? ResidentStatus.ACTIVE,
          notes: dto.notes?.trim() ?? null,
          createdAt: now,
          updatedAt: now,
        },
      });

      // Update resident current placement
      await tx.residents.update({
        where: { id: residentId },
        data: {
          propertyId: dto.propertyId,
          floorId: dto.floorId ?? null,
          roomId: dto.roomId ?? null,
          bedId: dto.bedId ?? null,
          monthlyRent: new Prisma.Decimal(dto.monthlyRent),
          securityDeposit: new Prisma.Decimal(dto.securityDeposit),
          status: dto.status ?? ResidentStatus.ACTIVE,
          updatedAt: now,
        },
      });

      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'resident_stay.created',
        entityId: stayId,
        newValues: {
          residentId,
          propertyId: dto.propertyId,
          bedId: dto.bedId,
          checkInDate: dto.checkInDate,
          status: created.status,
        },
        ipAddress,
      });

      return created;
    });

    this.logger.log(`Stay created: ${stay.id} for resident ${residentId} by user ${rbac.userId}`);
    return stay;
  }

  /**
   * List all stays for a resident with pagination
   */
  async findAll(residentId: string, query: StayQueryDto, rbac: RbacContext) {
    await this.verifyResident(residentId, rbac.organizationId);

    const { page = 1, limit = 20, status, sortBy = 'checkInDate', sortOrder = 'desc' } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.resident_staysWhereInput = {
      residentId,
      organizationId: rbac.organizationId,
    };

    if (status) {
      where.status = status;
    }

    const orderBy: Prisma.resident_staysOrderByWithRelationInput = {
      [sortBy]: sortOrder,
    };

    const [items, total] = await Promise.all([
      this.prisma.resident_stays.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          properties: { select: { id: true, name: true, code: true } },
          floors: { select: { id: true, floorNumber: true, name: true } },
          rooms: { select: { id: true, roomNumber: true } },
          beds: { select: { id: true, bedNumber: true } },
        },
      }),
      this.prisma.resident_stays.count({ where }),
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
   * Get single stay details
   */
  async findOne(residentId: string, id: string, rbac: RbacContext) {
    await this.verifyResident(residentId, rbac.organizationId);

    const stay = await this.prisma.resident_stays.findFirst({
      where: {
        id,
        residentId,
        organizationId: rbac.organizationId,
      },
      include: {
        properties: { select: { id: true, name: true, code: true } },
        floors: { select: { id: true, floorNumber: true, name: true } },
        rooms: { select: { id: true, roomNumber: true } },
        beds: { select: { id: true, bedNumber: true } },
      },
    });

    if (!stay) {
      throw new NotFoundException('Resident stay not found');
    }

    return stay;
  }

  /**
   * Update stay details (e.g. checkOutDate, noticeDate, status)
   */
  async update(
    residentId: string,
    id: string,
    dto: UpdateStayDto,
    rbac: RbacContext,
    ipAddress?: string,
  ) {
    await this.verifyResident(residentId, rbac.organizationId);

    const existing = await this.prisma.resident_stays.findFirst({
      where: {
        id,
        residentId,
        organizationId: rbac.organizationId,
      },
    });

    if (!existing) {
      throw new NotFoundException('Resident stay not found');
    }

    const now = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.resident_stays.update({
        where: { id },
        data: {
          noticeDate: dto.noticeDate ? new Date(dto.noticeDate) : existing.noticeDate,
          checkOutDate: dto.checkOutDate ? new Date(dto.checkOutDate) : existing.checkOutDate,
          expectedCheckOutDate: dto.expectedCheckOutDate ? new Date(dto.expectedCheckOutDate) : existing.expectedCheckOutDate,
          monthlyRent: dto.monthlyRent !== undefined ? new Prisma.Decimal(dto.monthlyRent) : existing.monthlyRent,
          securityDeposit: dto.securityDeposit !== undefined ? new Prisma.Decimal(dto.securityDeposit) : existing.securityDeposit,
          status: dto.status ?? existing.status,
          notes: dto.notes !== undefined ? dto.notes?.trim() : existing.notes,
          updatedAt: now,
        },
      });

      // If stay checked out / moved out, free the bed
      if (
        (dto.status === ResidentStatus.MOVED_OUT || dto.status === ResidentStatus.CLOSED || dto.checkOutDate) &&
        existing.bedId
      ) {
        await tx.beds.update({
          where: { id: existing.bedId },
          data: { status: BedStatus.AVAILABLE, updatedAt: now },
        });

        // Also update resident status if current stay
        await tx.residents.update({
          where: { id: residentId },
          data: {
            status: dto.status ?? ResidentStatus.MOVED_OUT,
            actualMoveOutDate: dto.checkOutDate ? new Date(dto.checkOutDate) : now,
            updatedAt: now,
          },
        });
      }

      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'resident_stay.updated',
        entityId: id,
        oldValues: {
          status: existing.status,
          checkOutDate: existing.checkOutDate,
        },
        newValues: {
          status: result.status,
          checkOutDate: result.checkOutDate,
        },
        ipAddress,
      });

      return result;
    });

    this.logger.log(`Stay updated: ${id} for resident ${residentId} by user ${rbac.userId}`);
    return updated;
  }
}
