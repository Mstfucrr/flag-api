import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { lastValueFrom, of, throwError } from 'rxjs';
import { AuditInterceptor } from './audit.interceptor';

function httpContext(
  method: string,
  originalUrl: string,
  statusCode = 200,
): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () =>
        ({
          method,
          originalUrl,
          headers: {
            authorization: 'Bearer secret',
          },
          body: { email: 'pii@example.com' },
        }) as unknown as Request,
      getResponse: () => ({ statusCode }) as Response,
    }),
  } as unknown as ExecutionContext;
}

describe('AuditInterceptor', () => {
  const stdout = jest
    .spyOn(process.stdout, 'write')
    .mockImplementation(() => true);
  const interceptor = new AuditInterceptor();

  beforeEach(() => {
    stdout.mockClear();
  });

  afterAll(() => {
    stdout.mockRestore();
  });

  it('logs selected method/path pairs without body or token', async () => {
    await lastValueFrom(
      interceptor.intercept(httpContext('POST', '/admin/projects/acme/flags'), {
        handle: () => of({ key: 'flag-1' }),
      } as CallHandler),
    );

    const line = String(stdout.mock.calls[0][0]);
    const doc = JSON.parse(line) as Record<string, unknown>;
    expect(doc).toMatchObject({
      audit: true,
      event_action: 'http.request.completed',
      event_category: 'api',
      event_outcome: 'success',
      http_method: 'POST',
      http_path: '/admin/projects/acme/flags',
      http_status: 200,
    });
    expect(line).not.toContain('secret');
    expect(line).not.toContain('pii@example.com');
  });

  it('does not log routes outside the selected list', async () => {
    await lastValueFrom(
      interceptor.intercept(httpContext('GET', '/health'), {
        handle: () => of({ status: 'ok' }),
      }),
    );

    expect(stdout).not.toHaveBeenCalled();
  });

  it('logs failed audited requests with a safe error code', async () => {
    await expect(
      lastValueFrom(
        interceptor.intercept(httpContext('DELETE', '/admin/projects/acme'), {
          handle: () =>
            throwError(
              () =>
                new HttpException(
                  {
                    error: 'RESOURCE_CONFLICT',
                    message: 'Internal detail',
                  },
                  HttpStatus.CONFLICT,
                ),
            ),
        }),
      ),
    ).rejects.toBeInstanceOf(HttpException);

    expect(JSON.parse(String(stdout.mock.calls[0][0]))).toMatchObject({
      event_outcome: 'failure',
      http_status: 409,
      error_code: 'RESOURCE_CONFLICT',
    });
  });
});
