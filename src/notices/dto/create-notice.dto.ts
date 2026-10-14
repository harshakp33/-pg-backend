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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NoticeAudience, NoticePriority, NoticeStatus } from '@prisma/client';

export class CreateNoticeDto {
  @ApiProperty({ description: 'Title of the notice', maxLength: 255, example: 'Diwali Celebration & Dinner' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiProperty({ description: 'Detailed description or body of the notice', example: 'Grand Diwali feast hosted in the dining hall at 8:00 PM.' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiPropertyOptional({ description: 'Target property UUID if specific to a property', format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  propertyId?: string;

  @ApiPropertyOptional({ enum: NoticeAudience, default: NoticeAudience.ALL_RESIDENTS, description: 'Audience scope' })
  @IsOptional()
  @IsEnum(NoticeAudience)
  audience?: NoticeAudience;

  @ApiPropertyOptional({ enum: NoticePriority, default: NoticePriority.MEDIUM, description: 'Priority level' })
  @IsOptional()
  @IsEnum(NoticePriority)
  priority?: NoticePriority;

  @ApiPropertyOptional({ description: 'Publish date in ISO format', example: '2026-10-08T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  publishDate?: string;

  @ApiPropertyOptional({ description: 'Expiry date in ISO format', example: '2026-10-15T23:59:59.000Z' })
  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @ApiPropertyOptional({ enum: NoticeStatus, default: NoticeStatus.PUBLISHED, description: 'Notice status' })
  @IsOptional()
  @IsEnum(NoticeStatus)
  status?: NoticeStatus;

  @ApiPropertyOptional({ description: 'Whether the notice is pinned to the top', default: false })
  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;
}
