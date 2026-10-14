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
import { CreateFloorDto } from './dto/create-floor.dto';
import { FloorQueryDto } from './dto/floor-query.dto';
import { UpdateFloorDto } from './dto/update-floor.dto';

@Injectable()
export class FloorsService {
  private readonly logger = new Logger(FloorsService.name);

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
        entityType: 'floors',
        entityId: params.entityId,
        oldValues: params.oldValues ? JSON.stringify(params.oldValues) : null,
        newValues: params.newValues ? JSON.stringify(params.newValues) : null,
        ipAddress: params.ipAddress ?? null,
      },
    });
  }

  /**
   * Verify that property belongs to the organization and is active
   */
  async verifyProperty(propertyId: string, organizationId: string) {
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

    return property;
  }

  /**
   * Create a new floor under a verified property
   */
  async create(
    propertyId: string,
    dto: CreateFloorDto,
    rbac: RbacContext,
    ipAddress?: string,
  ) {
    await this.verifyProperty(propertyId, rbac.organizationId);

    const existing = await this.prisma.floors.findFirst({
      where: {
        propertyId,
        floorNumber: dto.floorNumber,
      },
    });

    const now = new Date();

    if (existing) {
      if (existing.deletedAt !== null) {
        const restored = await this.prisma.$transaction(async (tx) => {
          const updated = await tx.floors.update({
            where: { id: existing.id },
            data: {
              name: dto.name.trim(),
              description: dto.description?.trim() ?? null,
              deletedAt: null,
              updatedAt: now,
            },
          });

          await this.createAuditLogTx(tx, {
            organizationId: rbac.organizationId,
            userId: rbac.userId,
            action: 'floor.created',
            entityId: existing.id,
            newValues: {
              propertyId,
              floorNumber: updated.floorNumber,
              name: updated.name,
              restored: true,
            },
            ipAddress,
          });

          return updated;
        });

        this.logger.log(`Floor restored: ${restored.id} on property ${propertyId}`);
        return restored;
      }

      throw new ConflictException(
        `Floor number ${dto.floorNumber} already exists in this property`,
      );
    }

    const floorId = randomUUID();

    const floor = await this.prisma.$transaction(async (tx) => {
      const created = await tx.floors.create({
        data: {
          id: floorId,
          organizationId: rbac.organizationId,
          propertyId,
          floorNumber: dto.floorNumber,
          name: dto.name.trim(),
          description: dto.description?.trim() ?? null,
          createdAt: now,
          updatedAt: now,
        },
      });

      
      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'floor.created',
        entityId: floorId,
        newValues: {
          propertyId,
          floorNumber: created.floorNumber,
          name: created.name,
        },
        ipAddress,
      });

      return created;
    });

    this.logger.log(`Floor created: ${floor.id} on property ${propertyId} by user ${rbac.userId}`);
    return floor;
  }

  /**
   * List floors under a property with pagination, search, and sorting
   */
  async findAll(propertyId: string, query: FloorQueryDto, rbac: RbacContext) {
    await this.verifyProperty(propertyId, rbac.organizationId);

    const { page = 1, limit = 20, search, sortBy = 'floorNumber', sortOrder = 'asc' } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.floorsWhereInput = {
      propertyId,
      organizationId: rbac.organizationId,
      deletedAt: null,
    };

    if (search && search.trim()) {
      where.name = { contains: search.trim(), mode: 'insensitive' };
    }

    const orderBy: Prisma.floorsOrderByWithRelationInput = {
      [sortBy]: sortOrder,
    };

    const [items, total] = await Promise.all([
      this.prisma.floors.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          _count: {
            select: {
              rooms: true,
              beds: true,
            },
          },
        },
      }),
      this.prisma.floors.count({ where }),
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
   * Get single floor scoped to property & organization
   */
  async findOne(propertyId: string, id: string, rbac: RbacContext) {
    await this.verifyProperty(propertyId, rbac.organizationId);

    const floor = await this.prisma.floors.findFirst({
      where: {
        id,
        propertyId,
        organizationId: rbac.organizationId,
        deletedAt: null,
      },
      include: {
        _count: {
          select: {
            rooms: true,
            beds: true,
          },
        },
      },
    });

    if (!floor) {
      throw new NotFoundException('Floor not found');
    }

    return floor;
  }

  /**
   * Update floor scoped to property & organization
   */
  async update(
    propertyId: string,
    id: string,
    dto: UpdateFloorDto,
    rbac: RbacContext,
    ipAddress?: string,
  ) {
    await this.verifyProperty(propertyId, rbac.organizationId);

    const existing = await this.prisma.floors.findFirst({
      where: {
        id,
        propertyId,
        organizationId: rbac.organizationId,
        deletedAt: null,
      },
    });

    if (!existing) {
      throw new NotFoundException('Floor not found');
    }

    // If changing floorNumber, ensure no duplicate
    if (dto.floorNumber !== undefined && dto.floorNumber !== existing.floorNumber) {
      const collision = await this.prisma.floors.findFirst({
        where: {
          propertyId,
          floorNumber: dto.floorNumber,
          id: { not: id },
          deletedAt: null,
        },
      });

      if (collision) {
        throw new ConflictException(
          `Floor number ${dto.floorNumber} already exists in this property`,
        );
      }
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.floors.update({
        where: { id },
        data: {
          floorNumber: dto.floorNumber ?? existing.floorNumber,
          name: dto.name !== undefined ? dto.name.trim() : existing.name,
          description: dto.description !== undefined ? dto.description.trim() : existing.description,
          updatedAt: now,
        },
      });

      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'floor.updated',
        entityId: id,
        oldValues: {
          floorNumber: existing.floorNumber,
          name: existing.name,
          description: existing.description,
        },
        newValues: {
          floorNumber: result.floorNumber,
          name: result.name,
          description: result.description,
        },
        ipAddress,
      });

      return result;
    });

    this.logger.log(`Floor updated: ${id} by user ${rbac.userId}`);
    return updated;
  }

  /**
   * Soft delete floor and cascade soft delete to rooms & beds
   */
  async remove(propertyId: string, id: string, rbac: RbacContext, ipAddress?: string) {
    await this.verifyProperty(propertyId, rbac.organizationId);

    const existing = await this.prisma.floors.findFirst({
      where: {
        id,
        propertyId,
        organizationId: rbac.organizationId,
        deletedAt: null,
      },
    });

    if (!existing) {
      throw new NotFoundException('Floor not found');
    }

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      // Soft-delete floor
      await tx.floors.update({
        where: { id },
        data: {
          deletedAt: now,
          updatedAt: now,
        },
      });

      // Soft-delete rooms on this floor
      await tx.rooms.updateMany({
        where: {
          floorId: id,
          deletedAt: null,
        },
        data: {
          deletedAt: now,
          updatedAt: now,
        },
      });

      // Soft-delete beds on this floor
      await tx.beds.updateMany({
        where: {
          floorId: id,
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
        action: 'floor.deleted',
        entityId: id,
        oldValues: {
          propertyId,
          floorNumber: existing.floorNumber,
          name: existing.name,
        },
        newValues: {
          deletedAt: now,
        },
        ipAddress,
      });
    });

    this.logger.log(`Floor soft-deleted: ${id} by user ${rbac.userId}`);
    return {
      success: true,
      message: 'Floor deleted successfully',
      id,
    };
  }
}
