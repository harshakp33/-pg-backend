import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { timingSafeEqual } from 'crypto';

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const method = req.method.toUpperCase();

    // 1. Safe read methods do not cause state changes (RFC 7231 / RFC 9110)
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      return true;
    }

    // 2. Unauthenticated onboarding/login endpoints establish initial credentials
    const url = req.originalUrl || req.url || '';
    if (
      url.includes('/auth/login') ||
      url.includes('/auth/register') ||
      url.includes('/auth/demo-login')
    ) {
      return true;
    }

    // 3. For state-changing requests, if ambient authentication cookies are present,
    // enforce the Double Submit Cookie pattern
    const hasAuthCookie = Boolean(
      req.cookies?.['pg_access_token'] || req.cookies?.['pg_refresh_token'],
    );

    if (hasAuthCookie) {
      const rawCsrfCookie = req.cookies?.['pg_csrf_token'];
      const rawCsrfHeader = req.headers['x-csrf-token'];

      // Normalize in case of duplicate headers/cookies
      const csrfHeader = Array.isArray(rawCsrfHeader)
        ? rawCsrfHeader[0]
        : rawCsrfHeader;
      const csrfCookie = Array.isArray(rawCsrfCookie)
        ? rawCsrfCookie[0]
        : rawCsrfCookie;

      if (
        !csrfCookie ||
        !csrfHeader ||
        typeof csrfCookie !== 'string' ||
        typeof csrfHeader !== 'string'
      ) {
        throw new ForbiddenException(
          'CSRF validation failed: Missing or invalid CSRF token',
        );
      }

      const cookieBuf = Buffer.from(csrfCookie);
      const headerBuf = Buffer.from(csrfHeader);

      if (
        cookieBuf.length !== headerBuf.length ||
        !timingSafeEqual(cookieBuf, headerBuf)
      ) {
        throw new ForbiddenException(
          'CSRF validation failed: Missing or mismatched CSRF token',
        );
      }
    }

    return true;
  }
}
