import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { ComplaintsService } from '../complaints/complaints.service';
import { LeavesService } from '../leaves/leaves.service';
import { MaintenanceService } from '../maintenance/maintenance.service';
import { NoticesService } from '../notices/notices.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RbacContext } from '../rbac/types/rbac.types';
import { VisitorsService } from '../visitors/visitors.service';
import { CreatePortalComplaintDto } from './dto/create-portal-complaint.dto';
import { CreatePortalLeaveDto } from './dto/create-portal-leave.dto';
import { CreatePortalMaintenanceDto } from './dto/create-portal-maintenance.dto';
import { PortalPaginationDto } from './dto/portal-pagination.dto';
import { UpdateResidentProfileDto } from './dto/update-resident-profile.dto';

@Injectable()
export class PortalService {
  private readonly logger = new Logger(PortalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly complaintsService: ComplaintsService,
    private readonly maintenanceService: MaintenanceService,
    private readonly leavesService: LeavesService,
    private readonly noticesService: NoticesService,
    private readonly notificationsService: NotificationsService,
    private readonly visitorsService: VisitorsService,
  ) {}

  private async createAuditLog(params: {
    organizationId: string;
    userId: string;
    action: string;
    entityId: string;
    oldValues?: any;
    newValues?: any;
    ipAddress?: string;
  }) {
    try {
      await this.prisma.audit_logs.create({
        data: {
          id: randomUUID(),
          organizationId: params.organizationId,
          userId: params.userId,
          action: params.action,
          entityType: 'portal',
          entityId: params.entityId,
          oldValues: params.oldValues ? JSON.stringify(params.oldValues) : null,
          newValues: params.newValues ? JSON.stringify(params.newValues) : null,
          ipAddress: params.ipAddress ?? null,
          createdAt: new Date(),
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to write audit log for ${params.action}: ${err}`);
    }
  }

  async resolveResident(rbac: RbacContext) {
    let resident = await this.prisma.residents.findFirst({
      where: {
        organizationId: rbac.organizationId,
        deletedAt: null,
        userId: rbac.userId,
      },
      include: {
        properties: {
          select: {
            id: true,
            name: true,
            code: true,
            addressLine1: true,
            city: true,
            state: true,
            pincode: true,
            contactPhone: true,
            contactEmail: true,
          },
        },
        floors: { select: { id: true, floorNumber: true, name: true } },
        rooms: { select: { id: true, roomNumber: true, roomType: true } },
        beds: { select: { id: true, bedNumber: true } },
        resident_stays: {
          where: { status: 'ACTIVE' },
          orderBy: { checkInDate: 'desc' },
          take: 1,
          include: {
            properties: { select: { id: true, name: true, code: true, addressLine1: true, city: true, state: true, pincode: true } },
            floors: { select: { id: true, floorNumber: true, name: true } },
            rooms: { select: { id: true, roomNumber: true, roomType: true } },
            beds: { select: { id: true, bedNumber: true } },
          },
        },
      },
    });

    if (!resident) {
      const byEmail = await this.prisma.residents.findFirst({
        where: {
          organizationId: rbac.organizationId,
          deletedAt: null,
          email: rbac.email,
        },
      });

      if (byEmail) {
        await this.prisma.residents.update({
          where: { id: byEmail.id },
          data: { userId: rbac.userId },
        });

        resident = await this.prisma.residents.findFirst({
          where: { id: byEmail.id },
          include: {
            properties: {
              select: {
                id: true,
                name: true,
                code: true,
                addressLine1: true,
                city: true,
                state: true,
                pincode: true,
                contactPhone: true,
                contactEmail: true,
              },
            },
            floors: { select: { id: true, floorNumber: true, name: true } },
            rooms: { select: { id: true, roomNumber: true, roomType: true } },
            beds: { select: { id: true, bedNumber: true } },
            resident_stays: {
              where: { status: 'ACTIVE' },
              orderBy: { checkInDate: 'desc' },
              take: 1,
              include: {
                properties: { select: { id: true, name: true, code: true, addressLine1: true, city: true, state: true, pincode: true } },
                floors: { select: { id: true, floorNumber: true, name: true } },
                rooms: { select: { id: true, roomNumber: true, roomType: true } },
                beds: { select: { id: true, bedNumber: true } },
              },
            },
          },
        });
      }
    }

    if (!resident) {
      throw new NotFoundException('Resident profile not found for authenticated user');
    }

    return resident;
  }

  private formatSafeProfile(resident: any) {
    return {
      id: resident.id,
      fullName: resident.fullName,
      email: resident.email,
      phone: resident.phone,
      alternatePhone: resident.alternatePhone,
      gender: resident.gender,
      dateOfBirth: resident.dateOfBirth,
      bloodGroup: resident.bloodGroup,
      avatarUrl: resident.avatarUrl,
      permanentAddress: resident.permanentAddress,
      currentAddress: resident.currentAddress,
      city: resident.city,
      state: resident.state,
      pincode: resident.pincode,
      emergencyContactName: resident.emergencyContactName,
      emergencyContactRelation: resident.emergencyContactRelation,
      emergencyContactPhone: resident.emergencyContactPhone,
      occupationType: resident.occupationType,
      employerOrCollegeName: resident.employerOrCollegeName,
      designation: resident.designation,
      workAddress: resident.workAddress,
      status: resident.status,
      joiningDate: resident.joiningDate,
      expectedMoveOutDate: resident.expectedMoveOutDate,
      foodIncluded: resident.foodIncluded,
    };
  }

  async getProfile(rbac: RbacContext) {
    const resident = await this.resolveResident(rbac);
    return this.formatSafeProfile(resident);
  }

  async updateProfile(dto: UpdateResidentProfileDto, rbac: RbacContext, ip?: string) {
    const resident = await this.resolveResident(rbac);

    const data: Prisma.residentsUpdateInput = {};
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.alternatePhone !== undefined) data.alternatePhone = dto.alternatePhone;
    if (dto.bloodGroup !== undefined) data.bloodGroup = dto.bloodGroup;
    if (dto.avatarUrl !== undefined) data.avatarUrl = dto.avatarUrl;
    if (dto.currentAddress !== undefined) data.currentAddress = dto.currentAddress;
    if (dto.permanentAddress !== undefined) data.permanentAddress = dto.permanentAddress;
    if (dto.city !== undefined) data.city = dto.city;
    if (dto.state !== undefined) data.state = dto.state;
    if (dto.pincode !== undefined) data.pincode = dto.pincode;
    if (dto.emergencyContactName !== undefined) data.emergencyContactName = dto.emergencyContactName;
    if (dto.emergencyContactRelation !== undefined) data.emergencyContactRelation = dto.emergencyContactRelation;
    if (dto.emergencyContactPhone !== undefined) data.emergencyContactPhone = dto.emergencyContactPhone;
    if (dto.occupationType !== undefined) data.occupationType = dto.occupationType;
    if (dto.employerOrCollegeName !== undefined) data.employerOrCollegeName = dto.employerOrCollegeName;
    if (dto.designation !== undefined) data.designation = dto.designation;
    if (dto.workAddress !== undefined) data.workAddress = dto.workAddress;

    const oldValues = {
      phone: resident.phone,
      city: resident.city,
      currentAddress: resident.currentAddress,
    };

    const updated = await this.prisma.residents.update({
      where: { id: resident.id },
      data,
    });

    await this.createAuditLog({
      organizationId: rbac.organizationId,
      userId: rbac.userId,
      action: 'portal.profile.updated',
      entityId: resident.id,
      oldValues,
      newValues: data,
      ipAddress: ip,
    });

    return this.formatSafeProfile(updated);
  }

  async getStay(rbac: RbacContext) {
    const resident = await this.resolveResident(rbac);
    const stay = resident.resident_stays?.[0];

    if (stay) {
      return {
        id: stay.id,
        status: stay.status,
        checkInDate: stay.checkInDate,
        expectedCheckOutDate: stay.expectedCheckOutDate,
        noticeDate: stay.noticeDate,
        checkOutDate: stay.checkOutDate,
        monthlyRent: Number(stay.monthlyRent),
        securityDeposit: Number(stay.securityDeposit),
        notes: stay.notes,
        property: stay.properties
          ? {
              id: stay.properties.id,
              name: stay.properties.name,
              code: stay.properties.code,
              addressLine1: stay.properties.addressLine1,
              city: stay.properties.city,
              state: stay.properties.state,
              pincode: stay.properties.pincode,
            }
          : null,
        floor: stay.floors
          ? {
              id: stay.floors.id,
              floorNumber: stay.floors.floorNumber,
              name: stay.floors.name,
            }
          : null,
        room: stay.rooms
          ? {
              id: stay.rooms.id,
              roomNumber: stay.rooms.roomNumber,
              roomType: stay.rooms.roomType,
            }
          : null,
        bed: stay.beds
          ? {
              id: stay.beds.id,
              bedNumber: stay.beds.bedNumber,
            }
          : null,
      };
    }

    if (resident.status === 'ACTIVE' && resident.propertyId) {
      return {
        id: resident.id,
        status: resident.status,
        checkInDate: resident.joiningDate,
        expectedCheckOutDate: resident.expectedMoveOutDate,
        noticeDate: resident.noticeGivenDate,
        checkOutDate: resident.actualMoveOutDate,
        monthlyRent: Number(resident.monthlyRent),
        securityDeposit: Number(resident.securityDeposit),
        notes: resident.notes,
        property: resident.properties
          ? {
              id: resident.properties.id,
              name: resident.properties.name,
              code: resident.properties.code,
              addressLine1: resident.properties.addressLine1,
              city: resident.properties.city,
              state: resident.properties.state,
              pincode: resident.properties.pincode,
            }
          : null,
        floor: resident.floors
          ? {
              id: resident.floors.id,
              floorNumber: resident.floors.floorNumber,
              name: resident.floors.name,
            }
          : null,
        room: resident.rooms
          ? {
              id: resident.rooms.id,
              roomNumber: resident.rooms.roomNumber,
              roomType: resident.rooms.roomType,
            }
          : null,
        bed: resident.beds
          ? {
              id: resident.beds.id,
              bedNumber: resident.beds.bedNumber,
            }
          : null,
      };
    }

    throw new NotFoundException('No active stay found for resident');
  }

  async getAccommodation(rbac: RbacContext) {
    const resident = await this.resolveResident(rbac);
    return {
      property: resident.properties
        ? {
            id: resident.properties.id,
            name: resident.properties.name,
            code: resident.properties.code,
            addressLine1: resident.properties.addressLine1,
            city: resident.properties.city,
            state: resident.properties.state,
            pincode: resident.properties.pincode,
            contactPhone: resident.properties.contactPhone,
            contactEmail: resident.properties.contactEmail,
          }
        : null,
      floor: resident.floors
        ? {
            id: resident.floors.id,
            floorNumber: resident.floors.floorNumber,
            name: resident.floors.name,
          }
        : null,
      room: resident.rooms
        ? {
            id: resident.rooms.id,
            roomNumber: resident.rooms.roomNumber,
            roomType: resident.rooms.roomType,
          }
        : null,
      bed: resident.beds
        ? {
            id: resident.beds.id,
            bedNumber: resident.beds.bedNumber,
          }
        : null,
    };
  }

  async getInvoices(query: PortalPaginationDto, rbac: RbacContext) {
    const resident = await this.resolveResident(rbac);
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.invoicesWhereInput = {
      organizationId: rbac.organizationId,
      residentId: resident.id,
    };

    if (query.status) {
      where.status = query.status as any;
    }
    if (query.search) {
      where.invoiceNumber = { contains: query.search, mode: 'insensitive' };
    }

    const [items, total] = await Promise.all([
      this.prisma.invoices.findMany({
        where,
        skip,
        take: limit,
        orderBy: { issuedAt: 'desc' },
        include: {
          invoice_items: true,
        },
      }),
      this.prisma.invoices.count({ where }),
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

  async getInvoiceById(invoiceId: string, rbac: RbacContext) {
    const resident = await this.resolveResident(rbac);
    const invoice = await this.prisma.invoices.findFirst({
      where: {
        id: invoiceId,
        organizationId: rbac.organizationId,
        residentId: resident.id,
      },
      include: {
        invoice_items: true,
        payment_allocations: {
          include: {
            payments: {
              select: {
                id: true,
                receiptNumber: true,
                paymentDate: true,
                paymentMethod: true,
                amount: true,
              },
            },
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    return invoice;
  }

  async getPayments(query: PortalPaginationDto, rbac: RbacContext) {
    const resident = await this.resolveResident(rbac);
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.paymentsWhereInput = {
      organizationId: rbac.organizationId,
      residentId: resident.id,
      deletedAt: null,
    };

    if (query.status) {
      where.status = query.status as any;
    }
    if (query.search) {
      where.receiptNumber = { contains: query.search, mode: 'insensitive' };
    }

    const [items, total] = await Promise.all([
      this.prisma.payments.findMany({
        where,
        skip,
        take: limit,
        orderBy: { paymentDate: 'desc' },
      }),
      this.prisma.payments.count({ where }),
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

  async getPaymentById(paymentId: string, rbac: RbacContext) {
    const resident = await this.resolveResident(rbac);
    const payment = await this.prisma.payments.findFirst({
      where: {
        id: paymentId,
        organizationId: rbac.organizationId,
        residentId: resident.id,
        deletedAt: null,
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    return payment;
  }

  async getDepositInfo(rbac: RbacContext) {
    const resident = await this.resolveResident(rbac);
    const transactions = await this.prisma.deposit_transactions.findMany({
      where: {
        organizationId: rbac.organizationId,
        residentId: resident.id,
      },
      orderBy: { transactionDate: 'desc' },
    });

    let totalCollected = new Prisma.Decimal(0);
    let totalRefunded = new Prisma.Decimal(0);
    let totalDeducted = new Prisma.Decimal(0);

    for (const tx of transactions) {
      if (tx.transactionType === 'COLLECTED') {
        totalCollected = totalCollected.plus(tx.amount);
      } else if (tx.transactionType === 'REFUNDED') {
        totalRefunded = totalRefunded.plus(tx.amount);
      } else {
        totalDeducted = totalDeducted.plus(tx.amount);
      }
    }

    const currentBalance = totalCollected.minus(totalRefunded).minus(totalDeducted);

    return {
      totalCollected: Number(totalCollected),
      totalRefunded: Number(totalRefunded),
      totalDeducted: Number(totalDeducted),
      currentBalance: Number(currentBalance),
      transactions,
    };
  }

  async getNotices(query: any, rbac: RbacContext) {
    return this.noticesService.findAll(query, rbac);
  }

  async getNotifications(query: any, rbac: RbacContext) {
    return this.notificationsService.findAll(query, rbac);
  }

  async getUnreadNotificationsCount(rbac: RbacContext) {
    return this.notificationsService.getUnreadCount(rbac);
  }

  async markNotificationAsRead(id: string, rbac: RbacContext, ip?: string) {
    const res = await this.notificationsService.markAsRead(id, rbac);
    await this.createAuditLog({
      organizationId: rbac.organizationId,
      userId: rbac.userId,
      action: 'portal.notification.read',
      entityId: id,
      ipAddress: ip,
    });
    return res;
  }

  async markAllNotificationsAsRead(rbac: RbacContext, ip?: string) {
    const res = await this.notificationsService.markAllAsRead(rbac);
    await this.createAuditLog({
      organizationId: rbac.organizationId,
      userId: rbac.userId,
      action: 'portal.notification.read_all',
      entityId: rbac.userId,
      ipAddress: ip,
    });
    return res;
  }

  async getComplaints(query: any, rbac: RbacContext) {
    const resident = await this.resolveResident(rbac);
    return this.complaintsService.findAll({ ...query, residentId: resident.id }, rbac);
  }

  async createComplaint(dto: CreatePortalComplaintDto, rbac: RbacContext, ip?: string) {
    const resident = await this.resolveResident(rbac);
    if (!resident.propertyId) {
      throw new BadRequestException('Resident is not assigned to a property');
    }

    const complaint = await this.complaintsService.create(
      {
        ...dto,
        propertyId: resident.propertyId,
        residentId: resident.id,
      },
      rbac,
      ip,
    );

    await this.createAuditLog({
      organizationId: rbac.organizationId,
      userId: rbac.userId,
      action: 'portal.complaint.created',
      entityId: complaint.id,
      newValues: {
        ticketNumber: complaint.ticketNumber,
        subject: complaint.subject,
        category: complaint.category,
      },
      ipAddress: ip,
    });

    return complaint;
  }

  async getComplaintById(id: string, rbac: RbacContext) {
    const resident = await this.resolveResident(rbac);
    const complaint = await this.complaintsService.findOne(id, rbac);
    if (complaint.residentId !== resident.id) {
      throw new NotFoundException('Complaint not found');
    }
    return complaint;
  }

  async getComplaintHistory(id: string, rbac: RbacContext) {
    const resident = await this.resolveResident(rbac);
    const complaint = await this.complaintsService.findOne(id, rbac);
    if (complaint.residentId !== resident.id) {
      throw new NotFoundException('Complaint not found');
    }
    return this.complaintsService.findHistory(id, rbac);
  }

  async getMaintenance(query: any, rbac: RbacContext) {
    const resident = await this.resolveResident(rbac);
    return this.maintenanceService.findAll({ ...query, residentId: resident.id }, rbac);
  }

  async createMaintenance(dto: CreatePortalMaintenanceDto, rbac: RbacContext, ip?: string) {
    const resident = await this.resolveResident(rbac);
    if (!resident.propertyId) {
      throw new BadRequestException('Resident is not assigned to a property');
    }

    const created = await this.maintenanceService.create(
      {
        ...dto,
        propertyId: resident.propertyId,
        residentId: resident.id,
        roomId: resident.roomId || undefined,
        bedId: resident.bedId || undefined,
      },
      rbac,
      ip,
    );

    await this.createAuditLog({
      organizationId: rbac.organizationId,
      userId: rbac.userId,
      action: 'portal.maintenance.created',
      entityId: created.id,
      newValues: {
        ticketNumber: created.ticketNumber,
        title: created.title,
        category: created.category,
      },
      ipAddress: ip,
    });

    return created;
  }

  async getMaintenanceById(id: string, rbac: RbacContext) {
    const resident = await this.resolveResident(rbac);
    const record = await this.maintenanceService.findOne(id, rbac);
    if (
      record.residentId !== resident.id &&
      (!resident.propertyId || record.propertyId !== resident.propertyId)
    ) {
      throw new NotFoundException('Maintenance request not found');
    }
    return record;
  }

  async getMaintenanceHistory(id: string, rbac: RbacContext) {
    await this.getMaintenanceById(id, rbac);
    return this.maintenanceService.findHistory(id, rbac);
  }

  async getLeaves(query: any, rbac: RbacContext) {
    const resident = await this.resolveResident(rbac);
    return this.leavesService.findAll({ ...query, residentId: resident.id }, rbac);
  }

  async createLeave(dto: CreatePortalLeaveDto, rbac: RbacContext, ip?: string) {
    const resident = await this.resolveResident(rbac);
    const leave = await this.leavesService.create(
      {
        ...dto,
        residentId: resident.id,
        propertyId: resident.propertyId || undefined,
      },
      rbac,
      ip,
    );

    await this.createAuditLog({
      organizationId: rbac.organizationId,
      userId: rbac.userId,
      action: 'portal.leave.created',
      entityId: leave.id,
      newValues: {
        startDate: leave.startDate,
        endDate: leave.endDate,
        reason: leave.reason,
      },
      ipAddress: ip,
    });

    return leave;
  }

  async getLeaveById(id: string, rbac: RbacContext) {
    const resident = await this.resolveResident(rbac);
    const leave = await this.leavesService.findOne(id, rbac);
    if (leave.residentId !== resident.id) {
      throw new NotFoundException('Leave request not found');
    }
    return leave;
  }

  async cancelLeave(id: string, rbac: RbacContext, ip?: string) {
    const resident = await this.resolveResident(rbac);
    const existing = await this.leavesService.findOne(id, rbac);
    if (existing.residentId !== resident.id) {
      throw new NotFoundException('Leave request not found');
    }

    const cancelled = await this.leavesService.cancel(id, rbac, ip);

    await this.createAuditLog({
      organizationId: rbac.organizationId,
      userId: rbac.userId,
      action: 'portal.leave.cancelled',
      entityId: id,
      ipAddress: ip,
    });

    return cancelled;
  }

  async getFoodMenu(rbac: RbacContext) {
    const resident = await this.resolveResident(rbac);
    if (!resident.propertyId) {
      return { menu: null, items: [] };
    }

    const menu = await this.prisma.weekly_menus.findFirst({
      where: {
        organizationId: rbac.organizationId,
        propertyId: resident.propertyId,
        isPublished: true,
      },
      orderBy: { weekStartDate: 'desc' },
      include: {
        daily_menu_items: {
          orderBy: [{ dayOfWeek: 'asc' }, { mealType: 'asc' }],
        },
      },
    });

    return menu;
  }

  async getMeals(query: PortalPaginationDto, rbac: RbacContext) {
    const resident = await this.resolveResident(rbac);
    if (!resident.propertyId) {
      return { items: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } };
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.meal_recordsWhereInput = {
      organizationId: rbac.organizationId,
      propertyId: resident.propertyId,
    };

    const [items, total] = await Promise.all([
      this.prisma.meal_records.findMany({
        where,
        skip,
        take: limit,
        orderBy: { mealDate: 'desc' },
        select: {
          id: true,
          mealDate: true,
          mealType: true,
          notes: true,
          createdAt: true,
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

  async getMealAttendance(query: PortalPaginationDto, rbac: RbacContext) {
    const resident = await this.resolveResident(rbac);
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.meal_attendancesWhereInput = {
      residentId: resident.id,
      meal_records: {
        organizationId: rbac.organizationId,
      },
    };

    const [items, total] = await Promise.all([
      this.prisma.meal_attendances.findMany({
        where,
        skip,
        take: limit,
        orderBy: { markedAt: 'desc' },
        include: {
          meal_records: {
            select: {
              id: true,
              mealDate: true,
              mealType: true,
            },
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

  async getVisitors(query: any, rbac: RbacContext) {
    const resident = await this.resolveResident(rbac);
    return this.visitorsService.findAll({ ...query, residentId: resident.id }, rbac);
  }

  async getVisitorById(id: string, rbac: RbacContext) {
    const resident = await this.resolveResident(rbac);
    const visitor = await this.visitorsService.findOne(id, rbac);
    if (visitor.residentId !== resident.id) {
      throw new NotFoundException('Visitor not found');
    }
    return visitor;
  }

  async getDocuments(rbac: RbacContext) {
    const resident = await this.resolveResident(rbac);
    const docs = await this.prisma.resident_documents.findMany({
      where: {
        organizationId: rbac.organizationId,
        residentId: resident.id,
      },
      select: {
        id: true,
        documentType: true,
        documentNumber: true,
        fileName: true,
        fileUrl: true,
        verificationStatus: true,
        verifiedAt: true,
        remarks: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return docs;
  }

  async getBookings(rbac: RbacContext) {
    const resident = await this.resolveResident(rbac);
    return this.prisma.bookings.findMany({
      where: {
        organizationId: rbac.organizationId,
        residentId: resident.id,
      },
      include: {
        beds: { select: { id: true, bedNumber: true } },
        rooms: { select: { id: true, roomNumber: true } },
        properties: { select: { id: true, name: true, code: true } },
      },
      orderBy: { bookingDate: 'desc' },
    });
  }

  async getMoveIns(rbac: RbacContext) {
    const resident = await this.resolveResident(rbac);
    return this.prisma.move_ins.findMany({
      where: {
        organizationId: rbac.organizationId,
        residentId: resident.id,
      },
      include: {
        beds: { select: { id: true, bedNumber: true } },
        properties: { select: { id: true, name: true, code: true } },
      },
      orderBy: { moveInDate: 'desc' },
    });
  }

  async getMoveOuts(rbac: RbacContext) {
    const resident = await this.resolveResident(rbac);
    return this.prisma.move_outs.findMany({
      where: {
        organizationId: rbac.organizationId,
        residentId: resident.id,
      },
      include: {
        properties: { select: { id: true, name: true, code: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDashboard(rbac: RbacContext) {
    const resident = await this.resolveResident(rbac);
    const profile = this.formatSafeProfile(resident);

    const propertyId = resident.propertyId;

    const [
      invoices,
      payments,
      depositTxs,
      noticesResult,
      unreadNotifsCount,
      openComplaintsCount,
      recentComplaints,
      activeMaintenanceCount,
      recentMaintenance,
      recentLeaves,
      todayMenu,
    ] = await Promise.all([
      this.prisma.invoices.findMany({
        where: {
          organizationId: rbac.organizationId,
          residentId: resident.id,
        },
        orderBy: { issuedAt: 'desc' },
        take: 5,
      }),
      this.prisma.payments.findMany({
        where: {
          organizationId: rbac.organizationId,
          residentId: resident.id,
          deletedAt: null,
        },
        orderBy: { paymentDate: 'desc' },
        take: 5,
      }),
      this.prisma.deposit_transactions.findMany({
        where: {
          organizationId: rbac.organizationId,
          residentId: resident.id,
        },
      }),
      this.noticesService.findAll({ page: 1, limit: 5 }, rbac),
      this.notificationsService.getUnreadCount(rbac),
      this.prisma.complaints.count({
        where: {
          organizationId: rbac.organizationId,
          residentId: resident.id,
          status: { in: ['SUBMITTED', 'REVIEWED', 'INVESTIGATING'] },
        },
      }),
      this.prisma.complaints.findMany({
        where: {
          organizationId: rbac.organizationId,
          residentId: resident.id,
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.prisma.maintenance_requests.count({
        where: {
          organizationId: rbac.organizationId,
          residentId: resident.id,
          status: { in: ['CREATED', 'ASSIGNED', 'IN_PROGRESS'] },
        },
      }),
      this.prisma.maintenance_requests.findMany({
        where: {
          organizationId: rbac.organizationId,
          residentId: resident.id,
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.leavesService.findAll({ page: 1, limit: 3, residentId: resident.id }, rbac),
      propertyId
        ? this.prisma.weekly_menus.findFirst({
            where: {
              organizationId: rbac.organizationId,
              propertyId,
              isPublished: true,
            },
            orderBy: { weekStartDate: 'desc' },
            include: {
              daily_menu_items: {
                take: 4,
              },
            },
          })
        : null,
    ]);

    const outstandingAgg = await this.prisma.invoices.aggregate({
      where: {
        organizationId: rbac.organizationId,
        residentId: resident.id,
        status: { notIn: ['PAID', 'CANCELLED', 'DRAFT'] },
      },
      _sum: {
        outstandingAmount: true,
      },
    });
    const outstandingBalance = Number(outstandingAgg._sum.outstandingAmount || 0);

    let totalDepositCollected = new Prisma.Decimal(0);
    let totalDepositRefunded = new Prisma.Decimal(0);
    let totalDepositDeducted = new Prisma.Decimal(0);
    for (const tx of depositTxs) {
      if (tx.transactionType === 'COLLECTED') {
        totalDepositCollected = totalDepositCollected.plus(tx.amount);
      } else if (tx.transactionType === 'REFUNDED') {
        totalDepositRefunded = totalDepositRefunded.plus(tx.amount);
      } else {
        totalDepositDeducted = totalDepositDeducted.plus(tx.amount);
      }
    }
    const currentDepositBalance = totalDepositCollected
      .minus(totalDepositRefunded)
      .minus(totalDepositDeducted);

    const accommodation = {
      property: resident.properties
        ? {
            id: resident.properties.id,
            name: resident.properties.name,
            code: resident.properties.code,
            addressLine1: resident.properties.addressLine1,
            city: resident.properties.city,
            state: resident.properties.state,
            pincode: resident.properties.pincode,
          }
        : null,
      floor: resident.floors
        ? {
            id: resident.floors.id,
            floorNumber: resident.floors.floorNumber,
            name: resident.floors.name,
          }
        : null,
      room: resident.rooms
        ? {
            id: resident.rooms.id,
            roomNumber: resident.rooms.roomNumber,
            roomType: resident.rooms.roomType,
          }
        : null,
      bed: resident.beds
        ? {
            id: resident.beds.id,
            bedNumber: resident.beds.bedNumber,
          }
        : null,
    };

    const stay = resident.resident_stays?.[0]
      ? {
          id: resident.resident_stays[0].id,
          status: resident.resident_stays[0].status,
          checkInDate: resident.resident_stays[0].checkInDate,
          expectedCheckOutDate: resident.resident_stays[0].expectedCheckOutDate,
          monthlyRent: Number(resident.resident_stays[0].monthlyRent),
          securityDeposit: Number(resident.resident_stays[0].securityDeposit),
        }
      : resident.status === 'ACTIVE' && resident.propertyId
      ? {
          id: resident.id,
          status: resident.status,
          checkInDate: resident.joiningDate,
          expectedCheckOutDate: resident.expectedMoveOutDate,
          monthlyRent: Number(resident.monthlyRent),
          securityDeposit: Number(resident.securityDeposit),
        }
      : null;

    return {
      profile,
      property: accommodation.property,
      currentAccommodation: accommodation,
      currentStay: stay,
      outstandingBalance,
      recentInvoices: invoices,
      recentPayments: payments,
      depositBalance: Number(currentDepositBalance),
      recentNotices: (noticesResult as any).items || [],
      unreadNotificationsCount: (unreadNotifsCount as any)?.unreadCount ?? (unreadNotifsCount as any)?.count ?? 0,
      openComplaintsCount,
      recentComplaints,
      activeMaintenanceCount,
      recentMaintenance,
      leaveStatus: (recentLeaves as any).items || [],
      upcomingMenu: todayMenu,
    };
  }
}
