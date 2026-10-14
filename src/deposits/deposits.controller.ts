import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import { DepositsService } from './deposits.service';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { DepositQueryDto } from './dto/deposit-query.dto';

@ApiTags('Deposits')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Organization-Id',
  required: true,
  description: 'Target organization UUID',
})
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('deposits')
export class DepositsController {
  constructor(private readonly depositsService: DepositsService) {}

  @Post()
  @RequirePermissions('finance.create')
  @ApiOperation({ summary: 'Record deposit collection, refund or deduction atomically' })
  @ApiResponse({ status: 201, description: 'Deposit transaction recorded' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Property or Resident not found' })
  @ApiResponse({ status: 409, description: 'Conflict - Refund/deduction exceeds deposit balance' })
  create(
    @Body() dto: CreateDepositDto,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.depositsService.create(dto, rbac, ip);
  }

  @Get()
  @RequirePermissions('finance.read')
  @ApiOperation({ summary: 'List deposit transactions with pagination and filters' })
  @ApiResponse({ status: 200, description: 'List of deposits returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  findAll(
    @Query() query: DepositQueryDto,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.depositsService.findAll(query, rbac);
  }

  @Get(':id')
  @RequirePermissions('finance.read')
  @ApiOperation({ summary: 'Get single deposit transaction details' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Deposit transaction details returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Deposit transaction not found' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.depositsService.findOne(id, rbac);
  }
}
