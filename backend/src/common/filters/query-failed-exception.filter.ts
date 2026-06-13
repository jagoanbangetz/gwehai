import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { Response } from 'express';

/**
 * Global filter untuk menangkap QueryFailedError dari TypeORM/PostgreSQL.
 * Tanpa filter ini, error yang tidak tertangani bisa bikin process crash
 * dan PM2 restart loop (kayak kasus invalid UUID di admin plans).
 */
@Catch(QueryFailedError)
export class QueryFailedExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(QueryFailedExceptionFilter.name);

  catch(exception: QueryFailedError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    // Log error detail untuk debugging
    this.logger.error(
      `QueryFailed: ${exception.message} — ${request.method} ${request.url}`,
    );

    // Cek apakah ini invalid UUID syntax error dari PostgreSQL
    const pgError = exception as any;
    const isInvalidUUID =
      pgError?.code === '22P02' || // invalid_text_representation
      pgError?.message?.includes('invalid input syntax for type uuid');

    const status = isInvalidUUID
      ? HttpStatus.BAD_REQUEST
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const message = isInvalidUUID
      ? 'Invalid ID format — expected a valid UUID'
      : 'Database query failed';

    response.status(status).json({
      statusCode: status,
      message,
      error: isInvalidUUID ? 'Bad Request' : 'Internal Server Error',
    });
  }
}
