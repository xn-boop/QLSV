import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, UserStatus } from '@prisma/client';
import type { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../src/infrastructure/database/prisma.service';
import { AccessPrincipalService } from '../src/modules/auth/principal/access-principal.service';
import { AuthenticationRequiredError } from '../src/modules/auth/principal/authentication-required.error';
import { AccessTokenService } from '../src/modules/auth/token/access-token.service';
import { testJwtEnvironment } from './jwt-fixtures';

describe('access principal (PostgreSQL integration)', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const tokenService = new AccessTokenService({
    getOrThrow: (name: keyof typeof testJwtEnvironment) => testJwtEnvironment[name],
  } as unknown as ConfigService);
  const service = new AccessPrincipalService(tokenService, prisma as unknown as PrismaService);
  const userIds: string[] = [];
  const roleIds: string[] = [];
  const permissionIds: string[] = [];

  afterAll(async () => {
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.rolePermission.deleteMany({
      where: { OR: [{ roleId: { in: roleIds } }, { permissionId: { in: permissionIds } }] },
    });
    await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await prisma.permission.deleteMany({ where: { id: { in: permissionIds } } });
    await prisma.$disconnect();
  });

  async function createPrincipalFixture() {
    const suffix = randomUUID();
    const email = `principal-${suffix}@example.edu`;
    const user = await prisma.user.create({
      data: { email, emailNormalized: email, status: UserStatus.ACTIVE },
    });
    userIds.push(user.id);
    const role = await prisma.role.create({
      data: { code: `AUTH_${suffix.slice(0, 20)}`, name: 'Principal integration role' },
    });
    roleIds.push(role.id);
    const permission = await prisma.permission.create({
      data: { code: `principal.${suffix}`, description: 'Principal integration permission' },
    });
    permissionIds.push(permission.id);
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    const session = await prisma.authSession.create({
      data: { userId: user.id, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
    });
    return { user, role, permission, session };
  }

  it('re-evaluates role removal immediately although the JWT is still valid (T-20)', async () => {
    const { user, role, permission, session } = await createPrincipalFixture();
    const accessToken = tokenService.issue({
      userId: user.id,
      sessionId: session.id,
      authVersion: user.authVersion,
    }).accessToken;

    await expect(service.resolve(accessToken)).resolves.toMatchObject({
      userId: user.id,
      roles: [role.code],
      permissions: [permission.code],
    });

    await prisma.userRole.delete({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
    });

    await expect(service.resolve(accessToken)).resolves.toMatchObject({
      userId: user.id,
      roles: [],
      permissions: [],
    });
  });

  it('denies a still-signed token after account auth version changes or session revocation', async () => {
    const { user, session } = await createPrincipalFixture();
    const accessToken = tokenService.issue({
      userId: user.id,
      sessionId: session.id,
      authVersion: user.authVersion,
    }).accessToken;

    await prisma.user.update({
      where: { id: user.id },
      data: { authVersion: user.authVersion + 1 },
    });
    await expect(service.resolve(accessToken)).rejects.toBeInstanceOf(AuthenticationRequiredError);

    const currentToken = tokenService.issue({
      userId: user.id,
      sessionId: session.id,
      authVersion: user.authVersion + 1,
    }).accessToken;
    await prisma.authSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date(), revokedReason: 'integration-test' },
    });
    await expect(service.resolve(currentToken)).rejects.toBeInstanceOf(AuthenticationRequiredError);
  });
});
