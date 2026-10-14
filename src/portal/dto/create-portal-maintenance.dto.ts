import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MaintenanceCategory, MaintenancePriority } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreatePortalMaintenanceDto {
  @ApiProperty({
    example: 'Bathroom tap leaking continuously',
    description: 'Maintenance request title',
    maxLength: 200,
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiProperty({
    example: 'The bathroom washbasin tap has a steady leak even when firmly closed.',
    description: 'Detailed description of the maintenance issue',
  })
  @IsNotEmpty()
  @IsString()
  description: string;

  @ApiPropertyOptional({
    enum: MaintenanceCategory,
    default: MaintenanceCategory.OTHER,
    description: 'Maintenance category',
  })
  @IsOptional()
  @IsEnum(MaintenanceCategory)
  category?: MaintenanceCategory = MaintenanceCategory.OTHER;

  @ApiPropertyOptional({
    enum: MaintenancePriority,
    default: MaintenancePriority.MEDIUM,
    description: 'Priority level',
  })
  @IsOptional()
  @IsEnum(MaintenancePriority)
  priority?: MaintenancePriority = MaintenancePriority.MEDIUM;
}
