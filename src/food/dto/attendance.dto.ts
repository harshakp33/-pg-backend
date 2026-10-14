import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MealAttendanceStatus, MealType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class CreateMealAttendanceDto {
  @ApiProperty({ description: 'Meal record UUID', example: 'd1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a' })
  @IsUUID('4', { message: 'mealRecordId must be a valid UUID' })
  @IsNotEmpty()
  mealRecordId: string;

  @ApiPropertyOptional({ description: 'Resident UUID (optional for RESIDENT role; mandatory for staff/manager)', example: 'b0b3b1c3-8c53-402a-bedf-8f2e3f0b45fa' })
  @IsOptional()
  @IsUUID('4')
  residentId?: string;

  @ApiPropertyOptional({ enum: MealAttendanceStatus, default: MealAttendanceStatus.PRESENT })
  @IsOptional()
  @IsEnum(MealAttendanceStatus)
  status?: MealAttendanceStatus = MealAttendanceStatus.PRESENT;

  @ApiPropertyOptional({ example: 'Packed lunch requested' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateMealAttendanceDto {
  @ApiPropertyOptional({ enum: MealAttendanceStatus })
  @IsOptional()
  @IsEnum(MealAttendanceStatus)
  status?: MealAttendanceStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class MealAttendanceQueryDto {
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  mealRecordId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  propertyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  residentId?: string;

  @ApiPropertyOptional({ enum: MealAttendanceStatus })
  @IsOptional()
  @IsEnum(MealAttendanceStatus)
  status?: MealAttendanceStatus;

  @ApiPropertyOptional({ enum: MealType })
  @IsOptional()
  @IsEnum(MealType)
  mealType?: MealType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  date?: string;
}
