import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import { Request, Response } from 'express';
import { Logger } from 'pino';
import { QueryFailedError } from 'typeorm';
import { AppLogger } from './logger.service';
import { extractUserId } from './logging.utils';

@Catch()
export class LoggingExceptionFilter extends BaseExceptionFilter {
  private readonly logger: Logger;

  constructor(appLogger: AppLogger, httpAdapterHost: HttpAdapterHost) {
    super(httpAdapterHost.httpAdapter);
    this.logger = appLogger.child({ module: LoggingExceptionFilter.name });
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    
    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
    } else if (exception instanceof QueryFailedError) {
      statusCode = HttpStatus.BAD_REQUEST;
    }

    this.logException(exception, request, response, statusCode);

    if (exception instanceof QueryFailedError) {
      const lowerMessage = exception.message.toLowerCase();
      const isDuplicate = lowerMessage.includes('duplicate');
      const isConstraint = lowerMessage.includes('constraint');

      let message = 'Database error occurred';
      if (isDuplicate) {
        message = 'A resource with this value already exists';
      } else if (isConstraint) {
        message = 'Invalid data provided';
      }

      response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        message,
        error: 'QueryFailedError',
        timestamp: new Date().toISOString(),
        path: request.originalUrl ?? request.url,
      });
      return;
    }

    super.catch(exception, host);
  }

  protected logException(
    exception: unknown,
    request: Request,
    response: Response,
    statusCode: number,
  ) {
    const err =
      exception instanceof Error ? exception : new Error('Unhandled exception');
    const path = request.originalUrl ?? request.url;

    if (response.locals) {
      response.locals.error = {
        name: err.name,
        message: resolveErrorMessage(exception),
      };
    }

    this.logger.error(
      {
        err,
        requestId: (request as any).requestId,
        method: request.method,
        path,
        statusCode,
        userId: extractUserId((request as any).user),
      },
      'Unhandled exception',
    );
  }
}

function resolveErrorMessage(exception: unknown): string {
  if (exception instanceof HttpException) {
    const response = exception.getResponse();

    if (typeof response === 'string') {
      return response;
    }

    if (response && typeof response === 'object') {
      const message = (response as { message?: unknown }).message;
      if (typeof message === 'string') {
        return message;
      }
      if (Array.isArray(message)) {
        return message.join(', ');
      }
    }

    return exception.message;
  }

  if (exception instanceof Error) {
    return exception.message;
  }

  return 'Unhandled exception';
}
