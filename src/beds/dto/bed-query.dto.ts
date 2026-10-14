import { ApiPropertyOptional } from '@nestjs/swagger';
import { BedStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class BedQueryDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Search by bed number' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: BedStatus })
  @IsOptional()
  @IsEnum(BedStatus)
  status?: BedStatus;

  @ApiPropertyOptional({ enum: ['bedNumber', 'monthlyRent', 'createdAt'], default: 'bedNumber' })
  @IsOptional()
  @IsIn(['bedNumber', 'monthlyRent', 'createdAt'])
  sortBy?: string = 'bedNumber';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase() : value))
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'asc';
}
