import { PasswordHasherService } from './password-hasher.service';
import { PasswordPolicyError } from './password-policy.error';

describe('PasswordHasherService', () => {
  const service = new PasswordHasherService();
  const password = 'Đúng pin sông dài 2026!';

  it('hashes with the specified Argon2id cost and a unique salt', async () => {
    const [first, second] = await Promise.all([service.hash(password), service.hash(password)]);

    expect(first).toMatch(/^\$argon2id\$v=19\$/);
    expect(first.split('$')[3]?.split(',')).toEqual(
      expect.arrayContaining(['m=65536', 't=3', 'p=1']),
    );
    expect(second).not.toBe(first);
    await expect(service.verify(first, password)).resolves.toBe(true);
    await expect(service.verify(first, `${password}x`)).resolves.toBe(false);
    expect(service.needsRehash(first)).toBe(false);
  });

  it('does not trim or normalize a password', async () => {
    const withSpaces = '  River-café-2026!  ';
    const hash = await service.hash(withSpaces);

    await expect(service.verify(hash, withSpaces)).resolves.toBe(true);
    await expect(service.verify(hash, withSpaces.trim())).resolves.toBe(false);
  });

  it.each([
    ['short', 'TOO_SHORT'],
    ['a'.repeat(129), 'TOO_LONG'],
    ['passwordpassword', 'COMMON_PASSWORD'],
    ['valid-length\u0000', 'CONTROL_CHARACTER'],
  ] as const)('rejects invalid password policy input (%s)', (candidate, reason) => {
    try {
      service.assertAcceptable(candidate);
      throw new Error('Expected password policy validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(PasswordPolicyError);
      expect((error as PasswordPolicyError).reason).toBe(reason);
    }
  });

  it('counts Unicode code points instead of UTF-16 code units', () => {
    expect(() => service.assertAcceptable('🔐A7!mQ2#vL9$')).not.toThrow();
  });

  it('fails safely for malformed or unsupported hashes', async () => {
    await expect(service.verify('not-a-hash', password)).resolves.toBe(false);
    expect(service.needsRehash('not-a-hash')).toBe(true);
  });
});
