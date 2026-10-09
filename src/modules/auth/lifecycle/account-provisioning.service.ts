import { Injectable } from '@nestjs/common';
import { ActorType, ChallengePurpose, Prisma, UserStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { PasswordHasherService } from '../password/password-hasher.service';
import { ChallengeService, IssuedChallenge } from './challenge.service';
import { AccountUnavailableError, InvalidChallengeError } from './auth.errors';
import { ActiveProfileRequiredError } from '../rbac/rbac.errors';

export interface ProvisionUserInput {
  email: string;
  roleCodes: readonly string[];
  studentId?: string;
  teacherId?: string;
  actorUserId: string;
  requestId?: string;
}

@Injectable()
export class AccountProvisioningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly challenges: ChallengeService,
    private readonly passwords: PasswordHasherService,
  ) {}

  async provision(
    input: ProvisionUserInput,
  ): Promise<{ userId: string; invitation: IssuedChallenge }> {
    const emailNormalized = input.email.trim().toLowerCase();
    const requestId = input.requestId ?? randomUUID();
    const result = await this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.user.findUnique({ where: { emailNormalized } });
        if (existing && existing.deletedAt === null && existing.status !== UserStatus.DISABLED) {
          throw new AccountUnavailableError();
        }
        const user = existing
          ? await tx.user.update({
              where: { id: existing.id },
              data: { email: input.email, status: UserStatus.INVITED, deletedAt: null },
            })
          : await tx.user.create({
              data: { email: input.email, emailNormalized, status: UserStatus.INVITED },
            });
        if (input.studentId)
          await tx.student.update({ where: { id: input.studentId }, data: { userId: user.id } });
        if (input.teacherId)
          await tx.teacher.update({ where: { id: input.teacherId }, data: { userId: user.id } });
        const roles = await tx.role.findMany({
          where: { code: { in: [...new Set(input.roleCodes)] } },
          select: { id: true, code: true },
        });
        if (roles.length !== new Set(input.roleCodes).size) throw new InvalidChallengeError();
        if (input.roleCodes.includes('STUDENT')) {
          const profile = await tx.student.findFirst({
            where: { userId: user.id, status: 'ACTIVE', deletedAt: null },
            select: { id: true },
          });
          if (!profile) throw new ActiveProfileRequiredError('STUDENT');
        }
        if (input.roleCodes.includes('LECTURER')) {
          const profile = await tx.teacher.findFirst({
            where: { userId: user.id, status: 'ACTIVE', deletedAt: null },
            select: { id: true },
          });
          if (!profile) throw new ActiveProfileRequiredError('LECTURER');
        }
        await tx.userRole.deleteMany({ where: { userId: user.id } });
        if (roles.length)
          await tx.userRole.createMany({
            data: roles.map((role) => ({ userId: user.id, roleId: role.id })),
          });
        await tx.auditLog.create({
          data: {
            actorUserId: input.actorUserId,
            actorType: ActorType.USER,
            action: 'user.invited',
            entityType: 'user',
            entityId: user.id,
            afterData: { roles: roles.map((role) => role.code) },
            requestId,
          },
        });
        const challenge = await this.challenges.issueInTransaction(
          tx,
          user.id,
          ChallengePurpose.INVITE,
          24 * 60 * 60 * 1000,
          requestId,
          input.actorUserId,
        );
        return { user, challenge };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return { userId: result.user.id, invitation: result.challenge };
  }

  async acceptInvitation(
    rawToken: string,
    password: string,
    requestId: string = randomUUID(),
  ): Promise<void> {
    const challenge = await this.challenges.consume(rawToken, ChallengePurpose.INVITE);
    const passwordHash = await this.passwords.hash(password);
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: challenge.userId } });
      if (!user || user.status !== UserStatus.INVITED || user.deletedAt)
        throw new InvalidChallengeError();
      const updated = await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          status: UserStatus.ACTIVE,
          emailVerifiedAt: new Date(),
          mustChangePassword: false,
          authVersion: { increment: 1 },
          version: { increment: 1 },
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: updated.id,
          actorType: ActorType.USER,
          action: 'user.invitation.accepted',
          entityType: 'user',
          entityId: updated.id,
          requestId,
        },
      });
    });
  }

  async resendInvitation(
    userId: string,
    actorUserId: string,
    requestId: string,
  ): Promise<IssuedChallenge> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== UserStatus.INVITED || user.deletedAt)
      throw new AccountUnavailableError();
    return this.challenges.issue(
      user.id,
      ChallengePurpose.INVITE,
      24 * 60 * 60 * 1000,
      requestId,
      actorUserId,
    );
  }
}
