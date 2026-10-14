import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ComplaintCategory, ComplaintStatus, MaintenancePriority, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RbacContext } from '../rbac/types/rbac.types';
import { ComplaintQueryDto } from './dto/complaint-query.dto';
import { CreateComplaintDto } from './dto/create-complaint.dto';
import { UpdateComplaintDto } from './dto/update-complaint.dto';

@Injectable()
export class ComplaintsService {
  constructor(private readonly prisma: PrismaService) {}

  private createAuditLogTx(
    tx: Prisma.TransactionClient,
    params: {
      organizationId: string;
      userId: string;
      action: string;
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
        userId: params.userId,
        action: params.action,
        entityType: 'complaints',
        entityId: params.entityId,
        oldValues: params.oldValues ? JSON.stringify(params.oldValues) : null,
        newValues: params.newValues ? JSON.stringify(params.newValues) : null,
        ipAddress: params.ipAddress ?? null,
        createdAt: new Date(),
      },
    });
  }

  private async resolveResidentProfile(rbac: RbacContext) {
    const resident = await this.prisma.residents.findFirst({
      where: {
        organizationId: rbac.organizationId,
        deletedAt: null,
        OR: [
          { userId: rbac.userId },
          { email: rbac.email },
        ],
      },
    });

    if (!resident) {
      throw new BadRequestException('No active resident profile found for this user in this organization');
    }

    if (!resident.userId) {
      await this.prisma.residents.update({
        where: { id: resident.id },
        data: { userId: rbac.userId },
      });
    }

    return resident;
  }

  async create(dto: CreateComplaintDto, rbac: RbacContext, ip?: string) {
    const organizationId = rbac.organizationId;
    let residentId = dto.residentId;
    let propertyId = dto.propertyId;

    if (rbac.role === 'RESIDENT') {
      const resident = await this.resolveResidentProfile(rbac);
      residentId = resident.id;
      if (!propertyId && resident.propertyId) {
        propertyId = resident.propertyId;
      } else if (resident.propertyId && propertyId !== resident.propertyId) {
        throw new BadRequestException('Complaint property must match resident assigned property');
      }
    } else {
      if (!residentId) {
        throw new BadRequestException('residentId is required');
      }
      const resident = await this.prisma.residents.findFirst({
        where: { id: residentId, organizationId, deletedAt: null },
      });
      if (!resident) {
        throw new NotFoundException('Resident not found in this organization');
      }
    }

    const property = await this.prisma.properties.findFirst({
      where: { id: propertyId, organizationId, deletedAt: null },
    });
    if (!property) {
      throw new NotFoundException('Property not found in this organization');
    }

    if (dto.assignedToId) {
      if (!rbac.permissions.includes('maintenance.assign')) {
        throw new ForbiddenException('Assigning complaints requires maintenance.assign permission');
      }
      const staffUser = await this.prisma.organization_members.findFirst({
        where: { userId: dto.assignedToId, organizationId, status: 'ACTIVE' },
      });
      if (!staffUser) {
        throw new NotFoundException('Assigned staff user not found in this organization');
      }
    }

    const ticketNumber =
      dto.ticketNumber ||
      `CMP-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;

    const complaintId = randomUUID();
    const status = dto.status || ComplaintStatus.SUBMITTED;
    const category = dto.category || ComplaintCategory.OTHER;
    const priority = dto.priority || MaintenancePriority.MEDIUM;
    const now = new Date();

    const complaint = await this.prisma.$transaction(async (tx) => {
      const created = await tx.complaints.create({
        data: {
          id: complaintId,
          organizationId,
          propertyId,
          residentId: residentId!,
          ticketNumber,
          category,
          subject: dto.subject,
          description: dto.description,
          priority,
          status,
          assignedToId: dto.assignedToId ?? null,
          createdAt: now,
          updatedAt: now,
        },
        include: {
          properties: { select: { id: true, name: true } },
          residents: { select: { id: true, fullName: true, phone: true, email: true } },
          users: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      });

      await tx.complaint_history.create({
        data: {
          id: randomUUID(),
          complaintId,
          actorUserId: rbac.userId,
          oldStatus: null,
          newStatus: status,
          notes: dto.notes || 'Complaint submitted',
          createdAt: now,
        },
      });

      await this.createAuditLogTx(tx, {
        organizationId,
        userId: rbac.userId,
        action: 'complaint.created',
        entityId: complaintId,
        newValues: {
          ticketNumber,
          category,
          priority,
          status,
          subject: dto.subject,
          propertyId,
          residentId,
        },
        ipAddress: ip,
      });

      return created;
    });

    return complaint;
  }

  async findAll(query: ComplaintQueryDto, rbac: RbacContext) {
    const organizationId = rbac.organizationId;
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.complaintsWhereInput = {
      organizationId,
    };

    if (rbac.role === 'RESIDENT') {
      const resident = await this.resolveResidentProfile(rbac);
      where.residentId = resident.id;
    } else if (query.residentId) {
      where.residentId = query.residentId;
    }

    if (query.status) {
      where.status = query.status;
    }
    if (query.category) {
      where.category = query.category;
    }
    if (query.priority) {
      where.priority = query.priority;
    }
    if (query.propertyId) {
      where.propertyId = query.propertyId;
    }
    if (query.assignedToId) {
      where.assignedToId = query.assignedToId;
    }
    if (query.search) {
      where.OR = [
        { ticketNumber: { contains: query.search, mode: 'insensitive' } },
        { subject: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const orderBy: Prisma.complaintsOrderByWithRelationInput = {};
    const sortField = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder || 'desc';
    orderBy[sortField] = sortOrder;

    const [items, total] = await Promise.all([
      this.prisma.complaints.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          properties: { select: { id: true, name: true } },
          residents: { select: { id: true, fullName: true, phone: true, email: true } },
          users: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      }),
      this.prisma.complaints.count({ where }),
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

  async findOne(id: string, rbac: RbacContext) {
    const complaint = await this.prisma.complaints.findFirst({
      where: {
        id,
        organizationId: rbac.organizationId,
      },
      include: {
        properties: { select: { id: true, name: true, addressLine1: true } },
        residents: { select: { id: true, fullName: true, phone: true, email: true } },
        users: { select: { id: true, firstName: true, lastName: true, email: true } },
        complaint_history: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!complaint) {
      throw new NotFoundException('Complaint not found');
    }

    if (rbac.role === 'RESIDENT') {
      const resident = await this.resolveResidentProfile(rbac);
      if (complaint.residentId !== resident.id) {
        throw new NotFoundException('Complaint not found');
      }
    }

    return complaint;
  }

  async findHistory(id: string, rbac: RbacContext) {
    await this.findOne(id, rbac);

    return this.prisma.complaint_history.findMany({
      where: { complaintId: id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(id: string, dto: UpdateComplaintDto, rbac: RbacContext, ip?: string) {
    const existing = await this.findOne(id, rbac);

    if (dto.assignedToId !== undefined && dto.assignedToId !== existing.assignedToId) {
      if (!rbac.permissions.includes('maintenance.assign')) {
        throw new ForbiddenException('Assigning complaints requires maintenance.assign permission');
      }
      if (dto.assignedToId !== null) {
        const staffUser = await this.prisma.organization_members.findFirst({
          where: { userId: dto.assignedToId, organizationId: rbac.organizationId, status: 'ACTIVE' },
        });
        if (!staffUser) {
          throw new NotFoundException('Assigned staff user not found in this organization');
        }
      }
    }

    const now = new Date();
    const statusChanged = dto.status && dto.status !== existing.status;
    const assignedChanged = dto.assignedToId !== undefined && dto.assignedToId !== existing.assignedToId;

    const dataToUpdate: Prisma.complaintsUpdateInput = {
      updatedAt: now,
    };

    if (dto.category) dataToUpdate.category = dto.category;
    if (dto.subject) dataToUpdate.subject = dto.subject;
    if (dto.description) dataToUpdate.description = dto.description;
    if (dto.priority) dataToUpdate.priority = dto.priority;
    if (dto.status) dataToUpdate.status = dto.status;
    if (dto.assignedToId !== undefined) {
      dataToUpdate.users = dto.assignedToId ? { connect: { id: dto.assignedToId } } : { disconnect: true };
    }
    if (dto.investigationNotes !== undefined) dataToUpdate.investigationNotes = dto.investigationNotes;
    if (dto.resolutionNotes !== undefined) dataToUpdate.resolutionNotes = dto.resolutionNotes;

    if (dto.status === ComplaintStatus.RESOLVED && !existing.resolvedAt) {
      dataToUpdate.resolvedAt = now;
    }
    if (dto.status === ComplaintStatus.CLOSED && !existing.closedAt) {
      dataToUpdate.closedAt = now;
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.complaints.update({
        where: { id },
        data: dataToUpdate,
        include: {
          properties: { select: { id: true, name: true } },
          residents: { select: { id: true, fullName: true, phone: true, email: true } },
          users: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      });

      if (statusChanged || dto.notes) {
        await tx.complaint_history.create({
          data: {
            id: randomUUID(),
            complaintId: id,
            actorUserId: rbac.userId,
            oldStatus: existing.status,
            newStatus: dto.status || existing.status,
            notes: dto.notes || dto.resolutionNotes || dto.investigationNotes || `Status changed to ${dto.status || existing.status}`,
            createdAt: now,
          },
        });
      }

      if (statusChanged) {
        await this.createAuditLogTx(tx, {
          organizationId: rbac.organizationId,
          userId: rbac.userId,
          action: 'complaint.status_changed',
          entityId: id,
          oldValues: { status: existing.status },
          newValues: { status: updated.status },
          ipAddress: ip,
        });
      }
      if (assignedChanged) {
        await this.createAuditLogTx(tx, {
          organizationId: rbac.organizationId,
          userId: rbac.userId,
          action: 'complaint.assigned',
          entityId: id,
          oldValues: { assignedToId: existing.assignedToId },
          newValues: { assignedToId: updated.assignedToId },
          ipAddress: ip,
        });
      }
      if (!statusChanged && !assignedChanged) {
        await this.createAuditLogTx(tx, {
          organizationId: rbac.organizationId,
          userId: rbac.userId,
          action: 'complaint.updated',
          entityId: id,
          oldValues: { priority: existing.priority },
          newValues: { priority: updated.priority, investigationNotes: updated.investigationNotes },
          ipAddress: ip,
        });
      }

      return updated;
    });

    return result;
  }
}
