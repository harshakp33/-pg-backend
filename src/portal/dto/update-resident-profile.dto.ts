import { ApiPropertyOptional } from '@nestjs/swagger';
import { OccupationType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

export class UpdateResidentProfileDto {
  @ApiPropertyOptional({ example: '+91 98765 43210', description: 'Resident contact phone' })
  @IsOptional()
  @IsString()
  @Matches(/^(\+?[0-9\s-]{8,20})$/, {
    message: 'phone must be a valid international or local phone number',
  })
  phone?: string;

  @ApiPropertyOptional({ example: '+91 98765 43211', description: 'Alternate contact phone' })
  @IsOptional()
  @IsString()
  @Matches(/^(\+?[0-9\s-]{8,20})$/, {
    message: 'alternatePhone must be a valid international or local phone number',
  })
  alternatePhone?: string;

  @ApiPropertyOptional({ example: 'O+', description: 'Blood group' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  bloodGroup?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/avatars/resident.jpg', description: 'Avatar URL' })
  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @ApiPropertyOptional({ example: '#123, 4th Cross, Indiranagar', description: 'Current residence address' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  currentAddress?: string;

  @ApiPropertyOptional({ example: '#45, Main Road, Mysuru', description: 'Permanent hometown address' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  permanentAddress?: string;

  @ApiPropertyOptional({ example: 'Bengaluru', description: 'City' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ example: 'Karnataka', description: 'State' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @ApiPropertyOptional({ example: '560038', description: 'Postal pincode' })
  @IsOptional()
  @IsString()
  @Length(4, 10)
  pincode?: string;

  @ApiPropertyOptional({ example: 'Ramesh Sharma', description: 'Emergency contact full name' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  emergencyContactName?: string;

  @ApiPropertyOptional({ example: 'Father', description: 'Emergency contact relation' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  emergencyContactRelation?: string;

  @ApiPropertyOptional({ example: '+91 99887 76655', description: 'Emergency contact phone number' })
  @IsOptional()
  @IsString()
  @Matches(/^(\+?[0-9\s-]{8,20})$/, {
    message: 'emergencyContactPhone must be a valid phone number',
  })
  emergencyContactPhone?: string;

  @ApiPropertyOptional({ enum: OccupationType, example: OccupationType.EMPLOYED, description: 'Occupation category' })
  @IsOptional()
  @IsEnum(OccupationType)
  occupationType?: OccupationType;

  @ApiPropertyOptional({ example: 'Infosys Ltd', description: 'Employer or College name' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  employerOrCollegeName?: string;

  @ApiPropertyOptional({ example: 'Software Engineer', description: 'Designation or study stream' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  designation?: string;

  @ApiPropertyOptional({ example: 'Electronic City, Bengaluru', description: 'Office or campus address' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  workAddress?: string;
}
