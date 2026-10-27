import { randomUUID } from 'node:crypto';
import { HttpError, type User } from './auth.js';
import { pool, transaction } from './db.js';
import {
  evaluate,
  hotspotSchema,
  hotspotResponseSchema,
  issueCertificate,
  quizSchema,
  validateQuestionAnswers,
} from './domain.js';
import type { PoolClient } from 'pg';

export async function assessmentState(userId: string, courseId: string, db?: PoolClient) {
  const {
    rows: [state],
  } = await (db ?? pool).query(
    `SELECT
    count(*)::int AS total,
    count(*) FILTER(WHERE p.completed_at IS NOT NULL)::int AS completed,
    count(*) FILTER(WHERE l.type<>'video')::int AS assessment_total,
    count(*) FILTER(WHERE l.type<>'video' AND p.submitted_at IS NOT NULL)::int AS submitted,
    round((avg(p.score) FILTER(WHERE l.type<>'video' AND p.submitted_at IS NOT NULL))::numeric,2)::float8 AS score,
    COALESCE(bool_and(CASE WHEN l.type='video' THEN p.completed_at IS NOT NULL ELSE COALESCE(p.passed,false) END),false) AS passed
    FROM lessons l LEFT JOIN progress p ON p.lesson_id=l.id AND p.user_id=$2 WHERE l.course_id=$1`,
    [courseId, userId],
  );
  const complete = state.total > 0 && state.completed === state.total;
  return { ...state, complete, passed: complete && state.passed };
}
export async function assessmentLessons(userId: string, courseId: string, details = false) {
  const { rows } = await pool.query(
    `SELECT l.id,l.title,l.type,l.position,p.completed_at,p.submitted_at,
    CASE WHEN l.type<>'video' THEN p.score END AS score,
    CASE WHEN l.type<>'video' THEN p.passed END AS passed,
    ${details ? "COALESCE(a.details,'[]'::jsonb) AS details,a.created_at AS attempt_at," : ''}
    p.updated_at
    FROM lessons l LEFT JOIN progress p ON p.lesson_id=l.id AND p.user_id=$2
    ${details ? 'LEFT JOIN attempts a ON a.id=p.attempt_id' : ''}
    WHERE l.course_id=$1 ORDER BY l.position,l.created_at`,
    [courseId, userId],
  );
  return rows;
}
export async function submitAssessment(user: User, lesson: any, response: unknown) {
  await transaction(async (db) => {
    const {
      rows: [course],
    } = await db.query('SELECT published FROM courses WHERE id=$1 FOR SHARE', [lesson.course_id]);
    if (!course || (!course.published && user.role !== 'admin'))
      throw new HttpError(404, 'Курс недоступен');
    const {
      rows: [current],
    } = await db.query('SELECT * FROM lessons WHERE id=$1', [lesson.id]);
    if (!current) throw new HttpError(404, 'Урок не найден');
    if (current.type === 'video') throw new HttpError(400, 'У видеоурока нет задания');
    await db.query('INSERT INTO progress(user_id,lesson_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [
      user.id,
      current.id,
    ]);
    const {
      rows: [previous],
    } = await db.query('SELECT * FROM progress WHERE user_id=$1 AND lesson_id=$2 FOR UPDATE', [
      user.id,
      current.id,
    ]);
    if (previous.submitted_at)
      throw new HttpError(409, 'Ответ уже сохранён. Повторная попытка недоступна.');
    if (current.type === 'quiz') {
      validateQuestionAnswers(quizSchema.parse(current.activity).questions, response);
    } else {
      validateQuestionAnswers(
        hotspotSchema.parse(current.activity).questions,
        hotspotResponseSchema.parse(response).answers,
      );
    }
    const result = evaluate(current.type, current.activity, response);
    const attemptId = randomUUID();
    await db.query(
      'INSERT INTO attempts(id,user_id,lesson_id,score,passed,response,details) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [
        attemptId,
        user.id,
        current.id,
        result.score,
        result.passed,
        JSON.stringify(response),
        JSON.stringify(result.details),
      ],
    );
    await db.query(
      `UPDATE progress SET completed_at=now(),submitted_at=now(),score=$3,passed=$4,xp=$5,attempt_id=$6,updated_at=now() WHERE user_id=$1 AND lesson_id=$2`,
      [
        user.id,
        current.id,
        result.score,
        result.passed,
        current.type === 'quiz' ? 50 : 75,
        attemptId,
      ],
    );
  });
  await issueCertificate(user.id, lesson.course_id);
  const state = await assessmentState(user.id, lesson.course_id);
  return { submitted: true, resultsAvailable: state.complete };
}
