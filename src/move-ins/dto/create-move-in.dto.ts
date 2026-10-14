import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MoveInStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateMoveInDto {
  @ApiProperty({ example: '7c0c74c4-7d32-497c-97ee-fe9a9e354a0d', description: 'Resident UUID' })
  @IsUUID('4', { message: 'residentId must be a valid UUID' })
  @IsNotEmpty()
  residentId: string;

  @ApiProperty({ example: '10f6501b-487c-4118-89e7-40bccb670c05', description: 'Property UUID' })
  @IsUUID('4', { message: 'propertyId must be a valid UUID' })
  @IsNotEmpty()
  propertyId: string;

  @ApiProperty({ example: 'cfca1ef5-d82f-4d8e-bc36-d2b6c9398e5b', description: 'Bed UUID' })
  @IsUUID('4', { message: 'bedId must be a valid UUID' })
  @IsNotEmpty()
  bedId: string;

  @ApiPropertyOptional({ example: '9a318182-e642-45e0-94e8-f7b604e30018', description: 'Optional linked Booking UUID' })
  @IsOptional()
  @IsUUID('4', { message: 'bookingId must be a valid UUID' })
  bookingId?: string;

  @ApiPropertyOptional({ example: '2026-10-01T00:00:00.000Z', description: 'Actual move-in date' })
  @IsOptional()
  @IsString()
  moveInDate?: string;

  @ApiPropertyOptional({ example: 124.5, description: 'Initial electricity/utility meter reading' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  initialMeterReading?: number;

  @ApiProperty({ example: 15000.0, description: 'Agreed security deposit amount' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  securityDepositAmount: number;

  @ApiProperty({ example: 15000.0, description: 'Deposit amount paid by resident' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  depositPaid: number;

  @ApiProperty({ example: 9500.0, description: 'First month invoice/rent amount' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  firstInvoiceAmount: number;

  @ApiPropertyOptional({ example: false, default: false, description: 'Whether first invoice is paid upfront' })
  @IsOptional()
  @IsBoolean()
  firstInvoicePaid?: boolean = false;

  @ApiPropertyOptional({ enum: MoveInStatus, default: MoveInStatus.COMPLETED })
  @IsOptional()
  @IsEnum(MoveInStatus)
  status?: MoveInStatus = MoveInStatus.COMPLETED;

  @ApiPropertyOptional({ example: 'Keys handed over, welcome kit provided' })
  @IsOptional()
  @IsString()
  notes?: string;
}
