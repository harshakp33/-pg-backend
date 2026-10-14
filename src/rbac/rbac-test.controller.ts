import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermissions } from './decorators/require-permissions.decorator';
import { PermissionGuard } from './guards/permission.guard';
import { CurrentRbac } from './decorators/current-rbac.decorator';
import { RbacContext } from './types/rbac.types';

@ApiTags('RBAC')
@Controller('rbac/test')
export class RbacTestController {
  @Get('public')
  @ApiOperation({ summary: 'Public test endpoint - no authentication required' })
  @ApiResponse({ status: 200, description: 'Public endpoint response' })
  getPublic() {
    return {
      message: 'Public endpoint accessible without authentication',
      status: 'ok',
    };
  }

  @Get('authenticated')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Authenticated test endpoint - requires JWT' })
  @ApiResponse({ status: 200, description: 'Authenticated user details' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getAuthenticated(@Req() req: Request) {
    return {
      message: 'Authenticated endpoint accessible with valid JWT',
      user: (req as any).user,
    };
  }

  @Get('properties-read')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions('property.read')
  @ApiBearerAuth('bearer')
  @ApiHeader({
    name: 'X-Organization-Id',
    description: 'Active Organization UUID',
    required: true,
  })
  @ApiOperation({ summary: 'Requires JWT + X-Organization-Id + property.read permission' })
  @ApiResponse({ status: 200, description: 'Access granted' })
  @ApiResponse({ status: 400, description: 'Organization context is required' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden: non-member or insufficient permissions' })
  getPropertiesRead(@CurrentRbac() rbac: RbacContext) {
    return {
      message: 'Properties read access granted',
      organizationId: rbac.organizationId,
      role: rbac.role,
      permissions: rbac.permissions,
    };
  }

  @Get('properties-write')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions('property.update')
  @ApiBearerAuth('bearer')
  @ApiHeader({
    name: 'X-Organization-Id',
    description: 'Active Organization UUID',
    required: true,
  })
  @ApiOperation({ summary: 'Requires JWT + X-Organization-Id + property.update permission' })
  @ApiResponse({ status: 200, description: 'Access granted' })
  @ApiResponse({ status: 400, description: 'Organization context is required' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden: non-member or insufficient permissions' })
  getPropertiesWrite(@CurrentRbac() rbac: RbacContext) {
    return {
      message: 'Properties write access granted',
      organizationId: rbac.organizationId,
      role: rbac.role,
      permissions: rbac.permissions,
    };
  }

  @Get('multiple-permissions')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions('property.read', 'property.update')
  @ApiBearerAuth('bearer')
  @ApiHeader({
    name: 'X-Organization-Id',
    description: 'Active Organization UUID',
    required: true,
  })
  @ApiOperation({ summary: 'Requires JWT + X-Organization-Id + ALL required permissions (property.read AND property.update)' })
  @ApiResponse({ status: 200, description: 'Access granted' })
  @ApiResponse({ status: 400, description: 'Organization context is required' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden: missing one or more required permissions' })
  getMultiplePermissions(@CurrentRbac() rbac: RbacContext) {
    return {
      message: 'Multiple permissions access granted',
      organizationId: rbac.organizationId,
      role: rbac.role,
      permissions: rbac.permissions,
    };
  }
}
