import { Module } from '@nestjs/common';
import { AccessTokenGuard } from './authorization/access-token.guard';
import { PasswordHasherService } from './password/password-hasher.service';
import { AccessPrincipalService } from './principal/access-principal.service';
import { RoleAssignmentService } from './rbac/role-assignment.service';
import { AccessTokenService } from './token/access-token.service';
import { AccountProvisioningService } from './lifecycle/account-provisioning.service';
import { ChallengeService } from './lifecycle/challenge.service';
import { AuthenticationService } from './lifecycle/authentication.service';
import { AuthController } from './lifecycle/auth.controller';
import { MeController } from './lifecycle/me.controller';
import { UsersController } from './lifecycle/users.controller';

@Module({
  controllers: [AuthController, MeController, UsersController],
  providers: [
    PasswordHasherService,
    AccessTokenService,
    AccessPrincipalService,
    AccessTokenGuard,
    RoleAssignmentService,
    ChallengeService,
    AccountProvisioningService,
    AuthenticationService,
  ],
  exports: [
    PasswordHasherService,
    AccessTokenService,
    AccessPrincipalService,
    AccessTokenGuard,
    RoleAssignmentService,
    ChallengeService,
    AccountProvisioningService,
    AuthenticationService,
  ],
})
export class AuthModule {}
