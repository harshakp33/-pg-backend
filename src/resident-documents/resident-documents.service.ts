import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, VerificationStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RbacContext } from '../rbac/types/rbac.types';
import { CreateResidentDocumentDto } from './dto/create-resident-document.dto';
import { ResidentDocumentQueryDto } from './dto/resident-document-query.dto';
import { UpdateResidentDocumentDto } from './dto/update-resident-document.dto';

@Injectable()
export class ResidentDocumentsService {
  private readonly logger = new Logger(ResidentDocumentsService.name);

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
        entityType: 'resident_documents',
        entityId: params.entityId,
        oldValues: params.oldValues ? JSON.stringify(params.oldValues) : null,
        newValues: params.newValues ? JSON.stringify(params.newValues) : null,
        ipAddress: params.ipAddress ?? null,
      },
    });
  }

  /**
   * Verify resident belongs to organization and is active
   */
  async verifyResident(residentId: string, organizationId: string) {
    const resident = await this.prisma.residents.findFirst({
      where: {
        id: residentId,
        organizationId,
        deletedAt: null,
      },
    });

    if (!resident) {
      throw new NotFoundException('Resident not found');
    }

    return resident;
  }

  /**
   * Create a new document for a resident
   */
  async create(
    residentId: string,
    dto: CreateResidentDocumentDto,
    rbac: RbacContext,
    ipAddress?: string,
  ) {
    await this.verifyResident(residentId, rbac.organizationId);

    const docId = randomUUID();
    const now = new Date();

    const doc = await this.prisma.$transaction(async (tx) => {
      const created = await tx.resident_documents.create({
        data: {
          id: docId,
          organizationId: rbac.organizationId,
          residentId,
          documentType: dto.documentType,
          documentNumber: dto.documentNumber?.trim() ?? null,
          fileName: dto.fileName.trim(),
          fileUrl: dto.fileUrl.trim(),
          verificationStatus: dto.verificationStatus ?? VerificationStatus.PENDING,
          remarks: dto.remarks?.trim() ?? null,
          createdAt: now,
          updatedAt: now,
        },
      });

      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'resident_document.created',
        entityId: docId,
        newValues: {
          residentId,
          documentType: created.documentType,
          fileName: created.fileName,
          verificationStatus: created.verificationStatus,
        },
        ipAddress,
      });

      return created;
    });

    this.logger.log(`Document created: ${doc.id} for resident ${residentId} by user ${rbac.userId}`);
    return doc;
  }

  /**
   * List all documents for a resident with pagination
   */
  async findAll(
    residentId: string,
    query: ResidentDocumentQueryDto,
    rbac: RbacContext,
  ) {
    await this.verifyResident(residentId, rbac.organizationId);

    const {
      page = 1,
      limit = 20,
      documentType,
      verificationStatus,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const skip = (page - 1) * limit;

    const where: Prisma.resident_documentsWhereInput = {
      residentId,
      organizationId: rbac.organizationId,
    };

    if (documentType) {
      where.documentType = documentType;
    }
    if (verificationStatus) {
      where.verificationStatus = verificationStatus;
    }

    const orderBy: Prisma.resident_documentsOrderByWithRelationInput = {
      [sortBy]: sortOrder,
    };

    const [items, total] = await Promise.all([
      this.prisma.resident_documents.findMany({
        where,
        skip,
        take: limit,
        orderBy,
      }),
      this.prisma.resident_documents.count({ where }),
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
   * Get single resident document details
   */
  async findOne(residentId: string, id: string, rbac: RbacContext) {
    await this.verifyResident(residentId, rbac.organizationId);

    const doc = await this.prisma.resident_documents.findFirst({
      where: {
        id,
        residentId,
        organizationId: rbac.organizationId,
      },
    });

    if (!doc) {
      throw new NotFoundException('Resident document not found');
    }

    return doc;
  }

  /**
   * Update resident document (e.g. verification status, remarks)
   */
  async update(
    residentId: string,
    id: string,
    dto: UpdateResidentDocumentDto,
    rbac: RbacContext,
    ipAddress?: string,
  ) {
    await this.verifyResident(residentId, rbac.organizationId);

    const existing = await this.prisma.resident_documents.findFirst({
      where: {
        id,
        residentId,
        organizationId: rbac.organizationId,
      },
    });

    if (!existing) {
      throw new NotFoundException('Resident document not found');
    }

    const now = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.resident_documents.update({
        where: { id },
        data: {
          documentType: dto.documentType ?? existing.documentType,
          documentNumber: dto.documentNumber !== undefined ? dto.documentNumber?.trim() : existing.documentNumber,
          fileName: dto.fileName !== undefined ? dto.fileName.trim() : existing.fileName,
          fileUrl: dto.fileUrl !== undefined ? dto.fileUrl.trim() : existing.fileUrl,
          verificationStatus: dto.verificationStatus ?? existing.verificationStatus,
          verifiedBy: dto.verificationStatus === VerificationStatus.VERIFIED ? rbac.userId : existing.verifiedBy,
          verifiedAt: dto.verificationStatus === VerificationStatus.VERIFIED ? now : existing.verifiedAt,
          remarks: dto.remarks !== undefined ? dto.remarks?.trim() : existing.remarks,
          updatedAt: now,
        },
      });

      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'resident_document.updated',
        entityId: id,
        oldValues: {
          verificationStatus: existing.verificationStatus,
          documentType: existing.documentType,
        },
        newValues: {
          verificationStatus: result.verificationStatus,
          documentType: result.documentType,
        },
        ipAddress,
      });

      return result;
    });

    this.logger.log(`Document updated: ${id} for resident ${residentId} by user ${rbac.userId}`);
    return updated;
  }

  /**
   * Delete resident document
   */
  async remove(residentId: string, id: string, rbac: RbacContext, ipAddress?: string) {
    await this.verifyResident(residentId, rbac.organizationId);

    const existing = await this.prisma.resident_documents.findFirst({
      where: {
        id,
        residentId,
        organizationId: rbac.organizationId,
      },
    });

    if (!existing) {
      throw new NotFoundException('Resident document not found');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.resident_documents.delete({
        where: { id },
      });

      await this.createAuditLogTx(tx, {
        organizationId: rbac.organizationId,
        userId: rbac.userId,
        action: 'resident_document.deleted',
        entityId: id,
        oldValues: {
          residentId,
          documentType: existing.documentType,
          fileName: existing.fileName,
        },
        newValues: {
          deleted: true,
        },
        ipAddress,
      });
    });

    this.logger.log(`Document deleted: ${id} for resident ${residentId} by user ${rbac.userId}`);
    return {
      success: true,
      message: 'Document deleted successfully',
      id,
    };
  }
}
