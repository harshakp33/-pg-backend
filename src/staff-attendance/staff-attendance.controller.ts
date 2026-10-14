import {
  Body,
  Controller,
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
import { AttendanceQueryDto } from './dto/attendance-query.dto';
import { StaffCheckInDto } from './dto/check-in.dto';
import { StaffCheckOutDto } from './dto/check-out.dto';
import { RecordAttendanceDto } from './dto/record-attendance.dto';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';
import { StaffAttendanceService } from './staff-attendance.service';

@ApiTags('Staff Attendance')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Organization-Id',
  required: true,
  description: 'Target organization UUID',
})
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('staff-attendance')
export class StaffAttendanceController {
  constructor(private readonly attendanceService: StaffAttendanceService) {}

  @Post('check-in')
  @RequirePermissions('property.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record staff attendance check-in' })
  @ApiResponse({ status: 200, description: 'Check-in recorded successfully' })
  @ApiResponse({ status: 400, description: 'Validation error or invalid status' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Staff profile not found' })
  @ApiResponse({ status: 409, description: 'Conflict - Staff already checked in for today' })
  checkIn(
    @Body() dto: StaffCheckInDto,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.attendanceService.checkIn(dto, rbac, ip);
  }

  @Post('check-out')
  @RequirePermissions('property.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record staff attendance check-out' })
  @ApiResponse({ status: 200, description: 'Check-out recorded successfully' })
  @ApiResponse({ status: 400, description: 'Validation error, no check-in, or already checked out' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Staff profile not found' })
  checkOut(
    @Body() dto: StaffCheckOutDto,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.attendanceService.checkOut(dto, rbac, ip);
  }

  @Post()
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'Record manual staff attendance entry (Admin only)' })
  @ApiResponse({ status: 201, description: 'Attendance record created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 403, description: 'Forbidden - Owner or Manager required' })
  @ApiResponse({ status: 404, description: 'Staff profile not found' })
  @ApiResponse({ status: 409, description: 'Attendance already recorded for this date' })
  recordAttendance(
    @Body() dto: RecordAttendanceDto,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.attendanceService.recordAttendance(dto, rbac, ip);
  }

  @Get()
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'List staff attendance records with filters and pagination' })
  @ApiResponse({ status: 200, description: 'Attendance list returned' })
  @ApiResponse({ status: 403, description: 'Forbidden for residents' })
  findAll(
    @Query() query: AttendanceQueryDto,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.attendanceService.findAll(query, rbac);
  }

  @Get(':id')
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'Get staff attendance record details by UUID' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Attendance record details returned' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Attendance record not found' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.attendanceService.findOne(id, rbac);
  }

  @Patch(':id')
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'Update staff attendance record (Admin only)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Attendance record updated successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 403, description: 'Forbidden - Owner or Manager required' })
  @ApiResponse({ status: 404, description: 'Attendance record not found' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAttendanceDto,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.attendanceService.update(id, dto, rbac, ip);
  }
}
