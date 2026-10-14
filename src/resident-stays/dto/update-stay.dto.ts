import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';
import { CreateStayDto } from './create-stay.dto';

export class UpdateStayDto extends PartialType(CreateStayDto) {
  @ApiPropertyOptional({ example: '2027-08-31T00:00:00Z', description: 'Notice given date' })
  @IsOptional()
  @IsDateString()
  noticeDate?: string;

  @ApiPropertyOptional({ example: '2027-09-30T00:00:00Z', description: 'Actual checkout date' })
  @IsOptional()
  @IsDateString()
  checkOutDate?: string;
}
