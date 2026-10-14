import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateLeaveDto {
  @ApiPropertyOptional({
    description: 'Property UUID (auto-resolved for residents; required for admin creating on behalf)',
    example: '10f6501b-487c-4118-89e7-40bccb670c05',
  })
  @IsOptional()
  @IsUUID()
  propertyId?: string;

  @ApiPropertyOptional({
    description: 'Resident profile UUID (ignored for residents; required for admin creating on behalf)',
    example: 'b0b3b1c3-8c53-402a-bedf-8f2e3f0b45fa',
  })
  @IsOptional()
  @IsUUID()
  residentId?: string;

  @ApiProperty({
    description: 'Start date of leave (YYYY-MM-DD)',
    example: '2026-10-20',
  })
  @IsNotEmpty()
  @IsDateString()
  startDate: string;

  @ApiProperty({
    description: 'End date of leave (YYYY-MM-DD)',
    example: '2026-10-25',
  })
  @IsNotEmpty()
  @IsDateString()
  endDate: string;

  @ApiProperty({
    description: 'Reason for leave application',
    example: 'Visiting family for annual festival',
    maxLength: 500,
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  reason: string;

  @ApiPropertyOptional({
    description: 'Additional notes or remarks',
    example: 'Will return Sunday evening',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({
    description: 'Emergency contact phone number during leave window',
    example: '+919876543210',
  })
  @IsOptional()
  @IsString()
  emergencyContactPhone?: string;

  @ApiPropertyOptional({
    description: 'Whether to opt out of PG mess meals during leave window for mess rebate',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  optOutMeals?: boolean;
}
