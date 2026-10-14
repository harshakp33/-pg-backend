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
import { CreatePortalComplaintDto } from './dto/create-portal-complaint.dto';
import { CreatePortalLeaveDto } from './dto/create-portal-leave.dto';
import { CreatePortalMaintenanceDto } from './dto/create-portal-maintenance.dto';
import { PortalPaginationDto } from './dto/portal-pagination.dto';
import { UpdateResidentProfileDto } from './dto/update-resident-profile.dto';
import { PortalService } from './portal.service';

@ApiTags('Resident Portal')
@ApiBearerAuth('bearer')
@ApiHeader({
  name: 'X-Organization-Id',
  required: true,
  description: 'Target organization UUID',
})
@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermissions('property.read')
@Controller('portal')
export class PortalController {
  constructor(private readonly portalService: PortalService) {}

  private getClientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    return req.ip || '';
  }

  // ====================================================
  // R. CONSOLIDATED RESIDENT DASHBOARD
  // ====================================================
  @Get('dashboard')
  @ApiOperation({ summary: 'Get consolidated resident dashboard overview' })
  @ApiResponse({ status: 200, description: 'Dashboard data retrieved successfully' })
  async getDashboard(@CurrentRbac() rbac: RbacContext) {
    return this.portalService.getDashboard(rbac);
  }

  // ====================================================
  // B. RESIDENT PROFILE
  // ====================================================
  @Get('profile')
  @ApiOperation({ summary: 'Get authenticated resident safe profile' })
  @ApiResponse({ status: 200, description: 'Resident profile retrieved successfully' })
  async getProfile(@CurrentRbac() rbac: RbacContext) {
    return this.portalService.getProfile(rbac);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update resident self-service profile fields' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed or unpermitted fields' })
  async updateProfile(
    @CurrentRbac() rbac: RbacContext,
    @Body() dto: UpdateResidentProfileDto,
    @Req() req: Request,
  ) {
    return this.portalService.updateProfile(dto, rbac, this.getClientIp(req));
  }

  // ====================================================
  // C. CURRENT STAY
  // ====================================================
  @Get('stay')
  @ApiOperation({ summary: 'Get authenticated resident current active stay' })
  @ApiResponse({ status: 200, description: 'Active stay details retrieved successfully' })
  @ApiResponse({ status: 404, description: 'No active stay found for resident' })
  async getStay(@CurrentRbac() rbac: RbacContext) {
    return this.portalService.getStay(rbac);
  }

  // ====================================================
  // D. ACCOMMODATION (ROOM / BED / PROPERTY)
  // ====================================================
  @Get('accommodation')
  @ApiOperation({ summary: 'Get current property, floor, room, and bed information' })
  @ApiResponse({ status: 200, description: 'Accommodation details retrieved successfully' })
  async getAccommodation(@CurrentRbac() rbac: RbacContext) {
    return this.portalService.getAccommodation(rbac);
  }

  // ====================================================
  // E & F. INVOICES
  // ====================================================
  @Get('invoices')
  @ApiOperation({ summary: 'List invoices belonging to authenticated resident' })
  @ApiResponse({ status: 200, description: 'Invoices list retrieved successfully' })
  async getInvoices(
    @CurrentRbac() rbac: RbacContext,
    @Query() query: PortalPaginationDto,
  ) {
    return this.portalService.getInvoices(query, rbac);
  }

  @Get('invoices/:invoiceId')
  @ApiOperation({ summary: 'Get specific invoice details for authenticated resident' })
  @ApiParam({ name: 'invoiceId', description: 'Invoice UUID' })
  @ApiResponse({ status: 200, description: 'Invoice details retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Invoice not found or unauthorized' })
  async getInvoiceById(
    @CurrentRbac() rbac: RbacContext,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
  ) {
    return this.portalService.getInvoiceById(invoiceId, rbac);
  }

  // ====================================================
  // G. PAYMENTS
  // ====================================================
  @Get('payments')
  @ApiOperation({ summary: 'List payment transactions belonging to authenticated resident' })
  @ApiResponse({ status: 200, description: 'Payments list retrieved successfully' })
  async getPayments(
    @CurrentRbac() rbac: RbacContext,
    @Query() query: PortalPaginationDto,
  ) {
    return this.portalService.getPayments(query, rbac);
  }

  @Get('payments/:paymentId')
  @ApiOperation({ summary: 'Get specific payment receipt for authenticated resident' })
  @ApiParam({ name: 'paymentId', description: 'Payment UUID' })
  @ApiResponse({ status: 200, description: 'Payment details retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Payment not found or unauthorized' })
  async getPaymentById(
    @CurrentRbac() rbac: RbacContext,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
  ) {
    return this.portalService.getPaymentById(paymentId, rbac);
  }

  // ====================================================
  // H. DEPOSIT
  // ====================================================
  @Get('deposit')
  @ApiOperation({ summary: 'Get security deposit balance and transaction history' })
  @ApiResponse({ status: 200, description: 'Deposit summary retrieved successfully' })
  async getDepositInfo(@CurrentRbac() rbac: RbacContext) {
    return this.portalService.getDepositInfo(rbac);
  }

  // ====================================================
  // I. NOTICES
  // ====================================================
  @Get('notices')
  @ApiOperation({ summary: 'List notices eligible for the authenticated resident' })
  @ApiResponse({ status: 200, description: 'Notices list retrieved successfully' })
  async getNotices(
    @CurrentRbac() rbac: RbacContext,
    @Query() query: PortalPaginationDto,
  ) {
    return this.portalService.getNotices(query, rbac);
  }

  // ====================================================
  // J. NOTIFICATIONS
  // ====================================================
  @Get('notifications')
  @ApiOperation({ summary: 'List notifications for the authenticated user' })
  @ApiResponse({ status: 200, description: 'Notifications list retrieved successfully' })
  async getNotifications(
    @CurrentRbac() rbac: RbacContext,
    @Query() query: PortalPaginationDto,
  ) {
    return this.portalService.getNotifications(query, rbac);
  }

  @Get('notifications/unread-count')
  @ApiOperation({ summary: 'Get count of unread notifications' })
  @ApiResponse({ status: 200, description: 'Unread count retrieved successfully' })
  async getUnreadNotificationsCount(@CurrentRbac() rbac: RbacContext) {
    return this.portalService.getUnreadNotificationsCount(rbac);
  }

  @Patch('notifications/:id/read')
  @ApiOperation({ summary: 'Mark specific notification as read' })
  @ApiParam({ name: 'id', description: 'Notification UUID' })
  @ApiResponse({ status: 200, description: 'Notification marked as read' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  async markNotificationAsRead(
    @CurrentRbac() rbac: RbacContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.portalService.markNotificationAsRead(id, rbac, this.getClientIp(req));
  }

  @Post('notifications/read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all notifications as read for authenticated user' })
  @ApiResponse({ status: 200, description: 'All notifications marked as read' })
  async markAllNotificationsAsRead(
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    return this.portalService.markAllNotificationsAsRead(rbac, this.getClientIp(req));
  }

  // ====================================================
  // K. COMPLAINTS
  // ====================================================
  @Get('complaints')
  @ApiOperation({ summary: 'List complaints filed by authenticated resident' })
  @ApiResponse({ status: 200, description: 'Complaints list retrieved successfully' })
  async getComplaints(
    @CurrentRbac() rbac: RbacContext,
    @Query() query: PortalPaginationDto,
  ) {
    return this.portalService.getComplaints(query, rbac);
  }

  @Post('complaints')
  @ApiOperation({ summary: 'Submit a new complaint for authenticated resident' })
  @ApiResponse({ status: 201, description: 'Complaint created successfully' })
  async createComplaint(
    @CurrentRbac() rbac: RbacContext,
    @Body() dto: CreatePortalComplaintDto,
    @Req() req: Request,
  ) {
    return this.portalService.createComplaint(dto, rbac, this.getClientIp(req));
  }

  @Get('complaints/:id')
  @ApiOperation({ summary: 'Get specific complaint details' })
  @ApiParam({ name: 'id', description: 'Complaint UUID' })
  @ApiResponse({ status: 200, description: 'Complaint details retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Complaint not found or unauthorized' })
  async getComplaintById(
    @CurrentRbac() rbac: RbacContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.portalService.getComplaintById(id, rbac);
  }

  @Get('complaints/:id/history')
  @ApiOperation({ summary: 'Get status transition history of resident complaint' })
  @ApiParam({ name: 'id', description: 'Complaint UUID' })
  @ApiResponse({ status: 200, description: 'Complaint history retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Complaint not found or unauthorized' })
  async getComplaintHistory(
    @CurrentRbac() rbac: RbacContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.portalService.getComplaintHistory(id, rbac);
  }

  // ====================================================
  // L. MAINTENANCE
  // ====================================================
  @Get('maintenance')
  @ApiOperation({ summary: 'List maintenance requests relevant to authenticated resident' })
  @ApiResponse({ status: 200, description: 'Maintenance requests retrieved successfully' })
  async getMaintenance(
    @CurrentRbac() rbac: RbacContext,
    @Query() query: PortalPaginationDto,
  ) {
    return this.portalService.getMaintenance(query, rbac);
  }

  @Post('maintenance')
  @ApiOperation({ summary: 'Submit a new maintenance request for resident room/bed' })
  @ApiResponse({ status: 201, description: 'Maintenance request created successfully' })
  async createMaintenance(
    @CurrentRbac() rbac: RbacContext,
    @Body() dto: CreatePortalMaintenanceDto,
    @Req() req: Request,
  ) {
    return this.portalService.createMaintenance(dto, rbac, this.getClientIp(req));
  }

  @Get('maintenance/:id')
  @ApiOperation({ summary: 'Get specific maintenance request details' })
  @ApiParam({ name: 'id', description: 'Maintenance request UUID' })
  @ApiResponse({ status: 200, description: 'Maintenance details retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Maintenance request not found or unauthorized' })
  async getMaintenanceById(
    @CurrentRbac() rbac: RbacContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.portalService.getMaintenanceById(id, rbac);
  }

  @Get('maintenance/:id/history')
  @ApiOperation({ summary: 'Get status transition history of maintenance request' })
  @ApiParam({ name: 'id', description: 'Maintenance request UUID' })
  @ApiResponse({ status: 200, description: 'Maintenance history retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Maintenance request not found or unauthorized' })
  async getMaintenanceHistory(
    @CurrentRbac() rbac: RbacContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.portalService.getMaintenanceHistory(id, rbac);
  }

  // ====================================================
  // M. LEAVES
  // ====================================================
  @Get('leaves')
  @ApiOperation({ summary: 'List leave applications for authenticated resident' })
  @ApiResponse({ status: 200, description: 'Leave applications retrieved successfully' })
  async getLeaves(
    @CurrentRbac() rbac: RbacContext,
    @Query() query: PortalPaginationDto,
  ) {
    return this.portalService.getLeaves(query, rbac);
  }

  @Post('leaves')
  @ApiOperation({ summary: 'Submit a new leave application for resident' })
  @ApiResponse({ status: 201, description: 'Leave application submitted successfully' })
  async createLeave(
    @CurrentRbac() rbac: RbacContext,
    @Body() dto: CreatePortalLeaveDto,
    @Req() req: Request,
  ) {
    return this.portalService.createLeave(dto, rbac, this.getClientIp(req));
  }

  @Get('leaves/:id')
  @ApiOperation({ summary: 'Get specific leave application details' })
  @ApiParam({ name: 'id', description: 'Leave application UUID' })
  @ApiResponse({ status: 200, description: 'Leave application retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Leave application not found or unauthorized' })
  async getLeaveById(
    @CurrentRbac() rbac: RbacContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.portalService.getLeaveById(id, rbac);
  }

  @Post('leaves/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel own eligible leave application' })
  @ApiParam({ name: 'id', description: 'Leave application UUID' })
  @ApiResponse({ status: 200, description: 'Leave cancelled successfully' })
  @ApiResponse({ status: 404, description: 'Leave not found or unauthorized' })
  async cancelLeave(
    @CurrentRbac() rbac: RbacContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.portalService.cancelLeave(id, rbac, this.getClientIp(req));
  }

  // ====================================================
  // N. FOOD / MESS
  // ====================================================
  @Get('food/menu')
  @ApiOperation({ summary: 'Get weekly food menu for resident assigned property' })
  @ApiResponse({ status: 200, description: 'Weekly menu retrieved successfully' })
  async getFoodMenu(@CurrentRbac() rbac: RbacContext) {
    return this.portalService.getFoodMenu(rbac);
  }

  @Get('food/meals')
  @ApiOperation({ summary: 'Get daily meal schedule records for property' })
  @ApiResponse({ status: 200, description: 'Meal records retrieved successfully' })
  async getMeals(
    @CurrentRbac() rbac: RbacContext,
    @Query() query: PortalPaginationDto,
  ) {
    return this.portalService.getMeals(query, rbac);
  }

  @Get('food/attendance')
  @ApiOperation({ summary: 'Get meal attendance records for authenticated resident' })
  @ApiResponse({ status: 200, description: 'Meal attendance retrieved successfully' })
  async getMealAttendance(
    @CurrentRbac() rbac: RbacContext,
    @Query() query: PortalPaginationDto,
  ) {
    return this.portalService.getMealAttendance(query, rbac);
  }

  // ====================================================
  // O. VISITORS
  // ====================================================
  @Get('visitors')
  @ApiOperation({ summary: 'List visitor records associated with authenticated resident' })
  @ApiResponse({ status: 200, description: 'Visitors list retrieved successfully' })
  async getVisitors(
    @CurrentRbac() rbac: RbacContext,
    @Query() query: PortalPaginationDto,
  ) {
    return this.portalService.getVisitors(query, rbac);
  }

  @Get('visitors/:id')
  @ApiOperation({ summary: 'Get specific visitor entry details' })
  @ApiParam({ name: 'id', description: 'Visitor UUID' })
  @ApiResponse({ status: 200, description: 'Visitor details retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Visitor not found or unauthorized' })
  async getVisitorById(
    @CurrentRbac() rbac: RbacContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.portalService.getVisitorById(id, rbac);
  }

  // ====================================================
  // P. RESIDENT DOCUMENTS
  // ====================================================
  @Get('documents')
  @ApiOperation({ summary: 'List uploaded KYC / identity documents for authenticated resident' })
  @ApiResponse({ status: 200, description: 'Documents list retrieved successfully' })
  async getDocuments(@CurrentRbac() rbac: RbacContext) {
    return this.portalService.getDocuments(rbac);
  }

  // ====================================================
  // Q. BOOKINGS, MOVE-IN, MOVE-OUT
  // ====================================================
  @Get('bookings')
  @ApiOperation({ summary: 'List bed reservation bookings for authenticated resident' })
  @ApiResponse({ status: 200, description: 'Bookings list retrieved successfully' })
  async getBookings(@CurrentRbac() rbac: RbacContext) {
    return this.portalService.getBookings(rbac);
  }

  @Get('move-ins')
  @ApiOperation({ summary: 'List onboarding move-in records for authenticated resident' })
  @ApiResponse({ status: 200, description: 'Move-in records retrieved successfully' })
  async getMoveIns(@CurrentRbac() rbac: RbacContext) {
    return this.portalService.getMoveIns(rbac);
  }

  @Get('move-outs')
  @ApiOperation({ summary: 'List move-out / notice requests for authenticated resident' })
  @ApiResponse({ status: 200, description: 'Move-out records retrieved successfully' })
  async getMoveOuts(@CurrentRbac() rbac: RbacContext) {
    return this.portalService.getMoveOuts(rbac);
  }
}
