import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationStatus } from '@prisma/client';

export class UpdateNotificationDto {
  @ApiPropertyOptional({ enum: NotificationStatus, description: 'Updated notification status' })
  @IsOptional()
  @IsEnum(NotificationStatus)
  status?: NotificationStatus;
}
