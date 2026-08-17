import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { BusinessException } from './business.exception';

@Catch()
export class BusinessExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(BusinessExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    if (exception instanceof BusinessException) {
      response.status(exception.statusCode).json({
        success: false,
        code: exception.code,
        message: exception.message,
        retryable: exception.retryable,
      });
    } else if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      let message = exception.message;
      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        if ('message' in exceptionResponse) {
          const msg = (exceptionResponse as any).message;
          message = Array.isArray(msg) ? msg[0] : msg;
        }
      }

      // Convert some standard HTTPErrors to BusinessException format
      const retryable = status >= 500 || status === 401;
      // 401 is retryable after login, 500 is retryable

      let code = 'UNKNOWN_ERROR';
      if (status === 400) code = 'VALIDATION_ERROR';
      else if (status === 401) code = 'UNAUTHORIZED';
      else if (status === 404) code = 'NOT_FOUND';
      else if (status === 409) code = 'CONFLICT';
      else if (status === 413) code = 'PHOTO_TOO_LARGE';
      else if (status === 415) code = 'PHOTO_TYPE_NOT_ALLOWED';
      else if (status >= 500) code = 'INTERNAL_ERROR';

      response.status(status).json({
        success: false,
        code,
        message,
        retryable,
      });
    } else {
      // Excepción no controlada (bug real, error de Prisma, etc.). Sin este log
      // quedaba completamente en silencio: el cliente recibía el 500 pero la
      // consola del servidor no mostraba ningún rastro del error.
      this.logger.error(
        `Unhandled exception on ${request?.method} ${request?.url}: ${
          (exception as any)?.message ?? exception
        }`,
        (exception as any)?.stack,
      );

      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        retryable: true,
      });
    }
  }
}
