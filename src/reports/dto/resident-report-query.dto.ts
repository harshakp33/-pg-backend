import { ApiPropertyOptional } from '@nestjs/swagger';
import { ResidentStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { ReportPaginationDto } from './report-pagination.dto';

export class ResidentReportQueryDto extends ReportPaginationDto {
  @ApiPropertyOptional({ enum: ResidentStatus, description: 'Filter by resident status' })
  @IsOptional()
  @IsEnum(ResidentStatus)
  status?: ResidentStatus;
}
