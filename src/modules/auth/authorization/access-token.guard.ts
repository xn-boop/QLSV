import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { RequestWithId } from '../../../common/http/request-context';
import { AccessPrincipalService } from '../principal/access-principal.service';
import { REQUIRED_PERMISSIONS_KEY } from './required-permissions.decorator';

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly principals: AccessPrincipalService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithId>();
    const accessToken = this.extractBearerToken(request.headers.authorization);
    if (!accessToken) throw this.unauthenticated();

    try {
      request.principal = await this.principals.resolve(accessToken);
    } catch {
      throw this.unauthenticated();
    }

    const requiredPermissions =
      this.reflector.getAllAndOverride<readonly string[]>(REQUIRED_PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    const grantedPermissions = new Set(request.principal.permissions);
    if (requiredPermissions.some((permission) => !grantedPermissions.has(permission))) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Insufficient permission',
      });
    }

    return true;
  }

  private extractBearerToken(authorization: string | undefined): string | undefined {
    if (!authorization) return undefined;
    const match = /^Bearer ([^\s]+)$/i.exec(authorization);
    return match?.[1];
  }

  private unauthenticated(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'UNAUTHENTICATED',
      message: 'Authentication is required',
    });
  }
}
