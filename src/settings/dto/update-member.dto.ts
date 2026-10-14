import { ApiPropertyOptional } from '@nestjs/swagger';
import { MemberStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export class UpdateMemberDto {
  @ApiPropertyOptional({ description: 'Assigned Role UUID' })
  @IsOptional()
  @IsUUID()
  roleId?: string;

  @ApiPropertyOptional({ enum: MemberStatus, description: 'Membership status' })
  @IsOptional()
  @IsEnum(MemberStatus)
  status?: MemberStatus;
}
