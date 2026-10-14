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
import { CreateMoveInDto } from './dto/create-move-in.dto';
import { MoveInQueryDto } from './dto/move-in-query.dto';
import { UpdateMoveInDto } from './dto/update-move-in.dto';
import { MoveInsService } from './move-ins.service';

@ApiTags('Move-Ins')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Organization-Id',
  required: true,
  description: 'Target organization UUID',
})
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('move-ins')
export class MoveInsController {
  constructor(private readonly moveInsService: MoveInsService) {}

  @Post()
  @RequirePermissions('resident.create')
  @ApiOperation({ summary: 'Execute resident move-in (occupies bed, creates stay contract, updates booking)' })
  @ApiResponse({ status: 201, description: 'Move-in completed successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed or invalid booking state' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Property, Resident, Bed, or Booking not found' })
  @ApiResponse({ status: 409, description: 'Conflict - Bed is already occupied or resident already has active stay' })
  create(
    @Body() dto: CreateMoveInDto,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.moveInsService.create(dto, rbac, ip);
  }

  @Get()
  @RequirePermissions('resident.read')
  @ApiOperation({ summary: 'List all move-in records with pagination and filters' })
  @ApiResponse({ status: 200, description: 'List of move-ins returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  findAll(
    @Query() query: MoveInQueryDto,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.moveInsService.findAll(query, rbac);
  }

  @Get(':id')
  @RequirePermissions('resident.read')
  @ApiOperation({ summary: 'Get single move-in details' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Move-in details returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Move-In record not found' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.moveInsService.findOne(id, rbac);
  }

  @Patch(':id')
  @RequirePermissions('resident.update')
  @ApiOperation({ summary: 'Update move-in record' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Move-in updated successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Move-in record not found' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMoveInDto,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.moveInsService.update(id, dto, rbac, ip);
  }

  @Delete(':id')
  @RequirePermissions('resident.delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel move-in record' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Move-in cancelled' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Move-In record not found' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.moveInsService.remove(id, rbac, ip);
  }
}
