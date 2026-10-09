import * as Joi from 'joi';

export type NodeEnvironment = 'development' | 'test' | 'production';

export interface EnvironmentVariables {
  NODE_ENV: NodeEnvironment;
  PORT: number;
  APP_NAME: string;
  API_PREFIX: string;
  LOG_LEVEL: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  DATABASE_URL: string;
  REDIS_URL: string;
  JWT_PRIVATE_KEY: string;
  JWT_PUBLIC_KEY: string;
  JWT_ISSUER: string;
  JWT_AUDIENCE: string;
}

const environmentSchema = Joi.object<EnvironmentVariables>({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().integer().min(1).max(65535).default(3000),
  APP_NAME: Joi.string().trim().min(1).max(100).default('qlsv-backend'),
  API_PREFIX: Joi.string()
    .trim()
    .pattern(/^[a-z0-9]+(?:\/[a-z0-9]+)*$/)
    .default('api/v1'),
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent')
    .default('info'),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .required(),
  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .required(),
  JWT_PRIVATE_KEY: Joi.string().min(1).required(),
  JWT_PUBLIC_KEY: Joi.string().min(1).required(),
  JWT_ISSUER: Joi.string().trim().min(1).max(255).required(),
  JWT_AUDIENCE: Joi.string().trim().min(1).max(255).required(),
}).unknown(true);

export function validateEnvironment(config: Record<string, unknown>): EnvironmentVariables {
  const result: Joi.ValidationResult<EnvironmentVariables> = environmentSchema.validate(config, {
    abortEarly: false,
    convert: true,
  });

  if (result.error) {
    throw new Error(`Invalid environment configuration: ${result.error.message}`);
  }

  return result.value;
}
