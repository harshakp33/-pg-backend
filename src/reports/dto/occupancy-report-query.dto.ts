import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';
import { ReportPaginationDto } from './report-pagination.dto';

export class OccupancyReportQueryDto extends ReportPaginationDto {
  @ApiPropertyOptional({ description: 'Start date in ISO format', example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date in ISO format', example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
