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
import { CreateRoomDto } from './dto/create-room.dto';
import { RoomQueryDto } from './dto/room-query.dto';
import { UpdateRoomDto } from './dto/update-room.dto';

@Injectable()
export class RoomsService {
  private readonly logger = new Logger(RoomsService.name);

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
        entityType: 'rooms',
        entityId: params.entityId,
        oldValues: params.oldValues ? JSON.stringify(params.oldValues) : null,
        newValues: params.newValues ? JSON.stringify(params.newValues) : null,
        ipAddress: params.ipAddress ?? null,
      },
    });
  }

  /**
   * Verify hierarchy: Property -> Floor -> Organization
   */
  async verifyFloorHierarchy(propertyId: string, floorId: string, organizationId: string) {
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

    return { property, floor };
  }

  /**
   * Create a new room on a verified floor
   */
  async create(
    propertyId: string,
    floorId: string,
    dto: CreateRoomDto,
    rbac: RbacContext,
    ipAddress?: string,
  ) {
    await this.verifyFloorHierarchy(propertyId, floorId, rbac.organizationId);

    const existing = await this.prisma.rooms.findFirst({
      where: {
        floorId,
        roomNumber: dto.roomNumber.trim(),
      },
    });

    const now = new Date();

    if (existing) {
      if (existing.deletedAt !== null) {
        const restored = await this.prisma.$transaction(async (tx) => {
          const updated = await tx.rooms.update({
            where: { id: existing.id },
            data: {
              roomType: dto.roomType,
              capacity: dto.capacity,
              status: dto.status,
              baseRent: new Prisma.Decimal(dto.baseRent),
              deposit: new Prisma.Decimal(dto.deposit ?? 0.0),
              hasAttachedBath: dto.hasAttachedBath ?? true,
              hasBalcony: dto.hasBalcony ?? false,
              hasAc: dto.hasAc ?? false,
              amenities: dto.amenities?.trim() ?? null,
              isActive: dto.isActive ?? true,
              deletedAt: null,
              updatedAt: now,
            },
          });

          await this.createAuditLogTx(tx, {
            organizationId: rbac.organizationId,
            userId: rbac.userId,
            action: 'room.created',
            entityId: existing.id,
            newValues: {
              propertyId,
              floorId,
              roomNumber: updated.roomNumber,
              baseRent: dto.baseRent,
              restored: true,
            },
            ipAddress,
          });

          return updated;
        });

        this.logger.log(`Room restored: ${restored.id} on floor ${floorId}`);
        return restored;
      }

      throw new ConflictException(
        `Room '${dto.roomNumber}' already exists on this floor`,
      );
    }

    const roomId = randomUUID();

    const room = await this.prisma.$transaction(async (tx) => {
      const created = await tx.rooms.create({
        data: {
          id: roomId,
          organizationId: rbac.organizationId,
          propertyId,
          floorId,
          roomNumber: dto.roomNumber.trim(),
          roomType: dto.roomType,
          capacity: dto.capacity,
          status: dto.status,
          baseRent: new Prisma.Decimal(dto.baseRent),
          deposit: new Prisma.Decimal(dto.deposit ?? 0.0),
          hasAttachedBath: dto.hasAttachedBath ?? true,
          hasBalcony: dto.hasBalcony ?? false,
          hasAc: dto.hasAc ?? false,
          amenities: dto.amenities?.trim() ?? null,
          isActive: dto.isActive ?? true,
          createdAt: now,
          updatedAt: now,
        },
      });

      
      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'room.created',
        entityId: roomId,
        newValues: {
          propertyId,
          floorId,
          roomNumber: created.roomNumber,
          roomType: created.roomType,
          capacity: created.capacity,
          baseRent: dto.baseRent,
        },
        ipAddress,
      });

      return created;
    });

    this.logger.log(`Room created: ${room.id} on floor ${floorId} by user ${rbac.userId}`);
    return room;
  }

  /**
   * List rooms under a floor with pagination, search, and sorting
   */
  async findAll(
    propertyId: string,
    floorId: string,
    query: RoomQueryDto,
    rbac: RbacContext,
  ) {
    await this.verifyFloorHierarchy(propertyId, floorId, rbac.organizationId);

    const {
      page = 1,
      limit = 20,
      search,
      roomType,
      status,
      isActive,
      sortBy = 'roomNumber',
      sortOrder = 'asc',
    } = query;

    const skip = (page - 1) * limit;

    const where: Prisma.roomsWhereInput = {
      propertyId,
      floorId,
      organizationId: rbac.organizationId,
      deletedAt: null,
    };

    if (search && search.trim()) {
      where.roomNumber = { contains: search.trim(), mode: 'insensitive' };
    }
    if (roomType) {
      where.roomType = roomType;
    }
    if (status) {
      where.status = status;
    }
    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    const orderBy: Prisma.roomsOrderByWithRelationInput = {
      [sortBy]: sortOrder,
    };

    const [items, total] = await Promise.all([
      this.prisma.rooms.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          _count: {
            select: {
              beds: true,
            },
          },
        },
      }),
      this.prisma.rooms.count({ where }),
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
   * Get single room scoped to floor, property & organization
   */
  async findOne(
    propertyId: string,
    floorId: string,
    id: string,
    rbac: RbacContext,
  ) {
    await this.verifyFloorHierarchy(propertyId, floorId, rbac.organizationId);

    const room = await this.prisma.rooms.findFirst({
      where: {
        id,
        floorId,
        propertyId,
        organizationId: rbac.organizationId,
        deletedAt: null,
      },
      include: {
        _count: {
          select: {
            beds: true,
          },
        },
      },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    return room;
  }

  /**
   * Update room scoped to floor, property & organization
   */
  async update(
    propertyId: string,
    floorId: string,
    id: string,
    dto: UpdateRoomDto,
    rbac: RbacContext,
    ipAddress?: string,
  ) {
    await this.verifyFloorHierarchy(propertyId, floorId, rbac.organizationId);

    const existing = await this.prisma.rooms.findFirst({
      where: {
        id,
        floorId,
        propertyId,
        organizationId: rbac.organizationId,
        deletedAt: null,
      },
    });

    if (!existing) {
      throw new NotFoundException('Room not found');
    }

    // If changing roomNumber, ensure no duplicate on this floor
    if (dto.roomNumber && dto.roomNumber.trim() !== existing.roomNumber) {
      const collision = await this.prisma.rooms.findFirst({
        where: {
          floorId,
          roomNumber: dto.roomNumber.trim(),
          id: { not: id },
          deletedAt: null,
        },
      });

      if (collision) {
        throw new ConflictException(
          `Room '${dto.roomNumber}' already exists on this floor`,
        );
      }
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.rooms.update({
        where: { id },
        data: {
          roomNumber: dto.roomNumber !== undefined ? dto.roomNumber.trim() : existing.roomNumber,
          roomType: dto.roomType ?? existing.roomType,
          capacity: dto.capacity ?? existing.capacity,
          status: dto.status ?? existing.status,
          baseRent: dto.baseRent !== undefined ? new Prisma.Decimal(dto.baseRent) : existing.baseRent,
          deposit: dto.deposit !== undefined ? new Prisma.Decimal(dto.deposit) : existing.deposit,
          hasAttachedBath: dto.hasAttachedBath ?? existing.hasAttachedBath,
          hasBalcony: dto.hasBalcony ?? existing.hasBalcony,
          hasAc: dto.hasAc ?? existing.hasAc,
          amenities: dto.amenities !== undefined ? dto.amenities?.trim() : existing.amenities,
          isActive: dto.isActive ?? existing.isActive,
          updatedAt: now,
        },
      });

      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'room.updated',
        entityId: id,
        oldValues: {
          roomNumber: existing.roomNumber,
          roomType: existing.roomType,
          capacity: existing.capacity,
          baseRent: existing.baseRent,
        },
        newValues: {
          roomNumber: result.roomNumber,
          roomType: result.roomType,
          capacity: result.capacity,
          baseRent: result.baseRent,
        },
        ipAddress,
      });

      return result;
    });

    this.logger.log(`Room updated: ${id} by user ${rbac.userId}`);
    return updated;
  }

  /**
   * Soft delete room and cascade soft delete to beds
   */
  async remove(
    propertyId: string,
    floorId: string,
    id: string,
    rbac: RbacContext,
    ipAddress?: string,
  ) {
    await this.verifyFloorHierarchy(propertyId, floorId, rbac.organizationId);

    const existing = await this.prisma.rooms.findFirst({
      where: {
        id,
        floorId,
        propertyId,
        organizationId: rbac.organizationId,
        deletedAt: null,
      },
    });

    if (!existing) {
      throw new NotFoundException('Room not found');
    }

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      // Soft-delete room
      await tx.rooms.update({
        where: { id },
        data: {
          deletedAt: now,
          updatedAt: now,
        },
      });

      // Soft-delete beds in this room
      await tx.beds.updateMany({
        where: {
          roomId: id,
          deletedAt: null,
        },
        data: {
          deletedAt: now,
          updatedAt: now,
        },
      });

      
      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'room.deleted',
        entityId: id,
        oldValues: {
          propertyId,
          floorId,
          roomNumber: existing.roomNumber,
        },
        newValues: {
          deletedAt: now,
        },
        ipAddress,
      });
    });

    this.logger.log(`Room soft-deleted: ${id} by user ${rbac.userId}`);
    return {
      success: true,
      message: 'Room deleted successfully',
      id,
    };
  }
}
