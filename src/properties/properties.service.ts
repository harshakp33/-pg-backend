import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RbacContext } from '../rbac/types/rbac.types';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { PropertyQueryDto } from './dto/property-query.dto';

@Injectable()
export class PropertiesService {
  private readonly logger = new Logger(PropertiesService.name);

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
        entityType: 'properties',
        entityId: params.entityId,
        oldValues: params.oldValues ? JSON.stringify(params.oldValues) : null,
        newValues: params.newValues ? JSON.stringify(params.newValues) : null,
        ipAddress: params.ipAddress ?? null,
      },
    });
  }

  /**
   * Create a new property within the verified organization
   */
  async create(dto: CreatePropertyDto, rbac: RbacContext, ipAddress?: string) {
    const organizationId = rbac.organizationId;

    // Check if property with code already exists in this organization
    const existing = await this.prisma.properties.findFirst({
      where: {
        organizationId,
        code: dto.code.trim(),
        deletedAt: null,
      },
    });

    if (existing) {
      throw new ConflictException(
        `Property with code '${dto.code}' already exists in this organization`,
      );
    }

    const now = new Date();
    const propertyId = randomUUID();

    const [createdProperty] = await this.prisma.$transaction(async (tx) => {
      const property = await tx.properties.create({
        data: {
          id: propertyId,
          organizationId,
          name: dto.name.trim(),
          code: dto.code.trim().toUpperCase(),
          propertyType: dto.propertyType,
          genderType: dto.genderType,
          status: dto.status,
          addressLine1: dto.addressLine1.trim(),
          addressLine2: dto.addressLine2 ? dto.addressLine2.trim() : null,
          area: dto.area.trim(),
          city: dto.city ? dto.city.trim() : 'Bengaluru',
          state: dto.state ? dto.state.trim() : 'Karnataka',
          pincode: dto.pincode.trim(),
          googleMapsUrl: dto.googleMapsUrl ? dto.googleMapsUrl.trim() : null,
          contactPhone: dto.contactPhone.trim(),
          contactEmail: dto.contactEmail.trim().toLowerCase(),
          amenities: dto.amenities ? dto.amenities.trim() : null,
          rules: dto.rules ? dto.rules.trim() : null,
          isActive: dto.isActive !== undefined ? dto.isActive : true,
          createdAt: now,
          updatedAt: now,
        },
      });

      await this.createAuditLogTx(tx, {
        organizationId,
        userId: rbac.userId,
        action: 'property.created',
        entityId: propertyId,
        newValues: property,
        ipAddress,
      });

      return [property];
    });

    return createdProperty;
  }

  /**
   * List properties with pagination, filtering, and sorting strictly scoped to organization
   */
  async findAll(query: PropertyQueryDto, rbac: RbacContext) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.propertiesWhereInput = {
      organizationId: rbac.organizationId,
      deletedAt: null,
    };

    if (query.city) {
      where.city = { equals: query.city.trim(), mode: 'insensitive' };
    }
    if (query.area) {
      where.area = { equals: query.area.trim(), mode: 'insensitive' };
    }
    if (query.state) {
      where.state = { equals: query.state.trim(), mode: 'insensitive' };
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.propertyType) {
      where.propertyType = query.propertyType;
    }
    if (query.genderType) {
      where.genderType = query.genderType;
    }
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query.search) {
      const term = query.search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { code: { contains: term, mode: 'insensitive' } },
        { area: { contains: term, mode: 'insensitive' } },
        { addressLine1: { contains: term, mode: 'insensitive' } },
      ];
    }

    const sortField = query.sortBy || 'createdAt';
    const sortDirection = query.sortOrder || 'desc';

    const [total, items] = await Promise.all([
      this.prisma.properties.count({ where }),
      this.prisma.properties.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          [sortField]: sortDirection,
        },
        include: {
          _count: {
            select: {
              floors: true,
              rooms: true,
              beds: true,
            },
          },
        },
      }),
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
   * Get single property scoped to organization
   */
  async findOne(id: string, rbac: RbacContext) {
    const property = await this.prisma.properties.findFirst({
      where: {
        id,
        organizationId: rbac.organizationId,
        deletedAt: null,
      },
      include: {
        property_settings: true,
        _count: {
          select: {
            floors: true,
            rooms: true,
            beds: true,
          },
        },
      },
    });

    if (!property) {
      throw new NotFoundException('Property not found');
    }

    return property;
  }

  /**
   * Update property scoped to organization
   */
  async update(
    id: string,
    dto: UpdatePropertyDto,
    rbac: RbacContext,
    ipAddress?: string,
  ) {
    const existing = await this.prisma.properties.findFirst({
      where: {
        id,
        organizationId: rbac.organizationId,
        deletedAt: null,
      },
    });

    if (!existing) {
      throw new NotFoundException('Property not found');
    }

    // If changing code, ensure no collision within same org
    if (dto.code && dto.code.trim().toUpperCase() !== existing.code) {
      const codeCollision = await this.prisma.properties.findFirst({
        where: {
          organizationId: rbac.organizationId,
          code: dto.code.trim().toUpperCase(),
          id: { not: id },
          deletedAt: null,
        },
      });

      if (codeCollision) {
        throw new ConflictException(
          `Property with code '${dto.code}' already exists in this organization`,
        );
      }
    }

    const now = new Date();

    const [updatedProperty] = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.properties.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name.trim() }),
          ...(dto.code !== undefined && { code: dto.code.trim().toUpperCase() }),
          ...(dto.propertyType !== undefined && { propertyType: dto.propertyType }),
          ...(dto.genderType !== undefined && { genderType: dto.genderType }),
          ...(dto.status !== undefined && { status: dto.status }),
          ...(dto.addressLine1 !== undefined && { addressLine1: dto.addressLine1.trim() }),
          ...(dto.addressLine2 !== undefined && {
            addressLine2: dto.addressLine2 ? dto.addressLine2.trim() : null,
          }),
          ...(dto.area !== undefined && { area: dto.area.trim() }),
          ...(dto.city !== undefined && { city: dto.city.trim() }),
          ...(dto.state !== undefined && { state: dto.state.trim() }),
          ...(dto.pincode !== undefined && { pincode: dto.pincode.trim() }),
          ...(dto.googleMapsUrl !== undefined && {
            googleMapsUrl: dto.googleMapsUrl ? dto.googleMapsUrl.trim() : null,
          }),
          ...(dto.contactPhone !== undefined && { contactPhone: dto.contactPhone.trim() }),
          ...(dto.contactEmail !== undefined && {
            contactEmail: dto.contactEmail.trim().toLowerCase(),
          }),
          ...(dto.amenities !== undefined && {
            amenities: dto.amenities ? dto.amenities.trim() : null,
          }),
          ...(dto.rules !== undefined && {
            rules: dto.rules ? dto.rules.trim() : null,
          }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
          updatedAt: now,
        },
      });

      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'property.updated',
        entityId: id,
        oldValues: existing,
        newValues: updated,
        ipAddress,
      });

      return [updated];
    });

    return updatedProperty;
  }

  /**
   * Soft delete property scoped to organization
   */
  async remove(id: string, rbac: RbacContext, ipAddress?: string) {
    const existing = await this.prisma.properties.findFirst({
      where: {
        id,
        organizationId: rbac.organizationId,
        deletedAt: null,
      },
    });

    if (!existing) {
      throw new NotFoundException('Property not found');
    }

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.properties.update({
        where: { id },
        data: {
          deletedAt: now,
          isActive: false,
          updatedAt: now,
        },
      });

      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'property.deleted',
        entityId: id,
        oldValues: existing,
        newValues: { deletedAt: now, isActive: false },
        ipAddress,
      });
    });

    return {
      message: 'Property deleted successfully',
      id,
    };
  }

  /**
   * Get full nested property structure (Property -> Floors -> Rooms -> Beds)
   * Scoped strictly to the active organization and excluding soft-deleted records
   */
  async getStructure(id: string, rbac: RbacContext) {
    const property = await this.prisma.properties.findFirst({
      where: {
        id,
        organizationId: rbac.organizationId,
        deletedAt: null,
      },
      select: {
        id: true,
        organizationId: true,
        name: true,
        code: true,
        propertyType: true,
        _count: {
          select: {
            floors: { where: { deletedAt: null } },
            rooms: { where: { deletedAt: null } },
            beds: { where: { deletedAt: null } },
          },
        },
        isActive: true,
        createdAt: true,
        updatedAt: true,
        floors: {
          where: { deletedAt: null },
          orderBy: { floorNumber: 'asc' },
          select: {
            id: true,
            propertyId: true,
            floorNumber: true,
            name: true,
            description: true,
            rooms: {
              where: { deletedAt: null },
              orderBy: { roomNumber: 'asc' },
              select: {
                id: true,
                floorId: true,
                propertyId: true,
                roomNumber: true,
                roomType: true,
                capacity: true,
                status: true,
                baseRent: true,
                deposit: true,
                hasAttachedBath: true,
                hasBalcony: true,
                hasAc: true,
                amenities: true,
                isActive: true,
                beds: {
                  where: { deletedAt: null },
                  orderBy: { bedNumber: 'asc' },
                  select: {
                    id: true,
                    roomId: true,
                    floorId: true,
                    propertyId: true,
                    bedNumber: true,
                    status: true,
                    monthlyRent: true,
                    deposit: true,
                    notes: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!property) {
      throw new NotFoundException('Property not found');
    }

    return property;
  }
}
