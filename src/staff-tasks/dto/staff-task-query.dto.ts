import { ApiPropertyOptional } from '@nestjs/swagger';
import { HousekeepingCategory, MaintenancePriority, TaskStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class StaffTaskQueryDto {
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

  @ApiPropertyOptional({ enum: TaskStatus })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional({ enum: HousekeepingCategory })
  @IsOptional()
  @IsEnum(HousekeepingCategory)
  category?: HousekeepingCategory;

  @ApiPropertyOptional({ enum: MaintenancePriority })
  @IsOptional()
  @IsEnum(MaintenancePriority)
  priority?: MaintenancePriority;

  @ApiPropertyOptional({ description: 'Filter by property UUID' })
  @IsOptional()
  @IsUUID('4')
  propertyId?: string;

  @ApiPropertyOptional({ description: 'Filter by floor UUID' })
  @IsOptional()
  @IsUUID('4')
  floorId?: string;

  @ApiPropertyOptional({ description: 'Filter by room UUID' })
  @IsOptional()
  @IsUUID('4')
  roomId?: string;

  @ApiPropertyOptional({ description: 'Filter by assigned staff profile UUID' })
  @IsOptional()
  @IsUUID('4')
  assignedStaffId?: string;

  @ApiPropertyOptional({ description: 'Filter by due date (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  dueDate?: string;

  @ApiPropertyOptional({ description: 'Search title, description, location, notes' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Sort field', default: 'dueDate' })
  @IsOptional()
  @IsString()
  sortBy?: 'dueDate' | 'priority' | 'status' | 'createdAt' = 'dueDate';

  @ApiPropertyOptional({ description: 'Sort direction', default: 'asc' })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc' = 'asc';
}
