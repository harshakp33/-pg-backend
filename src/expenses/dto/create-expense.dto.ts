import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExpenseCategory, PaymentMethod } from '@prisma/client';
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

export class CreateExpenseDto {
  @ApiProperty({ example: '10f6501b-487c-4118-89e7-40bccb670c05', description: 'Property UUID' })
  @IsUUID('4', { message: 'propertyId must be a valid UUID' })
  @IsNotEmpty()
  propertyId: string;

  @ApiProperty({ enum: ExpenseCategory, default: ExpenseCategory.ELECTRICITY_BILL })
  @IsEnum(ExpenseCategory)
  category: ExpenseCategory;

  @ApiProperty({ example: 'October BESCOM Electricity Bill' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiProperty({ example: 4500.0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({ example: '2026-10-01T00:00:00.000Z' })
  @IsOptional()
  @IsString()
  expenseDate?: string;

  @ApiPropertyOptional({ enum: PaymentMethod, default: PaymentMethod.UPI })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod = PaymentMethod.UPI;

  @ApiPropertyOptional({ example: 'BESCOM' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  vendorName?: string;

  @ApiPropertyOptional({ example: 'https://storage.pg.com/receipts/exp-101.pdf' })
  @IsOptional()
  @IsString()
  invoiceReceiptUrl?: string;

  @ApiPropertyOptional({ example: 'Paid online via portal' })
  @IsOptional()
  @IsString()
  notes?: string;
}
