import { ActorType, Prisma, PrismaClient, UserStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';

describe('foundation database constraints (integration)', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const createdUserIds: string[] = [];
  const createdRoleIds: string[] = [];
  const createdPermissionIds: string[] = [];

  afterAll(async () => {
    await prisma.userRole.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.rolePermission.deleteMany({
      where: {
        OR: [{ roleId: { in: createdRoleIds } }, { permissionId: { in: createdPermissionIds } }],
      },
    });
    await prisma.auditLog.deleteMany({ where: { actorUserId: { in: createdUserIds } } });
    await prisma.idempotencyRecord.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.authChallenge.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.refreshToken.deleteMany({
      where: { session: { userId: { in: createdUserIds } } },
    });
    await prisma.authSession.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
    await prisma.permission.deleteMany({ where: { id: { in: createdPermissionIds } } });
    await prisma.$disconnect();
  });

  it('persists the user, role, permission and audit relationships', async () => {
    const suffix = randomUUID();
    const user = await prisma.user.create({
      data: {
        email: `admin-${suffix}@example.edu`,
        emailNormalized: `admin-${suffix}@example.edu`,
        status: UserStatus.ACTIVE,
      },
    });
    createdUserIds.push(user.id);
    const role = await prisma.role.create({
      data: { code: `ADMIN_${suffix.slice(0, 20)}`, name: 'Integration Admin' },
    });
    createdRoleIds.push(role.id);
    const permission = await prisma.permission.create({
      data: { code: `test.${suffix}`, description: 'Integration permission' },
    });
    createdPermissionIds.push(permission.id);

    await prisma.$transaction([
      prisma.userRole.create({ data: { userId: user.id, roleId: role.id } }),
      prisma.rolePermission.create({
        data: { roleId: role.id, permissionId: permission.id },
      }),
      prisma.auditLog.create({
        data: {
          actorUserId: user.id,
          actorType: ActorType.USER,
          action: 'integration.foundation.created',
          entityType: 'user',
          entityId: user.id,
          requestId: randomUUID(),
        },
      }),
    ]);

    const result = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { userRoles: { include: { role: { include: { rolePermissions: true } } } } },
    });
    expect(result.userRoles).toHaveLength(1);
    expect(result.userRoles[0]?.role.rolePermissions).toHaveLength(1);
  });

  it('rejects duplicate normalized email even when display casing differs', async () => {
    const suffix = randomUUID();
    const normalized = `student-${suffix}@example.edu`;
    const first = await prisma.user.create({
      data: { email: normalized, emailNormalized: normalized },
    });
    createdUserIds.push(first.id);

    await expect(
      prisma.user.create({
        data: { email: normalized.toUpperCase(), emailNormalized: normalized },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('enforces check constraints that Prisma cannot express', async () => {
    await expect(
      prisma.$executeRaw(
        Prisma.sql`INSERT INTO outbox_events
          (event_type, aggregate_id, payload, attempts)
          VALUES ('invalid', ${randomUUID()}::uuid, '{}'::jsonb, -1)`,
      ),
    ).rejects.toThrow();

    await expect(
      prisma.$executeRaw(
        Prisma.sql`INSERT INTO users (email, email_normalized, updated_at)
          VALUES ('MixedCase@example.edu', 'MixedCase@example.edu', now())`,
      ),
    ).rejects.toThrow();

    const auditEmail = `audit-${randomUUID()}@example.edu`;
    const user = await prisma.user.create({
      data: {
        email: auditEmail,
        emailNormalized: auditEmail,
      },
    });
    createdUserIds.push(user.id);
    await expect(
      prisma.$executeRaw(
        Prisma.sql`INSERT INTO audit_logs
          (actor_user_id, actor_type, action, entity_type, request_id)
          VALUES (${user.id}::uuid, 'system', 'invalid', 'user', ${randomUUID()}::uuid)`,
      ),
    ).rejects.toThrow();
  });
});
