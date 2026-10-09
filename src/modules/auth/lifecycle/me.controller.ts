import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import type { RequestWithId } from '../../../common/http/request-context';
import { AccessTokenGuard } from '../authorization/access-token.guard';
import { AuthenticationService } from './authentication.service';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

class ChangePasswordDto {
  @IsString() currentPassword!: string;
  @IsString() @MinLength(12) newPassword!: string;
}

@Controller('me')
@UseGuards(AccessTokenGuard)
export class MeController {
  constructor(
    private readonly auth: AuthenticationService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async self(@Req() request: RequestWithId) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: request.principal!.userId },
      select: {
        id: true,
        email: true,
        status: true,
        emailVerifiedAt: true,
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
        student: { select: { id: true } },
        teacher: { select: { id: true } },
      },
    });
    const permissions = [
      ...new Set(
        user.userRoles.flatMap((item) =>
          item.role.rolePermissions.map((item) => item.permission.code),
        ),
      ),
    ].sort();
    return {
      id: user.id,
      email: user.email,
      status: user.status,
      emailVerifiedAt: user.emailVerifiedAt,
      roles: user.userRoles.map((item) => item.role.code).sort(),
      permissions,
      studentId: user.student?.id ?? null,
      teacherId: user.teacher?.id ?? null,
    };
  }

  @Put('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @Body() body: ChangePasswordDto,
    @Req() request: RequestWithId,
  ): Promise<void> {
    await this.auth.changePassword(
      request.principal!.userId,
      body.currentPassword,
      body.newPassword,
      request.id,
    );
  }

  @Get('sessions')
  async sessions(@Req() request: RequestWithId) {
    return this.auth.listSessions(request.principal!.userId);
  }

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeSession(
    @Req() request: RequestWithId,
    @Param('id') sessionId: string,
  ): Promise<void> {
    await this.auth.revokeSession(request.principal!.userId, sessionId);
  }
}
