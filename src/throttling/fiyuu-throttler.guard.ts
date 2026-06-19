import {
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';
import type { Request } from 'express';

const RATE_LIMIT_MESSAGE = 'Rate limit exceeded. Please try again later.';

function firstHeaderValue(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
}

function jwtSubject(authorization: unknown): string | null {
  if (typeof authorization !== 'string') {
    return null;
  }

  const match = /^Bearer\s+([^.]+\.[^.]+\.[^.]+)$/i.exec(authorization.trim());
  if (!match) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(match[1].split('.')[1], 'base64url').toString('utf8'),
    ) as { sub?: unknown };
    return typeof payload.sub === 'string' && payload.sub.trim()
      ? payload.sub.trim()
      : null;
  } catch {
    return null;
  }
}

export function resolveThrottlerTracker(request: Request): string {
  const subject = jwtSubject(request.headers.authorization);
  if (subject) {
    return `user:${subject}`;
  }

  const forwardedFor = firstHeaderValue(request.headers['x-forwarded-for'])
    .split(',')[0]
    .trim();
  const realIp = firstHeaderValue(request.headers['x-real-ip']);
  const ip =
    forwardedFor ||
    realIp ||
    request.ip ||
    request.socket?.remoteAddress ||
    'unknown';

  return `ip:${ip}`;
}

@Injectable()
export class FiyuuThrottlerGuard extends ThrottlerGuard {
  protected getTracker(request: Request): Promise<string> {
    return Promise.resolve(resolveThrottlerTracker(request));
  }

  protected throwThrottlingException(
    _context: ExecutionContext,
    _detail: ThrottlerLimitDetail,
  ): Promise<void> {
    throw new HttpException(
      {
        error: 'RATE_LIMIT_EXCEEDED',
        message: RATE_LIMIT_MESSAGE,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
