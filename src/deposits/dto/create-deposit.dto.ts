import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DepositTxType, PaymentMethod } from '@prisma/client';
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

export class CreateDepositDto {
  @ApiProperty({ example: '10f6501b-487c-4118-89e7-40bccb670c05', description: 'Property UUID' })
  @IsUUID('4', { message: 'propertyId must be a valid UUID' })
  @IsNotEmpty()
  propertyId: string;

  @ApiProperty({ example: '7c0c74c4-7d32-497c-97ee-fe9a9e354a0d', description: 'Resident UUID' })
  @IsUUID('4', { message: 'residentId must be a valid UUID' })
  @IsNotEmpty()
  residentId: string;

  @ApiProperty({ enum: DepositTxType, default: DepositTxType.COLLECTED })
  @IsEnum(DepositTxType)
  transactionType: DepositTxType;

  @ApiProperty({ example: 15000.0, description: 'Deposit transaction amount' })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({ enum: PaymentMethod, default: PaymentMethod.UPI })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod = PaymentMethod.UPI;

  @ApiPropertyOptional({ example: 'DEP-REF-12345' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceNumber?: string;

  @ApiPropertyOptional({ example: 'Security deposit collected at move-in' })
  @IsOptional()
  @IsString()
  notes?: string;
}
