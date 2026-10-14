import { ApiPropertyOptional } from '@nestjs/swagger';
import { MoveInStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpdateMoveInDto {
  @ApiPropertyOptional({ example: 135.2 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  initialMeterReading?: number;

  @ApiPropertyOptional({ example: 15000.0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  securityDepositAmount?: number;

  @ApiPropertyOptional({ example: 15000.0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  depositPaid?: number;

  @ApiPropertyOptional({ example: 9500.0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  firstInvoiceAmount?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  firstInvoicePaid?: boolean;

  @ApiPropertyOptional({ enum: MoveInStatus })
  @IsOptional()
  @IsEnum(MoveInStatus)
  status?: MoveInStatus;

  @ApiPropertyOptional({ example: 'Updated inspection notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}
