import {
  Body,
  Controller,
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
import { CreateLeaveDto } from './dto/create-leave.dto';
import { LeaveQueryDto } from './dto/leave-query.dto';
import { RejectLeaveDto } from './dto/reject-leave.dto';
import { UpdateLeaveDto } from './dto/update-leave.dto';
import { LeavesService } from './leaves.service';

@ApiTags('Leave Management')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Organization-Id',
  required: true,
  description: 'Target organization UUID',
})
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('leaves')
export class LeavesController {
  constructor(private readonly leavesService: LeavesService) {}

  @Post()
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'Apply for resident leave' })
  @ApiResponse({ status: 201, description: 'Leave application created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error, invalid dates, or overlapping leave' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Resident or Property not found in organization' })
  create(
    @Body() dto: CreateLeaveDto,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.leavesService.create(dto, rbac, ip);
  }

  @Get()
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'List leave applications (Residents scoped strictly to own leaves)' })
  @ApiResponse({ status: 200, description: 'Paginated list of leave applications' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  findAll(
    @Query() query: LeaveQueryDto,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.leavesService.findAll(query, rbac);
  }

  @Get(':id')
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'Get leave application details by ID' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Leave application details returned' })
  @ApiResponse({ status: 400, description: 'Invalid UUID format' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Leave application not found' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.leavesService.findOne(id, rbac);
  }

  @Patch(':id')
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'Update pending leave application details' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Leave application updated successfully' })
  @ApiResponse({ status: 400, description: 'Validation error, invalid dates, or already processed' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Leave application not found' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeaveDto,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.leavesService.update(id, dto, rbac, ip);
  }

  @Post(':id/approve')
  @RequirePermissions('property.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve pending leave application (Administrative only)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Leave application approved successfully' })
  @ApiResponse({ status: 400, description: 'Already approved, rejected, or cancelled' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden (Residents cannot approve)' })
  @ApiResponse({ status: 404, description: 'Leave application not found' })
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.leavesService.approve(id, rbac, ip);
  }

  @Post(':id/reject')
  @RequirePermissions('property.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject pending leave application (Administrative only)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Leave application rejected successfully' })
  @ApiResponse({ status: 400, description: 'Already rejected, approved, or cancelled' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden (Residents cannot reject)' })
  @ApiResponse({ status: 404, description: 'Leave application not found' })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectLeaveDto,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.leavesService.reject(id, dto, rbac, ip);
  }

  @Post(':id/cancel')
  @RequirePermissions('property.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel pending leave application (Resident or Administrator)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Leave application cancelled successfully' })
  @ApiResponse({ status: 400, description: 'Cannot cancel processed leave or already cancelled' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Leave application not found' })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.leavesService.cancel(id, rbac, ip);
  }
}
