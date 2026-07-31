import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import type { Request } from 'express';

function extractBearer(authorization: unknown): string | null {
  if (typeof authorization !== 'string') {
    return null;
  }
  const m = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return m?.[1]?.trim() ?? null;
}

@Injectable()
export class FlagsApiKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = (this.config.get<string>('flags.apiKey') ?? '').trim();

    const req = context.switchToHttp().getRequest<Request>();
    const token = extractBearer(req.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('Missing or invalid Authorization');
    }

    const a = Buffer.from(token);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Missing or invalid Authorization');
    }
    return true;
  }
}
