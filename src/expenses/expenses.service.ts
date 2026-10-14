import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RbacContext } from '../rbac/types/rbac.types';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ExpenseQueryDto } from './dto/expense-query.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';

@Injectable()
export class ExpensesService {
  private readonly logger = new Logger(ExpensesService.name);

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
        entityType: 'expenses',
        entityId: params.entityId,
        oldValues: params.oldValues ? JSON.stringify(params.oldValues) : null,
        newValues: params.newValues ? JSON.stringify(params.newValues) : null,
        ipAddress: params.ipAddress ?? null,
        createdAt: new Date(),
      },
    });
  }

  async create(dto: CreateExpenseDto, rbac: RbacContext, ip?: string) {
    const organizationId = rbac.organizationId;

    const property = await this.prisma.properties.findFirst({
      where: { id: dto.propertyId, organizationId, deletedAt: null },
    });
    if (!property) {
      throw new NotFoundException('Property not found in this organization');
    }

    const now = new Date();
    const expense = await this.prisma.$transaction(async (tx) => {
      const created = await tx.expenses.create({
        data: {
          id: randomUUID(),
          organizationId,
          propertyId: dto.propertyId,
          category: dto.category,
          title: dto.title,
          amount: new Prisma.Decimal(dto.amount),
          expenseDate: dto.expenseDate ? new Date(dto.expenseDate) : now,
          paymentMethod: dto.paymentMethod,
          vendorName: dto.vendorName,
          invoiceReceiptUrl: dto.invoiceReceiptUrl,
          notes: dto.notes,
          recordedBy: rbac.userId,
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
        action: 'expense.created',
        entityId: created.id,
        newValues: {
          category: created.category,
          title: created.title,
          amount: created.amount.toString(),
        },
        ipAddress: ip,
      });

      return created;
    });

    return expense;
  }

  async findAll(query: ExpenseQueryDto, rbac: RbacContext) {
    const organizationId = rbac.organizationId;
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.expensesWhereInput = {
      organizationId,
      deletedAt: null,
    };

    if (query.category) {
      where.category = query.category;
    }
    if (query.propertyId) {
      where.propertyId = query.propertyId;
    }
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { vendorName: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.expenses.findMany({
        where,
        skip,
        take: limit,
        orderBy: { expenseDate: 'desc' },
        include: {
          properties: { select: { id: true, name: true } },
        },
      }),
      this.prisma.expenses.count({ where }),
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
    const expense = await this.prisma.expenses.findFirst({
      where: { id, organizationId: rbac.organizationId, deletedAt: null },
      include: {
        properties: { select: { id: true, name: true } },
      },
    });

    if (!expense) {
      throw new NotFoundException('Expense not found');
    }

    return expense;
  }

  async update(id: string, dto: UpdateExpenseDto, rbac: RbacContext, ip?: string) {
    const organizationId = rbac.organizationId;
    const existing = await this.prisma.expenses.findFirst({
      where: { id, organizationId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('Expense not found');
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.expenses.update({
        where: { id },
        data: {
          category: dto.category ?? undefined,
          title: dto.title ?? undefined,
          amount: dto.amount ? new Prisma.Decimal(dto.amount) : undefined,
          paymentMethod: dto.paymentMethod ?? undefined,
          vendorName: dto.vendorName ?? undefined,
          invoiceReceiptUrl: dto.invoiceReceiptUrl ?? undefined,
          notes: dto.notes ?? undefined,
          updatedAt: now,
        },
      });

      await this.createAuditLogTx(tx, {
        organizationId,
        userId: rbac.userId,
        action: 'expense.updated',
        entityId: id,
        oldValues: { title: existing.title, amount: existing.amount.toString() },
        newValues: { title: result.title, amount: result.amount.toString() },
        ipAddress: ip,
      });

      return result;
    });

    return updated;
  }

  async remove(id: string, rbac: RbacContext, ip?: string) {
    const organizationId = rbac.organizationId;
    const existing = await this.prisma.expenses.findFirst({
      where: { id, organizationId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('Expense not found');
    }

    const now = new Date();
    const deleted = await this.prisma.$transaction(async (tx) => {
      const result = await tx.expenses.update({
        where: { id },
        data: {
          deletedAt: now,
          updatedAt: now,
        },
      });

      await this.createAuditLogTx(tx, {
        organizationId,
        userId: rbac.userId,
        action: 'expense.deleted',
        entityId: id,
        newValues: { title: existing.title },
        ipAddress: ip,
      });

      return result;
    });

    return { message: 'Expense deleted successfully', expense: deleted };
  }
}
