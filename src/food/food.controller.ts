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
import {
  CreateDailyMenuItemDto,
  DailyMenuItemQueryDto,
  UpdateDailyMenuItemDto,
} from './dto/menu-item.dto';
import {
  CreateWeeklyMenuDto,
  UpdateWeeklyMenuDto,
  WeeklyMenuQueryDto,
} from './dto/weekly-menu.dto';
import {
  CreateMealRecordDto,
  MealRecordQueryDto,
  UpdateMealRecordDto,
} from './dto/meal.dto';
import {
  CreateMealAttendanceDto,
  MealAttendanceQueryDto,
  UpdateMealAttendanceDto,
} from './dto/attendance.dto';
import {
  CreateFoodVendorDto,
  FoodVendorQueryDto,
  UpdateFoodVendorDto,
} from './dto/vendor.dto';
import {
  CreateFoodExpenseDto,
  FoodExpenseQueryDto,
  UpdateFoodExpenseDto,
} from './dto/expense.dto';
import {
  CreateInventoryItemDto,
  CreateInventoryTransactionDto,
  InventoryItemQueryDto,
  InventoryTransactionQueryDto,
  UpdateInventoryItemDto,
} from './dto/inventory.dto';
import {
  CreatePurchaseRecordDto,
  CreatePurchaseRecordItemDto,
  PurchaseRecordQueryDto,
  UpdatePurchaseRecordDto,
} from './dto/purchase.dto';
import { FoodReportQueryDto } from './dto/report.dto';
import { FoodService } from './food.service';

@ApiTags('Food & Mess Management')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Organization-Id',
  required: true,
  description: 'Target organization UUID',
})
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('food')
export class FoodController {
  constructor(private readonly foodService: FoodService) {}

  // ====================================================
  // 1. WEEKLY MENUS
  // ====================================================

  @Post('weekly-menus')
  @RequirePermissions('property.update')
  @ApiOperation({ summary: 'Create a new weekly menu' })
  @ApiResponse({ status: 201, description: 'Weekly menu created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error or duplicate menu' })
  @ApiResponse({ status: 401, description: 'Unauthorized JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Property not found' })
  createWeeklyMenu(
    @Body() dto: CreateWeeklyMenuDto,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.foodService.createWeeklyMenu(dto, rbac, ip);
  }

  @Get('weekly-menus')
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'List weekly menus with pagination and date filters' })
  @ApiResponse({ status: 200, description: 'List of weekly menus returned' })
  findAllWeeklyMenus(
    @Query() query: WeeklyMenuQueryDto,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.foodService.findAllWeeklyMenus(query, rbac);
  }

  @Get('weekly-menus/:id')
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'Get single weekly menu details with items' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Weekly menu details returned' })
  @ApiResponse({ status: 404, description: 'Weekly menu not found' })
  findOneWeeklyMenu(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.foodService.findOneWeeklyMenu(id, rbac);
  }

  @Patch('weekly-menus/:id')
  @RequirePermissions('property.update')
  @ApiOperation({ summary: 'Update weekly menu details' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Weekly menu updated successfully' })
  @ApiResponse({ status: 404, description: 'Weekly menu not found' })
  updateWeeklyMenu(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWeeklyMenuDto,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.foodService.updateWeeklyMenu(id, dto, rbac, ip);
  }

  @Delete('weekly-menus/:id')
  @RequirePermissions('property.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete weekly menu and related daily menu items' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Weekly menu deleted successfully' })
  @ApiResponse({ status: 404, description: 'Weekly menu not found' })
  deleteWeeklyMenu(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.foodService.deleteWeeklyMenu(id, rbac, ip);
  }

  // ====================================================
  // 2. DAILY MENU ITEMS
  // ====================================================

  @Post('menu-items')
  @RequirePermissions('property.update')
  @ApiOperation({ summary: 'Add a new daily menu item to a weekly menu' })
  @ApiResponse({ status: 201, description: 'Daily menu item created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 404, description: 'Weekly menu not found' })
  createMenuItem(
    @Body() dto: CreateDailyMenuItemDto,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.foodService.createMenuItem(dto, rbac, ip);
  }

  @Get('menu-items')
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'List daily menu items with pagination and meal filters' })
  @ApiResponse({ status: 200, description: 'List of daily menu items returned' })
  findAllMenuItems(
    @Query() query: DailyMenuItemQueryDto,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.foodService.findAllMenuItems(query, rbac);
  }

  @Get('menu-items/:id')
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'Get single daily menu item details' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Menu item details returned' })
  @ApiResponse({ status: 404, description: 'Menu item not found' })
  findOneMenuItem(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.foodService.findOneMenuItem(id, rbac);
  }

  @Patch('menu-items/:id')
  @RequirePermissions('property.update')
  @ApiOperation({ summary: 'Update daily menu item details' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Menu item updated successfully' })
  @ApiResponse({ status: 404, description: 'Menu item not found' })
  updateMenuItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDailyMenuItemDto,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.foodService.updateMenuItem(id, dto, rbac, ip);
  }

  @Delete('menu-items/:id')
  @RequirePermissions('property.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete daily menu item' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Menu item deleted successfully' })
  @ApiResponse({ status: 404, description: 'Menu item not found' })
  deleteMenuItem(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.foodService.deleteMenuItem(id, rbac, ip);
  }

  // ====================================================
  // 3. MEAL RECORDS
  // ====================================================

  @Post('meals')
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'Record daily meal count and details' })
  @ApiResponse({ status: 201, description: 'Meal record created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error or duplicate record' })
  @ApiResponse({ status: 403, description: 'Forbidden for resident/accountant' })
  createMealRecord(
    @Body() dto: CreateMealRecordDto,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.foodService.createMealRecord(dto, rbac, ip);
  }

  @Get('meals')
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'List meal records with pagination, date, and meal type filters' })
  @ApiResponse({ status: 200, description: 'List of meal records returned' })
  findAllMealRecords(
    @Query() query: MealRecordQueryDto,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.foodService.findAllMealRecords(query, rbac);
  }

  @Get('meals/:id')
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'Get single meal record details' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Meal record details returned' })
  @ApiResponse({ status: 404, description: 'Meal record not found' })
  findOneMealRecord(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.foodService.findOneMealRecord(id, rbac);
  }

  @Patch('meals/:id')
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'Update meal counts or notes' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Meal record updated successfully' })
  @ApiResponse({ status: 404, description: 'Meal record not found' })
  updateMealRecord(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMealRecordDto,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.foodService.updateMealRecord(id, dto, rbac, ip);
  }

  // ====================================================
  // 4. MEAL ATTENDANCE
  // ====================================================

  @Post('attendance')
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'Mark meal attendance for a resident' })
  @ApiResponse({ status: 201, description: 'Attendance marked successfully' })
  @ApiResponse({ status: 400, description: 'Validation error or duplicate attendance' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  createAttendance(
    @Body() dto: CreateMealAttendanceDto,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.foodService.createAttendance(dto, rbac, ip);
  }

  @Get('attendance')
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'List meal attendance with pagination and filters' })
  @ApiResponse({ status: 200, description: 'Attendance records returned' })
  findAllAttendance(
    @Query() query: MealAttendanceQueryDto,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.foodService.findAllAttendance(query, rbac);
  }

  @Get('attendance/:id')
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'Get single meal attendance record' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Attendance record returned' })
  @ApiResponse({ status: 404, description: 'Attendance not found' })
  findOneAttendance(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.foodService.findOneAttendance(id, rbac);
  }

  @Patch('attendance/:id')
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'Update meal attendance status or notes' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Attendance updated successfully' })
  @ApiResponse({ status: 404, description: 'Attendance not found' })
  updateAttendance(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMealAttendanceDto,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.foodService.updateAttendance(id, dto, rbac, ip);
  }

  // ====================================================
  // 5. FOOD VENDORS
  // ====================================================

  @Post('vendors')
  @RequirePermissions('property.update')
  @ApiOperation({ summary: 'Register a new food vendor' })
  @ApiResponse({ status: 201, description: 'Food vendor created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  createVendor(
    @Body() dto: CreateFoodVendorDto,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.foodService.createVendor(dto, rbac, ip);
  }

  @Get('vendors')
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'List food vendors with pagination and category filters' })
  @ApiResponse({ status: 200, description: 'List of food vendors returned' })
  findAllVendors(
    @Query() query: FoodVendorQueryDto,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.foodService.findAllVendors(query, rbac);
  }

  @Get('vendors/:id')
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'Get single food vendor details' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Food vendor details returned' })
  @ApiResponse({ status: 404, description: 'Food vendor not found' })
  findOneVendor(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.foodService.findOneVendor(id, rbac);
  }

  @Patch('vendors/:id')
  @RequirePermissions('property.update')
  @ApiOperation({ summary: 'Update food vendor details' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Food vendor updated successfully' })
  @ApiResponse({ status: 404, description: 'Food vendor not found' })
  updateVendor(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFoodVendorDto,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.foodService.updateVendor(id, dto, rbac, ip);
  }

  @Delete('vendors/:id')
  @RequirePermissions('property.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete or deactivate food vendor' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Food vendor deleted successfully' })
  @ApiResponse({ status: 404, description: 'Food vendor not found' })
  deleteVendor(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.foodService.deleteVendor(id, rbac, ip);
  }

  // ====================================================
  // 6. FOOD EXPENSES
  // ====================================================

  @Post('expenses')
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'Record a food and mess operational expense' })
  @ApiResponse({ status: 201, description: 'Food expense recorded successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  createExpense(
    @Body() dto: CreateFoodExpenseDto,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.foodService.createExpense(dto, rbac, ip);
  }

  @Get('expenses')
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'List food expenses with pagination and date filters' })
  @ApiResponse({ status: 200, description: 'List of food expenses returned' })
  findAllExpenses(
    @Query() query: FoodExpenseQueryDto,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.foodService.findAllExpenses(query, rbac);
  }

  @Get('expenses/:id')
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'Get single food expense details' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Food expense details returned' })
  @ApiResponse({ status: 404, description: 'Food expense not found' })
  findOneExpense(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.foodService.findOneExpense(id, rbac);
  }

  @Patch('expenses/:id')
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'Update food expense details' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Food expense updated successfully' })
  @ApiResponse({ status: 404, description: 'Food expense not found' })
  updateExpense(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFoodExpenseDto,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.foodService.updateExpense(id, dto, rbac, ip);
  }

  @Delete('expenses/:id')
  @RequirePermissions('property.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete food expense record' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Food expense deleted successfully' })
  @ApiResponse({ status: 404, description: 'Food expense not found' })
  deleteExpense(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.foodService.deleteExpense(id, rbac, ip);
  }

  // ====================================================
  // 7. INVENTORY ITEMS & TRANSACTIONS
  // ====================================================

  @Post('inventory')
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'Create a new inventory item' })
  @ApiResponse({ status: 201, description: 'Inventory item created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  createInventoryItem(
    @Body() dto: CreateInventoryItemDto,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.foodService.createInventoryItem(dto, rbac, ip);
  }

  @Get('inventory')
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'List inventory items with pagination and category filters' })
  @ApiResponse({ status: 200, description: 'List of inventory items returned' })
  findAllInventoryItems(
    @Query() query: InventoryItemQueryDto,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.foodService.findAllInventoryItems(query, rbac);
  }

  @Get('inventory/:id')
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'Get single inventory item details' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Inventory item details returned' })
  @ApiResponse({ status: 404, description: 'Inventory item not found' })
  findOneInventoryItem(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.foodService.findOneInventoryItem(id, rbac);
  }

  @Patch('inventory/:id')
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'Update inventory item attributes' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Inventory item updated successfully' })
  @ApiResponse({ status: 404, description: 'Inventory item not found' })
  updateInventoryItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInventoryItemDto,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.foodService.updateInventoryItem(id, dto, rbac, ip);
  }

  @Post('inventory/:id/transactions')
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'Record inventory transaction (stock in, stock out, adjustment)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Inventory transaction processed' })
  @ApiResponse({ status: 400, description: 'Insufficient stock or validation error' })
  @ApiResponse({ status: 404, description: 'Inventory item not found' })
  createInventoryTransaction(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateInventoryTransactionDto,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.foodService.createInventoryTransaction(id, dto, rbac, ip);
  }

  @Get('inventory/:id/transactions')
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'List transaction history for an inventory item' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Transaction history returned' })
  @ApiResponse({ status: 404, description: 'Inventory item not found' })
  findInventoryTransactions(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: InventoryTransactionQueryDto,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.foodService.findInventoryTransactions(id, query, rbac);
  }

  // ====================================================
  // 8. PURCHASE RECORDS & ITEMS
  // ====================================================

  @Post('purchases')
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'Create purchase order/record with optional items' })
  @ApiResponse({ status: 201, description: 'Purchase record created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  createPurchaseRecord(
    @Body() dto: CreatePurchaseRecordDto,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.foodService.createPurchaseRecord(dto, rbac, ip);
  }

  @Get('purchases')
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'List purchase records with pagination and status filters' })
  @ApiResponse({ status: 200, description: 'List of purchase records returned' })
  findAllPurchaseRecords(
    @Query() query: PurchaseRecordQueryDto,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.foodService.findAllPurchaseRecords(query, rbac);
  }

  @Get('purchases/:id')
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'Get single purchase record details with items' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Purchase record details returned' })
  @ApiResponse({ status: 404, description: 'Purchase record not found' })
  findOnePurchaseRecord(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.foodService.findOnePurchaseRecord(id, rbac);
  }

  @Patch('purchases/:id')
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'Update purchase record status, invoice number, or totals' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Purchase record updated successfully' })
  @ApiResponse({ status: 404, description: 'Purchase record not found' })
  updatePurchaseRecord(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePurchaseRecordDto,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.foodService.updatePurchaseRecord(id, dto, rbac, ip);
  }

  @Get('purchases/:id/items')
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'List items belonging to a purchase record' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Purchase items returned' })
  @ApiResponse({ status: 404, description: 'Purchase record not found' })
  findPurchaseRecordItems(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.foodService.findPurchaseRecordItems(id, rbac);
  }

  @Post('purchases/:id/items')
  @RequirePermissions('property.read')
  @ApiOperation({ summary: 'Add an item to an existing purchase record' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Purchase item added' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 404, description: 'Purchase record or item not found' })
  addPurchaseRecordItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePurchaseRecordItemDto,
    @CurrentRbac() rbac: RbacContext,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    return this.foodService.addPurchaseRecordItem(id, dto, rbac, ip);
  }

  // ====================================================
  // 9. REPORTS
  // ====================================================

  @Get('reports/meal-summary')
  @RequirePermissions('reports.read')
  @ApiOperation({ summary: 'Get meal consumption and attendance summary report' })
  @ApiResponse({ status: 200, description: 'Meal summary report returned' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  getMealSummaryReport(
    @Query() query: FoodReportQueryDto,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.foodService.getMealSummaryReport(query, rbac);
  }

  @Get('reports/attendance')
  @RequirePermissions('reports.read')
  @ApiOperation({ summary: 'Get meal attendance breakdown and opt-out rate report' })
  @ApiResponse({ status: 200, description: 'Attendance report returned' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  getAttendanceReport(
    @Query() query: FoodReportQueryDto,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.foodService.getAttendanceReport(query, rbac);
  }

  @Get('reports/expenses')
  @RequirePermissions('reports.read')
  @ApiOperation({ summary: 'Get food & mess expense breakdown by payment method and vendor' })
  @ApiResponse({ status: 200, description: 'Food expenses report returned' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  getExpensesReport(
    @Query() query: FoodReportQueryDto,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.foodService.getExpensesReport(query, rbac);
  }

  @Get('reports/inventory')
  @RequirePermissions('reports.read')
  @ApiOperation({ summary: 'Get inventory stock status and total valuation report' })
  @ApiResponse({ status: 200, description: 'Inventory valuation report returned' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  getInventoryReport(
    @Query() query: FoodReportQueryDto,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.foodService.getInventoryReport(query, rbac);
  }

  @Get('reports/purchases')
  @RequirePermissions('reports.read')
  @ApiOperation({ summary: 'Get purchase orders and net expenditure report' })
  @ApiResponse({ status: 200, description: 'Purchases report returned' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  getPurchasesReport(
    @Query() query: FoodReportQueryDto,
    @CurrentRbac() rbac: RbacContext,
  ) {
    return this.foodService.getPurchasesReport(query, rbac);
  }
}
