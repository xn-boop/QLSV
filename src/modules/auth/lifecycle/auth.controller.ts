import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsEmail, IsString, MinLength } from 'class-validator';
import type { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import type { RequestWithId } from '../../../common/http/request-context';
import { AccessTokenGuard } from '../authorization/access-token.guard';
import { AuthenticationService } from './authentication.service';
import { AccountProvisioningService } from './account-provisioning.service';

class LoginDto {
  @IsEmail() email!: string;
  @IsString() password!: string;
}
class TokenPasswordDto {
  @IsString() token!: string;
  @IsString() @MinLength(12) password!: string;
}
class ForgotDto {
  @IsEmail() email!: string;
}
class TokenDto {
  @IsString() token!: string;
}
class ResetDto {
  @IsString() token!: string;
  @IsString() @MinLength(12) newPassword!: string;
}

const REFRESH_COOKIE = 'qlsv_refresh';
const CSRF_COOKIE = 'qlsv_csrf';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthenticationService,
    private readonly provisioning: AccountProvisioningService,
    private readonly config: ConfigService,
  ) {}

  @Post('login')
  async login(
    @Body() body: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login(
      body.email,
      body.password,
      request.ip ?? 'unknown',
      request.get('user-agent'),
    );
    this.setRefreshCookie(response, result.refreshToken);
    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      sessionId: result.sessionId,
    };
  }

  @Get('csrf')
  csrf(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    this.assertOrigin(request);
    const token = randomBytes(32).toString('base64url');
    response.cookie(CSRF_COOKIE, token, {
      httpOnly: false,
      secure: true,
      sameSite: 'lax',
      path: '/api/v1/auth',
    });
    return { csrfToken: token };
  }

  @Post('refresh')
  async refresh(
    @Req() request: Request,
    @Headers('x-csrf-token') csrf: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.assertCsrf(request, csrf);
    const result = await this.auth.refresh(this.cookie(request, REFRESH_COOKIE));
    this.setRefreshCookie(response, result.refreshToken);
    return { accessToken: result.accessToken, expiresIn: result.expiresIn };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Headers('x-csrf-token') csrf: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    this.assertCsrf(request, csrf);
    await this.auth.logout(this.cookie(request, REFRESH_COOKIE));
    response.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  async forgot(@Body() body: ForgotDto, @Req() request: RequestWithId) {
    await this.auth.forgotPassword(body.email, request.id);
    return { message: 'If the account exists, recovery instructions will be sent.' };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async reset(@Body() body: ResetDto, @Req() request: RequestWithId): Promise<void> {
    await this.auth.resetPassword(body.token, body.newPassword, request.id);
  }

  @Post('accept-invitation')
  @HttpCode(HttpStatus.NO_CONTENT)
  async accept(@Body() body: TokenPasswordDto, @Req() request: RequestWithId): Promise<void> {
    await this.provisioning.acceptInvitation(body.token, body.password, request.id);
  }

  @Post('logout-all')
  @UseGuards(AccessTokenGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async logoutAll(
    @Req() request: RequestWithId,
    @Headers('x-csrf-token') csrf: string | undefined,
  ): Promise<void> {
    this.assertCsrf(request, csrf);
    await this.auth.logoutAll(request.principal!.userId);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.NO_CONTENT)
  async verifyEmail(@Body() body: TokenDto, @Req() request: RequestWithId): Promise<void> {
    await this.auth.verifyEmail(body.token, request.id);
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.ACCEPTED)
  async resendVerification(@Body() body: ForgotDto, @Req() request: RequestWithId) {
    await this.auth.resendVerification(body.email, request.id);
    return { message: 'If the account exists, verification instructions will be sent.' };
  }

  private cookie(request: Request, name: string): string {
    const header = request.headers.cookie ?? '';
    const match = header
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${name}=`));
    if (!match)
      throw new UnauthorizedException({ code: 'SESSION_EXPIRED', message: 'Session expired' });
    return decodeURIComponent(match.slice(name.length + 1));
  }

  private assertCsrf(request: Request, header: string | undefined): void {
    this.assertOrigin(request);
    const cookie = this.cookie(request, CSRF_COOKIE);
    if (!header || header !== cookie)
      throw new UnauthorizedException({ code: 'CSRF_INVALID', message: 'CSRF validation failed' });
  }

  private assertOrigin(request: Request): void {
    const origin = request.headers.origin;
    if (!origin) return;
    try {
      if (new URL(origin).origin !== new URL(this.config.getOrThrow<string>('JWT_ISSUER')).origin)
        throw new UnauthorizedException({
          code: 'ORIGIN_NOT_ALLOWED',
          message: 'Origin not allowed',
        });
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException({
        code: 'ORIGIN_NOT_ALLOWED',
        message: 'Origin not allowed',
      });
    }
  }

  private setRefreshCookie(response: Response, token: string): void {
    response.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/api/v1/auth',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }
}
