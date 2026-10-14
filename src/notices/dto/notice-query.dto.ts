import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { NoticeAudience, NoticePriority, NoticeStatus } from '@prisma/client';

export class NoticeQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1, description: 'Page number' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100, description: 'Items per page' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Filter by property UUID', format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  propertyId?: string;

  @ApiPropertyOptional({ enum: NoticeStatus, description: 'Filter by status' })
  @IsOptional()
  @IsEnum(NoticeStatus)
  status?: NoticeStatus;

  @ApiPropertyOptional({ enum: NoticeAudience, description: 'Filter by audience' })
  @IsOptional()
  @IsEnum(NoticeAudience)
  audience?: NoticeAudience;

  @ApiPropertyOptional({ enum: NoticePriority, description: 'Filter by priority' })
  @IsOptional()
  @IsEnum(NoticePriority)
  priority?: NoticePriority;

  @ApiPropertyOptional({ description: 'Filter by pinned state' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  isPinned?: boolean;

  @ApiPropertyOptional({ description: 'Search term matching title or description' })
  @IsOptional()
  @IsString()
  search?: string;
}
