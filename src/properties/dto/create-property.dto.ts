import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  GenderType,
  PropertyStatus,
  PropertyType,
} from '@prisma/client';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class CreatePropertyDto {
  @ApiProperty({ example: 'Koramangala Executive Stay', description: 'Name of the PG property' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'KRM-02', description: 'Unique property branch code within organization' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code: string;

  @ApiPropertyOptional({ enum: PropertyType, default: PropertyType.BOYS_PG })
  @IsOptional()
  @IsEnum(PropertyType, { message: 'Invalid propertyType' })
  propertyType?: PropertyType;

  @ApiPropertyOptional({ enum: GenderType, default: GenderType.BOYS })
  @IsOptional()
  @IsEnum(GenderType, { message: 'Invalid genderType' })
  genderType?: GenderType;

  @ApiPropertyOptional({ enum: PropertyStatus, default: PropertyStatus.ACTIVE })
  @IsOptional()
  @IsEnum(PropertyStatus, { message: 'Invalid property status' })
  status?: PropertyStatus;

  @ApiProperty({ example: '#452, 5th Block, 80 Feet Road', description: 'Address line 1' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  addressLine1: string;

  @ApiPropertyOptional({ example: 'Near Sony World Junction', description: 'Address line 2' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  addressLine2?: string;

  @ApiProperty({ example: 'Koramangala', description: 'Area / Neighborhood' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  area: string;

  @ApiPropertyOptional({ example: 'Bengaluru', default: 'Bengaluru' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ example: 'Karnataka', default: 'Karnataka' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @ApiProperty({ example: '560095', description: 'Postal pincode' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  pincode: string;

  @ApiPropertyOptional({ example: 'https://maps.google.com/?q=12.9352,77.6245' })
  @IsOptional()
  @IsString()
  @IsUrl({}, { message: 'googleMapsUrl must be a valid URL' })
  googleMapsUrl?: string;

  @ApiProperty({ example: '+91 98800 11223', description: 'Primary contact phone' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  contactPhone: string;

  @ApiProperty({ example: 'stay.krm@blrluxurystays.in', description: 'Primary contact email' })
  @IsEmail({}, { message: 'Please provide a valid contact email' })
  @IsNotEmpty()
  @MaxLength(255)
  contactEmail: string;

  @ApiPropertyOptional({ example: 'WiFi, AC, Geyser, Power Backup, Daily Housekeeping' })
  @IsOptional()
  @IsString()
  amenities?: string;

  @ApiPropertyOptional({ example: 'No smoking, Gate closes at 10:30 PM' })
  @IsOptional()
  @IsString()
  rules?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
