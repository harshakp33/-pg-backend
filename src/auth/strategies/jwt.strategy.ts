import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth.service';

export interface JwtPayload {
  sub: string;
  email: string;
  tokenVersion?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {
    const secret = configService.get<string>('JWT_SECRET') || process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET environment variable is not defined');
    }

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req: Request) => {
          return req?.cookies?.['pg_access_token'] || req?.cookies?.['accessToken'] || null;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: secret,
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload) {
    // Extract raw token to check against immediate revocation blocklist
    const rawToken =
      ExtractJwt.fromAuthHeaderAsBearerToken()(req) ||
      req?.cookies?.['pg_access_token'] ||
      req?.cookies?.['accessToken'];

    if (rawToken) {
      const isRevoked = await this.authService.isTokenRevoked(rawToken);
      if (isRevoked) {
        throw new UnauthorizedException('Token has been revoked');
      }
    }

    if (!payload || !payload.sub) {
      throw new UnauthorizedException('Invalid token payload');
    }

    const user = await this.prisma.users.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
        deletedAt: true,
      },
    });

    if (!user || !user.isActive || user.deletedAt !== null) {
      throw new UnauthorizedException('User account is inactive or not found');
    }

    // Token version validation (durable access-token invalidation)
    const userTokenVersion = (user as any).tokenVersion;
    if (userTokenVersion !== undefined) {
      if (typeof payload.tokenVersion !== 'number' || payload.tokenVersion !== userTokenVersion) {
        throw new UnauthorizedException('Token version has expired or is invalid');
      }
    } else if (payload.tokenVersion !== undefined && typeof payload.tokenVersion !== 'number') {
      throw new UnauthorizedException('Invalid token version format');
    }

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    };
  }
}
