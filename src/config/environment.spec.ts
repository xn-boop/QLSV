import { validateEnvironment } from './environment';

describe('validateEnvironment', () => {
  const required = {
    DATABASE_URL: 'postgresql://qlsv:secret@localhost:5432/qlsv',
    REDIS_URL: 'redis://localhost:6379/0',
  };

  it('applies safe development defaults', () => {
    expect(validateEnvironment(required)).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      APP_NAME: 'qlsv-backend',
      API_PREFIX: 'api/v1',
      LOG_LEVEL: 'info',
    });
  });

  it.each([
    [{ PORT: 0 }, 'PORT'],
    [{ PORT: 65536 }, 'PORT'],
    [{ API_PREFIX: '/api/v1' }, 'API_PREFIX'],
    [{ NODE_ENV: 'staging' }, 'NODE_ENV'],
  ])('rejects invalid configuration %#', (input, expectedField) => {
    expect(() => validateEnvironment({ ...required, ...input })).toThrow(expectedField);
  });

  it.each(['DATABASE_URL', 'REDIS_URL'])('requires %s', (name) => {
    const input: Record<string, unknown> = { ...required };
    delete input[name];
    expect(() => validateEnvironment(input)).toThrow(name);
  });
});
