import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentRbac } from '../rbac/decorators/current-rbac.decorator';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RbacContext } from '../rbac/types/rbac.types';
import { ExpenseReportQueryDto } from './dto/expense-report-query.dto';
import { OccupancyReportQueryDto } from './dto/occupancy-report-query.dto';
import { ReportDateQueryDto } from './dto/report-date-query.dto';
import { ReportPaginationDto } from './dto/report-pagination.dto';
import { ResidentReportQueryDto } from './dto/resident-report-query.dto';
import { RevenueReportQueryDto } from './dto/revenue-report-query.dto';
import { ReportsService } from './reports.service';

@ApiTags('Reports')
@ApiBearerAuth('bearer')
@ApiHeader({
  name: 'X-Organization-Id',
  required: true,
  description: 'Target organization UUID',
})
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('dashboard')
  @RequirePermissions('reports.read')
  @ApiOperation({ summary: 'Get high-level executive dashboard summary metrics' })
  @ApiResponse({ status: 200, description: 'Dashboard metrics retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Bad request or validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden: Insufficient permissions' })
  async getDashboard(
    @CurrentRbac() rbac: RbacContext,
    @Query() query: ReportDateQueryDto,
  ) {
    return this.reportsService.getDashboard(rbac, query);
  }

  @Get('occupancy')
  @RequirePermissions('reports.read')
  @ApiOperation({ summary: 'Get detailed bed and room occupancy analytics' })
  @ApiResponse({ status: 200, description: 'Occupancy report retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Bad request or validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden: Insufficient permissions' })
  async getOccupancy(
    @CurrentRbac() rbac: RbacContext,
    @Query() query: OccupancyReportQueryDto,
  ) {
    return this.reportsService.getOccupancy(rbac, query);
  }

  @Get('properties')
  @RequirePermissions('reports.read')
  @ApiOperation({ summary: 'Get property-wise operational and financial breakdown' })
  @ApiResponse({ status: 200, description: 'Properties report retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Bad request or validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden: Insufficient permissions' })
  async getProperties(
    @CurrentRbac() rbac: RbacContext,
    @Query() query: ReportPaginationDto,
  ) {
    return this.reportsService.getProperties(rbac, query);
  }

  @Get('revenue')
  @RequirePermissions('reports.read')
  @ApiOperation({ summary: 'Get revenue, invoiced, collected, and outstanding trend report' })
  @ApiResponse({ status: 200, description: 'Revenue report retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Bad request or validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden: Insufficient permissions' })
  async getRevenue(
    @CurrentRbac() rbac: RbacContext,
    @Query() query: RevenueReportQueryDto,
  ) {
    return this.reportsService.getRevenue(rbac, query);
  }

  @Get('collections')
  @RequirePermissions('reports.read')
  @ApiOperation({ summary: 'Get payment collection breakdown and payment-method distribution' })
  @ApiResponse({ status: 200, description: 'Collections report retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Bad request or validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden: Insufficient permissions' })
  async getCollections(
    @CurrentRbac() rbac: RbacContext,
    @Query() query: RevenueReportQueryDto,
  ) {
    return this.reportsService.getCollections(rbac, query);
  }

  @Get('outstanding')
  @RequirePermissions('reports.read')
  @ApiOperation({ summary: 'Get outstanding receivables and aging breakdown report' })
  @ApiResponse({ status: 200, description: 'Outstanding report retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Bad request or validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden: Insufficient permissions' })
  async getOutstanding(
    @CurrentRbac() rbac: RbacContext,
    @Query() query: ReportPaginationDto,
  ) {
    return this.reportsService.getOutstanding(rbac, query);
  }

  @Get('expenses')
  @RequirePermissions('reports.read')
  @ApiOperation({ summary: 'Get expenses report covering general and food operational expenditures' })
  @ApiResponse({ status: 200, description: 'Expense report retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Bad request or validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden: Insufficient permissions' })
  async getExpenses(
    @CurrentRbac() rbac: RbacContext,
    @Query() query: ExpenseReportQueryDto,
  ) {
    return this.reportsService.getExpenses(rbac, query);
  }

  @Get('residents')
  @RequirePermissions('reports.read')
  @ApiOperation({ summary: 'Get resident demographics and status breakdown report' })
  @ApiResponse({ status: 200, description: 'Resident report retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Bad request or validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden: Insufficient permissions' })
  async getResidents(
    @CurrentRbac() rbac: RbacContext,
    @Query() query: ResidentReportQueryDto,
  ) {
    return this.reportsService.getResidents(rbac, query);
  }

  @Get('bookings')
  @RequirePermissions('reports.read')
  @ApiOperation({ summary: 'Get booking funnel, enquiry conversion, and application analytics' })
  @ApiResponse({ status: 200, description: 'Booking report retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Bad request or validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden: Insufficient permissions' })
  async getBookings(
    @CurrentRbac() rbac: RbacContext,
    @Query() query: ReportDateQueryDto,
  ) {
    return this.reportsService.getBookings(rbac, query);
  }

  @Get('operations')
  @RequirePermissions('reports.read')
  @ApiOperation({ summary: 'Get operational metrics: complaints, maintenance tickets, and staff tasks' })
  @ApiResponse({ status: 200, description: 'Operations report retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Bad request or validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden: Insufficient permissions' })
  async getOperations(
    @CurrentRbac() rbac: RbacContext,
    @Query() query: ReportDateQueryDto,
  ) {
    return this.reportsService.getOperations(rbac, query);
  }

  @Get('staff')
  @RequirePermissions('reports.read')
  @ApiOperation({ summary: 'Get staff workforce and attendance metrics report' })
  @ApiResponse({ status: 200, description: 'Staff report retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Bad request or validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden: Insufficient permissions' })
  async getStaff(
    @CurrentRbac() rbac: RbacContext,
    @Query() query: ReportDateQueryDto,
  ) {
    return this.reportsService.getStaff(rbac, query);
  }

  @Get('food')
  @RequirePermissions('reports.read')
  @ApiOperation({ summary: 'Get food, mess attendance, consumption, and kitchen inventory report' })
  @ApiResponse({ status: 200, description: 'Food report retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Bad request or validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden: Insufficient permissions' })
  async getFood(
    @CurrentRbac() rbac: RbacContext,
    @Query() query: ReportDateQueryDto,
  ) {
    return this.reportsService.getFood(rbac, query);
  }

  @Get('visitors')
  @RequirePermissions('reports.read')
  @ApiOperation({ summary: 'Get visitor traffic, purpose, and check-in activity report' })
  @ApiResponse({ status: 200, description: 'Visitor report retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Bad request or validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden: Insufficient permissions' })
  async getVisitors(
    @CurrentRbac() rbac: RbacContext,
    @Query() query: ReportDateQueryDto,
  ) {
    return this.reportsService.getVisitors(rbac, query);
  }

  @Get('leaves')
  @RequirePermissions('reports.read')
  @ApiOperation({ summary: 'Get resident leave request and status breakdown report' })
  @ApiResponse({ status: 200, description: 'Leave report retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Bad request or validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden: Insufficient permissions' })
  async getLeaves(
    @CurrentRbac() rbac: RbacContext,
    @Query() query: ReportDateQueryDto,
  ) {
    return this.reportsService.getLeaves(rbac, query);
  }
}
