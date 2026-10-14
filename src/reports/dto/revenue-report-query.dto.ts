import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { ReportDateQueryDto } from './report-date-query.dto';

export enum RevenueGroupByEnum {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
}

export class RevenueReportQueryDto extends ReportDateQueryDto {
  @ApiPropertyOptional({
    enum: RevenueGroupByEnum,
    description: 'Grouping interval (day, week, month)',
    default: RevenueGroupByEnum.MONTH,
  })
  @IsOptional()
  @IsEnum(RevenueGroupByEnum)
  groupBy?: RevenueGroupByEnum = RevenueGroupByEnum.MONTH;
}
