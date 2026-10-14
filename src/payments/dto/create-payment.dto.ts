import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod, PaymentStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreatePaymentDto {
  @ApiProperty({ example: '10f6501b-487c-4118-89e7-40bccb670c05', description: 'Property UUID' })
  @IsUUID('4', { message: 'propertyId must be a valid UUID' })
  @IsNotEmpty()
  propertyId: string;

  @ApiProperty({ example: '7c0c74c4-7d32-497c-97ee-fe9a9e354a0d', description: 'Resident UUID' })
  @IsUUID('4', { message: 'residentId must be a valid UUID' })
  @IsNotEmpty()
  residentId: string;

  @ApiPropertyOptional({ example: '9a318182-e642-45e0-94e8-f7b604e30018', description: 'Optional Invoice UUID to allocate' })
  @IsOptional()
  @IsUUID('4', { message: 'invoiceId must be a valid UUID' })
  invoiceId?: string;

  @ApiProperty({ example: 9500.0, description: 'Payment amount received' })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01, { message: 'Payment amount must be greater than zero' })
  amount: number;

  @ApiPropertyOptional({ enum: PaymentMethod, default: PaymentMethod.UPI })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod = PaymentMethod.UPI;

  @ApiPropertyOptional({ example: 'UPI-REF-1234567890', description: 'External transaction or UTR reference' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceNumber?: string;

  @ApiPropertyOptional({ example: '2026-10-02T10:00:00.000Z' })
  @IsOptional()
  @IsString()
  paymentDate?: string;

  @ApiPropertyOptional({ enum: PaymentStatus, default: PaymentStatus.RECORDED })
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus = PaymentStatus.RECORDED;

  @ApiPropertyOptional({ example: 'Rent payment via Google Pay' })
  @IsOptional()
  @IsString()
  notes?: string;
}
