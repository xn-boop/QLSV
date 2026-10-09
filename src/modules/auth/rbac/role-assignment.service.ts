import { Injectable } from '@nestjs/common';
import { ActorType, Prisma, UserStatus } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import {
  ActiveProfileRequiredError,
  LastAdminProtectionError,
  UnknownRoleError,
  UserNotFoundError,
} from './rbac.errors';

export interface ReplaceUserRolesInput {
  actorUserId: string;
  targetUserId: string;
  roleCodes: readonly string[];
  requestId: string;
  reason: string;
}

@Injectable()
export class RoleAssignmentService {
  constructor(private readonly prisma: PrismaService) {}

  async replaceRoles(input: ReplaceUserRolesInput): Promise<void> {
    const requestedCodes = [...new Set(input.roleCodes)].sort();
    await this.prisma.$transaction(
      async (transaction) => {
        const user = await transaction.user.findUnique({
          where: { id: input.targetUserId },
          include: { userRoles: { include: { role: true } } },
        });
        if (!user) throw new UserNotFoundError();

        const requestedRoles = await transaction.role.findMany({
          where: { code: { in: requestedCodes } },
          select: { id: true, code: true },
        });
        const foundCodes = new Set(requestedRoles.map((role) => role.code));
        const unknownCodes = requestedCodes.filter((code) => !foundCodes.has(code));
        if (unknownCodes.length > 0) throw new UnknownRoleError(unknownCodes);

        if (requestedCodes.includes('STUDENT')) {
          const profile = await transaction.student.findFirst({
            where: { userId: user.id, status: 'ACTIVE', deletedAt: null },
            select: { id: true },
          });
          if (!profile) throw new ActiveProfileRequiredError('STUDENT');
        }
        if (requestedCodes.includes('LECTURER')) {
          const profile = await transaction.teacher.findFirst({
            where: { userId: user.id, status: 'ACTIVE', deletedAt: null },
            select: { id: true },
          });
          if (!profile) throw new ActiveProfileRequiredError('LECTURER');
        }

        const currentCodes = user.userRoles.map((userRole) => userRole.role.code).sort();
        if (this.sameCodes(currentCodes, requestedCodes)) return;

        if (currentCodes.includes('ADMIN') && !requestedCodes.includes('ADMIN')) {
          const activeAdminCount = await transaction.user.count({
            where: {
              status: UserStatus.ACTIVE,
              deletedAt: null,
              userRoles: { some: { role: { code: 'ADMIN' } } },
            },
          });
          if (activeAdminCount <= 1) throw new LastAdminProtectionError();
        }

        await transaction.userRole.deleteMany({ where: { userId: user.id } });
        if (requestedRoles.length > 0) {
          await transaction.userRole.createMany({
            data: requestedRoles.map((role) => ({ userId: user.id, roleId: role.id })),
          });
        }
        const updatedUser = await transaction.user.update({
          where: { id: user.id },
          data: { authVersion: { increment: 1 }, version: { increment: 1 } },
          select: { id: true, authVersion: true },
        });
        await transaction.authSession.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: new Date(), revokedReason: 'role_changed' },
        });
        await transaction.auditLog.create({
          data: {
            actorUserId: input.actorUserId,
            actorType: ActorType.USER,
            action: 'user.roles.replaced',
            entityType: 'user',
            entityId: user.id,
            beforeData: { roles: currentCodes },
            afterData: { roles: requestedCodes, authVersion: updatedUser.authVersion },
            reason: input.reason,
            requestId: input.requestId,
          },
        });
        await transaction.outboxEvent.create({
          data: {
            eventType: 'user.roles.changed',
            aggregateId: user.id,
            payload: {
              userId: user.id,
              roles: requestedCodes,
              authVersion: updatedUser.authVersion,
              requestId: input.requestId,
            },
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private sameCodes(left: readonly string[], right: readonly string[]): boolean {
    return left.length === right.length && left.every((code, index) => code === right[index]);
  }
}
