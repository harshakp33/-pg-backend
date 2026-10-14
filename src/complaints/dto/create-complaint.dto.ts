import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ComplaintCategory, ComplaintStatus, MaintenancePriority } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateComplaintDto {
  @ApiProperty({ description: 'Property UUID', example: '10f6501b-487c-4118-89e7-40bccb670c05' })
  @IsUUID('4', { message: 'propertyId must be a valid UUID' })
  @IsNotEmpty()
  propertyId: string;

  @ApiPropertyOptional({ description: 'Resident UUID (optional for RESIDENT role)', example: '7c0c74c4-7d32-497c-97ee-fe9a9e354a0d' })
  @IsOptional()
  @IsUUID('4', { message: 'residentId must be a valid UUID' })
  residentId?: string;

  @ApiPropertyOptional({ description: 'Custom ticket number if any', example: 'CMP-2026-0001' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  ticketNumber?: string;

  @ApiPropertyOptional({ enum: ComplaintCategory, default: ComplaintCategory.OTHER })
  @IsOptional()
  @IsEnum(ComplaintCategory)
  category?: ComplaintCategory = ComplaintCategory.OTHER;

  @ApiProperty({ example: 'Geyser not heating in Room 204', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  subject: string;

  @ApiProperty({ example: 'Water remains cold despite turning on geyser for 30 minutes.' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiPropertyOptional({ enum: MaintenancePriority, default: MaintenancePriority.MEDIUM })
  @IsOptional()
  @IsEnum(MaintenancePriority)
  priority?: MaintenancePriority = MaintenancePriority.MEDIUM;

  @ApiPropertyOptional({ enum: ComplaintStatus, default: ComplaintStatus.SUBMITTED })
  @IsOptional()
  @IsEnum(ComplaintStatus)
  status?: ComplaintStatus = ComplaintStatus.SUBMITTED;

  @ApiPropertyOptional({ description: 'Assigned staff user UUID', example: '2f36f7ff-70da-453f-ba38-cd4f90be2035' })
  @IsOptional()
  @IsUUID('4')
  assignedToId?: string;

  @ApiPropertyOptional({ description: 'Initial notes for complaint history', example: 'Reported by resident at reception' })
  @IsOptional()
  @IsString()
  notes?: string;
}
