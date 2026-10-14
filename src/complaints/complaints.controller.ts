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
import { ComplaintsService } from './complaints.service';
import { ComplaintQueryDto } from './dto/complaint-query.dto';
import { CreateComplaintDto } from './dto/create-complaint.dto';
import { UpdateComplaintDto } from './dto/update-complaint.dto';

@ApiTags('Complaints')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Organization-Id',
  required: true,
  description: 'Target organization UUID',
})
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('complaints')
export class ComplaintsController {
  constructor(private readonly complaintsService: ComplaintsService) {}

  @Post()
  @RequirePermissions('maintenance.create')
  @ApiOperation({ summary: 'Create a new complaint' })
  @ApiResponse({ status: 201, description: 'Complaint created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Property or resident not found' })
  create(
    @Body() dto: CreateComplaintDto,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.complaintsService.create(dto, rbac, ip);
  }

  @Get()
  @RequirePermissions('maintenance.read')
  @ApiOperation({ summary: 'List all complaints with pagination and filters' })
  @ApiResponse({ status: 200, description: 'List of complaints returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  findAll(
    @Query() query: ComplaintQueryDto,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.complaintsService.findAll(query, rbac);
  }

  @Get(':id')
  @RequirePermissions('maintenance.read')
  @ApiOperation({ summary: 'Get single complaint details' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Complaint details returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Complaint not found' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.complaintsService.findOne(id, rbac);
  }

  @Get(':id/history')
  @RequirePermissions('maintenance.read')
  @ApiOperation({ summary: 'Get complaint status and audit history' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Complaint history returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Complaint not found' })
  findHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.complaintsService.findHistory(id, rbac);
  }

  @Patch(':id')
  @RequirePermissions('maintenance.close')
  @ApiOperation({ summary: 'Update complaint status, assignment, or notes' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Complaint updated successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Complaint not found' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateComplaintDto,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.complaintsService.update(id, dto, rbac, ip);
  }
}
