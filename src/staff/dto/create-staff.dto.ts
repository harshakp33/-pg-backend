import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StaffShift, StaffStatus } from '@prisma/client';

export class CreateStaffDto {
  @ApiProperty({
    description: 'Full name of the staff member',
    example: 'Ramesh Kumar',
    maxLength: 150,
  })
  @IsNotEmpty()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  fullName: string;

  @ApiProperty({
    description: 'Staff role / designation (e.g. WARDEN, HOUSEKEEPING, SECURITY, MAINTENANCE, CHEF)',
    example: 'WARDEN',
    maxLength: 100,
  })
  @IsNotEmpty()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  role: string;

  @ApiProperty({
    description: 'Phone number of the staff member',
    example: '+919876543210',
    maxLength: 20,
  })
  @IsNotEmpty()
  @IsString()
  @MinLength(5)
  @MaxLength(20)
  phone: string;

  @ApiPropertyOptional({
    description: 'Email address of the staff member',
    example: 'ramesh.kumar@example.com',
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({
    description: 'Property UUID where the staff member is stationed',
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
    example: 18000.0,
    default: 15000.0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  salary?: number;

  @ApiPropertyOptional({
    description: 'Staff shift schedule',
    enum: StaffShift,
    default: StaffShift.MORNING,
  })
  @IsOptional()
  @IsEnum(StaffShift)
  shift?: StaffShift;

  @ApiPropertyOptional({
    description: 'Staff employment status',
    enum: StaffStatus,
    default: StaffStatus.ACTIVE,
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
