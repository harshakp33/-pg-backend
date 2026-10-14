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
import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import { CurrentRbac } from '../rbac/decorators/current-rbac.decorator';
import { RbacContext } from '../rbac/types/rbac.types';
import { PropertiesService } from './properties.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { PropertyQueryDto } from './dto/property-query.dto';

@ApiTags('Properties')
@ApiBearerAuth('bearer')
@ApiHeader({
  name: 'X-Organization-Id',
  description: 'Active Organization UUID',
  required: true,
})
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('properties')
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @Post()
  @RequirePermissions('property.create')
  @ApiOperation({ summary: 'Create a new property within the active organization' })
  @ApiResponse({ status: 201, description: 'Property created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error or missing organization header' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden: Insufficient permissions or non-member' })
  @ApiResponse({ status: 409, description: 'Conflict: Property code already exists in organization' })
  create(
    @Body() dto: CreatePropertyDto,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || (req.headers['x-forwarded-for'] as string);
    return this.propertiesService.create(dto, rbac, ip);
  }

  @Get()
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'List properties for the active organization with pagination & filtering' })
  @ApiResponse({ status: 200, description: 'Paginated list of properties' })
  @ApiResponse({ status: 400, description: 'Validation error or missing organization header' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden: Insufficient permissions or non-member' })
  findAll(
    @Query() query: PropertyQueryDto,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.propertiesService.findAll(query, rbac);
  }

  
  @Get(':id/structure')
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'Get full nested property structure (Property -> Floors -> Rooms -> Beds)' })
  @ApiParam({ name: 'id', description: 'Property UUID' })
  @ApiResponse({ status: 200, description: 'Nested property structure returned' })
  @ApiResponse({ status: 400, description: 'Invalid UUID format or missing organization header' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden: Insufficient permissions or non-member' })
  @ApiResponse({ status: 404, description: 'Property not found in current organization' })
  getStructure(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.propertiesService.getStructure(id, rbac);
  }

  @Get(':id')
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'Get single property details by ID (organization-scoped)' })
  @ApiParam({ name: 'id', description: 'Property UUID' })
  @ApiResponse({ status: 200, description: 'Property details' })
  @ApiResponse({ status: 400, description: 'Invalid UUID format or missing organization header' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden: Insufficient permissions or non-member' })
  @ApiResponse({ status: 404, description: 'Property not found in current organization' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.propertiesService.findOne(id, rbac);
  }

  @Patch(':id')
  @RequirePermissions('property.update')
  @ApiOperation({ summary: 'Update property details (organization-scoped)' })
  @ApiParam({ name: 'id', description: 'Property UUID' })
  @ApiResponse({ status: 200, description: 'Property updated successfully' })
  @ApiResponse({ status: 400, description: 'Validation error or missing organization header' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden: Insufficient permissions or non-member' })
  @ApiResponse({ status: 404, description: 'Property not found in current organization' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePropertyDto,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || (req.headers['x-forwarded-for'] as string);
    return this.propertiesService.update(id, dto, rbac, ip);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('property.delete')
  @ApiOperation({ summary: 'Soft delete a property (organization-scoped)' })
  @ApiParam({ name: 'id', description: 'Property UUID' })
  @ApiResponse({ status: 200, description: 'Property soft deleted successfully' })
  @ApiResponse({ status: 400, description: 'Invalid UUID format or missing organization header' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden: Insufficient permissions or non-member' })
  @ApiResponse({ status: 404, description: 'Property not found in current organization' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || (req.headers['x-forwarded-for'] as string);
    return this.propertiesService.remove(id, rbac, ip);
  }
}
