import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPrivateKey, createPublicKey, randomBytes, sign, verify } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { sign as signJwt, verify as verifyJwt } from 'jsonwebtoken';
import type { JwtPayload } from 'jsonwebtoken';
import { InvalidAccessTokenError } from './access-token.error';

const ACCESS_TOKEN_TTL_SECONDS = 10 * 60;
const JWT_ALGORITHM = 'RS256';

export interface AccessTokenSubject {
  userId: string;
  sessionId: string;
  authVersion: number;
}

export interface AccessTokenClaims extends AccessTokenSubject {
  iss: string;
  aud: string;
  iat: number;
  exp: number;
  jti: string;
}

export interface IssuedAccessToken {
  accessToken: string;
  expiresIn: typeof ACCESS_TOKEN_TTL_SECONDS;
}

@Injectable()
export class AccessTokenService {
  private readonly privateKey: KeyObject;
  private readonly publicKey: KeyObject;
  private readonly issuer: string;
  private readonly audience: string;

  constructor(config: ConfigService) {
    this.issuer = config.getOrThrow<string>('JWT_ISSUER');
    this.audience = config.getOrThrow<string>('JWT_AUDIENCE');
    this.privateKey = this.loadPrivateKey(config.getOrThrow<string>('JWT_PRIVATE_KEY'));
    this.publicKey = this.loadPublicKey(config.getOrThrow<string>('JWT_PUBLIC_KEY'));
    this.assertKeyPair();
  }

  issue(subject: AccessTokenSubject): IssuedAccessToken {
    this.assertSubject(subject);
    return {
      accessToken: signJwt(
        { sid: subject.sessionId, authVersion: subject.authVersion },
        this.privateKey,
        {
          algorithm: JWT_ALGORITHM,
          subject: subject.userId,
          issuer: this.issuer,
          audience: this.audience,
          expiresIn: ACCESS_TOKEN_TTL_SECONDS,
          jwtid: randomUUID(),
          noTimestamp: false,
        },
      ),
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    };
  }

  verify(accessToken: string): AccessTokenClaims {
    try {
      const payload = verifyJwt(accessToken, this.publicKey, {
        algorithms: [JWT_ALGORITHM],
        issuer: this.issuer,
        audience: this.audience,
      });
      if (typeof payload === 'string') throw new InvalidAccessTokenError();
      return this.toClaims(payload);
    } catch {
      throw new InvalidAccessTokenError();
    }
  }

  private loadPrivateKey(value: string): KeyObject {
    try {
      const key = createPrivateKey(this.normalizePem(value));
      if (
        key.asymmetricKeyType !== 'rsa' ||
        key.asymmetricKeyDetails?.modulusLength === undefined
      ) {
        throw new Error('Invalid JWT private key');
      }
      if (key.asymmetricKeyDetails.modulusLength < 2048) throw new Error('Invalid JWT private key');
      return key;
    } catch {
      throw new Error('Invalid JWT private key configuration');
    }
  }

  private loadPublicKey(value: string): KeyObject {
    try {
      const key = createPublicKey(this.normalizePem(value));
      if (
        key.asymmetricKeyType !== 'rsa' ||
        key.asymmetricKeyDetails?.modulusLength === undefined
      ) {
        throw new Error('Invalid JWT public key');
      }
      if (key.asymmetricKeyDetails.modulusLength < 2048) throw new Error('Invalid JWT public key');
      return key;
    } catch {
      throw new Error('Invalid JWT public key configuration');
    }
  }

  private assertKeyPair(): void {
    const proof = randomBytes(32);
    const signature = sign('RSA-SHA256', proof, this.privateKey);
    if (!verify('RSA-SHA256', proof, this.publicKey, signature)) {
      throw new Error('JWT public and private keys do not match');
    }
  }

  private toClaims(payload: JwtPayload): AccessTokenClaims {
    const authVersion: unknown = payload.authVersion;
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.sid !== 'string' ||
      typeof authVersion !== 'number' ||
      !Number.isSafeInteger(authVersion) ||
      authVersion < 1 ||
      typeof payload.iss !== 'string' ||
      typeof payload.aud !== 'string' ||
      typeof payload.iat !== 'number' ||
      typeof payload.exp !== 'number' ||
      typeof payload.jti !== 'string'
    ) {
      throw new InvalidAccessTokenError();
    }

    return {
      userId: payload.sub,
      sessionId: payload.sid,
      authVersion,
      iss: payload.iss,
      aud: payload.aud,
      iat: payload.iat,
      exp: payload.exp,
      jti: payload.jti,
    };
  }

  private assertSubject(subject: AccessTokenSubject): void {
    if (!subject.userId || !subject.sessionId || !Number.isSafeInteger(subject.authVersion)) {
      throw new Error('Invalid access token subject');
    }
    if (subject.authVersion < 1) throw new Error('Invalid access token subject');
  }

  private normalizePem(value: string): string {
    return value.replace(/\\n/g, '\n').trim();
  }
}
