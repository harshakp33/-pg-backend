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
import { CreateRoomDto } from './dto/create-room.dto';
import { RoomQueryDto } from './dto/room-query.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { RoomsService } from './rooms.service';

@ApiTags('Rooms')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Organization-Id',
  required: true,
  description: 'Target organization UUID',
})
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('properties/:propertyId/floors/:floorId/rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Post()
  @RequirePermissions('property.create')
  @ApiOperation({ summary: 'Create a new room on a floor' })
  @ApiParam({ name: 'propertyId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'floorId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Room successfully created' })
  @ApiResponse({ status: 400, description: 'Validation failed or missing headers' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Property or Floor not found' })
  @ApiResponse({ status: 409, description: 'Room number conflict on this floor' })
  create(
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Param('floorId', ParseUUIDPipe) floorId: string,
    @Body() dto: CreateRoomDto,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.roomsService.create(propertyId, floorId, dto, rbac, ip);
  }

  @Get()
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'List all rooms on a floor' })
  @ApiParam({ name: 'propertyId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'floorId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'List of rooms returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Property or Floor not found' })
  findAll(
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Param('floorId', ParseUUIDPipe) floorId: string,
    @Query() query: RoomQueryDto,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.roomsService.findAll(propertyId, floorId, query, rbac);
  }

  @Get(':id')
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'Get single room details' })
  @ApiParam({ name: 'propertyId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'floorId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Room details returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Room, Floor, or Property not found' })
  findOne(
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Param('floorId', ParseUUIDPipe) floorId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.roomsService.findOne(propertyId, floorId, id, rbac);
  }

  @Patch(':id')
  @RequirePermissions('property.update')
  @ApiOperation({ summary: 'Update room details' })
  @ApiParam({ name: 'propertyId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'floorId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Room updated successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Room, Floor, or Property not found' })
  @ApiResponse({ status: 409, description: 'Room number conflict' })
  update(
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Param('floorId', ParseUUIDPipe) floorId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoomDto,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.roomsService.update(propertyId, floorId, id, dto, rbac, ip);
  }

  @Delete(':id')
  @RequirePermissions('property.delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft delete room and its beds' })
  @ApiParam({ name: 'propertyId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'floorId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Room deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Room, Floor, or Property not found' })
  remove(
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Param('floorId', ParseUUIDPipe) floorId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.roomsService.remove(propertyId, floorId, id, rbac, ip);
  }
}
