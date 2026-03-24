import * as path from 'node:path';

export default function configuration() {
  return {
    // Application
    nodeEnv: process.env.NODE_ENV || 'development',
    port: Number.parseInt(process.env.API_PORT || '4000', 10),
    appUrl: process.env.APP_URL || 'http://localhost:5173',
    apiUrl: process.env.API_URL || 'http://localhost:4000',

    // Database
    database: {
      url: process.env.DATABASE_URL,
    },

    // Redis
    redis: {
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    },

    // JWT
    jwt: {
      secret: process.env.JWT_SECRET,
      expiresIn: process.env.JWT_EXPIRES_IN || '15m',
      refreshSecret: process.env.JWT_REFRESH_SECRET,
      refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    },

    // SSO - SAML
    saml: {
      enabled: process.env.SAML_ENABLED === 'true',
      entryPoint: process.env.SAML_ENTRY_POINT,
      issuer: process.env.SAML_ISSUER || 'ghostcast',
      cert: process.env.SAML_CERT,
      callbackUrl: process.env.SAML_CALLBACK_URL,
    },

    // Rate Limiting
    rateLimit: {
      shortTtl: Number.parseInt(process.env.THROTTLE_SHORT_TTL || '1000', 10),
      shortMax: Number.parseInt(process.env.THROTTLE_SHORT_MAX || '10', 10),
      mediumTtl: Number.parseInt(process.env.THROTTLE_MEDIUM_TTL || '10000', 10),
      mediumMax: Number.parseInt(process.env.THROTTLE_MEDIUM_MAX || '50', 10),
      longTtl: Number.parseInt(process.env.THROTTLE_LONG_TTL || '60000', 10),
      longMax: Number.parseInt(process.env.THROTTLE_LONG_MAX || '300', 10),
      loginTtl: Number.parseInt(process.env.LOGIN_RATE_LIMIT_TTL || '60', 10),
      loginMax: Number.parseInt(process.env.LOGIN_RATE_LIMIT_MAX || '5', 10),
    },

    // CORS
    cors: {
      origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    },

    // Logging
    logging: {
      level: process.env.LOG_LEVEL || 'log',
    },

    // Session
    session: {
      secret: process.env.SESSION_SECRET,
    },

    // Backup
    backup: {
      directory:
        process.env.BACKUP_DIRECTORY ||
        path.join(process.cwd(), 'backups'),
    },
  };
}
