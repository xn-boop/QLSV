import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { IsArray, IsEmail, IsOptional, IsString, IsUUID } from 'class-validator';
import type { RequestWithId } from '../../../common/http/request-context';
import { AccessTokenGuard } from '../authorization/access-token.guard';
import { RequirePermissions } from '../authorization/required-permissions.decorator';
import { AccountProvisioningService } from './account-provisioning.service';

class ProvisionDto {
  @IsEmail() email!: string;
  @IsArray() @IsString({ each: true }) roleCodes!: string[];
  @IsOptional() @IsUUID() studentId?: string;
  @IsOptional() @IsUUID() teacherId?: string;
}

@Controller('users')
@UseGuards(AccessTokenGuard)
@RequirePermissions('users.manage')
export class UsersController {
  constructor(private readonly provisioning: AccountProvisioningService) {}

  @Post()
  async create(@Body() body: ProvisionDto, @Req() request: RequestWithId) {
    const result = await this.provisioning.provision({
      ...body,
      actorUserId: request.principal!.userId,
      requestId: request.id,
    });
    return { userId: result.userId, invitationExpiresAt: result.invitation.expiresAt };
  }

  @Post(':id/invitations')
  async resend(@Param('id') userId: string, @Req() request: RequestWithId) {
    const invitation = await this.provisioning.resendInvitation(
      userId,
      request.principal!.userId,
      request.id,
    );
    return { invitationExpiresAt: invitation.expiresAt };
  }
}
