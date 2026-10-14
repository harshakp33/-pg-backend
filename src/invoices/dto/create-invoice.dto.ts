import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChargeType, InvoiceStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateInvoiceItemDto {
  @ApiProperty({ enum: ChargeType, default: ChargeType.BASE_RENT })
  @IsEnum(ChargeType)
  chargeType: ChargeType;

  @ApiProperty({ example: 'Monthly room base rent' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ example: 9500.0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiPropertyOptional({ default: false, description: 'True if deduction/discount' })
  @IsOptional()
  @IsBoolean()
  isDeduction?: boolean = false;
}

export class CreateInvoiceDto {
  @ApiProperty({ example: '10f6501b-487c-4118-89e7-40bccb670c05', description: 'Property UUID' })
  @IsUUID('4', { message: 'propertyId must be a valid UUID' })
  @IsNotEmpty()
  propertyId: string;

  @ApiProperty({ example: '7c0c74c4-7d32-497c-97ee-fe9a9e354a0d', description: 'Resident UUID' })
  @IsUUID('4', { message: 'residentId must be a valid UUID' })
  @IsNotEmpty()
  residentId: string;

  @ApiPropertyOptional({ example: 'INV-2026-0001', description: 'Optional custom invoice number' })
  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @ApiProperty({ example: '2026-10-01', description: 'Billing cycle start date (YYYY-MM-DD)' })
  @IsString()
  @IsNotEmpty()
  billingPeriodStart: string;

  @ApiProperty({ example: '2026-10-31', description: 'Billing cycle end date (YYYY-MM-DD)' })
  @IsString()
  @IsNotEmpty()
  billingPeriodEnd: string;

  @ApiProperty({ example: '2026-10-05', description: 'Invoice payment due date (YYYY-MM-DD)' })
  @IsString()
  @IsNotEmpty()
  dueDate: string;

  @ApiPropertyOptional({ example: 9500.0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  baseRent?: number = 0;

  @ApiPropertyOptional({ example: 500.0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  additionalCharges?: number = 0;

  @ApiPropertyOptional({ example: 0.0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  lateFees?: number = 0;

  @ApiPropertyOptional({ example: 0.0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discounts?: number = 0;

  @ApiPropertyOptional({ example: 0.0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  adjustments?: number = 0;

  @ApiPropertyOptional({ enum: InvoiceStatus, default: InvoiceStatus.ISSUED })
  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus = InvoiceStatus.ISSUED;

  @ApiPropertyOptional({ example: 'October 2026 rent invoice' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ type: [CreateInvoiceItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceItemDto)
  items?: CreateInvoiceItemDto[];
}
