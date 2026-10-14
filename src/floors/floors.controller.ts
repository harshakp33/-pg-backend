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
import { CreateFloorDto } from './dto/create-floor.dto';
import { FloorQueryDto } from './dto/floor-query.dto';
import { UpdateFloorDto } from './dto/update-floor.dto';
import { FloorsService } from './floors.service';

@ApiTags('Floors')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Organization-Id',
  required: true,
  description: 'Target organization UUID',
})
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('properties/:propertyId/floors')
export class FloorsController {
  constructor(private readonly floorsService: FloorsService) {}

  @Post()
  @RequirePermissions('property.create')
  @ApiOperation({ summary: 'Create a new floor under property' })
  @ApiParam({ name: 'propertyId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Floor successfully created' })
  @ApiResponse({ status: 400, description: 'Validation failed or missing headers' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Property not found' })
  @ApiResponse({ status: 409, description: 'Floor number conflict' })
  create(
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Body() dto: CreateFloorDto,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.floorsService.create(propertyId, dto, rbac, ip);
  }

  @Get()
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'List all floors under property' })
  @ApiParam({ name: 'propertyId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'List of floors returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Property not found' })
  findAll(
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Query() query: FloorQueryDto,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.floorsService.findAll(propertyId, query, rbac);
  }

  @Get(':id')
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'Get single floor details' })
  @ApiParam({ name: 'propertyId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Floor details returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Floor or Property not found' })
  findOne(
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.floorsService.findOne(propertyId, id, rbac);
  }

  @Patch(':id')
  @RequirePermissions('property.update')
  @ApiOperation({ summary: 'Update floor details' })
  @ApiParam({ name: 'propertyId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Floor updated successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Floor or Property not found' })
  @ApiResponse({ status: 409, description: 'Floor number conflict' })
  update(
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFloorDto,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.floorsService.update(propertyId, id, dto, rbac, ip);
  }

  @Delete(':id')
  @RequirePermissions('property.delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft delete floor and its rooms/beds' })
  @ApiParam({ name: 'propertyId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Floor deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Floor or Property not found' })
  remove(
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.floorsService.remove(propertyId, id, rbac, ip);
  }
}
