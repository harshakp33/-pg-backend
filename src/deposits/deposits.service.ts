import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DepositStatus, DepositTxType, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RbacContext } from '../rbac/types/rbac.types';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { DepositQueryDto } from './dto/deposit-query.dto';

@Injectable()
export class DepositsService {
  private readonly logger = new Logger(DepositsService.name);

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
        entityType: 'deposit_transactions',
        entityId: params.entityId,
        oldValues: params.oldValues ? JSON.stringify(params.oldValues) : null,
        newValues: params.newValues ? JSON.stringify(params.newValues) : null,
        ipAddress: params.ipAddress ?? null,
        createdAt: new Date(),
      },
    });
  }

  async create(dto: CreateDepositDto, rbac: RbacContext, ip?: string) {
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

    const txAmount = new Prisma.Decimal(dto.amount);
    const now = new Date();

    const depositTx = await this.prisma.$transaction(async (tx) => {
      // 3. Lock resident row to strictly serialize concurrent deposit transactions
      await tx.$queryRaw`
        SELECT id FROM residents
        WHERE id = ${dto.residentId}::uuid AND "organizationId" = ${organizationId}::uuid
        FOR UPDATE
      `;

      // Check duplicate reference if provided
      if (dto.referenceNumber) {
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(hashtext('deposit_ref_' || ${organizationId}::text || '_' || ${dto.referenceNumber}::text))
        `;
        const existingRef = await tx.deposit_transactions.findFirst({
          where: {
            organizationId,
            referenceNumber: dto.referenceNumber,
          },
        });
        if (existingRef) {
          throw new ConflictException(
            `A deposit transaction with reference number '${dto.referenceNumber}' already exists in this organization`,
          );
        }
      }

      // 4. Atomic Deposit Balance Check for REFUND or DEDUCTION inside locked transaction
      if (dto.transactionType !== DepositTxType.COLLECTED) {
        const existingTxs = await tx.deposit_transactions.findMany({
          where: {
            organizationId,
            residentId: dto.residentId,
          },
        });

        let balance = new Prisma.Decimal(0);
        for (const item of existingTxs) {
          if (item.transactionType === DepositTxType.COLLECTED) {
            balance = balance.plus(item.amount);
          } else {
            balance = balance.minus(item.amount);
          }
        }

        if (txAmount.greaterThan(balance)) {
          throw new ConflictException(
            `Deposit transaction amount (${txAmount}) exceeds available deposit balance (${balance})`,
          );
        }
      }

      const created = await tx.deposit_transactions.create({
        data: {
          id: randomUUID(),
          organizationId,
          propertyId: dto.propertyId,
          residentId: dto.residentId,
          transactionType: dto.transactionType,
          amount: txAmount,
          transactionDate: now,
          paymentMethod: dto.paymentMethod,
          referenceNumber: dto.referenceNumber,
          notes: dto.notes,
          createdAt: now,
        },
        include: {
          properties: { select: { id: true, name: true } },
          residents: { select: { id: true, fullName: true, phone: true } },
        },
      });

      const allTxs = await tx.deposit_transactions.findMany({
        where: { organizationId, residentId: dto.residentId },
      });
      let netDeposit = new Prisma.Decimal(0);
      for (const item of allTxs) {
        if (item.transactionType === DepositTxType.COLLECTED) {
          netDeposit = netDeposit.plus(item.amount);
        } else {
          netDeposit = netDeposit.minus(item.amount);
        }
      }

      let depositStatus = resident.depositStatus;
      if (netDeposit.lessThanOrEqualTo(0)) {
        depositStatus = DepositStatus.REFUNDED;
      } else if (netDeposit.greaterThanOrEqualTo(resident.securityDeposit)) {
        depositStatus = DepositStatus.PAID;
      } else {
        depositStatus = DepositStatus.PARTIAL;
      }

      await tx.residents.update({
        where: { id: dto.residentId },
        data: {
          depositPaid: netDeposit.lessThan(0) ? new Prisma.Decimal(0) : netDeposit,
          depositStatus,
          updatedAt: now,
        },
      });

      await this.createAuditLogTx(tx, {
        organizationId,
        userId: rbac.userId,
        action: dto.transactionType === DepositTxType.REFUNDED ? 'deposit.refunded' : 'deposit.created',
        entityId: created.id,
        newValues: {
          transactionType: created.transactionType,
          amount: created.amount.toString(),
          residentId: dto.residentId,
          netDepositBalance: netDeposit.toString(),
        },
        ipAddress: ip,
      });

      return created;
    });

    return depositTx;
  }

  async findAll(query: DepositQueryDto, rbac: RbacContext) {
    const organizationId = rbac.organizationId;
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.deposit_transactionsWhereInput = {
      organizationId,
    };

    if (query.transactionType) {
      where.transactionType = query.transactionType;
    }
    if (query.propertyId) {
      where.propertyId = query.propertyId;
    }
    if (query.residentId) {
      where.residentId = query.residentId;
    }

    const [items, total] = await Promise.all([
      this.prisma.deposit_transactions.findMany({
        where,
        skip,
        take: limit,
        orderBy: { transactionDate: 'desc' },
        include: {
          properties: { select: { id: true, name: true } },
          residents: { select: { id: true, fullName: true, phone: true } },
        },
      }),
      this.prisma.deposit_transactions.count({ where }),
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
    const item = await this.prisma.deposit_transactions.findFirst({
      where: { id, organizationId: rbac.organizationId },
      include: {
        properties: { select: { id: true, name: true } },
        residents: { select: { id: true, fullName: true, phone: true, email: true } },
      },
    });

    if (!item) {
      throw new NotFoundException('Deposit transaction not found');
    }

    return item;
  }
}
