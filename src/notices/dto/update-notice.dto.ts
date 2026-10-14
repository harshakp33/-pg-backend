import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { NoticeAudience, NoticePriority, NoticeStatus } from '@prisma/client';

export class UpdateNoticeDto {
  @ApiPropertyOptional({ description: 'Title of the notice', maxLength: 255 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({ description: 'Detailed description or body of the notice' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  description?: string;

  @ApiPropertyOptional({ description: 'Target property UUID if specific to a property', format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  propertyId?: string;

  @ApiPropertyOptional({ enum: NoticeAudience, description: 'Audience scope' })
  @IsOptional()
  @IsEnum(NoticeAudience)
  audience?: NoticeAudience;

  @ApiPropertyOptional({ enum: NoticePriority, description: 'Priority level' })
  @IsOptional()
  @IsEnum(NoticePriority)
  priority?: NoticePriority;

  @ApiPropertyOptional({ description: 'Publish date in ISO format' })
  @IsOptional()
  @IsDateString()
  publishDate?: string;

  @ApiPropertyOptional({ description: 'Expiry date in ISO format' })
  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @ApiPropertyOptional({ enum: NoticeStatus, description: 'Notice status' })
  @IsOptional()
  @IsEnum(NoticeStatus)
  status?: NoticeStatus;

  @ApiPropertyOptional({ description: 'Whether the notice is pinned to the top' })
  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;
}
