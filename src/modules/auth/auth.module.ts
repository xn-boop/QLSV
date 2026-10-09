import { Module } from '@nestjs/common';
import { PasswordHasherService } from './password/password-hasher.service';
import { AccessTokenService } from './token/access-token.service';

@Module({
  providers: [PasswordHasherService, AccessTokenService],
  exports: [PasswordHasherService, AccessTokenService],
})
export class AuthModule {}
