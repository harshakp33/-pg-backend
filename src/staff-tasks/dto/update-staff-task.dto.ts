import { ApiPropertyOptional } from '@nestjs/swagger';
import { HousekeepingCategory, MaintenancePriority, TaskStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class UpdateStaffTaskDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ maxLength: 150 })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  location?: string;

  @ApiPropertyOptional({ enum: HousekeepingCategory })
  @IsOptional()
  @IsEnum(HousekeepingCategory)
  category?: HousekeepingCategory;

  @ApiPropertyOptional({ enum: MaintenancePriority })
  @IsOptional()
  @IsEnum(MaintenancePriority)
  priority?: MaintenancePriority;

  @ApiPropertyOptional({ enum: TaskStatus })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional({ description: 'Assigned staff profile UUID' })
  @IsOptional()
  @IsUUID('4')
  assignedStaffId?: string;

  @ApiPropertyOptional({ example: '2026-10-07' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dueDate must be in YYYY-MM-DD format' })
  dueDate?: string;

  @ApiPropertyOptional({ example: '16:00', maxLength: 10 })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  dueTime?: string;

  @ApiPropertyOptional({ description: 'Timestamp when task was finished (ISO string)' })
  @IsOptional()
  @IsString()
  completionTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  checklistItems?: string;
}
