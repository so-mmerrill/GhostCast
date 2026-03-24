import * as Joi from 'joi';

export const validationSchema = Joi.object({
  // Application
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  API_PORT: Joi.number().default(4000),
  APP_URL: Joi.string().uri().default('http://localhost:5173'),
  API_URL: Joi.string().uri().default('http://localhost:4000'),

  // Database
  DATABASE_URL: Joi.string().required(),

  // Redis
  REDIS_URL: Joi.string().default('redis://localhost:6379'),

  // JWT
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

  // SSO - SAML
  SAML_ENABLED: Joi.boolean().default(false),
  SAML_ENTRY_POINT: Joi.string().uri().when('SAML_ENABLED', {
    is: true,
    then: Joi.required(),
    otherwise: Joi.optional().allow(''),
  }),
  SAML_ISSUER: Joi.string().default('ghostcast'),
  SAML_CERT: Joi.string().when('SAML_ENABLED', {
    is: true,
    then: Joi.required(),
    otherwise: Joi.optional().allow(''),
  }),
  SAML_CALLBACK_URL: Joi.string().uri().when('SAML_ENABLED', {
    is: true,
    then: Joi.required(),
    otherwise: Joi.optional().allow(''),
  }),

  // Rate Limiting (throttle tiers - values in milliseconds for TTL)
  THROTTLE_SHORT_TTL: Joi.number().default(1000),
  THROTTLE_SHORT_MAX: Joi.number().default(10),
  THROTTLE_MEDIUM_TTL: Joi.number().default(10000),
  THROTTLE_MEDIUM_MAX: Joi.number().default(50),
  THROTTLE_LONG_TTL: Joi.number().default(60000),
  THROTTLE_LONG_MAX: Joi.number().default(300),
  LOGIN_RATE_LIMIT_TTL: Joi.number().default(60),
  LOGIN_RATE_LIMIT_MAX: Joi.number().default(5),

  // CORS
  CORS_ORIGIN: Joi.string().default('http://localhost:5173'),

  // Logging
  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'info', 'debug', 'verbose')
    .default('debug'),

  // Session
  SESSION_SECRET: Joi.string().min(32).required(),

  // Backup
  BACKUP_DIRECTORY: Joi.string().optional(),
});
