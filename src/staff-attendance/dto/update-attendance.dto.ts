import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { StaffAttendanceStatus } from '@prisma/client';

export class UpdateAttendanceDto {
  @ApiPropertyOptional({
    description: 'Attendance status',
    enum: StaffAttendanceStatus,
  })
  @IsOptional()
  @IsEnum(StaffAttendanceStatus)
  status?: StaffAttendanceStatus;

  @ApiPropertyOptional({
    description: 'Check-in time (HH:mm format)',
    example: '09:15',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'checkInTime must be in HH:mm format',
  })
  checkInTime?: string;

  @ApiPropertyOptional({
    description: 'Check-out time (HH:mm format)',
    example: '18:30',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'checkOutTime must be in HH:mm format',
  })
  checkOutTime?: string;

  @ApiPropertyOptional({
    description: 'Administrative remarks or notes',
    example: 'Late arrival approved by warden',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
