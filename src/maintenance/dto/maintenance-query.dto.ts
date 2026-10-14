import { ApiPropertyOptional } from '@nestjs/swagger';
import { MaintenanceCategory, MaintenancePriority, MaintenanceStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class MaintenanceQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ enum: MaintenanceStatus })
  @IsOptional()
  @IsEnum(MaintenanceStatus)
  status?: MaintenanceStatus;

  @ApiPropertyOptional({ enum: MaintenanceCategory })
  @IsOptional()
  @IsEnum(MaintenanceCategory)
  category?: MaintenanceCategory;

  @ApiPropertyOptional({ enum: MaintenancePriority })
  @IsOptional()
  @IsEnum(MaintenancePriority)
  priority?: MaintenancePriority;

  @ApiPropertyOptional({ description: 'Filter by property UUID' })
  @IsOptional()
  @IsUUID('4')
  propertyId?: string;

  @ApiPropertyOptional({ description: 'Filter by room UUID' })
  @IsOptional()
  @IsUUID('4')
  roomId?: string;

  @ApiPropertyOptional({ description: 'Filter by bed UUID' })
  @IsOptional()
  @IsUUID('4')
  bedId?: string;

  @ApiPropertyOptional({ description: 'Filter by resident UUID' })
  @IsOptional()
  @IsUUID('4')
  residentId?: string;

  @ApiPropertyOptional({ description: 'Filter by assigned staff user UUID' })
  @IsOptional()
  @IsUUID('4')
  assignedStaffId?: string;

  @ApiPropertyOptional({ description: 'Search ticketNumber, title, description, vendorName' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Sort field', default: 'createdAt' })
  @IsOptional()
  @IsString()
  sortBy?: 'createdAt' | 'priority' | 'status' | 'slaDueAt' = 'createdAt';

  @ApiPropertyOptional({ description: 'Sort direction', default: 'desc' })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc' = 'desc';
}
