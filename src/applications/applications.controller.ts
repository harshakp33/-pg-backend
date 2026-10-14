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
import { ApplicationsService } from './applications.service';
import { ApplicationQueryDto } from './dto/application-query.dto';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';

@ApiTags('Applications')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Organization-Id',
  required: true,
  description: 'Target organization UUID',
})
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post()
  @RequirePermissions('resident.create')
  @ApiOperation({ summary: 'Create a new prospective tenant application / enquiry' })
  @ApiResponse({ status: 201, description: 'Application created successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Property not found' })
  create(
    @Body() dto: CreateApplicationDto,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.applicationsService.create(dto, rbac, ip);
  }

  @Get()
  @RequirePermissions('resident.read')
  @ApiOperation({ summary: 'List all applications with pagination and filters' })
  @ApiResponse({ status: 200, description: 'List of applications returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  findAll(
    @Query() query: ApplicationQueryDto,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.applicationsService.findAll(query, rbac);
  }

  @Get(':id')
  @RequirePermissions('resident.read')
  @ApiOperation({ summary: 'Get single application details' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Application details returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Application not found' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.applicationsService.findOne(id, rbac);
  }

  @Patch(':id')
  @RequirePermissions('resident.update')
  @ApiOperation({ summary: 'Update application details or lifecycle status' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Application updated successfully' })
  @ApiResponse({ status: 400, description: 'Validation error or invalid status transition' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Application not found' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateApplicationDto,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.applicationsService.update(id, dto, rbac, ip);
  }

  @Delete(':id')
  @RequirePermissions('resident.delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft delete application' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Application soft deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Application not found' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.applicationsService.remove(id, rbac, ip);
  }
}
