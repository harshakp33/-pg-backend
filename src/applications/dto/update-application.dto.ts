import { ApiPropertyOptional } from '@nestjs/swagger';
import { EnquirySource, EnquiryStatus, RoomType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateApplicationDto {
  @ApiPropertyOptional({ example: 'Aditya Verma', description: 'Applicant full name' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional({ example: '9876543210', description: 'Contact phone number' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ example: 'aditya@example.com', description: 'Contact email' })
  @IsOptional()
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({ example: '33333333-3333-3333-3333-333333333331', description: 'Target property UUID' })
  @IsOptional()
  @IsUUID('4', { message: 'propertyId must be a valid UUID' })
  propertyId?: string;

  @ApiPropertyOptional({ enum: EnquirySource })
  @IsOptional()
  @IsEnum(EnquirySource)
  source?: EnquirySource;

  @ApiPropertyOptional({ enum: RoomType })
  @IsOptional()
  @IsEnum(RoomType)
  preferredRoomType?: RoomType;

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

  @ApiPropertyOptional({ enum: EnquiryStatus })
  @IsOptional()
  @IsEnum(EnquiryStatus)
  status?: EnquiryStatus;

  @ApiPropertyOptional({ example: '2026-10-10T14:00:00.000Z', description: 'Scheduled site visit' })
  @IsOptional()
  @IsString()
  siteVisitDate?: string;

  @ApiPropertyOptional({ example: 'Updated notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}
