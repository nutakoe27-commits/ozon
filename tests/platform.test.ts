import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgresql://praktika:praktika_dev@127.0.0.1:54329/praktika_test';
if (!new URL(process.env.DATABASE_URL).pathname.endsWith('_test'))
  throw new Error('Tests require a separate database ending in _test');
process.env.MEDIA_ROOT = await mkdtemp('/tmp/praktika-tests-');
process.env.DISK_RESERVE_BYTES = '0';
const { buildApp } = await import('../server/app.js');
const { migrate, pool, sql } = await import('../server/db.js');
const { hashPassword } = await import('../server/auth.js');
const { processNext, command } = await import('../server/worker.js');
const { uploadPath, mediaPath } = await import('../server/uploads.js');
const { evaluate, hotspotSchema, quizSchema, safeLesson } = await import('../server/domain.js');
let app: Awaited<ReturnType<typeof buildApp>>;
let admin: Record<string, string>,
  student: Record<string, string>,
  outsider: Record<string, string>;
const adminId = randomUUID(),
  studentId = randomUUID(),
  outsiderId = randomUUID();
let courseId = '',
  quizId = '',
  hotspotId = '',
  uploadId = '',
  videoCourseId = '',
  videoLessonId = '';
const quiz = {
  passPercent: 100,
  questions: [
    {
      id: 'q1',
      prompt: 'Как поступить при опасности?',
      options: ['Продолжить работу', 'Остановить работу'],
      correctIndex: 1,
      explanation: 'Сначала остановите опасные действия.',
    },
  ],
};
const hotspot = {
  instruction: 'Поставьте работника в безопасное место.',
  target: { x: 10, y: 20, width: 20, height: 30 },
  explanation: 'Выберите пешеходную зону.',
};
async function request(
  method: string,
  url: string,
  headers: Record<string, string> = {},
  payload?: any,
) {
  return app.inject({ method: method as any, url, headers, payload });
}
async function login(email: string, password: string) {
  const r = await request('POST', '/api/auth/login', {}, { email, password });
  assert.equal(r.statusCode, 200, r.body);
  return {
    cookie: r.cookies.map((c) => `${c.name}=${c.value}`).join('; '),
    'x-csrf-token': r.json().csrf,
  };
}
before(async () => {
  await migrate();
  await sql('TRUNCATE users CASCADE');
  for (const [id, email, role] of [
    [adminId, 'admin@test.local', 'admin'],
    [studentId, 'student@test.local', 'student'],
    [outsiderId, 'outsider@test.local', 'student'],
  ])
    await sql('INSERT INTO users(id,email,name,password_hash,role) VALUES($1,$2,$3,$4,$5)', [
      id,
      email,
      'Тестовый пользователь',
      await hashPassword('TestingPassword2026!'),
      role,
    ]);
  app = await buildApp({ logger: false, rateLimit: false });
  admin = await login('admin@test.local', 'TestingPassword2026!');
  student = await login('student@test.local', 'TestingPassword2026!');
  outsider = await login('outsider@test.local', 'TestingPassword2026!');
});
after(async () => {
  await app?.close();
  await pool.end();
  await rm(process.env.MEDIA_ROOT!, { recursive: true, force: true });
});
test('anonymous access is rejected and student cannot access administration', async () => {
  assert.equal((await request('GET', '/api/courses')).statusCode, 401);
  assert.equal((await request('GET', '/api/users', student)).statusCode, 403);
});
test('password authentication rejects incorrect passwords and nonexistent users', async () => {
  for (const email of ['admin@test.local', 'missing@test.local'])
    assert.equal(
      (await request('POST', '/api/auth/login', {}, { email, password: 'incorrect' })).statusCode,
      401,
    );
});
test('mutations enforce CSRF and same-origin checks', async () => {
  assert.equal(
    (await request('POST', '/api/courses', { cookie: admin.cookie }, { title: 'Тестовый курс' }))
      .statusCode,
    403,
  );
  assert.equal(
    (
      await request(
        'POST',
        '/api/courses',
        { ...admin, origin: 'https://evil.invalid' },
        { title: 'Тестовый курс' },
      )
    ).statusCode,
    403,
  );
});
test('self-registration creates a student, never an administrator', async () => {
  const r = await request(
    'POST',
    '/api/auth/register',
    {},
    {
      name: 'Новый ученик',
      email: 'new@test.local',
      password: 'TestingPassword2026!',
      role: 'admin',
    },
  );
  assert.equal(r.statusCode, 201, r.body);
  assert.equal(r.json().user.role, 'student');
  assert.ok(r.cookies[0].httpOnly);
});
test('administrator creates a draft which is hidden from students', async () => {
  const r = await request('POST', '/api/courses', admin, {
    title: 'Безопасная работа',
    self_enroll: false,
  });
  assert.equal(r.statusCode, 201, r.body);
  courseId = r.json().id;
  assert.equal((await request('GET', `/api/courses/${courseId}`, student)).statusCode, 404);
  assert.equal(
    (await request('PATCH', `/api/courses/${courseId}`, admin, { published: true })).statusCode,
    400,
  );
});
test('constructor validates answers and target bounds', async () => {
  const badQuiz = structuredClone(quiz);
  badQuiz.questions[0].correctIndex = 4;
  assert.equal(
    (
      await request('POST', `/api/courses/${courseId}/lessons`, admin, {
        title: 'Некорректный тест',
        type: 'quiz',
        activity: badQuiz,
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await request('POST', `/api/courses/${courseId}/lessons`, admin, {
        title: 'Некорректная сцена',
        type: 'hotspot',
        activity: { ...hotspot, target: { x: 95, y: 20, width: 30, height: 20 } },
      })
    ).statusCode,
    400,
  );
});
test('administrator creates quiz and hotspot lessons, publishes and assigns course', async () => {
  const q = await request('POST', `/api/courses/${courseId}/lessons`, admin, {
    title: 'Основные правила',
    type: 'quiz',
    activity: quiz,
  });
  assert.equal(q.statusCode, 201, q.body);
  quizId = q.json().id;
  const h = await request('POST', `/api/courses/${courseId}/lessons`, admin, {
    title: 'Безопасная зона',
    type: 'hotspot',
    position: 1,
    activity: hotspot,
  });
  assert.equal(h.statusCode, 201, h.body);
  hotspotId = h.json().id;
  assert.equal(
    (await request('PATCH', `/api/courses/${courseId}`, admin, { published: true })).statusCode,
    200,
  );
  assert.equal(
    (await request('POST', `/api/courses/${courseId}/enrollments`, admin, { userIds: [studentId] }))
      .statusCode,
    200,
  );
});
test('student payload contains neither correct answers nor target coordinates', async () => {
  const r = await request('GET', `/api/courses/${courseId}`, student);
  assert.equal(r.statusCode, 200, r.body);
  const [q, h] = r.json().lessons;
  assert.equal(q.activity.questions[0].correctIndex, undefined);
  assert.equal(q.activity.questions[0].explanation, undefined);
  assert.equal(h.activity.target, undefined);
  assert.equal(h.activity.targets, undefined);
  assert.deepEqual(h.activity.start, { x: 50, y: 85 });
  assert.equal(
    (await request('POST', `/api/lessons/${quizId}/attempt`, outsider, { response: { q1: 1 } }))
      .statusCode,
    404,
  );
});
test('quiz submission is blind, immutable and recorded before final course results', async () => {
  const saved = await request('POST', `/api/lessons/${quizId}/attempt`, student, {
    response: { q1: 1 },
  });
  assert.equal(saved.statusCode, 200, saved.body);
  assert.deepEqual(saved.json(), { submitted: true, resultsAvailable: false });
  const view = (await request('GET', `/api/courses/${courseId}`, student)).json();
  assert.equal(view.lessons[0].score, undefined);
  assert.equal(view.lessons[0].passed, undefined);
  assert.ok(view.lessons[0].submitted_at);
  assert.equal((await request('GET', `/api/courses/${courseId}/results`, student)).statusCode, 409);
  assert.equal(
    (await request('POST', `/api/lessons/${quizId}/attempt`, student, { response: { q1: 0 } }))
      .statusCode,
    409,
  );
  const [stored] = await sql(
    'SELECT score,passed FROM progress WHERE user_id=$1 AND lesson_id=$2',
    [studentId, quizId],
  );
  assert.equal(stored.score, 100);
  assert.equal(stored.passed, true);
});

test('the final visual submission unlocks aggregate results without revealing answers', async () => {
  const saved = await request('POST', `/api/lessons/${hotspotId}/attempt`, student, {
    response: { x: 20, y: 30 },
  });
  assert.deepEqual(saved.json(), { submitted: true, resultsAvailable: true });
  const result = await request('GET', `/api/courses/${courseId}/results`, student);
  assert.equal(result.statusCode, 200, result.body);
  assert.equal(result.json().score, 100);
  const certId = result.json().certificateId;
  assert.ok(certId);
  assert.equal((await request('GET', `/api/certificates/${certId}`, student)).statusCode, 200);
  assert.equal((await request('GET', `/api/certificates/${certId}`, outsider)).statusCode, 404);
  assert.equal(
    (
      await request('POST', `/api/lessons/${hotspotId}/attempt`, student, {
        response: { x: 80, y: 80 },
      })
    ).statusCode,
    409,
  );
  const [stats] = await sql('SELECT sum(xp)::int AS xp FROM progress WHERE user_id=$1', [
    studentId,
  ]);
  assert.equal(stats.xp, 125);
  assert.equal((await sql('SELECT * FROM certificates WHERE user_id=$1', [studentId])).length, 1);
  for (const lesson of result.json().lessons) {
    assert.equal(lesson.details, undefined);
    assert.equal(lesson.response, undefined);
    assert.equal(lesson.activity, undefined);
  }
});

test('started published courses can be edited without losing results; a copy remains independent', async () => {
  const before = await sql('SELECT * FROM progress WHERE lesson_id=$1 ORDER BY user_id', [quizId]);
  const certificates = await sql('SELECT * FROM certificates WHERE course_id=$1', [courseId]);
  assert.equal(
    (
      await request('PATCH', `/api/lessons/${quizId}`, admin, {
        title: 'Изменённый урок',
        body: 'Обновлённый материал',
      })
    ).statusCode,
    200,
  );
  assert.deepEqual(
    await sql('SELECT * FROM progress WHERE lesson_id=$1 ORDER BY user_id', [quizId]),
    before,
  );
  assert.deepEqual(
    await sql('SELECT * FROM certificates WHERE course_id=$1', [courseId]),
    certificates,
  );
  const extra = await request('POST', `/api/courses/${courseId}/lessons`, admin, {
    title: 'Новый урок в опубликованном курсе',
    type: 'quiz',
    position: 2,
    activity: quiz,
  });
  assert.equal(extra.statusCode, 201, extra.body);
  assert.equal(
    (await request('PATCH', `/api/lessons/${extra.json().id}`, admin, { position: 3 })).statusCode,
    200,
  );
  assert.equal((await request('DELETE', `/api/lessons/${extra.json().id}`, admin)).statusCode, 200);
  assert.equal((await request('GET', `/api/courses/${courseId}`, student)).json().published, true);
  const copy = await request('POST', `/api/courses/${courseId}/copy`, admin);
  assert.equal(copy.statusCode, 200, copy.body);
  const fresh = await request('GET', `/api/courses/${copy.json().id}`, admin);
  assert.equal(fresh.json().published, false);
  assert.equal(fresh.json().lessons.length, 2);
  assert.notEqual(fresh.json().lessons[0].id, quizId);
});
test('large uploads are bounded and only administrators can initiate uploads', async () => {
  assert.equal(
    (await request('POST', '/api/uploads', student, { name: 'file.mp4', size: 10 })).statusCode,
    403,
  );
  assert.equal(
    (await request('POST', '/api/uploads', admin, { name: 'file.mp4', size: 20 * 1024 ** 3 }))
      .statusCode,
    400,
  );
});
let video: Buffer;
test('upload resumes from persisted byte offset, rejects duplicates and incomplete finalization', async () => {
  const source = path.join(process.env.MEDIA_ROOT!, 'sample.mp4');
  await command(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=640x360:rate=12',
      '-t',
      '2',
      '-c:v',
      'libx264',
      '-threads',
      '1',
      '-pix_fmt',
      'yuv420p',
      source,
    ],
    30_000,
  );
  video = await readFile(source);
  const r = await request('POST', '/api/uploads', admin, {
    name: 'sample.mp4',
    size: video.length,
  });
  assert.equal(r.statusCode, 201, r.body);
  uploadId = r.json().id;
  const half = Math.floor(video.length / 2);
  const headers = { ...admin, 'content-type': 'application/octet-stream', 'upload-offset': '0' };
  assert.equal(
    (await request('PUT', `/api/uploads/${uploadId}`, headers, video.subarray(0, half))).statusCode,
    200,
  );
  assert.equal(
    (await request('PUT', `/api/uploads/${uploadId}`, headers, video.subarray(0, half))).statusCode,
    409,
  );
  assert.equal((await request('POST', `/api/uploads/${uploadId}/complete`, admin)).statusCode, 400);
  assert.equal((await request('GET', `/api/uploads/${uploadId}`, admin)).json().offset, half);
  assert.equal(
    (
      await request(
        'PUT',
        `/api/uploads/${uploadId}`,
        { ...headers, 'upload-offset': String(half) },
        video.subarray(half),
      )
    ).statusCode,
    200,
  );
  assert.deepEqual(await readFile(uploadPath(uploadId)), video);
  assert.equal((await request('POST', `/api/uploads/${uploadId}/complete`, admin)).statusCode, 200);
  assert.equal((await request('POST', `/api/uploads/${uploadId}/complete`, admin)).statusCode, 200);
});
test('worker produces playable HLS, poster and removes the successfully processed source', async () => {
  assert.equal(await processNext(), true);
  const [media] = await sql('SELECT * FROM media WHERE id=$1', [uploadId]);
  assert.equal(media.status, 'ready', media.error);
  assert.ok(media.duration > 1);
  assert.match(
    await readFile(path.join(process.env.MEDIA_ROOT!, 'media', uploadId, 'master.m3u8'), 'utf8'),
    /v360\/index.m3u8/,
  );
  await assert.rejects(stat(uploadPath(uploadId)));
});
test('video manifests and segments require course enrollment; byte ranges work', async () => {
  const r = await request('POST', '/api/courses', admin, {
    title: 'Курс с видео',
    self_enroll: true,
  });
  videoCourseId = r.json().id;
  const lesson = await request('POST', `/api/courses/${videoCourseId}/lessons`, admin, {
    title: 'Учебный ролик',
    type: 'video',
    video_id: uploadId,
  });
  videoLessonId = lesson.json().id;
  await request('PATCH', `/api/courses/${videoCourseId}`, admin, { published: true });
  assert.equal(
    (await request('GET', `/api/media/${uploadId}/master.m3u8`, student)).statusCode,
    404,
  );
  await request('POST', `/api/courses/${videoCourseId}/enroll`, student);
  const master = await request('GET', `/api/media/${uploadId}/master.m3u8`, student);
  assert.equal(master.statusCode, 200, master.body);
  assert.match(master.headers['content-type']!, /mpegurl/);
  const segment = await request('GET', `/api/media/${uploadId}/v360/00000.ts`, {
    ...student,
    range: 'bytes=0-99',
  });
  assert.equal(segment.statusCode, 206, segment.body);
  assert.equal(segment.rawPayload.length, 100);
  assert.equal(
    (await request('GET', `/api/media/${uploadId}/poster.jpg`, outsider)).statusCode,
    404,
  );
});
test('seeking to the end without watch time does not complete a video', async () => {
  const r = await request('POST', `/api/lessons/${videoLessonId}/progress`, student, {
    position: 2,
  });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().completed_at, null);
  assert.equal(r.json().watched_seconds, 0);
});
test('a genuine elapsed viewing interval completes video and issues its course certificate', async () => {
  await sql(
    `UPDATE progress SET position_seconds=0,last_ping_at=now()-interval '3 seconds' WHERE lesson_id=$1 AND user_id=$2`,
    [videoLessonId, studentId],
  );
  const r = await request('POST', `/api/lessons/${videoLessonId}/progress`, student, {
    position: 2,
    rate: 1,
  });
  assert.ok(r.json().completed_at, r.body);
  assert.equal(r.json().resultsAvailable, true);
  assert.ok(
    (await request('GET', `/api/courses/${videoCourseId}/results`, student)).json().certificateId,
  );
});
test('invalid container fails safely and exposes retryable processing status', async () => {
  const r = await request('POST', '/api/uploads', admin, { name: 'malicious.mp4', size: 16 });
  const id = r.json().id;
  await request(
    'PUT',
    `/api/uploads/${id}`,
    { ...admin, 'content-type': 'application/octet-stream', 'upload-offset': '0' },
    Buffer.from('#EXTM3U\ninvalid!'),
  );
  await request('POST', `/api/uploads/${id}/complete`, admin);
  assert.equal(await processNext(), true);
  const [media] = await sql('SELECT status,error FROM media WHERE id=$1', [id]);
  assert.equal(media.status, 'failed');
  assert.match(media.error, /MP4/);
  assert.equal((await request('POST', `/api/media/${id}/retry`, admin)).statusCode, 200);
  await sql(`UPDATE media SET status='failed' WHERE id=$1`, [id]);
});
test('used media cannot be deleted, while unused failed media can be removed', async () => {
  assert.equal((await request('DELETE', `/api/media/${uploadId}`, admin)).statusCode, 409);
  const [failed] = await sql("SELECT id FROM media WHERE status='failed' LIMIT 1");
  assert.equal((await request('DELETE', `/api/media/${failed.id}`, admin)).statusCode, 200);
  await assert.rejects(stat(uploadPath(failed.id)));
});
test('unfinished uploads can be cancelled and are isolated by owner', async () => {
  const r = await request('POST', '/api/uploads', admin, { name: 'unfinished.mp4', size: 100 });
  const id = r.json().id;
  const owner = randomUUID();
  await sql(
    "INSERT INTO users(id,email,name,password_hash,role) VALUES($1,'other-admin@test.local','Другой администратор',$2,'admin')",
    [owner, await hashPassword('TestingPassword2026!')],
  );
  const other = await login('other-admin@test.local', 'TestingPassword2026!');
  assert.equal((await request('GET', `/api/uploads/${id}`, other)).statusCode, 404);
  assert.equal((await request('DELETE', `/api/uploads/${id}`, other)).statusCode, 409);
  assert.equal((await request('DELETE', `/api/uploads/${id}`, admin)).statusCode, 200);
  await assert.rejects(stat(uploadPath(id)));
});
test('scene uploads re-encode image data and reject disguised non-images', async () => {
  const sharp = (await import('sharp')).default;
  const image = await sharp({
    create: { width: 100, height: 80, channels: 3, background: '#668855' },
  })
    .png()
    .toBuffer();
  const boundary = 'praktika-test-boundary';
  const send = async (bytes: Buffer) =>
    request(
      'POST',
      '/api/images',
      { ...admin, 'content-type': `multipart/form-data; boundary=${boundary}` },
      Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="scene.png"\r\nContent-Type: image/png\r\n\r\n`,
        ),
        bytes,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]),
    );
  const r = await send(image);
  assert.equal(r.statusCode, 201, r.body);
  const asset = await request('GET', r.json().url, admin);
  assert.equal(asset.statusCode, 200);
  assert.match(asset.headers['content-type']!, /webp/);
  assert.equal((await send(Buffer.from('not-an-image'))).statusCode, 400);
  assert.equal((await request('DELETE', `/api/media/${r.json().id}`, admin)).statusCode, 200);
});
test('report export escapes spreadsheet formulas and includes actual results', async () => {
  await sql('UPDATE users SET name=$2 WHERE id=$1', [studentId, '=HYPERLINK("bad")']);
  const report = await request('GET', '/api/reports.csv', admin);
  assert.equal(report.statusCode, 200);
  assert.match(report.body, /'=HYPERLINK/);
  assert.match(report.body, /Безопасная работа/);
});
test('password reset revokes existing sessions', async () => {
  const r = await request('PATCH', `/api/users/${studentId}`, admin, {
    password: 'NewPasswordForTest2026!',
  });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal((await request('GET', '/api/auth/me', student)).statusCode, 401);
  student = await login('student@test.local', 'NewPasswordForTest2026!');
});
test('course deletion requires an administrator, CSRF and explicit confirmation', async () => {
  const url = `/api/courses/${courseId}`;
  assert.equal((await request('DELETE', url, {}, { confirm: true })).statusCode, 401);
  assert.equal((await request('DELETE', url, student, { confirm: true })).statusCode, 403);
  assert.equal(
    (await request('DELETE', url, { cookie: admin.cookie }, { confirm: true })).statusCode,
    403,
  );
  assert.equal((await request('DELETE', url, admin)).statusCode, 400);
  assert.equal((await request('DELETE', url, admin, { confirm: false })).statusCode, 400);
  assert.equal((await request('GET', url, admin)).statusCode, 200);
});
test('a published course in progress can be deleted without affecting shared media or other courses', async () => {
  const created = await request('POST', '/api/courses', admin, { title: 'Удаляемый начатый курс' });
  assert.equal(created.statusCode, 201, created.body);
  const id = created.json().id;
  const video = await request('POST', `/api/courses/${id}/lessons`, admin, {
    title: 'Ещё не пройденное видео',
    type: 'video',
    video_id: uploadId,
  });
  const exercise = await request('POST', `/api/courses/${id}/lessons`, admin, {
    title: 'Пройденное задание',
    type: 'quiz',
    position: 1,
    activity: quiz,
  });
  assert.equal(video.statusCode, 201, video.body);
  assert.equal(exercise.statusCode, 201, exercise.body);
  assert.equal(
    (await request('PATCH', `/api/courses/${id}`, admin, { published: true })).statusCode,
    200,
  );
  await request('POST', `/api/courses/${id}/enrollments`, admin, { userIds: [studentId] });
  await request('POST', `/api/lessons/${video.json().id}/progress`, student, { position: 0 });
  const attempt = await request('POST', `/api/lessons/${exercise.json().id}/attempt`, student, {
    response: { q1: 1 },
  });
  assert.deepEqual(attempt.json(), { submitted: true, resultsAvailable: false });
  const [before] = await sql(
    'SELECT count(*)::int AS count FROM progress WHERE lesson_id IN ($1,$2)',
    [video.json().id, exercise.json().id],
  );
  assert.equal(before.count, 2);

  const deleted = await request('DELETE', `/api/courses/${id}`, admin, { confirm: true });
  assert.equal(deleted.statusCode, 200, deleted.body);
  assert.equal((await request('GET', `/api/courses/${id}`, student)).statusCode, 404);
  assert.equal((await request('GET', `/api/courses/${id}`, admin)).statusCode, 404);
  for (const table of ['lessons', 'enrollments']) {
    assert.equal((await sql(`SELECT * FROM ${table} WHERE course_id=$1`, [id])).length, 0);
  }
  for (const table of ['progress', 'attempts']) {
    assert.equal(
      (
        await sql(`SELECT * FROM ${table} WHERE lesson_id IN ($1,$2)`, [
          video.json().id,
          exercise.json().id,
        ])
      ).length,
      0,
    );
  }
  assert.equal((await request('GET', `/api/courses/${videoCourseId}`, student)).statusCode, 200);
  assert.equal(
    (await request('GET', `/api/media/${uploadId}/master.m3u8`, student)).statusCode,
    200,
  );
  const report = await request('GET', '/api/reports', admin);
  assert.equal(
    report.json().some((row: any) => row.course_id === id),
    false,
  );
});
test('deleting a completed course removes its certificates and XP, but preserves the learner account', async () => {
  const [certificate] = await sql('SELECT id FROM certificates WHERE course_id=$1 AND user_id=$2', [
    courseId,
    studentId,
  ]);
  assert.ok(certificate);
  assert.equal(
    (await request('PATCH', `/api/courses/${courseId}`, admin, { published: true })).statusCode,
    200,
  );
  const response = await request('DELETE', `/api/courses/${courseId}`, admin, { confirm: true });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(
    (await request('GET', `/api/certificates/${certificate.id}`, admin)).statusCode,
    404,
  );
  assert.equal((await sql('SELECT * FROM certificates WHERE course_id=$1', [courseId])).length, 0);
  for (const table of ['progress', 'attempts']) {
    assert.equal(
      (await sql(`SELECT * FROM ${table} WHERE lesson_id IN ($1,$2)`, [quizId, hotspotId])).length,
      0,
    );
  }
  const dashboard = await request('GET', '/api/dashboard', student);
  assert.equal(dashboard.statusCode, 200, dashboard.body);
  assert.equal(dashboard.json().xp, 30);
  assert.equal(dashboard.json().certificates.length, 1);
  assert.equal((await request('GET', '/api/auth/me', student)).statusCode, 200);
  assert.equal(
    (await request('DELETE', `/api/courses/${courseId}`, admin, { confirm: true })).statusCode,
    404,
  );
  assert.equal(
    (await request('DELETE', `/api/courses/${randomUUID()}`, admin, { confirm: true })).statusCode,
    404,
  );
});
test('multiple zones accept any safe target, preserve legacy lessons and conceal answers', () => {
  const config = {
    instruction: hotspot.instruction,
    targets: [
      { x: 5, y: 10, width: 15, height: 20 },
      { x: 60, y: 60, width: 20, height: 20 },
    ],
    start: { x: 45, y: 90 },
    explanation: 'Выберите зелёную зону.',
  };
  assert.equal(evaluate('hotspot', config, { x: 10, y: 20 }).passed, true);
  assert.equal(evaluate('hotspot', config, { x: 70, y: 70 }).passed, true);
  assert.equal(evaluate('hotspot', config, { x: 45, y: 45 }).passed, false);
  assert.equal(evaluate('hotspot', hotspot, { x: 20, y: 30 }).passed, true);
  assert.deepEqual(hotspotSchema.parse(hotspot).start, { x: 50, y: 85 });
  const visible = safeLesson({ type: 'hotspot', activity: config }, false);
  assert.deepEqual(visible.activity, {
    instruction: config.instruction,
    start: config.start,
    questions: [],
  });
  for (const invalid of [
    { ...config, targets: [] },
    { ...config, targets: [{ x: 95, y: 10, width: 20, height: 20 }] },
    { ...config, start: { x: 101, y: 30 } },
    { ...config, targets: Array(21).fill(config.targets[0]) },
  ])
    assert.equal(hotspotSchema.safeParse(invalid).success, false);
});
test('a live multi-zone lesson stores its starting point, grades each zone and hides target data', async () => {
  const created = await request('POST', '/api/courses', admin, {
    title: 'Новые возможности визуальной практики',
  });
  const id = created.json().id;
  const body = {
    title: 'Две безопасные зоны',
    type: 'hotspot',
    activity: {
      instruction: 'Выберите любое безопасное место.',
      targets: [
        { x: 5, y: 10, width: 15, height: 20 },
        { x: 60, y: 60, width: 20, height: 20 },
      ],
      start: { x: 45, y: 90 },
    },
  };
  const lesson = await request('POST', `/api/courses/${id}/lessons`, admin, body);
  assert.equal(lesson.statusCode, 201, lesson.body);
  await request('PATCH', `/api/courses/${id}`, admin, { published: true });
  await request('POST', `/api/courses/${id}/enrollments`, admin, { userIds: [outsiderId] });
  const view = await request('GET', `/api/courses/${id}`, outsider);
  const activity = view.json().lessons[0].activity;
  assert.deepEqual(activity.start, body.activity.start);
  assert.equal(activity.targets, undefined);
  assert.equal(activity.target, undefined);
  assert.deepEqual(
    (
      await request('POST', `/api/lessons/${lesson.json().id}/attempt`, outsider, {
        response: { x: 10, y: 20 },
      })
    ).json(),
    { submitted: true, resultsAvailable: true },
  );
  assert.equal(
    (
      await request('POST', `/api/lessons/${lesson.json().id}/attempt`, outsider, {
        response: { x: 70, y: 70 },
      })
    ).statusCode,
    409,
  );
  assert.equal((await request('GET', `/api/courses/${id}/results`, outsider)).json().score, 100);
  const edit = await request('PATCH', `/api/lessons/${lesson.json().id}`, admin, {
    activity: { ...body.activity, start: { x: 40, y: 80 } },
  });
  assert.equal(edit.statusCode, 200, edit.body);
  assert.equal((await request('GET', '/api/dashboard', outsider)).json().xp, 75);
});
test('new lessons on a completed live course preserve its certificate without reporting new lessons as completed', async () => {
  const course = (
    await request('POST', '/api/courses', admin, { title: 'Обновляемое обучение' })
  ).json();
  const first = (
    await request('POST', `/api/courses/${course.id}/lessons`, admin, {
      title: 'Первое задание курса',
      type: 'quiz',
      activity: quiz,
    })
  ).json();
  await request('PATCH', `/api/courses/${course.id}`, admin, { published: true });
  await request('POST', `/api/courses/${course.id}/enrollments`, admin, { userIds: [outsiderId] });
  const done = await request('POST', `/api/lessons/${first.id}/attempt`, outsider, {
    response: { q1: 1 },
  });
  assert.equal(done.json().resultsAvailable, true);
  const certificate = (await request('GET', `/api/courses/${course.id}/results`, outsider)).json()
    .certificateId;
  assert.ok(certificate);
  const extra = await request('POST', `/api/courses/${course.id}/lessons`, admin, {
    title: 'Новый материал курса',
    type: 'quiz',
    position: 1,
    activity: quiz,
  });
  assert.equal(extra.statusCode, 201, extra.body);
  assert.equal(
    (await request('POST', `/api/lessons/${first.id}/attempt`, outsider, { response: { q1: 1 } }))
      .statusCode,
    409,
  );
  assert.equal(
    (await request('GET', `/api/courses/${course.id}/results`, outsider)).statusCode,
    409,
  );
  assert.equal(
    (await request('GET', `/api/certificates/${certificate}`, outsider)).statusCode,
    200,
  );
  const lessons = (await request('GET', `/api/courses/${course.id}`, outsider)).json().lessons;
  assert.ok(lessons.find((l: any) => l.id === first.id).completed_at);
  assert.equal(lessons.find((l: any) => l.id === extra.json().id).completed_at, null);
  assert.equal(
    (
      await request('POST', `/api/lessons/${extra.json().id}/attempt`, outsider, {
        response: { q1: 1 },
      })
    ).json().resultsAvailable,
    true,
  );
  assert.equal(
    (await request('GET', `/api/courses/${course.id}/results`, outsider)).json().certificateId,
    certificate,
  );
  assert.equal((await request('DELETE', `/api/lessons/${extra.json().id}`, admin)).statusCode, 200);
  assert.equal((await request('DELETE', `/api/lessons/${first.id}`, admin)).statusCode, 200);
  assert.equal((await request('GET', `/api/courses/${course.id}`, admin)).json().published, false);
  assert.equal(
    (await request('GET', `/api/certificates/${certificate}`, outsider)).statusCode,
    200,
  );
});
test('quiz video and photo stay private, watching does not pass the test or overwrite its XP', async () => {
  const sharp = (await import('sharp')).default;
  const imageId = randomUUID();
  await mkdir(mediaPath(imageId), { recursive: true });
  await sharp({ create: { width: 200, height: 100, channels: 3, background: '#448855' } })
    .webp()
    .toFile(path.join(mediaPath(imageId), 'image.webp'));
  await sql(
    "INSERT INTO media(id,kind,name,owner_id,status) VALUES($1,'image','Quiz introduction',$2,'ready')",
    [imageId, adminId],
  );
  const course = (
    await request('POST', '/api/courses', admin, { title: 'Тест с видео и фотографией' })
  ).json();
  const lesson = await request('POST', `/api/courses/${course.id}/lessons`, admin, {
    title: 'Видеоматериал и вопросы',
    type: 'quiz',
    video_id: uploadId,
    image_id: imageId,
    activity: quiz,
  });
  assert.equal(lesson.statusCode, 201, lesson.body);
  assert.equal(
    (await request('PATCH', `/api/courses/${course.id}`, admin, { published: true })).statusCode,
    200,
  );
  await request('POST', `/api/courses/${course.id}/enrollments`, admin, { userIds: [studentId] });
  assert.equal(
    (await request('GET', `/api/media/${imageId}/image.webp`, outsider)).statusCode,
    404,
  );
  assert.equal((await request('GET', `/api/media/${imageId}/image.webp`, student)).statusCode, 200);
  assert.equal(
    (await request('GET', `/api/media/${uploadId}/master.m3u8`, student)).statusCode,
    200,
  );
  await request('POST', `/api/lessons/${lesson.json().id}/progress`, student, { position: 0 });
  await sql(
    "UPDATE progress SET last_ping_at=now()-interval '3 seconds' WHERE lesson_id=$1 AND user_id=$2",
    [lesson.json().id, studentId],
  );
  const viewing = await request('POST', `/api/lessons/${lesson.json().id}/progress`, student, {
    position: 2,
  });
  assert.equal(viewing.statusCode, 200, viewing.body);
  assert.equal(viewing.json().completed_at, null);
  assert.equal(viewing.json().score, undefined);
  assert.equal(viewing.json().xp, undefined);
  assert.equal(viewing.json().certificateId, undefined);
  const completed = await request('POST', `/api/lessons/${lesson.json().id}/attempt`, student, {
    response: { q1: 1 },
  });
  assert.equal(completed.json().resultsAvailable, true);
  assert.ok(
    (await request('GET', `/api/courses/${course.id}/results`, student)).json().certificateId,
  );
  const afterwards = await request('POST', `/api/lessons/${lesson.json().id}/progress`, student, {
    position: 2,
  });
  assert.equal(afterwards.json().score, undefined);
  assert.equal(afterwards.json().passed, undefined);
  assert.ok(afterwards.json().completed_at);
  const reset = await request('PATCH', `/api/lessons/${lesson.json().id}`, admin, {
    video_id: null,
  });
  assert.equal(reset.statusCode, 200, reset.body);
  const [stored] = await sql('SELECT * FROM progress WHERE user_id=$1 AND lesson_id=$2', [
    studentId,
    lesson.json().id,
  ]);
  assert.equal(stored.position_seconds, 0);
  assert.equal(stored.watched_seconds, 0);
  assert.equal(stored.xp, 50);
  assert.ok(stored.completed_at);
  const queuedId = randomUUID();
  await sql(
    "INSERT INTO media(id,kind,name,owner_id,status) VALUES($1,'video','Pending introduction',$2,'queued')",
    [queuedId, adminId],
  );
  assert.equal(
    (await request('PATCH', `/api/lessons/${lesson.json().id}`, admin, { video_id: queuedId }))
      .statusCode,
    400,
  );
  const draft = (
    await request('POST', '/api/courses', admin, { title: 'Черновик с обрабатываемым вступлением' })
  ).json();
  const pending = await request('POST', `/api/courses/${draft.id}/lessons`, admin, {
    title: 'Вступление перед тестом',
    type: 'quiz',
    activity: quiz,
    video_id: queuedId,
  });
  assert.equal(pending.statusCode, 201, pending.body);
  assert.equal(
    (await request('PATCH', `/api/courses/${draft.id}`, admin, { published: true })).statusCode,
    400,
  );
});
test('partial checkbox grades subtract wrong choices, retain fractions and support legacy questions', () => {
  const activity = {
    passPercent: 80,
    questions: [
      {
        id: 'multi',
        prompt: 'Выберите безопасные действия',
        multiple: true,
        options: ['Первое', 'Второе', 'Третье', 'Четвёртое', 'Неверное', 'Ещё неверное'],
        correctIndexes: [0, 1, 2, 3],
      },
    ],
  };
  for (const [selected, score] of [
    [[], 0],
    [[0], 25],
    [[0, 1], 50],
    [[0, 1, 2], 75],
    [[3, 2, 1, 0], 100],
    [[0, 4], 0],
    [[0, 1, 4], 25],
    [[0, 1, 2, 3, 4, 5], 50],
  ] as [number[], number][]) {
    const result = evaluate('quiz', activity, { multi: selected });
    assert.equal(result.score, score);
    assert.equal(result.details[0].score, score);
  }
  assert.throws(() => evaluate('quiz', activity, { multi: [0, 0] }));
  assert.throws(() => evaluate('quiz', activity, { multi: [8] }));
  assert.equal(evaluate('quiz', quiz, { q1: 1 }).score, 100);
  assert.equal(evaluate('quiz', quiz, { q1: 0 }).score, 0);
  const thirds = {
    ...activity,
    questions: [{ ...activity.questions[0], correctIndexes: [0, 1, 2] }],
  };
  assert.equal(evaluate('quiz', thirds, { multi: [0] }).score, 33.33);
});

test('quiz constructor validates multiple correct answers and keeps all answer keys private', () => {
  const question = {
    id: 'multi',
    prompt: 'Выберите безопасные действия',
    multiple: true,
    options: ['Проверить оборудование', 'Игнорировать риск', 'Надеть средства защиты'],
    correctIndexes: [0, 2],
    explanation: 'Проверяйте рабочее место и средства защиты.',
  };
  assert.equal(quizSchema.safeParse({ questions: [question] }).success, true);
  for (const indexes of [undefined, [], [0, 0], [0, 3]])
    assert.equal(
      quizSchema.safeParse({ questions: [{ ...question, correctIndexes: indexes }] }).success,
      false,
    );
  assert.equal(
    quizSchema.safeParse({
      questions: [{ ...question, multiple: false, correctIndexes: undefined }],
    }).success,
    false,
  );
  const visible = safeLesson(
    { type: 'quiz', activity: { passPercent: 80, questions: [{ ...question, correctIndex: 0 }] } },
    false,
  ).activity.questions[0];
  assert.equal(visible.multiple, true);
  assert.equal(visible.correctIndex, undefined);
  assert.equal(visible.correctIndexes, undefined);
  assert.equal(visible.explanation, undefined);
});
test('a partial first checkbox submission is final and earns completion XP only once', async () => {
  const course = (
    await request('POST', '/api/courses', admin, { title: 'Проверка частичных ответов' })
  ).json();
  const activity = {
    passPercent: 80,
    questions: [
      {
        id: 'multi',
        prompt: 'Отметьте безопасные действия',
        multiple: true,
        options: ['Первое', 'Второе', 'Третье', 'Четвёртое', 'Неверное'],
        correctIndexes: [0, 1, 2, 3],
      },
    ],
  };
  const bad = await request('POST', `/api/courses/${course.id}/lessons`, admin, {
    title: 'Некорректное задание',
    type: 'quiz',
    activity: { ...activity, questions: [{ ...activity.questions[0], correctIndexes: [] }] },
  });
  assert.equal(bad.statusCode, 400);
  const lesson = (
    await request('POST', `/api/courses/${course.id}/lessons`, admin, {
      title: 'Безопасные действия',
      type: 'quiz',
      activity,
    })
  ).json();
  assert.deepEqual(lesson.activity.questions[0].correctIndexes, [0, 1, 2, 3]);
  await request('PATCH', `/api/courses/${course.id}`, admin, { published: true });
  await request('POST', `/api/courses/${course.id}/enrollments`, admin, { userIds: [studentId] });
  const before = (await request('GET', '/api/dashboard', student)).json().xp;
  const saved = await request('POST', `/api/lessons/${lesson.id}/attempt`, student, {
    response: { multi: [0] },
  });
  assert.deepEqual(saved.json(), { submitted: true, resultsAvailable: true });
  const final = (await request('GET', `/api/courses/${course.id}/results`, student)).json();
  assert.equal(final.score, 25);
  assert.equal(final.passed, false);
  assert.equal(final.certificateId, null);
  assert.equal(final.lessons[0].score, 25);
  for (const selection of [
    [0, 1, 2, 3],
    [0, 0],
    [0, 1, 2, 3, 4],
  ])
    assert.equal(
      (
        await request('POST', `/api/lessons/${lesson.id}/attempt`, student, {
          response: { multi: selection },
        })
      ).statusCode,
      409,
    );
  assert.equal((await request('GET', '/api/dashboard', student)).json().xp, before + 50);
  assert.equal(
    (await sql('SELECT * FROM attempts WHERE user_id=$1 AND lesson_id=$2', [studentId, lesson.id]))
      .length,
    1,
  );
  assert.equal(
    (await request('GET', `/api/courses/${course.id}/results`, student)).json().score,
    25,
  );
});
test('visual zones grade green at 100, yellow at 50 and overlap by the best grade', () => {
  const activity = {
    instruction: 'Выберите положение работника.',
    targets: [
      { x: 10, y: 10, width: 30, height: 30, score: 50 },
      { x: 20, y: 20, width: 10, height: 10, score: 100 },
    ],
    start: { x: 80, y: 80 },
  };
  assert.equal(evaluate('hotspot', activity, { x: 15, y: 15 }).score, 50);
  assert.equal(evaluate('hotspot', activity, { x: 25, y: 25 }).score, 100);
  assert.equal(evaluate('hotspot', activity, { x: 80, y: 80 }).score, 0);
  assert.equal(evaluate('hotspot', hotspot, { x: 20, y: 30 }).score, 100);
  assert.equal(
    hotspotSchema.safeParse({ ...activity, targets: [{ ...activity.targets[0], score: 75 }] })
      .success,
    false,
  );
});
test('grades stay private until the whole course is finished and administrators see each recorded percentage', async () => {
  const course = (
    await request('POST', '/api/courses', admin, { title: 'Проверка знаний целиком' })
  ).json();
  const activity = {
    passPercent: 80,
    questions: [
      {
        id: 'four',
        prompt: 'Отметьте безопасные действия.',
        multiple: true,
        options: ['Первое', 'Второе', 'Третье', 'Четвёртое', 'Опасное'],
        correctIndexes: [0, 1, 2, 3],
        explanation: 'НЕ ПОКАЗЫВАТЬ УЧЕНИКУ',
      },
    ],
  };
  const first = (
    await request('POST', `/api/courses/${course.id}/lessons`, admin, {
      title: 'Проверка галочек',
      type: 'quiz',
      video_id: uploadId,
      activity,
    })
  ).json();
  const second = (
    await request('POST', `/api/courses/${course.id}/lessons`, admin, {
      title: 'Проверка сцены',
      type: 'hotspot',
      position: 1,
      activity: {
        instruction: 'Выберите место.',
        targets: [
          { x: 10, y: 10, width: 20, height: 20, score: 50 },
          { x: 60, y: 60, width: 20, height: 20, score: 100 },
        ],
      },
    })
  ).json();
  await request('PATCH', `/api/courses/${course.id}`, admin, { published: true });
  await request('POST', `/api/courses/${course.id}/enrollments`, admin, { userIds: [studentId] });
  const saved = await request('POST', `/api/lessons/${first.id}/attempt`, student, {
    response: { four: [0] },
  });
  assert.deepEqual(saved.json(), { submitted: true, resultsAvailable: false });
  const visible = (await request('GET', `/api/courses/${course.id}`, student)).json();
  for (const lesson of visible.lessons) {
    assert.equal(lesson.score, undefined);
    assert.equal(lesson.passed, undefined);
    assert.equal(lesson.attempt_id, undefined);
    assert.equal(lesson.details, undefined);
  }
  assert.equal(visible.lessons[0].activity.questions[0].correctIndexes, undefined);
  assert.equal(visible.lessons[0].activity.questions[0].explanation, undefined);
  assert.equal(visible.lessons[1].activity.targets, undefined);
  assert.equal(
    (await request('GET', `/api/courses/${course.id}/results`, student)).statusCode,
    409,
  );
  const videoPing = await request('POST', `/api/lessons/${first.id}/progress`, student, {
    position: 1,
  });
  assert.equal(videoPing.json().score, undefined);
  assert.equal(videoPing.json().passed, undefined);
  assert.equal(videoPing.json().certificateId, undefined);
  assert.equal(videoPing.json().resultsAvailable, false);
  assert.equal(
    (
      await request('POST', `/api/lessons/${first.id}/attempt`, student, {
        response: { four: [0, 1, 2, 3] },
      })
    ).statusCode,
    409,
  );
  const adminView = await request('GET', `/api/reports/${studentId}/${course.id}`, admin);
  assert.equal(adminView.statusCode, 200, adminView.body);
  assert.equal(adminView.json().lessons[0].score, 25);
  assert.equal(adminView.json().lessons[0].details[0].score, 25);
  assert.equal(adminView.json().complete, false);
  assert.equal(
    (await request('GET', `/api/reports/${studentId}/${course.id}`, student)).statusCode,
    403,
  );
  assert.equal((await request('GET', '/api/reports/lessons.csv', student)).statusCode, 403);
  const finish = await request('POST', `/api/lessons/${second.id}/attempt`, student, {
    response: { x: 15, y: 15 },
  });
  assert.deepEqual(finish.json(), { submitted: true, resultsAvailable: true });
  const result = (await request('GET', `/api/courses/${course.id}/results`, student)).json();
  assert.equal(result.score, 37.5);
  assert.equal(result.passed, false);
  assert.equal(result.certificateId, null);
  assert.deepEqual(
    result.lessons.map((l: any) => l.score),
    [25, 50],
  );
  assert.equal(JSON.stringify(result).includes('НЕ ПОКАЗЫВАТЬ'), false);
  for (const lesson of result.lessons) {
    assert.equal(lesson.details, undefined);
    assert.equal(lesson.response, undefined);
    assert.equal(lesson.activity, undefined);
  }
  const rows = (await request('GET', '/api/reports', admin)).json();
  const row = rows.find((r: any) => r.user_id === studentId && r.course_id === course.id);
  assert.equal(row.score, 37.5);
  assert.equal(row.completed, 2);
  assert.equal(row.submitted, 2);
  const csv = await request('GET', '/api/reports/lessons.csv', admin);
  assert.equal(csv.statusCode, 200, csv.body);
  assert.match(csv.body, /"25"/);
  assert.match(csv.body, /"50"/);
  assert.match(csv.body, /'=HYPERLINK/);
  await request('PATCH', `/api/lessons/${first.id}`, admin, {
    activity: {
      ...activity,
      questions: [
        {
          ...activity.questions[0],
          prompt: 'Изменённый вопрос после отправки',
          correctIndexes: [0],
        },
      ],
    },
  });
  const snapshot = (await request('GET', `/api/reports/${studentId}/${course.id}`, admin)).json();
  assert.equal(snapshot.lessons[0].details[0].prompt, 'Отметьте безопасные действия.');
  assert.equal(snapshot.lessons[0].score, 25);
});
test('concurrent submissions cannot overwrite the first grade and incomplete forms do not consume a submission', async () => {
  const course = (
    await request('POST', '/api/courses', admin, { title: 'Конкурентная отправка проверки' })
  ).json();
  const lesson = (
    await request('POST', `/api/courses/${course.id}/lessons`, admin, {
      title: 'Единственная попытка',
      type: 'quiz',
      activity: quiz,
    })
  ).json();
  await request('PATCH', `/api/courses/${course.id}`, admin, { published: true });
  await request('POST', `/api/courses/${course.id}/enrollments`, admin, { userIds: [outsiderId] });
  assert.equal(
    (await request('POST', `/api/lessons/${lesson.id}/attempt`, outsider, { response: {} }))
      .statusCode,
    400,
  );
  assert.equal((await sql('SELECT * FROM attempts WHERE lesson_id=$1', [lesson.id])).length, 0);
  const pair = await Promise.all([
    request('POST', `/api/lessons/${lesson.id}/attempt`, outsider, { response: { q1: 0 } }),
    request('POST', `/api/lessons/${lesson.id}/attempt`, outsider, { response: { q1: 1 } }),
  ]);
  assert.deepEqual(pair.map((r) => r.statusCode).sort(), [200, 409]);
  const attempts = await sql('SELECT * FROM attempts WHERE lesson_id=$1', [lesson.id]);
  assert.equal(attempts.length, 1);
  const [progress] = await sql('SELECT * FROM progress WHERE lesson_id=$1 AND user_id=$2', [
    lesson.id,
    outsiderId,
  ]);
  assert.equal(progress.score, evaluate('quiz', quiz, attempts[0].response).score);
  assert.equal(progress.attempt_id, attempts[0].id);
  assert.ok(progress.submitted_at);
  const before = progress.score;
  assert.equal(
    (
      await request('POST', `/api/lessons/${lesson.id}/attempt`, outsider, {
        response: { q1: before === 100 ? 0 : 1 },
      })
    ).statusCode,
    409,
  );
  assert.equal(
    (
      await sql('SELECT score FROM progress WHERE lesson_id=$1 AND user_id=$2', [
        lesson.id,
        outsiderId,
      ])
    )[0].score,
    before,
  );
});
test('visual questions share validation, hide answer keys and grade each component equally', () => {
  const activity = {
    ...hotspot,
    questions: [
      { ...quiz.questions[0], id: 'scene' },
      {
        id: 'checks',
        prompt: 'Выберите безопасные действия',
        multiple: true,
        options: ['Первое', 'Второе', 'Третье', 'Четвёртое', 'Опасное'],
        correctIndexes: [0, 1, 2, 3],
        explanation: 'Скрытое пояснение',
      },
    ],
  };
  assert.equal(hotspotSchema.parse(hotspot).questions.length, 0);
  const parsed = hotspotSchema.parse(activity);
  assert.equal(parsed.questions.length, 2);
  const visible = safeLesson({ type: 'hotspot', activity: parsed }, false).activity;
  assert.equal(visible.questions.length, 2);
  assert.equal(visible.questions[1].multiple, true);
  for (const q of visible.questions) {
    assert.equal(q.correctIndex, undefined);
    assert.equal(q.correctIndexes, undefined);
    assert.equal(q.explanation, undefined);
  }
  assert.equal(visible.targets, undefined);
  assert.equal(visible.explanation, undefined);
  for (const questions of [
    [{ ...activity.questions[0], correctIndex: 3 }],
    [{ ...activity.questions[1], correctIndexes: [] }],
    [activity.questions[0], activity.questions[0]],
    Array.from({ length: 51 }, (_, i) => ({ ...activity.questions[0], id: String(i) })),
  ])
    assert.equal(hotspotSchema.safeParse({ ...activity, questions }).success, false);
  const graded = evaluate('hotspot', activity, {
    x: 20,
    y: 30,
    answers: { scene: 1, checks: [0] },
  });
  assert.equal(graded.score, 75);
  assert.deepEqual(
    graded.details.map((d) => d.score),
    [100, 100, 25],
  );
  assert.deepEqual(
    graded.details.map((d) => d.id),
    ['scene', 'question:scene', 'question:checks'],
  );
  assert.equal(graded.passed, false);
  assert.equal(
    evaluate('hotspot', activity, { x: 20, y: 30, answers: { scene: 1, checks: [0, 4] } }).score,
    66.67,
  );
  assert.equal(
    evaluate('hotspot', activity, { x: 20, y: 30, answers: { scene: 1, checks: [0, 1, 2, 3] } })
      .passed,
    true,
  );
});
test('visual questions submit atomically once, preserve privacy and appear in individual reports', async () => {
  const course = (
    await request('POST', '/api/courses', admin, { title: 'Сцена и тест в одном уроке' })
  ).json();
  const activity = {
    instruction: 'Выберите место для работника',
    targets: [
      { x: 10, y: 10, width: 20, height: 20, score: 50 },
      { x: 60, y: 60, width: 20, height: 20, score: 100 },
    ],
    questions: [
      { ...quiz.questions[0] },
      {
        id: 'checks',
        prompt: 'Выберите безопасные действия',
        multiple: true,
        options: ['Первое', 'Второе', 'Третье', 'Четвёртое', 'Неверное'],
        correctIndexes: [0, 1, 2, 3],
      },
    ],
  };
  const invalid = await request('POST', `/api/courses/${course.id}/lessons`, admin, {
    title: 'Некорректные вопросы сцены',
    type: 'hotspot',
    activity: { ...activity, questions: [{ ...activity.questions[1], correctIndexes: [6] }] },
  });
  assert.equal(invalid.statusCode, 400);
  const created = await request('POST', `/api/courses/${course.id}/lessons`, admin, {
    title: 'Визуальная проверка с вопросами',
    type: 'hotspot',
    activity,
  });
  assert.equal(created.statusCode, 201, created.body);
  const scene = created.json();
  assert.equal(scene.activity.questions.length, 2);
  const last = (
    await request('POST', `/api/courses/${course.id}/lessons`, admin, {
      title: 'Завершающий урок',
      type: 'quiz',
      position: 1,
      activity: quiz,
    })
  ).json();
  assert.equal(
    (await request('PATCH', `/api/courses/${course.id}`, admin, { published: true })).statusCode,
    200,
  );
  await request('POST', `/api/courses/${course.id}/enrollments`, admin, {
    userIds: [studentId, outsiderId],
  });
  const before = (await request('GET', '/api/dashboard', student)).json().xp;
  const view = (await request('GET', `/api/courses/${course.id}`, student)).json().lessons[0];
  assert.equal(view.activity.questions.length, 2);
  assert.equal(view.activity.questions[0].correctIndex, undefined);
  assert.equal(view.activity.questions[1].correctIndexes, undefined);
  for (const response of [
    { x: 15, y: 15 },
    { x: 15, y: 15, answers: { q1: 1 } },
    { x: 15, y: 15, answers: { q1: 1, checks: [] } },
    { x: 15, y: 15, answers: { q1: [1], checks: [0] } },
    { x: 15, y: 15, answers: { q1: 1, checks: [0, 0] } },
    { x: 15, y: 15, answers: { q1: 1, checks: [7] } },
    { answers: { q1: 1, checks: [0] } },
  ])
    assert.equal(
      (await request('POST', `/api/lessons/${scene.id}/attempt`, student, { response })).statusCode,
      400,
    );
  assert.equal((await sql('SELECT * FROM attempts WHERE lesson_id=$1', [scene.id])).length, 0);
  assert.equal((await sql('SELECT * FROM progress WHERE lesson_id=$1', [scene.id])).length, 0);
  const response = { x: 15, y: 15, answers: { q1: 1, checks: [0] } };
  const saved = await request('POST', `/api/lessons/${scene.id}/attempt`, student, { response });
  assert.deepEqual(saved.json(), { submitted: true, resultsAvailable: false });
  assert.equal((await request('GET', '/api/dashboard', student)).json().xp, before + 75);
  const pending = (await request('GET', `/api/courses/${course.id}`, student)).json();
  assert.equal(pending.lessons[0].score, undefined);
  assert.equal(pending.lessons[0].passed, undefined);
  assert.equal(
    (await request('GET', `/api/courses/${course.id}/results`, student)).statusCode,
    409,
  );
  const retry = await request('POST', `/api/lessons/${scene.id}/attempt`, student, {
    response: { x: 70, y: 70, answers: { q1: 1, checks: [0, 1, 2, 3] } },
  });
  assert.equal(retry.statusCode, 409);
  const report = (await request('GET', `/api/reports/${studentId}/${course.id}`, admin)).json();
  assert.equal(report.lessons[0].score, 58.33);
  assert.deepEqual(
    report.lessons[0].details.map((d: any) => d.score),
    [50, 100, 25],
  );
  assert.equal(
    (await request('GET', `/api/reports/${studentId}/${course.id}`, student)).statusCode,
    403,
  );
  const [attempt] = await sql('SELECT * FROM attempts WHERE lesson_id=$1 AND user_id=$2', [
    scene.id,
    studentId,
  ]);
  assert.deepEqual(attempt.response, response);
  await request('POST', `/api/lessons/${last.id}/attempt`, student, { response: { q1: 1 } });
  const final = (await request('GET', `/api/courses/${course.id}/results`, student)).json();
  assert.equal(final.score, 79.17);
  assert.equal(final.lessons[0].score, 58.33);
  assert.equal(final.lessons[0].details, undefined);
  assert.equal(final.certificateId, null);
  await request('POST', `/api/lessons/${scene.id}/attempt`, outsider, {
    response: { x: 70, y: 70, answers: { q1: 1, checks: [0, 1, 2, 3] } },
  });
  await request('POST', `/api/lessons/${last.id}/attempt`, outsider, { response: { q1: 1 } });
  const perfect = (await request('GET', `/api/courses/${course.id}/results`, outsider)).json();
  assert.equal(perfect.score, 100);
  assert.ok(perfect.certificateId);
  const edited = await request('PATCH', `/api/lessons/${scene.id}`, admin, {
    activity: { ...activity, questions: [] },
  });
  assert.equal(edited.statusCode, 200, edited.body);
  assert.deepEqual(edited.json().activity.questions, []);
  const historical = (await request('GET', `/api/reports/${studentId}/${course.id}`, admin)).json();
  assert.equal(historical.lessons[0].score, 58.33);
  assert.equal(historical.lessons[0].details.length, 3);
  assert.equal(
    (
      await request('POST', `/api/lessons/${scene.id}/attempt`, student, {
        response: { x: 70, y: 70 },
      })
    ).statusCode,
    409,
  );
});
test('assessment migration preserves old grades and attempts, adopts failed-only results and is repeatable', async () => {
  const course = (
    await request('POST', '/api/courses', admin, { title: 'Исторические результаты' })
  ).json();
  const first = (
    await request('POST', `/api/courses/${course.id}/lessons`, admin, {
      title: 'Исторический зачёт',
      type: 'quiz',
      activity: quiz,
    })
  ).json();
  const second = (
    await request('POST', `/api/courses/${course.id}/lessons`, admin, {
      title: 'Историческая ошибка',
      type: 'quiz',
      activity: quiz,
      position: 1,
    })
  ).json();
  const oldWrong = randomUUID(),
    oldRight = randomUUID(),
    oldPartial = randomUUID();
  await sql(
    `INSERT INTO attempts(id,user_id,lesson_id,score,passed,response,created_at) VALUES($1,$2,$3,0,false,'{"q1":0}','2020-01-01T00:00:00Z'),($4,$2,$3,100,true,'{"q1":1}','2020-01-01T00:01:00Z'),($5,$2,$6,30,false,'{"q1":0}','2020-01-01T00:02:00Z')`,
    [oldWrong, studentId, first.id, oldRight, oldPartial, second.id],
  );
  await sql(
    `INSERT INTO progress(user_id,lesson_id,completed_at,score,xp) VALUES($1,$2,'2020-01-01T00:01:00Z',100,50)`,
    [studentId, first.id],
  );
  const certificates = (await sql('SELECT id FROM certificates ORDER BY id')).map((row) => row.id);
  await sql("DELETE FROM schema_migrations WHERE version='knowledge-assessment-v1'");
  await migrate();
  const rows = await sql(
    'SELECT * FROM progress WHERE user_id=$1 AND lesson_id IN ($2,$3) ORDER BY score DESC',
    [studentId, first.id, second.id],
  );
  assert.deepEqual(
    rows.map((row) => row.score),
    [100, 30],
  );
  assert.equal(rows[0].attempt_id, oldRight);
  assert.equal(rows[0].passed, true);
  assert.equal(rows[1].attempt_id, oldPartial);
  assert.equal(rows[1].passed, false);
  assert.ok(rows.every((row) => row.submitted_at && row.completed_at));
  assert.equal(
    (await sql('SELECT * FROM attempts WHERE lesson_id IN ($1,$2)', [first.id, second.id])).length,
    3,
  );
  assert.deepEqual(
    (await sql('SELECT id FROM certificates ORDER BY id')).map((row) => row.id),
    certificates,
  );
  await migrate();
  assert.deepEqual(
    await sql(
      'SELECT * FROM progress WHERE user_id=$1 AND lesson_id IN ($2,$3) ORDER BY score DESC',
      [studentId, first.id, second.id],
    ),
    rows,
  );
  assert.equal(
    (await sql("SELECT * FROM schema_migrations WHERE version='knowledge-assessment-v1'")).length,
    1,
  );
});
test('authenticated users behind one IP have separate request limits', async () => {
  const guarded = await buildApp({ logger: false });
  try {
    guarded.get(
      '/api/test-throttle',
      { config: { rateLimit: { max: 1, timeWindow: '1 minute' } } },
      async () => ({ ok: true }),
    );
    const call = (headers: Record<string, string>) =>
      guarded.inject({ method: 'GET', url: '/api/test-throttle', headers });
    assert.equal((await call(student)).statusCode, 200);
    assert.equal((await call(student)).statusCode, 429);
    assert.equal((await call(outsider)).statusCode, 200);
  } finally {
    await guarded.close();
  }
});
