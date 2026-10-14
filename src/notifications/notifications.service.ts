import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationChannel,
  NotificationStatus,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RbacContext } from '../rbac/types/rbac.types';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationQueryDto } from './dto/notification-query.dto';

@Injectable()
export class NotificationsService {
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
        entityType: 'notifications',
        entityId: params.entityId,
        oldValues: params.oldValues ? JSON.stringify(params.oldValues) : null,
        newValues: params.newValues ? JSON.stringify(params.newValues) : null,
        ipAddress: params.ipAddress ?? null,
        createdAt: new Date(),
      },
    });
  }

  async create(dto: CreateNotificationDto, rbac: RbacContext, ipAddress?: string) {
    // Verify recipient user belongs to organization
    const member = await this.prisma.organization_members.findFirst({
      where: {
        userId: dto.userId,
        organizationId: rbac.organizationId,
        deletedAt: null,
      },
    });

    if (!member) {
      throw new NotFoundException('Recipient user is not a member of this organization');
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

    // Deduplication check if deduplicationKey provided
    if (dto.deduplicationKey) {
      const existing = await this.prisma.notifications.findUnique({
        where: { deduplicationKey: dto.deduplicationKey },
      });
      if (existing) {
        return existing;
      }
    }

    const notificationId = randomUUID();
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const notification = await tx.notifications.create({
        data: {
          id: notificationId,
          organizationId: rbac.organizationId,
          userId: dto.userId,
          propertyId: dto.propertyId ?? null,
          type: dto.type,
          channel: dto.channel ?? NotificationChannel.IN_APP,
          title: dto.title,
          body: dto.body,
          metadata: dto.metadata ?? null,
          status: dto.status ?? NotificationStatus.SENT,
          deduplicationKey: dto.deduplicationKey ?? null,
          sentAt: now,
          createdAt: now,
          updatedAt: now,
        },
      });

      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'notification.created',
        entityId: notification.id,
        newValues: notification,
        ipAddress,
      });

      return notification;
    });
  }

  async findAll(query: NotificationQueryDto, rbac: RbacContext) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 20;
    const skip = (page - 1) * limit;

    // Strict ownership isolation: ONLY current user's notifications in this organization
    const where: Prisma.notificationsWhereInput = {
      organizationId: rbac.organizationId,
      userId: rbac.userId,
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.channel) {
      where.channel = query.channel;
    }

    if (query.type) {
      where.type = query.type;
    }

    if (query.isRead !== undefined) {
      if (query.isRead) {
        where.OR = [
          { status: NotificationStatus.READ },
          { readAt: { not: null } },
        ];
      } else {
        where.readAt = null;
        where.status = { not: NotificationStatus.READ };
      }
    }

    if (query.search) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        {
          OR: [
            { title: { contains: query.search, mode: 'insensitive' } },
            { body: { contains: query.search, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.notifications.count({ where }),
      this.prisma.notifications.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
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

  async getUnreadCount(rbac: RbacContext) {
    const count = await this.prisma.notifications.count({
      where: {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        readAt: null,
        status: { not: NotificationStatus.READ },
      },
    });

    return { unreadCount: count };
  }

  async findOne(id: string, rbac: RbacContext) {
    const notification = await this.prisma.notifications.findFirst({
      where: {
        id,
        organizationId: rbac.organizationId,
        userId: rbac.userId,
      },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return notification;
  }

  async markAsRead(id: string, rbac: RbacContext) {
    const existing = await this.prisma.notifications.findFirst({
      where: {
        id,
        organizationId: rbac.organizationId,
        userId: rbac.userId,
      },
    });

    if (!existing) {
      throw new NotFoundException('Notification not found');
    }

    const now = new Date();

    return this.prisma.notifications.update({
      where: { id },
      data: {
        status: NotificationStatus.READ,
        readAt: existing.readAt ?? now,
        updatedAt: now,
      },
    });
  }

  async markAllAsRead(rbac: RbacContext) {
    const now = new Date();

    const result = await this.prisma.notifications.updateMany({
      where: {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        readAt: null,
      },
      data: {
        status: NotificationStatus.READ,
        readAt: now,
        updatedAt: now,
      },
    });

    return {
      success: true,
      markedCount: result.count,
    };
  }
}
