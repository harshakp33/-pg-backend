import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class StaffCheckOutDto {
  @ApiPropertyOptional({
    description: 'Staff profile UUID (optional for authenticated staff self-service; required for admin)',
    example: 'e403d9e5-2e63-4681-87c4-96a45f18f998',
  })
  @IsOptional()
  @IsUUID()
  staffId?: string;

  @ApiPropertyOptional({
    description: 'Attendance date (YYYY-MM-DD). Defaults to current server date.',
    example: '2026-10-08',
  })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({
    description: 'Check-out time (HH:mm format). Defaults to current server time.',
    example: '18:00',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'checkOutTime must be in HH:mm format (e.g. 18:00)',
  })
  checkOutTime?: string;

  @ApiPropertyOptional({
    description: 'Optional notes on shift handover or tasks completed',
    example: 'Completed corridor sweep and handed over keys',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
