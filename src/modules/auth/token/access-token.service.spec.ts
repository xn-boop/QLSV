import { createPrivateKey, generateKeyPairSync } from 'node:crypto';
import { sign } from 'jsonwebtoken';
import type { ConfigService } from '@nestjs/config';
import { testJwtEnvironment } from '../../../../test/jwt-fixtures';
import { InvalidAccessTokenError } from './access-token.error';
import { AccessTokenService } from './access-token.service';

describe('AccessTokenService', () => {
  const config = {
    getOrThrow: jest.fn((name: keyof typeof testJwtEnvironment) => testJwtEnvironment[name]),
  } as unknown as ConfigService;
  const service = new AccessTokenService(config);
  const subject = {
    userId: '123e4567-e89b-42d3-a456-426614174000',
    sessionId: '123e4567-e89b-42d3-a456-426614174001',
    authVersion: 1,
  };

  it('issues and verifies an RS256 access token with only required claims', () => {
    const issued = service.issue(subject);
    const claims = service.verify(issued.accessToken);

    expect(issued.expiresIn).toBe(600);
    expect(claims).toMatchObject({
      ...subject,
      iss: testJwtEnvironment.JWT_ISSUER,
      aud: testJwtEnvironment.JWT_AUDIENCE,
    });
    expect(claims.exp - claims.iat).toBe(600);
    expect(claims.jti).toMatch(/^[0-9a-f-]{36}$/i);
    expect(Object.keys(claims).sort()).toEqual(
      ['aud', 'authVersion', 'exp', 'iat', 'iss', 'jti', 'sessionId', 'userId'].sort(),
    );
  });

  it('rejects tampered, expired, issuer-mismatched and wrong-algorithm tokens', () => {
    const issued = service.issue(subject).accessToken;
    const [header, payload, signature] = issued.split('.');
    const tampered = `${header}.${payload?.slice(0, -1)}x.${signature}`;
    const privateKey = createPrivateKey(testJwtEnvironment.JWT_PRIVATE_KEY);
    const expired = sign({ sid: subject.sessionId, authVersion: 1 }, privateKey, {
      algorithm: 'RS256',
      subject: subject.userId,
      issuer: testJwtEnvironment.JWT_ISSUER,
      audience: testJwtEnvironment.JWT_AUDIENCE,
      expiresIn: -1,
    });
    const wrongIssuer = sign({ sid: subject.sessionId, authVersion: 1 }, privateKey, {
      algorithm: 'RS256',
      subject: subject.userId,
      issuer: 'https://wrong.example.edu',
      audience: testJwtEnvironment.JWT_AUDIENCE,
      expiresIn: 600,
    });
    const wrongAlgorithm = sign({ sid: subject.sessionId, authVersion: 1 }, 'not-an-rsa-key', {
      algorithm: 'HS256',
      subject: subject.userId,
      issuer: testJwtEnvironment.JWT_ISSUER,
      audience: testJwtEnvironment.JWT_AUDIENCE,
      expiresIn: 600,
    });

    for (const token of [tampered, expired, wrongIssuer, wrongAlgorithm]) {
      expect(() => service.verify(token)).toThrow(InvalidAccessTokenError);
    }
  });

  it('accepts escaped PEM newlines from environment variables', () => {
    const escapedConfig = {
      ...testJwtEnvironment,
      JWT_PRIVATE_KEY: testJwtEnvironment.JWT_PRIVATE_KEY.replace(/\n/g, '\\n'),
      JWT_PUBLIC_KEY: testJwtEnvironment.JWT_PUBLIC_KEY.replace(/\n/g, '\\n'),
    };
    const getOrThrow = jest.fn((name: keyof typeof escapedConfig) => escapedConfig[name]);

    expect(() => new AccessTokenService({ getOrThrow } as unknown as ConfigService)).not.toThrow();
  });

  it('fails fast for invalid and mismatched key configuration', () => {
    const invalidConfig = {
      ...testJwtEnvironment,
      JWT_PRIVATE_KEY: 'not-a-key',
    };
    const getOrThrow = jest.fn((name: keyof typeof invalidConfig) => invalidConfig[name]);
    expect(() => new AccessTokenService({ getOrThrow } as unknown as ConfigService)).toThrow(
      'Invalid JWT private key configuration',
    );

    const unrelatedPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const mismatchedConfig = {
      ...testJwtEnvironment,
      JWT_PUBLIC_KEY: unrelatedPair.publicKey.export({ format: 'pem', type: 'spki' }).toString(),
    };
    const mismatchedGetOrThrow = jest.fn(
      (name: keyof typeof mismatchedConfig) => mismatchedConfig[name],
    );
    expect(
      () =>
        new AccessTokenService({ getOrThrow: mismatchedGetOrThrow } as unknown as ConfigService),
    ).toThrow('JWT public and private keys do not match');
  });
});
