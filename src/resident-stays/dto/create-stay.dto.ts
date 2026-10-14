import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ResidentStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateStayDto {
  @ApiProperty({ description: 'Property UUID' })
  @IsUUID('4', { message: 'propertyId must be a valid UUID' })
  @IsNotEmpty()
  propertyId: string;

  @ApiPropertyOptional({ description: 'Floor UUID' })
  @IsOptional()
  @IsUUID('4', { message: 'floorId must be a valid UUID' })
  floorId?: string;

  @ApiPropertyOptional({ description: 'Room UUID' })
  @IsOptional()
  @IsUUID('4', { message: 'roomId must be a valid UUID' })
  roomId?: string;

  @ApiPropertyOptional({ description: 'Bed UUID' })
  @IsOptional()
  @IsUUID('4', { message: 'bedId must be a valid UUID' })
  bedId?: string;

  @ApiProperty({ example: '2026-10-01T00:00:00Z', description: 'Check-in date timestamp' })
  @IsDateString({}, { message: 'checkInDate must be a valid ISO date string' })
  @IsNotEmpty()
  checkInDate: string;

  @ApiPropertyOptional({ example: '2027-09-30T00:00:00Z', description: 'Expected check-out date' })
  @IsOptional()
  @IsDateString()
  expectedCheckOutDate?: string;

  @ApiProperty({ example: 8500.0, description: 'Monthly rent agreed for this stay' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  monthlyRent: number;

  @ApiProperty({ example: 15000.0, description: 'Security deposit agreed for this stay' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  securityDeposit: number;

  @ApiPropertyOptional({ enum: ResidentStatus, default: ResidentStatus.ACTIVE })
  @IsOptional()
  @IsEnum(ResidentStatus)
  status?: ResidentStatus = ResidentStatus.ACTIVE;

  @ApiPropertyOptional({ example: 'Room 101 Bed A standard 11-month contract' })
  @IsOptional()
  @IsString()
  notes?: string;
}
