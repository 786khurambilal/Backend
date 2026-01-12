import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const envSchema = z.object({
  // Server Configuration
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).pipe(z.number().min(1).max(65535)).default('3000'),
  HOST: z.string().default('localhost'),

  // Database Configuration
  DB_HOST: z.string().min(1),
  DB_PORT: z.string().transform(Number).pipe(z.number().min(1).max(65535)).default('3306'),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_CONNECTION_LIMIT: z.string().transform(Number).pipe(z.number().min(1)).default('10'),

  // JWT Configuration
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_SECRET: z.string().min(32),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),

  // Email Configuration
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.string().transform(Number).pipe(z.number().min(1).max(65535)),
  SMTP_SECURE: z
    .string()
    .transform(val => val === 'true')
    .default('false'),
  SMTP_USER: z.string().email(),
  SMTP_PASSWORD: z.string().min(1),
  FROM_EMAIL: z.string().email(),
  FROM_NAME: z.string().min(1),
  FRONTEND_URL: z.string().url().optional(),

  // Security Configuration
  BCRYPT_ROUNDS: z.string().transform(Number).pipe(z.number().min(10).max(15)).default('12'),
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).pipe(z.number().min(1000)).default('900000'),
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).pipe(z.number().min(1)).default('5'),
  ALLOWED_ORIGINS: z.string().optional(),
  ADMIN_IPS: z.string().optional(),
  MAX_REQUEST_SIZE: z.string().default('10mb'),

  // Logging Configuration
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  LOG_PRETTY: z
    .string()
    .transform(val => val === 'true')
    .default('true'),
});

export type EnvConfig = z.infer<typeof envSchema>;

let env: EnvConfig;

try {
  env = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    const missingVars = error.errors.map(err => `${err.path.join('.')}: ${err.message}`);
    throw new Error(`Environment validation failed:\n${missingVars.join('\n')}`);
  }
  throw error;
}

export { env };
