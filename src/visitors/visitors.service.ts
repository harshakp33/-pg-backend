import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  VisitorIdType,
  VisitorPurpose,
  VisitorStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RbacContext } from '../rbac/types/rbac.types';
import { CreateVisitorDto } from './dto/create-visitor.dto';
import { UpdateVisitorDto } from './dto/update-visitor.dto';
import { VisitorQueryDto } from './dto/visitor-query.dto';

@Injectable()
export class VisitorsService {
  constructor(private readonly prisma: PrismaService) {}

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
        entityType: 'visitors',
        entityId: params.entityId,
        oldValues: params.oldValues ? JSON.stringify(params.oldValues) : null,
        newValues: params.newValues ? JSON.stringify(params.newValues) : null,
        ipAddress: params.ipAddress ?? null,
        createdAt: new Date(),
      },
    });
  }

  async create(dto: CreateVisitorDto, rbac: RbacContext, ipAddress?: string) {
    if (rbac.role === 'ACCOUNTANT') {
      throw new ForbiddenException('Accountant does not have access to visitor management');
    }

    let targetResidentId: string;
    let targetPropertyId: string;

    if (rbac.role === 'RESIDENT') {
      const residentProfile = await this.prisma.residents.findFirst({
        where: {
          userId: rbac.userId,
          organizationId: rbac.organizationId,
          deletedAt: null,
        },
      });

      if (!residentProfile) {
        throw new NotFoundException('Resident profile not found for user');
      }

      if (!residentProfile.propertyId) {
        throw new BadRequestException('Resident is not assigned to an active property');
      }

      targetResidentId = residentProfile.id;
      targetPropertyId = residentProfile.propertyId;
    } else {
      if (!dto.residentId) {
        throw new BadRequestException('residentId is required');
      }

      const resident = await this.prisma.residents.findFirst({
        where: {
          id: dto.residentId,
          organizationId: rbac.organizationId,
          deletedAt: null,
        },
      });

      if (!resident) {
        throw new NotFoundException('Resident not found in this organization');
      }

      targetResidentId = resident.id;

      if (dto.propertyId) {
        const property = await this.prisma.properties.findFirst({
          where: {
            id: dto.propertyId,
            organizationId: rbac.organizationId,
            deletedAt: null,
          },
        });

        if (!property) {
          throw new NotFoundException('Property not found in this organization');
        }

        targetPropertyId = property.id;
      } else if (resident.propertyId) {
        targetPropertyId = resident.propertyId;
      } else {
        throw new BadRequestException('propertyId is required');
      }
    }

    const visitorId = randomUUID();
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const visitor = await tx.visitors.create({
        data: {
          id: visitorId,
          organizationId: rbac.organizationId,
          propertyId: targetPropertyId,
          residentId: targetResidentId,
          visitorName: dto.visitorName,
          phone: dto.phone,
          purpose: dto.purpose ?? VisitorPurpose.FRIEND_VISIT,
          idType: dto.idType ?? VisitorIdType.AADHAAR,
          idNumber: dto.idNumber ?? null,
          vehicleNumber: dto.vehicleNumber ?? null,
          expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : null,
          notes: dto.notes ?? null,
          status: rbac.role === 'RESIDENT' ? VisitorStatus.EXPECTED : dto.status ?? VisitorStatus.EXPECTED,
          approvedByUserId: rbac.role !== 'RESIDENT' ? rbac.userId : null,
          createdAt: now,
          updatedAt: now,
        },
      });

      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'visitor.created',
        entityId: visitor.id,
        newValues: visitor,
        ipAddress,
      });

      return visitor;
    });
  }

  async findAll(query: VisitorQueryDto, rbac: RbacContext) {
    if (rbac.role === 'ACCOUNTANT') {
      throw new ForbiddenException('Accountant does not have access to visitors');
    }

    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 20;
    const skip = (page - 1) * limit;

    const where: Prisma.visitorsWhereInput = {
      organizationId: rbac.organizationId,
    };

    if (rbac.role === 'RESIDENT') {
      const residentProfile = await this.prisma.residents.findFirst({
        where: {
          userId: rbac.userId,
          organizationId: rbac.organizationId,
          deletedAt: null,
        },
      });

      if (!residentProfile) {
        return {
          items: [],
          meta: { total: 0, page, limit, totalPages: 0 },
        };
      }

      where.residentId = residentProfile.id;
    } else {
      if (query.residentId) {
        where.residentId = query.residentId;
      }
    }

    if (query.propertyId) {
      where.propertyId = query.propertyId;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.purpose) {
      where.purpose = query.purpose;
    }

    if (query.date) {
      where.expectedDate = new Date(query.date);
    }

    if (query.isCheckedIn !== undefined) {
      if (query.isCheckedIn) {
        where.status = VisitorStatus.CHECKED_IN;
      } else {
        where.status = { not: VisitorStatus.CHECKED_IN };
      }
    }

    if (query.search) {
      where.OR = [
        { visitorName: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
        { vehicleNumber: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.visitors.count({ where }),
      this.prisma.visitors.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          properties: {
            select: {
              id: true,
              name: true,
            },
          },
          residents: {
            select: {
              id: true,
              fullName: true,
              phone: true,
            },
          },
          users: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, rbac: RbacContext) {
    if (rbac.role === 'ACCOUNTANT') {
      throw new ForbiddenException('Accountant does not have access to visitors');
    }

    const visitor = await this.prisma.visitors.findFirst({
      where: {
        id,
        organizationId: rbac.organizationId,
      },
      include: {
        properties: {
          select: {
            id: true,
            name: true,
            addressLine1: true,
            addressLine2: true,
            city: true,
          },
        },
        residents: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            email: true,
          },
        },
        users: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!visitor) {
      throw new NotFoundException('Visitor not found');
    }

    if (rbac.role === 'RESIDENT') {
      const residentProfile = await this.prisma.residents.findFirst({
        where: {
          userId: rbac.userId,
          organizationId: rbac.organizationId,
          deletedAt: null,
        },
      });

      if (!residentProfile || visitor.residentId !== residentProfile.id) {
        throw new NotFoundException('Visitor not found');
      }
    }

    return visitor;
  }

  async update(id: string, dto: UpdateVisitorDto, rbac: RbacContext, ipAddress?: string) {
    if (rbac.role === 'ACCOUNTANT') {
      throw new ForbiddenException('Accountant does not have access to visitor management');
    }

    if (rbac.role === 'RESIDENT') {
      throw new ForbiddenException('Residents cannot modify administrative visitor records');
    }

    const existing = await this.prisma.visitors.findFirst({
      where: {
        id,
        organizationId: rbac.organizationId,
      },
    });

    if (!existing) {
      throw new NotFoundException('Visitor not found');
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.visitors.update({
        where: { id },
        data: {
          visitorName: dto.visitorName ?? existing.visitorName,
          phone: dto.phone ?? existing.phone,
          purpose: dto.purpose ?? existing.purpose,
          idType: dto.idType ?? existing.idType,
          idNumber: dto.idNumber !== undefined ? dto.idNumber : existing.idNumber,
          vehicleNumber: dto.vehicleNumber !== undefined ? dto.vehicleNumber : existing.vehicleNumber,
          expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : existing.expectedDate,
          notes: dto.notes !== undefined ? dto.notes : existing.notes,
          status: dto.status ?? existing.status,
          rejectionReason: dto.rejectionReason !== undefined ? dto.rejectionReason : existing.rejectionReason,
          updatedAt: now,
        },
      });

      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'visitor.updated',
        entityId: updated.id,
        oldValues: existing,
        newValues: updated,
        ipAddress,
      });

      return updated;
    });
  }

  async checkIn(id: string, rbac: RbacContext, ipAddress?: string) {
    if (rbac.role === 'ACCOUNTANT' || rbac.role === 'RESIDENT') {
      throw new ForbiddenException('Insufficient permissions to perform visitor check-in');
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      // Row lock to ensure concurrency safety
      const rows = await tx.$queryRaw<Array<{ id: string; status: VisitorStatus; approvedByUserId: string | null }>>`
        SELECT "id", "status", "approvedByUserId" FROM "visitors"
        WHERE "id" = ${id}::uuid AND "organizationId" = ${rbac.organizationId}::uuid
        FOR UPDATE
      `;

      if (!rows || rows.length === 0) {
        throw new NotFoundException('Visitor not found');
      }

      const existing = rows[0];

      if (existing.status === VisitorStatus.CHECKED_IN) {
        throw new BadRequestException('Visitor is already checked in');
      }

      if (existing.status === VisitorStatus.CHECKED_OUT) {
        throw new BadRequestException('Visitor has already checked out');
      }

      if (existing.status === VisitorStatus.REJECTED || existing.status === VisitorStatus.CANCELLED) {
        throw new BadRequestException('Cannot check in a rejected or cancelled visitor');
      }

      const updated = await tx.visitors.update({
        where: { id },
        data: {
          status: VisitorStatus.CHECKED_IN,
          entryTime: now,
          approvedByUserId: rbac.userId ?? existing.approvedByUserId,
          updatedAt: now,
        },
      });

      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'visitor.check_in',
        entityId: updated.id,
        oldValues: existing,
        newValues: updated,
        ipAddress,
      });

      return updated;
    });
  }

  async checkOut(id: string, rbac: RbacContext, ipAddress?: string) {
    if (rbac.role === 'ACCOUNTANT' || rbac.role === 'RESIDENT') {
      throw new ForbiddenException('Insufficient permissions to perform visitor check-out');
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      // Row lock to ensure concurrency safety
      const rows = await tx.$queryRaw<Array<{ id: string; status: VisitorStatus; approvedByUserId: string | null }>>`
        SELECT "id", "status", "approvedByUserId" FROM "visitors"
        WHERE "id" = ${id}::uuid AND "organizationId" = ${rbac.organizationId}::uuid
        FOR UPDATE
      `;

      if (!rows || rows.length === 0) {
        throw new NotFoundException('Visitor not found');
      }

      const existing = rows[0];

      if (existing.status !== VisitorStatus.CHECKED_IN) {
        if (existing.status === VisitorStatus.CHECKED_OUT) {
          throw new BadRequestException('Visitor is already checked out');
        }
        throw new BadRequestException('Visitor must be checked in before checking out');
      }

      const updated = await tx.visitors.update({
        where: { id },
        data: {
          status: VisitorStatus.CHECKED_OUT,
          exitTime: now,
          updatedAt: now,
        },
      });

      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'visitor.check_out',
        entityId: updated.id,
        oldValues: existing,
        newValues: updated,
        ipAddress,
      });

      return updated;
    });
  }

  async remove(id: string, rbac: RbacContext, ipAddress?: string) {
    if (rbac.role !== 'OWNER' && rbac.role !== 'MANAGER') {
      throw new ForbiddenException('Insufficient permissions to delete visitor records');
    }

    const existing = await this.prisma.visitors.findFirst({
      where: {
        id,
        organizationId: rbac.organizationId,
      },
    });

    if (!existing) {
      throw new NotFoundException('Visitor not found');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.visitors.delete({
        where: { id },
      });

      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'visitor.deleted',
        entityId: id,
        oldValues: existing,
        ipAddress,
      });

      return {
        success: true,
        message: 'Visitor record deleted successfully',
      };
    });
  }
}
