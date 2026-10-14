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
import { CreateStayDto } from './dto/create-stay.dto';
import { StayQueryDto } from './dto/stay-query.dto';
import { UpdateStayDto } from './dto/update-stay.dto';
import { ResidentStaysService } from './resident-stays.service';

@ApiTags('Resident Stays')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Organization-Id',
  required: true,
  description: 'Target organization UUID',
})
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('residents/:residentId/stays')
export class ResidentStaysController {
  constructor(private readonly residentStaysService: ResidentStaysService) {}

  @Post()
  @RequirePermissions('resident.create')
  @ApiOperation({ summary: 'Create a new stay for a resident (with bed hierarchy & occupancy validation)' })
  @ApiParam({ name: 'residentId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Stay created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error or missing headers' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Resident, Property, Floor, Room, or Bed not found' })
  @ApiResponse({ status: 409, description: 'Conflict - Bed is already occupied' })
  create(
    @Param('residentId', ParseUUIDPipe) residentId: string,
    @Body() dto: CreateStayDto,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.residentStaysService.create(residentId, dto, rbac, ip);
  }

  @Get()
  @RequirePermissions('resident.read')
  @ApiOperation({ summary: 'List all stays for a resident with pagination' })
  @ApiParam({ name: 'residentId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'List of stays returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Resident not found' })
  findAll(
    @Param('residentId', ParseUUIDPipe) residentId: string,
    @Query() query: StayQueryDto,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.residentStaysService.findAll(residentId, query, rbac);
  }

  @Get(':id')
  @RequirePermissions('resident.read')
  @ApiOperation({ summary: 'Get single stay details' })
  @ApiParam({ name: 'residentId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Stay details returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Stay or Resident not found' })
  findOne(
    @Param('residentId', ParseUUIDPipe) residentId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.residentStaysService.findOne(residentId, id, rbac);
  }

  @Patch(':id')
  @RequirePermissions('resident.update')
  @ApiOperation({ summary: 'Update stay details (e.g. check-out, notice, rent adjustments)' })
  @ApiParam({ name: 'residentId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Stay updated successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Stay or Resident not found' })
  update(
    @Param('residentId', ParseUUIDPipe) residentId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStayDto,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.residentStaysService.update(residentId, id, dto, rbac, ip);
  }
}
