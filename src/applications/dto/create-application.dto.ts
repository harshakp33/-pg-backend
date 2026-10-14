import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EnquirySource, EnquiryStatus, RoomType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateApplicationDto {
  @ApiProperty({ example: 'Aditya Verma', description: 'Applicant full name' })
  @IsString()
  @IsNotEmpty({ message: 'name is required' })
  @MaxLength(150)
  name: string;

  @ApiProperty({ example: '9876543210', description: 'Contact phone number' })
  @IsString()
  @IsNotEmpty({ message: 'phone is required' })
  @MaxLength(20)
  phone: string;

  @ApiPropertyOptional({ example: 'aditya@example.com', description: 'Contact email' })
  @IsOptional()
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({ example: '33333333-3333-3333-3333-333333333331', description: 'Target property UUID' })
  @IsOptional()
  @IsUUID('4', { message: 'propertyId must be a valid UUID' })
  propertyId?: string;

  @ApiPropertyOptional({ enum: EnquirySource, default: EnquirySource.WEBSITE })
  @IsOptional()
  @IsEnum(EnquirySource)
  source?: EnquirySource = EnquirySource.WEBSITE;

  @ApiPropertyOptional({ enum: RoomType, default: RoomType.DOUBLE })
  @IsOptional()
  @IsEnum(RoomType)
  preferredRoomType?: RoomType = RoomType.DOUBLE;

  @ApiPropertyOptional({ example: 8500.0, description: 'Budget in INR' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  budget?: number;

  @ApiPropertyOptional({ example: '2026-10-15', description: 'Expected move-in date' })
  @IsOptional()
  @IsString()
  expectedMoveIn?: string;

  @ApiPropertyOptional({ enum: EnquiryStatus, default: EnquiryStatus.NEW })
  @IsOptional()
  @IsEnum(EnquiryStatus)
  status?: EnquiryStatus = EnquiryStatus.NEW;

  @ApiPropertyOptional({ example: '2026-10-10T14:00:00.000Z', description: 'Scheduled site visit' })
  @IsOptional()
  @IsString()
  siteVisitDate?: string;

  @ApiPropertyOptional({ example: 'Looking for single occupancy room with balcony' })
  @IsOptional()
  @IsString()
  notes?: string;
}
