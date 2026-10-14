import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsOptional, ValidateNested } from 'class-validator';

export class NotificationPreferenceSettingItemDto {
  @ApiProperty({ enum: NotificationType, description: 'Notification category' })
  @IsEnum(NotificationType)
  type: NotificationType;

  @ApiPropertyOptional({ description: 'In-app notification enabled' })
  @IsOptional()
  @IsBoolean()
  inAppEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Email notification enabled' })
  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @ApiPropertyOptional({ description: 'SMS notification enabled' })
  @IsOptional()
  @IsBoolean()
  smsEnabled?: boolean;

  @ApiPropertyOptional({ description: 'WhatsApp notification enabled' })
  @IsOptional()
  @IsBoolean()
  whatsappEnabled?: boolean;
}

export class UpdateSettingsNotificationPreferencesDto {
  @ApiProperty({ type: [NotificationPreferenceSettingItemDto], description: 'List of preferences to update' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NotificationPreferenceSettingItemDto)
  preferences: NotificationPreferenceSettingItemDto[];
}
