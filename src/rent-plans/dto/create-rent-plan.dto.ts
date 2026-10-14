import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BillingFrequency } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateRentPlanDto {
  @ApiPropertyOptional({ example: '10f6501b-487c-4118-89e7-40bccb670c05', description: 'Optional property UUID' })
  @IsOptional()
  @IsUUID('4', { message: 'propertyId must be a valid UUID' })
  propertyId?: string;

  @ApiProperty({ example: 'Standard Triple Sharing Plan' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional({ enum: BillingFrequency, default: BillingFrequency.MONTHLY })
  @IsOptional()
  @IsEnum(BillingFrequency)
  billingFrequency?: BillingFrequency = BillingFrequency.MONTHLY;

  @ApiProperty({ example: 8500.0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  baseAmount: number;

  @ApiProperty({ example: 15000.0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  securityDeposit: number;

  @ApiPropertyOptional({ example: 30, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  noticePeriodDays?: number = 30;

  @ApiPropertyOptional({ example: 3, default: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  lockInPeriodMonths?: number = 3;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  electricityIncluded?: boolean = true;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  foodIncluded?: boolean = true;

  @ApiPropertyOptional({ example: 'Includes 3 times food and high speed Wi-Fi' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;
}
