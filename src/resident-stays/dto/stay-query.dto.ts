import { ApiPropertyOptional } from '@nestjs/swagger';
import { ResidentStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class StayQueryDto {
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

  @ApiPropertyOptional({ enum: ResidentStatus })
  @IsOptional()
  @IsEnum(ResidentStatus)
  status?: ResidentStatus;

  @ApiPropertyOptional({ enum: ['checkInDate', 'checkOutDate', 'monthlyRent', 'createdAt'], default: 'checkInDate' })
  @IsOptional()
  @IsIn(['checkInDate', 'checkOutDate', 'monthlyRent', 'createdAt'])
  sortBy?: string = 'checkInDate';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase() : value))
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}
