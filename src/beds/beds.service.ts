import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RbacContext } from '../rbac/types/rbac.types';
import { CreateBedDto } from './dto/create-bed.dto';
import { BedQueryDto } from './dto/bed-query.dto';
import { UpdateBedDto } from './dto/update-bed.dto';

@Injectable()
export class BedsService {
  private readonly logger = new Logger(BedsService.name);

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
        entityType: 'beds',
        entityId: params.entityId,
        oldValues: params.oldValues ? JSON.stringify(params.oldValues) : null,
        newValues: params.newValues ? JSON.stringify(params.newValues) : null,
        ipAddress: params.ipAddress ?? null,
      },
    });
  }

  /**
   * Verify full hierarchy: Organization -> Property -> Floor -> Room
   */
  async verifyRoomHierarchy(
    propertyId: string,
    floorId: string,
    roomId: string,
    organizationId: string,
  ) {
    const property = await this.prisma.properties.findFirst({
      where: {
        id: propertyId,
        organizationId,
        deletedAt: null,
      },
    });

    if (!property) {
      throw new NotFoundException('Property not found');
    }

    const floor = await this.prisma.floors.findFirst({
      where: {
        id: floorId,
        propertyId,
        organizationId,
        deletedAt: null,
      },
    });

    if (!floor) {
      throw new NotFoundException('Floor not found');
    }

    const room = await this.prisma.rooms.findFirst({
      where: {
        id: roomId,
        floorId,
        propertyId,
        organizationId,
        deletedAt: null,
      },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    return { property, floor, room };
  }

  /**
   * Create a new bed in a room
   */
  async create(
    propertyId: string,
    floorId: string,
    roomId: string,
    dto: CreateBedDto,
    rbac: RbacContext,
    ipAddress?: string,
  ) {
    await this.verifyRoomHierarchy(propertyId, floorId, roomId, rbac.organizationId);

    const existing = await this.prisma.beds.findFirst({
      where: {
        roomId,
        bedNumber: dto.bedNumber.trim(),
      },
    });

    const now = new Date();

    if (existing) {
      if (existing.deletedAt !== null) {
        const restored = await this.prisma.$transaction(async (tx) => {
          const updated = await tx.beds.update({
            where: { id: existing.id },
            data: {
              status: dto.status,
              monthlyRent: new Prisma.Decimal(dto.monthlyRent),
              deposit: new Prisma.Decimal(dto.deposit),
              notes: dto.notes?.trim() ?? null,
              deletedAt: null,
              updatedAt: now,
            },
          });

          await this.createAuditLogTx(tx, {
            organizationId: rbac.organizationId,
            userId: rbac.userId,
            action: 'bed.created',
            entityId: existing.id,
            newValues: {
              propertyId,
              floorId,
              roomId,
              bedNumber: updated.bedNumber,
              monthlyRent: dto.monthlyRent,
              deposit: dto.deposit,
              restored: true,
            },
            ipAddress,
          });

          return updated;
        });

        this.logger.log(`Bed restored: ${restored.id} in room ${roomId}`);
        return restored;
      }

      throw new ConflictException(
        `Bed '${dto.bedNumber}' already exists in this room`,
      );
    }

    const bedId = randomUUID();

    const bed = await this.prisma.$transaction(async (tx) => {
      const created = await tx.beds.create({
        data: {
          id: bedId,
          organizationId: rbac.organizationId,
          propertyId,
          floorId,
          roomId,
          bedNumber: dto.bedNumber.trim(),
          status: dto.status,
          monthlyRent: new Prisma.Decimal(dto.monthlyRent),
          deposit: new Prisma.Decimal(dto.deposit),
          notes: dto.notes?.trim() ?? null,
          createdAt: now,
          updatedAt: now,
        },
      });

      
      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'bed.created',
        entityId: bedId,
        newValues: {
          propertyId,
          floorId,
          roomId,
          bedNumber: created.bedNumber,
          monthlyRent: dto.monthlyRent,
          deposit: dto.deposit,
        },
        ipAddress,
      });

      return created;
    });

    this.logger.log(`Bed created: ${bed.id} in room ${roomId} by user ${rbac.userId}`);
    return bed;
  }

  /**
   * List beds in a room with pagination, search, and sorting
   */
  async findAll(
    propertyId: string,
    floorId: string,
    roomId: string,
    query: BedQueryDto,
    rbac: RbacContext,
  ) {
    await this.verifyRoomHierarchy(propertyId, floorId, roomId, rbac.organizationId);

    const {
      page = 1,
      limit = 20,
      search,
      status,
      sortBy = 'bedNumber',
      sortOrder = 'asc',
    } = query;

    const skip = (page - 1) * limit;

    const where: Prisma.bedsWhereInput = {
      propertyId,
      floorId,
      roomId,
      organizationId: rbac.organizationId,
      deletedAt: null,
    };

    if (search && search.trim()) {
      where.bedNumber = { contains: search.trim(), mode: 'insensitive' };
    }
    if (status) {
      where.status = status;
    }

    const orderBy: Prisma.bedsOrderByWithRelationInput = {
      [sortBy]: sortOrder,
    };

    const [items, total] = await Promise.all([
      this.prisma.beds.findMany({
        where,
        skip,
        take: limit,
        orderBy,
      }),
      this.prisma.beds.count({ where }),
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
   * Get single bed scoped to room, floor, property & organization
   */
  async findOne(
    propertyId: string,
    floorId: string,
    roomId: string,
    id: string,
    rbac: RbacContext,
  ) {
    await this.verifyRoomHierarchy(propertyId, floorId, roomId, rbac.organizationId);

    const bed = await this.prisma.beds.findFirst({
      where: {
        id,
        roomId,
        floorId,
        propertyId,
        organizationId: rbac.organizationId,
        deletedAt: null,
      },
    });

    if (!bed) {
      throw new NotFoundException('Bed not found');
    }

    return bed;
  }

  /**
   * Update bed scoped to room, floor, property & organization
   */
  async update(
    propertyId: string,
    floorId: string,
    roomId: string,
    id: string,
    dto: UpdateBedDto,
    rbac: RbacContext,
    ipAddress?: string,
  ) {
    await this.verifyRoomHierarchy(propertyId, floorId, roomId, rbac.organizationId);

    const existing = await this.prisma.beds.findFirst({
      where: {
        id,
        roomId,
        floorId,
        propertyId,
        organizationId: rbac.organizationId,
        deletedAt: null,
      },
    });

    if (!existing) {
      throw new NotFoundException('Bed not found');
    }

    // If changing bedNumber, ensure no duplicate in this room
    if (dto.bedNumber && dto.bedNumber.trim() !== existing.bedNumber) {
      const collision = await this.prisma.beds.findFirst({
        where: {
          roomId,
          bedNumber: dto.bedNumber.trim(),
          id: { not: id },
          deletedAt: null,
        },
      });

      if (collision) {
        throw new ConflictException(
          `Bed '${dto.bedNumber}' already exists in this room`,
        );
      }
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.beds.update({
        where: { id },
        data: {
          bedNumber: dto.bedNumber !== undefined ? dto.bedNumber.trim() : existing.bedNumber,
          status: dto.status ?? existing.status,
          monthlyRent: dto.monthlyRent !== undefined ? new Prisma.Decimal(dto.monthlyRent) : existing.monthlyRent,
          deposit: dto.deposit !== undefined ? new Prisma.Decimal(dto.deposit) : existing.deposit,
          notes: dto.notes !== undefined ? dto.notes?.trim() : existing.notes,
          updatedAt: now,
        },
      });

      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'bed.updated',
        entityId: id,
        oldValues: {
          bedNumber: existing.bedNumber,
          status: existing.status,
          monthlyRent: existing.monthlyRent,
          deposit: existing.deposit,
        },
        newValues: {
          bedNumber: result.bedNumber,
          status: result.status,
          monthlyRent: result.monthlyRent,
          deposit: result.deposit,
        },
        ipAddress,
      });

      return result;
    });

    this.logger.log(`Bed updated: ${id} by user ${rbac.userId}`);
    return updated;
  }

  /**
   * Soft delete bed
   */
  async remove(
    propertyId: string,
    floorId: string,
    roomId: string,
    id: string,
    rbac: RbacContext,
    ipAddress?: string,
  ) {
    await this.verifyRoomHierarchy(propertyId, floorId, roomId, rbac.organizationId);

    const existing = await this.prisma.beds.findFirst({
      where: {
        id,
        roomId,
        floorId,
        propertyId,
        organizationId: rbac.organizationId,
        deletedAt: null,
      },
    });

    if (!existing) {
      throw new NotFoundException('Bed not found');
    }

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      // Soft-delete bed
      await tx.beds.update({
        where: { id },
        data: {
          deletedAt: now,
          updatedAt: now,
        },
      });

      
      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'bed.deleted',
        entityId: id,
        oldValues: {
          propertyId,
          floorId,
          roomId,
          bedNumber: existing.bedNumber,
        },
        newValues: {
          deletedAt: now,
        },
        ipAddress,
      });
    });

    this.logger.log(`Bed soft-deleted: ${id} by user ${rbac.userId}`);
    return {
      success: true,
      message: 'Bed deleted successfully',
      id,
    };
  }
}
