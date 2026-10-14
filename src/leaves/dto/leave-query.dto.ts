import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum LeaveStatusEnum {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

export class LeaveQueryDto {
  @ApiPropertyOptional({ description: 'Page number (default 1)', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Number of records per page (default 20, max 100)', example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Filter by Property UUID' })
  @IsOptional()
  @IsUUID()
  propertyId?: string;

  @ApiPropertyOptional({ description: 'Filter by Resident UUID (ignored for residents)' })
  @IsOptional()
  @IsUUID()
  residentId?: string;

  @ApiPropertyOptional({
    description: 'Filter by leave status',
    enum: LeaveStatusEnum,
  })
  @IsOptional()
  @IsEnum(LeaveStatusEnum)
  status?: LeaveStatusEnum;

  @ApiPropertyOptional({ description: 'Search term for reason or resident name' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter leaves starting on or after this date (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Filter leaves ending on or before this date (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  endDate?: string;
}
