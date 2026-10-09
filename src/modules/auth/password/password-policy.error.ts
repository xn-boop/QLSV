export type PasswordPolicyReason =
  'TOO_SHORT' | 'TOO_LONG' | 'COMMON_PASSWORD' | 'CONTROL_CHARACTER';

export class PasswordPolicyError extends Error {
  constructor(readonly reason: PasswordPolicyReason) {
    super('Password does not satisfy the configured policy');
    this.name = 'PasswordPolicyError';
  }
}
