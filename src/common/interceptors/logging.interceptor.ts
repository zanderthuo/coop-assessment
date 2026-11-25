import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

import { Observable, tap } from 'rxjs';
import { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(
    LoggingInterceptor.name,
  );

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    const httpContext = context.switchToHttp();

    const request = httpContext.getRequest<Request>();
    const response = httpContext.getResponse<Response>();

    const requestId = randomUUID();

    const method = request.method;
    const path = request.path;

    const controller = context.getClass().name;
    const handler = context.getHandler().name;

    const startTime = Date.now();

    // Attach a unique request ID to the response.
    response.setHeader('X-Request-ID', requestId);

    // Log incoming request.
    this.logger.log(
      `[${requestId}] Incoming request: ` +
        `${method} ${path} | ` +
        `Handler: ${controller}.${handler}`,
    );

    return next.handle().pipe(
      tap({
        complete: () => {
          const duration = Date.now() - startTime;

          this.logger.log(
            `[${requestId}] Request completed: ` +
              `${method} ${path} | ` +
              `Status: ${response.statusCode} | ` +
              `Duration: ${duration}ms`,
          );
        },

        error: (error: unknown) => {
          const duration = Date.now() - startTime;

          const status =
            error instanceof HttpException
              ? error.getStatus()
              : HttpStatus.INTERNAL_SERVER_ERROR;

          const logMessage =
            `[${requestId}] Request failed: ` +
            `${method} ${path} | ` +
            `Status: ${status} | ` +
            `Duration: ${duration}ms`;

          if (status >= 500) {
            this.logger.error(logMessage);
          } else {
            this.logger.warn(logMessage);
          }
        },
      }),
    );
  }
}