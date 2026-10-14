import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { HousekeepingCategory, MaintenancePriority, Prisma, TaskStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RbacContext } from '../rbac/types/rbac.types';
import { CreateStaffTaskDto } from './dto/create-staff-task.dto';
import { StaffTaskQueryDto } from './dto/staff-task-query.dto';
import { UpdateStaffTaskDto } from './dto/update-staff-task.dto';

@Injectable()
export class StaffTasksService {
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
        entityType: 'staff_tasks',
        entityId: params.entityId,
        oldValues: params.oldValues ? JSON.stringify(params.oldValues) : null,
        newValues: params.newValues ? JSON.stringify(params.newValues) : null,
        ipAddress: params.ipAddress ?? null,
        createdAt: new Date(),
      },
    });
  }

  async create(dto: CreateStaffTaskDto, rbac: RbacContext, ip?: string) {
    if (rbac.role === 'RESIDENT') {
      throw new ForbiddenException('Residents cannot create staff tasks');
    }

    const organizationId = rbac.organizationId;

    const property = await this.prisma.properties.findFirst({
      where: { id: dto.propertyId, organizationId, deletedAt: null },
    });
    if (!property) {
      throw new NotFoundException('Property not found in this organization');
    }

    if (dto.floorId) {
      const floor = await this.prisma.floors.findFirst({
        where: { id: dto.floorId, propertyId: dto.propertyId, deletedAt: null },
      });
      if (!floor) {
        throw new NotFoundException('Floor not found in this property');
      }
    }

    if (dto.roomId) {
      const room = await this.prisma.rooms.findFirst({
        where: { id: dto.roomId, propertyId: dto.propertyId, deletedAt: null },
      });
      if (!room) {
        throw new NotFoundException('Room not found in this property');
      }
    }

    if (dto.assignedStaffId) {
      if (!rbac.permissions.includes('maintenance.assign')) {
        throw new ForbiddenException('Assigning staff tasks requires maintenance.assign permission');
      }
      const staffProfile = await this.prisma.staff_profiles.findFirst({
        where: { id: dto.assignedStaffId, organizationId },
      });
      if (!staffProfile) {
        throw new NotFoundException('Staff profile not found in this organization');
      }
    }

    const taskId = randomUUID();
    const status = dto.status || TaskStatus.PENDING;
    const category = dto.category || HousekeepingCategory.ROOM_CLEANING;
    const priority = dto.priority || MaintenancePriority.MEDIUM;
    const now = new Date();
    const dueDate = new Date(dto.dueDate);

    const result = await this.prisma.$transaction(async (tx) => {
      const created = await tx.staff_tasks.create({
        data: {
          id: taskId,
          organizationId,
          propertyId: dto.propertyId,
          floorId: dto.floorId || null,
          roomId: dto.roomId || null,
          location: dto.location,
          assignedStaffId: dto.assignedStaffId || null,
          title: dto.title,
          description: dto.description || null,
          category,
          priority,
          dueDate,
          dueTime: dto.dueTime || '12:00',
          status,
          completionTime: status === TaskStatus.COMPLETED ? now : null,
          notes: dto.notes || null,
          checklistItems: dto.checklistItems || null,
          createdAt: now,
          updatedAt: now,
        },
        include: {
          properties: { select: { id: true, name: true } },
          floors: { select: { id: true, floorNumber: true } },
          rooms: { select: { id: true, roomNumber: true } },
          staff_profiles: { select: { id: true, fullName: true, role: true, phone: true } },
        },
      });

      await tx.staff_task_history.create({
        data: {
          id: randomUUID(),
          staffTaskId: taskId,
          actorUserId: rbac.userId,
          oldStatus: null,
          newStatus: status,
          notes: dto.notes || 'Staff task created',
          createdAt: now,
        },
      });

      const action = dto.assignedStaffId ? 'staff_task.assigned' : 'staff_task.created';
      await this.createAuditLogTx(tx, {
        organizationId,
        userId: rbac.userId,
        action,
        entityId: taskId,
        newValues: {
          title: dto.title,
          location: dto.location,
          category,
          priority,
          dueDate: dto.dueDate,
          status,
          propertyId: dto.propertyId,
          assignedStaffId: dto.assignedStaffId,
        },
        ipAddress: ip,
      });

      return created;
    });

    return result;
  }

  async findAll(query: StaffTaskQueryDto, rbac: RbacContext) {
    if (rbac.role === 'RESIDENT') {
      throw new ForbiddenException('Residents cannot access staff tasks');
    }

    const organizationId = rbac.organizationId;
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.staff_tasksWhereInput = {
      organizationId,
    };

    if (query.status) where.status = query.status;
    if (query.category) where.category = query.category;
    if (query.priority) where.priority = query.priority;
    if (query.propertyId) where.propertyId = query.propertyId;
    if (query.floorId) where.floorId = query.floorId;
    if (query.roomId) where.roomId = query.roomId;
    if (query.assignedStaffId) where.assignedStaffId = query.assignedStaffId;
    if (query.dueDate) where.dueDate = new Date(query.dueDate);

    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
        { location: { contains: query.search, mode: 'insensitive' } },
        { notes: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const orderBy: Prisma.staff_tasksOrderByWithRelationInput = {};
    const sortField = query.sortBy || 'dueDate';
    const sortOrder = query.sortOrder || 'asc';
    orderBy[sortField] = sortOrder;

    const [items, total] = await Promise.all([
      this.prisma.staff_tasks.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          properties: { select: { id: true, name: true } },
          floors: { select: { id: true, floorNumber: true } },
          rooms: { select: { id: true, roomNumber: true } },
          staff_profiles: { select: { id: true, fullName: true, role: true, phone: true } },
        },
      }),
      this.prisma.staff_tasks.count({ where }),
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
    if (rbac.role === 'RESIDENT') {
      throw new ForbiddenException('Residents cannot access staff tasks');
    }

    const task = await this.prisma.staff_tasks.findFirst({
      where: {
        id,
        organizationId: rbac.organizationId,
      },
      include: {
        properties: { select: { id: true, name: true, addressLine1: true } },
        floors: { select: { id: true, floorNumber: true } },
        rooms: { select: { id: true, roomNumber: true } },
        staff_profiles: { select: { id: true, fullName: true, role: true, phone: true, email: true } },
        staff_task_history: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!task) {
      throw new NotFoundException('Staff task not found');
    }

    return task;
  }

  async findHistory(id: string, rbac: RbacContext) {
    await this.findOne(id, rbac);

    return this.prisma.staff_task_history.findMany({
      where: { staffTaskId: id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(id: string, dto: UpdateStaffTaskDto, rbac: RbacContext, ip?: string) {
    const existing = await this.findOne(id, rbac);

    const assignedStaffChanged = dto.assignedStaffId !== undefined && dto.assignedStaffId !== existing.assignedStaffId;

    if (assignedStaffChanged) {
      if (!rbac.permissions.includes('maintenance.assign')) {
        throw new ForbiddenException('Assigning staff tasks requires maintenance.assign permission');
      }
      if (dto.assignedStaffId) {
        const staffProfile = await this.prisma.staff_profiles.findFirst({
          where: { id: dto.assignedStaffId, organizationId: rbac.organizationId },
        });
        if (!staffProfile) {
          throw new NotFoundException('Staff profile not found in this organization');
        }
      }
    }

    const now = new Date();
    const statusChanged = dto.status && dto.status !== existing.status;

    const dataToUpdate: Prisma.staff_tasksUpdateInput = {
      updatedAt: now,
    };

    if (dto.title) dataToUpdate.title = dto.title;
    if (dto.description !== undefined) dataToUpdate.description = dto.description;
    if (dto.location) dataToUpdate.location = dto.location;
    if (dto.category) dataToUpdate.category = dto.category;
    if (dto.priority) dataToUpdate.priority = dto.priority;
    if (dto.status) dataToUpdate.status = dto.status;
    if (dto.assignedStaffId !== undefined) {
      dataToUpdate.staff_profiles = dto.assignedStaffId ? { connect: { id: dto.assignedStaffId } } : { disconnect: true };
    }
    if (dto.dueDate) dataToUpdate.dueDate = new Date(dto.dueDate);
    if (dto.dueTime) dataToUpdate.dueTime = dto.dueTime;
    if (dto.notes !== undefined) dataToUpdate.notes = dto.notes;
    if (dto.checklistItems !== undefined) dataToUpdate.checklistItems = dto.checklistItems;

    if (dto.completionTime !== undefined) {
      dataToUpdate.completionTime = dto.completionTime ? new Date(dto.completionTime) : null;
    } else if (dto.status === TaskStatus.COMPLETED && !existing.completionTime) {
      dataToUpdate.completionTime = now;
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.staff_tasks.update({
        where: { id },
        data: dataToUpdate,
        include: {
          properties: { select: { id: true, name: true } },
          floors: { select: { id: true, floorNumber: true } },
          rooms: { select: { id: true, roomNumber: true } },
          staff_profiles: { select: { id: true, fullName: true, role: true, phone: true } },
        },
      });

      if (statusChanged || dto.notes) {
        await tx.staff_task_history.create({
          data: {
            id: randomUUID(),
            staffTaskId: id,
            actorUserId: rbac.userId,
            oldStatus: existing.status,
            newStatus: dto.status || existing.status,
            notes: dto.notes || `Status changed to ${dto.status || existing.status}`,
            createdAt: now,
          },
        });
      }

      if (dto.status === TaskStatus.COMPLETED) {
        await this.createAuditLogTx(tx, {
          organizationId: rbac.organizationId,
          userId: rbac.userId,
          action: 'staff_task.completed',
          entityId: id,
          oldValues: { status: existing.status },
          newValues: { status: updated.status, completionTime: updated.completionTime },
          ipAddress: ip,
        });
      } else if (statusChanged) {
        await this.createAuditLogTx(tx, {
          organizationId: rbac.organizationId,
          userId: rbac.userId,
          action: 'staff_task.status_changed',
          entityId: id,
          oldValues: { status: existing.status },
          newValues: { status: updated.status },
          ipAddress: ip,
        });
      }
      if (assignedStaffChanged) {
        await this.createAuditLogTx(tx, {
          organizationId: rbac.organizationId,
          userId: rbac.userId,
          action: 'staff_task.assigned',
          entityId: id,
          oldValues: { assignedStaffId: existing.assignedStaffId },
          newValues: { assignedStaffId: updated.assignedStaffId },
          ipAddress: ip,
        });
      }
      if (!statusChanged && !assignedStaffChanged && dto.status !== TaskStatus.COMPLETED) {
        await this.createAuditLogTx(tx, {
          organizationId: rbac.organizationId,
          userId: rbac.userId,
          action: 'staff_task.updated',
          entityId: id,
          oldValues: { dueDate: existing.dueDate },
          newValues: { dueDate: updated.dueDate },
          ipAddress: ip,
        });
      }

      return updated;
    });

    return result;
  }
}
