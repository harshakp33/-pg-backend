import {
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { StaffShift, StaffStatus } from '@prisma/client';

export class UpdateStaffDto {
  @ApiPropertyOptional({
    description: 'Full name of the staff member',
    example: 'Ramesh Kumar',
    maxLength: 150,
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  fullName?: string;

  @ApiPropertyOptional({
    description: 'Staff role / designation',
    example: 'HEAD_WARDEN',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  role?: string;

  @ApiPropertyOptional({
    description: 'Phone number of the staff member',
    example: '+919876543210',
    maxLength: 20,
  })
  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({
    description: 'Email address of the staff member',
    example: 'ramesh.kumar@example.com',
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({
    description: 'Property UUID where the staff member is stationed (null to unassign)',
    example: '10f6501b-487c-4118-89e7-40bccb670c05',
  })
  @IsOptional()
  @IsUUID()
  propertyId?: string;

  @ApiPropertyOptional({
    description: 'User UUID if staff member has system login credentials',
    example: '2f36f7ff-70da-453f-ba38-cd4f90be2035',
  })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({
    description: 'Date of joining (YYYY-MM-DD)',
    example: '2026-01-15',
  })
  @IsOptional()
  @IsString()
  joiningDate?: string;

  @ApiPropertyOptional({
    description: 'Monthly salary in INR',
    example: 20000.0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  salary?: number;

  @ApiPropertyOptional({
    description: 'Staff shift schedule',
    enum: StaffShift,
  })
  @IsOptional()
  @IsEnum(StaffShift)
  shift?: StaffShift;

  @ApiPropertyOptional({
    description: 'Staff employment status',
    enum: StaffStatus,
  })
  @IsOptional()
  @IsEnum(StaffStatus)
  status?: StaffStatus;

  @ApiPropertyOptional({
    description: 'Emergency contact person name',
    example: 'Suresh Kumar',
    maxLength: 150,
  })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  emergencyContactName?: string;

  @ApiPropertyOptional({
    description: 'Emergency contact phone number',
    example: '+919876543211',
    maxLength: 20,
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  emergencyContactPhone?: string;

  @ApiPropertyOptional({
    description: 'Government ID proof number',
    example: 'ABCD1234E',
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  idProofNumber?: string;
}
