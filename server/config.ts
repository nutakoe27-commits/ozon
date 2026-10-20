import 'dotenv/config';
import path from 'node:path';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  APP_URL: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string().default('postgresql://praktika:praktika_dev@127.0.0.1:54329/praktika'),
  MEDIA_ROOT: z.string().default('./data'),
  UPLOAD_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .default(10 * 1024 ** 3),
  DISK_RESERVE_BYTES: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(2 * 1024 ** 3),
  TRANSCODE_THREADS: z.coerce.number().int().min(1).max(8).default(1),
  MAX_VIDEO_HEIGHT: z.coerce.number().int().min(360).max(1080).default(720),
  REGISTRATION_OPEN: z.enum(['true', 'false']).default('true'),
  ADMIN_EMAIL: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
});
const env = schema.parse(process.env);
if (
  env.NODE_ENV === 'production' &&
  (new URL(env.APP_URL).protocol !== 'https:' || !process.env.DATABASE_URL)
) {
  throw new Error('Production requires HTTPS APP_URL and an explicit DATABASE_URL');
}
export const config = {
  ...env,
  MEDIA_ROOT: path.resolve(env.MEDIA_ROOT),
  origin: new URL(env.APP_URL).origin,
  production: env.NODE_ENV === 'production',
};
export const CHUNK_SIZE = 8 * 1024 * 1024;
