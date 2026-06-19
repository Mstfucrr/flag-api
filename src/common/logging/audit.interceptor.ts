import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, catchError, finalize, throwError } from 'rxjs';
import { writeAuditLog } from './audit.log';

const AUDITED_ROUTES: Array<{ method: string; path: RegExp }> = [
  { method: 'POST', path: /^\/projects\/[^/]+\/flags\/evaluate$/ },
  { method: 'POST', path: /^\/admin\/projects$/ },
  { method: 'DELETE', path: /^\/admin\/projects\/[^/]+$/ },
  { method: 'POST', path: /^\/admin\/projects\/[^/]+\/flags$/ },
  { method: 'PUT', path: /^\/admin\/projects\/[^/]+\/flags\/[^/]+$/ },
  {
    method: 'PATCH',
    path: /^\/admin\/projects\/[^/]+\/flags\/[^/]+\/enabled$/,
  },
  { method: 'DELETE', path: /^\/admin\/projects\/[^/]+\/flags\/[^/]+$/ },
  {
    method: 'POST',
    path: /^\/admin\/projects\/[^/]+\/flags\/[^/]+\/rollback\/\d+$/,
  },
  {
    method: 'POST',
    path: /^\/admin\/projects\/[^/]+\/flags\/runtime-cache\/refresh$/,
  },
];

function requestPath(request: Request): string {
  return (request.originalUrl || request.url || request.path || '/').split(
    '?',
    1,
  )[0];
}

function shouldAudit(method: string, path: string): boolean {
  return AUDITED_ROUTES.some(
    (route) => route.method === method && route.path.test(path),
  );
}

function errorCode(error: unknown, status: number): string {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (response && typeof response === 'object') {
      const value =
        (response as { error?: unknown }).error ??
        (response as { code?: unknown }).code;
      if (typeof value === 'string' && value.trim()) {
        return value.trim().slice(0, 128);
      }
    }
  }
  return `HTTP_${status}`;
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const method = request.method.toUpperCase();
    const path = requestPath(request);

    if (!shouldAudit(method, path)) {
      return next.handle();
    }

    const startedAt = performance.now();
    let outcome: 'success' | 'failure' = 'success';
    let status = response.statusCode;
    let code: string | undefined;

    return next.handle().pipe(
      catchError((error: unknown) => {
        outcome = 'failure';
        status = error instanceof HttpException ? error.getStatus() : 500;
        code = errorCode(error, status);
        return throwError(() => error);
      }),
      finalize(() => {
        try {
          writeAuditLog({
            event_action: 'http.request.completed',
            event_category: 'api',
            event_outcome: outcome,
            http_method: method,
            http_path: path,
            http_status: outcome === 'success' ? response.statusCode : status,
            duration_ms: Math.max(0, Math.round(performance.now() - startedAt)),
            ...(code ? { error_code: code } : {}),
          });
        } catch {
          this.logger.error('Audit log write failed', {
            path,
            method,
          });
        }
      }),
    );
  }
}
