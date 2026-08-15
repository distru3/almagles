import dotenv from 'dotenv';

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: Number(process.env.PORT ?? 4000),
  DATABASE_URL: required('DATABASE_URL'),
  JWT_SECRET: required('JWT_SECRET'),
  JWT_ACCESS_TTL: process.env.JWT_ACCESS_TTL ?? '15m',
  REFRESH_TTL_DAYS: Number(process.env.REFRESH_TTL_DAYS ?? 30),
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME ?? null,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY ?? null,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET ?? null,
  RESEND_API_KEY: process.env.RESEND_API_KEY ?? null,
  EMAIL_FROM: process.env.EMAIL_FROM ?? 'onboarding@resend.dev',
  APP_BASE_URL: process.env.APP_BASE_URL ?? 'http://localhost:5173',
  MAIL_DEV_MODE: process.env.MAIL_DEV_MODE ?? '1',
  SEED_ADMIN_PASSWORD: process.env.SEED_ADMIN_PASSWORD ?? 'admin1234',
};

export const isProd = env.NODE_ENV === 'production';
