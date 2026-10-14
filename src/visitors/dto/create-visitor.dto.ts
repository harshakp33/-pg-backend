import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VisitorIdType, VisitorPurpose, VisitorStatus } from '@prisma/client';

export class CreateVisitorDto {
  @ApiProperty({ description: 'Full name of the visitor', maxLength: 150, example: 'Siddharth Rao' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  visitorName: string;

  @ApiProperty({ description: 'Contact phone number of the visitor', maxLength: 20, example: '+919876543210' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phone: string;

  @ApiPropertyOptional({ description: 'Target property UUID', format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  propertyId?: string;

  @ApiPropertyOptional({ description: 'Resident UUID being visited', format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  residentId?: string;

  @ApiPropertyOptional({ enum: VisitorPurpose, default: VisitorPurpose.FRIEND_VISIT, description: 'Purpose of visit' })
  @IsOptional()
  @IsEnum(VisitorPurpose)
  purpose?: VisitorPurpose;

  @ApiPropertyOptional({ enum: VisitorIdType, default: VisitorIdType.AADHAAR, description: 'Identification document type' })
  @IsOptional()
  @IsEnum(VisitorIdType)
  idType?: VisitorIdType;

  @ApiPropertyOptional({ description: 'Government ID number', maxLength: 50, example: 'XXXX-XXXX-1234' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  idNumber?: string;

  @ApiPropertyOptional({ description: 'Vehicle license plate number', maxLength: 30, example: 'KA-01-AB-1234' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  vehicleNumber?: string;

  @ApiPropertyOptional({ description: 'Expected date of visit (YYYY-MM-DD)', example: '2026-10-10' })
  @IsOptional()
  @IsDateString()
  expectedDate?: string;

  @ApiPropertyOptional({ description: 'Additional visit remarks or security notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ enum: VisitorStatus, default: VisitorStatus.EXPECTED, description: 'Visitor status' })
  @IsOptional()
  @IsEnum(VisitorStatus)
  status?: VisitorStatus;
}
