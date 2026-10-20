import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
  randomUUID,
} from 'node:crypto';
import { promisify } from 'node:util';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { sql } from './db.js';
import { config } from './config.js';
const scrypt = promisify(scryptCallback);
export type User = {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'student';
  csrf?: string;
};
declare module 'fastify' {
  interface FastifyRequest {
    user: User | null;
  }
}
export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${key.toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string) {
  const [salt, hex] = encoded.split(':');
  if (!salt || !hex) return false;
  const expected = Buffer.from(hex, 'hex');
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
// A valid dummy hash keeps unknown-email logins on the same password derivation path.
export const dummyHash = hashPassword(randomBytes(32).toString('hex'));
export async function createSession(reply: FastifyReply, user: User) {
  const token = randomBytes(32).toString('base64url');
  const csrf = randomBytes(24).toString('base64url');
  await sql(
    `INSERT INTO sessions(id,user_id,csrf,expires_at) VALUES($1,$2,$3,now()+interval '7 days')`,
    [digest(token), user.id, csrf],
  );
  reply.setCookie('praktika_session', token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.production,
    maxAge: 7 * 86400,
  });
  return { user: { id: user.id, name: user.name, email: user.email, role: user.role }, csrf };
}
export async function authenticate(request: FastifyRequest) {
  const token = request.cookies.praktika_session;
  if (!token) return;
  const [user] = await sql(
    `SELECT u.id,u.name,u.email,u.role,s.csrf FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=$1 AND s.expires_at>now() AND u.active`,
    [digest(token)],
  );
  request.user = user || null;
}
export function requireUser(request: FastifyRequest): User {
  if (!request.user) throw new HttpError(401, 'Войдите в свой аккаунт');
  return request.user;
}
export function requireAdmin(request: FastifyRequest) {
  const user = requireUser(request);
  if (user.role !== 'admin') throw new HttpError(403, 'Нужны права администратора');
  return user;
}
export async function bootstrapAdmin() {
  if (!config.ADMIN_EMAIL || !config.ADMIN_PASSWORD) return;
  if (config.ADMIN_PASSWORD.length < 12 || config.ADMIN_PASSWORD.startsWith('REPLACE_'))
    throw new Error('Set a unique ADMIN_PASSWORD of at least 12 characters');
  await sql(
    `INSERT INTO users(id,email,name,password_hash,role) VALUES($1,$2,'Администратор',$3,'admin') ON CONFLICT(email) DO NOTHING`,
    [
      randomUUID(),
      config.ADMIN_EMAIL.toLowerCase().trim(),
      await hashPassword(config.ADMIN_PASSWORD),
    ],
  );
}
