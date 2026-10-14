import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RbacContext } from '../rbac/types/rbac.types';
import { CreateResidentDto } from './dto/create-resident.dto';
import { ResidentQueryDto } from './dto/resident-query.dto';
import { UpdateResidentDto } from './dto/update-resident.dto';

@Injectable()
export class ResidentsService {
  private readonly logger = new Logger(ResidentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper to write structured audit logs atomically
   */
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
        entityType: 'residents',
        entityId: params.entityId,
        oldValues: params.oldValues ? JSON.stringify(params.oldValues) : null,
        newValues: params.newValues ? JSON.stringify(params.newValues) : null,
        ipAddress: params.ipAddress ?? null,
      },
    });
  }

  /**
   * Create a new resident scoped to the verified organization
   */
  async create(dto: CreateResidentDto, rbac: RbacContext, ipAddress?: string) {
    const organizationId = rbac.organizationId;

    // Optional validation of property assignment if provided
    if (dto.propertyId) {
      const prop = await this.prisma.properties.findFirst({
        where: { id: dto.propertyId, organizationId, deletedAt: null },
      });
      if (!prop) {
        throw new NotFoundException('Assigned property not found in this organization');
      }
    }

    const residentId = randomUUID();
    const now = new Date();

    const resident = await this.prisma.$transaction(async (tx) => {
      const created = await tx.residents.create({
        data: {
          id: residentId,
          organizationId,
          propertyId: dto.propertyId ?? null,
          floorId: dto.floorId ?? null,
          roomId: dto.roomId ?? null,
          bedId: dto.bedId ?? null,
          fullName: dto.fullName.trim(),
          email: dto.email.trim().toLowerCase(),
          phone: dto.phone.trim(),
          alternatePhone: dto.alternatePhone?.trim() ?? null,
          gender: dto.gender,
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
          bloodGroup: dto.bloodGroup?.trim() ?? null,
          avatarUrl: dto.avatarUrl?.trim() ?? null,
          permanentAddress: dto.permanentAddress?.trim() ?? null,
          currentAddress: dto.currentAddress?.trim() ?? null,
          city: dto.city?.trim() ?? null,
          state: dto.state?.trim() ?? null,
          pincode: dto.pincode?.trim() ?? null,
          emergencyContactName: dto.emergencyContactName?.trim() ?? null,
          emergencyContactRelation: dto.emergencyContactRelation?.trim() ?? null,
          emergencyContactPhone: dto.emergencyContactPhone?.trim() ?? null,
          occupationType: dto.occupationType,
          employerOrCollegeName: dto.employerOrCollegeName?.trim() ?? null,
          designation: dto.designation?.trim() ?? null,
          workAddress: dto.workAddress?.trim() ?? null,
          idNumber: dto.idNumber?.trim() ?? null,
          status: dto.status,
          joiningDate: dto.joiningDate ? new Date(dto.joiningDate) : now,
          expectedMoveOutDate: dto.expectedMoveOutDate ? new Date(dto.expectedMoveOutDate) : null,
          monthlyRent: new Prisma.Decimal(dto.monthlyRent ?? 0.0),
          securityDeposit: new Prisma.Decimal(dto.securityDeposit ?? 0.0),
          depositPaid: new Prisma.Decimal(dto.depositPaid ?? 0.0),
          depositStatus: dto.depositStatus,
          foodIncluded: dto.foodIncluded ?? true,
          notes: dto.notes?.trim() ?? null,
          createdAt: now,
          updatedAt: now,
        },
      });

      await this.createAuditLogTx(tx, {
        organizationId,
        userId: rbac.userId,
        action: 'resident.created',
        entityId: residentId,
        newValues: {
          fullName: created.fullName,
          email: created.email,
          phone: created.phone,
          status: created.status,
        },
        ipAddress,
      });

      return created;
    });

    this.logger.log(`Resident created: ${resident.id} by user ${rbac.userId}`);
    return resident;
  }

  /**
   * List residents with pagination, filters, and safe search
   */
  async findAll(query: ResidentQueryDto, rbac: RbacContext) {
    const {
      page = 1,
      limit = 20,
      search,
      status,
      propertyId,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const skip = (page - 1) * limit;

    const where: Prisma.residentsWhereInput = {
      organizationId: rbac.organizationId,
      deletedAt: null,
    };

    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { fullName: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (status) {
      where.status = status;
    }

    if (propertyId) {
      where.propertyId = propertyId;
    }

    const orderBy: Prisma.residentsOrderByWithRelationInput = {
      [sortBy]: sortOrder,
    };

    const [items, total] = await Promise.all([
      this.prisma.residents.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          properties: {
            select: { id: true, name: true, code: true },
          },
          beds: {
            select: { id: true, bedNumber: true },
          },
          _count: {
            select: {
              resident_stays: true,
              resident_documents: true,
            },
          },
        },
      }),
      this.prisma.residents.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  /**
   * Get single resident scoped to organization
   */
  async findOne(id: string, rbac: RbacContext) {
    const resident = await this.prisma.residents.findFirst({
      where: {
        id,
        organizationId: rbac.organizationId,
        deletedAt: null,
      },
      include: {
        properties: {
          select: { id: true, name: true, code: true },
        },
        floors: {
          select: { id: true, floorNumber: true, name: true },
        },
        rooms: {
          select: { id: true, roomNumber: true, roomType: true },
        },
        beds: {
          select: { id: true, bedNumber: true, status: true },
        },
        resident_stays: {
          orderBy: { checkInDate: 'desc' },
          take: 5,
        },
        resident_documents: {
          select: {
            id: true,
            documentType: true,
            documentNumber: true,
            fileName: true,
            fileUrl: true,
            verificationStatus: true,
            remarks: true,
            createdAt: true,
          },
        },
      },
    });

    if (!resident) {
      throw new NotFoundException('Resident not found');
    }

    return resident;
  }

  /**
   * Update resident details scoped to organization
   */
  async update(
    id: string,
    dto: UpdateResidentDto,
    rbac: RbacContext,
    ipAddress?: string,
  ) {
    const existing = await this.prisma.residents.findFirst({
      where: {
        id,
        organizationId: rbac.organizationId,
        deletedAt: null,
      },
    });

    if (!existing) {
      throw new NotFoundException('Resident not found');
    }

    const now = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.residents.update({
        where: { id },
        data: {
          fullName: dto.fullName !== undefined ? dto.fullName.trim() : existing.fullName,
          email: dto.email !== undefined ? dto.email.trim().toLowerCase() : existing.email,
          phone: dto.phone !== undefined ? dto.phone.trim() : existing.phone,
          alternatePhone: dto.alternatePhone !== undefined ? dto.alternatePhone?.trim() : existing.alternatePhone,
          gender: dto.gender ?? existing.gender,
          dateOfBirth: dto.dateOfBirth !== undefined ? (dto.dateOfBirth ? new Date(dto.dateOfBirth) : null) : existing.dateOfBirth,
          bloodGroup: dto.bloodGroup !== undefined ? dto.bloodGroup?.trim() : existing.bloodGroup,
          avatarUrl: dto.avatarUrl !== undefined ? dto.avatarUrl?.trim() : existing.avatarUrl,
          permanentAddress: dto.permanentAddress !== undefined ? dto.permanentAddress?.trim() : existing.permanentAddress,
          currentAddress: dto.currentAddress !== undefined ? dto.currentAddress?.trim() : existing.currentAddress,
          city: dto.city !== undefined ? dto.city?.trim() : existing.city,
          state: dto.state !== undefined ? dto.state?.trim() : existing.state,
          pincode: dto.pincode !== undefined ? dto.pincode?.trim() : existing.pincode,
          emergencyContactName: dto.emergencyContactName !== undefined ? dto.emergencyContactName?.trim() : existing.emergencyContactName,
          emergencyContactRelation: dto.emergencyContactRelation !== undefined ? dto.emergencyContactRelation?.trim() : existing.emergencyContactRelation,
          emergencyContactPhone: dto.emergencyContactPhone !== undefined ? dto.emergencyContactPhone?.trim() : existing.emergencyContactPhone,
          occupationType: dto.occupationType ?? existing.occupationType,
          employerOrCollegeName: dto.employerOrCollegeName !== undefined ? dto.employerOrCollegeName?.trim() : existing.employerOrCollegeName,
          designation: dto.designation !== undefined ? dto.designation?.trim() : existing.designation,
          workAddress: dto.workAddress !== undefined ? dto.workAddress?.trim() : existing.workAddress,
          idNumber: dto.idNumber !== undefined ? dto.idNumber?.trim() : existing.idNumber,
          status: dto.status ?? existing.status,
          expectedMoveOutDate: dto.expectedMoveOutDate !== undefined ? (dto.expectedMoveOutDate ? new Date(dto.expectedMoveOutDate) : null) : existing.expectedMoveOutDate,
          monthlyRent: dto.monthlyRent !== undefined ? new Prisma.Decimal(dto.monthlyRent) : existing.monthlyRent,
          securityDeposit: dto.securityDeposit !== undefined ? new Prisma.Decimal(dto.securityDeposit) : existing.securityDeposit,
          depositPaid: dto.depositPaid !== undefined ? new Prisma.Decimal(dto.depositPaid) : existing.depositPaid,
          depositStatus: dto.depositStatus ?? existing.depositStatus,
          foodIncluded: dto.foodIncluded ?? existing.foodIncluded,
          notes: dto.notes !== undefined ? dto.notes?.trim() : existing.notes,
          updatedAt: now,
        },
      });

      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'resident.updated',
        entityId: id,
        oldValues: {
          fullName: existing.fullName,
          email: existing.email,
          phone: existing.phone,
          status: existing.status,
        },
        newValues: {
          fullName: result.fullName,
          email: result.email,
          phone: result.phone,
          status: result.status,
        },
        ipAddress,
      });

      return result;
    });

    this.logger.log(`Resident updated: ${id} by user ${rbac.userId}`);
    return updated;
  }

  /**
   * Soft delete resident
   */
  async remove(id: string, rbac: RbacContext, ipAddress?: string) {
    const existing = await this.prisma.residents.findFirst({
      where: {
        id,
        organizationId: rbac.organizationId,
        deletedAt: null,
      },
    });

    if (!existing) {
      throw new NotFoundException('Resident not found');
    }

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      // Soft-delete resident
      await tx.residents.update({
        where: { id },
        data: {
          deletedAt: now,
          status: 'CLOSED',
          updatedAt: now,
        },
      });

      // Free bed if assigned
      if (existing.bedId) {
        await tx.beds.update({
          where: { id: existing.bedId },
          data: { status: 'AVAILABLE', updatedAt: now },
        });
      }

      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'resident.deleted',
        entityId: id,
        oldValues: {
          fullName: existing.fullName,
          email: existing.email,
          phone: existing.phone,
        },
        newValues: {
          deletedAt: now,
          status: 'CLOSED',
        },
        ipAddress,
      });
    });

    this.logger.log(`Resident soft-deleted: ${id} by user ${rbac.userId}`);
    return {
      success: true,
      message: 'Resident deleted successfully',
      id,
    };
  }
}
