import { ApiPropertyOptional } from '@nestjs/swagger';
import { ElectricityBillingType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdatePropertySettingsDto {
  @ApiPropertyOptional({ description: 'Day of month rent billing starts (1-31)', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31)
  billingCycleDay?: number;

  @ApiPropertyOptional({ description: 'Grace period days before late fees apply (0-30)', example: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(30)
  gracePeriodDays?: number;

  @ApiPropertyOptional({ description: 'Late fee charged per day (INR)', example: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  lateFeePerDay?: number;

  @ApiPropertyOptional({ description: 'Notice period days required before move out (0-90)', example: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(90)
  noticePeriodDays?: number;

  @ApiPropertyOptional({ description: 'Security deposit requirement in months of rent (0-12)', example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(12)
  securityDepositMonths?: number;

  @ApiPropertyOptional({ description: 'Night curfew time (HH:mm format)', example: '22:30' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  curfewTime?: string;

  @ApiPropertyOptional({ enum: ElectricityBillingType, description: 'Electricity billing type' })
  @IsOptional()
  @IsEnum(ElectricityBillingType)
  electricityBilling?: ElectricityBillingType;

  @ApiPropertyOptional({ description: 'Rate charged per unit of electricity', example: 10.5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  electricityRatePerUnit?: number;

  @ApiPropertyOptional({ description: 'Whether daily food menu is enabled', example: true })
  @IsOptional()
  @IsBoolean()
  foodMenuAvailable?: boolean;

  @ApiPropertyOptional({ description: 'Whether food is included in rent by default', example: true })
  @IsOptional()
  @IsBoolean()
  foodIncluded?: boolean;

  @ApiPropertyOptional({ description: 'Guest / visitor policy rules text', example: 'Guests permitted until 9 PM' })
  @IsOptional()
  @IsString()
  guestPolicy?: string;
}
