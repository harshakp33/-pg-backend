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
import { CreateRentPlanDto } from './dto/create-rent-plan.dto';
import { RentPlanQueryDto } from './dto/rent-plan-query.dto';
import { UpdateRentPlanDto } from './dto/update-rent-plan.dto';
import { RentPlansService } from './rent-plans.service';

@ApiTags('Rent Plans')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Organization-Id',
  required: true,
  description: 'Target organization UUID',
})
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('rent-plans')
export class RentPlansController {
  constructor(private readonly rentPlansService: RentPlansService) {}

  @Post()
  @RequirePermissions('finance.create')
  @ApiOperation({ summary: 'Create a new rent plan template' })
  @ApiResponse({ status: 201, description: 'Rent plan created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  create(
    @Body() dto: CreateRentPlanDto,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.rentPlansService.create(dto, rbac, ip);
  }

  @Get()
  @RequirePermissions('finance.read')
  @ApiOperation({ summary: 'List rent plans with pagination and filters' })
  @ApiResponse({ status: 200, description: 'List of rent plans returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  findAll(
    @Query() query: RentPlanQueryDto,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.rentPlansService.findAll(query, rbac);
  }

  @Get(':id')
  @RequirePermissions('finance.read')
  @ApiOperation({ summary: 'Get single rent plan details' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Rent plan details returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Rent plan not found' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.rentPlansService.findOne(id, rbac);
  }

  @Patch(':id')
  @RequirePermissions('finance.update')
  @ApiOperation({ summary: 'Update rent plan details' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Rent plan updated successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Rent plan not found' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRentPlanDto,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.rentPlansService.update(id, dto, rbac, ip);
  }

  @Delete(':id')
  @RequirePermissions('finance.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate a rent plan' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Rent plan deactivated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Rent plan not found' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.rentPlansService.remove(id, rbac, ip);
  }
}
