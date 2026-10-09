import { Module } from '@nestjs/common';
import { AccessTokenGuard } from './authorization/access-token.guard';
import { PasswordHasherService } from './password/password-hasher.service';
import { AccessPrincipalService } from './principal/access-principal.service';
import { RoleAssignmentService } from './rbac/role-assignment.service';
import { AccessTokenService } from './token/access-token.service';

@Module({
  providers: [
    PasswordHasherService,
    AccessTokenService,
    AccessPrincipalService,
    AccessTokenGuard,
    RoleAssignmentService,
  ],
  exports: [
    PasswordHasherService,
    AccessTokenService,
    AccessPrincipalService,
    AccessTokenGuard,
    RoleAssignmentService,
  ],
})
export class AuthModule {}
