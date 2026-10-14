import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingStatus } from '@prisma/client';
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

export class CreateBookingDto {
  @ApiProperty({ example: '10f6501b-487c-4118-89e7-40bccb670c05', description: 'Property UUID' })
  @IsUUID('4', { message: 'propertyId must be a valid UUID' })
  @IsNotEmpty()
  propertyId: string;

  @ApiProperty({ example: '42cf26be-cce4-4b93-9a34-c9f46cbb88ec', description: 'Room UUID' })
  @IsUUID('4', { message: 'roomId must be a valid UUID' })
  @IsNotEmpty()
  roomId: string;

  @ApiProperty({ example: 'cfca1ef5-d82f-4d8e-bc36-d2b6c9398e5b', description: 'Bed UUID' })
  @IsUUID('4', { message: 'bedId must be a valid UUID' })
  @IsNotEmpty()
  bedId: string;

  @ApiPropertyOptional({ example: '9a318182-e642-45e0-94e8-f7b604e30018', description: 'Optional linked Enquiry UUID' })
  @IsOptional()
  @IsUUID('4', { message: 'enquiryId must be a valid UUID' })
  enquiryId?: string;

  @ApiPropertyOptional({ example: '7c0c74c4-7d32-497c-97ee-fe9a9e354a0d', description: 'Optional linked Resident UUID' })
  @IsOptional()
  @IsUUID('4', { message: 'residentId must be a valid UUID' })
  residentId?: string;

  @ApiProperty({ example: 5000.0, description: 'Token advance booking amount' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  bookingAmount: number;

  @ApiPropertyOptional({ example: '2026-10-01T00:00:00.000Z', description: 'Booking confirmation timestamp' })
  @IsOptional()
  @IsString()
  bookingDate?: string;

  @ApiProperty({ example: '2026-10-15', description: 'Expected move-in date (YYYY-MM-DD)' })
  @IsString()
  @IsNotEmpty({ message: 'expectedMoveIn is required' })
  expectedMoveIn: string;

  @ApiPropertyOptional({ example: 'REC-2026-001', description: 'Payment receipt number' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  receiptNumber?: string;

  @ApiPropertyOptional({ example: 'UPI', default: 'UPI', description: 'Mode of payment (UPI, CASH, BANK_TRANSFER)' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  paymentMode?: string = 'UPI';

  @ApiPropertyOptional({ enum: BookingStatus, default: BookingStatus.CONFIRMED })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus = BookingStatus.CONFIRMED;

  @ApiPropertyOptional({ example: 'Advance token received for Bed 101-A' })
  @IsOptional()
  @IsString()
  notes?: string;
}
