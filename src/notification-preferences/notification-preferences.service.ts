import { BadRequestException, Injectable } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RbacContext } from '../rbac/types/rbac.types';
import {
  PreferenceItemDto,
  UpdateNotificationPreferencesDto,
} from './dto/update-notification-preferences.dto';

const ALL_NOTIFICATION_TYPES: NotificationType[] = [
  NotificationType.RENT_DUE,
  NotificationType.RENT_OVERDUE,
  NotificationType.BOOKING_CONFIRMED,
  NotificationType.MOVE_IN_REMINDER,
  NotificationType.MOVE_OUT_REMINDER,
  NotificationType.MAINTENANCE_CREATED,
  NotificationType.MAINTENANCE_ASSIGNED,
  NotificationType.COMPLAINT_CREATED,
  NotificationType.LOW_STOCK,
  NotificationType.PAYMENT_RECEIVED,
  NotificationType.DEPOSIT_REFUND,
  NotificationType.NOTICE_PUBLISHED,
];

@Injectable()
export class NotificationPreferencesService {
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
        entityType: 'notification_preferences',
        entityId: params.entityId,
        oldValues: params.oldValues ? JSON.stringify(params.oldValues) : null,
        newValues: params.newValues ? JSON.stringify(params.newValues) : null,
        ipAddress: params.ipAddress ?? null,
        createdAt: new Date(),
      },
    });
  }

  async getUserPreferences(rbac: RbacContext) {
    const existing = await this.prisma.notification_preferences.findMany({
      where: {
        userId: rbac.userId,
        organizationId: rbac.organizationId,
      },
    });

    const existingMap = new Map(existing.map((item) => [item.type, item]));

    // Construct full preference list including defaults for unset types
    const fullPreferences = ALL_NOTIFICATION_TYPES.map((type) => {
      const record = existingMap.get(type);
      if (record) {
        return record;
      }
      return {
        id: null,
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        type,
        inAppEnabled: true,
        emailEnabled: true,
        smsEnabled: true,
        whatsappEnabled: true,
        createdAt: null,
        updatedAt: null,
      };
    });

    return {
      userId: rbac.userId,
      preferences: fullPreferences,
    };
  }

  async updateUserPreferences(
    dto: UpdateNotificationPreferencesDto,
    rbac: RbacContext,
    ipAddress?: string,
  ) {
    const itemsToUpdate: PreferenceItemDto[] = [];

    if (dto.preferences && dto.preferences.length > 0) {
      itemsToUpdate.push(...dto.preferences);
    } else if (dto.type) {
      itemsToUpdate.push({
        type: dto.type,
        inAppEnabled: dto.inAppEnabled,
        emailEnabled: dto.emailEnabled,
        smsEnabled: dto.smsEnabled,
        whatsappEnabled: dto.whatsappEnabled,
      });
    } else {
      throw new BadRequestException(
        'Either type or preferences array must be provided in the update payload',
      );
    }

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      for (const item of itemsToUpdate) {
        await tx.notification_preferences.upsert({
          where: {
            userId_type: {
              userId: rbac.userId,
              type: item.type,
            },
          },
          update: {
            inAppEnabled: item.inAppEnabled !== undefined ? item.inAppEnabled : undefined,
            emailEnabled: item.emailEnabled !== undefined ? item.emailEnabled : undefined,
            smsEnabled: item.smsEnabled !== undefined ? item.smsEnabled : undefined,
            whatsappEnabled: item.whatsappEnabled !== undefined ? item.whatsappEnabled : undefined,
            updatedAt: now,
          },
          create: {
            id: randomUUID(),
            organizationId: rbac.organizationId,
            userId: rbac.userId,
            type: item.type,
            inAppEnabled: item.inAppEnabled ?? true,
            emailEnabled: item.emailEnabled ?? true,
            smsEnabled: item.smsEnabled ?? true,
            whatsappEnabled: item.whatsappEnabled ?? true,
            createdAt: now,
            updatedAt: now,
          },
        });
      }

      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'notification_preferences.updated',
        entityId: rbac.userId,
        newValues: itemsToUpdate,
        ipAddress,
      });
    });

    return this.getUserPreferences(rbac);
  }
}
