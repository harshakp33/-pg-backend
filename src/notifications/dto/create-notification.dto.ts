import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  NotificationChannel,
  NotificationStatus,
  NotificationType,
} from '@prisma/client';

export class CreateNotificationDto {
  @ApiProperty({ description: 'Target user UUID to receive notification', format: 'uuid' })
  @IsUUID('4')
  @IsNotEmpty()
  userId: string;

  @ApiPropertyOptional({ description: 'Target property UUID if applicable', format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  propertyId?: string;

  @ApiProperty({ enum: NotificationType, description: 'Type of notification' })
  @IsEnum(NotificationType)
  @IsNotEmpty()
  type: NotificationType;

  @ApiPropertyOptional({ enum: NotificationChannel, default: NotificationChannel.IN_APP, description: 'Delivery channel' })
  @IsOptional()
  @IsEnum(NotificationChannel)
  channel?: NotificationChannel;

  @ApiProperty({ description: 'Notification title', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiProperty({ description: 'Notification body text' })
  @IsString()
  @IsNotEmpty()
  body: string;

  @ApiPropertyOptional({ description: 'JSON metadata string' })
  @IsOptional()
  @IsString()
  metadata?: string;

  @ApiPropertyOptional({ enum: NotificationStatus, default: NotificationStatus.SENT })
  @IsOptional()
  @IsEnum(NotificationStatus)
  status?: NotificationStatus;

  @ApiPropertyOptional({ description: 'Unique deduplication key to prevent duplicate delivery' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  deduplicationKey?: string;
}
