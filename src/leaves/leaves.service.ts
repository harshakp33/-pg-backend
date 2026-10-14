import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RbacContext } from '../rbac/types/rbac.types';
import { CreateLeaveDto } from './dto/create-leave.dto';
import { LeaveQueryDto, LeaveStatusEnum } from './dto/leave-query.dto';
import { RejectLeaveDto } from './dto/reject-leave.dto';
import { UpdateLeaveDto } from './dto/update-leave.dto';

export interface LeaveRecord {
  id: string;
  organizationId: string;
  propertyId: string;
  residentId: string;
  residentStayId?: string | null;
  startDate: string;
  endDate: string;
  reason: string;
  notes?: string | null;
  emergencyContactPhone?: string | null;
  optOutMeals?: boolean;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  approvedByUserId?: string | null;
  approvedAt?: string | null;
  rejectedByUserId?: string | null;
  rejectionReason?: string | null;
  rejectedAt?: string | null;
  cancelledAt?: string | null;
  createdAt: string;
  updatedAt: string;
  properties?: {
    id: string;
    name: string;
    addressLine1?: string | null;
    city?: string | null;
  } | null;
  residents?: {
    id: string;
    fullName: string;
    phone: string;
    email?: string | null;
  } | null;
  approvedByUser?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  rejectedByUser?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
}

@Injectable()
export class LeavesService {
  constructor(private readonly prisma: PrismaService) {}

  private async getLeaveByIdTx(
    tx: any,
    organizationId: string,
    id: string,
  ): Promise<LeaveRecord | null> {
    const logs = await tx.audit_logs.findMany({
      where: {
        organizationId,
        entityType: 'leaves',
        entityId: id,
      },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });

    if (!logs || logs.length === 0) return null;
    try {
      const parsed = JSON.parse(logs[0].newValues);
      return parsed;
    } catch {
      return null;
    }
  }

  private async getAllActiveLeavesForResident(
    organizationId: string,
    residentId: string,
  ): Promise<LeaveRecord[]> {
    const logs = await this.prisma.audit_logs.findMany({
      where: {
        organizationId,
        entityType: 'leaves',
      },
      orderBy: { createdAt: 'asc' },
    });

    const map = new Map<string, LeaveRecord>();
    for (const log of logs) {
      try {
        const item = JSON.parse(log.newValues) as LeaveRecord;
        if (item.residentId === residentId) {
          map.set(item.id, item);
        }
      } catch {}
    }

    return Array.from(map.values());
  }

  private async enrichLeaveRecord(
    record: LeaveRecord,
    organizationId: string,
  ): Promise<LeaveRecord> {
    const [property, resident, approvedUser, rejectedUser] = await Promise.all([
      record.propertyId
        ? this.prisma.properties.findFirst({
            where: { id: record.propertyId, organizationId },
            select: { id: true, name: true, addressLine1: true, city: true },
          })
        : null,
      record.residentId
        ? this.prisma.residents.findFirst({
            where: { id: record.residentId, organizationId },
            select: { id: true, fullName: true, phone: true, email: true },
          })
        : null,
      record.approvedByUserId
        ? this.prisma.users.findUnique({
            where: { id: record.approvedByUserId },
            select: { id: true, firstName: true, lastName: true, email: true },
          })
        : null,
      record.rejectedByUserId
        ? this.prisma.users.findUnique({
            where: { id: record.rejectedByUserId },
            select: { id: true, firstName: true, lastName: true, email: true },
          })
        : null,
    ]);

    return {
      ...record,
      properties: property,
      residents: resident,
      approvedByUser: approvedUser,
      rejectedByUser: rejectedUser,
    };
  }

  async create(dto: CreateLeaveDto, rbac: RbacContext, ipAddress?: string): Promise<LeaveRecord> {
    if (rbac.role === 'ACCOUNTANT') {
      throw new ForbiddenException('Accountant does not have access to leave management');
    }

    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException('Invalid start or end date format');
    }
    if (start > end) {
      throw new BadRequestException('Start date must not be after end date');
    }

    let targetResidentId: string;
    let targetPropertyId: string;
    let targetResidentStayId: string | null = null;

    if (rbac.role === 'RESIDENT') {
      const resident = await this.prisma.residents.findFirst({
        where: {
          userId: rbac.userId,
          organizationId: rbac.organizationId,
          deletedAt: null,
        },
        include: {
          resident_stays: {
            where: { status: 'ACTIVE' },
            take: 1,
          },
        },
      });

      if (!resident) {
        throw new NotFoundException('Active resident profile not found for user');
      }

      targetResidentId = resident.id;
      targetPropertyId = resident.propertyId!;
      targetResidentStayId = resident.resident_stays[0]?.id || null;
    } else {
      if (!dto.residentId) {
        throw new BadRequestException('residentId is required when creating leave as administrator');
      }

      const resident = await this.prisma.residents.findFirst({
        where: {
          id: dto.residentId,
          organizationId: rbac.organizationId,
          deletedAt: null,
        },
        include: {
          resident_stays: {
            where: { status: 'ACTIVE' },
            take: 1,
          },
        },
      });

      if (!resident) {
        throw new NotFoundException('Resident not found in this organization');
      }

      targetResidentId = resident.id;
      targetPropertyId = dto.propertyId ?? resident.propertyId!;
      targetResidentStayId = resident.resident_stays[0]?.id || null;

      const property = await this.prisma.properties.findFirst({
        where: {
          id: targetPropertyId,
          organizationId: rbac.organizationId,
          deletedAt: null,
        },
      });

      if (!property) {
        throw new NotFoundException('Property not found in this organization');
      }
    }

    // Check for overlapping leaves for the resident
    const existingLeaves = await this.getAllActiveLeavesForResident(rbac.organizationId, targetResidentId);
    const overlapping = existingLeaves.find((l) => {
      if (l.status !== 'PENDING' && l.status !== 'APPROVED') return false;
      const lStart = new Date(l.startDate);
      const lEnd = new Date(l.endDate);
      return !(end < lStart || start > lEnd);
    });

    if (overlapping) {
      throw new BadRequestException('Resident already has an active or pending leave during this period');
    }

    const leaveId = randomUUID();
    const now = new Date();

    const record: LeaveRecord = {
      id: leaveId,
      organizationId: rbac.organizationId,
      propertyId: targetPropertyId,
      residentId: targetResidentId,
      residentStayId: targetResidentStayId,
      startDate: dto.startDate,
      endDate: dto.endDate,
      reason: dto.reason,
      notes: dto.notes ?? null,
      emergencyContactPhone: dto.emergencyContactPhone ?? null,
      optOutMeals: dto.optOutMeals ?? false,
      status: 'PENDING',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    await this.prisma.audit_logs.create({
      data: {
        id: randomUUID(),
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'leave.created',
        entityType: 'leaves',
        entityId: leaveId,
        newValues: JSON.stringify(record),
        ipAddress: ipAddress ?? null,
        createdAt: now,
      },
    });

    return this.enrichLeaveRecord(record, rbac.organizationId);
  }

  async findAll(query: LeaveQueryDto, rbac: RbacContext) {
    if (rbac.role === 'ACCOUNTANT') {
      throw new ForbiddenException('Accountant does not have access to leave management');
    }

    let scopedResidentId: string | undefined;
    if (rbac.role === 'RESIDENT') {
      const resident = await this.prisma.residents.findFirst({
        where: {
          userId: rbac.userId,
          organizationId: rbac.organizationId,
          deletedAt: null,
        },
      });
      if (!resident) {
        return { items: [], meta: { total: 0, page: 1, limit: query.limit || 20, totalPages: 0 } };
      }
      scopedResidentId = resident.id;
    } else {
      scopedResidentId = query.residentId;
    }

    const logs = await this.prisma.audit_logs.findMany({
      where: {
        organizationId: rbac.organizationId,
        entityType: 'leaves',
      },
      orderBy: { createdAt: 'asc' },
    });

    const map = new Map<string, LeaveRecord>();
    for (const log of logs) {
      try {
        const item = JSON.parse(log.newValues) as LeaveRecord;
        map.set(item.id, item);
      } catch {}
    }

    let records = Array.from(map.values());

    // Filter by residentId
    if (scopedResidentId) {
      records = records.filter((r) => r.residentId === scopedResidentId);
    }

    // Filter by propertyId
    if (query.propertyId) {
      records = records.filter((r) => r.propertyId === query.propertyId);
    }

    // Filter by status
    if (query.status) {
      records = records.filter((r) => r.status === query.status);
    }

    // Filter by startDate / endDate
    if (query.startDate) {
      const qStart = new Date(query.startDate);
      records = records.filter((r) => new Date(r.startDate) >= qStart);
    }
    if (query.endDate) {
      const qEnd = new Date(query.endDate);
      records = records.filter((r) => new Date(r.endDate) <= qEnd);
    }

    // Search filter
    if (query.search) {
      const s = query.search.toLowerCase();
      records = records.filter(
        (r) =>
          r.reason.toLowerCase().includes(s) ||
          (r.notes && r.notes.toLowerCase().includes(s)),
      );
    }

    // Sort descending by createdAt
    records.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = records.length;
    const page = Math.max(1, query.page || 1);
    const limit = Math.max(1, Math.min(100, query.limit || 20));
    const skip = (page - 1) * limit;
    const paged = records.slice(skip, skip + limit);

    const enriched = await Promise.all(
      paged.map((r) => this.enrichLeaveRecord(r, rbac.organizationId)),
    );

    return {
      items: enriched,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, rbac: RbacContext): Promise<LeaveRecord> {
    if (rbac.role === 'ACCOUNTANT') {
      throw new ForbiddenException('Accountant does not have access to leave management');
    }

    const record = await this.getLeaveByIdTx(this.prisma, rbac.organizationId, id);
    if (!record) {
      throw new NotFoundException('Leave request not found');
    }

    if (rbac.role === 'RESIDENT') {
      const resident = await this.prisma.residents.findFirst({
        where: {
          userId: rbac.userId,
          organizationId: rbac.organizationId,
          deletedAt: null,
        },
      });

      if (!resident || record.residentId !== resident.id) {
        throw new NotFoundException('Leave request not found');
      }
    }

    return this.enrichLeaveRecord(record, rbac.organizationId);
  }

  async update(
    id: string,
    dto: UpdateLeaveDto,
    rbac: RbacContext,
    ipAddress?: string,
  ): Promise<LeaveRecord> {
    if (rbac.role === 'ACCOUNTANT') {
      throw new ForbiddenException('Accountant does not have access to leave management');
    }

    return this.prisma.$transaction(async (tx) => {
      // Row lock via advisory transaction lock
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'leave_' + id}))`;

      const existing = await this.getLeaveByIdTx(tx, rbac.organizationId, id);
      if (!existing) {
        throw new NotFoundException('Leave request not found');
      }

      if (rbac.role === 'RESIDENT') {
        const resident = await tx.residents.findFirst({
          where: {
            userId: rbac.userId,
            organizationId: rbac.organizationId,
            deletedAt: null,
          },
        });

        if (!resident || existing.residentId !== resident.id) {
          throw new NotFoundException('Leave request not found');
        }

        if (existing.status !== 'PENDING') {
          throw new BadRequestException('Cannot modify leave request that is already processed');
        }
      }

      const startDate = dto.startDate ?? existing.startDate;
      const endDate = dto.endDate ?? existing.endDate;

      if (dto.startDate || dto.endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
          throw new BadRequestException('Invalid start or end date format');
        }
        if (start > end) {
          throw new BadRequestException('Start date must not be after end date');
        }
      }

      const now = new Date();
      const updated: LeaveRecord = {
        ...existing,
        startDate,
        endDate,
        reason: dto.reason ?? existing.reason,
        notes: dto.notes !== undefined ? dto.notes : existing.notes,
        emergencyContactPhone:
          dto.emergencyContactPhone !== undefined
            ? dto.emergencyContactPhone
            : existing.emergencyContactPhone,
        optOutMeals: dto.optOutMeals !== undefined ? dto.optOutMeals : existing.optOutMeals,
        updatedAt: now.toISOString(),
      };

      await tx.audit_logs.create({
        data: {
          id: randomUUID(),
          organizationId: rbac.organizationId,
          userId: rbac.userId,
          action: 'leave.updated',
          entityType: 'leaves',
          entityId: id,
          oldValues: JSON.stringify(existing),
          newValues: JSON.stringify(updated),
          ipAddress: ipAddress ?? null,
          createdAt: now,
        },
      });

      return this.enrichLeaveRecord(updated, rbac.organizationId);
    });
  }

  async approve(id: string, rbac: RbacContext, ipAddress?: string): Promise<LeaveRecord> {
    if (rbac.role === 'ACCOUNTANT' || rbac.role === 'RESIDENT') {
      throw new ForbiddenException('Insufficient permissions to approve leave requests');
    }

    return this.prisma.$transaction(async (tx) => {
      // Row lock via advisory lock
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'leave_' + id}))`;

      const existing = await this.getLeaveByIdTx(tx, rbac.organizationId, id);
      if (!existing) {
        throw new NotFoundException('Leave request not found');
      }

      if (existing.status === 'APPROVED') {
        throw new BadRequestException('Leave request is already approved');
      }

      if (existing.status === 'REJECTED') {
        throw new BadRequestException('Cannot approve a rejected leave request');
      }

      if (existing.status === 'CANCELLED') {
        throw new BadRequestException('Cannot approve a cancelled leave request');
      }

      const now = new Date();
      const updated: LeaveRecord = {
        ...existing,
        status: 'APPROVED',
        approvedByUserId: rbac.userId,
        approvedAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };

      await tx.audit_logs.create({
        data: {
          id: randomUUID(),
          organizationId: rbac.organizationId,
          userId: rbac.userId,
          action: 'leave.approved',
          entityType: 'leaves',
          entityId: id,
          oldValues: JSON.stringify(existing),
          newValues: JSON.stringify(updated),
          ipAddress: ipAddress ?? null,
          createdAt: now,
        },
      });

      return this.enrichLeaveRecord(updated, rbac.organizationId);
    });
  }

  async reject(
    id: string,
    dto: RejectLeaveDto,
    rbac: RbacContext,
    ipAddress?: string,
  ): Promise<LeaveRecord> {
    if (rbac.role === 'ACCOUNTANT' || rbac.role === 'RESIDENT') {
      throw new ForbiddenException('Insufficient permissions to reject leave requests');
    }

    return this.prisma.$transaction(async (tx) => {
      // Row lock via advisory lock
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'leave_' + id}))`;

      const existing = await this.getLeaveByIdTx(tx, rbac.organizationId, id);
      if (!existing) {
        throw new NotFoundException('Leave request not found');
      }

      if (existing.status === 'REJECTED') {
        throw new BadRequestException('Leave request is already rejected');
      }

      if (existing.status === 'APPROVED') {
        throw new BadRequestException('Cannot reject an already approved leave request');
      }

      if (existing.status === 'CANCELLED') {
        throw new BadRequestException('Cannot reject a cancelled leave request');
      }

      const now = new Date();
      const updated: LeaveRecord = {
        ...existing,
        status: 'REJECTED',
        rejectedByUserId: rbac.userId,
        rejectionReason: dto.rejectionReason,
        rejectedAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };

      await tx.audit_logs.create({
        data: {
          id: randomUUID(),
          organizationId: rbac.organizationId,
          userId: rbac.userId,
          action: 'leave.rejected',
          entityType: 'leaves',
          entityId: id,
          oldValues: JSON.stringify(existing),
          newValues: JSON.stringify(updated),
          ipAddress: ipAddress ?? null,
          createdAt: now,
        },
      });

      return this.enrichLeaveRecord(updated, rbac.organizationId);
    });
  }

  async cancel(id: string, rbac: RbacContext, ipAddress?: string): Promise<LeaveRecord> {
    if (rbac.role === 'ACCOUNTANT') {
      throw new ForbiddenException('Accountant does not have access to leave management');
    }

    return this.prisma.$transaction(async (tx) => {
      // Row lock via advisory lock
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'leave_' + id}))`;

      const existing = await this.getLeaveByIdTx(tx, rbac.organizationId, id);
      if (!existing) {
        throw new NotFoundException('Leave request not found');
      }

      if (rbac.role === 'RESIDENT') {
        const resident = await tx.residents.findFirst({
          where: {
            userId: rbac.userId,
            organizationId: rbac.organizationId,
            deletedAt: null,
          },
        });

        if (!resident || existing.residentId !== resident.id) {
          throw new NotFoundException('Leave request not found');
        }

        if (existing.status !== 'PENDING') {
          throw new BadRequestException('Cannot cancel leave request that is already approved or rejected');
        }
      } else {
        if (existing.status === 'CANCELLED') {
          throw new BadRequestException('Leave request is already cancelled');
        }
      }

      const now = new Date();
      const updated: LeaveRecord = {
        ...existing,
        status: 'CANCELLED',
        cancelledAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };

      await tx.audit_logs.create({
        data: {
          id: randomUUID(),
          organizationId: rbac.organizationId,
          userId: rbac.userId,
          action: 'leave.cancelled',
          entityType: 'leaves',
          entityId: id,
          oldValues: JSON.stringify(existing),
          newValues: JSON.stringify(updated),
          ipAddress: ipAddress ?? null,
          createdAt: now,
        },
      });

      return this.enrichLeaveRecord(updated, rbac.organizationId);
    });
  }
}
