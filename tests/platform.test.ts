import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
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
const { uploadPath } = await import('../server/uploads.js');
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
  assert.equal(
    (await request('POST', `/api/lessons/${quizId}/attempt`, outsider, { response: { q1: 1 } }))
      .statusCode,
    404,
  );
});
test('server scores incorrect and correct quiz responses', async () => {
  const wrong = await request('POST', `/api/lessons/${quizId}/attempt`, student, {
    response: { q1: 0 },
  });
  assert.equal(wrong.json().passed, false);
  const correct = await request('POST', `/api/lessons/${quizId}/attempt`, student, {
    response: { q1: 1 },
  });
  assert.equal(correct.json().score, 100);
  assert.equal(correct.json().passed, true);
  assert.equal(correct.json().certificateId, null);
});
test('hotspot evaluates coordinates server-side, awards XP once and issues certificate', async () => {
  assert.equal(
    (
      await request('POST', `/api/lessons/${hotspotId}/attempt`, student, {
        response: { x: 80, y: 80 },
      })
    ).json().passed,
    false,
  );
  const r = await request('POST', `/api/lessons/${hotspotId}/attempt`, student, {
    response: { x: 20, y: 30 },
  });
  assert.equal(r.json().passed, true);
  assert.ok(r.json().certificateId);
  const certId = r.json().certificateId;
  assert.equal((await request('GET', `/api/certificates/${certId}`, student)).statusCode, 200);
  assert.equal((await request('GET', `/api/certificates/${certId}`, outsider)).statusCode, 404);
  await request('POST', `/api/lessons/${hotspotId}/attempt`, student, {
    response: { x: 20, y: 30 },
  });
  const [stats] = await sql('SELECT sum(xp)::int AS xp FROM progress WHERE user_id=$1', [
    studentId,
  ]);
  assert.equal(stats.xp, 125);
  const [count] = await sql('SELECT count(*)::int AS count FROM certificates WHERE user_id=$1', [
    studentId,
  ]);
  assert.equal(count.count, 1);
});
test('started courses cannot be rewritten; a copy is an independent draft', async () => {
  await request('PATCH', `/api/courses/${courseId}`, admin, { published: false });
  assert.equal(
    (await request('PATCH', `/api/lessons/${quizId}`, admin, { title: 'Изменённый урок' }))
      .statusCode,
    409,
  );
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
  assert.ok(r.json().certificateId);
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
  await login('student@test.local', 'NewPasswordForTest2026!');
});
