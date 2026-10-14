import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BedStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateBedDto {
  @ApiProperty({ example: '101-A', description: 'Bed number or label' })
  @IsString()
  @IsNotEmpty({ message: 'bedNumber is required' })
  @MaxLength(50, { message: 'bedNumber cannot exceed 50 characters' })
  bedNumber: string;

  @ApiPropertyOptional({ enum: BedStatus, default: BedStatus.AVAILABLE })
  @IsOptional()
  @IsEnum(BedStatus, { message: 'status must be a valid BedStatus enum' })
  status?: BedStatus = BedStatus.AVAILABLE;

  @ApiProperty({ example: 8500.0, description: 'Monthly rent for this bed' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'monthlyRent must be a valid decimal amount' })
  @Min(0, { message: 'monthlyRent cannot be negative' })
  monthlyRent: number;

  @ApiProperty({ example: 15000.0, description: 'Security deposit for this bed' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'deposit must be a valid decimal amount' })
  @Min(0, { message: 'deposit cannot be negative' })
  deposit: number;

  @ApiPropertyOptional({ example: 'Window side bed with study lamp', description: 'Additional bed notes' })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'notes cannot exceed 500 characters' })
  notes?: string;
}
