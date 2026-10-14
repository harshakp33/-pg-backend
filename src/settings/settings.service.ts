import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RbacContext } from '../rbac/types/rbac.types';
import { MemberPaginationDto } from './dto/member-pagination.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { UpdateOrganizationSettingsDto } from './dto/update-organization-settings.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdatePropertySettingsDto } from './dto/update-property-settings.dto';
import { UpdateSettingsNotificationPreferencesDto } from './dto/update-settings-notification-preferences.dto';

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
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  // ====================================================
  // A. ORGANIZATION SETTINGS
  // ====================================================
  async getOrganizationSettings(rbac: RbacContext) {
    const org = await this.prisma.organizations.findFirst({
      where: { id: rbac.organizationId, deletedAt: null },
      select: {
        id: true,
        name: true,
        slug: true,
        gstin: true,
        pan: true,
        phone: true,
        email: true,
        address: true,
        city: true,
        state: true,
        pincode: true,
        logoUrl: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    return org;
  }

  async updateOrganizationSettings(
    dto: UpdateOrganizationSettingsDto,
    rbac: RbacContext,
    ipAddress?: string,
  ) {
    if (rbac.role !== 'OWNER' && rbac.role !== 'MANAGER') {
      throw new ForbiddenException('Only owners and managers can update organization settings');
    }

    return this.prisma.$transaction(async (tx) => {
      // Advisory transaction lock for concurrent update protection
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'org_settings_' + rbac.organizationId}))`;

      const existing = await tx.organizations.findFirst({
        where: { id: rbac.organizationId, deletedAt: null },
      });

      if (!existing) {
        throw new NotFoundException('Organization not found');
      }

      const updated = await tx.organizations.update({
        where: { id: rbac.organizationId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.gstin !== undefined ? { gstin: dto.gstin } : {}),
          ...(dto.pan !== undefined ? { pan: dto.pan } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
          ...(dto.email !== undefined ? { email: dto.email } : {}),
          ...(dto.address !== undefined ? { address: dto.address } : {}),
          ...(dto.city !== undefined ? { city: dto.city } : {}),
          ...(dto.state !== undefined ? { state: dto.state } : {}),
          ...(dto.pincode !== undefined ? { pincode: dto.pincode } : {}),
          ...(dto.logoUrl !== undefined ? { logoUrl: dto.logoUrl } : {}),
        },
        select: {
          id: true,
          name: true,
          slug: true,
          gstin: true,
          pan: true,
          phone: true,
          email: true,
          address: true,
          city: true,
          state: true,
          pincode: true,
          logoUrl: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      await tx.audit_logs.create({
        data: {
          id: randomUUID(),
          organizationId: rbac.organizationId,
          userId: rbac.userId,
          action: 'organization.settings_updated',
          entityType: 'organizations',
          entityId: rbac.organizationId,
          oldValues: JSON.stringify({
            name: existing.name,
            phone: existing.phone,
            email: existing.email,
            address: existing.address,
          }),
          newValues: JSON.stringify(dto),
          ipAddress: ipAddress ?? null,
          createdAt: new Date(),
        },
      });

      return updated;
    });
  }

  // ====================================================
  // B. PROPERTY SETTINGS
  // ====================================================
  async getPropertySettings(propertyId: string, rbac: RbacContext) {
    const property = await this.prisma.properties.findFirst({
      where: { id: propertyId, organizationId: rbac.organizationId, deletedAt: null },
      select: { id: true, name: true },
    });

    if (!property) {
      throw new NotFoundException('Property not found in this organization');
    }

    let settings = await this.prisma.property_settings.findUnique({
      where: { propertyId },
    });

    if (!settings) {
      settings = await this.prisma.property_settings.create({
        data: {
          id: randomUUID(),
          propertyId,
          billingCycleDay: 1,
          gracePeriodDays: 5,
          lateFeePerDay: 50.0,
          noticePeriodDays: 30,
          securityDepositMonths: 2,
          curfewTime: '22:30',
          electricityBilling: 'INCLUDED',
          electricityRatePerUnit: 10.0,
          foodMenuAvailable: true,
          foodIncluded: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    }

    return {
      ...settings,
      lateFeePerDay: Number(settings.lateFeePerDay),
      electricityRatePerUnit: Number(settings.electricityRatePerUnit),
    };
  }

  async updatePropertySettings(
    propertyId: string,
    dto: UpdatePropertySettingsDto,
    rbac: RbacContext,
    ipAddress?: string,
  ) {
    if (rbac.role !== 'OWNER' && rbac.role !== 'MANAGER') {
      throw new ForbiddenException('Only owners and managers can update property settings');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'prop_settings_' + propertyId}))`;

      const property = await tx.properties.findFirst({
        where: { id: propertyId, organizationId: rbac.organizationId, deletedAt: null },
      });

      if (!property) {
        throw new NotFoundException('Property not found in this organization');
      }

      let existing = await tx.property_settings.findUnique({
        where: { propertyId },
      });

      if (!existing) {
        existing = await tx.property_settings.create({
          data: {
            id: randomUUID(),
            propertyId,
            billingCycleDay: 1,
            gracePeriodDays: 5,
            lateFeePerDay: 50.0,
            noticePeriodDays: 30,
            securityDepositMonths: 2,
            curfewTime: '22:30',
            electricityBilling: 'INCLUDED',
            electricityRatePerUnit: 10.0,
            foodMenuAvailable: true,
            foodIncluded: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
      }

      const updated = await tx.property_settings.update({
        where: { propertyId },
        data: {
          ...(dto.billingCycleDay !== undefined ? { billingCycleDay: dto.billingCycleDay } : {}),
          ...(dto.gracePeriodDays !== undefined ? { gracePeriodDays: dto.gracePeriodDays } : {}),
          ...(dto.lateFeePerDay !== undefined ? { lateFeePerDay: dto.lateFeePerDay } : {}),
          ...(dto.noticePeriodDays !== undefined ? { noticePeriodDays: dto.noticePeriodDays } : {}),
          ...(dto.securityDepositMonths !== undefined
            ? { securityDepositMonths: dto.securityDepositMonths }
            : {}),
          ...(dto.curfewTime !== undefined ? { curfewTime: dto.curfewTime } : {}),
          ...(dto.electricityBilling !== undefined
            ? { electricityBilling: dto.electricityBilling }
            : {}),
          ...(dto.electricityRatePerUnit !== undefined
            ? { electricityRatePerUnit: dto.electricityRatePerUnit }
            : {}),
          ...(dto.foodMenuAvailable !== undefined
            ? { foodMenuAvailable: dto.foodMenuAvailable }
            : {}),
          ...(dto.foodIncluded !== undefined ? { foodIncluded: dto.foodIncluded } : {}),
          ...(dto.guestPolicy !== undefined ? { guestPolicy: dto.guestPolicy } : {}),
          updatedAt: new Date(),
        },
      });

      await tx.audit_logs.create({
        data: {
          id: randomUUID(),
          organizationId: rbac.organizationId,
          userId: rbac.userId,
          action: 'property.settings_updated',
          entityType: 'property_settings',
          entityId: updated.id,
          oldValues: JSON.stringify(existing),
          newValues: JSON.stringify(dto),
          ipAddress: ipAddress ?? null,
          createdAt: new Date(),
        },
      });

      return {
        ...updated,
        lateFeePerDay: Number(updated.lateFeePerDay),
        electricityRatePerUnit: Number(updated.electricityRatePerUnit),
      };
    });
  }

  // ====================================================
  // C. USER PROFILE
  // ====================================================
  async getProfile(rbac: RbacContext) {
    const user = await this.prisma.users.findFirst({
      where: { id: rbac.userId, deletedAt: null },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        avatarUrl: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User profile not found');
    }

    return user;
  }

  async updateProfile(dto: UpdateProfileDto, rbac: RbacContext, ipAddress?: string) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.users.findFirst({
        where: { id: rbac.userId, deletedAt: null },
      });

      if (!existing) {
        throw new NotFoundException('User profile not found');
      }

      const updated = await tx.users.update({
        where: { id: rbac.userId },
        data: {
          ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
          ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
          ...(dto.avatarUrl !== undefined ? { avatarUrl: dto.avatarUrl } : {}),
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          avatarUrl: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      await tx.audit_logs.create({
        data: {
          id: randomUUID(),
          organizationId: rbac.organizationId,
          userId: rbac.userId,
          action: 'profile.updated',
          entityType: 'users',
          entityId: rbac.userId,
          oldValues: JSON.stringify({
            firstName: existing.firstName,
            lastName: existing.lastName,
            phone: existing.phone,
          }),
          newValues: JSON.stringify(dto),
          ipAddress: ipAddress ?? null,
          createdAt: new Date(),
        },
      });

      return updated;
    });
  }

  // ====================================================
  // D. ORGANIZATION MEMBERS
  // ====================================================
  async getMembers(query: MemberPaginationDto, rbac: RbacContext) {
    if (rbac.role !== 'OWNER' && rbac.role !== 'MANAGER') {
      throw new ForbiddenException('Only owners and managers can view organization members');
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.organization_membersWhereInput = {
      organizationId: rbac.organizationId,
      deletedAt: null,
      ...(query.roleId ? { roleId: query.roleId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            users: {
              OR: [
                { firstName: { contains: query.search, mode: 'insensitive' } },
                { lastName: { contains: query.search, mode: 'insensitive' } },
                { email: { contains: query.search, mode: 'insensitive' } },
                { phone: { contains: query.search, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };

    const [total, members] = await Promise.all([
      this.prisma.organization_members.count({ where }),
      this.prisma.organization_members.findMany({
        where,
        skip,
        take: limit,
        orderBy: { joinedAt: 'asc' },
        include: {
          users: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              avatarUrl: true,
              isActive: true,
            },
          },
          roles: {
            select: {
              id: true,
              name: true,
              description: true,
            },
          },
        },
      }),
    ]);

    const items = members.map((m) => ({
      id: m.id,
      organizationId: m.organizationId,
      userId: m.userId,
      roleId: m.roleId,
      roleName: m.roles.name,
      roleDescription: m.roles.description,
      isPrimaryOwner: m.isPrimaryOwner,
      status: m.status,
      joinedAt: m.joinedAt,
      user: m.users,
    }));

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async getMemberById(membershipId: string, rbac: RbacContext) {
    if (rbac.role !== 'OWNER' && rbac.role !== 'MANAGER') {
      throw new ForbiddenException('Only owners and managers can view member details');
    }

    const member = await this.prisma.organization_members.findFirst({
      where: {
        id: membershipId,
        organizationId: rbac.organizationId,
        deletedAt: null,
      },
      include: {
        users: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            avatarUrl: true,
            isActive: true,
            lastLoginAt: true,
          },
        },
        roles: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
      },
    });

    if (!member) {
      throw new NotFoundException('Organization member not found');
    }

    return {
      id: member.id,
      organizationId: member.organizationId,
      userId: member.userId,
      roleId: member.roleId,
      roleName: member.roles.name,
      roleDescription: member.roles.description,
      isPrimaryOwner: member.isPrimaryOwner,
      status: member.status,
      joinedAt: member.joinedAt,
      user: member.users,
    };
  }

  async updateMember(
    membershipId: string,
    dto: UpdateMemberDto,
    rbac: RbacContext,
    ipAddress?: string,
  ) {
    if (rbac.role !== 'OWNER') {
      throw new ForbiddenException('Only organization owners can modify members');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'org_member_' + membershipId}))`;

      const target = await tx.organization_members.findFirst({
        where: {
          id: membershipId,
          organizationId: rbac.organizationId,
          deletedAt: null,
        },
        include: { roles: true },
      });

      if (!target) {
        throw new NotFoundException('Organization member not found');
      }

      // Rule 3: A user cannot modify their own role
      if (target.userId === rbac.userId && dto.roleId && dto.roleId !== target.roleId) {
        throw new BadRequestException('Users cannot modify their own role');
      }

      // Rule 4: Prevent removing or deactivating the primary owner
      if (target.isPrimaryOwner && dto.status && dto.status !== 'ACTIVE') {
        throw new BadRequestException('Cannot deactivate or suspend primary owner');
      }

      if (dto.roleId) {
        const roleExists = await tx.roles.findUnique({
          where: { id: dto.roleId },
        });
        if (!roleExists) {
          throw new NotFoundException('Target role not found');
        }
      }

      const updated = await tx.organization_members.update({
        where: { id: membershipId },
        data: {
          ...(dto.roleId ? { roleId: dto.roleId } : {}),
          ...(dto.status ? { status: dto.status } : {}),
        },
        include: {
          users: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              avatarUrl: true,
              isActive: true,
            },
          },
          roles: {
            select: {
              id: true,
              name: true,
              description: true,
            },
          },
        },
      });

      const auditAction = dto.roleId && dto.status
        ? 'member.updated'
        : dto.roleId
        ? 'member.role_updated'
        : 'member.status_updated';

      await tx.audit_logs.create({
        data: {
          id: randomUUID(),
          organizationId: rbac.organizationId,
          userId: rbac.userId,
          action: auditAction,
          entityType: 'organization_members',
          entityId: membershipId,
          oldValues: JSON.stringify({ roleId: target.roleId, status: target.status }),
          newValues: JSON.stringify(dto),
          ipAddress: ipAddress ?? null,
          createdAt: new Date(),
        },
      });

      return {
        id: updated.id,
        organizationId: updated.organizationId,
        userId: updated.userId,
        roleId: updated.roleId,
        roleName: updated.roles.name,
        roleDescription: updated.roles.description,
        isPrimaryOwner: updated.isPrimaryOwner,
        status: updated.status,
        joinedAt: updated.joinedAt,
        user: updated.users,
      };
    });
  }

  // ====================================================
  // E. ROLES & PERMISSIONS VISIBILITY (READ-ONLY)
  // ====================================================
  async getRoles(rbac: RbacContext) {
    if (rbac.role !== 'OWNER' && rbac.role !== 'MANAGER') {
      throw new ForbiddenException('Only owners and managers can view roles');
    }

    return this.prisma.roles.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        isSystem: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async getRoleById(roleId: string, rbac: RbacContext) {
    if (rbac.role !== 'OWNER' && rbac.role !== 'MANAGER') {
      throw new ForbiddenException('Only owners and managers can view role details');
    }

    const role = await this.prisma.roles.findUnique({
      where: { id: roleId },
      include: {
        role_permissions: {
          include: {
            permissions: true,
          },
        },
      },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    return {
      id: role.id,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      permissions: role.role_permissions.map((rp) => ({
        id: rp.permissions.id,
        code: rp.permissions.code,
        name: rp.permissions.name,
        module: rp.permissions.module,
        description: rp.permissions.description,
      })),
    };
  }

  async getPermissions(rbac: RbacContext) {
    if (rbac.role !== 'OWNER' && rbac.role !== 'MANAGER') {
      throw new ForbiddenException('Only owners and managers can view permissions');
    }

    return this.prisma.permissions.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        module: true,
        description: true,
        createdAt: true,
      },
      orderBy: { code: 'asc' },
    });
  }

  async getRolePermissions(roleId: string, rbac: RbacContext) {
    if (rbac.role !== 'OWNER' && rbac.role !== 'MANAGER') {
      throw new ForbiddenException('Only owners and managers can view role permissions');
    }

    const role = await this.prisma.roles.findUnique({
      where: { id: roleId },
      include: {
        role_permissions: {
          include: {
            permissions: true,
          },
        },
      },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    return role.role_permissions.map((rp) => ({
      id: rp.permissions.id,
      code: rp.permissions.code,
      name: rp.permissions.name,
      module: rp.permissions.module,
      description: rp.permissions.description,
    }));
  }

  // ====================================================
  // F. NOTIFICATION PREFERENCES
  // ====================================================
  async getNotificationPreferences(rbac: RbacContext) {
    const preferences = await this.prisma.notification_preferences.findMany({
      where: {
        userId: rbac.userId,
        organizationId: rbac.organizationId,
      },
    });

    const prefMap = new Map<NotificationType, (typeof preferences)[0]>();
    for (const p of preferences) {
      prefMap.set(p.type, p);
    }

    return ALL_NOTIFICATION_TYPES.map((type) => {
      const existing = prefMap.get(type);
      return {
        type,
        inAppEnabled: existing ? existing.inAppEnabled : true,
        emailEnabled: existing ? existing.emailEnabled : true,
        smsEnabled: existing ? existing.smsEnabled : true,
        whatsappEnabled: existing ? existing.whatsappEnabled : true,
      };
    });
  }

  async updateNotificationPreferences(
    dto: UpdateSettingsNotificationPreferencesDto,
    rbac: RbacContext,
    ipAddress?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const results = [];

      for (const item of dto.preferences) {
        const existing = await tx.notification_preferences.findUnique({
          where: {
            userId_type: {
              userId: rbac.userId,
              type: item.type,
            },
          },
        });

        const updated = await tx.notification_preferences.upsert({
          where: {
            userId_type: {
              userId: rbac.userId,
              type: item.type,
            },
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
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          update: {
            ...(item.inAppEnabled !== undefined ? { inAppEnabled: item.inAppEnabled } : {}),
            ...(item.emailEnabled !== undefined ? { emailEnabled: item.emailEnabled } : {}),
            ...(item.smsEnabled !== undefined ? { smsEnabled: item.smsEnabled } : {}),
            ...(item.whatsappEnabled !== undefined ? { whatsappEnabled: item.whatsappEnabled } : {}),
            updatedAt: new Date(),
          },
        });

        results.push({
          type: updated.type,
          inAppEnabled: updated.inAppEnabled,
          emailEnabled: updated.emailEnabled,
          smsEnabled: updated.smsEnabled,
          whatsappEnabled: updated.whatsappEnabled,
        });
      }

      await tx.audit_logs.create({
        data: {
          id: randomUUID(),
          organizationId: rbac.organizationId,
          userId: rbac.userId,
          action: 'notification_preferences.updated',
          entityType: 'notification_preferences',
          entityId: rbac.userId,
          newValues: JSON.stringify(dto.preferences),
          ipAddress: ipAddress ?? null,
          createdAt: new Date(),
        },
      });

      return results;
    });
  }

  // ====================================================
  // G. SECURITY / ACCOUNT SETTINGS
  // ====================================================
  async getSecurityInfo(rbac: RbacContext) {
    const [user, member, activeSessionsCount] = await Promise.all([
      this.prisma.users.findUnique({
        where: { id: rbac.userId },
        select: { lastLoginAt: true, isActive: true },
      }),
      this.prisma.organization_members.findUnique({
        where: {
          organizationId_userId: {
            organizationId: rbac.organizationId,
            userId: rbac.userId,
          },
        },
        include: { roles: true },
      }),
      this.prisma.refresh_tokens.count({
        where: {
          userId: rbac.userId,
          isRevoked: false,
          expiresAt: { gt: new Date() },
        },
      }),
    ]);

    return {
      userId: rbac.userId,
      email: rbac.email,
      organizationId: rbac.organizationId,
      role: member?.roles?.name ?? rbac.role,
      isPrimaryOwner: member?.isPrimaryOwner ?? false,
      membershipStatus: member?.status ?? rbac.status,
      accountActive: user?.isActive ?? true,
      lastLoginAt: user?.lastLoginAt ?? null,
      activeSessionsCount,
    };
  }

  // ====================================================
  // H. SESSION / REFRESH TOKEN SECURITY
  // ====================================================
  async getSessions(rbac: RbacContext) {
    const sessions = await this.prisma.refresh_tokens.findMany({
      where: {
        userId: rbac.userId,
        isRevoked: false,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        createdAt: true,
        expiresAt: true,
        isRevoked: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return sessions;
  }

  // ====================================================
  // I. MANAGED DOCUMENTS (READ-ONLY)
  // ====================================================
  async getManagedDocuments(query: { propertyId?: string }, rbac: RbacContext) {
    if (query.propertyId) {
      const prop = await this.prisma.properties.findFirst({
        where: { id: query.propertyId, organizationId: rbac.organizationId, deletedAt: null },
      });
      if (!prop) {
        throw new NotFoundException('Property not found in this organization');
      }
    }

    const docs = await this.prisma.managed_documents.findMany({
      where: {
        organizationId: rbac.organizationId,
        ...(query.propertyId ? { propertyId: query.propertyId } : {}),
      },
      select: {
        id: true,
        title: true,
        category: true,
        documentType: true,
        fileName: true,
        fileSize: true,
        mimeType: true,
        accessLevel: true,
        propertyId: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return docs;
  }
}
