import { ApiPropertyOptional } from '@nestjs/swagger';
import { MaintenanceCategory, MaintenancePriority, MaintenanceStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class UpdateMaintenanceDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: MaintenanceCategory })
  @IsOptional()
  @IsEnum(MaintenanceCategory)
  category?: MaintenanceCategory;

  @ApiPropertyOptional({ enum: MaintenancePriority })
  @IsOptional()
  @IsEnum(MaintenancePriority)
  priority?: MaintenancePriority;

  @ApiPropertyOptional({ enum: MaintenanceStatus })
  @IsOptional()
  @IsEnum(MaintenanceStatus)
  status?: MaintenanceStatus;

  @ApiPropertyOptional({ description: 'Assigned staff user UUID' })
  @IsOptional()
  @IsUUID('4')
  assignedStaffId?: string;

  @ApiPropertyOptional({ description: 'External vendor name', maxLength: 150 })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  vendorName?: string;

  @ApiPropertyOptional({ example: 500.0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  estimatedCost?: number;

  @ApiPropertyOptional({ example: 620.0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  actualCost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  images?: string;

  @ApiPropertyOptional({ description: 'Resolution explanation' })
  @IsOptional()
  @IsString()
  resolutionNotes?: string;

  @ApiPropertyOptional({ description: 'SLA due timestamp' })
  @IsOptional()
  @IsString()
  slaDueAt?: string;

  @ApiPropertyOptional({ description: 'Scheduled / assigned timestamp' })
  @IsOptional()
  @IsString()
  assignedAt?: string;

  @ApiPropertyOptional({ description: 'Work started timestamp' })
  @IsOptional()
  @IsString()
  startedAt?: string;

  @ApiPropertyOptional({ description: 'Work completed timestamp' })
  @IsOptional()
  @IsString()
  completedAt?: string;

  @ApiPropertyOptional({ description: 'Work verified timestamp' })
  @IsOptional()
  @IsString()
  verifiedAt?: string;

  @ApiPropertyOptional({ description: 'Work closed timestamp' })
  @IsOptional()
  @IsString()
  closedAt?: string;

  @ApiPropertyOptional({ description: 'History note' })
  @IsOptional()
  @IsString()
  notes?: string;
}
