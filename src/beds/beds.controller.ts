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
import { BedsService } from './beds.service';
import { BedQueryDto } from './dto/bed-query.dto';
import { CreateBedDto } from './dto/create-bed.dto';
import { UpdateBedDto } from './dto/update-bed.dto';

@ApiTags('Beds')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Organization-Id',
  required: true,
  description: 'Target organization UUID',
})
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('properties/:propertyId/floors/:floorId/rooms/:roomId/beds')
export class BedsController {
  constructor(private readonly bedsService: BedsService) {}

  @Post()
  @RequirePermissions('property.create')
  @ApiOperation({ summary: 'Create a new bed in a room' })
  @ApiParam({ name: 'propertyId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'floorId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'roomId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Bed successfully created' })
  @ApiResponse({ status: 400, description: 'Validation failed or missing headers' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Property, Floor, or Room not found' })
  @ApiResponse({ status: 409, description: 'Bed number conflict in this room' })
  create(
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Param('floorId', ParseUUIDPipe) floorId: string,
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Body() dto: CreateBedDto,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.bedsService.create(propertyId, floorId, roomId, dto, rbac, ip);
  }

  @Get()
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'List all beds in a room' })
  @ApiParam({ name: 'propertyId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'floorId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'roomId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'List of beds returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Property, Floor, or Room not found' })
  findAll(
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Param('floorId', ParseUUIDPipe) floorId: string,
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Query() query: BedQueryDto,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.bedsService.findAll(propertyId, floorId, roomId, query, rbac);
  }

  @Get(':id')
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'Get single bed details' })
  @ApiParam({ name: 'propertyId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'floorId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'roomId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Bed details returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Bed, Room, Floor, or Property not found' })
  findOne(
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Param('floorId', ParseUUIDPipe) floorId: string,
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.bedsService.findOne(propertyId, floorId, roomId, id, rbac);
  }

  @Patch(':id')
  @RequirePermissions('property.update')
  @ApiOperation({ summary: 'Update bed details' })
  @ApiParam({ name: 'propertyId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'floorId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'roomId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Bed updated successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Bed, Room, Floor, or Property not found' })
  @ApiResponse({ status: 409, description: 'Bed number conflict' })
  update(
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Param('floorId', ParseUUIDPipe) floorId: string,
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBedDto,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.bedsService.update(propertyId, floorId, roomId, id, dto, rbac, ip);
  }

  @Delete(':id')
  @RequirePermissions('property.delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft delete bed' })
  @ApiParam({ name: 'propertyId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'floorId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'roomId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Bed deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Bed, Room, Floor, or Property not found' })
  remove(
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Param('floorId', ParseUUIDPipe) floorId: string,
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.bedsService.remove(propertyId, floorId, roomId, id, rbac, ip);
  }
}
