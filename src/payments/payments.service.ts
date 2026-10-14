import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InvoiceStatus, PaymentStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RbacContext } from '../rbac/types/rbac.types';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentQueryDto } from './dto/payment-query.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

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
        entityType: 'payments',
        entityId: params.entityId,
        oldValues: params.oldValues ? JSON.stringify(params.oldValues) : null,
        newValues: params.newValues ? JSON.stringify(params.newValues) : null,
        ipAddress: params.ipAddress ?? null,
        createdAt: new Date(),
      },
    });
  }

  async create(dto: CreatePaymentDto, rbac: RbacContext, ip?: string) {
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

    // 3. Duplicate payment reference check if referenceNumber is provided
    if (dto.referenceNumber) {
      const existingRef = await this.prisma.payments.findFirst({
        where: {
          organizationId,
          referenceNumber: dto.referenceNumber,
          deletedAt: null,
        },
      });
      if (existingRef) {
        throw new ConflictException(
          `A payment with reference number '${dto.referenceNumber}' already exists in this organization`,
        );
      }
    }

    const payAmount = new Prisma.Decimal(dto.amount);
    const now = new Date();
    const paymentId = randomUUID();
    const receiptNumber = `RCP-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;

    const payment = await this.prisma.$transaction(async (tx) => {
      // Advisory lock on reference number to prevent concurrent duplicate payment references
      if (dto.referenceNumber) {
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(hashtext('payment_ref_' || ${organizationId}::text || '_' || ${dto.referenceNumber}::text))
        `;
        const existingRef = await tx.payments.findFirst({
          where: {
            organizationId,
            referenceNumber: dto.referenceNumber,
            deletedAt: null,
          },
        });
        if (existingRef) {
          throw new ConflictException(
            `A payment with reference number '${dto.referenceNumber}' already exists in this organization`,
          );
        }
      }

      let allocationToCreate: {
        id: string;
        paymentId: string;
        invoiceId: string;
        allocatedAmount: Prisma.Decimal;
        allocatedAt: Date;
      } | null = null;

      if (dto.invoiceId) {
                // Lock invoice row with SELECT FOR UPDATE to prevent race conditions
        const lockedInvoices = await tx.$queryRaw<any[]>`
          SELECT id, "organizationId", "residentId", status, "netPayable", "paidAmount", "outstandingAmount", "paidAt"
          FROM invoices
          WHERE id = ${dto.invoiceId}::uuid AND "organizationId" = ${organizationId}::uuid
          FOR UPDATE
        `;
        const invoiceRaw = lockedInvoices[0];
        if (!invoiceRaw || invoiceRaw.residentId !== dto.residentId) {
          throw new NotFoundException(
            'Invoice not found or does not belong to this resident/organization',
          );
        }
        const invoice = {
          ...invoiceRaw,
          netPayable: new Prisma.Decimal(invoiceRaw.netPayable),
          paidAmount: new Prisma.Decimal(invoiceRaw.paidAmount),
          outstandingAmount: new Prisma.Decimal(invoiceRaw.outstandingAmount),
        };

        if (!invoice) {
          throw new NotFoundException(
            'Invoice not found or does not belong to this resident/organization',
          );
        }

        if (invoice.status === InvoiceStatus.PAID) {
          throw new ConflictException('Invoice is already fully paid');
        }
        if (invoice.status === InvoiceStatus.CANCELLED) {
          throw new BadRequestException('Cannot allocate payment to a cancelled invoice');
        }

        if (payAmount.greaterThan(invoice.outstandingAmount)) {
          throw new ConflictException(
            `Payment amount (${payAmount}) exceeds invoice outstanding balance (${invoice.outstandingAmount})`,
          );
        }

        const newPaidAmount = invoice.paidAmount.plus(payAmount);
        const newOutstanding = invoice.netPayable.minus(newPaidAmount);
        const isFullyPaid = newOutstanding.lessThanOrEqualTo(0);
        const nextStatus = isFullyPaid ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID;

        await tx.invoices.update({
          where: { id: dto.invoiceId },
          data: {
            paidAmount: newPaidAmount,
            outstandingAmount: newOutstanding.lessThan(0) ? new Prisma.Decimal(0) : newOutstanding,
            status: nextStatus,
            paidAt: isFullyPaid ? now : invoice.paidAt,
            updatedAt: now,
          },
        });

        allocationToCreate = {
          id: randomUUID(),
          paymentId,
          invoiceId: dto.invoiceId,
          allocatedAmount: payAmount,
          allocatedAt: now,
        };
      }

      const createdPayment = await tx.payments.create({
        data: {
          id: paymentId,
          organizationId,
          propertyId: dto.propertyId,
          residentId: dto.residentId,
          receiptNumber,
          amount: payAmount,
          paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : now,
          paymentMethod: dto.paymentMethod,
          referenceNumber: dto.referenceNumber,
          status: dto.status ?? PaymentStatus.RECORDED,
          notes: dto.notes,
          recordedBy: rbac.userId,
          createdAt: now,
          updatedAt: now,

        },
        include: {
          properties: { select: { id: true, name: true } },
          residents: { select: { id: true, fullName: true, phone: true } },
          payment_allocations: {
            include: {
              invoices: {
                select: {
                  id: true,
                  invoiceNumber: true,
                  netPayable: true,
                  paidAmount: true,
                  outstandingAmount: true,
                  status: true,
                },
              },
            },
          },
        },
      });

      if (allocationToCreate) {
        await tx.payment_allocations.create({
          data: allocationToCreate,
        });
      }

      await this.createAuditLogTx(tx, {
        organizationId,
        userId: rbac.userId,
        action: 'payment.created',
        entityId: createdPayment.id,
        newValues: {
          receiptNumber: createdPayment.receiptNumber,
          amount: createdPayment.amount.toString(),
          invoiceId: dto.invoiceId,
          referenceNumber: dto.referenceNumber,
        },
        ipAddress: ip,
      });

      return createdPayment;
    });

    return payment;
  }

  async findAll(query: PaymentQueryDto, rbac: RbacContext) {
    const organizationId = rbac.organizationId;
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.paymentsWhereInput = {
      organizationId,
      deletedAt: null,
    };

    if (query.status) {
      where.status = query.status;
    }
    if (query.paymentMethod) {
      where.paymentMethod = query.paymentMethod;
    }
    if (query.propertyId) {
      where.propertyId = query.propertyId;
    }
    if (query.residentId) {
      where.residentId = query.residentId;
    }
    if (query.search) {
      where.OR = [
        { receiptNumber: { contains: query.search, mode: 'insensitive' } },
        { referenceNumber: { contains: query.search, mode: 'insensitive' } },
        { residents: { fullName: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.payments.findMany({
        where,
        skip,
        take: limit,
        orderBy: { paymentDate: 'desc' },
        include: {
          properties: { select: { id: true, name: true } },
          residents: { select: { id: true, fullName: true, phone: true } },
          payment_allocations: {
            include: {
              invoices: {
                select: {
                  id: true,
                  invoiceNumber: true,
                  netPayable: true,
                  paidAmount: true,
                  outstandingAmount: true,
                  status: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.payments.count({ where }),
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
    const payment = await this.prisma.payments.findFirst({
      where: { id, organizationId: rbac.organizationId, deletedAt: null },
      include: {
        properties: { select: { id: true, name: true } },
        residents: { select: { id: true, fullName: true, phone: true, email: true } },
        payment_allocations: {
          include: {
            invoices: {
              select: {
                id: true,
                invoiceNumber: true,
                netPayable: true,
                paidAmount: true,
                outstandingAmount: true,
                status: true,
              },
            },
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    return payment;
  }

  async update(id: string, dto: UpdatePaymentDto, rbac: RbacContext, ip?: string) {
    const organizationId = rbac.organizationId;
    const existing = await this.prisma.payments.findFirst({
      where: { id, organizationId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('Payment not found');
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.payments.update({
        where: { id },
        data: {
          status: dto.status ?? undefined,
          notes: dto.notes ?? undefined,
          referenceNumber: dto.referenceNumber ?? undefined,
          updatedAt: now,
        },
      });

      await this.createAuditLogTx(tx, {
        organizationId,
        userId: rbac.userId,
        action: 'payment.updated',
        entityId: id,
        oldValues: { status: existing.status },
        newValues: { status: result.status },
        ipAddress: ip,
      });

      return result;
    });

    return updated;
  }
}
