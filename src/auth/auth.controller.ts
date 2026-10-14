import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  ForbiddenException,
  Logger,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { ExtractJwt } from 'passport-jwt';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from './decorators/current-user.decorator';

function getCookieOptions(maxAgeMs: number, httpOnly = true) {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly,
    secure: isProduction,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeMs,
  };
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  constructor(private readonly authService: AuthService) {}

  private setAuthCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
  ) {
    // 1. Access token cookie (15m, HttpOnly)
    res.cookie('pg_access_token', accessToken, getCookieOptions(15 * 60 * 1000, true));

    // 2. Refresh token cookie (7 days, HttpOnly)
    res.cookie('pg_refresh_token', refreshToken, getCookieOptions(7 * 24 * 60 * 60 * 1000, true));

    // 3. CSRF double-submit token cookie (7 days, readable by JavaScript)
    const csrfToken = randomBytes(24).toString('hex');
    res.cookie('pg_csrf_token', csrfToken, getCookieOptions(7 * 24 * 60 * 60 * 1000, false));
  }

  private clearAuthCookies(res: Response) {
    const isProduction = process.env.NODE_ENV === 'production';
    const clearOpts = {
      path: '/',
      sameSite: 'lax' as const,
      secure: isProduction,
    };
    res.clearCookie('pg_access_token', { ...clearOpts, httpOnly: true });
    res.clearCookie('pg_refresh_token', { ...clearOpts, httpOnly: true });
    res.clearCookie('pg_csrf_token', { ...clearOpts, httpOnly: false });
  }

  @Post('register')
  @ApiOperation({ summary: 'Register a new user account' })
  @ApiResponse({ status: 201, description: 'User registered successfully with tokens' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(dto);
    this.setAuthCookies(res, result.accessToken, result.refreshToken);
    return result;
  }

  
  @Post('demo-login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '1-Click demo authentication (Development mode only)' })
  @ApiResponse({ status: 200, description: 'Authenticated successfully' })
  @ApiResponse({ status: 403, description: 'Demo login is disabled in production' })
  async demoLogin(
    @Body() dto: { role: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Demo login is permanently disabled in production environments.');
    }
    const result = await this.authService.demoLogin(dto?.role || 'admin');
    this.setAuthCookies(res, result.accessToken, result.refreshToken);
    return result;
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate user with email and password' })
  @ApiResponse({ status: 200, description: 'Login successful with access and refresh tokens' })
  @ApiResponse({ status: 401, description: 'Invalid email or password' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);
    this.setAuthCookies(res, result.accessToken, result.refreshToken);
    return result;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate refresh token and issue new access token' })
  @ApiResponse({ status: 200, description: 'Tokens refreshed successfully' })
  @ApiResponse({ status: 401, description: 'Invalid, revoked, or expired refresh token' })
  async refresh(
    @Req() req: Request,
    @Body() dto: Partial<RefreshTokenDto>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = dto.refreshToken || req.cookies?.['pg_refresh_token'];
    if (!token) {
      throw new UnauthorizedException('Refresh token is required');
    }

    const result = await this.authService.refresh({ refreshToken: token });
    this.setAuthCookies(res, result.accessToken, result.refreshToken);
    return result;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke refresh token and log out user' })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  async logout(
    @Req() req: Request,
    @Body() dto: Partial<RefreshTokenDto>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawRefreshToken = dto.refreshToken || req.cookies?.['pg_refresh_token'];

    // Invalidate access token immediately in blocklist
    const rawAccessToken =
      ExtractJwt.fromAuthHeaderAsBearerToken()(req) ||
      req.cookies?.['pg_access_token'];

    let distributedRevoked = false;
    if (rawAccessToken) {
      try {
        await this.authService.revokeAccessToken(rawAccessToken);
        distributedRevoked = true;
      } catch (err: any) {
        this.logger.warn(
          `Failed to register access token in distributed revocation store during logout: ${err.message}. Database refresh session and cookies will still be revoked.`,
        );
      }
    }

    if (rawRefreshToken) {
      await this.authService.logout({ refreshToken: rawRefreshToken }).catch((err: any) => {
        this.logger.error(
          `Failed to revoke refresh token in database during logout: ${err.message}`,
        );
      });
    }

    this.clearAuthCookies(res);

    if (rawAccessToken && !distributedRevoked) {
      return {
        message:
          'Logged out successfully. Refresh session revoked in database; distributed token cache unavailable.',
        distributedRevoked: false,
      };
    }

    return {
      message: 'Logged out successfully',
      distributedRevoked: true,
    };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  @ApiResponse({ status: 200, description: 'Current user profile details' })
  @ApiResponse({ status: 401, description: 'Unauthorized / invalid token' })
  async getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getProfile(user.id);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Change user password and revoke all active refresh tokens' })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  @ApiResponse({ status: 400, description: 'Current password invalid or validation failure' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawAccessToken =
      ExtractJwt.fromAuthHeaderAsBearerToken()(req) ||
      req.cookies?.['pg_access_token'];

    let distributedRevoked = false;
    if (rawAccessToken) {
      try {
        await this.authService.revokeAccessToken(rawAccessToken);
        distributedRevoked = true;
      } catch (err: any) {
        this.logger.warn(
          `Failed to register access token in distributed revocation store during password change for user ${user.id}: ${err.message}. Database refresh sessions will still be revoked.`,
        );
      }
    }

    const result = await this.authService.changePassword(user.id, dto);
    this.clearAuthCookies(res);

    if (rawAccessToken && !distributedRevoked) {
      return {
        message:
          'Password changed successfully. All refresh sessions revoked; active token cache was unavailable.',
        distributedRevoked: false,
      };
    }

    return {
      ...result,
      distributedRevoked: true,
    };
  }
}
