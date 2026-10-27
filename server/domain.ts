import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { HttpError, type User } from './auth.js';
import { sql, transaction } from './db.js';
const coordinate = z.number().min(0).max(100);
const questionSchema = z
  .object({
    id: z.string().min(1).max(80),
    prompt: z.string().trim().min(3).max(2000),
    options: z.array(z.string().trim().min(1).max(500)).min(2).max(8),
    multiple: z.boolean().default(false),
    correctIndex: z.number().int().min(0).max(7).optional(),
    correctIndexes: z
      .array(z.number().int().min(0).max(7))
      .min(1, 'Отметьте хотя бы один правильный ответ')
      .max(8)
      .refine((indexes) => new Set(indexes).size === indexes.length, {
        message: 'Правильные ответы не должны повторяться',
      })
      .optional(),
    explanation: z.string().max(2000).default(''),
  })
  .superRefine((q, ctx) => {
    const correct = q.multiple
      ? q.correctIndexes
      : q.correctIndex === undefined
        ? undefined
        : [q.correctIndex];
    if (!correct?.length)
      ctx.addIssue({
        code: 'custom',
        message: 'Отметьте хотя бы один правильный ответ',
        path: [q.multiple ? 'correctIndexes' : 'correctIndex'],
      });
    if (correct?.some((index) => index >= q.options.length))
      ctx.addIssue({
        code: 'custom',
        message: 'Выберите существующий ответ',
        path: [q.multiple ? 'correctIndexes' : 'correctIndex'],
      });
  });
const questionsSchema = z
  .array(questionSchema)
  .max(50)
  .superRefine((questions, ctx) => {
    const ids = new Set<string>();
    questions.forEach((q, i) => {
      if (ids.has(q.id))
        ctx.addIssue({
          code: 'custom',
          message: 'Повторяющийся идентификатор вопроса',
          path: [i, 'id'],
        });
      ids.add(q.id);
    });
  });
export const quizSchema = z.object({
  passPercent: z.number().int().min(1).max(100).default(80),
  questions: questionsSchema.min(1),
});
const pointSchema = z.object({ x: coordinate, y: coordinate });
const zoneSchema = z
  .object({
    x: coordinate,
    y: coordinate,
    width: z.number().min(3).max(100),
    height: z.number().min(3).max(100),
    score: z.union([z.literal(50), z.literal(100)]).default(100),
  })
  .refine((zone) => zone.x + zone.width <= 100 && zone.y + zone.height <= 100, {
    message: 'Безопасная зона должна находиться внутри сцены',
  });
export const hotspotSchema = z
  .object({
    instruction: z.string().trim().min(3).max(2000),
    targets: z.array(zoneSchema).min(1).max(20).optional(),
    // Accept existing single-zone lessons without a database migration.
    target: zoneSchema.optional(),
    start: pointSchema.default({ x: 50, y: 85 }),
    explanation: z.string().max(2000).default(''),
    questions: questionsSchema.default([]),
  })
  .refine((a) => !!a.targets?.length || !!a.target, {
    message: 'Добавьте хотя бы одну безопасную зону',
  })
  .transform(({ target, targets, ...activity }) => ({
    ...activity,
    targets: targets ?? [target!],
  }));
const answerIndexSchema = z.number().int().min(0).max(7);
const answersSchema = z.record(
  z.string(),
  z.union([
    answerIndexSchema,
    z
      .array(answerIndexSchema)
      .max(8)
      .refine((values) => new Set(values).size === values.length, {
        message: 'Варианты ответа не должны повторяться',
      }),
  ]),
);
export const hotspotResponseSchema = pointSchema.extend({ answers: answersSchema.default({}) });
export function validateQuestionAnswers(
  questions: z.infer<typeof questionsSchema>,
  response: unknown,
) {
  const answers = answersSchema.parse(response);
  for (const question of questions) {
    const answer = answers[question.id];
    if (question.multiple ? !Array.isArray(answer) || !answer.length : typeof answer !== 'number')
      throw new HttpError(400, 'Ответьте на все вопросы задания');
    const selected = Array.isArray(answer) ? answer : [answer];
    if (selected.some((index) => index >= question.options.length))
      throw new HttpError(400, 'Выберите существующие варианты ответа');
  }
}
const visibleQuestions = (questions: Record<string, any>[] = []) =>
  questions.map(({ correctIndex, correctIndexes, explanation, ...q }) => ({
    ...q,
    multiple: q.multiple ?? false,
  }));
export function safeLesson(lesson: Record<string, any>, admin: boolean, revealResults = false) {
  if (admin) return lesson;
  const activity =
    lesson.type === 'quiz'
      ? {
          passPercent: lesson.activity.passPercent,
          questions: visibleQuestions(lesson.activity.questions),
        }
      : lesson.type === 'hotspot'
        ? {
            instruction: lesson.activity.instruction,
            start: lesson.activity.start ?? { x: 50, y: 85 },
            questions: visibleQuestions(lesson.activity.questions),
          }
        : {};
  const { video_error, score, passed, attempt_id, ...visible } = lesson;
  return { ...visible, activity, ...(revealResults ? { score, passed } : {}) };
}
function questionScores(questions: z.infer<typeof questionsSchema>, response: unknown) {
  const answers = answersSchema.parse(response);
  return questions.map((q) => {
    const given = answers[q.id];
    let score = 0;
    if (q.multiple && Array.isArray(given)) {
      const correct = q.correctIndexes!;
      const hits = given.filter((value) => correct.includes(value)).length;
      const wrong = given.length - hits;
      score = Math.max(0, Math.min(100, ((hits - wrong) / correct.length) * 100));
    } else if (!q.multiple && typeof given === 'number' && given === q.correctIndex) score = 100;
    return {
      id: q.id,
      prompt: q.prompt,
      score: Math.round(score * 100) / 100,
    };
  });
}
const averageScore = (details: { score: number }[]) =>
  Math.round((details.reduce((sum, item) => sum + item.score, 0) / details.length) * 100) / 100;
export function evaluate(type: string, activity: any, response: unknown) {
  if (type === 'quiz') {
    const quiz = quizSchema.parse(activity);
    const details = questionScores(quiz.questions, response);
    const score = averageScore(details);
    return { score, passed: score >= quiz.passPercent, details };
  }
  if (type === 'hotspot') {
    const a = hotspotSchema.parse(activity);
    const point = hotspotResponseSchema.parse(response);
    const matches = a.targets.filter(
      (t) =>
        point.x >= t.x && point.x <= t.x + t.width && point.y >= t.y && point.y <= t.y + t.height,
    );
    const sceneScore = matches.reduce((best, zone) => Math.max(best, zone.score), 0);
    const details = [
      { id: 'scene', prompt: a.instruction, score: sceneScore },
      ...questionScores(a.questions, point.answers).map((q) => ({ ...q, id: `question:${q.id}` })),
    ];
    const score = averageScore(details);
    return {
      score,
      passed: score === 100,
      details,
    };
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
    AND NOT EXISTS(SELECT 1 FROM lessons l LEFT JOIN progress p ON p.lesson_id=l.id AND p.user_id=$2 WHERE l.course_id=$3 AND (p.completed_at IS NULL OR (l.type<>'video' AND NOT COALESCE(p.passed,false))))
    ON CONFLICT(user_id,course_id) DO NOTHING`,
    [randomUUID(), userId, courseId],
  );
  const [certificate] = await sql(
    `SELECT id FROM certificates WHERE user_id=$1 AND course_id=$2
    AND EXISTS(SELECT 1 FROM lessons WHERE course_id=$2)
    AND NOT EXISTS(SELECT 1 FROM lessons l LEFT JOIN progress p ON p.lesson_id=l.id AND p.user_id=$1 WHERE l.course_id=$2 AND (p.completed_at IS NULL OR (l.type<>'video' AND NOT COALESCE(p.passed,false))))`,
    [userId, courseId],
  );
  return certificate?.id || null;
}
export async function saveVideoProgress(userId: string, lesson: any, position: number, rate = 1) {
  if (!lesson.video_id || lesson.video_status !== 'ready' || !(lesson.duration > 0))
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
    const completeVideo = lesson.type === 'video' && watched >= lesson.duration * 0.9;
    const {
      rows: [next],
    } = await db.query(
      `UPDATE progress SET position_seconds=$3,watched_seconds=$4,last_ping_at=now(),updated_at=now(),completed_at=CASE WHEN $5 THEN COALESCE(completed_at,now()) ELSE completed_at END,xp=CASE WHEN $5 THEN 30 ELSE xp END WHERE user_id=$1 AND lesson_id=$2 RETURNING *`,
      [userId, lesson.id, clamped, watched, completeVideo],
    );
    return next;
  });
  const certificateId = progress.completed_at
    ? await issueCertificate(userId, lesson.course_id)
    : null;
  return { ...progress, certificateId };
}
