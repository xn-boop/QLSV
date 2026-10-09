import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { RequestWithId } from '../../../common/http/request-context';
import type { AccessPrincipalService } from '../principal/access-principal.service';
import { AccessTokenGuard } from './access-token.guard';

describe('AccessTokenGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() };
  const principals = { resolve: jest.fn() };
  const guard = new AccessTokenGuard(
    reflector as unknown as Reflector,
    principals as unknown as AccessPrincipalService,
  );

  beforeEach(() => jest.clearAllMocks());

  function contextFor(request: Partial<RequestWithId>): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => class Handler {},
      getClass: () => class Controller {},
    } as unknown as ExecutionContext;
  }

  it('attaches the current principal and permits a matching permission', async () => {
    const request = { headers: { authorization: 'Bearer signed-token' } } as Partial<RequestWithId>;
    reflector.getAllAndOverride.mockReturnValue(['users.read']);
    principals.resolve.mockResolvedValue({
      userId: 'user-id',
      sessionId: 'session-id',
      authVersion: 1,
      roles: ['ADMIN'],
      permissions: ['users.read'],
    });

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(principals.resolve).toHaveBeenCalledWith('signed-token');
    expect(request.principal).toMatchObject({ userId: 'user-id', permissions: ['users.read'] });
  });

  it.each([undefined, 'Basic abc', 'Bearer ', 'Bearer first second'])(
    'rejects malformed or missing bearer credentials (%s)',
    async (authorization) => {
      const request = { headers: { authorization } } as Partial<RequestWithId>;

      await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(principals.resolve).not.toHaveBeenCalled();
    },
  );

  it('maps a revoked or invalid principal to 401', async () => {
    const request = { headers: { authorization: 'Bearer signed-token' } } as Partial<RequestWithId>;
    principals.resolve.mockRejectedValue(new Error('revoked'));

    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('denies a resolved principal without every required permission', async () => {
    const request = { headers: { authorization: 'Bearer signed-token' } } as Partial<RequestWithId>;
    reflector.getAllAndOverride.mockReturnValue(['users.read', 'users.write']);
    principals.resolve.mockResolvedValue({
      userId: 'user-id',
      sessionId: 'session-id',
      authVersion: 1,
      roles: ['ADMIN'],
      permissions: ['users.read'],
    });

    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(ForbiddenException);
  });
});
