import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { HttpError, type User } from './auth.js';
import { sql, transaction } from './db.js';
const coordinate = z.number().min(0).max(100);
export const quizSchema = z
  .object({
    passPercent: z.number().int().min(1).max(100).default(80),
    questions: z
      .array(
        z.object({
          id: z.string().min(1).max(80),
          prompt: z.string().trim().min(3).max(2000),
          options: z.array(z.string().trim().min(1).max(500)).min(2).max(8),
          correctIndex: z.number().int().min(0).max(7),
          explanation: z.string().max(2000).default(''),
        }),
      )
      .min(1)
      .max(50),
  })
  .superRefine((quiz, ctx) => {
    const ids = new Set<string>();
    quiz.questions.forEach((q, i) => {
      if (q.correctIndex >= q.options.length)
        ctx.addIssue({
          code: 'custom',
          message: 'Выберите существующий ответ',
          path: ['questions', i, 'correctIndex'],
        });
      if (ids.has(q.id))
        ctx.addIssue({
          code: 'custom',
          message: 'Повторяющийся идентификатор вопроса',
          path: ['questions', i, 'id'],
        });
      ids.add(q.id);
    });
  });
export const hotspotSchema = z
  .object({
    instruction: z.string().trim().min(3).max(2000),
    target: z.object({
      x: coordinate,
      y: coordinate,
      width: z.number().min(3).max(100),
      height: z.number().min(3).max(100),
    }),
    explanation: z.string().max(2000).default(''),
  })
  .refine((a) => a.target.x + a.target.width <= 100 && a.target.y + a.target.height <= 100, {
    message: 'Безопасная зона должна находиться внутри сцены',
  });
export function safeLesson(lesson: Record<string, any>, admin: boolean) {
  if (admin) return lesson;
  const activity =
    lesson.type === 'quiz'
      ? {
          passPercent: lesson.activity.passPercent,
          questions: (lesson.activity.questions || []).map(
            ({ correctIndex, explanation, ...q }: Record<string, any>) => q,
          ),
        }
      : lesson.type === 'hotspot'
        ? { instruction: lesson.activity.instruction }
        : {};
  const { video_error, ...visible } = lesson;
  return { ...visible, activity };
}
export function evaluate(type: string, activity: any, response: unknown) {
  if (type === 'quiz') {
    const quiz = quizSchema.parse(activity);
    const answers = z.record(z.string(), z.number().int().min(0).max(7)).parse(response);
    const feedback = quiz.questions.map((q) => ({
      id: q.id,
      correct: answers[q.id] === q.correctIndex,
      explanation: q.explanation,
    }));
    const score = Math.round(
      (feedback.filter((q) => q.correct).length / quiz.questions.length) * 100,
    );
    return { score, passed: score >= quiz.passPercent, feedback };
  }
  if (type === 'hotspot') {
    const a = hotspotSchema.parse(activity);
    const point = z.object({ x: coordinate, y: coordinate }).parse(response);
    const t = a.target;
    const passed =
      point.x >= t.x && point.x <= t.x + t.width && point.y >= t.y && point.y <= t.y + t.height;
    return { score: passed ? 100 : 0, passed, explanation: a.explanation };
  }
  throw new HttpError(400, 'У этого урока нет задания');
}
export async function accessibleCourse(user: User, id: string, requireEnrollment = true) {
  const [course] = await sql(
    `SELECT c.*,e.user_id IS NOT NULL AS enrolled FROM courses c LEFT JOIN enrollments e ON e.course_id=c.id AND e.user_id=$2 WHERE c.id=$1`,
    [id, user.id],
  );
  if (
    !course ||
    (user.role !== 'admin' &&
      (!course.published ||
        (requireEnrollment ? !course.enrolled : !course.enrolled && !course.self_enroll)))
  )
    throw new HttpError(404, 'Курс не найден или не назначен');
  return course;
}
export async function accessibleLesson(user: User, id: string) {
  const [lesson] = await sql(
    `SELECT l.*,m.status AS video_status,m.duration FROM lessons l LEFT JOIN media m ON m.id=l.video_id WHERE l.id=$1`,
    [id],
  );
  if (!lesson) throw new HttpError(404, 'Урок не найден');
  await accessibleCourse(user, lesson.course_id);
  return lesson;
}
export async function issueCertificate(userId: string, courseId: string) {
  await sql(
    `INSERT INTO certificates(id,user_id,course_id)
    SELECT $1,$2,$3 WHERE EXISTS(SELECT 1 FROM lessons WHERE course_id=$3)
    AND NOT EXISTS(SELECT 1 FROM lessons l LEFT JOIN progress p ON p.lesson_id=l.id AND p.user_id=$2 WHERE l.course_id=$3 AND p.completed_at IS NULL)
    ON CONFLICT(user_id,course_id) DO NOTHING`,
    [randomUUID(), userId, courseId],
  );
  const [certificate] = await sql('SELECT id FROM certificates WHERE user_id=$1 AND course_id=$2', [
    userId,
    courseId,
  ]);
  return certificate?.id || null;
}
export async function completeLesson(userId: string, lesson: any, score: number) {
  const xp = lesson.type === 'video' ? 30 : lesson.type === 'quiz' ? 50 : 75;
  await sql(
    `INSERT INTO progress(user_id,lesson_id,completed_at,score,xp) VALUES($1,$2,now(),$3,$4)
    ON CONFLICT(user_id,lesson_id) DO UPDATE SET completed_at=COALESCE(progress.completed_at,now()),score=GREATEST(progress.score,excluded.score),xp=excluded.xp,updated_at=now()`,
    [userId, lesson.id, score, xp],
  );
  return issueCertificate(userId, lesson.course_id);
}
export async function saveVideoProgress(userId: string, lesson: any, position: number, rate = 1) {
  if (lesson.type !== 'video' || lesson.video_status !== 'ready' || !(lesson.duration > 0))
    throw new HttpError(400, 'Видео ещё не готово');
  const progress = await transaction(async (db) => {
    await db.query(`INSERT INTO progress(user_id,lesson_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, [
      userId,
      lesson.id,
    ]);
    const {
      rows: [previous],
    } = await db.query('SELECT * FROM progress WHERE user_id=$1 AND lesson_id=$2 FOR UPDATE', [
      userId,
      lesson.id,
    ]);
    const clamped = Math.min(position, lesson.duration);
    const elapsed = previous.last_ping_at
      ? Math.max(0, (Date.now() - new Date(previous.last_ping_at).getTime()) / 1000)
      : 0;
    const delta = Math.max(
      0,
      Math.min(30, elapsed * rate + (elapsed > 0 ? 1 : 0), clamped - previous.position_seconds),
    );
    const watched = Math.min(lesson.duration, previous.watched_seconds + delta);
    const completed = !!previous.completed_at || watched >= lesson.duration * 0.9;
    const {
      rows: [next],
    } = await db.query(
      `UPDATE progress SET position_seconds=$3,watched_seconds=$4,last_ping_at=now(),updated_at=now(),completed_at=CASE WHEN $5 THEN COALESCE(completed_at,now()) ELSE completed_at END,xp=CASE WHEN $5 THEN 30 ELSE xp END WHERE user_id=$1 AND lesson_id=$2 RETURNING *`,
      [userId, lesson.id, clamped, watched, completed],
    );
    return next;
  });
  const certificateId = progress.completed_at
    ? await issueCertificate(userId, lesson.course_id)
    : null;
  return { ...progress, certificateId };
}
