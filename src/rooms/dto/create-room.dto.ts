import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RoomStatus, RoomType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateRoomDto {
  @ApiProperty({ example: '101', description: 'Room number or identifier' })
  @IsString()
  @IsNotEmpty({ message: 'roomNumber is required' })
  @MaxLength(50, { message: 'roomNumber cannot exceed 50 characters' })
  roomNumber: string;

  @ApiPropertyOptional({ enum: RoomType, default: RoomType.DOUBLE })
  @IsOptional()
  @IsEnum(RoomType, { message: 'roomType must be a valid RoomType enum' })
  roomType?: RoomType = RoomType.DOUBLE;

  @ApiPropertyOptional({ example: 2, default: 2, description: 'Bed capacity' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'capacity must be an integer' })
  @Min(1, { message: 'capacity must be at least 1' })
  @Max(20, { message: 'capacity cannot exceed 20' })
  capacity?: number = 2;

  @ApiPropertyOptional({ enum: RoomStatus, default: RoomStatus.AVAILABLE })
  @IsOptional()
  @IsEnum(RoomStatus, { message: 'status must be a valid RoomStatus enum' })
  status?: RoomStatus = RoomStatus.AVAILABLE;

  @ApiProperty({ example: 8500.0, description: 'Base monthly rent per resident' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'baseRent must be a valid decimal amount' })
  @Min(0, { message: 'baseRent cannot be negative' })
  baseRent: number;

  @ApiPropertyOptional({ example: 15000.0, default: 0.0, description: 'Security deposit' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'deposit must be a valid decimal amount' })
  @Min(0, { message: 'deposit cannot be negative' })
  deposit?: number = 0.0;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  hasAttachedBath?: boolean = true;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  hasBalcony?: boolean = false;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  hasAc?: boolean = false;

  @ApiPropertyOptional({ example: 'Wardrobe, Study Table, Fan', description: 'Room amenities' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  amenities?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;
}
