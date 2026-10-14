import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RbacContext } from '../rbac/types/rbac.types';
import { ExpenseReportQueryDto } from './dto/expense-report-query.dto';
import { OccupancyReportQueryDto } from './dto/occupancy-report-query.dto';
import { ReportDateQueryDto } from './dto/report-date-query.dto';
import { ReportPaginationDto } from './dto/report-pagination.dto';
import { ResidentReportQueryDto } from './dto/resident-report-query.dto';
import { RevenueReportQueryDto } from './dto/revenue-report-query.dto';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // ----------------------------------------------------
  // HELPERS
  // ----------------------------------------------------

  private validateDateRange(startDate?: string, endDate?: string): void {
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new BadRequestException('Invalid date format for startDate or endDate');
      }
      if (start > end) {
        throw new BadRequestException('startDate must not be after endDate');
      }
    }
  }

  private async validateProperty(propertyId: string | undefined, organizationId: string): Promise<void> {
    if (!propertyId) return;
    const property = await this.prisma.properties.findFirst({
      where: {
        id: propertyId,
        organizationId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!property) {
      throw new NotFoundException(`Property with ID ${propertyId} not found in this organization`);
    }
  }

  private toNumber(val: any): number {
    if (val === null || val === undefined) return 0;
    const num = Number(val);
    return isNaN(num) ? 0 : num;
  }

  private calcPercentage(numerator: number, denominator: number): number {
    if (!denominator || denominator <= 0) return 0;
    return Number(((numerator / denominator) * 100).toFixed(2));
  }

  // ----------------------------------------------------
  // 1. DASHBOARD SUMMARY
  // ----------------------------------------------------
  async getDashboard(rbac: RbacContext, query: ReportDateQueryDto) {
    await this.validateProperty(query.propertyId, rbac.organizationId);
    this.validateDateRange(query.startDate, query.endDate);

    const orgId = rbac.organizationId;
    const propFilter = query.propertyId ? { propertyId: query.propertyId } : {};

    const [
      totalProperties,
      totalRooms,
      totalBeds,
      occupiedBeds,
      availableBeds,
      reservedBeds,
      maintenanceBeds,
      totalResidents,
      activeResidents,
      noticePeriodResidents,
      enquiriesCount,
      pendingEnquiries,
      activeBookings,
      moveIns,
      moveOuts,
      invoicesSum,
      paymentsSum,
      outstandingSum,
      generalExpensesSum,
      foodExpensesSum,
      openComplaints,
      openMaintenance,
      pendingStaffTasks,
      totalStaff,
      checkedInVisitors,
      leaveLogs,
    ] = await Promise.all([
      this.prisma.properties.count({
        where: {
          organizationId: orgId,
          deletedAt: null,
          ...(query.propertyId ? { id: query.propertyId } : {}),
        },
      }),
      this.prisma.rooms.count({
        where: {
          organizationId: orgId,
          deletedAt: null,
          isActive: true,
          ...propFilter,
        },
      }),
      this.prisma.beds.count({
        where: {
          organizationId: orgId,
          deletedAt: null,
          ...propFilter,
        },
      }),
      this.prisma.beds.count({
        where: {
          organizationId: orgId,
          deletedAt: null,
          status: 'OCCUPIED',
          ...propFilter,
        },
      }),
      this.prisma.beds.count({
        where: {
          organizationId: orgId,
          deletedAt: null,
          status: 'AVAILABLE',
          ...propFilter,
        },
      }),
      this.prisma.beds.count({
        where: {
          organizationId: orgId,
          deletedAt: null,
          status: 'RESERVED',
          ...propFilter,
        },
      }),
      this.prisma.beds.count({
        where: {
          organizationId: orgId,
          deletedAt: null,
          status: 'MAINTENANCE',
          ...propFilter,
        },
      }),
      this.prisma.residents.count({
        where: {
          organizationId: orgId,
          deletedAt: null,
          ...propFilter,
        },
      }),
      this.prisma.residents.count({
        where: {
          organizationId: orgId,
          deletedAt: null,
          status: 'ACTIVE',
          ...propFilter,
        },
      }),
      this.prisma.residents.count({
        where: {
          organizationId: orgId,
          deletedAt: null,
          status: 'NOTICE_PERIOD',
          ...propFilter,
        },
      }),
      this.prisma.enquiries.count({
        where: {
          organizationId: orgId,
          deletedAt: null,
          ...propFilter,
        },
      }),
      this.prisma.enquiries.count({
        where: {
          organizationId: orgId,
          deletedAt: null,
          status: 'NEW',
          ...propFilter,
        },
      }),
      this.prisma.bookings.count({
        where: {
          organizationId: orgId,
          status: 'CONFIRMED',
          ...propFilter,
        },
      }),
      this.prisma.move_ins.count({
        where: {
          organizationId: orgId,
          status: 'COMPLETED',
          ...propFilter,
        },
      }),
      this.prisma.move_outs.count({
        where: {
          organizationId: orgId,
          status: 'COMPLETED',
          ...propFilter,
        },
      }),
      this.prisma.invoices.aggregate({
        where: {
          organizationId: orgId,
          status: { notIn: ['CANCELLED', 'DRAFT'] },
          ...propFilter,
        },
        _sum: { netPayable: true },
      }),
      this.prisma.payments.aggregate({
        where: {
          organizationId: orgId,
          status: { in: ['RECORDED', 'VERIFIED'] },
          deletedAt: null,
          ...propFilter,
        },
        _sum: { amount: true },
      }),
      this.prisma.invoices.aggregate({
        where: {
          organizationId: orgId,
          status: { in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] },
          ...propFilter,
        },
        _sum: { outstandingAmount: true },
      }),
      this.prisma.expenses.aggregate({
        where: {
          organizationId: orgId,
          deletedAt: null,
          ...propFilter,
        },
        _sum: { amount: true },
      }),
      this.prisma.food_expenses.aggregate({
        where: {
          organizationId: orgId,
          ...propFilter,
        },
        _sum: { amount: true },
      }),
      this.prisma.complaints.count({
        where: {
          organizationId: orgId,
          status: { in: ['SUBMITTED', 'REVIEWED', 'INVESTIGATING'] },
          ...propFilter,
        },
      }),
      this.prisma.maintenance_requests.count({
        where: {
          organizationId: orgId,
          status: { in: ['CREATED', 'ASSIGNED', 'IN_PROGRESS'] },
          ...propFilter,
        },
      }),
      this.prisma.staff_tasks.count({
        where: {
          organizationId: orgId,
          status: { in: ['PENDING', 'IN_PROGRESS'] },
          ...propFilter,
        },
      }),
      this.prisma.staff_profiles.count({
        where: {
          organizationId: orgId,
          status: 'ACTIVE',
          ...(query.propertyId ? { propertyId: query.propertyId } : {}),
        },
      }),
      this.prisma.visitors.count({
        where: {
          organizationId: orgId,
          status: 'CHECKED_IN',
          ...propFilter,
        },
      }),
      this.prisma.audit_logs.findMany({
        where: {
          organizationId: orgId,
          entityType: 'leaves',
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // Reconstruct pending leaves count from audit_logs
    const leavesMap = new Map<string, any>();
    for (const log of leaveLogs) {
      try {
        const item = JSON.parse(log.newValues);
        if (!query.propertyId || item.propertyId === query.propertyId) {
          leavesMap.set(item.id, item);
        }
      } catch {}
    }
    const pendingLeaves = Array.from(leavesMap.values()).filter((l) => l.status === 'PENDING').length;

    const totalInvoiced = this.toNumber(invoicesSum._sum.netPayable);
    const totalCollected = this.toNumber(paymentsSum._sum.amount);
    const totalOutstanding = this.toNumber(outstandingSum._sum.outstandingAmount);
    const totalGeneralExpenses = this.toNumber(generalExpensesSum._sum.amount);
    const totalFoodExpenses = this.toNumber(foodExpensesSum._sum.amount);
    const totalExpenses = totalGeneralExpenses + totalFoodExpenses;
    const netOperatingIncome = totalCollected - totalExpenses;

    const occupancyPercentage = this.calcPercentage(occupiedBeds, totalBeds);

    return {
      properties: {
        totalProperties,
        totalRooms,
        totalBeds,
      },
      occupancy: {
        totalBeds,
        occupiedBeds,
        availableBeds,
        reservedBeds,
        maintenanceBeds,
        occupancyPercentage,
      },
      residents: {
        totalResidents,
        activeResidents,
        noticePeriodResidents,
      },
      financials: {
        totalInvoiced,
        totalCollected,
        totalOutstanding,
        totalGeneralExpenses,
        totalFoodExpenses,
        totalExpenses,
        netOperatingIncome,
      },
      bookings: {
        enquiriesCount,
        pendingEnquiries,
        activeBookings,
        moveIns,
        moveOuts,
      },
      operations: {
        openComplaints,
        openMaintenance,
        pendingStaffTasks,
      },
      staff: {
        totalStaff,
      },
      visitors: {
        checkedInVisitors,
      },
      leaves: {
        pendingLeaves,
      },
    };
  }

  // ----------------------------------------------------
  // 2. OCCUPANCY REPORT
  // ----------------------------------------------------
  async getOccupancy(rbac: RbacContext, query: OccupancyReportQueryDto) {
    await this.validateProperty(query.propertyId, rbac.organizationId);
    this.validateDateRange(query.startDate, query.endDate);

    const orgId = rbac.organizationId;
    const propFilter = query.propertyId ? { propertyId: query.propertyId } : {};

    const [totalRooms, totalBeds, occupiedBeds, availableBeds, reservedBeds, maintenanceBeds] =
      await Promise.all([
        this.prisma.rooms.count({
          where: { organizationId: orgId, deletedAt: null, isActive: true, ...propFilter },
        }),
        this.prisma.beds.count({
          where: { organizationId: orgId, deletedAt: null, ...propFilter },
        }),
        this.prisma.beds.count({
          where: { organizationId: orgId, deletedAt: null, status: 'OCCUPIED', ...propFilter },
        }),
        this.prisma.beds.count({
          where: { organizationId: orgId, deletedAt: null, status: 'AVAILABLE', ...propFilter },
        }),
        this.prisma.beds.count({
          where: { organizationId: orgId, deletedAt: null, status: 'RESERVED', ...propFilter },
        }),
        this.prisma.beds.count({
          where: { organizationId: orgId, deletedAt: null, status: 'MAINTENANCE', ...propFilter },
        }),
      ]);

    // Breakdown by room type
    const roomTypeStats = await this.prisma.rooms.groupBy({
      by: ['roomType'],
      where: { organizationId: orgId, deletedAt: null, isActive: true, ...propFilter },
      _count: { id: true },
    });

    // Breakdown by property
    const properties = await this.prisma.properties.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        ...(query.propertyId ? { id: query.propertyId } : {}),
      },
      select: {
        id: true,
        name: true,
        rooms: {
          where: { deletedAt: null, isActive: true },
          select: {
            id: true,
            beds: {
              where: { deletedAt: null },
              select: { id: true, status: true },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const byProperty = properties.map((p) => {
      const pTotalRooms = p.rooms.length;
      let pTotalBeds = 0;
      let pOccupied = 0;
      let pAvailable = 0;
      let pReserved = 0;

      for (const r of p.rooms) {
        for (const b of r.beds) {
          pTotalBeds++;
          if (b.status === 'OCCUPIED') pOccupied++;
          else if (b.status === 'AVAILABLE') pAvailable++;
          else if (b.status === 'RESERVED') pReserved++;
        }
      }

      return {
        propertyId: p.id,
        propertyName: p.name,
        totalRooms: pTotalRooms,
        totalBeds: pTotalBeds,
        occupiedBeds: pOccupied,
        availableBeds: pAvailable,
        reservedBeds: pReserved,
        occupancyPercentage: this.calcPercentage(pOccupied, pTotalBeds),
      };
    });

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const total = byProperty.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const paginatedProperties = byProperty.slice((page - 1) * limit, page * limit);

    return {
      summary: {
        totalRooms,
        totalBeds,
        occupiedBeds,
        availableBeds,
        reservedBeds,
        maintenanceBeds,
        occupancyPercentage: this.calcPercentage(occupiedBeds, totalBeds),
      },
      byProperty: paginatedProperties,
      byRoomType: roomTypeStats.map((r) => ({
        roomType: r.roomType,
        totalRooms: r._count.id,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  // ----------------------------------------------------
  // 3. PROPERTY-WISE REPORT
  // ----------------------------------------------------
  async getProperties(rbac: RbacContext, query: ReportPaginationDto) {
    await this.validateProperty(query.propertyId, rbac.organizationId);

    const orgId = rbac.organizationId;
    const where: Prisma.propertiesWhereInput = {
      organizationId: orgId,
      deletedAt: null,
      ...(query.propertyId ? { id: query.propertyId } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { city: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const [total, properties] = await Promise.all([
      this.prisma.properties.count({ where }),
      this.prisma.properties.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          city: true,
          area: true,
          status: true,
        },
      }),
    ]);

    let sumRooms = 0;
    let sumBeds = 0;
    let sumOccupied = 0;

    const items = await Promise.all(
      properties.map(async (p) => {
        const [roomsCount, beds, activeResidents, invAgg, payAgg, expAgg, foodExpAgg] =
          await Promise.all([
            this.prisma.rooms.count({
              where: { propertyId: p.id, organizationId: orgId, deletedAt: null, isActive: true },
            }),
            this.prisma.beds.findMany({
              where: { propertyId: p.id, organizationId: orgId, deletedAt: null },
              select: { status: true },
            }),
            this.prisma.residents.count({
              where: { propertyId: p.id, organizationId: orgId, deletedAt: null, status: 'ACTIVE' },
            }),
            this.prisma.invoices.aggregate({
              where: { propertyId: p.id, organizationId: orgId, status: { notIn: ['CANCELLED', 'DRAFT'] } },
              _sum: { netPayable: true, outstandingAmount: true },
            }),
            this.prisma.payments.aggregate({
              where: {
                propertyId: p.id,
                organizationId: orgId,
                status: { in: ['RECORDED', 'VERIFIED'] },
                deletedAt: null,
              },
              _sum: { amount: true },
            }),
            this.prisma.expenses.aggregate({
              where: { propertyId: p.id, organizationId: orgId, deletedAt: null },
              _sum: { amount: true },
            }),
            this.prisma.food_expenses.aggregate({
              where: { propertyId: p.id, organizationId: orgId },
              _sum: { amount: true },
            }),
          ]);

        const totalBeds = beds.length;
        const occupiedBeds = beds.filter((b) => b.status === 'OCCUPIED').length;
        const availableBeds = beds.filter((b) => b.status === 'AVAILABLE').length;
        const reservedBeds = beds.filter((b) => b.status === 'RESERVED').length;
        const occupancyPercentage = this.calcPercentage(occupiedBeds, totalBeds);

        sumRooms += roomsCount;
        sumBeds += totalBeds;
        sumOccupied += occupiedBeds;

        const totalInvoiced = this.toNumber(invAgg._sum.netPayable);
        const outstandingAmount = this.toNumber(invAgg._sum.outstandingAmount);
        const totalCollected = this.toNumber(payAgg._sum.amount);
        const totalExpenses =
          this.toNumber(expAgg._sum.amount) + this.toNumber(foodExpAgg._sum.amount);

        return {
          propertyId: p.id,
          propertyName: p.name,
          city: p.city,
          area: p.area,
          status: p.status,
          totalRooms: roomsCount,
          totalBeds,
          occupiedBeds,
          availableBeds,
          reservedBeds,
          occupancyPercentage,
          activeResidents,
          totalInvoiced,
          totalCollected,
          outstandingAmount,
          totalExpenses,
        };
      }),
    );

    return {
      summary: {
        totalProperties: total,
        totalRooms: sumRooms,
        totalBeds: sumBeds,
        occupiedBeds: sumOccupied,
        occupancyPercentage: this.calcPercentage(sumOccupied, sumBeds),
      },
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  // ----------------------------------------------------
  // 4. REVENUE REPORT
  // ----------------------------------------------------
  async getRevenue(rbac: RbacContext, query: RevenueReportQueryDto) {
    await this.validateProperty(query.propertyId, rbac.organizationId);
    this.validateDateRange(query.startDate, query.endDate);

    const orgId = rbac.organizationId;
    const propFilter = query.propertyId ? { propertyId: query.propertyId } : {};

    const invoiceDateFilter: Prisma.invoicesWhereInput = {
      organizationId: orgId,
      status: { notIn: ['CANCELLED', 'DRAFT'] },
      ...propFilter,
      ...(query.startDate || query.endDate
        ? {
            createdAt: {
              ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
              ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
            },
          }
        : {}),
    };

    const paymentDateFilter: Prisma.paymentsWhereInput = {
      organizationId: orgId,
      status: { in: ['RECORDED', 'VERIFIED'] },
      deletedAt: null,
      ...propFilter,
      ...(query.startDate || query.endDate
        ? {
            paymentDate: {
              ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
              ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
            },
          }
        : {}),
    };

    const [invoices, payments, outstandingAgg] = await Promise.all([
      this.prisma.invoices.findMany({
        where: invoiceDateFilter,
        select: { netPayable: true, outstandingAmount: true, createdAt: true },
      }),
      this.prisma.payments.findMany({
        where: paymentDateFilter,
        select: { amount: true, paymentDate: true },
      }),
      this.prisma.invoices.aggregate({
        where: {
          organizationId: orgId,
          status: { in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] },
          ...propFilter,
        },
        _sum: { outstandingAmount: true },
      }),
    ]);

    let totalInvoiced = 0;
    const timelineMap = new Map<string, { invoiced: number; collected: number; outstanding: number }>();

    const getPeriodKey = (d: Date, groupBy = 'month') => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      if (groupBy === 'day') return `${year}-${month}-${day}`;
      if (groupBy === 'week') {
        const firstDayOfYear = new Date(year, 0, 1);
        const pastDaysOfYear = (d.getTime() - firstDayOfYear.getTime()) / 86400000;
        const weekNum = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
        return `${year}-W${String(weekNum).padStart(2, '0')}`;
      }
      return `${year}-${month}`;
    };

    const groupBy = query.groupBy ?? 'month';

    for (const inv of invoices) {
      const amount = this.toNumber(inv.netPayable);
      const out = this.toNumber(inv.outstandingAmount);
      totalInvoiced += amount;
      const key = getPeriodKey(new Date(inv.createdAt), groupBy);
      const entry = timelineMap.get(key) || { invoiced: 0, collected: 0, outstanding: 0 };
      entry.invoiced += amount;
      entry.outstanding += out;
      timelineMap.set(key, entry);
    }

    let totalCollected = 0;
    for (const pay of payments) {
      const amount = this.toNumber(pay.amount);
      totalCollected += amount;
      const key = getPeriodKey(new Date(pay.paymentDate), groupBy);
      const entry = timelineMap.get(key) || { invoiced: 0, collected: 0, outstanding: 0 };
      entry.collected += amount;
      timelineMap.set(key, entry);
    }

    const totalOutstanding = this.toNumber(outstandingAgg._sum.outstandingAmount);
    const collectionRate = this.calcPercentage(totalCollected, totalInvoiced);

    const timeline = Array.from(timelineMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, data]) => ({
        period,
        invoiced: Number(data.invoiced.toFixed(2)),
        collected: Number(data.collected.toFixed(2)),
        outstanding: Number(data.outstanding.toFixed(2)),
      }));

    return {
      summary: {
        totalInvoiced: Number(totalInvoiced.toFixed(2)),
        totalCollected: Number(totalCollected.toFixed(2)),
        totalOutstanding: Number(totalOutstanding.toFixed(2)),
        collectionRate,
      },
      timeline,
    };
  }

  // ----------------------------------------------------
  // 5. COLLECTION REPORT
  // ----------------------------------------------------
  async getCollections(rbac: RbacContext, query: RevenueReportQueryDto) {
    await this.validateProperty(query.propertyId, rbac.organizationId);
    this.validateDateRange(query.startDate, query.endDate);

    const orgId = rbac.organizationId;
    const propFilter = query.propertyId ? { propertyId: query.propertyId } : {};

    const paymentWhere: Prisma.paymentsWhereInput = {
      organizationId: orgId,
      status: { in: ['RECORDED', 'VERIFIED'] },
      deletedAt: null,
      ...propFilter,
      ...(query.startDate || query.endDate
        ? {
            paymentDate: {
              ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
              ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
            },
          }
        : {}),
    };

    const [payments, byMethodGroup, byPropGroup, properties] = await Promise.all([
      this.prisma.payments.findMany({
        where: paymentWhere,
        select: { amount: true, paymentDate: true },
      }),
      this.prisma.payments.groupBy({
        by: ['paymentMethod'],
        where: paymentWhere,
        _sum: { amount: true },
        _count: { id: true },
      }),
      this.prisma.payments.groupBy({
        by: ['propertyId'],
        where: paymentWhere,
        _sum: { amount: true },
        _count: { id: true },
      }),
      this.prisma.properties.findMany({
        where: { organizationId: orgId, deletedAt: null },
        select: { id: true, name: true },
      }),
    ]);

    const propNameMap = new Map(properties.map((p) => [p.id, p.name]));

    let totalCollected = 0;
    const paymentCount = payments.length;
    for (const p of payments) {
      totalCollected += this.toNumber(p.amount);
    }
    const averagePaymentAmount =
      paymentCount > 0 ? Number((totalCollected / paymentCount).toFixed(2)) : 0;

    const byPaymentMethod = byMethodGroup.map((m) => {
      const amount = this.toNumber(m._sum.amount);
      return {
        paymentMethod: m.paymentMethod,
        totalAmount: Number(amount.toFixed(2)),
        count: m._count.id,
        percentage: this.calcPercentage(amount, totalCollected),
      };
    });

    const byProperty = byPropGroup.map((p) => ({
      propertyId: p.propertyId,
      propertyName: propNameMap.get(p.propertyId) || 'Unknown Property',
      totalAmount: Number(this.toNumber(p._sum.amount).toFixed(2)),
      count: p._count.id,
    }));

    return {
      summary: {
        totalCollected: Number(totalCollected.toFixed(2)),
        paymentCount,
        averagePaymentAmount,
      },
      byPaymentMethod,
      byProperty,
    };
  }

  // ----------------------------------------------------
  // 6. OUTSTANDING / RECEIVABLE REPORT
  // ----------------------------------------------------
  async getOutstanding(rbac: RbacContext, query: ReportPaginationDto) {
    await this.validateProperty(query.propertyId, rbac.organizationId);

    const orgId = rbac.organizationId;
    const propFilter = query.propertyId ? { propertyId: query.propertyId } : {};

    const now = new Date();

    const [unpaidInvoices, overdueInvoices, properties] = await Promise.all([
      this.prisma.invoices.findMany({
        where: {
          organizationId: orgId,
          status: { in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] },
          outstandingAmount: { gt: 0 },
          ...propFilter,
        },
        select: {
          id: true,
          propertyId: true,
          residentId: true,
          outstandingAmount: true,
          dueDate: true,
          status: true,
          residents: {
            select: { id: true, fullName: true, phone: true },
          },
          properties: {
            select: { id: true, name: true },
          },
        },
      }),
      this.prisma.invoices.findMany({
        where: {
          organizationId: orgId,
          status: { in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] },
          outstandingAmount: { gt: 0 },
          OR: [{ dueDate: { lt: now } }, { status: 'OVERDUE' }],
          ...propFilter,
        },
        select: { outstandingAmount: true },
      }),
      this.prisma.properties.findMany({
        where: { organizationId: orgId, deletedAt: null },
        select: { id: true, name: true },
      }),
    ]);

    let totalOutstanding = 0;
    let current = 0;
    let days1to30 = 0;
    let days31to60 = 0;
    let daysOver60 = 0;

    const propOutstandingMap = new Map<
      string,
      { outstandingAmount: number; overdueAmount: number; invoiceCount: number }
    >();
    const residentOutstandingMap = new Map<
      string,
      {
        residentId: string;
        residentName: string;
        phone: string;
        propertyName: string;
        outstandingAmount: number;
        unpaidInvoiceCount: number;
      }
    >();

    for (const inv of unpaidInvoices) {
      const amount = this.toNumber(inv.outstandingAmount);
      totalOutstanding += amount;

      const due = new Date(inv.dueDate);
      const isOverdue = due < now || inv.status === 'OVERDUE';
      const daysDiff = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));

      if (!isOverdue) {
        current += amount;
      } else if (daysDiff <= 30) {
        days1to30 += amount;
      } else if (daysDiff <= 60) {
        days31to60 += amount;
      } else {
        daysOver60 += amount;
      }

      // Group by property
      const pEntry = propOutstandingMap.get(inv.propertyId) || {
        outstandingAmount: 0,
        overdueAmount: 0,
        invoiceCount: 0,
      };
      pEntry.outstandingAmount += amount;
      if (isOverdue) pEntry.overdueAmount += amount;
      pEntry.invoiceCount++;
      propOutstandingMap.set(inv.propertyId, pEntry);

      // Group by resident
      if (inv.residents) {
        const rEntry = residentOutstandingMap.get(inv.residentId) || {
          residentId: inv.residents.id,
          residentName: inv.residents.fullName,
          phone: inv.residents.phone,
          propertyName: inv.properties?.name || 'Unknown',
          outstandingAmount: 0,
          unpaidInvoiceCount: 0,
        };
        rEntry.outstandingAmount += amount;
        rEntry.unpaidInvoiceCount++;
        residentOutstandingMap.set(inv.residentId, rEntry);
      }
    }

    let totalOverdue = 0;
    for (const o of overdueInvoices) {
      totalOverdue += this.toNumber(o.outstandingAmount);
    }

    const propNameMap = new Map(properties.map((p) => [p.id, p.name]));
    const byProperty = Array.from(propOutstandingMap.entries()).map(([propertyId, data]) => ({
      propertyId,
      propertyName: propNameMap.get(propertyId) || 'Unknown Property',
      outstandingAmount: Number(data.outstandingAmount.toFixed(2)),
      overdueAmount: Number(data.overdueAmount.toFixed(2)),
      invoiceCount: data.invoiceCount,
    }));

    const sortedDebtors = Array.from(residentOutstandingMap.values())
      .sort((a, b) => b.outstandingAmount - a.outstandingAmount)
      .map((d) => ({
        ...d,
        outstandingAmount: Number(d.outstandingAmount.toFixed(2)),
      }));

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const paginatedDebtors = sortedDebtors.slice((page - 1) * limit, page * limit);

    return {
      summary: {
        totalOutstanding: Number(totalOutstanding.toFixed(2)),
        totalOverdue: Number(totalOverdue.toFixed(2)),
        unpaidInvoiceCount: unpaidInvoices.length,
        overdueInvoiceCount: overdueInvoices.length,
      },
      aging: {
        current: Number(current.toFixed(2)),
        days1to30: Number(days1to30.toFixed(2)),
        days31to60: Number(days31to60.toFixed(2)),
        daysOver60: Number(daysOver60.toFixed(2)),
      },
      byProperty,
      topDebtors: paginatedDebtors,
      meta: {
        page,
        limit,
        total: sortedDebtors.length,
        totalPages: Math.ceil(sortedDebtors.length / limit) || 1,
      },
    };
  }

  // ----------------------------------------------------
  // 7. EXPENSE REPORT
  // ----------------------------------------------------
  async getExpenses(rbac: RbacContext, query: ExpenseReportQueryDto) {
    await this.validateProperty(query.propertyId, rbac.organizationId);
    this.validateDateRange(query.startDate, query.endDate);

    const orgId = rbac.organizationId;
    const propFilter = query.propertyId ? { propertyId: query.propertyId } : {};

    const expenseWhere: Prisma.expensesWhereInput = {
      organizationId: orgId,
      deletedAt: null,
      ...propFilter,
      ...(query.category ? { category: query.category } : {}),
      ...(query.startDate || query.endDate
        ? {
            expenseDate: {
              ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
              ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
            },
          }
        : {}),
    };

    const foodExpenseWhere: Prisma.food_expensesWhereInput = {
      organizationId: orgId,
      ...propFilter,
      ...(query.startDate || query.endDate
        ? {
            expenseDate: {
              ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
              ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
            },
          }
        : {}),
    };

    const [generalExpenses, foodExpenses, byCategoryGroup, byPropGroup, properties] =
      await Promise.all([
        this.prisma.expenses.findMany({
          where: expenseWhere,
          select: { amount: true, category: true, expenseDate: true },
        }),
        // Only include food expenses if no non-food category filter was explicitly set
        !query.category || query.category === 'FOOD_GROCERY'
          ? this.prisma.food_expenses.findMany({
              where: foodExpenseWhere,
              select: { amount: true, expenseDate: true, propertyId: true },
            })
          : Promise.resolve([]),
        this.prisma.expenses.groupBy({
          by: ['category'],
          where: expenseWhere,
          _sum: { amount: true },
          _count: { id: true },
        }),
        this.prisma.expenses.groupBy({
          by: ['propertyId'],
          where: expenseWhere,
          _sum: { amount: true },
          _count: { id: true },
        }),
        this.prisma.properties.findMany({
          where: { organizationId: orgId, deletedAt: null },
          select: { id: true, name: true },
        }),
      ]);

    let generalExpensesTotal = 0;
    for (const g of generalExpenses) {
      generalExpensesTotal += this.toNumber(g.amount);
    }

    let foodExpensesTotal = 0;
    for (const f of foodExpenses) {
      foodExpensesTotal += this.toNumber(f.amount);
    }

    const totalExpenses = generalExpensesTotal + foodExpensesTotal;
    const expenseCount = generalExpenses.length + foodExpenses.length;

    const byCategory = byCategoryGroup.map((c) => {
      const amount = this.toNumber(c._sum.amount);
      return {
        category: c.category,
        totalAmount: Number(amount.toFixed(2)),
        count: c._count.id,
        percentage: this.calcPercentage(amount, totalExpenses),
      };
    });

    if (foodExpensesTotal > 0 && (!query.category || query.category === 'FOOD_GROCERY')) {
      const existingFood = byCategory.find((c) => c.category === 'FOOD_GROCERY');
      if (existingFood) {
        existingFood.totalAmount += Number(foodExpensesTotal.toFixed(2));
        existingFood.count += foodExpenses.length;
        existingFood.percentage = this.calcPercentage(existingFood.totalAmount, totalExpenses);
      } else {
        byCategory.push({
          category: 'FOOD_GROCERY',
          totalAmount: Number(foodExpensesTotal.toFixed(2)),
          count: foodExpenses.length,
          percentage: this.calcPercentage(foodExpensesTotal, totalExpenses),
        });
      }
    }

    const propNameMap = new Map(properties.map((p) => [p.id, p.name]));
    const propMap = new Map<string, { totalAmount: number; count: number }>();

    for (const p of byPropGroup) {
      propMap.set(p.propertyId, {
        totalAmount: this.toNumber(p._sum.amount),
        count: p._count.id,
      });
    }

    for (const f of foodExpenses) {
      const entry = propMap.get(f.propertyId) || { totalAmount: 0, count: 0 };
      entry.totalAmount += this.toNumber(f.amount);
      entry.count++;
      propMap.set(f.propertyId, entry);
    }

    const byProperty = Array.from(propMap.entries()).map(([propertyId, data]) => ({
      propertyId,
      propertyName: propNameMap.get(propertyId) || 'Unknown Property',
      totalAmount: Number(data.totalAmount.toFixed(2)),
      count: data.count,
    }));

    return {
      summary: {
        totalExpenses: Number(totalExpenses.toFixed(2)),
        generalExpensesTotal: Number(generalExpensesTotal.toFixed(2)),
        foodExpensesTotal: Number(foodExpensesTotal.toFixed(2)),
        expenseCount,
      },
      byCategory,
      byProperty,
    };
  }

  // ----------------------------------------------------
  // 8. RESIDENT REPORT
  // ----------------------------------------------------
  async getResidents(rbac: RbacContext, query: ResidentReportQueryDto) {
    await this.validateProperty(query.propertyId, rbac.organizationId);

    const orgId = rbac.organizationId;
    const propFilter = query.propertyId ? { propertyId: query.propertyId } : {};

    const where: Prisma.residentsWhereInput = {
      organizationId: orgId,
      deletedAt: null,
      ...propFilter,
      ...(query.status ? { status: query.status } : {}),
    };

    const [
      totalResidents,
      activeResidents,
      noticePeriodResidents,
      movedOutResidents,
      enquiryResidents,
      bookedResidents,
      statusGroups,
      genderGroups,
      occupationGroups,
      propGroups,
      properties,
    ] = await Promise.all([
      this.prisma.residents.count({ where: { organizationId: orgId, deletedAt: null, ...propFilter } }),
      this.prisma.residents.count({
        where: { organizationId: orgId, deletedAt: null, status: 'ACTIVE', ...propFilter },
      }),
      this.prisma.residents.count({
        where: { organizationId: orgId, deletedAt: null, status: 'NOTICE_PERIOD', ...propFilter },
      }),
      this.prisma.residents.count({
        where: { organizationId: orgId, deletedAt: null, status: 'MOVED_OUT', ...propFilter },
      }),
      this.prisma.residents.count({
        where: { organizationId: orgId, deletedAt: null, status: 'ENQUIRY', ...propFilter },
      }),
      this.prisma.residents.count({
        where: { organizationId: orgId, deletedAt: null, status: 'BOOKED', ...propFilter },
      }),
      this.prisma.residents.groupBy({
        by: ['status'],
        where,
        _count: { id: true },
      }),
      this.prisma.residents.groupBy({
        by: ['gender'],
        where,
        _count: { id: true },
      }),
      this.prisma.residents.groupBy({
        by: ['occupationType'],
        where,
        _count: { id: true },
      }),
      this.prisma.residents.groupBy({
        by: ['propertyId'],
        where,
        _count: { id: true },
      }),
      this.prisma.properties.findMany({
        where: { organizationId: orgId, deletedAt: null },
        select: { id: true, name: true },
      }),
    ]);

    const propNameMap = new Map(properties.map((p) => [p.id, p.name]));
    const byProperty = propGroups.map((p) => ({
      propertyId: p.propertyId || 'UNASSIGNED',
      propertyName: p.propertyId ? propNameMap.get(p.propertyId) || 'Unknown' : 'Unassigned',
      totalResidents: p._count.id,
    }));

    return {
      summary: {
        totalResidents,
        activeResidents,
        noticePeriodResidents,
        movedOutResidents,
        enquiryResidents,
        bookedResidents,
      },
      byStatus: statusGroups.map((s) => ({ status: s.status, count: s._count.id })),
      byGender: genderGroups.map((g) => ({ gender: g.gender, count: g._count.id })),
      byOccupation: occupationGroups.map((o) => ({ occupation: o.occupationType, count: o._count.id })),
      byProperty,
    };
  }

  // ----------------------------------------------------
  // 9. BOOKING / APPLICATION REPORT
  // ----------------------------------------------------
  async getBookings(rbac: RbacContext, query: ReportDateQueryDto) {
    await this.validateProperty(query.propertyId, rbac.organizationId);
    this.validateDateRange(query.startDate, query.endDate);

    const orgId = rbac.organizationId;
    const propFilter = query.propertyId ? { propertyId: query.propertyId } : {};

    const dateFilter =
      query.startDate || query.endDate
        ? {
            createdAt: {
              ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
              ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
            },
          }
        : {};

    const [
      enquiriesCount,
      bookingsCount,
      confirmedBookings,
      cancelledBookings,
      convertedBookings,
      moveIns,
      moveOuts,
      enquirySourceGroups,
      propBookingGroups,
      properties,
    ] = await Promise.all([
      this.prisma.enquiries.count({
        where: { organizationId: orgId, deletedAt: null, ...propFilter, ...dateFilter },
      }),
      this.prisma.bookings.count({
        where: { organizationId: orgId, ...propFilter, ...dateFilter },
      }),
      this.prisma.bookings.count({
        where: { organizationId: orgId, status: 'CONFIRMED', ...propFilter, ...dateFilter },
      }),
      this.prisma.bookings.count({
        where: { organizationId: orgId, status: 'CANCELLED', ...propFilter, ...dateFilter },
      }),
      this.prisma.bookings.count({
        where: {
          organizationId: orgId,
          status: 'CONVERTED_TO_MOVE_IN',
          ...propFilter,
          ...dateFilter,
        },
      }),
      this.prisma.move_ins.count({
        where: { organizationId: orgId, status: 'COMPLETED', ...propFilter, ...dateFilter },
      }),
      this.prisma.move_outs.count({
        where: { organizationId: orgId, status: 'COMPLETED', ...propFilter, ...dateFilter },
      }),
      this.prisma.enquiries.groupBy({
        by: ['source'],
        where: { organizationId: orgId, deletedAt: null, ...propFilter, ...dateFilter },
        _count: { id: true },
      }),
      this.prisma.bookings.groupBy({
        by: ['propertyId'],
        where: { organizationId: orgId, ...propFilter, ...dateFilter },
        _count: { id: true },
      }),
      this.prisma.properties.findMany({
        where: { organizationId: orgId, deletedAt: null },
        select: { id: true, name: true },
      }),
    ]);

    const enquiryToBookingRate = this.calcPercentage(bookingsCount, enquiriesCount);
    const bookingConversionRate = this.calcPercentage(convertedBookings, bookingsCount);

    const propNameMap = new Map(properties.map((p) => [p.id, p.name]));
    const byProperty = propBookingGroups.map((p) => ({
      propertyId: p.propertyId,
      propertyName: propNameMap.get(p.propertyId) || 'Unknown',
      bookingsCount: p._count.id,
    }));

    return {
      summary: {
        enquiriesCount,
        bookingsCount,
        confirmedBookings,
        cancelledBookings,
        convertedBookings,
        moveIns,
        moveOuts,
        enquiryToBookingRate,
        bookingConversionRate,
      },
      byEnquirySource: enquirySourceGroups.map((s) => ({ source: s.source, count: s._count.id })),
      byProperty,
    };
  }

  // ----------------------------------------------------
  // 10. OPERATIONS REPORT
  // ----------------------------------------------------
  async getOperations(rbac: RbacContext, query: ReportDateQueryDto) {
    if (rbac.role === 'ACCOUNTANT') {
      throw new ForbiddenException('Accountants do not have permission to view operations report');
    }
    await this.validateProperty(query.propertyId, rbac.organizationId);
    this.validateDateRange(query.startDate, query.endDate);

    const orgId = rbac.organizationId;
    const propFilter = query.propertyId ? { propertyId: query.propertyId } : {};
    const dateFilter =
      query.startDate || query.endDate
        ? {
            createdAt: {
              ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
              ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
            },
          }
        : {};

    const [
      totalComplaints,
      openComplaints,
      resolvedComplaints,
      closedComplaints,
      complaintCatGroups,
      complaintPriGroups,
      totalMaintenance,
      openMaintenance,
      completedMaintenance,
      closedMaintenance,
      cancelledMaintenance,
      maintCosts,
      maintCatGroups,
      totalTasks,
      pendingTasks,
      inProgressTasks,
      completedTasks,
      overdueTasks,
      cancelledTasks,
      taskCatGroups,
    ] = await Promise.all([
      this.prisma.complaints.count({ where: { organizationId: orgId, ...propFilter, ...dateFilter } }),
      this.prisma.complaints.count({
        where: {
          organizationId: orgId,
          status: { in: ['SUBMITTED', 'REVIEWED', 'INVESTIGATING'] },
          ...propFilter,
          ...dateFilter,
        },
      }),
      this.prisma.complaints.count({
        where: { organizationId: orgId, status: 'RESOLVED', ...propFilter, ...dateFilter },
      }),
      this.prisma.complaints.count({
        where: { organizationId: orgId, status: 'CLOSED', ...propFilter, ...dateFilter },
      }),
      this.prisma.complaints.groupBy({
        by: ['category'],
        where: { organizationId: orgId, ...propFilter, ...dateFilter },
        _count: { id: true },
      }),
      this.prisma.complaints.groupBy({
        by: ['priority'],
        where: { organizationId: orgId, ...propFilter, ...dateFilter },
        _count: { id: true },
      }),
      this.prisma.maintenance_requests.count({
        where: { organizationId: orgId, ...propFilter, ...dateFilter },
      }),
      this.prisma.maintenance_requests.count({
        where: {
          organizationId: orgId,
          status: { in: ['CREATED', 'ASSIGNED', 'IN_PROGRESS'] },
          ...propFilter,
          ...dateFilter,
        },
      }),
      this.prisma.maintenance_requests.count({
        where: {
          organizationId: orgId,
          status: { in: ['COMPLETED', 'VERIFIED'] },
          ...propFilter,
          ...dateFilter,
        },
      }),
      this.prisma.maintenance_requests.count({
        where: { organizationId: orgId, status: 'CLOSED', ...propFilter, ...dateFilter },
      }),
      this.prisma.maintenance_requests.count({
        where: { organizationId: orgId, status: 'CANCELLED', ...propFilter, ...dateFilter },
      }),
      this.prisma.maintenance_requests.aggregate({
        where: { organizationId: orgId, ...propFilter, ...dateFilter },
        _sum: { estimatedCost: true, actualCost: true },
      }),
      this.prisma.maintenance_requests.groupBy({
        by: ['category'],
        where: { organizationId: orgId, ...propFilter, ...dateFilter },
        _count: { id: true },
      }),
      this.prisma.staff_tasks.count({
        where: { organizationId: orgId, ...propFilter, ...dateFilter },
      }),
      this.prisma.staff_tasks.count({
        where: { organizationId: orgId, status: 'PENDING', ...propFilter, ...dateFilter },
      }),
      this.prisma.staff_tasks.count({
        where: { organizationId: orgId, status: 'IN_PROGRESS', ...propFilter, ...dateFilter },
      }),
      this.prisma.staff_tasks.count({
        where: { organizationId: orgId, status: 'COMPLETED', ...propFilter, ...dateFilter },
      }),
      this.prisma.staff_tasks.count({
        where: { organizationId: orgId, status: 'OVERDUE', ...propFilter, ...dateFilter },
      }),
      this.prisma.staff_tasks.count({
        where: { organizationId: orgId, status: 'CANCELLED', ...propFilter, ...dateFilter },
      }),
      this.prisma.staff_tasks.groupBy({
        by: ['category'],
        where: { organizationId: orgId, ...propFilter, ...dateFilter },
        _count: { id: true },
      }),
    ]);

    return {
      complaints: {
        total: totalComplaints,
        open: openComplaints,
        resolved: resolvedComplaints,
        closed: closedComplaints,
        byCategory: complaintCatGroups.map((c) => ({ category: c.category, count: c._count.id })),
        byPriority: complaintPriGroups.map((p) => ({ priority: p.priority, count: p._count.id })),
      },
      maintenance: {
        total: totalMaintenance,
        open: openMaintenance,
        completed: completedMaintenance,
        closed: closedMaintenance,
        cancelled: cancelledMaintenance,
        totalEstimatedCost: this.toNumber(maintCosts._sum.estimatedCost),
        totalActualCost: this.toNumber(maintCosts._sum.actualCost),
        byCategory: maintCatGroups.map((m) => ({ category: m.category, count: m._count.id })),
      },
      staffTasks: {
        total: totalTasks,
        pending: pendingTasks,
        inProgress: inProgressTasks,
        completed: completedTasks,
        overdue: overdueTasks,
        cancelled: cancelledTasks,
        byCategory: taskCatGroups.map((t) => ({ category: t.category, count: t._count.id })),
      },
    };
  }

  // ----------------------------------------------------
  // 11. STAFF REPORT
  // ----------------------------------------------------
  async getStaff(rbac: RbacContext, query: ReportDateQueryDto) {
    if (rbac.role === 'ACCOUNTANT') {
      throw new ForbiddenException('Accountants do not have permission to view staff report');
    }
    await this.validateProperty(query.propertyId, rbac.organizationId);
    this.validateDateRange(query.startDate, query.endDate);

    const orgId = rbac.organizationId;
    const propFilter = query.propertyId ? { propertyId: query.propertyId } : {};

    const [
      totalStaff,
      activeStaff,
      onLeaveStaff,
      inactiveStaff,
      shiftGroups,
      propGroups,
      properties,
      attendances,
    ] = await Promise.all([
      this.prisma.staff_profiles.count({ where: { organizationId: orgId, ...propFilter } }),
      this.prisma.staff_profiles.count({
        where: { organizationId: orgId, status: 'ACTIVE', ...propFilter },
      }),
      this.prisma.staff_profiles.count({
        where: { organizationId: orgId, status: 'ON_LEAVE', ...propFilter },
      }),
      this.prisma.staff_profiles.count({
        where: { organizationId: orgId, status: { in: ['INACTIVE', 'TERMINATED'] }, ...propFilter },
      }),
      this.prisma.staff_profiles.groupBy({
        by: ['shift'],
        where: { organizationId: orgId, ...propFilter },
        _count: { id: true },
      }),
      this.prisma.staff_profiles.groupBy({
        by: ['propertyId'],
        where: { organizationId: orgId, ...propFilter },
        _count: { id: true },
      }),
      this.prisma.properties.findMany({
        where: { organizationId: orgId, deletedAt: null },
        select: { id: true, name: true },
      }),
      this.prisma.staff_attendances.findMany({
        where: {
          staff_profiles: {
            organizationId: orgId,
            ...(query.propertyId ? { propertyId: query.propertyId } : {}),
          },
          ...(query.startDate || query.endDate
            ? {
                date: {
                  ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
                  ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
                },
              }
            : {}),
        },
        select: { status: true },
      }),
    ]);

    let present = 0;
    let absent = 0;
    let late = 0;
    let halfDay = 0;
    let leave = 0;

    for (const a of attendances) {
      if (a.status === 'PRESENT') present++;
      else if (a.status === 'ABSENT') absent++;
      else if (a.status === 'LATE') late++;
      else if (a.status === 'HALF_DAY') halfDay++;
      else if (a.status === 'LEAVE') leave++;
    }

    const totalAttendanceRecords = attendances.length;
    const attendanceRate = this.calcPercentage(present + late + halfDay, totalAttendanceRecords);

    const propNameMap = new Map(properties.map((p) => [p.id, p.name]));
    const byProperty = propGroups.map((p) => ({
      propertyId: p.propertyId || 'UNASSIGNED',
      propertyName: p.propertyId ? propNameMap.get(p.propertyId) || 'Unknown' : 'Unassigned',
      count: p._count.id,
    }));

    return {
      summary: {
        totalStaff,
        activeStaff,
        onLeaveStaff,
        inactiveStaff,
      },
      byShift: shiftGroups.map((s) => ({ shift: s.shift, count: s._count.id })),
      byProperty,
      attendance: {
        totalRecords: totalAttendanceRecords,
        present,
        absent,
        late,
        halfDay,
        leave,
        attendanceRate,
      },
    };
  }

  // ----------------------------------------------------
  // 12. FOOD & MESS REPORT
  // ----------------------------------------------------
  async getFood(rbac: RbacContext, query: ReportDateQueryDto) {
    await this.validateProperty(query.propertyId, rbac.organizationId);
    this.validateDateRange(query.startDate, query.endDate);

    const orgId = rbac.organizationId;
    const propFilter = query.propertyId ? { propertyId: query.propertyId } : {};

    const dateFilter =
      query.startDate || query.endDate
        ? {
            mealDate: {
              ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
              ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
            },
          }
        : {};

    const [
      mealRecords,
      attendances,
      foodExpenseAgg,
      foodVendorsCount,
      inventoryItemsCount,
      lowStockCount,
      outOfStockCount,
      purchaseRecordsCount,
    ] = await Promise.all([
      this.prisma.meal_records.findMany({
        where: { organizationId: orgId, ...propFilter, ...dateFilter },
        select: { mealType: true, expectedCount: true, actualCount: true },
      }),
      this.prisma.meal_attendances.findMany({
        where: {
          meal_records: {
            organizationId: orgId,
            ...(query.propertyId ? { propertyId: query.propertyId } : {}),
            ...dateFilter,
          },
        },
        select: { status: true },
      }),
      this.prisma.food_expenses.aggregate({
        where: {
          organizationId: orgId,
          ...propFilter,
          ...(query.startDate || query.endDate
            ? {
                expenseDate: {
                  ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
                  ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
                },
              }
            : {}),
        },
        _sum: { amount: true },
      }),
      this.prisma.food_vendors.count({
        where: { organizationId: orgId, ...propFilter },
      }),
      this.prisma.inventory_items.count({
        where: { organizationId: orgId, ...propFilter },
      }),
      this.prisma.inventory_items.count({
        where: { organizationId: orgId, status: 'LOW_STOCK', ...propFilter },
      }),
      this.prisma.inventory_items.count({
        where: { organizationId: orgId, status: 'OUT_OF_STOCK', ...propFilter },
      }),
      this.prisma.purchase_records.count({
        where: { organizationId: orgId, ...propFilter },
      }),
    ]);

    let totalExpectedMeals = 0;
    let totalActualMeals = 0;
    const mealTypeMap = new Map<string, { count: number; expected: number; actual: number }>();

    for (const m of mealRecords) {
      totalExpectedMeals += m.expectedCount;
      totalActualMeals += m.actualCount;

      const entry = mealTypeMap.get(m.mealType) || { count: 0, expected: 0, actual: 0 };
      entry.count++;
      entry.expected += m.expectedCount;
      entry.actual += m.actualCount;
      mealTypeMap.set(m.mealType, entry);
    }

    let present = 0;
    let absent = 0;
    let optedOut = 0;
    for (const a of attendances) {
      if (a.status === 'PRESENT') present++;
      else if (a.status === 'ABSENT') absent++;
      else if (a.status === 'OPTED_OUT') optedOut++;
    }

    const consumptionRate = this.calcPercentage(totalActualMeals, totalExpectedMeals);

    return {
      meals: {
        totalMealRecords: mealRecords.length,
        totalExpectedMeals,
        totalActualMeals,
        consumptionRate,
        byMealType: Array.from(mealTypeMap.entries()).map(([mealType, data]) => ({
          mealType,
          count: data.count,
          expected: data.expected,
          actual: data.actual,
        })),
      },
      attendance: {
        totalAttendanceLogged: attendances.length,
        present,
        absent,
        optedOut,
      },
      finances: {
        totalFoodExpenses: this.toNumber(foodExpenseAgg._sum.amount),
        foodVendorsCount,
      },
      inventory: {
        totalInventoryItems: inventoryItemsCount,
        lowStockItems: lowStockCount,
        outOfStockItems: outOfStockCount,
        totalPurchaseRecords: purchaseRecordsCount,
      },
    };
  }

  // ----------------------------------------------------
  // 13. VISITOR REPORT
  // ----------------------------------------------------
  async getVisitors(rbac: RbacContext, query: ReportDateQueryDto) {
    if (rbac.role === 'ACCOUNTANT') {
      throw new ForbiddenException('Accountants do not have permission to view visitor report');
    }
    await this.validateProperty(query.propertyId, rbac.organizationId);
    this.validateDateRange(query.startDate, query.endDate);

    const orgId = rbac.organizationId;
    const propFilter = query.propertyId ? { propertyId: query.propertyId } : {};
    const dateFilter =
      query.startDate || query.endDate
        ? {
            createdAt: {
              ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
              ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
            },
          }
        : {};

    const [
      totalVisitors,
      checkedIn,
      checkedOut,
      approved,
      expected,
      rejected,
      cancelled,
      purposeGroups,
      propGroups,
      properties,
    ] = await Promise.all([
      this.prisma.visitors.count({ where: { organizationId: orgId, ...propFilter, ...dateFilter } }),
      this.prisma.visitors.count({
        where: { organizationId: orgId, status: 'CHECKED_IN', ...propFilter, ...dateFilter },
      }),
      this.prisma.visitors.count({
        where: { organizationId: orgId, status: 'CHECKED_OUT', ...propFilter, ...dateFilter },
      }),
      this.prisma.visitors.count({
        where: { organizationId: orgId, status: 'APPROVED', ...propFilter, ...dateFilter },
      }),
      this.prisma.visitors.count({
        where: { organizationId: orgId, status: 'EXPECTED', ...propFilter, ...dateFilter },
      }),
      this.prisma.visitors.count({
        where: { organizationId: orgId, status: 'REJECTED', ...propFilter, ...dateFilter },
      }),
      this.prisma.visitors.count({
        where: { organizationId: orgId, status: 'CANCELLED', ...propFilter, ...dateFilter },
      }),
      this.prisma.visitors.groupBy({
        by: ['purpose'],
        where: { organizationId: orgId, ...propFilter, ...dateFilter },
        _count: { id: true },
      }),
      this.prisma.visitors.groupBy({
        by: ['propertyId'],
        where: { organizationId: orgId, ...propFilter, ...dateFilter },
        _count: { id: true },
      }),
      this.prisma.properties.findMany({
        where: { organizationId: orgId, deletedAt: null },
        select: { id: true, name: true },
      }),
    ]);

    const propNameMap = new Map(properties.map((p) => [p.id, p.name]));
    const byProperty = propGroups.map((p) => ({
      propertyId: p.propertyId,
      propertyName: propNameMap.get(p.propertyId) || 'Unknown',
      count: p._count.id,
    }));

    return {
      summary: {
        totalVisitors,
        checkedIn,
        checkedOut,
        approved,
        expected,
        rejected,
        cancelled,
      },
      byPurpose: purposeGroups.map((p) => ({ purpose: p.purpose, count: p._count.id })),
      byProperty,
    };
  }

  // ----------------------------------------------------
  // 14. LEAVE REPORT
  // ----------------------------------------------------
  async getLeaves(rbac: RbacContext, query: ReportDateQueryDto) {
    if (rbac.role === 'ACCOUNTANT') {
      throw new ForbiddenException('Accountants do not have permission to view leave report');
    }
    await this.validateProperty(query.propertyId, rbac.organizationId);
    this.validateDateRange(query.startDate, query.endDate);

    const orgId = rbac.organizationId;

    const [logs, properties] = await Promise.all([
      this.prisma.audit_logs.findMany({
        where: {
          organizationId: orgId,
          entityType: 'leaves',
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.properties.findMany({
        where: { organizationId: orgId, deletedAt: null },
        select: { id: true, name: true },
      }),
    ]);

    const leavesMap = new Map<string, any>();
    for (const log of logs) {
      try {
        const item = JSON.parse(log.newValues);
        leavesMap.set(item.id, item);
      } catch {}
    }

    let records = Array.from(leavesMap.values());

    if (query.propertyId) {
      records = records.filter((r) => r.propertyId === query.propertyId);
    }

    if (query.startDate) {
      const start = new Date(query.startDate);
      records = records.filter((r) => new Date(r.startDate) >= start || new Date(r.createdAt) >= start);
    }

    if (query.endDate) {
      const end = new Date(query.endDate);
      records = records.filter((r) => new Date(r.endDate) <= end || new Date(r.createdAt) <= end);
    }

    let pending = 0;
    let approved = 0;
    let rejected = 0;
    let cancelled = 0;
    const propMap = new Map<string, number>();

    for (const r of records) {
      if (r.status === 'PENDING') pending++;
      else if (r.status === 'APPROVED') approved++;
      else if (r.status === 'REJECTED') rejected++;
      else if (r.status === 'CANCELLED') cancelled++;

      if (r.propertyId) {
        propMap.set(r.propertyId, (propMap.get(r.propertyId) || 0) + 1);
      }
    }

    const totalLeaves = records.length;
    const approvalRate = this.calcPercentage(approved, approved + rejected);

    const propNameMap = new Map(properties.map((p) => [p.id, p.name]));
    const byProperty = Array.from(propMap.entries()).map(([propertyId, count]) => ({
      propertyId,
      propertyName: propNameMap.get(propertyId) || 'Unknown Property',
      count,
    }));

    return {
      summary: {
        totalLeaves,
        pending,
        approved,
        rejected,
        cancelled,
        approvalRate,
      },
      byProperty,
    };
  }
}
