import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PurchaseRecordStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreatePurchaseRecordItemDto {
  @ApiProperty({ description: 'Inventory item UUID', example: 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e' })
  @IsUUID('4', { message: 'inventoryItemId must be a valid UUID' })
  @IsNotEmpty()
  inventoryItemId: string;

  @ApiProperty({ example: 5.0, description: 'Quantity purchased' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @IsNotEmpty()
  quantity: number;

  @ApiProperty({ example: 1250.0, description: 'Unit price' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsNotEmpty()
  unitPrice: number;
}

export class CreatePurchaseRecordDto {
  @ApiProperty({ description: 'Property UUID', example: '10f6501b-487c-4118-89e7-40bccb670c05' })
  @IsUUID('4', { message: 'propertyId must be a valid UUID' })
  @IsNotEmpty()
  propertyId: string;

  @ApiProperty({ description: 'Vendor UUID', example: 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f' })
  @IsUUID('4', { message: 'vendorId must be a valid UUID' })
  @IsNotEmpty()
  vendorId: string;

  @ApiProperty({ example: 'PO-2026-1001', maxLength: 50 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  poNumber: string;

  @ApiPropertyOptional({ example: 'INV-PROV-901', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  invoiceNumber?: string;

  @ApiProperty({ description: 'Purchase date (ISO date string)', example: '2026-10-05' })
  @IsDateString()
  @IsNotEmpty()
  purchaseDate: string;

  @ApiPropertyOptional({ default: 0.0, example: 150.0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  taxAmount?: number = 0.0;

  @ApiPropertyOptional({ default: 0.0, example: 50.0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discountAmount?: number = 0.0;

  @ApiPropertyOptional({ enum: PurchaseRecordStatus, default: PurchaseRecordStatus.RECEIVED })
  @IsOptional()
  @IsEnum(PurchaseRecordStatus)
  status?: PurchaseRecordStatus = PurchaseRecordStatus.RECEIVED;

  @ApiPropertyOptional({ example: 'Monthly mess supplies order' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ type: () => [CreatePurchaseRecordItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseRecordItemDto)
  items?: CreatePurchaseRecordItemDto[];
}

export class UpdatePurchaseRecordDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  invoiceNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  purchaseDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  taxAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discountAmount?: number;

  @ApiPropertyOptional({ enum: PurchaseRecordStatus })
  @IsOptional()
  @IsEnum(PurchaseRecordStatus)
  status?: PurchaseRecordStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class PurchaseRecordQueryDto {
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
  propertyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  vendorId?: string;

  @ApiPropertyOptional({ enum: PurchaseRecordStatus })
  @IsOptional()
  @IsEnum(PurchaseRecordStatus)
  status?: PurchaseRecordStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
