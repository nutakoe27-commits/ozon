import pg from 'pg';
import { config } from './config.js';
export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: 8,
  idleTimeoutMillis: 30_000,
  statement_timeout: 20_000,
});
export const sql = async (text: string, values: unknown[] = []) =>
  (await pool.query(text, values)).rows;
export async function transaction<T>(fn: (db: pg.PoolClient) => Promise<T>): Promise<T> {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const result = await fn(db);
    await db.query('COMMIT');
    return result;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}
export async function migrate() {
  await transaction(async (db) => {
    await db.query('SELECT pg_advisory_xact_lock(73281741)');
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id uuid PRIMARY KEY, email text NOT NULL UNIQUE, name text NOT NULL,
        password_hash text NOT NULL, role text NOT NULL CHECK(role IN ('admin','student')) DEFAULT 'student',
        active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        csrf text NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS courses (
        id uuid PRIMARY KEY, title text NOT NULL, description text NOT NULL DEFAULT '', category text NOT NULL DEFAULT 'Охрана труда',
        color text NOT NULL DEFAULT 'sage', published boolean NOT NULL DEFAULT false, self_enroll boolean NOT NULL DEFAULT true,
        created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS uploads (
        id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id), name text NOT NULL,
        size bigint NOT NULL, offset_bytes bigint NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'uploading',
        updated_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS media (
        id uuid PRIMARY KEY, kind text NOT NULL CHECK(kind IN ('video','image')), name text NOT NULL,
        owner_id uuid NOT NULL REFERENCES users(id), status text NOT NULL DEFAULT 'queued', duration double precision,
        width int, height int, error text, attempts int NOT NULL DEFAULT 0, lease_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS lessons (
        id uuid PRIMARY KEY, course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        title text NOT NULL, type text NOT NULL CHECK(type IN ('video','quiz','hotspot')), position int NOT NULL DEFAULT 0,
        body text NOT NULL DEFAULT '', video_id uuid REFERENCES media(id), image_id uuid REFERENCES media(id),
        activity jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS enrollments (
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,course_id)
      );
      CREATE TABLE IF NOT EXISTS progress (
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, lesson_id uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
        completed_at timestamptz, score int, xp int NOT NULL DEFAULT 0, position_seconds double precision NOT NULL DEFAULT 0,
        watched_seconds double precision NOT NULL DEFAULT 0, last_ping_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY(user_id,lesson_id)
      );
      CREATE TABLE IF NOT EXISTS attempts (
        id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        lesson_id uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE, score int NOT NULL, passed boolean NOT NULL,
        response jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS certificates (
        id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE, issued_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(user_id,course_id)
      );
      CREATE INDEX IF NOT EXISTS lessons_course ON lessons(course_id,position);
      CREATE INDEX IF NOT EXISTS media_queue ON media(status,created_at);
      CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
      CREATE INDEX IF NOT EXISTS attempts_student ON attempts(user_id,lesson_id);
    `);
  });
}
