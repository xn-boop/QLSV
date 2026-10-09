import { Module } from '@nestjs/common';
import { PasswordHasherService } from './password/password-hasher.service';
import { AccessPrincipalService } from './principal/access-principal.service';
import { AccessTokenService } from './token/access-token.service';

@Module({
  providers: [PasswordHasherService, AccessTokenService, AccessPrincipalService],
  exports: [PasswordHasherService, AccessTokenService, AccessPrincipalService],
})
export class AuthModule {}
