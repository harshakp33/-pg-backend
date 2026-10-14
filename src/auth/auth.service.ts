import Redis from 'ioredis';
import {
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@Injectable()
export class AuthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuthService.name);
  private redisClient: Redis | null = null;

  // In-memory token revocation blocklist with auto-pruning (development only)
  private readonly revokedAccessTokens = new Map<string, number>();

  async onModuleInit() {
    const isProd = process.env.NODE_ENV === 'production';
    const redisUrl = process.env.REDIS_URL || this.configService?.get<string>('REDIS_URL');

    if (isProd) {
      if (!redisUrl) {
        throw new Error(
          'FATAL DEPLOYMENT BLOCKER: REDIS_URL must be configured in production for distributed access-token revocation. In-memory fallback is strictly prohibited in multi-instance production.',
        );
      }
      await this.initRedisClient(redisUrl, true);
    } else if (redisUrl) {
      await this.initRedisClient(redisUrl, false);
    } else {
      this.logger.log('In-memory token revocation blocklist initialized (Development mode only)');
    }
  }

  async onModuleDestroy() {
    if (this.redisClient) {
      try {
        await this.redisClient.quit();
      } catch {
        this.redisClient.disconnect();
      }
      this.redisClient = null;
    }
  }

  private async initRedisClient(redisUrl: string, isProduction: boolean): Promise<void> {
    try {
      this.redisClient = new Redis(redisUrl, {
        connectTimeout: 5000,
        commandTimeout: 3000,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        lazyConnect: true,
        tls: redisUrl.startsWith('rediss://') ? {} : undefined,
      });

      await this.redisClient.connect();
      await this.redisClient.ping();

      // Active health probe: write, read, delete
      const probeKey = `__redis_probe_${randomUUID()}`;
      await this.redisClient.set(probeKey, '1', 'EX', 10);
      const probeVal = await this.redisClient.get(probeKey);
      await this.redisClient.del(probeKey);

      if (probeVal !== '1') {
        throw new Error('Redis health probe failed: read value mismatch');
      }

      this.logger.log('Redis distributed revocation store verified and ready');
    } catch (err: any) {
      if (isProduction) {
        throw new Error(
          `FATAL DEPLOYMENT BLOCKER: Redis connection or health probe failed: ${err.message}`,
        );
      } else {
        this.logger.warn(
          `Redis connection failed in development (${err.message}). Falling back to local in-memory store.`,
        );
        this.redisClient = null;
      }
    }
  }

  // Testing hook to inject Redis client during multi-instance tests
  setRedisClientForTesting(client: Redis | null): void {
    this.redisClient = client;
  }

  async revokeAccessToken(token: string): Promise<void> {
    if (!token) return;

    let ttlSeconds = 900; // default 15 minutes
    try {
      const decoded: any = this.jwtService.decode(token);
      if (decoded?.exp) {
        const nowSec = Math.floor(Date.now() / 1000);
        ttlSeconds = Math.max(1, decoded.exp - nowSec);
      }
    } catch {
      ttlSeconds = 900;
    }

    const tokenHash = this.hashToken(token);
    const redisKey = `revoked_token:${tokenHash}`;

    if (process.env.NODE_ENV === 'production') {
      if (!this.redisClient || this.redisClient.status !== 'ready') {
        this.logger.error('CRITICAL: Redis client not ready during token revocation');
        throw new Error('Failed to revoke access token: distributed session store unreachable');
      }
      await this.redisClient.set(redisKey, '1', 'EX', ttlSeconds);
      return;
    }

    // Development mode
    if (this.redisClient && this.redisClient.status === 'ready') {
      await this.redisClient.set(redisKey, '1', 'EX', ttlSeconds);
    } else {
      this.revokedAccessTokens.set(tokenHash, Date.now() + ttlSeconds * 1000);
      this.cleanupRevokedTokens();
    }
  }

  async isTokenRevoked(token: string): Promise<boolean> {
    if (!token) return false;
    const tokenHash = this.hashToken(token);
    const redisKey = `revoked_token:${tokenHash}`;

    if (process.env.NODE_ENV === 'production') {
      if (!this.redisClient || this.redisClient.status !== 'ready') {
        this.logger.error('FAIL-CLOSED: Redis client offline during revocation check; rejecting token');
        return true; // Fail closed: reject access
      }
      try {
        const exists = await this.redisClient.exists(redisKey);
        return exists === 1;
      } catch (err: any) {
        this.logger.error(`FAIL-CLOSED: Redis check error (${err.message}); rejecting token`);
        return true; // Fail closed: reject access
      }
    }

    // Development mode
    if (this.redisClient && this.redisClient.status === 'ready') {
      try {
        const exists = await this.redisClient.exists(redisKey);
        return exists === 1;
      } catch (err: any) {
        this.logger.warn(`Redis query error in dev (${err.message}). Checking in-memory.`);
      }
    }

    const exp = this.revokedAccessTokens.get(tokenHash);
    if (!exp) return false;
    if (Date.now() > exp) {
      this.revokedAccessTokens.delete(tokenHash);
      return false;
    }
    return true;
  }

  private cleanupRevokedTokens(): void {
    const now = Date.now();
    for (const [token, exp] of this.revokedAccessTokens.entries()) {
      if (now > exp) {
        this.revokedAccessTokens.delete(token);
      }
    }
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  private generateRawRefreshToken(): string {
    return randomBytes(40).toString('hex');
  }

  private getRefreshTokenExpiry(): Date {
    // 7 days default
    const days = 7;
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  private sanitizeUser(user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
    avatarUrl: string | null;
    isActive: boolean;
    lastLoginAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt ?? null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();

    // Check if user already exists
    const existing = await this.prisma.users.findUnique({
      where: { email },
    });

    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    // Hash password with Argon2id
    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });

    const userId = randomUUID();
    const rawRefreshToken = this.generateRawRefreshToken();
    const tokenHash = this.hashToken(rawRefreshToken);
    const expiresAt = this.getRefreshTokenExpiry();
    const now = new Date();

    // Create user and initial refresh token in a transaction
    const [user] = await this.prisma.$transaction([
      this.prisma.users.create({
        data: {
          id: userId,
          email,
          passwordHash,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          phone: dto.phone.trim(),
          avatarUrl: dto.avatarUrl ?? null,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
      }),
      this.prisma.refresh_tokens.create({
        data: {
          id: randomUUID(),
          userId,
          tokenHash,
          expiresAt,
          isRevoked: false,
          createdAt: now,
        },
      }),
    ]);

    const accessToken = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      tokenVersion: (user as any).tokenVersion ?? 1,
    });

    return {
      user: this.sanitizeUser(user),
      accessToken,
      refreshToken: rawRefreshToken,
    };
  }

  async demoLogin(role: string) {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Demo login is permanently disabled in production environments.');
    }

    const r = (role || 'admin').toLowerCase().trim();
    let email = 'owner@blrstays.com';
    if (r === 'manager') email = 'manager@blrstays.com';
    else if (r === 'accountant') email = 'accountant@blrstays.com';
    else if (r === 'warden' || r === 'staff' || r === 'security' || r === 'maintenance') email = 'staff@blrstays.com';
    else if (r === 'tenant' || r === 'resident') email = 'resident@blrstays.com';
    else email = 'owner@blrstays.com';

    const user = await this.prisma.users.findUnique({
      where: { email },
    });

    if (!user || !user.isActive || user.deletedAt !== null) {
      throw new UnauthorizedException('Demo user account is inactive or not found');
    }

    const rawRefreshToken = this.generateRawRefreshToken();
    const tokenHash = this.hashToken(rawRefreshToken);
    const expiresAt = this.getRefreshTokenExpiry();
    const now = new Date();

    const [updatedUser] = await this.prisma.$transaction([
      this.prisma.users.update({
        where: { id: user.id },
        data: {
          lastLoginAt: now,
          updatedAt: now,
        },
      }),
      this.prisma.refresh_tokens.create({
        data: {
          id: randomUUID(),
          userId: user.id,
          tokenHash,
          expiresAt,
          isRevoked: false,
          createdAt: now,
        },
      }),
    ]);

    const accessToken = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      tokenVersion: (updatedUser as any).tokenVersion ?? 1,
    });

    return {
      user: this.sanitizeUser(updatedUser),
      accessToken,
      refreshToken: rawRefreshToken,
    };
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();

    const user = await this.prisma.users.findUnique({
      where: { email },
    });

    // Constant generic message for security
    const invalidCredentialsMessage = 'Invalid email or password';

    if (!user) {
      throw new UnauthorizedException(invalidCredentialsMessage);
    }

    // Reject inactive or soft-deleted users
    if (!user.isActive || user.deletedAt !== null) {
      throw new UnauthorizedException(invalidCredentialsMessage);
    }

    const isPasswordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException(invalidCredentialsMessage);
    }

    const rawRefreshToken = this.generateRawRefreshToken();
    const tokenHash = this.hashToken(rawRefreshToken);
    const expiresAt = this.getRefreshTokenExpiry();
    const now = new Date();

    // Update lastLoginAt and create new refresh token atomically
    const [updatedUser] = await this.prisma.$transaction([
      this.prisma.users.update({
        where: { id: user.id },
        data: {
          lastLoginAt: now,
          updatedAt: now,
        },
      }),
      this.prisma.refresh_tokens.create({
        data: {
          id: randomUUID(),
          userId: user.id,
          tokenHash,
          expiresAt,
          isRevoked: false,
          createdAt: now,
        },
      }),
    ]);

    const accessToken = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      tokenVersion: (updatedUser as any).tokenVersion ?? 1,
    });

    return {
      user: this.sanitizeUser(updatedUser),
      accessToken,
      refreshToken: rawRefreshToken,
    };
  }

  async refresh(dto: RefreshTokenDto) {
    const tokenHash = this.hashToken(dto.refreshToken);

    const storedToken = await this.prisma.refresh_tokens.findUnique({
      where: { tokenHash },
      include: {
        users: true,
      },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (storedToken.isRevoked) {
      throw new UnauthorizedException('Refresh token is revoked');
    }

    if (storedToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token has expired');
    }

    const user = storedToken.users;
    if (!user || !user.isActive || user.deletedAt !== null) {
      throw new UnauthorizedException('User account is inactive or not found');
    }

    const newRawRefreshToken = this.generateRawRefreshToken();
    const newTokenHash = this.hashToken(newRawRefreshToken);
    const newExpiresAt = this.getRefreshTokenExpiry();
    const now = new Date();

    // Atomically rotate: revoke old token and insert new token
    await this.prisma.$transaction([
      this.prisma.refresh_tokens.update({
        where: { id: storedToken.id },
        data: { isRevoked: true },
      }),
      this.prisma.refresh_tokens.create({
        data: {
          id: randomUUID(),
          userId: user.id,
          tokenHash: newTokenHash,
          expiresAt: newExpiresAt,
          isRevoked: false,
          createdAt: now,
        },
      }),
    ]);

    const accessToken = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      tokenVersion: (user as any).tokenVersion ?? 1,
    });

    return {
      accessToken,
      refreshToken: newRawRefreshToken,
    };
  }

  async logout(dto: RefreshTokenDto) {
    const tokenHash = this.hashToken(dto.refreshToken);

    // Revoke the specific refresh token
    await this.prisma.refresh_tokens.updateMany({
      where: {
        tokenHash,
        isRevoked: false,
      },
      data: {
        isRevoked: true,
      },
    });

    return {
      message: 'Logged out successfully',
    };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
    });

    if (!user || !user.isActive || user.deletedAt !== null) {
      throw new UnauthorizedException('User account is inactive or not found');
    }

    return this.sanitizeUser(user);
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
    });

    if (!user || !user.isActive || user.deletedAt !== null) {
      throw new UnauthorizedException('User account is inactive or not found');
    }

    const isCurrentValid = await argon2.verify(user.passwordHash, dto.currentPassword);
    if (!isCurrentValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    const isSamePassword = await argon2.verify(user.passwordHash, dto.newPassword);
    if (isSamePassword) {
      throw new BadRequestException('New password must be different from current password');
    }

    const newPasswordHash = await argon2.hash(dto.newPassword, {
      type: argon2.argon2id,
    });

    const now = new Date();

    // Atomically update password and revoke ALL refresh tokens for this user
    // Supports tokenVersion increment when migration is applied
    await this.prisma.$transaction([
      this.prisma.users.update({
        where: { id: userId },
        data: {
          passwordHash: newPasswordHash,
          updatedAt: now,
          ...((user as any).tokenVersion !== undefined ? { tokenVersion: { increment: 1 } } : {}),
        },
      }),
      this.prisma.refresh_tokens.updateMany({
        where: {
          userId,
          isRevoked: false,
        },
        data: {
          isRevoked: true,
        },
      }),
    ]);

    return {
      message: 'Password changed successfully. All active sessions have been revoked.',
    };
  }
}
