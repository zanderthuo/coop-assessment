import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

import { Request, Response } from 'express';

interface ErrorResponse {
  success: boolean;
  statusCode: number;
  message: string | string[];
  timestamp: string;
  path: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(
    HttpExceptionFilter.name,
  );

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();

    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string | string[] =
      'An unexpected error occurred';

    if (exception instanceof HttpException) {
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null &&
        'message' in exceptionResponse
      ) {
        const responseMessage = exceptionResponse.message;

        if (
          typeof responseMessage === 'string' ||
          (
            Array.isArray(responseMessage) &&
            responseMessage.every(
              (item) => typeof item === 'string',
            )
          )
        ) {
          message = responseMessage;
        }
      }
    }

    const path = request.path;

    const logMessage =
      `${request.method} ${path} - HTTP ${status}`;

    // Log server-side errors without exposing details.
    if (status >= 500) {
      this.logger.error(
        logMessage,
        exception instanceof Error
          ? exception.stack
          : undefined,
      );
    } else {
      this.logger.warn(logMessage);
    }

    const errorResponse: ErrorResponse = {
      success: false,
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      path,
    };

    response.status(status).json(errorResponse);
  }
}