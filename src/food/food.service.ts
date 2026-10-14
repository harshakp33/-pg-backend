import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DayOfWeek,
  FoodVendorCategory,
  InventoryCategory,
  InventoryStatus,
  InventoryTransactionType,
  InventoryUnit,
  MealAttendanceStatus,
  MealType,
  PaymentMethod,
  Prisma,
  PurchaseRecordStatus,
  VendorCategory,
  VendorPaymentTerms,
  VendorStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
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

@Injectable()
export class FoodService {
  constructor(private readonly prisma: PrismaService) {}

  // ----------------------------------------------------
  // HELPERS
  // ----------------------------------------------------

  private createAuditLogTx(
    tx: Prisma.TransactionClient,
    params: {
      organizationId: string;
      userId?: string;
      action: string;
      entityType: string;
      entityId: string;
      oldValues?: any;
      newValues?: any;
      ipAddress?: string;
    },
  ) {
    return tx.audit_logs.create({
      data: {
        id: randomUUID(),
        organizationId: params.organizationId,
        userId: params.userId ?? null,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        oldValues: params.oldValues ? JSON.stringify(params.oldValues) : null,
        newValues: params.newValues ? JSON.stringify(params.newValues) : null,
        ipAddress: params.ipAddress ?? null,
        createdAt: new Date(),
      },
    });
  }

  async resolveResidentProfile(rbac: RbacContext) {
    const resident = await this.prisma.residents.findFirst({
      where: {
        organizationId: rbac.organizationId,
        deletedAt: null,
        OR: [{ userId: rbac.userId }, { email: rbac.email }],
      },
    });

    if (!resident) {
      throw new BadRequestException(
        'No active resident profile found for this user in this organization',
      );
    }

    if (!resident.userId) {
      await this.prisma.residents.update({
        where: { id: resident.id },
        data: { userId: rbac.userId },
      });
    }

    return resident;
  }

  async verifyPropertyInOrg(propertyId: string, organizationId: string) {
    const property = await this.prisma.properties.findFirst({
      where: { id: propertyId, organizationId, deletedAt: null },
    });
    if (!property) {
      throw new NotFoundException('Property not found in this organization');
    }
    return property;
  }

  // ----------------------------------------------------
  // WEEKLY MENUS
  // ----------------------------------------------------

  async createWeeklyMenu(dto: CreateWeeklyMenuDto, rbac: RbacContext, ip?: string) {
    if (rbac.role !== 'OWNER' && rbac.role !== 'MANAGER') {
      throw new ForbiddenException('Only owners and managers can create weekly menus');
    }

    await this.verifyPropertyInOrg(dto.propertyId, rbac.organizationId);

    const weekStartDate = new Date(dto.weekStartDate);
    const existing = await this.prisma.weekly_menus.findFirst({
      where: {
        propertyId: dto.propertyId,
        weekStartDate,
      },
    });

    if (existing) {
      throw new BadRequestException(
        'A weekly menu already exists for this property and week start date',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const menuId = randomUUID();
      const menu = await tx.weekly_menus.create({
        data: {
          id: menuId,
          organizationId: rbac.organizationId,
          propertyId: dto.propertyId,
          name: dto.name,
          weekStartDate,
          isPublished: dto.isPublished ?? true,
          notes: dto.notes ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      if (dto.items && dto.items.length > 0) {
        for (const item of dto.items) {
          await tx.daily_menu_items.create({
            data: {
              id: randomUUID(),
              weeklyMenuId: menuId,
              dayOfWeek: item.dayOfWeek,
              mealType: item.mealType,
              title: item.title,
              itemsDescription: item.itemsDescription,
              startTime: item.startTime ?? '07:30',
              endTime: item.endTime ?? '09:30',
              isSpecialMeal: item.isSpecialMeal ?? false,
              createdAt: new Date(),
            },
          });
        }
      }

      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'food.weekly_menu.created',
        entityType: 'weekly_menus',
        entityId: menu.id,
        newValues: { name: menu.name, weekStartDate: dto.weekStartDate, propertyId: dto.propertyId },
        ipAddress: ip,
      });

      return tx.weekly_menus.findUnique({
        where: { id: menu.id },
        include: { daily_menu_items: true },
      });
    });
  }

  async findAllWeeklyMenus(query: WeeklyMenuQueryDto, rbac: RbacContext) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.weekly_menusWhereInput = {
      organizationId: rbac.organizationId,
    };

    if (query.propertyId) {
      await this.verifyPropertyInOrg(query.propertyId, rbac.organizationId);
      where.propertyId = query.propertyId;
    }

    if (rbac.role === 'RESIDENT') {
      where.isPublished = true;
      const resident = await this.resolveResidentProfile(rbac);
      if (resident.propertyId && !query.propertyId) {
        where.propertyId = resident.propertyId;
      }
    } else if (query.isPublished !== undefined) {
      where.isPublished = query.isPublished;
    }

    if (query.startDate || query.endDate) {
      where.weekStartDate = {};
      if (query.startDate) {
        where.weekStartDate.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        where.weekStartDate.lte = new Date(query.endDate);
      }
    }

    const [items, total] = await Promise.all([
      this.prisma.weekly_menus.findMany({
        where,
        skip,
        take: limit,
        orderBy: { weekStartDate: 'desc' },
        include: {
          properties: { select: { id: true, name: true, code: true } },
          daily_menu_items: {
            orderBy: [{ dayOfWeek: 'asc' }, { mealType: 'asc' }],
          },
        },
      }),
      this.prisma.weekly_menus.count({ where }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOneWeeklyMenu(id: string, rbac: RbacContext) {
    const menu = await this.prisma.weekly_menus.findFirst({
      where: { id, organizationId: rbac.organizationId },
      include: {
        properties: { select: { id: true, name: true, code: true } },
        daily_menu_items: {
          orderBy: [{ dayOfWeek: 'asc' }, { mealType: 'asc' }],
        },
      },
    });

    if (!menu) {
      throw new NotFoundException('Weekly menu not found in this organization');
    }

    if (rbac.role === 'RESIDENT') {
      if (!menu.isPublished) {
        throw new NotFoundException('Weekly menu not found');
      }
      const resident = await this.resolveResidentProfile(rbac);
      if (resident.propertyId && menu.propertyId !== resident.propertyId) {
        throw new NotFoundException('Weekly menu not found for your property');
      }
    }

    return menu;
  }

  async updateWeeklyMenu(
    id: string,
    dto: UpdateWeeklyMenuDto,
    rbac: RbacContext,
    ip?: string,
  ) {
    if (rbac.role !== 'OWNER' && rbac.role !== 'MANAGER') {
      throw new ForbiddenException('Only owners and managers can update weekly menus');
    }

    const existing = await this.prisma.weekly_menus.findFirst({
      where: { id, organizationId: rbac.organizationId },
    });

    if (!existing) {
      throw new NotFoundException('Weekly menu not found in this organization');
    }

    const data: Prisma.weekly_menusUpdateInput = {
      updatedAt: new Date(),
    };
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.isPublished !== undefined) data.isPublished = dto.isPublished;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.weekStartDate !== undefined) {
      data.weekStartDate = new Date(dto.weekStartDate);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.weekly_menus.update({
        where: { id },
        data,
        include: { daily_menu_items: true },
      });

      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'food.weekly_menu.updated',
        entityType: 'weekly_menus',
        entityId: id,
        oldValues: { name: existing.name, isPublished: existing.isPublished },
        newValues: { name: updated.name, isPublished: updated.isPublished },
        ipAddress: ip,
      });

      return updated;
    });
  }

  async deleteWeeklyMenu(id: string, rbac: RbacContext, ip?: string) {
    if (rbac.role !== 'OWNER' && rbac.role !== 'MANAGER') {
      throw new ForbiddenException('Only owners and managers can delete weekly menus');
    }

    const existing = await this.prisma.weekly_menus.findFirst({
      where: { id, organizationId: rbac.organizationId },
    });

    if (!existing) {
      throw new NotFoundException('Weekly menu not found in this organization');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.weekly_menus.delete({
        where: { id },
      });

      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'food.weekly_menu.deleted',
        entityType: 'weekly_menus',
        entityId: id,
        oldValues: { name: existing.name, propertyId: existing.propertyId },
        ipAddress: ip,
      });

      return { success: true, message: 'Weekly menu deleted successfully' };
    });
  }

  // ----------------------------------------------------
  // DAILY MENU ITEMS
  // ----------------------------------------------------

  async createMenuItem(dto: CreateDailyMenuItemDto, rbac: RbacContext, ip?: string) {
    if (rbac.role !== 'OWNER' && rbac.role !== 'MANAGER') {
      throw new ForbiddenException('Only owners and managers can create menu items');
    }

    if (!dto.weeklyMenuId) {
      throw new BadRequestException('weeklyMenuId is required');
    }

    const weeklyMenu = await this.prisma.weekly_menus.findFirst({
      where: { id: dto.weeklyMenuId, organizationId: rbac.organizationId },
    });

    if (!weeklyMenu) {
      throw new NotFoundException('Weekly menu not found in this organization');
    }

    return this.prisma.$transaction(async (tx) => {
      const item = await tx.daily_menu_items.create({
        data: {
          id: randomUUID(),
          weeklyMenuId: dto.weeklyMenuId!,
          dayOfWeek: dto.dayOfWeek,
          mealType: dto.mealType,
          title: dto.title,
          itemsDescription: dto.itemsDescription,
          startTime: dto.startTime ?? '07:30',
          endTime: dto.endTime ?? '09:30',
          isSpecialMeal: dto.isSpecialMeal ?? false,
          createdAt: new Date(),
        },
      });

      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'food.menu_item.created',
        entityType: 'daily_menu_items',
        entityId: item.id,
        newValues: { title: item.title, dayOfWeek: item.dayOfWeek, mealType: item.mealType },
        ipAddress: ip,
      });

      return item;
    });
  }

  async findAllMenuItems(query: DailyMenuItemQueryDto, rbac: RbacContext) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.daily_menu_itemsWhereInput = {
      weekly_menus: {
        organizationId: rbac.organizationId,
      },
    };

    if (query.weeklyMenuId) {
      where.weeklyMenuId = query.weeklyMenuId;
    }

    if (query.dayOfWeek) {
      where.dayOfWeek = query.dayOfWeek;
    }

    if (query.mealType) {
      where.mealType = query.mealType;
    }

    if (rbac.role === 'RESIDENT') {
      const resident = await this.resolveResidentProfile(rbac);
      where.weekly_menus = {
        organizationId: rbac.organizationId,
        isPublished: true,
        ...(resident.propertyId ? { propertyId: resident.propertyId } : {}),
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.daily_menu_items.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ dayOfWeek: 'asc' }, { mealType: 'asc' }],
        include: {
          weekly_menus: {
            select: { id: true, name: true, propertyId: true, isPublished: true },
          },
        },
      }),
      this.prisma.daily_menu_items.count({ where }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOneMenuItem(id: string, rbac: RbacContext) {
    const item = await this.prisma.daily_menu_items.findFirst({
      where: {
        id,
        weekly_menus: { organizationId: rbac.organizationId },
      },
      include: {
        weekly_menus: true,
      },
    });

    if (!item) {
      throw new NotFoundException('Daily menu item not found in this organization');
    }

    if (rbac.role === 'RESIDENT') {
      if (!item.weekly_menus.isPublished) {
        throw new NotFoundException('Menu item not found');
      }
    }

    return item;
  }

  async updateMenuItem(
    id: string,
    dto: UpdateDailyMenuItemDto,
    rbac: RbacContext,
    ip?: string,
  ) {
    if (rbac.role !== 'OWNER' && rbac.role !== 'MANAGER') {
      throw new ForbiddenException('Only owners and managers can update menu items');
    }

    const existing = await this.prisma.daily_menu_items.findFirst({
      where: {
        id,
        weekly_menus: { organizationId: rbac.organizationId },
      },
    });

    if (!existing) {
      throw new NotFoundException('Daily menu item not found in this organization');
    }

    const data: Prisma.daily_menu_itemsUpdateInput = {};
    if (dto.dayOfWeek !== undefined) data.dayOfWeek = dto.dayOfWeek;
    if (dto.mealType !== undefined) data.mealType = dto.mealType;
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.itemsDescription !== undefined) data.itemsDescription = dto.itemsDescription;
    if (dto.startTime !== undefined) data.startTime = dto.startTime;
    if (dto.endTime !== undefined) data.endTime = dto.endTime;
    if (dto.isSpecialMeal !== undefined) data.isSpecialMeal = dto.isSpecialMeal;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.daily_menu_items.update({
        where: { id },
        data,
      });

      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'food.menu_item.updated',
        entityType: 'daily_menu_items',
        entityId: id,
        oldValues: { title: existing.title },
        newValues: { title: updated.title },
        ipAddress: ip,
      });

      return updated;
    });
  }

  async deleteMenuItem(id: string, rbac: RbacContext, ip?: string) {
    if (rbac.role !== 'OWNER' && rbac.role !== 'MANAGER') {
      throw new ForbiddenException('Only owners and managers can delete menu items');
    }

    const existing = await this.prisma.daily_menu_items.findFirst({
      where: {
        id,
        weekly_menus: { organizationId: rbac.organizationId },
      },
    });

    if (!existing) {
      throw new NotFoundException('Daily menu item not found in this organization');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.daily_menu_items.delete({
        where: { id },
      });

      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'food.menu_item.deleted',
        entityType: 'daily_menu_items',
        entityId: id,
        oldValues: { title: existing.title },
        ipAddress: ip,
      });

      return { success: true, message: 'Daily menu item deleted successfully' };
    });
  }

  // ----------------------------------------------------
  // MEAL RECORDS
  // ----------------------------------------------------

  async createMealRecord(dto: CreateMealRecordDto, rbac: RbacContext, ip?: string) {
    if (rbac.role !== 'OWNER' && rbac.role !== 'MANAGER' && rbac.role !== 'STAFF') {
      throw new ForbiddenException('Only owners, managers, and staff can log meal records');
    }

    await this.verifyPropertyInOrg(dto.propertyId, rbac.organizationId);

    const mealDate = new Date(dto.mealDate);
    const existing = await this.prisma.meal_records.findUnique({
      where: {
        propertyId_mealDate_mealType: {
          propertyId: dto.propertyId,
          mealDate,
          mealType: dto.mealType,
        },
      },
    });

    if (existing) {
      throw new BadRequestException(
        'Meal record already exists for this property, date, and meal type',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const record = await tx.meal_records.create({
        data: {
          id: randomUUID(),
          organizationId: rbac.organizationId,
          propertyId: dto.propertyId,
          mealDate,
          mealType: dto.mealType,
          expectedCount: dto.expectedCount ?? 0,
          actualCount: dto.actualCount ?? 0,
          notes: dto.notes ?? null,
          loggedBy: rbac.userId,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'food.meal.created',
        entityType: 'meal_records',
        entityId: record.id,
        newValues: {
          propertyId: dto.propertyId,
          mealDate: dto.mealDate,
          mealType: dto.mealType,
          expectedCount: record.expectedCount,
        },
        ipAddress: ip,
      });

      return record;
    });
  }

  async findAllMealRecords(query: MealRecordQueryDto, rbac: RbacContext) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.meal_recordsWhereInput = {
      organizationId: rbac.organizationId,
    };

    if (query.propertyId) {
      await this.verifyPropertyInOrg(query.propertyId, rbac.organizationId);
      where.propertyId = query.propertyId;
    }

    if (rbac.role === 'RESIDENT') {
      const resident = await this.resolveResidentProfile(rbac);
      if (resident.propertyId && !query.propertyId) {
        where.propertyId = resident.propertyId;
      }
    }

    if (query.mealType) {
      where.mealType = query.mealType;
    }

    if (query.mealDate) {
      where.mealDate = new Date(query.mealDate);
    } else if (query.startDate || query.endDate) {
      where.mealDate = {};
      if (query.startDate) where.mealDate.gte = new Date(query.startDate);
      if (query.endDate) where.mealDate.lte = new Date(query.endDate);
    }

    const [items, total] = await Promise.all([
      this.prisma.meal_records.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ mealDate: 'desc' }, { mealType: 'asc' }],
        include: {
          properties: { select: { id: true, name: true, code: true } },
          _count: { select: { meal_attendances: true } },
        },
      }),
      this.prisma.meal_records.count({ where }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOneMealRecord(id: string, rbac: RbacContext) {
    const record = await this.prisma.meal_records.findFirst({
      where: { id, organizationId: rbac.organizationId },
      include: {
        properties: { select: { id: true, name: true, code: true } },
        meal_attendances: {
          include: {
            residents: { select: { id: true, fullName: true, phone: true } },
          },
        },
      },
    });

    if (!record) {
      throw new NotFoundException('Meal record not found in this organization');
    }

    if (rbac.role === 'RESIDENT') {
      const resident = await this.resolveResidentProfile(rbac);
      if (resident.propertyId && record.propertyId !== resident.propertyId) {
        throw new NotFoundException('Meal record not found for your property');
      }
    }

    return record;
  }

  async updateMealRecord(
    id: string,
    dto: UpdateMealRecordDto,
    rbac: RbacContext,
    ip?: string,
  ) {
    if (rbac.role !== 'OWNER' && rbac.role !== 'MANAGER' && rbac.role !== 'STAFF') {
      throw new ForbiddenException('Only owners, managers, and staff can update meal records');
    }

    const existing = await this.prisma.meal_records.findFirst({
      where: { id, organizationId: rbac.organizationId },
    });

    if (!existing) {
      throw new NotFoundException('Meal record not found in this organization');
    }

    const data: Prisma.meal_recordsUpdateInput = {
      updatedAt: new Date(),
    };
    if (dto.expectedCount !== undefined) data.expectedCount = dto.expectedCount;
    if (dto.actualCount !== undefined) data.actualCount = dto.actualCount;
    if (dto.notes !== undefined) data.notes = dto.notes;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.meal_records.update({
        where: { id },
        data,
      });

      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'food.meal.updated',
        entityType: 'meal_records',
        entityId: id,
        oldValues: { expectedCount: existing.expectedCount, actualCount: existing.actualCount },
        newValues: { expectedCount: updated.expectedCount, actualCount: updated.actualCount },
        ipAddress: ip,
      });

      return updated;
    });
  }

  // ----------------------------------------------------
  // MEAL ATTENDANCE
  // ----------------------------------------------------

  async createAttendance(
    dto: CreateMealAttendanceDto,
    rbac: RbacContext,
    ip?: string,
  ) {
    if (rbac.role === 'ACCOUNTANT') {
      throw new ForbiddenException('Accountants cannot record meal attendance');
    }

    let residentId = dto.residentId;
    if (rbac.role === 'RESIDENT') {
      const resident = await this.resolveResidentProfile(rbac);
      residentId = resident.id;
    } else {
      if (!residentId) {
        throw new BadRequestException('residentId is required');
      }
      const resident = await this.prisma.residents.findFirst({
        where: { id: residentId, organizationId: rbac.organizationId, deletedAt: null },
      });
      if (!resident) {
        throw new NotFoundException('Resident not found in this organization');
      }
    }

    const mealRecord = await this.prisma.meal_records.findFirst({
      where: { id: dto.mealRecordId, organizationId: rbac.organizationId },
    });

    if (!mealRecord) {
      throw new NotFoundException('Meal record not found in this organization');
    }

    const existing = await this.prisma.meal_attendances.findUnique({
      where: {
        mealRecordId_residentId: {
          mealRecordId: dto.mealRecordId,
          residentId,
        },
      },
    });

    if (existing) {
      throw new BadRequestException('Attendance already recorded for this resident and meal');
    }

    return this.prisma.$transaction(async (tx) => {
      const attendance = await tx.meal_attendances.create({
        data: {
          id: randomUUID(),
          mealRecordId: dto.mealRecordId,
          residentId,
          status: dto.status ?? MealAttendanceStatus.PRESENT,
          notes: dto.notes ?? null,
          markedAt: new Date(),
        },
      });

      if (attendance.status === MealAttendanceStatus.PRESENT) {
        await tx.meal_records.update({
          where: { id: dto.mealRecordId },
          data: {
            actualCount: { increment: 1 },
            updatedAt: new Date(),
          },
        });
      }

      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'food.attendance.created',
        entityType: 'meal_attendances',
        entityId: attendance.id,
        newValues: { mealRecordId: dto.mealRecordId, residentId, status: attendance.status },
        ipAddress: ip,
      });

      return attendance;
    });
  }

  async findAllAttendance(query: MealAttendanceQueryDto, rbac: RbacContext) {
    if (rbac.role === 'ACCOUNTANT') {
      throw new ForbiddenException('Accountants cannot view meal attendance');
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.meal_attendancesWhereInput = {
      meal_records: {
        organizationId: rbac.organizationId,
      },
    };

    if (rbac.role === 'RESIDENT') {
      const resident = await this.resolveResidentProfile(rbac);
      if (query.residentId && query.residentId !== resident.id) {
        throw new ForbiddenException('Residents can only view their own attendance records');
      }
      where.residentId = resident.id;
    } else if (query.residentId) {
      where.residentId = query.residentId;
    }

    if (query.mealRecordId) {
      where.mealRecordId = query.mealRecordId;
    }

    if (query.propertyId) {
      where.meal_records = {
        organizationId: rbac.organizationId,
        propertyId: query.propertyId,
      };
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.mealType) {
      where.meal_records = {
        ...(where.meal_records as any),
        mealType: query.mealType,
      };
    }

    if (query.date) {
      where.meal_records = {
        ...(where.meal_records as any),
        mealDate: new Date(query.date),
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.meal_attendances.findMany({
        where,
        skip,
        take: limit,
        orderBy: { markedAt: 'desc' },
        include: {
          residents: { select: { id: true, fullName: true, phone: true } },
          meal_records: {
            select: { id: true, mealDate: true, mealType: true, propertyId: true },
          },
        },
      }),
      this.prisma.meal_attendances.count({ where }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOneAttendance(id: string, rbac: RbacContext) {
    if (rbac.role === 'ACCOUNTANT') {
      throw new ForbiddenException('Accountants cannot view meal attendance');
    }

    const attendance = await this.prisma.meal_attendances.findFirst({
      where: {
        id,
        meal_records: { organizationId: rbac.organizationId },
      },
      include: {
        residents: { select: { id: true, fullName: true, phone: true } },
        meal_records: true,
      },
    });

    if (!attendance) {
      throw new NotFoundException('Meal attendance not found in this organization');
    }

    if (rbac.role === 'RESIDENT') {
      const resident = await this.resolveResidentProfile(rbac);
      if (attendance.residentId !== resident.id) {
        throw new ForbiddenException('Residents cannot view another resident attendance');
      }
    }

    return attendance;
  }

  async updateAttendance(
    id: string,
    dto: UpdateMealAttendanceDto,
    rbac: RbacContext,
    ip?: string,
  ) {
    if (rbac.role === 'ACCOUNTANT') {
      throw new ForbiddenException('Accountants cannot update meal attendance');
    }

    const existing = await this.prisma.meal_attendances.findFirst({
      where: {
        id,
        meal_records: { organizationId: rbac.organizationId },
      },
    });

    if (!existing) {
      throw new NotFoundException('Meal attendance not found in this organization');
    }

    if (rbac.role === 'RESIDENT') {
      const resident = await this.resolveResidentProfile(rbac);
      if (existing.residentId !== resident.id) {
        throw new ForbiddenException('Residents cannot modify another resident attendance');
      }
    }

    const data: Prisma.meal_attendancesUpdateInput = {};
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.notes !== undefined) data.notes = dto.notes;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.meal_attendances.update({
        where: { id },
        data,
      });

      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'food.attendance.updated',
        entityType: 'meal_attendances',
        entityId: id,
        oldValues: { status: existing.status },
        newValues: { status: updated.status },
        ipAddress: ip,
      });

      return updated;
    });
  }

  // ----------------------------------------------------
  // FOOD VENDORS
  // ----------------------------------------------------

  async createVendor(dto: CreateFoodVendorDto, rbac: RbacContext, ip?: string) {
    if (rbac.role !== 'OWNER' && rbac.role !== 'MANAGER') {
      throw new ForbiddenException('Only owners and managers can create food vendors');
    }

    if (dto.propertyId) {
      await this.verifyPropertyInOrg(dto.propertyId, rbac.organizationId);
    }

    return this.prisma.$transaction(async (tx) => {
      const vendorId = randomUUID();

      // 1. Create in food_vendors
      const foodVendor = await tx.food_vendors.create({
        data: {
          id: vendorId,
          organizationId: rbac.organizationId,
          propertyId: dto.propertyId ?? null,
          name: dto.name,
          category: dto.category ?? FoodVendorCategory.GROCERY_WHOLESALE,
          contactPerson: dto.contactPerson ?? null,
          phone: dto.phone,
          email: dto.email ?? null,
          address: dto.address ?? null,
          gstin: dto.gstin ?? null,
          paymentTerms: dto.paymentTerms ?? 'Net 15 Days',
          isActive: dto.isActive ?? true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // 2. Also register in general vendors table for purchase_records and inventory_items FK compatibility
      await tx.vendors.create({
        data: {
          id: vendorId,
          organizationId: rbac.organizationId,
          name: dto.name,
          contact: dto.contactPerson || dto.name,
          phone: dto.phone,
          email: dto.email ?? null,
          category: VendorCategory.GROCERY_FOOD,
          address: dto.address || 'Address on file',
          paymentTerms: VendorPaymentTerms.NET_30,
          status: dto.isActive ? VendorStatus.ACTIVE : VendorStatus.INACTIVE,
          gstin: dto.gstin ?? null,
          notes: 'Auto-synced from Food Vendor',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'food.vendor.created',
        entityType: 'food_vendors',
        entityId: foodVendor.id,
        newValues: { name: foodVendor.name, category: foodVendor.category, phone: foodVendor.phone },
        ipAddress: ip,
      });

      return foodVendor;
    });
  }

  async findAllVendors(query: FoodVendorQueryDto, rbac: RbacContext) {
    if (rbac.role === 'RESIDENT' || rbac.role === 'STAFF') {
      throw new ForbiddenException('Not authorized to access vendor directory');
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.food_vendorsWhereInput = {
      organizationId: rbac.organizationId,
    };

    if (query.propertyId) {
      where.propertyId = query.propertyId;
    }

    if (query.category) {
      where.category = query.category;
    }

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { contactPerson: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.food_vendors.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        include: {
          properties: { select: { id: true, name: true, code: true } },
          _count: { select: { food_expenses: true } },
        },
      }),
      this.prisma.food_vendors.count({ where }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOneVendor(id: string, rbac: RbacContext) {
    if (rbac.role === 'RESIDENT' || rbac.role === 'STAFF') {
      throw new ForbiddenException('Not authorized to access vendor directory');
    }

    const vendor = await this.prisma.food_vendors.findFirst({
      where: { id, organizationId: rbac.organizationId },
      include: {
        properties: { select: { id: true, name: true, code: true } },
        food_expenses: {
          take: 10,
          orderBy: { expenseDate: 'desc' },
        },
      },
    });

    if (!vendor) {
      throw new NotFoundException('Food vendor not found in this organization');
    }

    return vendor;
  }

  async updateVendor(
    id: string,
    dto: UpdateFoodVendorDto,
    rbac: RbacContext,
    ip?: string,
  ) {
    if (rbac.role !== 'OWNER' && rbac.role !== 'MANAGER') {
      throw new ForbiddenException('Only owners and managers can update food vendors');
    }

    const existing = await this.prisma.food_vendors.findFirst({
      where: { id, organizationId: rbac.organizationId },
    });

    if (!existing) {
      throw new NotFoundException('Food vendor not found in this organization');
    }

    if (dto.propertyId) {
      await this.verifyPropertyInOrg(dto.propertyId, rbac.organizationId);
    }

    const data: Prisma.food_vendorsUpdateInput = {
      updatedAt: new Date(),
    };
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.contactPerson !== undefined) data.contactPerson = dto.contactPerson;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.address !== undefined) data.address = dto.address;
    if (dto.gstin !== undefined) data.gstin = dto.gstin;
    if (dto.paymentTerms !== undefined) data.paymentTerms = dto.paymentTerms;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.propertyId !== undefined) {
      data.properties = dto.propertyId ? { connect: { id: dto.propertyId } } : { disconnect: true };
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.food_vendors.update({
        where: { id },
        data,
      });

      // Sync general vendor if exists
      const genVendor = await tx.vendors.findUnique({ where: { id } });
      if (genVendor) {
        await tx.vendors.update({
          where: { id },
          data: {
            name: updated.name,
            phone: updated.phone,
            contact: updated.contactPerson || updated.name,
            email: updated.email,
            address: updated.address || genVendor.address,
            gstin: updated.gstin,
            status: updated.isActive ? VendorStatus.ACTIVE : VendorStatus.INACTIVE,
            updatedAt: new Date(),
          },
        });
      }

      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'food.vendor.updated',
        entityType: 'food_vendors',
        entityId: id,
        oldValues: { name: existing.name, isActive: existing.isActive },
        newValues: { name: updated.name, isActive: updated.isActive },
        ipAddress: ip,
      });

      return updated;
    });
  }

  async deleteVendor(id: string, rbac: RbacContext, ip?: string) {
    if (rbac.role !== 'OWNER' && rbac.role !== 'MANAGER') {
      throw new ForbiddenException('Only owners and managers can delete food vendors');
    }

    const existing = await this.prisma.food_vendors.findFirst({
      where: { id, organizationId: rbac.organizationId },
      include: { _count: { select: { food_expenses: true } } },
    });

    if (!existing) {
      throw new NotFoundException('Food vendor not found in this organization');
    }

    return this.prisma.$transaction(async (tx) => {
      if (existing._count.food_expenses > 0) {
        // Soft delete if expenses exist
        await tx.food_vendors.update({
          where: { id },
          data: { isActive: false, updatedAt: new Date() },
        });
        await tx.vendors.updateMany({
          where: { id },
          data: { status: VendorStatus.INACTIVE, updatedAt: new Date() },
        });
      } else {
        await tx.food_vendors.delete({ where: { id } });
        await tx.vendors.deleteMany({ where: { id } });
      }

      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'food.vendor.deleted',
        entityType: 'food_vendors',
        entityId: id,
        oldValues: { name: existing.name },
        ipAddress: ip,
      });

      return { success: true, message: 'Food vendor deleted successfully' };
    });
  }

  // ----------------------------------------------------
  // FOOD EXPENSES
  // ----------------------------------------------------

  async createExpense(dto: CreateFoodExpenseDto, rbac: RbacContext, ip?: string) {
    if (rbac.role === 'RESIDENT' || rbac.role === 'STAFF') {
      throw new ForbiddenException('Not authorized to manage food expenses');
    }

    await this.verifyPropertyInOrg(dto.propertyId, rbac.organizationId);

    if (dto.vendorId) {
      const vendor = await this.prisma.food_vendors.findFirst({
        where: { id: dto.vendorId, organizationId: rbac.organizationId },
      });
      if (!vendor) {
        throw new NotFoundException('Food vendor not found in this organization');
      }
    }

    const amountDecimal = new Prisma.Decimal(dto.amount);
    const expenseDate = dto.expenseDate ? new Date(dto.expenseDate) : new Date();

    return this.prisma.$transaction(async (tx) => {
      const expense = await tx.food_expenses.create({
        data: {
          id: randomUUID(),
          organizationId: rbac.organizationId,
          propertyId: dto.propertyId,
          vendorId: dto.vendorId ?? null,
          invoiceNumber: dto.invoiceNumber ?? null,
          amount: amountDecimal,
          expenseDate,
          itemsDescription: dto.itemsDescription,
          paymentStatus: dto.paymentStatus ?? 'PAID',
          paymentMethod: dto.paymentMethod ?? PaymentMethod.UPI,
          createdAt: new Date(),
        },
      });

      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'food.expense.created',
        entityType: 'food_expenses',
        entityId: expense.id,
        newValues: {
          amount: amountDecimal.toString(),
          propertyId: dto.propertyId,
          itemsDescription: dto.itemsDescription,
        },
        ipAddress: ip,
      });

      return expense;
    });
  }

  async findAllExpenses(query: FoodExpenseQueryDto, rbac: RbacContext) {
    if (rbac.role === 'RESIDENT' || rbac.role === 'STAFF') {
      throw new ForbiddenException('Not authorized to view food expenses');
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.food_expensesWhereInput = {
      organizationId: rbac.organizationId,
    };

    if (query.propertyId) {
      await this.verifyPropertyInOrg(query.propertyId, rbac.organizationId);
      where.propertyId = query.propertyId;
    }

    if (query.vendorId) {
      where.vendorId = query.vendorId;
    }

    if (query.paymentMethod) {
      where.paymentMethod = query.paymentMethod;
    }

    if (query.paymentStatus) {
      where.paymentStatus = query.paymentStatus;
    }

    if (query.startDate || query.endDate) {
      where.expenseDate = {};
      if (query.startDate) where.expenseDate.gte = new Date(query.startDate);
      if (query.endDate) where.expenseDate.lte = new Date(query.endDate);
    }

    const [items, total] = await Promise.all([
      this.prisma.food_expenses.findMany({
        where,
        skip,
        take: limit,
        orderBy: { expenseDate: 'desc' },
        include: {
          properties: { select: { id: true, name: true, code: true } },
          food_vendors: { select: { id: true, name: true, category: true, phone: true } },
        },
      }),
      this.prisma.food_expenses.count({ where }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOneExpense(id: string, rbac: RbacContext) {
    if (rbac.role === 'RESIDENT' || rbac.role === 'STAFF') {
      throw new ForbiddenException('Not authorized to view food expenses');
    }

    const expense = await this.prisma.food_expenses.findFirst({
      where: { id, organizationId: rbac.organizationId },
      include: {
        properties: { select: { id: true, name: true, code: true } },
        food_vendors: true,
      },
    });

    if (!expense) {
      throw new NotFoundException('Food expense not found in this organization');
    }

    return expense;
  }

  async updateExpense(
    id: string,
    dto: UpdateFoodExpenseDto,
    rbac: RbacContext,
    ip?: string,
  ) {
    if (rbac.role === 'RESIDENT' || rbac.role === 'STAFF') {
      throw new ForbiddenException('Not authorized to update food expenses');
    }

    const existing = await this.prisma.food_expenses.findFirst({
      where: { id, organizationId: rbac.organizationId },
    });

    if (!existing) {
      throw new NotFoundException('Food expense not found in this organization');
    }

    if (dto.vendorId) {
      const vendor = await this.prisma.food_vendors.findFirst({
        where: { id: dto.vendorId, organizationId: rbac.organizationId },
      });
      if (!vendor) {
        throw new NotFoundException('Food vendor not found in this organization');
      }
    }

    const data: Prisma.food_expensesUpdateInput = {};
    if (dto.amount !== undefined) data.amount = new Prisma.Decimal(dto.amount);
    if (dto.itemsDescription !== undefined) data.itemsDescription = dto.itemsDescription;
    if (dto.invoiceNumber !== undefined) data.invoiceNumber = dto.invoiceNumber;
    if (dto.paymentStatus !== undefined) data.paymentStatus = dto.paymentStatus;
    if (dto.paymentMethod !== undefined) data.paymentMethod = dto.paymentMethod;
    if (dto.expenseDate !== undefined) data.expenseDate = new Date(dto.expenseDate);
    if (dto.vendorId !== undefined) {
      data.food_vendors = dto.vendorId ? { connect: { id: dto.vendorId } } : { disconnect: true };
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.food_expenses.update({
        where: { id },
        data,
      });

      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'food.expense.updated',
        entityType: 'food_expenses',
        entityId: id,
        oldValues: { amount: existing.amount.toString() },
        newValues: { amount: updated.amount.toString() },
        ipAddress: ip,
      });

      return updated;
    });
  }

  async deleteExpense(id: string, rbac: RbacContext, ip?: string) {
    if (rbac.role === 'RESIDENT' || rbac.role === 'STAFF') {
      throw new ForbiddenException('Not authorized to delete food expenses');
    }

    const existing = await this.prisma.food_expenses.findFirst({
      where: { id, organizationId: rbac.organizationId },
    });

    if (!existing) {
      throw new NotFoundException('Food expense not found in this organization');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.food_expenses.delete({ where: { id } });

      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'food.expense.deleted',
        entityType: 'food_expenses',
        entityId: id,
        oldValues: { amount: existing.amount.toString(), itemsDescription: existing.itemsDescription },
        ipAddress: ip,
      });

      return { success: true, message: 'Food expense deleted successfully' };
    });
  }

  // ----------------------------------------------------
  // INVENTORY ITEMS & TRANSACTIONS
  // ----------------------------------------------------

  async createInventoryItem(
    dto: CreateInventoryItemDto,
    rbac: RbacContext,
    ip?: string,
  ) {
    if (rbac.role === 'RESIDENT' || rbac.role === 'ACCOUNTANT') {
      throw new ForbiddenException('Not authorized to create inventory items');
    }

    await this.verifyPropertyInOrg(dto.propertyId, rbac.organizationId);

    if (dto.vendorId) {
      const vendor = await this.prisma.vendors.findFirst({
        where: { id: dto.vendorId, organizationId: rbac.organizationId },
      });
      if (!vendor) {
        throw new NotFoundException('Vendor not found in this organization');
      }
    }

    const currentStock = new Prisma.Decimal(dto.currentStock ?? 0.0);
    const minimumStock = new Prisma.Decimal(dto.minimumStock ?? 10.0);
    const maximumStock = new Prisma.Decimal(dto.maximumStock ?? 100.0);
    const purchasePrice = new Prisma.Decimal(dto.purchasePrice ?? 0.0);

    return this.prisma.$transaction(async (tx) => {
      const item = await tx.inventory_items.create({
        data: {
          id: randomUUID(),
          organizationId: rbac.organizationId,
          propertyId: dto.propertyId,
          name: dto.name,
          sku: dto.sku ?? null,
          category: dto.category ?? InventoryCategory.GROCERIES_FOOD,
          unit: dto.unit ?? InventoryUnit.PACK,
          currentStock,
          minimumStock,
          maximumStock,
          purchasePrice,
          vendorId: dto.vendorId ?? null,
          status: dto.status ?? InventoryStatus.IN_STOCK,
          locationNote: dto.locationNote ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'food.inventory.created',
        entityType: 'inventory_items',
        entityId: item.id,
        newValues: { name: item.name, currentStock: currentStock.toString() },
        ipAddress: ip,
      });

      return item;
    });
  }

  async findAllInventoryItems(query: InventoryItemQueryDto, rbac: RbacContext) {
    if (rbac.role === 'RESIDENT') {
      throw new ForbiddenException('Residents cannot view inventory items');
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.inventory_itemsWhereInput = {
      organizationId: rbac.organizationId,
    };

    if (query.propertyId) {
      await this.verifyPropertyInOrg(query.propertyId, rbac.organizationId);
      where.propertyId = query.propertyId;
    }

    if (query.category) {
      where.category = query.category;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { sku: { contains: query.search, mode: 'insensitive' } },
        { locationNote: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.inventory_items.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        include: {
          properties: { select: { id: true, name: true, code: true } },
          vendors: { select: { id: true, name: true, phone: true } },
        },
      }),
      this.prisma.inventory_items.count({ where }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOneInventoryItem(id: string, rbac: RbacContext) {
    if (rbac.role === 'RESIDENT') {
      throw new ForbiddenException('Residents cannot view inventory items');
    }

    const item = await this.prisma.inventory_items.findFirst({
      where: { id, organizationId: rbac.organizationId },
      include: {
        properties: { select: { id: true, name: true, code: true } },
        vendors: true,
        inventory_transactions: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!item) {
      throw new NotFoundException('Inventory item not found in this organization');
    }

    return item;
  }

  async updateInventoryItem(
    id: string,
    dto: UpdateInventoryItemDto,
    rbac: RbacContext,
    ip?: string,
  ) {
    if (rbac.role === 'RESIDENT' || rbac.role === 'ACCOUNTANT') {
      throw new ForbiddenException('Not authorized to update inventory items');
    }

    const existing = await this.prisma.inventory_items.findFirst({
      where: { id, organizationId: rbac.organizationId },
    });

    if (!existing) {
      throw new NotFoundException('Inventory item not found in this organization');
    }

    if (dto.vendorId) {
      const vendor = await this.prisma.vendors.findFirst({
        where: { id: dto.vendorId, organizationId: rbac.organizationId },
      });
      if (!vendor) {
        throw new NotFoundException('Vendor not found in this organization');
      }
    }

    const data: Prisma.inventory_itemsUpdateInput = {
      updatedAt: new Date(),
    };
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.sku !== undefined) data.sku = dto.sku;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.unit !== undefined) data.unit = dto.unit;
    if (dto.minimumStock !== undefined) data.minimumStock = new Prisma.Decimal(dto.minimumStock);
    if (dto.maximumStock !== undefined) data.maximumStock = new Prisma.Decimal(dto.maximumStock);
    if (dto.purchasePrice !== undefined) data.purchasePrice = new Prisma.Decimal(dto.purchasePrice);
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.locationNote !== undefined) data.locationNote = dto.locationNote;
    if (dto.vendorId !== undefined) {
      data.vendors = dto.vendorId ? { connect: { id: dto.vendorId } } : { disconnect: true };
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.inventory_items.update({
        where: { id },
        data,
      });

      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'food.inventory.updated',
        entityType: 'inventory_items',
        entityId: id,
        oldValues: { name: existing.name, status: existing.status },
        newValues: { name: updated.name, status: updated.status },
        ipAddress: ip,
      });

      return updated;
    });
  }

  async createInventoryTransaction(
    itemId: string,
    dto: CreateInventoryTransactionDto,
    rbac: RbacContext,
    ip?: string,
  ) {
    if (rbac.role === 'RESIDENT' || rbac.role === 'ACCOUNTANT') {
      throw new ForbiddenException('Not authorized to record inventory transactions');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Lock item row in PostgreSQL to prevent race conditions
      const [lockedItem] = await tx.$queryRaw<
        Array<{
          id: string;
          organizationId: string;
          propertyId: string;
          currentStock: string;
          minimumStock: string;
          maximumStock: string;
          status: InventoryStatus;
        }>
      >`SELECT id, "organizationId", "propertyId", "currentStock", "minimumStock", "maximumStock", status FROM inventory_items WHERE id = ${itemId}::uuid FOR UPDATE`;

      if (!lockedItem) {
        throw new NotFoundException('Inventory item not found');
      }

      if (lockedItem.organizationId !== rbac.organizationId) {
        throw new NotFoundException('Inventory item not found in this organization');
      }

      const prevStock = new Prisma.Decimal(lockedItem.currentStock);
      const qty = new Prisma.Decimal(dto.quantity);
      let newStock: Prisma.Decimal;

      switch (dto.type) {
        case InventoryTransactionType.PURCHASE:
        case InventoryTransactionType.STOCK_IN:
        case InventoryTransactionType.TRANSFER:
        case InventoryTransactionType.ADJUSTMENT:
          newStock = prevStock.add(qty);
          break;
        case InventoryTransactionType.STOCK_OUT:
        case InventoryTransactionType.DAMAGE:
        case InventoryTransactionType.LOSS:
          newStock = prevStock.sub(qty);
          break;
        default:
          newStock = prevStock.add(qty);
      }

      if (newStock.isNegative()) {
        throw new BadRequestException(
          'Insufficient inventory stock. Stock cannot become negative.',
        );
      }

      let newStatus: InventoryStatus = InventoryStatus.IN_STOCK;
      if (newStock.isZero()) {
        newStatus = InventoryStatus.OUT_OF_STOCK;
      } else if (newStock.lessThanOrEqualTo(new Prisma.Decimal(lockedItem.minimumStock))) {
        newStatus = InventoryStatus.LOW_STOCK;
      }

      await tx.inventory_items.update({
        where: { id: itemId },
        data: {
          currentStock: newStock,
          status: newStatus,
          updatedAt: new Date(),
        },
      });

      const unitPrice = dto.unitPrice !== undefined ? new Prisma.Decimal(dto.unitPrice) : null;
      const totalAmount = dto.totalAmount !== undefined
        ? new Prisma.Decimal(dto.totalAmount)
        : unitPrice ? qty.mul(unitPrice) : null;

      const transaction = await tx.inventory_transactions.create({
        data: {
          id: randomUUID(),
          organizationId: rbac.organizationId,
          propertyId: lockedItem.propertyId,
          itemId,
          type: dto.type,
          quantity: qty,
          previousStock: prevStock,
          newStock,
          unitPrice,
          totalAmount,
          referenceNumber: dto.referenceNumber ?? null,
          vendorId: dto.vendorId ?? null,
          performedByUserId: rbac.userId,
          notes: dto.notes ?? null,
          createdAt: new Date(),
        },
      });

      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'food.inventory.transaction_created',
        entityType: 'inventory_transactions',
        entityId: transaction.id,
        newValues: {
          itemId,
          type: dto.type,
          quantity: qty.toString(),
          previousStock: prevStock.toString(),
          newStock: newStock.toString(),
        },
        ipAddress: ip,
      });

      return transaction;
    });
  }

  async findInventoryTransactions(
    itemId: string,
    query: InventoryTransactionQueryDto,
    rbac: RbacContext,
  ) {
    if (rbac.role === 'RESIDENT') {
      throw new ForbiddenException('Residents cannot view inventory transactions');
    }

    const item = await this.prisma.inventory_items.findFirst({
      where: { id: itemId, organizationId: rbac.organizationId },
    });

    if (!item) {
      throw new NotFoundException('Inventory item not found in this organization');
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.inventory_transactionsWhereInput = {
      itemId,
      organizationId: rbac.organizationId,
    };

    if (query.type) {
      where.type = query.type;
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    const [items, total] = await Promise.all([
      this.prisma.inventory_transactions.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          users: { select: { id: true, firstName: true, lastName: true, email: true } },
          vendors: { select: { id: true, name: true } },
        },
      }),
      this.prisma.inventory_transactions.count({ where }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ----------------------------------------------------
  // PURCHASE RECORDS & ITEMS
  // ----------------------------------------------------

  async createPurchaseRecord(
    dto: CreatePurchaseRecordDto,
    rbac: RbacContext,
    ip?: string,
  ) {
    if (rbac.role === 'RESIDENT' || rbac.role === 'STAFF') {
      throw new ForbiddenException('Not authorized to create purchase records');
    }

    await this.verifyPropertyInOrg(dto.propertyId, rbac.organizationId);

    const vendor = await this.prisma.vendors.findFirst({
      where: { id: dto.vendorId, organizationId: rbac.organizationId },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor not found in this organization');
    }

    const purchaseDate = new Date(dto.purchaseDate);
    const taxAmount = new Prisma.Decimal(dto.taxAmount ?? 0.0);
    const discountAmount = new Prisma.Decimal(dto.discountAmount ?? 0.0);

    return this.prisma.$transaction(async (tx) => {
      const recordId = randomUUID();
      let totalAmount = new Prisma.Decimal(0.0);

      const record = await tx.purchase_records.create({
        data: {
          id: recordId,
          organizationId: rbac.organizationId,
          propertyId: dto.propertyId,
          vendorId: dto.vendorId,
          poNumber: dto.poNumber,
          invoiceNumber: dto.invoiceNumber ?? null,
          purchaseDate,
          totalAmount,
          taxAmount,
          discountAmount,
          netAmount: totalAmount.add(taxAmount).sub(discountAmount),
          status: dto.status ?? PurchaseRecordStatus.RECEIVED,
          notes: dto.notes ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      if (dto.items && dto.items.length > 0) {
        for (const item of dto.items) {
          const invItem = await tx.inventory_items.findFirst({
            where: {
              id: item.inventoryItemId,
              organizationId: rbac.organizationId,
              propertyId: dto.propertyId,
            },
          });
          if (!invItem) {
            throw new NotFoundException(
              `Inventory item ${item.inventoryItemId} not found in this property`,
            );
          }

          const qty = new Prisma.Decimal(item.quantity);
          const uPrice = new Prisma.Decimal(item.unitPrice);
          const itemTotal = qty.mul(uPrice);
          totalAmount = totalAmount.add(itemTotal);

          await tx.purchase_record_items.create({
            data: {
              id: randomUUID(),
              purchaseRecordId: recordId,
              inventoryItemId: item.inventoryItemId,
              quantity: qty,
              unitPrice: uPrice,
              totalPrice: itemTotal,
            },
          });
        }

        const netAmount = totalAmount.add(taxAmount).sub(discountAmount);
        await tx.purchase_records.update({
          where: { id: recordId },
          data: {
            totalAmount,
            netAmount,
            updatedAt: new Date(),
          },
        });
      }

      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'food.purchase.created',
        entityType: 'purchase_records',
        entityId: recordId,
        newValues: {
          poNumber: dto.poNumber,
          vendorId: dto.vendorId,
          totalAmount: totalAmount.toString(),
        },
        ipAddress: ip,
      });

      return tx.purchase_records.findUnique({
        where: { id: recordId },
        include: {
          purchase_record_items: {
            include: { inventory_items: { select: { id: true, name: true, unit: true } } },
          },
          vendors: { select: { id: true, name: true, phone: true } },
          properties: { select: { id: true, name: true, code: true } },
        },
      });
    });
  }

  async findAllPurchaseRecords(query: PurchaseRecordQueryDto, rbac: RbacContext) {
    if (rbac.role === 'RESIDENT' || rbac.role === 'STAFF') {
      throw new ForbiddenException('Not authorized to view purchase records');
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.purchase_recordsWhereInput = {
      organizationId: rbac.organizationId,
    };

    if (query.propertyId) {
      await this.verifyPropertyInOrg(query.propertyId, rbac.organizationId);
      where.propertyId = query.propertyId;
    }

    if (query.vendorId) {
      where.vendorId = query.vendorId;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.startDate || query.endDate) {
      where.purchaseDate = {};
      if (query.startDate) where.purchaseDate.gte = new Date(query.startDate);
      if (query.endDate) where.purchaseDate.lte = new Date(query.endDate);
    }

    const [items, total] = await Promise.all([
      this.prisma.purchase_records.findMany({
        where,
        skip,
        take: limit,
        orderBy: { purchaseDate: 'desc' },
        include: {
          properties: { select: { id: true, name: true, code: true } },
          vendors: { select: { id: true, name: true, phone: true } },
          purchase_record_items: {
            include: { inventory_items: { select: { id: true, name: true, unit: true } } },
          },
        },
      }),
      this.prisma.purchase_records.count({ where }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOnePurchaseRecord(id: string, rbac: RbacContext) {
    if (rbac.role === 'RESIDENT' || rbac.role === 'STAFF') {
      throw new ForbiddenException('Not authorized to view purchase records');
    }

    const record = await this.prisma.purchase_records.findFirst({
      where: { id, organizationId: rbac.organizationId },
      include: {
        properties: { select: { id: true, name: true, code: true } },
        vendors: true,
        purchase_record_items: {
          include: { inventory_items: true },
        },
      },
    });

    if (!record) {
      throw new NotFoundException('Purchase record not found in this organization');
    }

    return record;
  }

  async updatePurchaseRecord(
    id: string,
    dto: UpdatePurchaseRecordDto,
    rbac: RbacContext,
    ip?: string,
  ) {
    if (rbac.role === 'RESIDENT' || rbac.role === 'STAFF') {
      throw new ForbiddenException('Not authorized to update purchase records');
    }

    const existing = await this.prisma.purchase_records.findFirst({
      where: { id, organizationId: rbac.organizationId },
    });

    if (!existing) {
      throw new NotFoundException('Purchase record not found in this organization');
    }

    const data: Prisma.purchase_recordsUpdateInput = {
      updatedAt: new Date(),
    };
    if (dto.invoiceNumber !== undefined) data.invoiceNumber = dto.invoiceNumber;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.purchaseDate !== undefined) data.purchaseDate = new Date(dto.purchaseDate);

    const taxAmount = dto.taxAmount !== undefined
      ? new Prisma.Decimal(dto.taxAmount)
      : existing.taxAmount;
    const discountAmount = dto.discountAmount !== undefined
      ? new Prisma.Decimal(dto.discountAmount)
      : existing.discountAmount;

    data.taxAmount = taxAmount;
    data.discountAmount = discountAmount;
    data.netAmount = existing.totalAmount.add(taxAmount).sub(discountAmount);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.purchase_records.update({
        where: { id },
        data,
        include: {
          purchase_record_items: { include: { inventory_items: true } },
          vendors: true,
        },
      });

      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'food.purchase.updated',
        entityType: 'purchase_records',
        entityId: id,
        oldValues: { status: existing.status, netAmount: existing.netAmount.toString() },
        newValues: { status: updated.status, netAmount: updated.netAmount.toString() },
        ipAddress: ip,
      });

      return updated;
    });
  }

  async findPurchaseRecordItems(purchaseRecordId: string, rbac: RbacContext) {
    if (rbac.role === 'RESIDENT' || rbac.role === 'STAFF') {
      throw new ForbiddenException('Not authorized to view purchase records');
    }

    const purchase = await this.prisma.purchase_records.findFirst({
      where: { id: purchaseRecordId, organizationId: rbac.organizationId },
    });

    if (!purchase) {
      throw new NotFoundException('Purchase record not found in this organization');
    }

    return this.prisma.purchase_record_items.findMany({
      where: { purchaseRecordId },
      include: { inventory_items: true },
    });
  }

  async addPurchaseRecordItem(
    purchaseRecordId: string,
    dto: CreatePurchaseRecordItemDto,
    rbac: RbacContext,
    ip?: string,
  ) {
    if (rbac.role === 'RESIDENT' || rbac.role === 'STAFF') {
      throw new ForbiddenException('Not authorized to modify purchase records');
    }

    const purchase = await this.prisma.purchase_records.findFirst({
      where: { id: purchaseRecordId, organizationId: rbac.organizationId },
    });

    if (!purchase) {
      throw new NotFoundException('Purchase record not found in this organization');
    }

    const invItem = await this.prisma.inventory_items.findFirst({
      where: {
        id: dto.inventoryItemId,
        organizationId: rbac.organizationId,
        propertyId: purchase.propertyId,
      },
    });

    if (!invItem) {
      throw new NotFoundException('Inventory item not found in this property');
    }

    const qty = new Prisma.Decimal(dto.quantity);
    const uPrice = new Prisma.Decimal(dto.unitPrice);
    const itemTotal = qty.mul(uPrice);

    return this.prisma.$transaction(async (tx) => {
      const newItem = await tx.purchase_record_items.create({
        data: {
          id: randomUUID(),
          purchaseRecordId,
          inventoryItemId: dto.inventoryItemId,
          quantity: qty,
          unitPrice: uPrice,
          totalPrice: itemTotal,
        },
      });

      const allItems = await tx.purchase_record_items.findMany({
        where: { purchaseRecordId },
      });
      let newTotal = new Prisma.Decimal(0);
      for (const it of allItems) {
        newTotal = newTotal.add(it.totalPrice);
      }
      const newNet = newTotal.add(purchase.taxAmount).sub(purchase.discountAmount);

      await tx.purchase_records.update({
        where: { id: purchaseRecordId },
        data: {
          totalAmount: newTotal,
          netAmount: newNet,
          updatedAt: new Date(),
        },
      });

      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'food.purchase.updated',
        entityType: 'purchase_records',
        entityId: purchaseRecordId,
        newValues: { addedItemId: newItem.id, newTotal: newTotal.toString() },
        ipAddress: ip,
      });

      return newItem;
    });
  }

  // ----------------------------------------------------
  // REPORTS
  // ----------------------------------------------------

  async getMealSummaryReport(query: FoodReportQueryDto, rbac: RbacContext) {
    const where: Prisma.meal_recordsWhereInput = {
      organizationId: rbac.organizationId,
    };

    if (query.propertyId) {
      await this.verifyPropertyInOrg(query.propertyId, rbac.organizationId);
      where.propertyId = query.propertyId;
    }

    if (query.startDate || query.endDate) {
      where.mealDate = {};
      if (query.startDate) where.mealDate.gte = new Date(query.startDate);
      if (query.endDate) where.mealDate.lte = new Date(query.endDate);
    }

    const meals = await this.prisma.meal_records.findMany({
      where,
      select: {
        mealType: true,
        expectedCount: true,
        actualCount: true,
      },
    });

    let totalExpected = 0;
    let totalActual = 0;
    const byType: Record<string, { count: number; expected: number; actual: number }> = {
      BREAKFAST: { count: 0, expected: 0, actual: 0 },
      LUNCH: { count: 0, expected: 0, actual: 0 },
      SNACKS: { count: 0, expected: 0, actual: 0 },
      DINNER: { count: 0, expected: 0, actual: 0 },
    };

    for (const m of meals) {
      totalExpected += m.expectedCount;
      totalActual += m.actualCount;
      if (byType[m.mealType]) {
        byType[m.mealType].count += 1;
        byType[m.mealType].expected += m.expectedCount;
        byType[m.mealType].actual += m.actualCount;
      }
    }

    const attendanceRate =
      totalExpected > 0 ? ((totalActual / totalExpected) * 100).toFixed(2) + '%' : '0.00%';

    return {
      totalMealsLogged: meals.length,
      totalExpectedCount: totalExpected,
      totalActualCount: totalActual,
      attendanceRate,
      byMealType: byType,
    };
  }

  async getAttendanceReport(query: FoodReportQueryDto, rbac: RbacContext) {
    const where: Prisma.meal_attendancesWhereInput = {
      meal_records: {
        organizationId: rbac.organizationId,
      },
    };

    if (query.propertyId) {
      await this.verifyPropertyInOrg(query.propertyId, rbac.organizationId);
      where.meal_records = {
        organizationId: rbac.organizationId,
        propertyId: query.propertyId,
      };
    }

    if (query.startDate || query.endDate) {
      where.meal_records = {
        ...(where.meal_records as any),
        mealDate: {},
      };
      if (query.startDate) (where.meal_records as any).mealDate.gte = new Date(query.startDate);
      if (query.endDate) (where.meal_records as any).mealDate.lte = new Date(query.endDate);
    }

    const attendances = await this.prisma.meal_attendances.findMany({
      where,
      select: { status: true },
    });

    let present = 0;
    let absent = 0;
    let optedOut = 0;

    for (const a of attendances) {
      if (a.status === MealAttendanceStatus.PRESENT) present++;
      else if (a.status === MealAttendanceStatus.ABSENT) absent++;
      else if (a.status === MealAttendanceStatus.OPTED_OUT) optedOut++;
    }

    const total = attendances.length;
    const optOutRate = total > 0 ? ((optedOut / total) * 100).toFixed(2) + '%' : '0.00%';

    return {
      totalAttendances: total,
      presentCount: present,
      absentCount: absent,
      optedOutCount: optedOut,
      optOutRate,
      byStatus: {
        PRESENT: present,
        ABSENT: absent,
        OPTED_OUT: optedOut,
      },
    };
  }

  async getExpensesReport(query: FoodReportQueryDto, rbac: RbacContext) {
    const where: Prisma.food_expensesWhereInput = {
      organizationId: rbac.organizationId,
    };

    if (query.propertyId) {
      await this.verifyPropertyInOrg(query.propertyId, rbac.organizationId);
      where.propertyId = query.propertyId;
    }

    if (query.startDate || query.endDate) {
      where.expenseDate = {};
      if (query.startDate) where.expenseDate.gte = new Date(query.startDate);
      if (query.endDate) where.expenseDate.lte = new Date(query.endDate);
    }

    const expenses = await this.prisma.food_expenses.findMany({
      where,
      select: {
        amount: true,
        paymentMethod: true,
        food_vendors: { select: { name: true } },
      },
    });

    let totalAmount = new Prisma.Decimal(0);
    const byMethod: Record<string, Prisma.Decimal> = {};
    const byVendor: Record<string, Prisma.Decimal> = {};

    for (const e of expenses) {
      totalAmount = totalAmount.add(e.amount);
      byMethod[e.paymentMethod] = (byMethod[e.paymentMethod] || new Prisma.Decimal(0)).add(e.amount);
      const vName = e.food_vendors?.name || 'Direct / Unspecified';
      byVendor[vName] = (byVendor[vName] || new Prisma.Decimal(0)).add(e.amount);
    }

    const byMethodStr: Record<string, string> = {};
    for (const k of Object.keys(byMethod)) {
      byMethodStr[k] = byMethod[k].toFixed(2);
    }

    const byVendorArr = Object.entries(byVendor).map(([vendor, amt]) => ({
      vendor,
      amount: amt.toFixed(2),
    }));

    return {
      totalExpensesCount: expenses.length,
      totalAmount: totalAmount.toFixed(2),
      byPaymentMethod: byMethodStr,
      byVendor: byVendorArr,
    };
  }

  async getInventoryReport(query: FoodReportQueryDto, rbac: RbacContext) {
    const where: Prisma.inventory_itemsWhereInput = {
      organizationId: rbac.organizationId,
    };

    if (query.propertyId) {
      await this.verifyPropertyInOrg(query.propertyId, rbac.organizationId);
      where.propertyId = query.propertyId;
    }

    const items = await this.prisma.inventory_items.findMany({
      where,
      select: {
        currentStock: true,
        purchasePrice: true,
        status: true,
      },
    });

    let inStock = 0;
    let lowStock = 0;
    let outOfStock = 0;
    let discontinued = 0;
    let totalValuation = new Prisma.Decimal(0);

    for (const it of items) {
      if (it.status === InventoryStatus.IN_STOCK) inStock++;
      else if (it.status === InventoryStatus.LOW_STOCK) lowStock++;
      else if (it.status === InventoryStatus.OUT_OF_STOCK) outOfStock++;
      else if (it.status === InventoryStatus.DISCONTINUED) discontinued++;

      totalValuation = totalValuation.add(it.currentStock.mul(it.purchasePrice));
    }

    return {
      totalItems: items.length,
      inStockCount: inStock,
      lowStockCount: lowStock,
      outOfStockCount: outOfStock,
      discontinuedCount: discontinued,
      totalValuation: totalValuation.toFixed(2),
    };
  }

  async getPurchasesReport(query: FoodReportQueryDto, rbac: RbacContext) {
    const where: Prisma.purchase_recordsWhereInput = {
      organizationId: rbac.organizationId,
    };

    if (query.propertyId) {
      await this.verifyPropertyInOrg(query.propertyId, rbac.organizationId);
      where.propertyId = query.propertyId;
    }

    if (query.startDate || query.endDate) {
      where.purchaseDate = {};
      if (query.startDate) where.purchaseDate.gte = new Date(query.startDate);
      if (query.endDate) where.purchaseDate.lte = new Date(query.endDate);
    }

    const purchases = await this.prisma.purchase_records.findMany({
      where,
      select: {
        totalAmount: true,
        taxAmount: true,
        discountAmount: true,
        netAmount: true,
        status: true,
      },
    });

    let totalAmount = new Prisma.Decimal(0);
    let totalTax = new Prisma.Decimal(0);
    let totalDiscount = new Prisma.Decimal(0);
    let totalNet = new Prisma.Decimal(0);
    const byStatus: Record<string, number> = {};

    for (const p of purchases) {
      totalAmount = totalAmount.add(p.totalAmount);
      totalTax = totalTax.add(p.taxAmount);
      totalDiscount = totalDiscount.add(p.discountAmount);
      totalNet = totalNet.add(p.netAmount);
      byStatus[p.status] = (byStatus[p.status] || 0) + 1;
    }

    return {
      totalPurchasesCount: purchases.length,
      totalAmount: totalAmount.toFixed(2),
      totalTax: totalTax.toFixed(2),
      totalDiscount: totalDiscount.toFixed(2),
      totalSpent: totalNet.toFixed(2),
      byStatus,
    };
  }
}
