import {
  Body,
  Controller,
  Get,
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
import { CreateStaffTaskDto } from './dto/create-staff-task.dto';
import { StaffTaskQueryDto } from './dto/staff-task-query.dto';
import { UpdateStaffTaskDto } from './dto/update-staff-task.dto';
import { StaffTasksService } from './staff-tasks.service';

@ApiTags('Staff Tasks')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Organization-Id',
  required: true,
  description: 'Target organization UUID',
})
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('staff-tasks')
export class StaffTasksController {
  constructor(private readonly staffTasksService: StaffTasksService) {}

  @Post()
  @RequirePermissions('maintenance.create')
  @ApiOperation({ summary: 'Create a new housekeeping or staff task' })
  @ApiResponse({ status: 201, description: 'Staff task created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Property, floor, room or staff profile not found' })
  create(
    @Body() dto: CreateStaffTaskDto,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.staffTasksService.create(dto, rbac, ip);
  }

  @Get()
  @RequirePermissions('maintenance.read')
  @ApiOperation({ summary: 'List all staff tasks with pagination and filters' })
  @ApiResponse({ status: 200, description: 'List of staff tasks returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  findAll(
    @Query() query: StaffTaskQueryDto,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.staffTasksService.findAll(query, rbac);
  }

  @Get(':id')
  @RequirePermissions('maintenance.read')
  @ApiOperation({ summary: 'Get single staff task details' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Staff task details returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Staff task not found' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.staffTasksService.findOne(id, rbac);
  }

  @Get(':id/history')
  @RequirePermissions('maintenance.read')
  @ApiOperation({ summary: 'Get staff task status and action history' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Staff task history returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Staff task not found' })
  findHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.staffTasksService.findHistory(id, rbac);
  }

  @Patch(':id')
  @RequirePermissions('maintenance.close')
  @ApiOperation({ summary: 'Update staff task status, assignment, completion time, or notes' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Staff task updated successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Staff task not found' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStaffTaskDto,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.staffTasksService.update(id, dto, rbac, ip);
  }
}
