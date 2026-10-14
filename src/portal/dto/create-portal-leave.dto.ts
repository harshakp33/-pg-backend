import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreatePortalLeaveDto {
  @ApiProperty({ example: '2026-10-20', description: 'Leave start date (YYYY-MM-DD)' })
  @IsNotEmpty()
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2026-10-25', description: 'Leave end date (YYYY-MM-DD)' })
  @IsNotEmpty()
  @IsDateString()
  endDate: string;

  @ApiProperty({
    example: 'Visiting hometown for family celebration',
    description: 'Reason for taking leave',
    maxLength: 500,
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  reason: string;

  @ApiPropertyOptional({ example: 'Will be reachable on phone during daytime', description: 'Additional notes' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({ example: '+91 98765 43210', description: 'Emergency contact phone during leave period' })
  @IsOptional()
  @IsString()
  @Matches(/^(\+?[0-9\s-]{8,20})$/, {
    message: 'emergencyContactPhone must be a valid phone number',
  })
  emergencyContactPhone?: string;

  @ApiPropertyOptional({ example: true, default: true, description: 'Whether meals should be opted out during leave' })
  @IsOptional()
  @IsBoolean()
  optOutMeals?: boolean = true;
}
