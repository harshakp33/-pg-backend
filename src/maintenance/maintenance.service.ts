import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MaintenanceCategory, MaintenancePriority, MaintenanceStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RbacContext } from '../rbac/types/rbac.types';
import { CreateMaintenanceDto } from './dto/create-maintenance.dto';
import { MaintenanceQueryDto } from './dto/maintenance-query.dto';
import { UpdateMaintenanceDto } from './dto/update-maintenance.dto';

@Injectable()
export class MaintenanceService {
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
        entityType: 'maintenance_requests',
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

  async create(dto: CreateMaintenanceDto, rbac: RbacContext, ip?: string) {
    const organizationId = rbac.organizationId;
    let residentId = dto.residentId;
    let propertyId = dto.propertyId;
    let roomId = dto.roomId;
    let bedId = dto.bedId;

    if (rbac.role === 'RESIDENT') {
      const resident = await this.resolveResidentProfile(rbac);
      residentId = resident.id;
      if (!propertyId && resident.propertyId) {
        propertyId = resident.propertyId;
      } else if (resident.propertyId && propertyId !== resident.propertyId) {
        throw new BadRequestException('Maintenance property must match resident assigned property');
      }
      if (!roomId && resident.roomId) roomId = resident.roomId;
      if (!bedId && resident.bedId) bedId = resident.bedId;
      dto.assignedStaffId = undefined;
      dto.vendorName = undefined;
      dto.status = MaintenanceStatus.CREATED;
    } else {
      if (residentId) {
        const resident = await this.prisma.residents.findFirst({
          where: { id: residentId, organizationId, deletedAt: null },
        });
        if (!resident) {
          throw new NotFoundException('Resident not found in this organization');
        }
      }
    }

    const property = await this.prisma.properties.findFirst({
      where: { id: propertyId, organizationId, deletedAt: null },
    });
    if (!property) {
      throw new NotFoundException('Property not found in this organization');
    }

    if (roomId) {
      const room = await this.prisma.rooms.findFirst({
        where: { id: roomId, propertyId, deletedAt: null },
      });
      if (!room) {
        throw new NotFoundException('Room not found in this property');
      }
    }

    if (bedId) {
      const bed = await this.prisma.beds.findFirst({
        where: { id: bedId, roomId: roomId || undefined, deletedAt: null },
      });
      if (!bed) {
        throw new NotFoundException('Bed not found in this room/property');
      }
    }

    if (dto.assignedStaffId) {
      if (!rbac.permissions.includes('maintenance.assign')) {
        throw new ForbiddenException('Assigning maintenance requests requires maintenance.assign permission');
      }
      const staffUser = await this.prisma.organization_members.findFirst({
        where: { userId: dto.assignedStaffId, organizationId, status: 'ACTIVE' },
      });
      if (!staffUser) {
        throw new NotFoundException('Assigned staff user not found in this organization');
      }
    }

    if (dto.vendorName && !rbac.permissions.includes('maintenance.assign')) {
      throw new ForbiddenException('Assigning vendors requires maintenance.assign permission');
    }

    const ticketNumber =
      dto.ticketNumber ||
      `MNT-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;

    const status = (dto.assignedStaffId || dto.vendorName) ? MaintenanceStatus.ASSIGNED : (dto.status || MaintenanceStatus.CREATED);
    const category = dto.category || MaintenanceCategory.OTHER;
    const priority = dto.priority || MaintenancePriority.MEDIUM;
    const now = new Date();
    const requestId = randomUUID();

    const result = await this.prisma.$transaction(async (tx) => {
      const created = await tx.maintenance_requests.create({
        data: {
          id: requestId,
          organizationId,
          propertyId,
          roomId: roomId || null,
          bedId: bedId || null,
          residentId: residentId || null,
          ticketNumber,
          title: dto.title,
          description: dto.description,
          category,
          priority,
          status,
          assignedStaffId: dto.assignedStaffId || null,
          vendorName: dto.vendorName || null,
          estimatedCost: dto.estimatedCost ? new Prisma.Decimal(dto.estimatedCost) : new Prisma.Decimal(0),
          actualCost: new Prisma.Decimal(0),
          images: dto.images || null,
          slaDueAt: dto.slaDueAt ? new Date(dto.slaDueAt) : null,
          assignedAt: (dto.assignedStaffId || dto.vendorName) ? now : null,
          createdAt: now,
          updatedAt: now,
        },
        include: {
          properties: { select: { id: true, name: true } },
          rooms: { select: { id: true, roomNumber: true } },
          beds: { select: { id: true, bedNumber: true } },
          residents: { select: { id: true, fullName: true, phone: true } },
          users: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      });

      await tx.maintenance_history.create({
        data: {
          id: randomUUID(),
          maintenanceRequestId: requestId,
          actorUserId: rbac.userId,
          oldStatus: null,
          newStatus: status,
          notes: dto.notes || 'Maintenance request created',
          createdAt: now,
        },
      });

      const action = (dto.assignedStaffId || dto.vendorName) ? 'maintenance.assigned' : 'maintenance.created';
      await this.createAuditLogTx(tx, {
        organizationId,
        userId: rbac.userId,
        action,
        entityId: requestId,
        newValues: {
          ticketNumber,
          title: dto.title,
          category,
          priority,
          status,
          propertyId,
          roomId,
          bedId,
          residentId,
          assignedStaffId: dto.assignedStaffId,
          vendorName: dto.vendorName,
        },
        ipAddress: ip,
      });

      return created;
    });

    return result;
  }

  async findAll(query: MaintenanceQueryDto, rbac: RbacContext) {
    const organizationId = rbac.organizationId;
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.maintenance_requestsWhereInput = {
      organizationId,
    };

    if (rbac.role === 'RESIDENT') {
      const resident = await this.resolveResidentProfile(rbac);
      where.residentId = resident.id;
    } else if (query.residentId) {
      where.residentId = query.residentId;
    }

    if (query.status) where.status = query.status;
    if (query.category) where.category = query.category;
    if (query.priority) where.priority = query.priority;
    if (query.propertyId) where.propertyId = query.propertyId;
    if (query.roomId) where.roomId = query.roomId;
    if (query.bedId) where.bedId = query.bedId;
    if (query.assignedStaffId) where.assignedStaffId = query.assignedStaffId;

    if (query.search) {
      where.OR = [
        { ticketNumber: { contains: query.search, mode: 'insensitive' } },
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
        { vendorName: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const orderBy: Prisma.maintenance_requestsOrderByWithRelationInput = {};
    const sortField = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder || 'desc';
    orderBy[sortField] = sortOrder;

    const [items, total] = await Promise.all([
      this.prisma.maintenance_requests.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          properties: { select: { id: true, name: true } },
          rooms: { select: { id: true, roomNumber: true } },
          beds: { select: { id: true, bedNumber: true } },
          residents: { select: { id: true, fullName: true, phone: true } },
          users: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      }),
      this.prisma.maintenance_requests.count({ where }),
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
    const record = await this.prisma.maintenance_requests.findFirst({
      where: {
        id,
        organizationId: rbac.organizationId,
      },
      include: {
        properties: { select: { id: true, name: true, addressLine1: true } },
        rooms: { select: { id: true, roomNumber: true } },
        beds: { select: { id: true, bedNumber: true } },
        residents: { select: { id: true, fullName: true, phone: true, email: true } },
        users: { select: { id: true, firstName: true, lastName: true, email: true } },
        maintenance_history: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!record) {
      throw new NotFoundException('Maintenance request not found');
    }

    if (rbac.role === 'RESIDENT') {
      const resident = await this.resolveResidentProfile(rbac);
      if (record.residentId !== resident.id) {
        throw new NotFoundException('Maintenance request not found');
      }
    }

    return record;
  }

  async findHistory(id: string, rbac: RbacContext) {
    await this.findOne(id, rbac);

    return this.prisma.maintenance_history.findMany({
      where: { maintenanceRequestId: id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(id: string, dto: UpdateMaintenanceDto, rbac: RbacContext, ip?: string) {
    const existing = await this.findOne(id, rbac);

    const assignedStaffChanged = dto.assignedStaffId !== undefined && dto.assignedStaffId !== existing.assignedStaffId;
    const vendorChanged = dto.vendorName !== undefined && dto.vendorName !== existing.vendorName;

    if (assignedStaffChanged || vendorChanged) {
      if (!rbac.permissions.includes('maintenance.assign')) {
        throw new ForbiddenException('Assigning maintenance requests requires maintenance.assign permission');
      }
      if (dto.assignedStaffId) {
        const staffUser = await this.prisma.organization_members.findFirst({
          where: { userId: dto.assignedStaffId, organizationId: rbac.organizationId, status: 'ACTIVE' },
        });
        if (!staffUser) {
          throw new NotFoundException('Assigned staff user not found in this organization');
        }
      }
    }

    const now = new Date();
    const statusChanged = dto.status && dto.status !== existing.status;

    const dataToUpdate: Prisma.maintenance_requestsUpdateInput = {
      updatedAt: now,
    };

    if (dto.title) dataToUpdate.title = dto.title;
    if (dto.description) dataToUpdate.description = dto.description;
    if (dto.category) dataToUpdate.category = dto.category;
    if (dto.priority) dataToUpdate.priority = dto.priority;
    if (dto.status) dataToUpdate.status = dto.status;
    if (dto.assignedStaffId !== undefined) {
      dataToUpdate.users = dto.assignedStaffId ? { connect: { id: dto.assignedStaffId } } : { disconnect: true };
    }
    if (dto.vendorName !== undefined) dataToUpdate.vendorName = dto.vendorName;
    if (dto.estimatedCost !== undefined) dataToUpdate.estimatedCost = new Prisma.Decimal(dto.estimatedCost);
    if (dto.actualCost !== undefined) dataToUpdate.actualCost = new Prisma.Decimal(dto.actualCost);
    if (dto.images !== undefined) dataToUpdate.images = dto.images;
    if (dto.resolutionNotes !== undefined) dataToUpdate.resolutionNotes = dto.resolutionNotes;
    if (dto.slaDueAt !== undefined) dataToUpdate.slaDueAt = dto.slaDueAt ? new Date(dto.slaDueAt) : null;

    if (dto.assignedAt !== undefined) {
      dataToUpdate.assignedAt = dto.assignedAt ? new Date(dto.assignedAt) : null;
    } else if ((assignedStaffChanged || vendorChanged || dto.status === MaintenanceStatus.ASSIGNED) && !existing.assignedAt) {
      dataToUpdate.assignedAt = now;
    }

    if (dto.startedAt !== undefined) {
      dataToUpdate.startedAt = dto.startedAt ? new Date(dto.startedAt) : null;
    } else if (dto.status === MaintenanceStatus.IN_PROGRESS && !existing.startedAt) {
      dataToUpdate.startedAt = now;
    }

    if (dto.completedAt !== undefined) {
      dataToUpdate.completedAt = dto.completedAt ? new Date(dto.completedAt) : null;
    } else if (dto.status === MaintenanceStatus.COMPLETED && !existing.completedAt) {
      dataToUpdate.completedAt = now;
    }

    if (dto.verifiedAt !== undefined) {
      dataToUpdate.verifiedAt = dto.verifiedAt ? new Date(dto.verifiedAt) : null;
    } else if (dto.status === MaintenanceStatus.VERIFIED && !existing.verifiedAt) {
      dataToUpdate.verifiedAt = now;
    }

    if (dto.closedAt !== undefined) {
      dataToUpdate.closedAt = dto.closedAt ? new Date(dto.closedAt) : null;
    } else if (dto.status === MaintenanceStatus.CLOSED && !existing.closedAt) {
      dataToUpdate.closedAt = now;
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.maintenance_requests.update({
        where: { id },
        data: dataToUpdate,
        include: {
          properties: { select: { id: true, name: true } },
          rooms: { select: { id: true, roomNumber: true } },
          beds: { select: { id: true, bedNumber: true } },
          residents: { select: { id: true, fullName: true, phone: true } },
          users: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      });

      if (statusChanged || dto.notes) {
        await tx.maintenance_history.create({
          data: {
            id: randomUUID(),
            maintenanceRequestId: id,
            actorUserId: rbac.userId,
            oldStatus: existing.status,
            newStatus: dto.status || existing.status,
            notes: dto.notes || dto.resolutionNotes || `Status changed to ${dto.status || existing.status}`,
            createdAt: now,
          },
        });
      }

      if (dto.status === MaintenanceStatus.COMPLETED) {
        await this.createAuditLogTx(tx, {
          organizationId: rbac.organizationId,
          userId: rbac.userId,
          action: 'maintenance.completed',
          entityId: id,
          oldValues: { status: existing.status, actualCost: existing.actualCost },
          newValues: { status: updated.status, actualCost: updated.actualCost },
          ipAddress: ip,
        });
      } else if (statusChanged) {
        await this.createAuditLogTx(tx, {
          organizationId: rbac.organizationId,
          userId: rbac.userId,
          action: 'maintenance.status_changed',
          entityId: id,
          oldValues: { status: existing.status },
          newValues: { status: updated.status },
          ipAddress: ip,
        });
      }
      if (assignedStaffChanged || vendorChanged) {
        await this.createAuditLogTx(tx, {
          organizationId: rbac.organizationId,
          userId: rbac.userId,
          action: 'maintenance.assigned',
          entityId: id,
          oldValues: { assignedStaffId: existing.assignedStaffId, vendorName: existing.vendorName },
          newValues: { assignedStaffId: updated.assignedStaffId, vendorName: updated.vendorName },
          ipAddress: ip,
        });
      }
      if (!statusChanged && !assignedStaffChanged && !vendorChanged && dto.status !== MaintenanceStatus.COMPLETED) {
        await this.createAuditLogTx(tx, {
          organizationId: rbac.organizationId,
          userId: rbac.userId,
          action: 'maintenance.updated',
          entityId: id,
          oldValues: { priority: existing.priority },
          newValues: { priority: updated.priority, resolutionNotes: updated.resolutionNotes },
          ipAddress: ip,
        });
      }

      return updated;
    });

    return result;
  }
}
