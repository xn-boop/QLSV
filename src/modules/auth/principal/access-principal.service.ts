import { Injectable } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { AccessTokenService } from '../token/access-token.service';
import { AuthenticationRequiredError } from './authentication-required.error';

export interface AccessPrincipal {
  userId: string;
  sessionId: string;
  authVersion: number;
  roles: readonly string[];
  permissions: readonly string[];
}

@Injectable()
export class AccessPrincipalService {
  constructor(
    private readonly accessTokens: AccessTokenService,
    private readonly prisma: PrismaService,
  ) {}

  async resolve(accessToken: string): Promise<AccessPrincipal> {
    const claims = this.accessTokens.verify(accessToken);
    const session = await this.prisma.authSession.findFirst({
      where: {
        id: claims.sessionId,
        userId: claims.userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: {
          status: UserStatus.ACTIVE,
          deletedAt: null,
          authVersion: claims.authVersion,
        },
      },
      include: {
        user: {
          select: {
            userRoles: {
              select: {
                role: {
                  select: {
                    code: true,
                    rolePermissions: { select: { permission: { select: { code: true } } } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!session) throw new AuthenticationRequiredError();

    const roles = new Set<string>();
    const permissions = new Set<string>();
    for (const userRole of session.user.userRoles) {
      roles.add(userRole.role.code);
      for (const rolePermission of userRole.role.rolePermissions) {
        permissions.add(rolePermission.permission.code);
      }
    }

    return {
      userId: claims.userId,
      sessionId: claims.sessionId,
      authVersion: claims.authVersion,
      roles: [...roles].sort(),
      permissions: [...permissions].sort(),
    };
  }
}
