import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RbacContext } from './types/rbac.types';

@Injectable()
export class RbacService {
  private readonly logger = new Logger(RbacService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper to normalize permission codes (e.g. handle aliases properties.read <-> property.read)
   */
  normalizePermission(code: string): string {
    const trimmed = code.trim();
    if (trimmed === 'properties.read') return 'property.read';
    if (trimmed === 'properties.update') return 'property.update';
    if (trimmed === 'properties.write') return 'property.update';
    if (trimmed === 'properties.create') return 'property.create';
    if (trimmed === 'properties.delete') return 'property.delete';
    return trimmed;
  }

  /**
   * Fetch organization membership for user
   */
  async getUserOrganizationMembership(userId: string, organizationId: string) {
    return this.prisma.organization_members.findFirst({
      where: {
        userId,
        organizationId,
      },
      include: {
        roles: true,
      },
    });
  }

  /**
   * Load role name for a user in an organization
   */
  async getUserRole(userId: string, organizationId: string) {
    const membership = await this.prisma.organization_members.findFirst({
      where: {
        userId,
        organizationId,
        status: 'ACTIVE',
        deletedAt: null,
      },
      include: {
        roles: true,
      },
    });

    return membership?.roles?.name ?? null;
  }

  /**
   * Load all permissions for user in organization
   */
  async getUserPermissions(userId: string, organizationId: string): Promise<string[]> {
    const membership = await this.prisma.organization_members.findFirst({
      where: {
        userId,
        organizationId,
        status: 'ACTIVE',
        deletedAt: null,
      },
      include: {
        roles: {
          include: {
            role_permissions: {
              include: {
                permissions: {
                  select: { code: true },
                },
              },
            },
          },
        },
      },
    });

    if (!membership || !membership.roles) {
      return [];
    }

    return membership.roles.role_permissions.map((rp) => rp.permissions.code);
  }

  /**
   * Build complete RBAC context for an active user & organization
   */
  async getAuthorizationContext(
    userId: string,
    email: string,
    organizationId: string,
  ): Promise<RbacContext | null> {
    const membership = await this.prisma.organization_members.findFirst({
      where: {
        userId,
        organizationId,
        status: 'ACTIVE',
        deletedAt: null,
      },
      include: {
        roles: {
          include: {
            role_permissions: {
              include: {
                permissions: {
                  select: { code: true },
                },
              },
            },
          },
        },
      },
    });

    if (!membership || !membership.roles) {
      return null;
    }

    const permissions = membership.roles.role_permissions.map(
      (rp) => rp.permissions.code,
    );

    return {
      userId,
      email,
      organizationId,
      membershipId: membership.id,
      roleId: membership.roleId,
      role: membership.roles.name,
      isPrimaryOwner: membership.isPrimaryOwner,
      status: membership.status,
      permissions,
    };
  }

  /**
   * Check if context has a specific permission
   */
  hasPermission(context: RbacContext, permission: string): boolean {
    const normalized = this.normalizePermission(permission);
    return context.permissions.some(
      (p) => p === permission || p === normalized,
    );
  }

  /**
   * Check if context has ALL required permissions (AND logic)
   */
  hasAllPermissions(context: RbacContext, requiredPermissions: string[]): boolean {
    return requiredPermissions.every((perm) => this.hasPermission(context, perm));
  }

  /**
   * Check if context has ANY of the required permissions (OR logic)
   */
  hasAnyPermission(context: RbacContext, permissions: string[]): boolean {
    return permissions.some((perm) => this.hasPermission(context, perm));
  }
}
