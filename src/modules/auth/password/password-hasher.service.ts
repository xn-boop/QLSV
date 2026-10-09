import { Injectable } from '@nestjs/common';
import { ZxcvbnFactory } from '@zxcvbn-ts/core';
import * as commonPasswordData from '@zxcvbn-ts/language-common';
import * as argon2 from 'argon2';
import type { HashOptions } from 'argon2';
import { PasswordPolicyError } from './password-policy.error';

const MIN_PASSWORD_CHARACTERS = 12;
const MAX_PASSWORD_CHARACTERS = 128;
const ARGON2_OPTIONS: HashOptions & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 64 * 1024,
  timeCost: 3,
  parallelism: 1,
  hashLength: 32,
};

const passwordEstimator = new ZxcvbnFactory({
  dictionary: commonPasswordData.dictionary,
  graphs: commonPasswordData.adjacencyGraphs,
  useLevenshteinDistance: true,
});

@Injectable()
export class PasswordHasherService {
  async hash(password: string): Promise<string> {
    this.assertAcceptable(password);
    return argon2.hash(password, ARGON2_OPTIONS);
  }

  async verify(encodedHash: string, candidate: string): Promise<boolean> {
    if (!encodedHash.startsWith('$argon2id$')) return false;
    try {
      return await argon2.verify(encodedHash, candidate);
    } catch {
      return false;
    }
  }

  needsRehash(encodedHash: string): boolean {
    try {
      return argon2.needsRehash(encodedHash, ARGON2_OPTIONS);
    } catch {
      return true;
    }
  }

  assertAcceptable(password: string): void {
    const characterCount = [...password].length;
    if (characterCount < MIN_PASSWORD_CHARACTERS) {
      throw new PasswordPolicyError('TOO_SHORT');
    }
    if (characterCount > MAX_PASSWORD_CHARACTERS) {
      throw new PasswordPolicyError('TOO_LONG');
    }
    if (/\p{Cc}/u.test(password)) {
      throw new PasswordPolicyError('CONTROL_CHARACTER');
    }

    // Scores 0–1 cover common dictionary values and trivially repeated/sequential variants.
    if (passwordEstimator.check(password).score <= 1) {
      throw new PasswordPolicyError('COMMON_PASSWORD');
    }
  }
}
