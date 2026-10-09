import { ConflictException, UnprocessableEntityException } from '@nestjs/common';

export class SubjectCycleError extends UnprocessableEntityException {
  constructor() {
    super({ code: 'PREREQUISITE_CYCLE', message: 'Subject prerequisites cannot contain a cycle' });
  }
}

export class SubjectNotFoundError extends UnprocessableEntityException {
  constructor() {
    super({ code: 'SUBJECT_NOT_FOUND', message: 'Subject not found' });
  }
}

export class DuplicatePrerequisiteError extends ConflictException {
  constructor() {
    super({ code: 'DUPLICATE_PREREQUISITE', message: 'Duplicate prerequisite' });
  }
}
