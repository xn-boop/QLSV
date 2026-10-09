import type { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { AccessTokenService } from '../token/access-token.service';
import { AuthenticationRequiredError } from './authentication-required.error';
import { AccessPrincipalService } from './access-principal.service';

describe('AccessPrincipalService', () => {
  const accessTokens = {
    verify: jest
      .fn()
      .mockReturnValue({ userId: 'user-id', sessionId: 'session-id', authVersion: 3 }),
  };
  const prisma = {
    authSession: { findFirst: jest.fn() },
  };
  const service = new AccessPrincipalService(
    accessTokens as unknown as AccessTokenService,
    prisma as unknown as PrismaService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('loads permissions from current database state rather than the JWT', async () => {
    prisma.authSession.findFirst.mockResolvedValue({
      user: {
        userRoles: [
          {
            role: {
              code: 'ADMIN',
              rolePermissions: [{ permission: { code: 'users.read' } }],
            },
          },
          {
            role: {
              code: 'LECTURER',
              rolePermissions: [
                { permission: { code: 'users.read' } },
                { permission: { code: 'grades.write' } },
              ],
            },
          },
        ],
      },
    });

    await expect(service.resolve('access-token')).resolves.toEqual({
      userId: 'user-id',
      sessionId: 'session-id',
      authVersion: 3,
      roles: ['ADMIN', 'LECTURER'],
      permissions: ['grades.write', 'users.read'],
    });
    expect(prisma.authSession.findFirst).toHaveBeenCalledTimes(1);
  });

  it('denies a token whose session, account state or auth version is no longer current', async () => {
    prisma.authSession.findFirst.mockResolvedValue(null);

    await expect(service.resolve('access-token')).rejects.toBeInstanceOf(
      AuthenticationRequiredError,
    );
  });
});
