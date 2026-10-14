import { ApiPropertyOptional } from '@nestjs/swagger';
import { ExpenseCategory } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { ReportDateQueryDto } from './report-date-query.dto';

export enum ExpenseGroupByEnum {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
  CATEGORY = 'category',
}

export class ExpenseReportQueryDto extends ReportDateQueryDto {
  @ApiPropertyOptional({ enum: ExpenseCategory, description: 'Filter by expense category' })
  @IsOptional()
  @IsEnum(ExpenseCategory)
  category?: ExpenseCategory;

  @ApiPropertyOptional({ enum: ExpenseGroupByEnum, description: 'Grouping interval or category' })
  @IsOptional()
  @IsEnum(ExpenseGroupByEnum)
  groupBy?: ExpenseGroupByEnum;
}
