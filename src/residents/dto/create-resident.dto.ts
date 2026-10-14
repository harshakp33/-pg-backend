import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DepositStatus, GenderType, OccupationType, ResidentStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateResidentDto {
  @ApiProperty({ example: 'Rahul Sharma', description: 'Full legal name of the resident' })
  @IsString()
  @IsNotEmpty({ message: 'fullName is required' })
  @MaxLength(150, { message: 'fullName cannot exceed 150 characters' })
  fullName: string;

  @ApiProperty({ example: 'rahul.sharma@example.com', description: 'Primary contact email' })
  @IsEmail({}, { message: 'email must be a valid email address' })
  @IsNotEmpty({ message: 'email is required' })
  @MaxLength(255)
  email: string;

  @ApiProperty({ example: '+91 98765 43210', description: 'Primary phone number' })
  @IsString()
  @IsNotEmpty({ message: 'phone is required' })
  @MaxLength(20)
  phone: string;

  @ApiPropertyOptional({ example: '+91 91234 56789' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  alternatePhone?: string;

  @ApiPropertyOptional({ enum: GenderType, default: GenderType.BOYS })
  @IsOptional()
  @IsEnum(GenderType)
  gender?: GenderType = GenderType.BOYS;

  @ApiPropertyOptional({ example: '1998-05-20', description: 'Date of birth (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ example: 'O+' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  bloodGroup?: string;

  @ApiPropertyOptional({ example: 'https://images.example.com/avatar1.jpg' })
  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @ApiPropertyOptional({ example: '#42, 2nd Main, Indiranagar, Bengaluru' })
  @IsOptional()
  @IsString()
  permanentAddress?: string;

  @ApiPropertyOptional({ example: '#12, PG Flat, Koramangala, Bengaluru' })
  @IsOptional()
  @IsString()
  currentAddress?: string;

  @ApiPropertyOptional({ example: 'Bengaluru' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ example: 'Karnataka' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @ApiPropertyOptional({ example: '560038' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  pincode?: string;

  @ApiPropertyOptional({ example: 'Suresh Sharma', description: 'Emergency contact name' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  emergencyContactName?: string;

  @ApiPropertyOptional({ example: 'Father', description: 'Emergency contact relationship' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  emergencyContactRelation?: string;

  @ApiPropertyOptional({ example: '+91 98450 11223', description: 'Emergency contact phone' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  emergencyContactPhone?: string;

  @ApiPropertyOptional({ enum: OccupationType, default: OccupationType.EMPLOYED })
  @IsOptional()
  @IsEnum(OccupationType)
  occupationType?: OccupationType = OccupationType.EMPLOYED;

  @ApiPropertyOptional({ example: 'Infosys Ltd' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  employerOrCollegeName?: string;

  @ApiPropertyOptional({ example: 'Software Engineer' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  designation?: string;

  @ApiPropertyOptional({ example: 'Electronic City, Bengaluru' })
  @IsOptional()
  @IsString()
  workAddress?: string;

  @ApiPropertyOptional({ example: 'EMP-90214' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  idNumber?: string;

  @ApiPropertyOptional({ enum: ResidentStatus, default: ResidentStatus.ENQUIRY })
  @IsOptional()
  @IsEnum(ResidentStatus)
  status?: ResidentStatus = ResidentStatus.ENQUIRY;

  @ApiPropertyOptional({ example: '2026-10-01T00:00:00Z', description: 'Joining date' })
  @IsOptional()
  @IsDateString()
  joiningDate?: string;

  @ApiPropertyOptional({ example: '2027-09-30T00:00:00Z', description: 'Expected move out' })
  @IsOptional()
  @IsDateString()
  expectedMoveOutDate?: string;

  @ApiPropertyOptional({ example: 8500.0, default: 0.0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  monthlyRent?: number = 0.0;

  @ApiPropertyOptional({ example: 15000.0, default: 0.0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  securityDeposit?: number = 0.0;

  @ApiPropertyOptional({ example: 5000.0, default: 0.0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  depositPaid?: number = 0.0;

  @ApiPropertyOptional({ enum: DepositStatus, default: DepositStatus.PENDING })
  @IsOptional()
  @IsEnum(DepositStatus)
  depositStatus?: DepositStatus = DepositStatus.PENDING;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  foodIncluded?: boolean = true;

  @ApiPropertyOptional({ example: 'Prefers quiet environment' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Optional assigned property ID' })
  @IsOptional()
  @IsUUID()
  propertyId?: string;

  @ApiPropertyOptional({ description: 'Optional assigned floor ID' })
  @IsOptional()
  @IsUUID()
  floorId?: string;

  @ApiPropertyOptional({ description: 'Optional assigned room ID' })
  @IsOptional()
  @IsUUID()
  roomId?: string;

  @ApiPropertyOptional({ description: 'Optional assigned bed ID' })
  @IsOptional()
  @IsUUID()
  bedId?: string;
}
