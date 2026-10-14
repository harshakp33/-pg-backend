import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ComplaintCategory, MaintenancePriority } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreatePortalComplaintDto {
  @ApiPropertyOptional({
    enum: ComplaintCategory,
    default: ComplaintCategory.OTHER,
    description: 'Complaint category',
  })
  @IsOptional()
  @IsEnum(ComplaintCategory)
  category?: ComplaintCategory = ComplaintCategory.OTHER;

  @ApiProperty({
    example: 'AC not cooling properly in room',
    description: 'Complaint subject or summary',
    maxLength: 200,
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  subject: string;

  @ApiProperty({
    example: 'The air conditioner turns on but does not blow cold air since yesterday evening.',
    description: 'Detailed explanation of the problem',
  })
  @IsNotEmpty()
  @IsString()
  description: string;

  @ApiPropertyOptional({
    enum: MaintenancePriority,
    default: MaintenancePriority.MEDIUM,
    description: 'Priority level requested by resident',
  })
  @IsOptional()
  @IsEnum(MaintenancePriority)
  priority?: MaintenancePriority = MaintenancePriority.MEDIUM;
}
