import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { VisitorIdType, VisitorPurpose, VisitorStatus } from '@prisma/client';

export class UpdateVisitorDto {
  @ApiPropertyOptional({ description: 'Full name of the visitor', maxLength: 150 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  visitorName?: string;

  @ApiPropertyOptional({ description: 'Contact phone number of the visitor', maxLength: 20 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ enum: VisitorPurpose, description: 'Purpose of visit' })
  @IsOptional()
  @IsEnum(VisitorPurpose)
  purpose?: VisitorPurpose;

  @ApiPropertyOptional({ enum: VisitorIdType, description: 'Identification document type' })
  @IsOptional()
  @IsEnum(VisitorIdType)
  idType?: VisitorIdType;

  @ApiPropertyOptional({ description: 'Government ID number', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  idNumber?: string;

  @ApiPropertyOptional({ description: 'Vehicle license plate number', maxLength: 30 })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  vehicleNumber?: string;

  @ApiPropertyOptional({ description: 'Expected date of visit (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  expectedDate?: string;

  @ApiPropertyOptional({ description: 'Additional visit remarks or security notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ enum: VisitorStatus, description: 'Visitor status' })
  @IsOptional()
  @IsEnum(VisitorStatus)
  status?: VisitorStatus;

  @ApiPropertyOptional({ description: 'Reason for visit rejection if rejected' })
  @IsOptional()
  @IsString()
  rejectionReason?: string;
}
