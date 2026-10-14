import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CreateDailyMenuItemDto } from './menu-item.dto';

export class CreateWeeklyMenuDto {
  @ApiProperty({ description: 'Property UUID', example: '10f6501b-487c-4118-89e7-40bccb670c05' })
  @IsUUID('4', { message: 'propertyId must be a valid UUID' })
  @IsNotEmpty()
  propertyId: string;

  @ApiProperty({ example: 'Standard South Indian Menu - Week 41', maxLength: 150 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @ApiProperty({ description: 'Week start date (ISO date string)', example: '2026-10-12' })
  @IsDateString()
  @IsNotEmpty()
  weekStartDate: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean = true;

  @ApiPropertyOptional({ example: 'Special festival sweets on Friday lunch' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ type: () => [CreateDailyMenuItemDto], description: 'Optional initial menu items' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateDailyMenuItemDto)
  items?: CreateDailyMenuItemDto[];
}

export class UpdateWeeklyMenuDto {
  @ApiPropertyOptional({ example: 'Updated South Indian Menu', maxLength: 150 })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional({ description: 'Week start date (ISO date string)', example: '2026-10-12' })
  @IsOptional()
  @IsDateString()
  weekStartDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class WeeklyMenuQueryDto {
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

  @ApiPropertyOptional({ description: 'Filter by property UUID' })
  @IsOptional()
  @IsUUID('4')
  propertyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @ApiPropertyOptional({ description: 'Filter by week start date from' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Filter by week start date to' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
