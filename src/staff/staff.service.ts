import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StaffShift, StaffStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RbacContext } from '../rbac/types/rbac.types';
import { CreateStaffDto } from './dto/create-staff.dto';
import { StaffQueryDto } from './dto/staff-query.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { AttendanceQueryDto } from '../staff-attendance/dto/attendance-query.dto';

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateStaffDto, rbac: RbacContext, ipAddress?: string) {
    if (rbac.role !== 'OWNER' && rbac.role !== 'MANAGER') {
      throw new ForbiddenException('Only owners and managers can create staff profiles');
    }

    if (dto.propertyId) {
      const property = await this.prisma.properties.findFirst({
        where: {
          id: dto.propertyId,
          organizationId: rbac.organizationId,
          deletedAt: null,
        },
      });
      if (!property) {
        throw new NotFoundException('Property not found in organization');
      }
    }

    if (dto.userId) {
      const member = await this.prisma.organization_members.findFirst({
        where: {
          userId: dto.userId,
          organizationId: rbac.organizationId,
          status: 'ACTIVE',
        },
      });
      if (!member) {
        throw new NotFoundException('User is not an active member of this organization');
      }

      const existingUserStaff = await this.prisma.staff_profiles.findFirst({
        where: { userId: dto.userId },
      });
      if (existingUserStaff) {
        throw new ConflictException('A staff profile is already linked to this user');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const staffId = randomUUID();
      const joiningDate = dto.joiningDate ? new Date(dto.joiningDate) : new Date();
      const salary = dto.salary !== undefined ? dto.salary : 15000.0;
      const now = new Date();

      const created = await tx.staff_profiles.create({
        data: {
          id: staffId,
          organizationId: rbac.organizationId,
          userId: dto.userId ?? null,
          propertyId: dto.propertyId ?? null,
          fullName: dto.fullName,
          role: dto.role,
          phone: dto.phone,
          email: dto.email ?? null,
          joiningDate,
          salary,
          shift: dto.shift ?? StaffShift.MORNING,
          status: dto.status ?? StaffStatus.ACTIVE,
          emergencyContactName: dto.emergencyContactName ?? null,
          emergencyContactPhone: dto.emergencyContactPhone ?? null,
          idProofNumber: dto.idProofNumber ?? null,
          createdAt: now,
          updatedAt: now,
        },
        include: {
          properties: { select: { id: true, name: true, code: true } },
          users: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              phone: true,
              avatarUrl: true,
              isActive: true,
            },
          },
        },
      });

      await tx.audit_logs.create({
        data: {
          id: randomUUID(),
          organizationId: rbac.organizationId,
          userId: rbac.userId,
          action: 'staff.created',
          entityType: 'staff_profiles',
          entityId: staffId,
          newValues: JSON.stringify({
            fullName: created.fullName,
            role: created.role,
            phone: created.phone,
            email: created.email,
            propertyId: created.propertyId,
            userId: created.userId,
            shift: created.shift,
            status: created.status,
          }),
          ipAddress: ipAddress ?? null,
        },
      });

      return created;
    });
  }

  async findAll(query: StaffQueryDto, rbac: RbacContext) {
    if (rbac.role === 'RESIDENT') {
      throw new ForbiddenException('Residents cannot access staff records');
    }

    const where: any = { organizationId: rbac.organizationId };

    if (query.propertyId) {
      where.propertyId = query.propertyId;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.shift) {
      where.shift = query.shift;
    }
    if (query.role) {
      where.role = { contains: query.role, mode: 'insensitive' };
    }
    if (query.search) {
      where.OR = [
        { fullName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
        { role: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? Math.min(query.limit, 100) : 20;
    const skip = (page - 1) * limit;

    const [total, items] = await Promise.all([
      this.prisma.staff_profiles.count({ where }),
      this.prisma.staff_profiles.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          properties: { select: { id: true, name: true, code: true } },
          users: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              phone: true,
              avatarUrl: true,
              isActive: true,
            },
          },
          _count: {
            select: {
              staff_attendances: true,
              staff_tasks: true,
            },
          },
        },
      }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findOne(id: string, rbac: RbacContext) {
    if (rbac.role === 'RESIDENT') {
      throw new ForbiddenException('Residents cannot access staff records');
    }

    const staff = await this.prisma.staff_profiles.findFirst({
      where: { id, organizationId: rbac.organizationId },
      include: {
        properties: { select: { id: true, name: true, code: true } },
        users: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
            avatarUrl: true,
            isActive: true,
          },
        },
        _count: {
          select: {
            staff_attendances: true,
            staff_tasks: true,
          },
        },
        staff_attendances: {
          take: 5,
          orderBy: { date: 'desc' },
        },
        staff_tasks: {
          take: 5,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            category: true,
            dueDate: true,
          },
        },
      },
    });

    if (!staff) {
      throw new NotFoundException('Staff profile not found');
    }

    return staff;
  }

  async update(id: string, dto: UpdateStaffDto, rbac: RbacContext, ipAddress?: string) {
    if (rbac.role !== 'OWNER' && rbac.role !== 'MANAGER') {
      throw new ForbiddenException('Only owners and managers can update staff profiles');
    }

    const existing = await this.prisma.staff_profiles.findFirst({
      where: { id, organizationId: rbac.organizationId },
    });
    if (!existing) {
      throw new NotFoundException('Staff profile not found');
    }

    if (dto.propertyId !== undefined && dto.propertyId !== null) {
      const property = await this.prisma.properties.findFirst({
        where: {
          id: dto.propertyId,
          organizationId: rbac.organizationId,
          deletedAt: null,
        },
      });
      if (!property) {
        throw new NotFoundException('Property not found in organization');
      }
    }

    if (dto.userId !== undefined && dto.userId !== null && dto.userId !== existing.userId) {
      const member = await this.prisma.organization_members.findFirst({
        where: {
          userId: dto.userId,
          organizationId: rbac.organizationId,
          status: 'ACTIVE',
        },
      });
      if (!member) {
        throw new NotFoundException('User is not an active member of this organization');
      }

      const duplicate = await this.prisma.staff_profiles.findFirst({
        where: { userId: dto.userId, id: { not: id } },
      });
      if (duplicate) {
        throw new ConflictException('A staff profile is already linked to this user');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'staff_update_' + id}))`;

      const dataToUpdate: any = {
        updatedAt: new Date(),
      };
      if (dto.fullName !== undefined) dataToUpdate.fullName = dto.fullName;
      if (dto.role !== undefined) dataToUpdate.role = dto.role;
      if (dto.phone !== undefined) dataToUpdate.phone = dto.phone;
      if (dto.email !== undefined) dataToUpdate.email = dto.email;
      if (dto.propertyId !== undefined) dataToUpdate.propertyId = dto.propertyId;
      if (dto.userId !== undefined) dataToUpdate.userId = dto.userId;
      if (dto.joiningDate !== undefined) dataToUpdate.joiningDate = new Date(dto.joiningDate);
      if (dto.salary !== undefined) dataToUpdate.salary = dto.salary;
      if (dto.shift !== undefined) dataToUpdate.shift = dto.shift;
      if (dto.status !== undefined) dataToUpdate.status = dto.status;
      if (dto.emergencyContactName !== undefined) dataToUpdate.emergencyContactName = dto.emergencyContactName;
      if (dto.emergencyContactPhone !== undefined) dataToUpdate.emergencyContactPhone = dto.emergencyContactPhone;
      if (dto.idProofNumber !== undefined) dataToUpdate.idProofNumber = dto.idProofNumber;

      const updated = await tx.staff_profiles.update({
        where: { id },
        data: dataToUpdate,
        include: {
          properties: { select: { id: true, name: true, code: true } },
          users: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              phone: true,
              avatarUrl: true,
              isActive: true,
            },
          },
        },
      });

      let action = 'staff.updated';
      if (dto.status && dto.status !== existing.status) {
        action = (dto.status === StaffStatus.INACTIVE || dto.status === StaffStatus.TERMINATED)
          ? 'staff.deactivated'
          : 'staff.activated';
      }

      await tx.audit_logs.create({
        data: {
          id: randomUUID(),
          organizationId: rbac.organizationId,
          userId: rbac.userId,
          action,
          entityType: 'staff_profiles',
          entityId: id,
          oldValues: JSON.stringify({
            fullName: existing.fullName,
            role: existing.role,
            phone: existing.phone,
            email: existing.email,
            status: existing.status,
            shift: existing.shift,
            salary: existing.salary ? Number(existing.salary) : null,
            propertyId: existing.propertyId,
          }),
          newValues: JSON.stringify({
            fullName: updated.fullName,
            role: updated.role,
            phone: updated.phone,
            email: updated.email,
            status: updated.status,
            shift: updated.shift,
            salary: updated.salary ? Number(updated.salary) : null,
            propertyId: updated.propertyId,
          }),
          ipAddress: ipAddress ?? null,
        },
      });

      return updated;
    });
  }

  async remove(id: string, rbac: RbacContext, ipAddress?: string) {
    if (rbac.role !== 'OWNER' && rbac.role !== 'MANAGER') {
      throw new ForbiddenException('Only owners and managers can deactivate or remove staff');
    }

    const existing = await this.prisma.staff_profiles.findFirst({
      where: { id, organizationId: rbac.organizationId },
    });
    if (!existing) {
      throw new NotFoundException('Staff profile not found');
    }

    return this.prisma.$transaction(async (tx) => {
      const [attendanceCount, taskCount] = await Promise.all([
        tx.staff_attendances.count({ where: { staffId: id } }),
        tx.staff_tasks.count({ where: { assignedStaffId: id } }),
      ]);

      if (attendanceCount > 0 || taskCount > 0) {
        const updated = await tx.staff_profiles.update({
          where: { id },
          data: { status: StaffStatus.INACTIVE, updatedAt: new Date() },
        });

        await tx.audit_logs.create({
          data: {
            id: randomUUID(),
            organizationId: rbac.organizationId,
            userId: rbac.userId,
            action: 'staff.deactivated',
            entityType: 'staff_profiles',
            entityId: id,
            oldValues: JSON.stringify({ status: existing.status }),
            newValues: JSON.stringify({ status: StaffStatus.INACTIVE }),
            ipAddress: ipAddress ?? null,
          },
        });

        return {
          message: 'Staff profile deactivated successfully to preserve historical records',
          deactivated: true,
          status: StaffStatus.INACTIVE,
          staffId: id,
        };
      } else {
        await tx.staff_profiles.delete({ where: { id } });

        await tx.audit_logs.create({
          data: {
            id: randomUUID(),
            organizationId: rbac.organizationId,
            userId: rbac.userId,
            action: 'staff.deleted',
            entityType: 'staff_profiles',
            entityId: id,
            oldValues: JSON.stringify({
              fullName: existing.fullName,
              role: existing.role,
            }),
            ipAddress: ipAddress ?? null,
          },
        });

        return {
          message: 'Staff profile deleted successfully',
          deleted: true,
          staffId: id,
        };
      }
    });
  }

  async getStaffAttendanceHistory(id: string, query: AttendanceQueryDto, rbac: RbacContext) {
    if (rbac.role === 'RESIDENT') {
      throw new ForbiddenException('Residents cannot view staff attendance history');
    }

    const staff = await this.prisma.staff_profiles.findFirst({
      where: { id, organizationId: rbac.organizationId },
    });
    if (!staff) {
      throw new NotFoundException('Staff profile not found');
    }

    if (rbac.role === 'STAFF') {
      if (staff.userId !== rbac.userId) {
        throw new ForbiddenException('Staff members can only view their own attendance history');
      }
    }

    const where: any = { staffId: id };

    if (query.date) {
      const dStr = query.date.split('T')[0];
      where.date = new Date(dStr + 'T00:00:00.000Z');
    }
    if (query.startDate || query.endDate) {
      where.date = {};
      if (query.startDate) {
        where.date.gte = new Date(query.startDate.split('T')[0] + 'T00:00:00.000Z');
      }
      if (query.endDate) {
        where.date.lte = new Date(query.endDate.split('T')[0] + 'T00:00:00.000Z');
      }
    }
    if (query.status) {
      where.status = query.status;
    }

    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? Math.min(query.limit, 100) : 20;
    const skip = (page - 1) * limit;

    const [total, items] = await Promise.all([
      this.prisma.staff_attendances.count({ where }),
      this.prisma.staff_attendances.findMany({
        where,
        skip,
        take: limit,
        orderBy: { date: 'desc' },
      }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }
}
