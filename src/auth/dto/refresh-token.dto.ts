import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ description: 'Raw refresh token issued during login/refresh' })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
