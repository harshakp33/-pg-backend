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
import { CreateVisitorDto } from './dto/create-visitor.dto';
import { UpdateVisitorDto } from './dto/update-visitor.dto';
import { VisitorQueryDto } from './dto/visitor-query.dto';
import { VisitorsService } from './visitors.service';

@ApiTags('Visitors & Security')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Organization-Id',
  required: true,
  description: 'Target organization UUID',
})
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('visitors')
export class VisitorsController {
  constructor(private readonly visitorsService: VisitorsService) {}

  @Post()
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'Register a visitor or pre-register an expected visitor' })
  @ApiResponse({ status: 201, description: 'Visitor created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error or missing required field' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Resident or Property not found in organization' })
  create(
    @Body() dto: CreateVisitorDto,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.visitorsService.create(dto, rbac, ip);
  }

  @Get()
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'List visitors with pagination and filters (Residents scoped to own visitors)' })
  @ApiResponse({ status: 200, description: 'List of visitors returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  findAll(
    @Query() query: VisitorQueryDto,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.visitorsService.findAll(query, rbac);
  }

  @Get(':id')
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'Get visitor details by ID' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Visitor details returned' })
  @ApiResponse({ status: 400, description: 'Invalid UUID' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Visitor not found' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.visitorsService.findOne(id, rbac);
  }

  @Patch(':id')
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'Update visitor information' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Visitor updated successfully' })
  @ApiResponse({ status: 400, description: 'Validation error or invalid UUID' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Visitor not found' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVisitorDto,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.visitorsService.update(id, dto, rbac, ip);
  }

  @Post(':id/check-in')
  @RequirePermissions('property.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check in visitor (records entry timestamp and marks CHECKED_IN)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Visitor checked in successfully' })
  @ApiResponse({ status: 400, description: 'Visitor already checked in or checked out' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Visitor not found' })
  checkIn(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.visitorsService.checkIn(id, rbac, ip);
  }

  @Post(':id/check-out')
  @RequirePermissions('property.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check out visitor (records exit timestamp and marks CHECKED_OUT)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Visitor checked out successfully' })
  @ApiResponse({ status: 400, description: 'Visitor not checked in or already checked out' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Visitor not found' })
  checkOut(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.visitorsService.checkOut(id, rbac, ip);
  }

  @Delete(':id')
  @RequirePermissions('property.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete visitor record' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Visitor deleted successfully' })
  @ApiResponse({ status: 400, description: 'Invalid UUID' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Visitor not found' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.visitorsService.remove(id, rbac, ip);
  }
}
