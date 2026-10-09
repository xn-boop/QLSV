import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, UserStatus } from '@prisma/client';
import type { PrismaService } from '../src/infrastructure/database/prisma.service';
import { LastAdminProtectionError } from '../src/modules/auth/rbac/rbac.errors';
import { RoleAssignmentService } from '../src/modules/auth/rbac/role-assignment.service';
import { randomUUID } from 'node:crypto';

describe('role assignment (PostgreSQL integration)', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const service = new RoleAssignmentService(prisma as unknown as PrismaService);
  const userIds: string[] = [];

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { actorUserId: { in: userIds } } });
    await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: userIds } } });
    await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  async function activeUser() {
    const email = `rbac-${randomUUID()}@example.edu`;
    const user = await prisma.user.create({
      data: { email, emailNormalized: email, status: UserStatus.ACTIVE },
    });
    userIds.push(user.id);
    return user;
  }

  async function role(code: 'ADMIN' | 'LECTURER') {
    return prisma.role.findUniqueOrThrow({ where: { code } });
  }

  it('replaces roles atomically, revokes sessions, increments authVersion and writes audit/outbox', async () => {
    const actor = await activeUser();
    const target = await activeUser();
    const admin = await role('ADMIN');
    await prisma.userRole.create({ data: { userId: actor.id, roleId: admin.id } });
    await prisma.authSession.create({
      data: { userId: target.id, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
    });
    const requestId = randomUUID();

    await service.replaceRoles({
      actorUserId: actor.id,
      targetUserId: target.id,
      roleCodes: ['LECTURER'],
      requestId,
      reason: 'integration-test',
    });

    const updated = await prisma.user.findUniqueOrThrow({
      where: { id: target.id },
      include: { userRoles: { include: { role: true } }, sessions: true },
    });
    expect(updated.authVersion).toBe(2);
    expect(updated.userRoles.map((item) => item.role.code)).toEqual(['LECTURER']);
    expect(updated.sessions[0]?.revokedReason).toBe('role_changed');
    await expect(
      prisma.auditLog.findFirstOrThrow({ where: { requestId, action: 'user.roles.replaced' } }),
    ).resolves.toBeDefined();
    await expect(
      prisma.outboxEvent.findFirstOrThrow({
        where: { aggregateId: target.id, eventType: 'user.roles.changed' },
      }),
    ).resolves.toBeDefined();
  });

  it('protects the final active ADMIN and rolls back the attempted removal', async () => {
    const soleAdmin = await activeUser();
    const admin = await role('ADMIN');
    await prisma.userRole.create({ data: { userId: soleAdmin.id, roleId: admin.id } });
    await prisma.user.updateMany({
      where: { id: { in: userIds.filter((id) => id !== soleAdmin.id) } },
      data: { status: UserStatus.DISABLED },
    });

    await expect(
      service.replaceRoles({
        actorUserId: soleAdmin.id,
        targetUserId: soleAdmin.id,
        roleCodes: [],
        requestId: randomUUID(),
        reason: 'must-fail',
      }),
    ).rejects.toBeInstanceOf(LastAdminProtectionError);
    await expect(
      prisma.userRole.findUnique({
        where: { userId_roleId: { userId: soleAdmin.id, roleId: admin.id } },
      }),
    ).resolves.not.toBeNull();
  });
});
