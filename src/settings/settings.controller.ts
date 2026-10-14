import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentRbac } from '../rbac/decorators/current-rbac.decorator';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RbacContext } from '../rbac/types/rbac.types';
import { MemberPaginationDto } from './dto/member-pagination.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { UpdateOrganizationSettingsDto } from './dto/update-organization-settings.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdatePropertySettingsDto } from './dto/update-property-settings.dto';
import { UpdateSettingsNotificationPreferencesDto } from './dto/update-settings-notification-preferences.dto';
import { SettingsService } from './settings.service';

@ApiTags('Settings')
@ApiBearerAuth('bearer')
@ApiHeader({
  name: 'X-Organization-Id',
  required: true,
  description: 'Target organization UUID',
})
@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermissions('property.read')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  // ====================================================
  // A. ORGANIZATION SETTINGS
  // ====================================================
  @Get('organization')
  @ApiOperation({ summary: 'Get current organization settings' })
  @ApiResponse({ status: 200, description: 'Organization settings retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async getOrganizationSettings(@CurrentRbac() rbac: RbacContext) {
    return this.settingsService.getOrganizationSettings(rbac);
  }

  @Patch('organization')
  @RequirePermissions('property.update')
  @ApiOperation({ summary: 'Update organization settings (Owner/Manager)' })
  @ApiResponse({ status: 200, description: 'Organization settings updated successfully' })
  @ApiResponse({ status: 400, description: 'Bad request or validation error' })
  @ApiResponse({ status: 403, description: 'Forbidden: Insufficient privileges' })
  async updateOrganizationSettings(
    @CurrentRbac() rbac: RbacContext,
    @Body() dto: UpdateOrganizationSettingsDto,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip;
    return this.settingsService.updateOrganizationSettings(dto, rbac, ip);
  }

  // ====================================================
  // B. PROPERTY SETTINGS
  // ====================================================
  @Get('properties/:propertyId')
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'Get property-level configurations and policies' })
  @ApiParam({ name: 'propertyId', description: 'Property UUID' })
  @ApiResponse({ status: 200, description: 'Property settings retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Property not found in organization' })
  async getPropertySettings(
    @CurrentRbac() rbac: RbacContext,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
  ) {
    return this.settingsService.getPropertySettings(propertyId, rbac);
  }

  @Patch('properties/:propertyId')
  @RequirePermissions('property.update')
  @ApiOperation({ summary: 'Update property-level configurations and policies (Owner/Manager)' })
  @ApiParam({ name: 'propertyId', description: 'Property UUID' })
  @ApiResponse({ status: 200, description: 'Property settings updated successfully' })
  @ApiResponse({ status: 400, description: 'Bad request or validation error' })
  @ApiResponse({ status: 404, description: 'Property not found in organization' })
  async updatePropertySettings(
    @CurrentRbac() rbac: RbacContext,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Body() dto: UpdatePropertySettingsDto,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip;
    return this.settingsService.updatePropertySettings(propertyId, dto, rbac, ip);
  }

  // ====================================================
  // C. USER PROFILE
  // ====================================================
  @Get('profile')
  @ApiOperation({ summary: 'Get authenticated user personal profile' })
  @ApiResponse({ status: 200, description: 'User profile retrieved successfully' })
  async getProfile(@CurrentRbac() rbac: RbacContext) {
    return this.settingsService.getProfile(rbac);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update authenticated user personal profile' })
  @ApiResponse({ status: 200, description: 'User profile updated successfully' })
  @ApiResponse({ status: 400, description: 'Bad request or validation error' })
  async updateProfile(
    @CurrentRbac() rbac: RbacContext,
    @Body() dto: UpdateProfileDto,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip;
    return this.settingsService.updateProfile(dto, rbac, ip);
  }

  // ====================================================
  // D. ORGANIZATION MEMBERS
  // ====================================================
  @Get('members')
  @ApiOperation({ summary: 'List organization members with pagination (Owner/Manager)' })
  @ApiResponse({ status: 200, description: 'Members retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden: Insufficient privileges' })
  async getMembers(
    @CurrentRbac() rbac: RbacContext,
    @Query() query: MemberPaginationDto,
  ) {
    return this.settingsService.getMembers(query, rbac);
  }

  @Get('members/:membershipId')
  @ApiOperation({ summary: 'Get details of an organization membership' })
  @ApiParam({ name: 'membershipId', description: 'Organization Membership UUID' })
  @ApiResponse({ status: 200, description: 'Member details retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Membership not found' })
  async getMemberById(
    @CurrentRbac() rbac: RbacContext,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
  ) {
    return this.settingsService.getMemberById(membershipId, rbac);
  }

  @Patch('members/:membershipId')
  @RequirePermissions('property.update')
  @ApiOperation({ summary: 'Update organization member role or status (Owner only)' })
  @ApiParam({ name: 'membershipId', description: 'Organization Membership UUID' })
  @ApiResponse({ status: 200, description: 'Member updated successfully' })
  @ApiResponse({ status: 400, description: 'Validation error or invalid operation' })
  @ApiResponse({ status: 403, description: 'Forbidden: Owner role required' })
  @ApiResponse({ status: 404, description: 'Member or target role not found' })
  async updateMember(
    @CurrentRbac() rbac: RbacContext,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body() dto: UpdateMemberDto,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip;
    return this.settingsService.updateMember(membershipId, dto, rbac, ip);
  }

  // ====================================================
  // E. ROLES & PERMISSIONS VISIBILITY (READ-ONLY)
  // ====================================================
  @Get('roles')
  @ApiOperation({ summary: 'List system roles (Owner/Manager)' })
  @ApiResponse({ status: 200, description: 'Roles retrieved successfully' })
  async getRoles(@CurrentRbac() rbac: RbacContext) {
    return this.settingsService.getRoles(rbac);
  }

  @Get('roles/:roleId')
  @ApiOperation({ summary: 'Get role details and its permissions' })
  @ApiParam({ name: 'roleId', description: 'Role UUID' })
  @ApiResponse({ status: 200, description: 'Role details retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  async getRoleById(
    @CurrentRbac() rbac: RbacContext,
    @Param('roleId', ParseUUIDPipe) roleId: string,
  ) {
    return this.settingsService.getRoleById(roleId, rbac);
  }

  @Get('permissions')
  @ApiOperation({ summary: 'List all available system permissions (Owner/Manager)' })
  @ApiResponse({ status: 200, description: 'Permissions retrieved successfully' })
  async getPermissions(@CurrentRbac() rbac: RbacContext) {
    return this.settingsService.getPermissions(rbac);
  }

  @Get('roles/:roleId/permissions')
  @ApiOperation({ summary: 'Get permissions granted to a role' })
  @ApiParam({ name: 'roleId', description: 'Role UUID' })
  @ApiResponse({ status: 200, description: 'Role permissions retrieved successfully' })
  async getRolePermissions(
    @CurrentRbac() rbac: RbacContext,
    @Param('roleId', ParseUUIDPipe) roleId: string,
  ) {
    return this.settingsService.getRolePermissions(roleId, rbac);
  }

  // ====================================================
  // F. NOTIFICATION PREFERENCES
  // ====================================================
  @Get('notifications/preferences')
  @ApiOperation({ summary: 'Get notification channel preferences for authenticated user' })
  @ApiResponse({ status: 200, description: 'Preferences retrieved successfully' })
  async getNotificationPreferences(@CurrentRbac() rbac: RbacContext) {
    return this.settingsService.getNotificationPreferences(rbac);
  }

  @Patch('notifications/preferences')
  @ApiOperation({ summary: 'Update notification channel preferences for authenticated user' })
  @ApiResponse({ status: 200, description: 'Preferences updated successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async updateNotificationPreferences(
    @CurrentRbac() rbac: RbacContext,
    @Body() dto: UpdateSettingsNotificationPreferencesDto,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip;
    return this.settingsService.updateNotificationPreferences(dto, rbac, ip);
  }

  // ====================================================
  // G. SECURITY / ACCOUNT SETTINGS
  // ====================================================
  @Get('security')
  @ApiOperation({ summary: 'Get safe account security and membership summary' })
  @ApiResponse({ status: 200, description: 'Security summary retrieved successfully' })
  async getSecurityInfo(@CurrentRbac() rbac: RbacContext) {
    return this.settingsService.getSecurityInfo(rbac);
  }

  // ====================================================
  // H. SESSION / REFRESH TOKEN SECURITY
  // ====================================================
  @Get('sessions')
  @ApiOperation({ summary: 'List active sessions for authenticated user' })
  @ApiResponse({ status: 200, description: 'Sessions retrieved successfully' })
  async getSessions(@CurrentRbac() rbac: RbacContext) {
    return this.settingsService.getSessions(rbac);
  }

  // ====================================================
  // I. MANAGED DOCUMENTS (READ-ONLY)
  // ====================================================
  @Get('documents')
  @ApiOperation({ summary: 'List organization documents managed in system' })
  @ApiQuery({ name: 'propertyId', required: false, description: 'Filter by property UUID' })
  @ApiResponse({ status: 200, description: 'Managed documents retrieved successfully' })
  async getManagedDocuments(
    @CurrentRbac() rbac: RbacContext,
    @Query('propertyId') propertyId?: string,
  ) {
    return this.settingsService.getManagedDocuments({ propertyId }, rbac);
  }
}
