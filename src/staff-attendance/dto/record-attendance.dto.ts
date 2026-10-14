import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StaffAttendanceStatus } from '@prisma/client';

export class RecordAttendanceDto {
  @ApiProperty({
    description: 'Staff profile UUID',
    example: 'e403d9e5-2e63-4681-87c4-96a45f18f998',
  })
  @IsNotEmpty()
  @IsUUID()
  staffId: string;

  @ApiProperty({
    description: 'Attendance date (YYYY-MM-DD)',
    example: '2026-10-08',
  })
  @IsNotEmpty()
  @IsDateString()
  date: string;

  @ApiPropertyOptional({
    description: 'Attendance status',
    enum: StaffAttendanceStatus,
    default: StaffAttendanceStatus.PRESENT,
  })
  @IsOptional()
  @IsEnum(StaffAttendanceStatus)
  status?: StaffAttendanceStatus;

  @ApiPropertyOptional({
    description: 'Check-in time (HH:mm)',
    example: '09:00',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'checkInTime must be in HH:mm format',
  })
  checkInTime?: string;

  @ApiPropertyOptional({
    description: 'Check-out time (HH:mm)',
    example: '18:00',
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
    example: 'Regular shift attendance marked by manager',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
