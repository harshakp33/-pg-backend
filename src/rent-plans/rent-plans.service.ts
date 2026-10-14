import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RbacContext } from '../rbac/types/rbac.types';
import { CreateRentPlanDto } from './dto/create-rent-plan.dto';
import { RentPlanQueryDto } from './dto/rent-plan-query.dto';
import { UpdateRentPlanDto } from './dto/update-rent-plan.dto';

@Injectable()
export class RentPlansService {
  private readonly logger = new Logger(RentPlansService.name);

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
        entityType: 'rent_plans',
        entityId: params.entityId,
        oldValues: params.oldValues ? JSON.stringify(params.oldValues) : null,
        newValues: params.newValues ? JSON.stringify(params.newValues) : null,
        ipAddress: params.ipAddress ?? null,
        createdAt: new Date(),
      },
    });
  }

  async create(dto: CreateRentPlanDto, rbac: RbacContext, ip?: string) {
    const organizationId = rbac.organizationId;

    if (dto.propertyId) {
      const property = await this.prisma.properties.findFirst({
        where: { id: dto.propertyId, organizationId, deletedAt: null },
      });
      if (!property) {
        throw new NotFoundException('Property not found in this organization');
      }
    }

    const now = new Date();
    const rentPlan = await this.prisma.$transaction(async (tx) => {
      const created = await tx.rent_plans.create({
        data: {
          id: randomUUID(),
          organizationId,
          propertyId: dto.propertyId ?? null,
          name: dto.name,
          billingFrequency: dto.billingFrequency,
          baseAmount: new Prisma.Decimal(dto.baseAmount),
          securityDeposit: new Prisma.Decimal(dto.securityDeposit),
          noticePeriodDays: dto.noticePeriodDays ?? 30,
          lockInPeriodMonths: dto.lockInPeriodMonths ?? 3,
          electricityIncluded: dto.electricityIncluded ?? true,
          foodIncluded: dto.foodIncluded ?? true,
          description: dto.description,
          isActive: dto.isActive ?? true,
          createdAt: now,
          updatedAt: now,
        },
        include: {
          properties: { select: { id: true, name: true } },
        },
      });

      await this.createAuditLogTx(tx, {
        organizationId,
        userId: rbac.userId,
        action: 'rent_plan.created',
        entityId: created.id,
        newValues: {
          name: created.name,
          baseAmount: created.baseAmount.toString(),
        },
        ipAddress: ip,
      });

      return created;
    });

    return rentPlan;
  }

  async findAll(query: RentPlanQueryDto, rbac: RbacContext) {
    const organizationId = rbac.organizationId;
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.rent_plansWhereInput = {
      organizationId,
    };

    if (query.propertyId) {
      where.propertyId = query.propertyId;
    }
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }
    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }

    const [items, total] = await Promise.all([
      this.prisma.rent_plans.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          properties: { select: { id: true, name: true } },
        },
      }),
      this.prisma.rent_plans.count({ where }),
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
    const rentPlan = await this.prisma.rent_plans.findFirst({
      where: { id, organizationId: rbac.organizationId },
      include: {
        properties: { select: { id: true, name: true } },
      },
    });

    if (!rentPlan) {
      throw new NotFoundException('Rent plan not found');
    }

    return rentPlan;
  }

  async update(id: string, dto: UpdateRentPlanDto, rbac: RbacContext, ip?: string) {
    const organizationId = rbac.organizationId;
    const existing = await this.prisma.rent_plans.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      throw new NotFoundException('Rent plan not found');
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.rent_plans.update({
        where: { id },
        data: {
          name: dto.name ?? undefined,
          billingFrequency: dto.billingFrequency ?? undefined,
          baseAmount: dto.baseAmount ? new Prisma.Decimal(dto.baseAmount) : undefined,
          securityDeposit: dto.securityDeposit ? new Prisma.Decimal(dto.securityDeposit) : undefined,
          noticePeriodDays: dto.noticePeriodDays ?? undefined,
          lockInPeriodMonths: dto.lockInPeriodMonths ?? undefined,
          electricityIncluded: dto.electricityIncluded ?? undefined,
          foodIncluded: dto.foodIncluded ?? undefined,
          description: dto.description ?? undefined,
          isActive: dto.isActive ?? undefined,
          updatedAt: now,
        },
      });

      await this.createAuditLogTx(tx, {
        organizationId,
        userId: rbac.userId,
        action: 'rent_plan.updated',
        entityId: id,
        oldValues: { name: existing.name },
        newValues: { name: result.name },
        ipAddress: ip,
      });

      return result;
    });

    return updated;
  }

  async remove(id: string, rbac: RbacContext, ip?: string) {
    const organizationId = rbac.organizationId;
    const existing = await this.prisma.rent_plans.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      throw new NotFoundException('Rent plan not found');
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.rent_plans.update({
        where: { id },
        data: {
          isActive: false,
          updatedAt: now,
        },
      });

      await this.createAuditLogTx(tx, {
        organizationId,
        userId: rbac.userId,
        action: 'rent_plan.deactivated',
        entityId: id,
        newValues: { name: existing.name },
        ipAddress: ip,
      });

      return result;
    });

    return { message: 'Rent plan deactivated successfully', rentPlan: updated };
  }
}
