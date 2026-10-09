import { HttpException, HttpStatus } from '@nestjs/common';

export class InvalidChallengeError extends HttpException {
  constructor() {
    super(
      { code: 'INVALID_OR_EXPIRED_TOKEN', message: 'Invalid or expired token' },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export class InvalidCredentialsError extends HttpException {
  constructor() {
    super({ code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' }, HttpStatus.UNAUTHORIZED);
  }
}

export class AccountUnavailableError extends HttpException {
  constructor() {
    super({ code: 'ACCOUNT_UNAVAILABLE', message: 'Account unavailable' }, HttpStatus.FORBIDDEN);
  }
}

export class RateLimitUnavailableError extends HttpException {
  constructor() {
    super(
      { code: 'SERVICE_UNAVAILABLE', message: 'Authentication temporarily unavailable' },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
