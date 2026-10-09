import { Injectable } from '@nestjs/common';
import { ChallengePurpose, Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { InvalidChallengeError } from './auth.errors';

export interface IssuedChallenge {
  id: string;
  rawToken: string;
  expiresAt: Date;
}

@Injectable()
export class ChallengeService {
  constructor(private readonly prisma: PrismaService) {}

  hash(rawToken: string): string {
    return createHash('sha256').update(rawToken, 'utf8').digest('hex');
  }

  async issue(
    userId: string,
    purpose: ChallengePurpose,
    ttlMs: number,
    requestId: string,
    actorUserId?: string,
  ): Promise<IssuedChallenge> {
    const rawToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + ttlMs);
    return this.prisma.$transaction(
      (tx) =>
        this.issueInTransaction(
          tx,
          userId,
          purpose,
          ttlMs,
          requestId,
          actorUserId,
          rawToken,
          expiresAt,
        ),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async issueInTransaction(
    tx: Prisma.TransactionClient,
    userId: string,
    purpose: ChallengePurpose,
    ttlMs: number,
    requestId: string,
    actorUserId?: string,
    rawToken = randomBytes(32).toString('base64url'),
    expiresAt = new Date(Date.now() + ttlMs),
  ): Promise<IssuedChallenge> {
    await tx.authChallenge.updateMany({
      where: { userId, purpose, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    const created = await tx.authChallenge.create({
      data: { userId, purpose, tokenHash: this.hash(rawToken), expiresAt },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: actorUserId ?? null,
        actorType: actorUserId ? 'USER' : 'SYSTEM',
        action: `auth.${purpose}.issued`,
        entityType: 'user',
        entityId: userId,
        afterData: { challengeId: created.id, purpose, expiresAt: expiresAt.toISOString() },
        requestId,
      },
    });
    await tx.outboxEvent.create({
      data: {
        eventType: `auth.${purpose}.issued`,
        aggregateId: userId,
        payload: { userId, challengeId: created.id, purpose, requestId },
      },
    });
    return { id: created.id, rawToken, expiresAt };
  }

  async consume(
    rawToken: string,
    purpose: ChallengePurpose,
  ): Promise<{ id: string; userId: string }> {
    const tokenHash = this.hash(rawToken);
    return this.prisma.$transaction(async (tx) => {
      const challenge = await tx.authChallenge.findUnique({ where: { tokenHash } });
      if (
        !challenge ||
        challenge.purpose !== purpose ||
        challenge.usedAt ||
        challenge.expiresAt <= new Date()
      ) {
        throw new InvalidChallengeError();
      }
      const consumed = await tx.authChallenge.updateMany({
        where: { id: challenge.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (consumed.count !== 1) throw new InvalidChallengeError();
      return { id: challenge.id, userId: challenge.userId };
    });
  }
}
