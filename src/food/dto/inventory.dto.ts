import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  InventoryCategory,
  InventoryStatus,
  InventoryTransactionType,
  InventoryUnit,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
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
} from 'class-validator';

export class CreateInventoryItemDto {
  @ApiProperty({ description: 'Property UUID', example: '10f6501b-487c-4118-89e7-40bccb670c05' })
  @IsUUID('4', { message: 'propertyId must be a valid UUID' })
  @IsNotEmpty()
  propertyId: string;

  @ApiProperty({ example: 'Sona Masoori Rice 25kg Bag', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ example: 'FOOD-RICE-25KG', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  sku?: string;

  @ApiPropertyOptional({ enum: InventoryCategory, default: InventoryCategory.GROCERIES_FOOD })
  @IsOptional()
  @IsEnum(InventoryCategory)
  category?: InventoryCategory = InventoryCategory.GROCERIES_FOOD;

  @ApiPropertyOptional({ enum: InventoryUnit, default: InventoryUnit.PACK })
  @IsOptional()
  @IsEnum(InventoryUnit)
  unit?: InventoryUnit = InventoryUnit.PACK;

  @ApiPropertyOptional({ default: 0.0, example: 10.0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  currentStock?: number = 0.0;

  @ApiPropertyOptional({ default: 5.0, example: 5.0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minimumStock?: number = 5.0;

  @ApiPropertyOptional({ default: 50.0, example: 50.0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  maximumStock?: number = 50.0;

  @ApiPropertyOptional({ default: 1350.0, example: 1350.0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  purchasePrice?: number = 0.0;

  @ApiPropertyOptional({ description: 'Vendor UUID', example: 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f' })
  @IsOptional()
  @IsUUID('4')
  vendorId?: string;

  @ApiPropertyOptional({ enum: InventoryStatus, default: InventoryStatus.IN_STOCK })
  @IsOptional()
  @IsEnum(InventoryStatus)
  status?: InventoryStatus = InventoryStatus.IN_STOCK;

  @ApiPropertyOptional({ example: 'Kitchen Pantry Shelf A2', maxLength: 150 })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  locationNote?: string;
}

export class UpdateInventoryItemDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  sku?: string;

  @ApiPropertyOptional({ enum: InventoryCategory })
  @IsOptional()
  @IsEnum(InventoryCategory)
  category?: InventoryCategory;

  @ApiPropertyOptional({ enum: InventoryUnit })
  @IsOptional()
  @IsEnum(InventoryUnit)
  unit?: InventoryUnit;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minimumStock?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  maximumStock?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  purchasePrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  vendorId?: string;

  @ApiPropertyOptional({ enum: InventoryStatus })
  @IsOptional()
  @IsEnum(InventoryStatus)
  status?: InventoryStatus;

  @ApiPropertyOptional({ maxLength: 150 })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  locationNote?: string;
}

export class InventoryItemQueryDto {
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

  @ApiPropertyOptional({ enum: InventoryCategory })
  @IsOptional()
  @IsEnum(InventoryCategory)
  category?: InventoryCategory;

  @ApiPropertyOptional({ enum: InventoryStatus })
  @IsOptional()
  @IsEnum(InventoryStatus)
  status?: InventoryStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}

export class CreateInventoryTransactionDto {
  @ApiProperty({ enum: InventoryTransactionType, example: InventoryTransactionType.STOCK_IN })
  @IsEnum(InventoryTransactionType)
  @IsNotEmpty()
  type: InventoryTransactionType;

  @ApiProperty({ example: 10.0, description: 'Quantity change' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @IsNotEmpty()
  quantity: number;

  @ApiPropertyOptional({ example: 1350.0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice?: number;

  @ApiPropertyOptional({ example: 13500.0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  totalAmount?: number;

  @ApiPropertyOptional({ example: 'PO-2026-0042', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceNumber?: string;

  @ApiPropertyOptional({ description: 'Vendor UUID', example: 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f' })
  @IsOptional()
  @IsUUID('4')
  vendorId?: string;

  @ApiPropertyOptional({ example: 'Received fresh stock from distributor' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class InventoryTransactionQueryDto {
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

  @ApiPropertyOptional({ enum: InventoryTransactionType })
  @IsOptional()
  @IsEnum(InventoryTransactionType)
  type?: InventoryTransactionType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
