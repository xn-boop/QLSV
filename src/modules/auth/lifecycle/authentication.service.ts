import { Injectable } from '@nestjs/common';
import { ActorType, ChallengePurpose, Prisma, UserStatus } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { RedisService } from '../../../infrastructure/redis/redis.service';
import { PasswordHasherService } from '../password/password-hasher.service';
import { AccessTokenService, IssuedAccessToken } from '../token/access-token.service';
import { ChallengeService } from './challenge.service';
import {
  AccountUnavailableError,
  InvalidChallengeError,
  InvalidCredentialsError,
  RateLimitUnavailableError,
} from './auth.errors';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface LoginResult extends IssuedAccessToken {
  userId: string;
  sessionId: string;
  refreshToken: string;
}

@Injectable()
export class AuthenticationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly passwords: PasswordHasherService,
    private readonly accessTokens: AccessTokenService,
    private readonly challenges: ChallengeService,
  ) {}

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }
  private hashToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  private async enforceRateLimit(key: string): Promise<void> {
    try {
      const count = await this.redis.incr(`auth:rate:${key}`);
      if (count === 1) await this.redis.expire(`auth:rate:${key}`, 60);
      if (count > 10) throw new InvalidCredentialsError();
    } catch (error) {
      if (error instanceof InvalidCredentialsError) throw error;
      throw new RateLimitUnavailableError();
    }
  }

  async login(
    email: string,
    password: string,
    ip = 'unknown',
    userAgent?: string,
  ): Promise<LoginResult> {
    const normalized = this.normalizeEmail(email);
    await this.enforceRateLimit(`${normalized}:${ip}`);
    const user = await this.prisma.user.findUnique({ where: { emailNormalized: normalized } });
    if (!user || !user.passwordHash) throw new InvalidCredentialsError();
    if (user.status !== UserStatus.ACTIVE || user.deletedAt) throw new AccountUnavailableError();
    if (!(await this.passwords.verify(user.passwordHash, password)))
      throw new InvalidCredentialsError();
    const refreshToken = randomBytes(32).toString('base64url');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    const session = await this.prisma.$transaction(async (tx) => {
      const created = await tx.authSession.create({
        data: {
          userId: user.id,
          expiresAt,
          userAgent: userAgent?.slice(0, 512),
          ipHash: this.hashToken(ip).slice(0, 128),
        },
      });
      await tx.refreshToken.create({
        data: { sessionId: created.id, tokenHash: this.hashToken(refreshToken), expiresAt },
      });
      await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: now } });
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          actorType: ActorType.USER,
          action: 'auth.login.succeeded',
          entityType: 'user',
          entityId: user.id,
          requestId: cryptoRandomUuid(),
        },
      });
      return created;
    });
    const access = this.accessTokens.issue({
      userId: user.id,
      sessionId: session.id,
      authVersion: user.authVersion,
    });
    return { ...access, userId: user.id, sessionId: session.id, refreshToken };
  }

  async refresh(rawToken: string): Promise<LoginResult> {
    const tokenHash = this.hashToken(rawToken);
    return this.prisma.$transaction(
      async (tx) => {
        const current = await tx.refreshToken.findUnique({
          where: { tokenHash },
          include: { session: { include: { user: true } } },
        });
        if (!current) throw new InvalidCredentialsError();
        const now = new Date();
        if (
          current.consumedAt ||
          current.revokedAt ||
          current.expiresAt <= now ||
          current.session.revokedAt ||
          current.session.expiresAt <= now
        ) {
          if (current.consumedAt)
            await tx.authSession.update({
              where: { id: current.sessionId },
              data: { revokedAt: now, revokedReason: 'refresh_replay' },
            });
          throw new InvalidCredentialsError();
        }
        if (current.session.user.status !== UserStatus.ACTIVE || current.session.user.deletedAt)
          throw new AccountUnavailableError();
        const nextRaw = randomBytes(32).toString('base64url');
        const next = await tx.refreshToken.create({
          data: {
            sessionId: current.sessionId,
            tokenHash: this.hashToken(nextRaw),
            expiresAt: current.session.expiresAt,
          },
        });
        const consumed = await tx.refreshToken.updateMany({
          where: { id: current.id, consumedAt: null, revokedAt: null },
          data: { consumedAt: now, replacedById: next.id },
        });
        if (consumed.count !== 1) throw new InvalidCredentialsError();
        await tx.authSession.update({
          where: { id: current.sessionId },
          data: { lastUsedAt: now },
        });
        const access = this.accessTokens.issue({
          userId: current.session.user.id,
          sessionId: current.sessionId,
          authVersion: current.session.user.authVersion,
        });
        return {
          ...access,
          userId: current.session.user.id,
          sessionId: current.sessionId,
          refreshToken: nextRaw,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    await this.prisma.$transaction(async (tx) => {
      const token = await tx.refreshToken.findUnique({
        where: { tokenHash: this.hashToken(rawToken) },
      });
      if (!token) return;
      await tx.authSession.updateMany({
        where: { id: token.sessionId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'logout' },
      });
    });
  }

  async logoutAll(userId: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'logout_all' },
    });
  }

  async forgotPassword(email: string, requestId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { emailNormalized: this.normalizeEmail(email) },
    });
    if (!user || user.status === UserStatus.DISABLED || user.deletedAt) return;
    await this.challenges.issue(
      user.id,
      ChallengePurpose.RESET_PASSWORD,
      15 * 60 * 1000,
      requestId,
    );
  }

  async resetPassword(rawToken: string, newPassword: string, requestId: string): Promise<void> {
    const challenge = await this.challenges.consume(rawToken, ChallengePurpose.RESET_PASSWORD);
    const hash = await this.passwords.hash(newPassword);
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: challenge.userId } });
      if (!user || user.deletedAt || user.status === UserStatus.DISABLED)
        throw new InvalidChallengeError();
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash: hash, authVersion: { increment: 1 }, version: { increment: 1 } },
      });
      await tx.authSession.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'password_reset' },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          actorType: ActorType.USER,
          action: 'auth.password.reset',
          entityType: 'user',
          entityId: user.id,
          requestId,
        },
      });
    });
  }

  async verifyEmail(rawToken: string, requestId: string): Promise<void> {
    const challenge = await this.challenges.consume(rawToken, ChallengePurpose.VERIFY_EMAIL);
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: challenge.userId } });
      if (!user || user.deletedAt || user.status === UserStatus.DISABLED)
        throw new InvalidChallengeError();
      await tx.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date(), version: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          actorType: ActorType.USER,
          action: 'auth.email.verified',
          entityType: 'user',
          entityId: user.id,
          requestId,
        },
      });
    });
  }

  async resendVerification(email: string, requestId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { emailNormalized: this.normalizeEmail(email) },
    });
    if (!user || user.deletedAt || user.status !== UserStatus.ACTIVE || user.emailVerifiedAt)
      return;
    await this.challenges.issue(
      user.id,
      ChallengePurpose.VERIFY_EMAIL,
      24 * 60 * 60 * 1000,
      requestId,
    );
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    requestId: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.passwordHash || !(await this.passwords.verify(user.passwordHash, currentPassword)))
      throw new InvalidCredentialsError();
    const hash = await this.passwords.hash(newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash: hash, authVersion: { increment: 1 }, version: { increment: 1 } },
      });
      await tx.authSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'password_changed' },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: userId,
          actorType: ActorType.USER,
          action: 'auth.password.changed',
          entityType: 'user',
          entityId: userId,
          requestId,
        },
      });
    });
  }

  async listSessions(userId: string) {
    return this.prisma.authSession.findMany({
      where: { userId },
      select: {
        id: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
        revokedAt: true,
        revokedReason: true,
        userAgent: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const result = await this.prisma.authSession.updateMany({
      where: { id: sessionId, userId },
      data: { revokedAt: new Date(), revokedReason: 'user_revoked' },
    });
    if (result.count !== 1) throw new InvalidChallengeError();
  }
}

function cryptoRandomUuid(): string {
  return randomBytes(16)
    .toString('hex')
    .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
}
