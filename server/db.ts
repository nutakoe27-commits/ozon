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
      CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
    `);
    const version = 'knowledge-assessment-v1';
    const applied = await db.query('SELECT 1 FROM schema_migrations WHERE version=$1', [version]);
    if (!applied.rowCount) {
      await db.query(`
        ALTER TABLE progress ADD COLUMN IF NOT EXISTS submitted_at timestamptz;
        ALTER TABLE progress ADD COLUMN IF NOT EXISTS passed boolean;
        ALTER TABLE progress ADD COLUMN IF NOT EXISTS attempt_id uuid REFERENCES attempts(id) ON DELETE SET NULL;
        ALTER TABLE attempts ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '[]';
      `);
      for (const table of ['progress', 'attempts']) {
        const {
          rows: [column],
        } = await db.query(
          `SELECT data_type FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1 AND column_name='score'`,
          [table],
        );
        if (column.data_type !== 'double precision')
          await db.query(`ALTER TABLE ${table} ALTER COLUMN score TYPE double precision`);
      }
      // Keep existing recorded grades. Failed-only legacy lessons use their first stored attempt.
      await db.query(`WITH first_attempt AS (
        SELECT DISTINCT ON (a.user_id,a.lesson_id) a.*,l.type FROM attempts a JOIN lessons l ON l.id=a.lesson_id
        WHERE l.type<>'video' ORDER BY a.user_id,a.lesson_id,a.created_at,a.id
      ) INSERT INTO progress(user_id,lesson_id,completed_at,submitted_at,score,xp,updated_at)
        SELECT user_id,lesson_id,created_at,created_at,score,CASE WHEN type='quiz' THEN 50 ELSE 75 END,created_at FROM first_attempt
        ON CONFLICT(user_id,lesson_id) DO UPDATE SET
          completed_at=COALESCE(progress.completed_at,excluded.completed_at),
          submitted_at=COALESCE(progress.submitted_at,progress.completed_at,excluded.submitted_at),
          score=COALESCE(progress.score,excluded.score),
          xp=CASE WHEN progress.completed_at IS NULL THEN excluded.xp ELSE progress.xp END
        WHERE progress.submitted_at IS NULL;
        UPDATE progress p SET
          submitted_at=COALESCE(p.submitted_at,p.completed_at),
          attempt_id=COALESCE(p.attempt_id,(SELECT a.id FROM attempts a WHERE a.user_id=p.user_id AND a.lesson_id=p.lesson_id ORDER BY (a.score=p.score) DESC,a.created_at,a.id LIMIT 1)),
          passed=COALESCE(p.passed,(SELECT a.passed FROM attempts a WHERE a.user_id=p.user_id AND a.lesson_id=p.lesson_id AND a.score=p.score ORDER BY a.created_at,a.id LIMIT 1),p.score>=CASE WHEN l.type='quiz' THEN COALESCE((l.activity->>'passPercent')::float8,80) ELSE 100 END,false)
        FROM lessons l WHERE l.id=p.lesson_id AND l.type<>'video' AND p.completed_at IS NOT NULL;
        CREATE INDEX IF NOT EXISTS progress_attempt ON progress(attempt_id);
      `);
      await db.query('INSERT INTO schema_migrations(version) VALUES($1)', [version]);
    }
  });
}
