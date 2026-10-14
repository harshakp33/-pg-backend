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
import { CreateResidentDocumentDto } from './dto/create-resident-document.dto';
import { ResidentDocumentQueryDto } from './dto/resident-document-query.dto';
import { UpdateResidentDocumentDto } from './dto/update-resident-document.dto';
import { ResidentDocumentsService } from './resident-documents.service';

@ApiTags('Resident Documents')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Organization-Id',
  required: true,
  description: 'Target organization UUID',
})
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('residents/:residentId/documents')
export class ResidentDocumentsController {
  constructor(private readonly residentDocumentsService: ResidentDocumentsService) {}

  @Post()
  @RequirePermissions('resident.create')
  @ApiOperation({ summary: 'Upload / create a resident verification KYC document' })
  @ApiParam({ name: 'residentId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Document created successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Resident not found' })
  create(
    @Param('residentId', ParseUUIDPipe) residentId: string,
    @Body() dto: CreateResidentDocumentDto,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.residentDocumentsService.create(residentId, dto, rbac, ip);
  }

  @Get()
  @RequirePermissions('resident.read')
  @ApiOperation({ summary: 'List all verification documents for a resident' })
  @ApiParam({ name: 'residentId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'List of documents returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Resident not found' })
  findAll(
    @Param('residentId', ParseUUIDPipe) residentId: string,
    @Query() query: ResidentDocumentQueryDto,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.residentDocumentsService.findAll(residentId, query, rbac);
  }

  @Get(':id')
  @RequirePermissions('resident.read')
  @ApiOperation({ summary: 'Get single resident document details' })
  @ApiParam({ name: 'residentId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Document details returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Document or Resident not found' })
  findOne(
    @Param('residentId', ParseUUIDPipe) residentId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.residentDocumentsService.findOne(residentId, id, rbac);
  }

  @Patch(':id')
  @RequirePermissions('resident.update')
  @ApiOperation({ summary: 'Update resident document (e.g. mark VERIFIED / REJECTED)' })
  @ApiParam({ name: 'residentId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Document updated successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Document or Resident not found' })
  update(
    @Param('residentId', ParseUUIDPipe) residentId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateResidentDocumentDto,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.residentDocumentsService.update(residentId, id, dto, rbac, ip);
  }

  @Delete(':id')
  @RequirePermissions('resident.delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete resident document' })
  @ApiParam({ name: 'residentId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Document deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Document or Resident not found' })
  remove(
    @Param('residentId', ParseUUIDPipe) residentId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.residentDocumentsService.remove(residentId, id, rbac, ip);
  }
}
