import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { z, ZodError } from 'zod';
import type { PoolClient } from 'pg';
import { config } from './config.js';
import { sql, transaction } from './db.js';
import {
  authenticate,
  createSession,
  digest,
  dummyHash,
  hashPassword,
  HttpError,
  requireAdmin,
  requireUser,
  verifyPassword,
} from './auth.js';
import {
  accessibleCourse,
  accessibleLesson,
  completeLesson,
  evaluate,
  hotspotSchema,
  quizSchema,
  safeLesson,
  saveVideoProgress,
} from './domain.js';
import { prepareStorage, uploadRoutes, uuid } from './uploads.js';

const credentials = z.object({
  email: z
    .string()
    .email()
    .max(254)
    .transform((s) => s.trim().toLowerCase()),
  password: z.string().min(1).max(200),
});
const account = credentials.extend({
  name: z.string().trim().min(2).max(100),
  password: z.string().min(12).max(200),
});
const courseSchema = z.object({
  title: z.string().trim().min(3).max(180),
  description: z.string().max(5000).default(''),
  category: z.string().trim().min(2).max(80).default('Охрана труда'),
  color: z.enum(['sage', 'peach', 'blue', 'lavender']).default('sage'),
  published: z.boolean().default(false),
  self_enroll: z.boolean().default(true),
});
const lessonSchema = z.object({
  title: z.string().trim().min(3).max(180),
  type: z.enum(['video', 'quiz', 'hotspot']),
  body: z.string().max(20_000).default(''),
  position: z.number().int().min(0).max(999).default(0),
  video_id: uuid.nullable().default(null),
  image_id: uuid.nullable().default(null),
  activity: z.unknown().default({}),
});
async function validateLesson(
  body: z.infer<typeof lessonSchema>,
  published: boolean,
  db: PoolClient,
) {
  if (body.type === 'quiz') body.activity = quizSchema.parse(body.activity);
  if (body.type === 'hotspot') body.activity = hotspotSchema.parse(body.activity);
  for (const [id, kind] of [
    [body.video_id, 'video'],
    [body.image_id, 'image'],
  ]) {
    if (!id) continue;
    const {
      rows: [media],
    } = await db.query('SELECT kind,status FROM media WHERE id=$1', [id]);
    if (media?.kind !== kind) throw new HttpError(400, 'Выбран неподходящий материал');
    if (published && media.status !== 'ready')
      throw new HttpError(
        400,
        'Дождитесь готовности материала перед добавлением в опубликованный курс',
      );
  }
  if (published && body.type === 'video' && !body.video_id)
    throw new HttpError(400, 'Выберите готовое видео для опубликованного урока');
  return body;
}
async function editableCourse(id: string, db: PoolClient) {
  const {
    rows: [course],
  } = await db.query('SELECT published FROM courses WHERE id=$1 FOR UPDATE', [id]);
  if (!course) throw new HttpError(404, 'Курс не найден');
  return course;
}
export async function buildApp(options: { logger?: boolean; rateLimit?: boolean } = {}) {
  const app = Fastify({
    logger: options.logger ?? true,
    bodyLimit: 1024 * 1024,
    trustProxy: config.production,
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    global: options.rateLimit !== false,
    max: 300,
    timeWindow: '1 minute',
  });
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0 } });
  const clientRoot = path.resolve('dist/client');
  await mkdir(clientRoot, { recursive: true });
  await app.register(fastifyStatic, { root: clientRoot, wildcard: false, index: false });
  app.decorateRequest('user', null);
  app.addHook('onRequest', async (request, reply) => {
    reply
      .header('X-Content-Type-Options', 'nosniff')
      .header('Referrer-Policy', 'same-origin')
      .header('X-Frame-Options', 'DENY');
    if (config.production)
      reply.header(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; worker-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
      );
    if (request.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store');
    await authenticate(request);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && request.url.startsWith('/api/')) {
      const origin = request.headers.origin;
      if (origin && origin !== config.origin)
        throw new HttpError(403, 'Источник запроса не разрешён');
      if (request.user && request.headers['x-csrf-token'] !== request.user.csrf)
        throw new HttpError(403, 'Обновите страницу и повторите действие');
      if (!request.user && !request.url.startsWith('/api/auth/'))
        throw new HttpError(401, 'Войдите в свой аккаунт');
    }
  });
  app.addHook('preValidation', async (request) => {
    for (const [key, value] of Object.entries((request.params as any) || {}))
      if (key === 'id' || key.endsWith('Id')) uuid.parse(value);
  });
  app.setErrorHandler((error: any, request, reply) => {
    if (error instanceof ZodError)
      return reply
        .code(400)
        .send({ error: error.issues[0]?.message || 'Проверьте заполненные поля' });
    if (error.code === '23505')
      return reply.code(409).send({ error: 'Такая запись уже существует' });
    if (error.code === '23503')
      return reply.code(400).send({ error: 'Связанная запись не найдена' });
    const status = error.statusCode || 500;
    if (status >= 500) request.log.error({ err: error }, 'Request failed');
    return reply.code(status).send({
      error:
        status >= 500
          ? status === 507
            ? error.message
            : 'Ошибка сервера. Попробуйте позже.'
          : error.message,
    });
  });
  app.get('/api/health', async (_request, reply) => {
    try {
      await sql('SELECT 1');
      return { status: 'ok' };
    } catch {
      return reply.code(503).send({ status: 'unavailable' });
    }
  });
  app.get('/api/auth/settings', async () => ({
    registrationOpen: config.REGISTRATION_OPEN === 'true',
  }));
  app.post(
    '/api/auth/login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = credentials.parse(request.body);
      const [user] = await sql('SELECT * FROM users WHERE email=$1', [body.email]);
      const valid = await verifyPassword(body.password, user?.password_hash || (await dummyHash));
      if (!user || !valid || !user.active) throw new HttpError(401, 'Неверная почта или пароль');
      return createSession(reply, user);
    },
  );
  app.post(
    '/api/auth/register',
    { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (config.REGISTRATION_OPEN !== 'true')
        throw new HttpError(403, 'Самостоятельная регистрация отключена');
      if (request.user) throw new HttpError(409, 'Вы уже вошли в аккаунт');
      const body = account.parse(request.body);
      const id = randomUUID();
      const [user] = await sql(
        `INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,$3,$4) RETURNING id,email,name,role`,
        [id, body.email, body.name, await hashPassword(body.password)],
      );
      return reply.code(201).send(await createSession(reply, user));
    },
  );
  app.get('/api/auth/me', async (request) => {
    const user = requireUser(request);
    return {
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      csrf: user.csrf,
    };
  });
  app.post('/api/auth/logout', async (request, reply) => {
    requireUser(request);
    await sql('DELETE FROM sessions WHERE id=$1', [digest(request.cookies.praktika_session || '')]);
    reply.clearCookie('praktika_session', {
      path: '/',
      secure: config.production,
      sameSite: 'lax',
    });
    return { ok: true };
  });
  app.post('/api/auth/password', async (request) => {
    const user = requireUser(request);
    const body = z
      .object({ current: z.string().max(200), password: z.string().min(12).max(200) })
      .parse(request.body);
    const [row] = await sql('SELECT password_hash FROM users WHERE id=$1', [user.id]);
    if (!(await verifyPassword(body.current, row.password_hash)))
      throw new HttpError(400, 'Текущий пароль неверен');
    await transaction(async (db) => {
      await db.query('UPDATE users SET password_hash=$2 WHERE id=$1', [
        user.id,
        await hashPassword(body.password),
      ]);
      await db.query('DELETE FROM sessions WHERE user_id=$1 AND id<>$2', [
        user.id,
        digest(request.cookies.praktika_session || ''),
      ]);
    });
    return { ok: true };
  });
  app.get('/api/dashboard', async (request) => {
    const user = requireUser(request);
    const [stats] = await sql(
      `SELECT COALESCE(sum(xp),0)::int AS xp,count(*) FILTER(WHERE completed_at IS NOT NULL)::int AS completed_lessons,COALESCE(sum(watched_seconds),0)::int AS watched_seconds FROM progress WHERE user_id=$1`,
      [user.id],
    );
    const certificates = await sql(
      `SELECT cert.id,cert.issued_at,c.title FROM certificates cert JOIN courses c ON c.id=cert.course_id WHERE cert.user_id=$1 ORDER BY cert.issued_at DESC`,
      [user.id],
    );
    const [enrolled] = await sql(
      `SELECT count(*)::int AS count FROM enrollments e JOIN courses c ON c.id=e.course_id WHERE e.user_id=$1 AND c.published`,
      [user.id],
    );
    const activity = await sql(
      `SELECT DISTINCT to_char(updated_at AT TIME ZONE 'Europe/Moscow','YYYY-MM-DD') AS day FROM progress WHERE user_id=$1 AND updated_at>now()-interval '30 days' ORDER BY day DESC`,
      [user.id],
    );
    return {
      ...stats,
      enrolled: enrolled.count,
      certificates,
      activityDays: activity.map((a) => a.day),
      level: Math.floor(stats.xp / 200) + 1,
    };
  });
  app.get('/api/courses', async (request) => {
    const user = requireUser(request);
    return sql(
      `SELECT c.*,e.user_id IS NOT NULL AS enrolled,
      (SELECT count(*)::int FROM lessons l WHERE l.course_id=c.id) AS total_lessons,
      (SELECT count(*)::int FROM lessons l JOIN progress p ON p.lesson_id=l.id WHERE l.course_id=c.id AND p.user_id=$1 AND p.completed_at IS NOT NULL) AS completed_lessons,
      (SELECT COALESCE(sum(m.duration),0)::int FROM lessons l JOIN media m ON m.id=l.video_id WHERE l.course_id=c.id) AS duration_seconds
      FROM courses c LEFT JOIN enrollments e ON e.course_id=c.id AND e.user_id=$1
      WHERE $2::boolean OR (c.published AND (c.self_enroll OR e.user_id IS NOT NULL)) ORDER BY c.created_at`,
      [user.id, user.role === 'admin'],
    );
  });
  app.get('/api/courses/:id', async (request) => {
    const user = requireUser(request);
    const { id } = request.params as any;
    const course = await accessibleCourse(user, id, false);
    if (user.role !== 'admin' && !course.enrolled) return { ...course, lessons: [] };
    const lessons = await sql(
      `SELECT l.*,m.status AS video_status,m.duration,m.error AS video_error,p.completed_at,p.score,p.position_seconds,p.watched_seconds FROM lessons l LEFT JOIN media m ON m.id=l.video_id LEFT JOIN progress p ON p.lesson_id=l.id AND p.user_id=$2 WHERE l.course_id=$1 ORDER BY l.position,l.created_at`,
      [id, user.id],
    );
    return { ...course, lessons: lessons.map((l) => safeLesson(l, user.role === 'admin')) };
  });
  app.post('/api/courses', async (request, reply) => {
    const user = requireAdmin(request);
    const body = courseSchema.parse(request.body);
    const [course] = await sql(
      `INSERT INTO courses(id,title,description,category,color,self_enroll,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        randomUUID(),
        body.title,
        body.description,
        body.category,
        body.color,
        body.self_enroll,
        user.id,
      ],
    );
    return reply.code(201).send(course);
  });
  app.patch('/api/courses/:id', async (request) => {
    requireAdmin(request);
    const { id } = request.params as any;
    const body = courseSchema.partial().parse(request.body);
    return transaction(async (db) => {
      const {
        rows: [current],
      } = await db.query('SELECT * FROM courses WHERE id=$1 FOR UPDATE', [id]);
      if (!current) throw new HttpError(404, 'Курс не найден');
      const merged = { ...current, ...body };
      if (merged.published) {
        const { rows: lessons } = await db.query(
          `SELECT l.*,m.status AS video_status FROM lessons l LEFT JOIN media m ON m.id=l.video_id WHERE l.course_id=$1`,
          [id],
        );
        if (!lessons.length)
          throw new HttpError(400, 'Добавьте хотя бы один урок перед публикацией');
        for (const lesson of lessons) {
          if ((lesson.type === 'video' || lesson.video_id) && lesson.video_status !== 'ready')
            throw new HttpError(400, `Дождитесь обработки видео: ${lesson.title}`);
          if (lesson.type === 'quiz') quizSchema.parse(lesson.activity);
          if (lesson.type === 'hotspot') hotspotSchema.parse(lesson.activity);
        }
      }
      const {
        rows: [updated],
      } = await db.query(
        'UPDATE courses SET title=$2,description=$3,category=$4,color=$5,published=$6,self_enroll=$7,updated_at=now() WHERE id=$1 RETURNING *',
        [
          id,
          merged.title,
          merged.description,
          merged.category,
          merged.color,
          merged.published,
          merged.self_enroll,
        ],
      );
      return updated;
    });
  });
  app.delete('/api/courses/:id', async (request) => {
    requireAdmin(request);
    const { id } = request.params as any;
    const { confirm } = z.object({ confirm: z.boolean().default(false) }).parse(request.body ?? {});
    if (!confirm) throw new HttpError(400, 'Подтвердите удаление курса');
    // Foreign keys remove the course's learning records atomically; media can be shared.
    const [deleted] = await sql('DELETE FROM courses WHERE id=$1 RETURNING id', [id]);
    if (!deleted) throw new HttpError(404, 'Курс не найден');
    return { ok: true };
  });
  app.post('/api/courses/:id/copy', async (request) => {
    const user = requireAdmin(request);
    const { id } = request.params as any;
    const course = await accessibleCourse(user, id);
    const nextId = randomUUID();
    await transaction(async (db) => {
      await db.query(
        `INSERT INTO courses(id,title,description,category,color,self_enroll,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [
          nextId,
          `${course.title} — новая версия`,
          course.description,
          course.category,
          course.color,
          course.self_enroll,
          user.id,
        ],
      );
      const { rows: lessons } = await db.query('SELECT * FROM lessons WHERE course_id=$1', [id]);
      for (const l of lessons)
        await db.query(
          'INSERT INTO lessons(id,course_id,title,type,position,body,video_id,image_id,activity) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          [
            randomUUID(),
            nextId,
            l.title,
            l.type,
            l.position,
            l.body,
            l.video_id,
            l.image_id,
            l.activity,
          ],
        );
    });
    return { id: nextId };
  });
  app.post('/api/courses/:id/enroll', async (request) => {
    const user = requireUser(request);
    const { id } = request.params as any;
    const course = await accessibleCourse(user, id, false);
    if (user.role !== 'admin' && !course.self_enroll && !course.enrolled)
      throw new HttpError(403, 'Этот курс назначает администратор');
    await sql('INSERT INTO enrollments(user_id,course_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [
      user.id,
      id,
    ]);
    return { ok: true };
  });
  app.post('/api/courses/:id/enrollments', async (request) => {
    requireAdmin(request);
    const { id } = request.params as any;
    const { userIds } = z.object({ userIds: z.array(uuid).min(1).max(500) }).parse(request.body);
    await transaction(async (db) => {
      for (const userId of userIds)
        await db.query(
          'INSERT INTO enrollments(user_id,course_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
          [userId, id],
        );
    });
    return { ok: true };
  });
  app.post('/api/courses/:id/lessons', async (request, reply) => {
    requireAdmin(request);
    const { id } = request.params as any;
    const lesson = await transaction(async (db) => {
      const course = await editableCourse(id, db);
      const b = await validateLesson(lessonSchema.parse(request.body), course.published, db);
      const {
        rows: [created],
      } = await db.query(
        'INSERT INTO lessons(id,course_id,title,type,position,body,video_id,image_id,activity) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
        [randomUUID(), id, b.title, b.type, b.position, b.body, b.video_id, b.image_id, b.activity],
      );
      await db.query('UPDATE courses SET updated_at=now() WHERE id=$1', [id]);
      return created;
    });
    return reply.code(201).send(lesson);
  });
  app.patch('/api/lessons/:id', async (request) => {
    requireAdmin(request);
    const { id } = request.params as any;
    const [initial] = await sql('SELECT course_id FROM lessons WHERE id=$1', [id]);
    if (!initial) throw new HttpError(404, 'Урок не найден');
    return transaction(async (db) => {
      const course = await editableCourse(initial.course_id, db);
      const {
        rows: [current],
      } = await db.query('SELECT * FROM lessons WHERE id=$1', [id]);
      if (!current) throw new HttpError(404, 'Урок не найден');
      const b = await validateLesson(
        lessonSchema.parse({
          ...current,
          ...z.record(z.string(), z.unknown()).parse(request.body),
        }),
        course.published,
        db,
      );
      const {
        rows: [lesson],
      } = await db.query(
        'UPDATE lessons SET title=$2,type=$3,position=$4,body=$5,video_id=$6,image_id=$7,activity=$8 WHERE id=$1 RETURNING *',
        [id, b.title, b.type, b.position, b.body, b.video_id, b.image_id, b.activity],
      );
      if (b.video_id !== current.video_id)
        await db.query(
          'UPDATE progress SET position_seconds=0,watched_seconds=0,last_ping_at=NULL WHERE lesson_id=$1',
          [id],
        );
      await db.query('UPDATE courses SET updated_at=now() WHERE id=$1', [current.course_id]);
      return lesson;
    });
  });
  app.delete('/api/lessons/:id', async (request) => {
    requireAdmin(request);
    const { id } = request.params as any;
    const [lesson] = await sql('SELECT course_id FROM lessons WHERE id=$1', [id]);
    if (!lesson) throw new HttpError(404, 'Урок не найден');
    await transaction(async (db) => {
      await editableCourse(lesson.course_id, db);
      await db.query('DELETE FROM lessons WHERE id=$1', [id]);
      await db.query(
        `UPDATE courses SET updated_at=now(),published=published AND EXISTS(SELECT 1 FROM lessons WHERE course_id=$1) WHERE id=$1`,
        [lesson.course_id],
      );
    });
    return { ok: true };
  });
  app.post(
    '/api/lessons/:id/attempt',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request) => {
      const user = requireUser(request);
      const { id } = request.params as any;
      const lesson = await accessibleLesson(user, id);
      const { response } = z.object({ response: z.unknown() }).parse(request.body);
      const result = evaluate(lesson.type, lesson.activity, response);
      await sql(
        'INSERT INTO attempts(id,user_id,lesson_id,score,passed,response) VALUES($1,$2,$3,$4,$5,$6)',
        [randomUUID(), user.id, id, result.score, result.passed, JSON.stringify(response)],
      );
      const certificateId = result.passed
        ? await completeLesson(user.id, lesson, result.score)
        : null;
      return { ...result, certificateId };
    },
  );
  app.post('/api/lessons/:id/progress', async (request) => {
    const user = requireUser(request);
    const { id } = request.params as any;
    const lesson = await accessibleLesson(user, id);
    const { position, rate } = z
      .object({
        position: z
          .number()
          .finite()
          .nonnegative()
          .max(7 * 86400),
        rate: z.number().min(0.5).max(2).default(1),
      })
      .parse(request.body);
    return saveVideoProgress(user.id, lesson, position, rate);
  });
  app.get('/api/users', async (request) => {
    requireAdmin(request);
    return sql(
      `SELECT u.id,u.email,u.name,u.role,u.active,u.created_at,(SELECT count(*)::int FROM enrollments e WHERE e.user_id=u.id) AS courses,(SELECT count(*)::int FROM progress p WHERE p.user_id=u.id AND p.completed_at IS NOT NULL) AS completed_lessons FROM users u ORDER BY u.created_at DESC LIMIT 1000`,
    );
  });
  app.post('/api/users', async (request, reply) => {
    requireAdmin(request);
    const body = account
      .extend({ role: z.enum(['admin', 'student']).default('student') })
      .parse(request.body);
    const [user] = await sql(
      'INSERT INTO users(id,email,name,password_hash,role) VALUES($1,$2,$3,$4,$5) RETURNING id,email,name,role,active',
      [randomUUID(), body.email, body.name, await hashPassword(body.password), body.role],
    );
    return reply.code(201).send(user);
  });
  app.patch('/api/users/:id', async (request) => {
    const admin = requireAdmin(request);
    const { id } = request.params as any;
    const body = z
      .object({ active: z.boolean().optional(), password: z.string().min(12).max(200).optional() })
      .parse(request.body);
    if (id === admin.id && body.active === false)
      throw new HttpError(400, 'Нельзя отключить собственный аккаунт');
    const [user] = await sql('SELECT id FROM users WHERE id=$1', [id]);
    if (!user) throw new HttpError(404, 'Пользователь не найден');
    await transaction(async (db) => {
      if (body.active !== undefined)
        await db.query('UPDATE users SET active=$2 WHERE id=$1', [id, body.active]);
      if (body.password)
        await db.query('UPDATE users SET password_hash=$2 WHERE id=$1', [
          id,
          await hashPassword(body.password),
        ]);
      if (body.password || body.active === false)
        await db.query('DELETE FROM sessions WHERE user_id=$1', [id]);
    });
    return { ok: true };
  });
  const report = () =>
    sql(`SELECT u.name,u.email,u.active,c.title AS course,c.id AS course_id,e.created_at AS assigned_at,
    (SELECT count(*)::int FROM lessons l WHERE l.course_id=c.id) AS total,
    (SELECT count(*)::int FROM lessons l JOIN progress p ON p.lesson_id=l.id WHERE l.course_id=c.id AND p.user_id=u.id AND p.completed_at IS NOT NULL) AS completed,
    (SELECT round(avg(p.score))::int FROM lessons l JOIN progress p ON p.lesson_id=l.id WHERE l.course_id=c.id AND p.user_id=u.id AND p.score IS NOT NULL) AS score,
    cert.id AS certificate_id,cert.issued_at
    FROM enrollments e JOIN users u ON u.id=e.user_id JOIN courses c ON c.id=e.course_id LEFT JOIN certificates cert ON cert.course_id=c.id AND cert.user_id=u.id ORDER BY u.name,c.title`);
  app.get('/api/reports', async (request) => {
    requireAdmin(request);
    return report();
  });
  app.get('/api/reports.csv', async (request, reply) => {
    requireAdmin(request);
    const rows = await report();
    const cell = (v: unknown) =>
      `"${String(v ?? '')
        .replace(/^[=+@\-\t\r]/, (m) => "'" + m)
        .replaceAll('"', '""')}"`;
    const data = [
      [
        'Имя',
        'Почта',
        'Курс',
        'Завершено уроков',
        'Всего уроков',
        'Результат, %',
        'Дата завершения',
      ],
      ...rows.map((r) => [
        r.name,
        r.email,
        r.course,
        r.completed,
        r.total,
        r.score,
        r.issued_at?.toISOString() || '',
      ]),
    ];
    return reply
      .type('text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="praktika-report.csv"')
      .send('\uFEFF' + data.map((row) => row.map(cell).join(';')).join('\r\n'));
  });
  app.get('/api/certificates/:id', async (request) => {
    const user = requireUser(request);
    const { id } = request.params as any;
    const [certificate] = await sql(
      'SELECT cert.*,u.name,c.title FROM certificates cert JOIN users u ON u.id=cert.user_id JOIN courses c ON c.id=cert.course_id WHERE cert.id=$1 AND (cert.user_id=$2 OR $3::boolean)',
      [id, user.id, user.role === 'admin'],
    );
    if (!certificate) throw new HttpError(404, 'Сертификат не найден');
    return certificate;
  });
  await prepareStorage();
  await uploadRoutes(app);
  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith('/api/') || request.method !== 'GET')
      return reply.code(404).send({ error: 'Страница не найдена' });
    return reply.type('text/html').sendFile('index.html');
  });
  return app;
}
