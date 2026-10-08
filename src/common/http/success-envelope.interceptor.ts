import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import type { RequestWithId } from './request-context';

export interface SuccessEnvelope<T> {
  success: true;
  data: T;
  meta: { requestId: string };
}

@Injectable()
export class SuccessEnvelopeInterceptor<T> implements NestInterceptor<T, SuccessEnvelope<T>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<SuccessEnvelope<T>> {
    const request = context.switchToHttp().getRequest<RequestWithId>();

    return next.handle().pipe(
      map((data) => ({
        success: true as const,
        data,
        meta: { requestId: request.id },
      })),
    );
  }
}
