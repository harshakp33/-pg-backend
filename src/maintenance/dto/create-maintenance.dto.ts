import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MaintenanceCategory, MaintenancePriority, MaintenanceStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateMaintenanceDto {
  @ApiProperty({ description: 'Property UUID', example: '10f6501b-487c-4118-89e7-40bccb670c05' })
  @IsUUID('4', { message: 'propertyId must be a valid UUID' })
  @IsNotEmpty()
  propertyId: string;

  @ApiPropertyOptional({ description: 'Room UUID', example: '07bcced7-d651-420d-a3d7-d7ea6fee9080' })
  @IsOptional()
  @IsUUID('4')
  roomId?: string;

  @ApiPropertyOptional({ description: 'Bed UUID', example: '259c3bd5-e4f0-4d66-808c-6f534bde1b1f' })
  @IsOptional()
  @IsUUID('4')
  bedId?: string;

  @ApiPropertyOptional({ description: 'Resident UUID (optional for RESIDENT role)', example: '7c0c74c4-7d32-497c-97ee-fe9a9e354a0d' })
  @IsOptional()
  @IsUUID('4')
  residentId?: string;

  @ApiPropertyOptional({ description: 'Custom ticket number', example: 'MNT-2026-0001' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  ticketNumber?: string;

  @ApiProperty({ example: 'Fix leaking pipe under bathroom sink', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiProperty({ example: 'Water drips continuously from the hot water joint below the wash basin.' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiPropertyOptional({ enum: MaintenanceCategory, default: MaintenanceCategory.OTHER })
  @IsOptional()
  @IsEnum(MaintenanceCategory)
  category?: MaintenanceCategory = MaintenanceCategory.OTHER;

  @ApiPropertyOptional({ enum: MaintenancePriority, default: MaintenancePriority.MEDIUM })
  @IsOptional()
  @IsEnum(MaintenancePriority)
  priority?: MaintenancePriority = MaintenancePriority.MEDIUM;

  @ApiPropertyOptional({ enum: MaintenanceStatus, default: MaintenanceStatus.CREATED })
  @IsOptional()
  @IsEnum(MaintenanceStatus)
  status?: MaintenanceStatus = MaintenanceStatus.CREATED;

  @ApiPropertyOptional({ description: 'Assigned staff user UUID', example: '2f36f7ff-70da-453f-ba38-cd4f90be2035' })
  @IsOptional()
  @IsUUID('4')
  assignedStaffId?: string;

  @ApiPropertyOptional({ description: 'External vendor name', example: 'Fast Plumbers Ltd' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  vendorName?: string;

  @ApiPropertyOptional({ example: 450.0, default: 0.0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  estimatedCost?: number = 0.0;

  @ApiPropertyOptional({ description: 'Comma-separated or JSON array of image URLs' })
  @IsOptional()
  @IsString()
  images?: string;

  @ApiPropertyOptional({ description: 'SLA due timestamp (ISO string)', example: '2026-10-08T18:00:00.000Z' })
  @IsOptional()
  @IsString()
  slaDueAt?: string;

  @ApiPropertyOptional({ description: 'Initial note for maintenance history' })
  @IsOptional()
  @IsString()
  notes?: string;
}
