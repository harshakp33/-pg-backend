import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { RbacService } from '../rbac.service';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbacService: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If endpoint does NOT require permissions, allow
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = (request as any).user;

    // 1. Confirm JWT authentication
    if (!user || !user.id) {
      throw new UnauthorizedException('Authentication required');
    }

    // 2. Get requested organization header
    const rawOrgId = request.headers['x-organization-id'];
    const organizationId = Array.isArray(rawOrgId) ? rawOrgId[0] : rawOrgId;

    if (!organizationId || organizationId.trim() === '') {
      throw new BadRequestException('Organization context is required');
    }

    if (!UUID_REGEX.test(organizationId.trim())) {
      throw new BadRequestException('Invalid organization ID format');
    }

    // 3. Verify active membership & load role + permissions
    const rbacContext = await this.rbacService.getAuthorizationContext(
      user.id,
      user.email,
      organizationId.trim(),
    );

    if (!rbacContext) {
      throw new ForbiddenException(
        'You are not an active member of this organization',
      );
    }

    // 4. Attach RBAC context to request
    (request as any).rbacContext = rbacContext;

    // 5. Compare required permissions (ALL required must be present)
    const hasAll = this.rbacService.hasAllPermissions(
      rbacContext,
      requiredPermissions,
    );

    if (!hasAll) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
