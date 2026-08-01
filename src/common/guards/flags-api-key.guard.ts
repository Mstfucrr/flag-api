import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import type { Request } from 'express';

/**
 * Shared by `FlagsSdkController` and `FlagsAdminController` — a static
 * pre-shared secret sent via `X-Api-Key`, deliberately not
 * `Authorization: Bearer` since it isn't a delegated/expiring token.
 */
@Injectable()
export class FlagsApiKeyGuard implements CanActivate {
    constructor(private readonly config: ConfigService) {}

    canActivate(context: ExecutionContext): boolean {
        const expected = (this.config.get<string>('flags.apiKey') ?? '').trim();

        const req = context.switchToHttp().getRequest<Request>();
        const header = req.headers['x-api-key'];
        const token = (Array.isArray(header) ? header[0] : header)?.trim();
        if (!token) {
            throw new UnauthorizedException('Missing or invalid X-Api-Key');
        }

        const a = Buffer.from(token);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
            throw new UnauthorizedException('Missing or invalid X-Api-Key');
        }
        return true;
    }
}
