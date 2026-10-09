import { PrismaPg } from '@prisma/adapter-pg';
import { ChallengePurpose, PrismaClient, UserStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../src/infrastructure/database/prisma.service';
import { ChallengeService } from '../src/modules/auth/lifecycle/challenge.service';
import { InvalidChallengeError } from '../src/modules/auth/lifecycle/auth.errors';

describe('auth challenge lifecycle (PostgreSQL integration)', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const service = new ChallengeService(prisma as unknown as PrismaService);
  const userIds: string[] = [];

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { entityId: { in: userIds } } });
    await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: userIds } } });
    await prisma.authChallenge.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('stores only a hash, invalidates resend, and consumes once', async () => {
    const email = `challenge-${randomUUID()}@example.edu`;
    const user = await prisma.user.create({
      data: { email, emailNormalized: email, status: UserStatus.INVITED },
    });
    userIds.push(user.id);
    const first = await service.issue(user.id, ChallengePurpose.INVITE, 60_000, randomUUID());
    const second = await service.issue(user.id, ChallengePurpose.INVITE, 60_000, randomUUID());
    expect(first.rawToken).not.toBe(second.rawToken);
    expect(first.rawToken.length).toBeGreaterThanOrEqual(43);
    expect(await prisma.authChallenge.findUnique({ where: { id: first.id } })).toMatchObject({
      usedAt: expect.any(Date),
    });
    expect(await prisma.authChallenge.findUnique({ where: { id: second.id } })).toMatchObject({
      tokenHash: service.hash(second.rawToken),
    });
    await expect(service.consume(first.rawToken, ChallengePurpose.INVITE)).rejects.toBeInstanceOf(
      InvalidChallengeError,
    );
    await expect(service.consume(second.rawToken, ChallengePurpose.INVITE)).resolves.toMatchObject({
      userId: user.id,
    });
    await expect(service.consume(second.rawToken, ChallengePurpose.INVITE)).rejects.toBeInstanceOf(
      InvalidChallengeError,
    );
  });
});
