import { validateEnvironment } from './environment';

describe('validateEnvironment', () => {
  it('applies safe development defaults', () => {
    expect(validateEnvironment({})).toMatchObject({
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
    expect(() => validateEnvironment(input)).toThrow(expectedField);
  });
});
