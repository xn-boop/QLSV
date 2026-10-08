import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import type { RequestWithId } from './request-context';

interface ErrorDetails {
  fields?: Array<{ field?: string; code: string; message: string }>;
}

interface ErrorBody {
  code?: string;
  message?: string | string[];
  details?: ErrorDetails;
}

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalHttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<RequestWithId>();
    const response = context.getResponse<Response>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = this.getErrorBody(exception);
    const code = body.code ?? this.defaultCode(status);
    const message = this.getMessage(body.message, status);

    if (status >= 500) {
      this.logger.error({
        message: 'Unhandled request error',
        requestId: request.id,
        error: exception instanceof Error ? exception : undefined,
      });
    }

    response.status(status).json({
      success: false,
      error: {
        code,
        message,
        ...(body.details ? { details: body.details } : {}),
      },
      meta: { requestId: request.id },
    });
  }

  private getErrorBody(exception: unknown): ErrorBody {
    if (!(exception instanceof HttpException)) return {};
    const raw = exception.getResponse();
    if (typeof raw === 'string') return { message: raw };

    const body: ErrorBody = {};
    if ('code' in raw && typeof raw.code === 'string') body.code = raw.code;
    if (
      'message' in raw &&
      (typeof raw.message === 'string' ||
        (Array.isArray(raw.message) && raw.message.every((item) => typeof item === 'string')))
    ) {
      body.message = raw.message;
    }
    if ('details' in raw && this.isErrorDetails(raw.details)) body.details = raw.details;
    return body;
  }

  private isErrorDetails(value: unknown): value is ErrorDetails {
    return typeof value === 'object' && value !== null;
  }

  private getMessage(message: string | string[] | undefined, status: number): string {
    if (status >= 500) return 'Internal server error';
    if (Array.isArray(message)) return 'Validation failed';
    return message ?? 'Request failed';
  }

  private defaultCode(status: number): string {
    const codes: Partial<Record<number, string>> = {
      [HttpStatus.BAD_REQUEST]: 'MALFORMED_REQUEST',
      [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
      [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
      [HttpStatus.NOT_FOUND]: 'RESOURCE_NOT_FOUND',
      [HttpStatus.CONFLICT]: 'CONFLICT',
      [HttpStatus.PRECONDITION_FAILED]: 'VERSION_CONFLICT',
      [HttpStatus.UNPROCESSABLE_ENTITY]: 'VALIDATION_FAILED',
      [HttpStatus.PRECONDITION_REQUIRED]: 'PRECONDITION_REQUIRED',
      [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMIT_EXCEEDED',
      [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
    };
    return codes[status] ?? 'INTERNAL_ERROR';
  }
}
