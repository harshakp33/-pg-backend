import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateLeaveDto {
  @ApiPropertyOptional({
    description: 'Updated start date of leave (YYYY-MM-DD)',
    example: '2026-10-21',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Updated end date of leave (YYYY-MM-DD)',
    example: '2026-10-26',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Updated reason for leave',
    example: 'Extended festival visit',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({
    description: 'Updated additional notes',
    example: 'Returning Monday morning directly to office',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({
    description: 'Updated emergency contact phone number',
    example: '+919876543299',
  })
  @IsOptional()
  @IsString()
  emergencyContactPhone?: string;

  @ApiPropertyOptional({
    description: 'Whether to opt out of PG mess meals during leave window',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  optOutMeals?: boolean;
}
