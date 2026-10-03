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
  ACCESS_TTL_MINUTES: Number(process.env.ACCESS_TTL_MINUTES ?? 15),
  REFRESH_TTL_DAYS: Number(process.env.REFRESH_TTL_DAYS ?? 30),
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME ?? null,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY ?? null,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET ?? null,
  BREVO_API_KEY: process.env.BREVO_API_KEY ?? null,
  // A sender address verified in Brevo (Senders & IP → Senders).
  EMAIL_FROM: process.env.EMAIL_FROM ?? null,
  EMAIL_FROM_NAME: process.env.EMAIL_FROM_NAME ?? 'رجال الأمة',
  APP_BASE_URL: process.env.APP_BASE_URL ?? 'http://localhost:5173',
  MAIL_DEV_MODE: process.env.MAIL_DEV_MODE ?? '1',
};

export const isProd = env.NODE_ENV === 'production';

