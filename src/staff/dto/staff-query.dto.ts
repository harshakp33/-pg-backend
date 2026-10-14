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
import { StaffShift, StaffStatus } from '@prisma/client';

export class StaffQueryDto {
  @ApiPropertyOptional({
    description: 'Page number for pagination',
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of records per page (max 100)',
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Filter by property UUID',
    example: '10f6501b-487c-4118-89e7-40bccb670c05',
  })
  @IsOptional()
  @IsUUID()
  propertyId?: string;

  @ApiPropertyOptional({
    description: 'Filter by staff employment status',
    enum: StaffStatus,
  })
  @IsOptional()
  @IsEnum(StaffStatus)
  status?: StaffStatus;

  @ApiPropertyOptional({
    description: 'Filter by shift',
    enum: StaffShift,
  })
  @IsOptional()
  @IsEnum(StaffShift)
  shift?: StaffShift;

  @ApiPropertyOptional({
    description: 'Filter by role or designation',
    example: 'WARDEN',
  })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional({
    description: 'Search string across fullName, email, phone, role',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
