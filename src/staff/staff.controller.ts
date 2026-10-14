import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentRbac } from '../rbac/decorators/current-rbac.decorator';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RbacContext } from '../rbac/types/rbac.types';
import { CreateStaffDto } from './dto/create-staff.dto';
import { StaffQueryDto } from './dto/staff-query.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { AttendanceQueryDto } from '../staff-attendance/dto/attendance-query.dto';
import { StaffService } from './staff.service';

@ApiTags('Staff Management')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Organization-Id',
  required: true,
  description: 'Target organization UUID',
})
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Post()
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'Create a new staff profile' })
  @ApiResponse({ status: 201, description: 'Staff profile created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error or invalid property/user' })
  @ApiResponse({ status: 403, description: 'Forbidden - Owner or Manager required' })
  @ApiResponse({ status: 409, description: 'User already linked to a staff profile' })
  create(
    @Body() dto: CreateStaffDto,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.staffService.create(dto, rbac, ip);
  }

  @Get()
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'List staff profiles with pagination and filters' })
  @ApiResponse({ status: 200, description: 'List of staff profiles returned' })
  @ApiResponse({ status: 403, description: 'Forbidden for residents' })
  findAll(
    @Query() query: StaffQueryDto,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.staffService.findAll(query, rbac);
  }

  @Get(':id')
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'Get staff profile details by UUID' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Staff profile details returned' })
  @ApiResponse({ status: 404, description: 'Staff profile not found' })
  @ApiResponse({ status: 403, description: 'Forbidden for residents' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.staffService.findOne(id, rbac);
  }

  @Patch(':id')
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'Update staff profile details' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Staff profile updated successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 403, description: 'Forbidden - Owner or Manager required' })
  @ApiResponse({ status: 404, description: 'Staff profile not found' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStaffDto,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.staffService.update(id, dto, rbac, ip);
  }

  @Delete(':id')
  @RequirePermissions('property.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate or remove staff profile' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Staff profile deactivated or deleted' })
  @ApiResponse({ status: 403, description: 'Forbidden - Owner or Manager required' })
  @ApiResponse({ status: 404, description: 'Staff profile not found' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.staffService.remove(id, rbac, ip);
  }

  @Get(':id/attendance')
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'Get attendance history for a specific staff member' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Staff attendance history returned' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Staff profile not found' })
  getAttendanceHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: AttendanceQueryDto,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.staffService.getStaffAttendanceHistory(id, query, rbac);
  }
}
