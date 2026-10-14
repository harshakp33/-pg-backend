import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StaffAttendanceStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RbacContext } from '../rbac/types/rbac.types';
import { AttendanceQueryDto } from './dto/attendance-query.dto';
import { StaffCheckInDto } from './dto/check-in.dto';
import { StaffCheckOutDto } from './dto/check-out.dto';
import { RecordAttendanceDto } from './dto/record-attendance.dto';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';

@Injectable()
export class StaffAttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveStaffForCheckInOut(
    staffIdFromDto: string | undefined,
    rbac: RbacContext,
  ) {
    if (rbac.role === 'RESIDENT') {
      throw new ForbiddenException('Residents do not have access to staff attendance');
    }
    if (rbac.role === 'ACCOUNTANT') {
      throw new ForbiddenException('Accountants do not have permission to record staff attendance');
    }

    if (rbac.role === 'STAFF') {
      const ownProfile = await this.prisma.staff_profiles.findFirst({
        where: {
          userId: rbac.userId,
          organizationId: rbac.organizationId,
        },
      });
      if (!ownProfile) {
        throw new NotFoundException('No staff profile associated with current authenticated user account');
      }

      if (staffIdFromDto && staffIdFromDto !== ownProfile.id) {
        throw new ForbiddenException('Staff members cannot record attendance for other staff members');
      }

      return ownProfile;
    } else {
      // OWNER or MANAGER
      if (!staffIdFromDto) {
        throw new BadRequestException('staffId is required for administrative check-in/out');
      }
      const staff = await this.prisma.staff_profiles.findFirst({
        where: {
          id: staffIdFromDto,
          organizationId: rbac.organizationId,
        },
      });
      if (!staff) {
        throw new NotFoundException('Staff profile not found in organization');
      }
      return staff;
    }
  }

  async checkIn(dto: StaffCheckInDto, rbac: RbacContext, ipAddress?: string) {
    const staff = await this.resolveStaffForCheckInOut(dto.staffId, rbac);

    if (staff.status !== 'ACTIVE') {
      throw new BadRequestException(`Cannot check in staff member with status ${staff.status}`);
    }

    const dateStr = dto.date ? dto.date.split('T')[0] : new Date().toISOString().split('T')[0];
    const date = new Date(dateStr + 'T00:00:00.000Z');
    const checkInTime = dto.checkInTime || new Date().toTimeString().slice(0, 5);
    const now = new Date();

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Advisory row lock per staff and date to serialize concurrent check-ins
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'staff_att_checkin_' + staff.id + '_' + dateStr}))`;

        const existing = await tx.staff_attendances.findUnique({
          where: {
            staffId_date: {
              staffId: staff.id,
              date,
            },
          },
        });

        if (existing) {
          if (existing.checkInTime) {
            throw new ConflictException('Staff member has already checked in for this date');
          }

          const updated = await tx.staff_attendances.update({
            where: { id: existing.id },
            data: {
              checkInTime,
              status: StaffAttendanceStatus.PRESENT,
              updatedAt: now,
              notes: dto.notes
                ? existing.notes
                  ? existing.notes + '; ' + dto.notes
                  : dto.notes
                : existing.notes,
            },
            include: {
              staff_profiles: {
                select: {
                  id: true,
                  fullName: true,
                  role: true,
                  phone: true,
                  shift: true,
                  propertyId: true,
                },
              },
            },
          });

          await tx.audit_logs.create({
            data: {
              id: randomUUID(),
              organizationId: rbac.organizationId,
              userId: rbac.userId,
              action: 'staff_attendance.checked_in',
              entityType: 'staff_attendances',
              entityId: existing.id,
              newValues: JSON.stringify({
                staffId: staff.id,
                date: dateStr,
                checkInTime,
              }),
              ipAddress: ipAddress ?? null,
            },
          });

          return updated;
        }

        const id = randomUUID();
        const created = await tx.staff_attendances.create({
          data: {
            id,
            staffId: staff.id,
            date,
            status: StaffAttendanceStatus.PRESENT,
            checkInTime,
            notes: dto.notes ?? null,
            createdAt: now,
            updatedAt: now,
          },
          include: {
            staff_profiles: {
              select: {
                id: true,
                fullName: true,
                role: true,
                phone: true,
                shift: true,
                propertyId: true,
              },
            },
          },
        });

        await tx.audit_logs.create({
          data: {
            id: randomUUID(),
            organizationId: rbac.organizationId,
            userId: rbac.userId,
            action: 'staff_attendance.checked_in',
            entityType: 'staff_attendances',
            entityId: id,
            newValues: JSON.stringify({
              staffId: staff.id,
              date: dateStr,
              checkInTime,
            }),
            ipAddress: ipAddress ?? null,
          },
        });

        return created;
      });
    } catch (err: any) {
      if (err.code === 'P2002') {
        throw new ConflictException('Staff member has already checked in for this date');
      }
      throw err;
    }
  }

  async checkOut(dto: StaffCheckOutDto, rbac: RbacContext, ipAddress?: string) {
    const staff = await this.resolveStaffForCheckInOut(dto.staffId, rbac);

    const dateStr = dto.date ? dto.date.split('T')[0] : new Date().toISOString().split('T')[0];
    const date = new Date(dateStr + 'T00:00:00.000Z');
    const checkOutTime = dto.checkOutTime || new Date().toTimeString().slice(0, 5);
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      // Advisory row lock per staff and date to serialize concurrent check-outs
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'staff_att_checkout_' + staff.id + '_' + dateStr}))`;

      const existing = await tx.staff_attendances.findUnique({
        where: {
          staffId_date: {
            staffId: staff.id,
            date,
          },
        },
      });

      if (!existing || !existing.checkInTime) {
        throw new BadRequestException('Cannot check out without prior check-in for this date');
      }

      if (existing.checkOutTime) {
        throw new BadRequestException('Staff member has already checked out for this date');
      }

      const updated = await tx.staff_attendances.update({
        where: { id: existing.id },
        data: {
          checkOutTime,
          updatedAt: now,
          notes: dto.notes
            ? existing.notes
              ? existing.notes + '; ' + dto.notes
              : dto.notes
            : existing.notes,
        },
        include: {
          staff_profiles: {
            select: {
              id: true,
              fullName: true,
              role: true,
              phone: true,
              shift: true,
              propertyId: true,
            },
          },
        },
      });

      await tx.audit_logs.create({
        data: {
          id: randomUUID(),
          organizationId: rbac.organizationId,
          userId: rbac.userId,
          action: 'staff_attendance.checked_out',
          entityType: 'staff_attendances',
          entityId: existing.id,
          oldValues: JSON.stringify({ checkInTime: existing.checkInTime }),
          newValues: JSON.stringify({
            staffId: staff.id,
            date: dateStr,
            checkInTime: existing.checkInTime,
            checkOutTime,
          }),
          ipAddress: ipAddress ?? null,
        },
      });

      return updated;
    });
  }

  async recordAttendance(dto: RecordAttendanceDto, rbac: RbacContext, ipAddress?: string) {
    if (rbac.role !== 'OWNER' && rbac.role !== 'MANAGER') {
      throw new ForbiddenException('Only owners and managers can record manual attendance');
    }

    const staff = await this.prisma.staff_profiles.findFirst({
      where: {
        id: dto.staffId,
        organizationId: rbac.organizationId,
      },
    });
    if (!staff) {
      throw new NotFoundException('Staff profile not found in organization');
    }

    const dateStr = dto.date.split('T')[0];
    const date = new Date(dateStr + 'T00:00:00.000Z');
    const now = new Date();

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'staff_att_record_' + staff.id + '_' + dateStr}))`;

        const existing = await tx.staff_attendances.findUnique({
          where: {
            staffId_date: {
              staffId: staff.id,
              date,
            },
          },
        });

        if (existing) {
          throw new ConflictException('Attendance record already exists for this staff member on this date');
        }

        const id = randomUUID();
        const created = await tx.staff_attendances.create({
          data: {
            id,
            staffId: staff.id,
            date,
            status: dto.status ?? StaffAttendanceStatus.PRESENT,
            checkInTime: dto.checkInTime ?? null,
            checkOutTime: dto.checkOutTime ?? null,
            notes: dto.notes ?? null,
            createdAt: now,
            updatedAt: now,
          },
          include: {
            staff_profiles: {
              select: {
                id: true,
                fullName: true,
                role: true,
                phone: true,
                shift: true,
                propertyId: true,
              },
            },
          },
        });

        await tx.audit_logs.create({
          data: {
            id: randomUUID(),
            organizationId: rbac.organizationId,
            userId: rbac.userId,
            action: 'staff_attendance.created',
            entityType: 'staff_attendances',
            entityId: id,
            newValues: JSON.stringify({
              staffId: staff.id,
              date: dateStr,
              status: created.status,
              checkInTime: created.checkInTime,
              checkOutTime: created.checkOutTime,
            }),
            ipAddress: ipAddress ?? null,
          },
        });

        return created;
      });
    } catch (err: any) {
      if (err.code === 'P2002') {
        throw new ConflictException('Attendance record already exists for this staff member on this date');
      }
      throw err;
    }
  }

  async findAll(query: AttendanceQueryDto, rbac: RbacContext) {
    if (rbac.role === 'RESIDENT') {
      throw new ForbiddenException('Residents cannot access staff attendance records');
    }

    const where: any = {};

    if (rbac.role === 'STAFF') {
      const ownProfile = await this.prisma.staff_profiles.findFirst({
        where: {
          userId: rbac.userId,
          organizationId: rbac.organizationId,
        },
      });
      if (!ownProfile) {
        return {
          items: [],
          meta: { total: 0, page: 1, limit: query.limit || 20, totalPages: 0 },
        };
      }
      where.staffId = ownProfile.id;
    } else {
      if (query.staffId) {
        where.staffId = query.staffId;
      }
      if (query.propertyId) {
        where.staff_profiles = {
          propertyId: query.propertyId,
          organizationId: rbac.organizationId,
        };
      } else {
        where.staff_profiles = {
          organizationId: rbac.organizationId,
        };
      }
    }

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
        include: {
          staff_profiles: {
            select: {
              id: true,
              fullName: true,
              role: true,
              phone: true,
              shift: true,
              propertyId: true,
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
      throw new ForbiddenException('Residents cannot access staff attendance records');
    }

    const attendance = await this.prisma.staff_attendances.findUnique({
      where: { id },
      include: {
        staff_profiles: {
          select: {
            id: true,
            organizationId: true,
            userId: true,
            fullName: true,
            role: true,
            phone: true,
            shift: true,
            propertyId: true,
          },
        },
      },
    });

    if (!attendance || attendance.staff_profiles.organizationId !== rbac.organizationId) {
      throw new NotFoundException('Staff attendance record not found');
    }

    if (rbac.role === 'STAFF') {
      if (attendance.staff_profiles.userId !== rbac.userId) {
        throw new ForbiddenException('Staff members can only view their own attendance records');
      }
    }

    return attendance;
  }

  async update(id: string, dto: UpdateAttendanceDto, rbac: RbacContext, ipAddress?: string) {
    if (rbac.role !== 'OWNER' && rbac.role !== 'MANAGER') {
      throw new ForbiddenException('Only owners and managers can update staff attendance records');
    }

    const existing = await this.prisma.staff_attendances.findUnique({
      where: { id },
      include: {
        staff_profiles: true,
      },
    });

    if (!existing || existing.staff_profiles.organizationId !== rbac.organizationId) {
      throw new NotFoundException('Staff attendance record not found');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'staff_att_update_' + id}))`;

      const dataToUpdate: any = {
        updatedAt: new Date(),
      };
      if (dto.status !== undefined) dataToUpdate.status = dto.status;
      if (dto.checkInTime !== undefined) dataToUpdate.checkInTime = dto.checkInTime;
      if (dto.checkOutTime !== undefined) dataToUpdate.checkOutTime = dto.checkOutTime;
      if (dto.notes !== undefined) dataToUpdate.notes = dto.notes;

      const updated = await tx.staff_attendances.update({
        where: { id },
        data: dataToUpdate,
        include: {
          staff_profiles: {
            select: {
              id: true,
              fullName: true,
              role: true,
              phone: true,
              shift: true,
              propertyId: true,
            },
          },
        },
      });

      await tx.audit_logs.create({
        data: {
          id: randomUUID(),
          organizationId: rbac.organizationId,
          userId: rbac.userId,
          action: 'staff_attendance.updated',
          entityType: 'staff_attendances',
          entityId: id,
          oldValues: JSON.stringify({
            status: existing.status,
            checkInTime: existing.checkInTime,
            checkOutTime: existing.checkOutTime,
            notes: existing.notes,
          }),
          newValues: JSON.stringify({
            status: updated.status,
            checkInTime: updated.checkInTime,
            checkOutTime: updated.checkOutTime,
            notes: updated.notes,
          }),
          ipAddress: ipAddress ?? null,
        },
      });

      return updated;
    });
  }
}
