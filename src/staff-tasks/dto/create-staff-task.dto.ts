import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HousekeepingCategory, MaintenancePriority, TaskStatus } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class CreateStaffTaskDto {
  @ApiProperty({ description: 'Property UUID', example: '10f6501b-487c-4118-89e7-40bccb670c05' })
  @IsUUID('4', { message: 'propertyId must be a valid UUID' })
  @IsNotEmpty()
  propertyId: string;

  @ApiPropertyOptional({ description: 'Floor UUID', example: '9a941f12-0fa5-4560-aee8-bf29f9e31d45' })
  @IsOptional()
  @IsUUID('4')
  floorId?: string;

  @ApiPropertyOptional({ description: 'Room UUID', example: '07bcced7-d651-420d-a3d7-d7ea6fee9080' })
  @IsOptional()
  @IsUUID('4')
  roomId?: string;

  @ApiProperty({ example: 'Room 204 & Corridor', maxLength: 150 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  location: string;

  @ApiPropertyOptional({ description: 'Assigned staff profile UUID', example: '80db9bb2-64e1-44dc-b625-4411c22b2e50' })
  @IsOptional()
  @IsUUID('4')
  assignedStaffId?: string;

  @ApiProperty({ example: 'Deep clean washroom and sanitize surfaces', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({ example: 'Focus on tile grouting and replace toiletries.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: HousekeepingCategory, default: HousekeepingCategory.ROOM_CLEANING })
  @IsOptional()
  @IsEnum(HousekeepingCategory)
  category?: HousekeepingCategory = HousekeepingCategory.ROOM_CLEANING;

  @ApiPropertyOptional({ enum: MaintenancePriority, default: MaintenancePriority.MEDIUM })
  @IsOptional()
  @IsEnum(MaintenancePriority)
  priority?: MaintenancePriority = MaintenancePriority.MEDIUM;

  @ApiProperty({ example: '2026-10-06', description: 'Due date in YYYY-MM-DD format' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dueDate must be in YYYY-MM-DD format' })
  dueDate: string;

  @ApiPropertyOptional({ example: '14:00', default: '12:00', maxLength: 10 })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  dueTime?: string = '12:00';

  @ApiPropertyOptional({ enum: TaskStatus, default: TaskStatus.PENDING })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus = TaskStatus.PENDING;

  @ApiPropertyOptional({ example: 'Priority task before new resident check-in' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ example: '["Mop floor", "Disinfect fixtures", "Replace trash bags"]' })
  @IsOptional()
  @IsString()
  checklistItems?: string;
}
