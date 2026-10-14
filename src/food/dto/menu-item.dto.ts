import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DayOfWeek, MealType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateDailyMenuItemDto {
  @ApiPropertyOptional({ description: 'Weekly menu UUID (required if not nested)', example: 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d' })
  @IsOptional()
  @IsUUID('4')
  weeklyMenuId?: string;

  @ApiProperty({ enum: DayOfWeek, example: DayOfWeek.MONDAY })
  @IsEnum(DayOfWeek)
  @IsNotEmpty()
  dayOfWeek: DayOfWeek;

  @ApiProperty({ enum: MealType, example: MealType.BREAKFAST })
  @IsEnum(MealType)
  @IsNotEmpty()
  mealType: MealType;

  @ApiProperty({ example: 'Idli Sambar & Chutney', maxLength: 150 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  title: string;

  @ApiProperty({ example: '4 Soft Steamed Idlis, piping hot vegetable sambar, coconut and tomato chutneys, filter coffee' })
  @IsString()
  @IsNotEmpty()
  itemsDescription: string;

  @ApiPropertyOptional({ example: '07:30', default: '07:30', maxLength: 10 })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  startTime?: string = '07:30';

  @ApiPropertyOptional({ example: '09:30', default: '09:30', maxLength: 10 })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  endTime?: string = '09:30';

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isSpecialMeal?: boolean = false;
}

export class UpdateDailyMenuItemDto {
  @ApiPropertyOptional({ enum: DayOfWeek })
  @IsOptional()
  @IsEnum(DayOfWeek)
  dayOfWeek?: DayOfWeek;

  @ApiPropertyOptional({ enum: MealType })
  @IsOptional()
  @IsEnum(MealType)
  mealType?: MealType;

  @ApiPropertyOptional({ maxLength: 150 })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  itemsDescription?: string;

  @ApiPropertyOptional({ maxLength: 10 })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  startTime?: string;

  @ApiPropertyOptional({ maxLength: 10 })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  endTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isSpecialMeal?: boolean;
}

export class DailyMenuItemQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  weeklyMenuId?: string;

  @ApiPropertyOptional({ enum: DayOfWeek })
  @IsOptional()
  @IsEnum(DayOfWeek)
  dayOfWeek?: DayOfWeek;

  @ApiPropertyOptional({ enum: MealType })
  @IsOptional()
  @IsEnum(MealType)
  mealType?: MealType;
}
