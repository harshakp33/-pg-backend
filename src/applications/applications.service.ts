import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EnquiryStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RbacContext } from '../rbac/types/rbac.types';
import { ApplicationQueryDto } from './dto/application-query.dto';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';

// State transition matrix for Enquiries/Applications
const ALLOWED_STATUS_TRANSITIONS: Record<EnquiryStatus, EnquiryStatus[]> = {
  [EnquiryStatus.NEW]: [
    EnquiryStatus.SITE_VISIT_SCHEDULED,
    EnquiryStatus.BOOKED,
    EnquiryStatus.LOST,
    EnquiryStatus.DROPPED,
  ],
  [EnquiryStatus.SITE_VISIT_SCHEDULED]: [
    EnquiryStatus.SITE_VISIT_COMPLETED,
    EnquiryStatus.BOOKED,
    EnquiryStatus.LOST,
    EnquiryStatus.DROPPED,
  ],
  [EnquiryStatus.SITE_VISIT_COMPLETED]: [
    EnquiryStatus.BOOKED,
    EnquiryStatus.LOST,
    EnquiryStatus.DROPPED,
  ],
  [EnquiryStatus.BOOKED]: [
    EnquiryStatus.DROPPED, // Cancellation after booking
  ],
  [EnquiryStatus.LOST]: [
    EnquiryStatus.NEW, // Re-opened lead
  ],
  [EnquiryStatus.DROPPED]: [
    EnquiryStatus.NEW, // Re-opened lead
  ],
};

@Injectable()
export class ApplicationsService {
  private readonly logger = new Logger(ApplicationsService.name);

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
        entityType: 'enquiries',
        entityId: params.entityId,
        oldValues: params.oldValues ? JSON.stringify(params.oldValues) : null,
        newValues: params.newValues ? JSON.stringify(params.newValues) : null,
        ipAddress: params.ipAddress ?? null,
      },
    });
  }

  /**
   * Validate that property belongs to organization
   */
  private async verifyProperty(propertyId: string, organizationId: string) {
    const property = await this.prisma.properties.findFirst({
      where: { id: propertyId, organizationId, deletedAt: null },
    });
    if (!property) {
      throw new NotFoundException('Property not found in this organization');
    }
    return property;
  }

  /**
   * Create new prospective tenant application / enquiry
   */
  async create(
    dto: CreateApplicationDto,
    rbac: RbacContext,
    ipAddress?: string,
  ) {
    if (dto.propertyId) {
      await this.verifyProperty(dto.propertyId, rbac.organizationId);
    }

    const applicationId = randomUUID();
    const now = new Date();

    const application = await this.prisma.$transaction(async (tx) => {
      const created = await tx.enquiries.create({
        data: {
          id: applicationId,
          organizationId: rbac.organizationId,
          propertyId: dto.propertyId ?? null,
          name: dto.name.trim(),
          phone: dto.phone.trim(),
          email: dto.email ? dto.email.trim().toLowerCase() : null,
          source: dto.source ?? 'WEBSITE',
          preferredRoomType: dto.preferredRoomType ?? 'DOUBLE',
          budget: dto.budget !== undefined ? new Prisma.Decimal(dto.budget) : null,
          expectedMoveIn: dto.expectedMoveIn ? new Date(dto.expectedMoveIn) : null,
          status: dto.status ?? EnquiryStatus.NEW,
          siteVisitDate: dto.siteVisitDate ? new Date(dto.siteVisitDate) : null,
          notes: dto.notes?.trim() ?? null,
          createdAt: now,
          updatedAt: now,
        },
      });

      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'application.created',
        entityId: applicationId,
        newValues: {
          name: created.name,
          phone: created.phone,
          status: created.status,
          propertyId: created.propertyId,
        },
        ipAddress,
      });

      return created;
    });

    this.logger.log(`Application created: ${application.id} by user ${rbac.userId}`);
    return application;
  }

  /**
   * List all applications with pagination and filters
   */
  async findAll(query: ApplicationQueryDto, rbac: RbacContext) {
    const {
      page = 1,
      limit = 20,
      search,
      status,
      propertyId,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const skip = (page - 1) * limit;

    const where: Prisma.enquiriesWhereInput = {
      organizationId: rbac.organizationId,
      deletedAt: null,
    };

    if (search) {
      const term = search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
      ];
    }

    if (status) {
      where.status = status;
    }

    if (propertyId) {
      where.propertyId = propertyId;
    }

    const orderBy: Prisma.enquiriesOrderByWithRelationInput = {
      [sortBy]: sortOrder,
    };

    const [items, total] = await Promise.all([
      this.prisma.enquiries.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          properties: {
            select: { id: true, name: true, code: true },
          },
          bookings: {
            select: { id: true, status: true, bookingAmount: true, expectedMoveIn: true },
          },
        },
      }),
      this.prisma.enquiries.count({ where }),
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
   * Get single application details
   */
  async findOne(id: string, rbac: RbacContext) {
    const application = await this.prisma.enquiries.findFirst({
      where: {
        id,
        organizationId: rbac.organizationId,
        deletedAt: null,
      },
      include: {
        properties: {
          select: { id: true, name: true, code: true, addressLine1: true, city: true },
        },
        bookings: {
          select: {
            id: true,
            status: true,
            bookingAmount: true,
            expectedMoveIn: true,
            receiptNumber: true,
            createdAt: true,
          },
        },
      },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    return application;
  }

  /**
   * Update application details and enforce state machine transitions
   */
  async update(
    id: string,
    dto: UpdateApplicationDto,
    rbac: RbacContext,
    ipAddress?: string,
  ) {
    const existing = await this.prisma.enquiries.findFirst({
      where: {
        id,
        organizationId: rbac.organizationId,
        deletedAt: null,
      },
    });

    if (!existing) {
      throw new NotFoundException('Application not found');
    }

    if (dto.propertyId && dto.propertyId !== existing.propertyId) {
      await this.verifyProperty(dto.propertyId, rbac.organizationId);
    }

    // State transition validation
    if (dto.status && dto.status !== existing.status) {
      const allowed = ALLOWED_STATUS_TRANSITIONS[existing.status] || [];
      if (!allowed.includes(dto.status)) {
        throw new BadRequestException(
          `Invalid status transition from ${existing.status} to ${dto.status}. Allowed transitions: ${allowed.join(', ') || 'None'}`,
        );
      }
    }

    const now = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.enquiries.update({
        where: { id },
        data: {
          name: dto.name !== undefined ? dto.name.trim() : existing.name,
          phone: dto.phone !== undefined ? dto.phone.trim() : existing.phone,
          email: dto.email !== undefined ? (dto.email ? dto.email.trim().toLowerCase() : null) : existing.email,
          propertyId: dto.propertyId !== undefined ? dto.propertyId : existing.propertyId,
          source: dto.source ?? existing.source,
          preferredRoomType: dto.preferredRoomType ?? existing.preferredRoomType,
          budget: dto.budget !== undefined ? new Prisma.Decimal(dto.budget) : existing.budget,
          expectedMoveIn: dto.expectedMoveIn !== undefined ? (dto.expectedMoveIn ? new Date(dto.expectedMoveIn) : null) : existing.expectedMoveIn,
          status: dto.status ?? existing.status,
          siteVisitDate: dto.siteVisitDate !== undefined ? (dto.siteVisitDate ? new Date(dto.siteVisitDate) : null) : existing.siteVisitDate,
          notes: dto.notes !== undefined ? dto.notes?.trim() : existing.notes,
          updatedAt: now,
        },
      });

      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: dto.status && dto.status !== existing.status ? 'application.status_changed' : 'application.updated',
        entityId: id,
        oldValues: {
          name: existing.name,
          status: existing.status,
          propertyId: existing.propertyId,
        },
        newValues: {
          name: result.name,
          status: result.status,
          propertyId: result.propertyId,
        },
        ipAddress,
      });

      return result;
    });

    this.logger.log(`Application updated: ${id} by user ${rbac.userId}`);
    return updated;
  }

  /**
   * Soft-delete application
   */
  async remove(id: string, rbac: RbacContext, ipAddress?: string) {
    const existing = await this.prisma.enquiries.findFirst({
      where: {
        id,
        organizationId: rbac.organizationId,
        deletedAt: null,
      },
    });

    if (!existing) {
      throw new NotFoundException('Application not found');
    }

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.enquiries.update({
        where: { id },
        data: {
          deletedAt: now,
          status: EnquiryStatus.DROPPED,
          updatedAt: now,
        },
      });

      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'application.deleted',
        entityId: id,
        oldValues: { name: existing.name, status: existing.status },
        newValues: { deletedAt: now, status: EnquiryStatus.DROPPED },
        ipAddress,
      });
    });

    this.logger.log(`Application soft-deleted: ${id} by user ${rbac.userId}`);
    return {
      success: true,
      message: 'Application deleted successfully',
      id,
    };
  }
}
