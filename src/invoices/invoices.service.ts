import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RbacContext } from '../rbac/types/rbac.types';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { InvoiceQueryDto } from './dto/invoice-query.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';

const ALLOWED_INVOICE_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  [InvoiceStatus.DRAFT]: [
    InvoiceStatus.ISSUED,
    InvoiceStatus.CANCELLED,
  ],
  [InvoiceStatus.ISSUED]: [
    InvoiceStatus.PARTIALLY_PAID,
    InvoiceStatus.PAID,
    InvoiceStatus.OVERDUE,
    InvoiceStatus.CANCELLED,
  ],
  [InvoiceStatus.PARTIALLY_PAID]: [
    InvoiceStatus.PAID,
    InvoiceStatus.OVERDUE,
    InvoiceStatus.CANCELLED,
  ],
  [InvoiceStatus.OVERDUE]: [
    InvoiceStatus.PARTIALLY_PAID,
    InvoiceStatus.PAID,
    InvoiceStatus.CANCELLED,
  ],
  [InvoiceStatus.PAID]: [], // Terminal state
  [InvoiceStatus.CANCELLED]: [], // Terminal state
};

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

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
        entityType: 'invoices',
        entityId: params.entityId,
        oldValues: params.oldValues ? JSON.stringify(params.oldValues) : null,
        newValues: params.newValues ? JSON.stringify(params.newValues) : null,
        ipAddress: params.ipAddress ?? null,
        createdAt: new Date(),
      },
    });
  }

  async create(dto: CreateInvoiceDto, rbac: RbacContext, ip?: string) {
    const organizationId = rbac.organizationId;

    // 1. Validate property
    const property = await this.prisma.properties.findFirst({
      where: { id: dto.propertyId, organizationId, deletedAt: null },
    });
    if (!property) {
      throw new NotFoundException('Property not found in this organization');
    }

    // 2. Validate resident
    const resident = await this.prisma.residents.findFirst({
      where: { id: dto.residentId, organizationId, deletedAt: null },
    });
    if (!resident) {
      throw new NotFoundException('Resident not found in this organization');
    }

    // 3. Decimal calculation
    let baseRent = new Prisma.Decimal(dto.baseRent || 0);
    let additionalCharges = new Prisma.Decimal(dto.additionalCharges || 0);
    let lateFees = new Prisma.Decimal(dto.lateFees || 0);
    let discounts = new Prisma.Decimal(dto.discounts || 0);
    let adjustments = new Prisma.Decimal(dto.adjustments || 0);

    const itemsToCreate: Array<{
      id: string;
      chargeType: any;
      description: string;
      amount: Prisma.Decimal;
      isDeduction: boolean;
    }> = [];

    if (dto.items && dto.items.length > 0) {
      let itemsTotalAdd = new Prisma.Decimal(0);
      let itemsTotalDed = new Prisma.Decimal(0);

      for (const item of dto.items) {
        const itemAmount = new Prisma.Decimal(item.amount);
        itemsToCreate.push({
          id: randomUUID(),
          chargeType: item.chargeType,
          description: item.description,
          amount: itemAmount,
          isDeduction: !!item.isDeduction,
        });

        if (item.isDeduction) {
          itemsTotalDed = itemsTotalDed.plus(itemAmount);
        } else {
          itemsTotalAdd = itemsTotalAdd.plus(itemAmount);
        }
      }

      if (baseRent.equals(0) && itemsTotalAdd.greaterThan(0)) {
        baseRent = itemsTotalAdd;
      }
      if (discounts.equals(0) && itemsTotalDed.greaterThan(0)) {
        discounts = itemsTotalDed;
      }
    }

    // netPayable = baseRent + additionalCharges + lateFees - discounts - adjustments
    const netPayable = baseRent
      .plus(additionalCharges)
      .plus(lateFees)
      .minus(discounts)
      .minus(adjustments);

    if (netPayable.isNegative()) {
      throw new BadRequestException('Net payable cannot be negative');
    }

    const outstandingAmount = netPayable;
    const now = new Date();
    const invoiceId = randomUUID();
    const invoiceNumber =
      dto.invoiceNumber ||
      `INV-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;

    const invoice = await this.prisma.$transaction(async (tx) => {
      const created = await tx.invoices.create({
        data: {
          id: invoiceId,
          organizationId,
          propertyId: dto.propertyId,
          residentId: dto.residentId,
          invoiceNumber,
          billingPeriodStart: new Date(dto.billingPeriodStart),
          billingPeriodEnd: new Date(dto.billingPeriodEnd),
          dueDate: new Date(dto.dueDate),
          baseRent,
          additionalCharges,
          lateFees,
          discounts,
          adjustments,
          netPayable,
          paidAmount: new Prisma.Decimal(0),
          outstandingAmount,
          status: dto.status ?? InvoiceStatus.ISSUED,
          notes: dto.notes,
          issuedAt: now,
          createdAt: now,
          updatedAt: now,
          invoice_items: {
            create: itemsToCreate,
          },
        },
        include: {
          invoice_items: true,
          properties: { select: { id: true, name: true } },
          residents: { select: { id: true, fullName: true, phone: true, email: true } },
        },
      });

      await this.createAuditLogTx(tx, {
        organizationId,
        userId: rbac.userId,
        action: 'invoice.created',
        entityId: created.id,
        newValues: {
          invoiceNumber: created.invoiceNumber,
          netPayable: created.netPayable.toString(),
          status: created.status,
          residentId: dto.residentId,
        },
        ipAddress: ip,
      });

      return created;
    });

    return invoice;
  }

  async findAll(query: InvoiceQueryDto, rbac: RbacContext) {
    const organizationId = rbac.organizationId;
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.invoicesWhereInput = {
      organizationId,
    };

    if (query.status) {
      where.status = query.status;
    }
    if (query.propertyId) {
      where.propertyId = query.propertyId;
    }
    if (query.residentId) {
      where.residentId = query.residentId;
    }
    if (query.search) {
      where.OR = [
        { invoiceNumber: { contains: query.search, mode: 'insensitive' } },
        { residents: { fullName: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.invoices.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          properties: { select: { id: true, name: true } },
          residents: { select: { id: true, fullName: true, phone: true, email: true } },
          invoice_items: true,
        },
      }),
      this.prisma.invoices.count({ where }),
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
    const invoice = await this.prisma.invoices.findFirst({
      where: { id, organizationId: rbac.organizationId },
      include: {
        invoice_items: true,
        properties: { select: { id: true, name: true, addressLine1: true } },
        residents: { select: { id: true, fullName: true, phone: true, email: true } },
        payment_allocations: {
          include: {
            payments: {
              select: {
                id: true,
                receiptNumber: true,
                amount: true,
                paymentDate: true,
                paymentMethod: true,
                referenceNumber: true,
              },
            },
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    return invoice;
  }

  async update(id: string, dto: UpdateInvoiceDto, rbac: RbacContext, ip?: string) {
    const organizationId = rbac.organizationId;
    const existing = await this.prisma.invoices.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      throw new NotFoundException('Invoice not found');
    }

    if (dto.status && dto.status !== existing.status) {
      const allowed = ALLOWED_INVOICE_TRANSITIONS[existing.status] || [];
      if (!allowed.includes(dto.status)) {
        throw new BadRequestException(
          `Invalid invoice transition from ${existing.status} to ${dto.status}. Allowed transitions: ${allowed.join(', ') || 'None'}`,
        );
      }
    }

    const now = new Date();
    let netPayable = existing.netPayable;
    let lateFees = dto.lateFees !== undefined ? new Prisma.Decimal(dto.lateFees) : existing.lateFees;
    let discounts = dto.discounts !== undefined ? new Prisma.Decimal(dto.discounts) : existing.discounts;
    let adjustments = dto.adjustments !== undefined ? new Prisma.Decimal(dto.adjustments) : existing.adjustments;

    if (
      dto.lateFees !== undefined ||
      dto.discounts !== undefined ||
      dto.adjustments !== undefined
    ) {
      netPayable = existing.baseRent
        .plus(existing.additionalCharges)
        .plus(lateFees)
        .minus(discounts)
        .minus(adjustments);
    }

    const outstandingAmount = netPayable.minus(existing.paidAmount);

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.invoices.update({
        where: { id },
        data: {
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          lateFees,
          discounts,
          adjustments,
          netPayable,
          outstandingAmount,
          status: dto.status ?? undefined,
          notes: dto.notes ?? undefined,
          updatedAt: now,
        },
        include: {
          invoice_items: true,
          properties: { select: { id: true, name: true } },
          residents: { select: { id: true, fullName: true, phone: true, email: true } },
        },
      });

      await this.createAuditLogTx(tx, {
        organizationId,
        userId: rbac.userId,
        action: dto.status && dto.status !== existing.status ? 'invoice.status_changed' : 'invoice.updated',
        entityId: id,
        oldValues: { status: existing.status, netPayable: existing.netPayable.toString() },
        newValues: { status: result.status, netPayable: result.netPayable.toString() },
        ipAddress: ip,
      });

      return result;
    });

    return updated;
  }

  async remove(id: string, rbac: RbacContext, ip?: string) {
    const organizationId = rbac.organizationId;
    const existing = await this.prisma.invoices.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      throw new NotFoundException('Invoice not found');
    }

    if (existing.status === InvoiceStatus.PAID) {
      throw new ConflictException('Cannot cancel or delete a fully paid invoice');
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.invoices.update({
        where: { id },
        data: {
          status: InvoiceStatus.CANCELLED,
          updatedAt: now,
        },
      });

      await this.createAuditLogTx(tx, {
        organizationId,
        userId: rbac.userId,
        action: 'invoice.cancelled',
        entityId: id,
        newValues: { invoiceNumber: existing.invoiceNumber },
        ipAddress: ip,
      });

      return result;
    });

    return { message: 'Invoice cancelled successfully', invoice: updated };
  }
}
