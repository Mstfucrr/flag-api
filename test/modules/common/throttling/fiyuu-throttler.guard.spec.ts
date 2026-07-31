import { ExecutionContext, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerLimitDetail, ThrottlerStorage } from '@nestjs/throttler';
import type { Request } from 'express';
import { FiyuuThrottlerGuard, resolveThrottlerTracker } from '../../../../src/common/throttling/fiyuu-throttler.guard';

function base64Url(value: object): string {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function request(overrides: Partial<Request> = {}): Request {
    return {
        headers: {},
        ip: '10.0.0.3',
        socket: { remoteAddress: '10.0.0.4' },
        ...overrides,
    } as unknown as Request;
}

class TestGuard extends FiyuuThrottlerGuard {
    throwStandardException(): Promise<void> {
        return this.throwThrottlingException({} as ExecutionContext, {} as ThrottlerLimitDetail);
    }
}

describe('FiyuuThrottlerGuard', () => {
    it('tracks authenticated JWT requests by subject', () => {
        const token = `${base64Url({ alg: 'none' })}.${base64Url({
            sub: 'user-42',
        })}.signature`;

        expect(resolveThrottlerTracker(request({ headers: { authorization: `Bearer ${token}` } }))).toBe(
            'user:user-42',
        );
    });

    it('uses the required IP fallback order', () => {
        expect(
            resolveThrottlerTracker(
                request({
                    headers: {
                        'x-forwarded-for': '10.0.0.1, 10.0.0.2',
                        'x-real-ip': '10.0.0.9',
                    },
                }),
            ),
        ).toBe('ip:10.0.0.1');

        expect(
            resolveThrottlerTracker(
                request({
                    headers: { 'x-real-ip': '10.0.0.9' },
                }),
            ),
        ).toBe('ip:10.0.0.9');

        expect(resolveThrottlerTracker(request())).toBe('ip:10.0.0.3');
        expect(resolveThrottlerTracker(request({ ip: '', headers: {} }))).toBe('ip:10.0.0.4');
    });

    it('isolates by projectKey when the route is project-scoped, ignoring IP/user', () => {
        const token = `${base64Url({ alg: 'none' })}.${base64Url({
            sub: 'user-42',
        })}.signature`;

        expect(resolveThrottlerTracker(request({ params: { projectKey: 'acme' } } as Partial<Request>))).toBe(
            'project:acme',
        );

        // Same project, different IP/user → same bucket (no cross-pod quota multiplication).
        expect(
            resolveThrottlerTracker(
                request({
                    params: { projectKey: 'acme' },
                    headers: { authorization: `Bearer ${token}` },
                } as Partial<Request>),
            ),
        ).toBe('project:acme');

        // Different project → different bucket.
        expect(resolveThrottlerTracker(request({ params: { projectKey: 'globex' } } as Partial<Request>))).toBe(
            'project:globex',
        );
    });

    it('treats non-JWT bearer tokens as public IP traffic', () => {
        expect(
            resolveThrottlerTracker(
                request({
                    headers: { authorization: 'Bearer shared-api-key' },
                }),
            ),
        ).toBe('ip:10.0.0.3');
    });

    it('throws the standard 429 response body', async () => {
        const guard = new TestGuard([{ ttl: 60_000, limit: 1_000 }], {} as ThrottlerStorage, new Reflector());

        try {
            await guard.throwStandardException();
            fail('Expected throttling exception');
        } catch (error) {
            expect(error).toBeInstanceOf(HttpException);
            const exception = error as HttpException;
            expect(exception.getStatus()).toBe(429);
            expect(exception.getResponse()).toEqual({
                error: 'RATE_LIMIT_EXCEEDED',
                message: 'Rate limit exceeded. Please try again later.',
            });
        }
    });
});
