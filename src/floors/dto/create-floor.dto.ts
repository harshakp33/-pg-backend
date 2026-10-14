import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateFloorDto {
  @ApiProperty({ example: 1, description: 'Floor number (e.g. 0 for Ground, 1 for First)' })
  @Type(() => Number)
  @IsInt({ message: 'floorNumber must be an integer' })
  @Min(-5, { message: 'floorNumber cannot be less than -5' })
  @Max(200, { message: 'floorNumber cannot be greater than 200' })
  floorNumber: number;

  @ApiProperty({ example: 'First Floor', description: 'Floor name or label' })
  @IsString()
  @IsNotEmpty({ message: 'Floor name is required' })
  @MaxLength(100, { message: 'Floor name cannot exceed 100 characters' })
  name: string;

  @ApiPropertyOptional({ example: 'Boys wing with 8 rooms', description: 'Optional floor description' })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Description cannot exceed 500 characters' })
  description?: string;
}
