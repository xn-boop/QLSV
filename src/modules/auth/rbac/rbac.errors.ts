export class LastAdminProtectionError extends Error {
  constructor() {
    super('At least one active administrator must remain');
    this.name = 'LastAdminProtectionError';
  }
}

export class UnknownRoleError extends Error {
  constructor(readonly codes: readonly string[]) {
    super('One or more requested roles do not exist');
    this.name = 'UnknownRoleError';
  }
}

export class UserNotFoundError extends Error {
  constructor() {
    super('User was not found');
    this.name = 'UserNotFoundError';
  }
}

export class ActiveProfileRequiredError extends Error {
  constructor(readonly roleCode: 'STUDENT' | 'LECTURER') {
    super(`An active ${roleCode.toLowerCase()} profile is required for this role`);
    this.name = 'ActiveProfileRequiredError';
  }
}
