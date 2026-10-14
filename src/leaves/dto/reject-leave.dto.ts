import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RejectLeaveDto {
  @ApiProperty({
    description: 'Reason for declining resident leave application',
    example: 'Pending dues or critical hostel event during specified dates',
    maxLength: 500,
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  rejectionReason: string;
}
