import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  NoticeAudience,
  NoticePriority,
  NoticeStatus,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RbacContext } from '../rbac/types/rbac.types';
import { CreateNoticeDto } from './dto/create-notice.dto';
import { NoticeQueryDto } from './dto/notice-query.dto';
import { UpdateNoticeDto } from './dto/update-notice.dto';

@Injectable()
export class NoticesService {
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
        entityType: 'notices',
        entityId: params.entityId,
        oldValues: params.oldValues ? JSON.stringify(params.oldValues) : null,
        newValues: params.newValues ? JSON.stringify(params.newValues) : null,
        ipAddress: params.ipAddress ?? null,
        createdAt: new Date(),
      },
    });
  }

  async create(dto: CreateNoticeDto, rbac: RbacContext, ipAddress?: string) {
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
    }

    if (dto.audience === NoticeAudience.SPECIFIC_PROPERTY && !dto.propertyId) {
      throw new BadRequestException('propertyId is required when audience is SPECIFIC_PROPERTY');
    }

    const noticeId = randomUUID();
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const notice = await tx.notices.create({
        data: {
          id: noticeId,
          organizationId: rbac.organizationId,
          propertyId: dto.propertyId ?? null,
          title: dto.title,
          description: dto.description,
          audience: dto.audience ?? NoticeAudience.ALL_RESIDENTS,
          priority: dto.priority ?? NoticePriority.MEDIUM,
          publishDate: dto.publishDate ? new Date(dto.publishDate) : now,
          expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
          status: dto.status ?? NoticeStatus.PUBLISHED,
          isPinned: dto.isPinned ?? false,
          authorUserId: rbac.userId,
          createdAt: now,
          updatedAt: now,
        },
      });

      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'notice.created',
        entityId: notice.id,
        newValues: notice,
        ipAddress,
      });

      return notice;
    });
  }

  async findAll(query: NoticeQueryDto, rbac: RbacContext) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 20;
    const skip = (page - 1) * limit;

    const where: Prisma.noticesWhereInput = {
      organizationId: rbac.organizationId,
    };

    if (query.propertyId) {
      where.propertyId = query.propertyId;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.audience) {
      where.audience = query.audience;
    }

    if (query.priority) {
      where.priority = query.priority;
    }

    if (query.isPinned !== undefined) {
      where.isPinned = query.isPinned;
    }

    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    // Role-specific scoping: RESIDENT isolation
    if (rbac.role === 'RESIDENT') {
      where.status = NoticeStatus.PUBLISHED;
      where.publishDate = { lte: new Date() };

      const residentProfile = await this.prisma.residents.findFirst({
        where: {
          userId: rbac.userId,
          organizationId: rbac.organizationId,
          deletedAt: null,
        },
      });

      const allowedAudiences: Prisma.noticesWhereInput[] = [
        { audience: NoticeAudience.ALL_RESIDENTS },
      ];

      if (residentProfile?.propertyId) {
        allowedAudiences.push({
          audience: NoticeAudience.SPECIFIC_PROPERTY,
          propertyId: residentProfile.propertyId,
        });
      }

      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        { OR: allowedAudiences },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.notices.count({ where }),
      this.prisma.notices.findMany({
        where,
        skip,
        take: limit,
        orderBy: [
          { isPinned: 'desc' },
          { publishDate: 'desc' },
          { createdAt: 'desc' },
        ],
        include: {
          properties: {
            select: {
              id: true,
              name: true,
              city: true,
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
    const notice = await this.prisma.notices.findFirst({
      where: {
        id,
        organizationId: rbac.organizationId,
      },
      include: {
        properties: {
          select: {
            id: true,
            name: true,
            city: true,
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

    if (!notice) {
      throw new NotFoundException('Notice not found');
    }

    // Resident access control check
    if (rbac.role === 'RESIDENT') {
      if (notice.status !== NoticeStatus.PUBLISHED) {
        throw new NotFoundException('Notice not found');
      }
      if (
        notice.audience === NoticeAudience.MANAGERS ||
        notice.audience === NoticeAudience.STAFF
      ) {
        throw new NotFoundException('Notice not found');
      }
      if (notice.audience === NoticeAudience.SPECIFIC_PROPERTY) {
        const residentProfile = await this.prisma.residents.findFirst({
          where: {
            userId: rbac.userId,
            organizationId: rbac.organizationId,
            deletedAt: null,
          },
        });
        if (!residentProfile || residentProfile.propertyId !== notice.propertyId) {
          throw new NotFoundException('Notice not found');
        }
      }
    }

    return notice;
  }

  async update(id: string, dto: UpdateNoticeDto, rbac: RbacContext, ipAddress?: string) {
    const existing = await this.prisma.notices.findFirst({
      where: {
        id,
        organizationId: rbac.organizationId,
      },
    });

    if (!existing) {
      throw new NotFoundException('Notice not found');
    }

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
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.notices.update({
        where: { id },
        data: {
          title: dto.title ?? existing.title,
          description: dto.description ?? existing.description,
          propertyId: dto.propertyId !== undefined ? dto.propertyId : existing.propertyId,
          audience: dto.audience ?? existing.audience,
          priority: dto.priority ?? existing.priority,
          publishDate: dto.publishDate ? new Date(dto.publishDate) : existing.publishDate,
          expiryDate: dto.expiryDate !== undefined ? (dto.expiryDate ? new Date(dto.expiryDate) : null) : existing.expiryDate,
          status: dto.status ?? existing.status,
          isPinned: dto.isPinned ?? existing.isPinned,
          updatedAt: now,
        },
      });

      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'notice.updated',
        entityId: updated.id,
        oldValues: existing,
        newValues: updated,
        ipAddress,
      });

      return updated;
    });
  }

  async publish(id: string, rbac: RbacContext, ipAddress?: string) {
    const existing = await this.prisma.notices.findFirst({
      where: {
        id,
        organizationId: rbac.organizationId,
      },
    });

    if (!existing) {
      throw new NotFoundException('Notice not found');
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.notices.update({
        where: { id },
        data: {
          status: NoticeStatus.PUBLISHED,
          publishDate: now,
          updatedAt: now,
        },
      });

      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'notice.published',
        entityId: updated.id,
        oldValues: existing,
        newValues: updated,
        ipAddress,
      });

      return updated;
    });
  }

  async unpublish(id: string, rbac: RbacContext, ipAddress?: string) {
    const existing = await this.prisma.notices.findFirst({
      where: {
        id,
        organizationId: rbac.organizationId,
      },
    });

    if (!existing) {
      throw new NotFoundException('Notice not found');
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.notices.update({
        where: { id },
        data: {
          status: NoticeStatus.DRAFT,
          updatedAt: now,
        },
      });

      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'notice.unpublished',
        entityId: updated.id,
        oldValues: existing,
        newValues: updated,
        ipAddress,
      });

      return updated;
    });
  }

  async remove(id: string, permanent: boolean = false, rbac: RbacContext, ipAddress?: string) {
    const existing = await this.prisma.notices.findFirst({
      where: {
        id,
        organizationId: rbac.organizationId,
      },
    });

    if (!existing) {
      throw new NotFoundException('Notice not found');
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      if (permanent) {
        await tx.notices.delete({
          where: { id },
        });

        await this.createAuditLogTx(tx, {
          organizationId: rbac.organizationId,
          userId: rbac.userId,
          action: 'notice.deleted',
          entityId: id,
          oldValues: existing,
          ipAddress,
        });

        return {
          success: true,
          message: 'Notice permanently deleted',
        };
      } else {
        const updated = await tx.notices.update({
          where: { id },
          data: {
            status: NoticeStatus.ARCHIVED,
            updatedAt: now,
          },
        });

        await this.createAuditLogTx(tx, {
          organizationId: rbac.organizationId,
          userId: rbac.userId,
          action: 'notice.archived',
          entityId: updated.id,
          oldValues: existing,
          newValues: updated,
          ipAddress,
        });

        return {
          success: true,
          message: 'Notice archived successfully',
          notice: updated,
        };
      }
    });
  }
}
