import { test, expect, type Page, type BrowserContext } from '@playwright/test';
const stamp = Date.now();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext['cookies']>>>();
async function login(page: Page, email = 'admin@praktika.test', password = 'DemoAdmin2026!') {
  const saved = sessions.get(email);
  if (saved) {
    await page.context().addCookies(saved);
    await page.goto('/');
    if ((await page.request.get('/api/auth/me')).ok()) {
      await expect(page.getByRole('heading', { name: /Рады видеть/ })).toBeVisible();
      return;
    }
  }
  await page.goto('/');
  await page.getByLabel('Электронная почта', { exact: true }).fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти в аккаунт' }).click();
  await expect(page.getByRole('heading', { name: /Рады видеть/ })).toBeVisible();
  sessions.set(email, await page.context().cookies());
}
async function adminApi(page: Page, url: string, body: any, method = 'POST') {
  const me = await page.request.get('/api/auth/me');
  if (!me.ok()) throw new Error(`Session check failed with HTTP ${me.status()}`);
  const { csrf } = await me.json();
  const response = await page.request.fetch(url, {
    method,
    headers: { 'x-csrf-token': csrf },
    data: body,
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}
test('desktop dashboard and course search are usable', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page);
  await expect(page.getByText('Охрана труда: уверенный старт')).toBeVisible();
  await page.screenshot({ path: 'test-results/dashboard-desktop.png', fullPage: true });
  await page.getByRole('link', { name: 'Все курсы', exact: true }).first().click();
  await page.getByRole('textbox', { name: 'Поиск курсов' }).fill('складе');
  await expect(page.getByRole('heading', { name: 'Безопасная работа на складе' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Охрана труда: уверенный старт' })).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('course constructor, learner quiz, visual exercise and certificate form a working flow', async ({
  page,
}) => {
  await login(page);
  await page.getByRole('link', { name: 'Конструктор курсов', exact: true }).click();
  await page.getByRole('button', { name: 'Создать курс', exact: true }).first().click();
  const title = `Проверка обучения ${stamp}`;
  await page.getByLabel('Название курса', { exact: true }).fill(title);
  await page.getByRole('button', { name: 'Создать и добавить уроки' }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  const courseId = page.url().split('/').at(-1)!;
  await page.getByRole('button', { name: 'Тест Вопросы с выбором правильного ответа' }).click();
  await page.getByLabel('Название урока', { exact: true }).fill('Правила безопасной работы');
  await page
    .getByLabel('Текст вопроса', { exact: true })
    .fill('Что делать при появлении опасности?');
  await page
    .getByRole('textbox', { name: 'Вариант 1 вопроса 1', exact: true })
    .fill('Продолжить работу');
  await page
    .getByRole('textbox', { name: 'Вариант 2 вопроса 1', exact: true })
    .fill('Остановить работу');
  await page.getByRole('radio', { name: 'Правильный ответ 2 на вопрос 1', exact: true }).check();
  await page.getByRole('button', { name: 'Сохранить урок', exact: true }).click();
  await expect(page.getByText('Правила безопасной работы', { exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: 'Визуальное задание Сцена, персонаж и безопасная зона' })
    .click();
  await page.getByLabel('Название урока', { exact: true }).fill('Безопасный маршрут');
  await page.getByRole('button', { name: 'Сохранить урок', exact: true }).click();
  await expect(page.getByText('Безопасный маршрут', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Опубликовать', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Снять с публикации' })).toBeVisible();
  const email = `e2e-${stamp}@test.local`;
  const password = 'BrowserTestPassword2026!';
  const user = await adminApi(page, '/api/users', { email, password, name: 'Ученик проверки' });
  await adminApi(page, `/api/courses/${courseId}/enrollments`, { userIds: [user.id] });
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await login(page, email, password);
  await page.goto(`/courses/${courseId}`);
  await page.getByRole('link', { name: 'Начать обучение', exact: true }).click();
  await page.getByText('Остановить работу', { exact: true }).click();
  await page.getByRole('button', { name: 'Отправить ответы', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ответ сохранён' })).toBeVisible();
  await page.getByRole('link', { name: 'Следующий урок', exact: true }).click();
  const scene = page.locator('.hotspot-scene');
  await expect(scene).toBeVisible();
  const box = (await scene.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.17, box.y + box.height * 0.8);
  await page.getByRole('button', { name: 'Отправить решение', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Все уроки завершены' })).toBeVisible();
  await page.screenshot({ path: 'test-results/visual-exercise.png', fullPage: true });
  await page.getByRole('link', { name: 'Посмотреть результаты', exact: true }).click();
  await expect(page.locator('.assessment-total-score')).toHaveText('100%');
  await page.getByRole('link', { name: 'Получить сертификат' }).click();
  await expect(
    page.locator('.certificate-document').getByRole('heading', { name: 'Ученик проверки' }),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/certificate.png', fullPage: true });
});
test('custom HLS player actually plays, changes speed and saves progress', async ({ page }) => {
  await login(page, 'student@praktika.test', 'DemoStudent2026!');
  const course = await (
    await page.request.get('/api/courses/c0000000-0000-4000-8000-000000000001')
  ).json();
  const videoLesson = course.lessons.find((lesson: any) => lesson.type === 'video');
  await page.goto(`/learn/${course.id}/${videoLesson.id}`);
  await expect(page.locator('video')).toHaveJSProperty('readyState', 4);
  await page.getByLabel('Позиция воспроизведения', { exact: true }).press('Home');
  await page.getByRole('button', { name: 'Смотреть видео', exact: true }).click();
  await expect
    .poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime), {
      timeout: 15000,
    })
    .toBeGreaterThan(1);
  await page.getByLabel('Скорость воспроизведения', { exact: true }).selectOption('1.5');
  await expect(page.locator('video')).toHaveJSProperty('playbackRate', 1.5);
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  await expect(page.locator('video')).toHaveJSProperty('paused', true);
  await expect(page.getByRole('button', { name: 'Смотреть видео', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/video-player.png', fullPage: true });
});
test('mobile navigation, courses and exercises fit the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await expect(page.getByRole('button', { name: 'Открыть меню' })).toBeVisible();
  await page.screenshot({ path: 'test-results/dashboard-mobile.png', fullPage: true });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
  await page.getByRole('button', { name: 'Открыть меню' }).click();
  await page.getByRole('link', { name: 'Моё обучение', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Моё обучение', exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
});
test('browser upload enters the persistent processing queue and becomes playable', async ({
  page,
}) => {
  const { execFileSync } = await import('node:child_process');
  const { mkdtemp, rm } = await import('node:fs/promises');
  const folder = await mkdtemp('/tmp/praktika-browser-');
  const file = `${folder}/browser-upload.mp4`;
  try {
    execFileSync('ffmpeg', [
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
      file,
    ]);
    await login(page);
    await page.getByRole('link', { name: 'Медиатека', exact: true }).click();
    await page.locator('input[type=file]').setInputFiles(file);
    await page.getByRole('button', { name: 'Загрузить', exact: true }).click();
    await expect(page.getByText('Отправлено на обработку', { exact: false }).first()).toBeVisible();
    const row = page.getByRole('row').filter({ hasText: 'browser-upload.mp4' }).last();
    await expect(row.getByText('Готово', { exact: true })).toBeVisible({ timeout: 30000 });
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
test('course deletion confirms, cancels and retries before removing a course already in progress', async ({
  page,
  request,
}) => {
  await login(page);
  const title = `Удаление начатого курса ${stamp}`;
  const course = await adminApi(page, '/api/courses', { title });
  const activity = {
    passPercent: 100,
    questions: [
      {
        id: 'q',
        prompt: 'Как действовать безопасно?',
        options: ['Остановиться', 'Продолжить'],
        correctIndex: 0,
      },
    ],
  };
  const first = await adminApi(page, `/api/courses/${course.id}/lessons`, {
    title: 'Первое задание',
    type: 'quiz',
    activity,
  });
  await adminApi(page, `/api/courses/${course.id}/lessons`, {
    title: 'Второе задание',
    type: 'quiz',
    position: 1,
    activity,
  });
  await adminApi(page, `/api/courses/${course.id}`, { published: true }, 'PATCH');
  const loginResponse = await request.post('/api/auth/login', {
    data: { email: 'student@praktika.test', password: 'DemoStudent2026!' },
  });
  expect(loginResponse.ok()).toBeTruthy();
  const { csrf } = await loginResponse.json();
  const headers = { 'x-csrf-token': csrf };
  expect((await request.post(`/api/courses/${course.id}/enroll`, { headers })).ok()).toBeTruthy();
  const attempt = await request.post(`/api/lessons/${first.id}/attempt`, {
    headers,
    data: { response: { q: 0 } },
  });
  const result = await attempt.json();
  expect(result.submitted).toBe(true);
  expect(result.score).toBeUndefined();

  await page.goto(`/admin/courses/${course.id}`);
  await page.getByRole('button', { name: 'Удалить курс', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Удаление курса' });
  await expect(
    dialog.getByText(`Вы собираетесь удалить курс «${title}».`, { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByText(/выданные сертификаты/)).toBeVisible();
  await expect(dialog.getByText(/Видео и изображения останутся в медиатеке/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect((await page.request.get(`/api/courses/${course.id}`)).ok()).toBeTruthy();

  const url = `**/api/courses/${course.id}`;
  await page.route(url, async (route) => {
    if (route.request().method() === 'DELETE')
      await route.fulfill({
        status: 503,
        json: { error: 'Не удалось удалить курс. Повторите попытку.' },
      });
    else await route.continue();
  });
  await page.getByRole('button', { name: 'Удалить курс', exact: true }).click();
  await dialog.getByRole('button', { name: 'Да, удалить курс', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Не удалось удалить курс. Повторите попытку.');
  await expect(dialog).toBeVisible();
  expect((await page.request.get(`/api/courses/${course.id}`)).ok()).toBeTruthy();
  await page.unroute(url);
  await dialog.getByRole('button', { name: 'Да, удалить курс', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/courses$/);
  await expect(page.getByRole('heading', { name: title, exact: true })).toHaveCount(0);
  expect((await page.request.get(`/api/courses/${course.id}`)).status()).toBe(404);
  expect((await request.get(`/api/courses/${course.id}`)).status()).toBe(404);
});
test('a started published course supports multiple zones and a persistent worker starting point', async ({
  page,
  request,
  browser,
  baseURL,
}) => {
  await login(page);
  const course = await adminApi(page, '/api/courses', { title: `Редактируемая практика ${stamp}` });
  const activity = {
    passPercent: 100,
    questions: [
      {
        id: 'q',
        prompt: 'Как действовать безопасно?',
        options: ['Остановиться', 'Продолжить'],
        correctIndex: 0,
      },
    ],
  };
  const first = await adminApi(page, `/api/courses/${course.id}/lessons`, {
    title: 'Изученные правила',
    type: 'quiz',
    activity,
  });
  const scene = await adminApi(page, `/api/courses/${course.id}/lessons`, {
    title: 'Рабочая сцена',
    type: 'hotspot',
    position: 1,
    activity: {
      instruction: 'Поставьте работника в любую безопасную зону.',
      target: { x: 4, y: 67, width: 28, height: 26 },
    },
  });
  let learner: Page | undefined;
  try {
    await adminApi(page, `/api/courses/${course.id}`, { published: true }, 'PATCH');
    const auth = await request.post('/api/auth/login', {
      data: { email: 'student@praktika.test', password: 'DemoStudent2026!' },
    });
    expect(auth.ok()).toBeTruthy();
    const { csrf } = await auth.json();
    const headers = { 'x-csrf-token': csrf };
    expect((await request.post(`/api/courses/${course.id}/enroll`, { headers })).ok()).toBeTruthy();
    const attempt = await request.post(`/api/lessons/${first.id}/attempt`, {
      headers,
      data: { response: { q: 0 } },
    });
    expect((await attempt.json()).submitted).toBe(true);
    await page.goto(`/admin/courses/${course.id}`);
    await page.getByRole('button', { name: 'Редактировать Рабочая сцена', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Редактировать урок' });
    await dialog.getByLabel('Ширина, %', { exact: true }).fill('12');
    await dialog.getByRole('button', { name: 'Добавить зону', exact: true }).click();
    await dialog
      .getByRole('combobox', { name: 'Цвет и оценка зоны', exact: true })
      .selectOption('50');
    const canvas = dialog.locator('.hotspot-scene');
    await canvas.scrollIntoViewIfNeeded();
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.7);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.31, box.y + box.height * 0.9, { steps: 5 });
    await page.mouse.up();
    await expect(canvas.locator('.target-zone')).toHaveCount(2);
    await expect(canvas.locator('.target-zone.yellow')).toHaveCount(1);
    await dialog.getByRole('button', { name: 'Начальное положение', exact: true }).click();
    await canvas.scrollIntoViewIfNeeded();
    const startBox = (await canvas.boundingBox())!;
    await page.mouse.click(startBox.x + startBox.width * 0.55, startBox.y + startBox.height * 0.82);
    await expect(dialog.getByLabel('Начальная позиция X, %', { exact: true })).toHaveValue('55');
    await dialog.locator('.worker-marker').press('ArrowRight');
    await expect(dialog.getByLabel('Начальная позиция X, %', { exact: true })).toHaveValue('57');
    await dialog.getByLabel('Начальная позиция X, %', { exact: true }).fill('55');
    await dialog.getByLabel('Начальная позиция Y, %', { exact: true }).fill('84');
    await dialog.getByRole('button', { name: 'Сохранить урок', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Снять с публикации', exact: true }),
    ).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: 'Редактировать Рабочая сцена', exact: true }).click();
    await expect(dialog.locator('.target-zone')).toHaveCount(2);
    await dialog.getByRole('button', { name: 'Начальное положение', exact: true }).click();
    await expect(dialog.getByLabel('Начальная позиция X, %', { exact: true })).toHaveValue('55');
    await expect(dialog.getByLabel('Начальная позиция Y, %', { exact: true })).toHaveValue('84');
    await canvas.scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'test-results/multi-zone-editor.png', fullPage: true });
    await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
    learner = await browser.newPage({ baseURL });
    await login(learner, 'student@praktika.test', 'DemoStudent2026!');
    await learner.goto(`/learn/${course.id}/${scene.id}`);
    const marker = learner.locator('.worker-marker');
    await expect(marker).toBeVisible();
    expect(await marker.evaluate((el) => (el as HTMLElement).style.left)).toBe('55%');
    expect(await marker.evaluate((el) => (el as HTMLElement).style.top)).toBe('84%');
    await expect(learner.locator('.target-zone')).toHaveCount(0);
    const taskCanvas = learner.locator('.hotspot-scene');
    await taskCanvas.scrollIntoViewIfNeeded();
    const taskBox = (await taskCanvas.boundingBox())!;
    await learner.mouse.click(taskBox.x + taskBox.width * 0.25, taskBox.y + taskBox.height * 0.8);
    await learner.getByRole('button', { name: 'Отправить решение', exact: true }).click();
    await expect(
      learner.getByRole('heading', { name: 'Ответ сохранён', exact: true }),
    ).toBeVisible();
    await learner.getByRole('link', { name: 'Посмотреть результаты', exact: true }).click();
    await expect(learner.locator('.assessment-total-score')).toHaveText('75%');
    await expect(
      learner
        .getByRole('row')
        .filter({ hasText: 'Рабочая сцена' })
        .getByText('50%', { exact: true }),
    ).toBeVisible();
    const state = await learner.request.get(`/api/courses/${course.id}`);
    expect(
      (await state.json()).lessons.find((lesson: any) => lesson.id === first.id).completed_at,
    ).toBeTruthy();
  } finally {
    await learner?.close();
    await adminApi(page, `/api/courses/${course.id}`, { confirm: true }, 'DELETE');
  }
});
test('quiz constructor adds video and photo above questions, with completion earned only by answering', async ({
  page,
  browser,
  baseURL,
}) => {
  await login(page);
  const course = await adminApi(page, '/api/courses', {
    title: `Тест с медиаматериалами ${stamp}`,
  });
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { execFileSync } = await import('node:child_process');
  const directory = await mkdtemp('/tmp/praktika-introduction-');
  const source = `${directory}/quiz-introduction.mp4`;
  let learner: Page | undefined;
  try {
    execFileSync('ffmpeg', [
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
    ]);
    await page.goto(`/admin/courses/${course.id}`);
    await page.getByRole('button', { name: 'Тест Вопросы с выбором правильного ответа' }).click();
    const dialog = page.getByRole('dialog', { name: 'Новый урок' });
    await dialog
      .getByLabel('Название урока', { exact: true })
      .fill('Смотрите, изучайте и отвечайте');
    const sharp = (await import('sharp')).default;
    const image = await sharp({
      create: { width: 800, height: 400, channels: 3, background: '#b7cba3' },
    })
      .png()
      .toBuffer();
    await dialog
      .getByLabel('Загрузить фотографию перед тестом', { exact: true })
      .setInputFiles({ name: 'quiz-introduction.png', mimeType: 'image/png', buffer: image });
    await expect(
      dialog.getByRole('img', { name: 'Фотография перед тестом', exact: true }),
    ).toBeVisible();
    await dialog
      .getByLabel('Текст вопроса', { exact: true })
      .fill('Что нужно сделать перед началом работы?');
    await dialog
      .getByRole('textbox', { name: 'Вариант 1 вопроса 1', exact: true })
      .fill('Проверить безопасность');
    await dialog
      .getByRole('textbox', { name: 'Вариант 2 вопроса 1', exact: true })
      .fill('Сразу приступить');
    await dialog.locator('.upload-widget input[type=file]').setInputFiles(source);
    await dialog.getByRole('button', { name: 'Загрузить', exact: true }).click();
    await expect(
      dialog
        .getByRole('combobox', { name: 'Видео из медиатеки', exact: true })
        .locator('option:checked'),
    ).toHaveText('quiz-introduction.mp4 · Готово', { timeout: 20000 });
    await dialog.getByRole('button', { name: 'Сохранить урок', exact: true }).click();
    await page.getByRole('button', { name: 'Опубликовать', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Снять с публикации', exact: true }),
    ).toBeVisible();
    learner = await browser.newPage({ baseURL });
    await login(learner, 'student@praktika.test', 'DemoStudent2026!');
    await learner.goto(`/courses/${course.id}`);
    await learner.getByRole('button', { name: 'Записаться на курс', exact: true }).click();
    const video = learner.locator('video');
    await expect(video).toHaveJSProperty('readyState', 4);
    const photo = learner.getByRole('img', { name: 'Материал к тесту', exact: true });
    await expect(photo).toHaveJSProperty('naturalWidth', 800);
    const positions = await learner.evaluate(() => ({
      video: document.querySelector('.lesson-introduction')!.getBoundingClientRect().top,
      photo: document.querySelector('.exercise-photo')!.getBoundingClientRect().top,
      quiz: document.querySelector('.quiz-question')!.getBoundingClientRect().top,
    }));
    expect(positions.video).toBeLessThan(positions.photo);
    expect(positions.photo).toBeLessThan(positions.quiz);
    await learner.getByLabel('Скорость воспроизведения', { exact: true }).selectOption('2');
    await learner.getByRole('button', { name: 'Смотреть видео', exact: true }).click();
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => v.ended), { timeout: 20000 })
      .toBe(true);
    const state = await learner.request.get(`/api/courses/${course.id}`);
    expect((await state.json()).lessons[0].completed_at).toBeNull();
    await learner.getByText('Проверить безопасность', { exact: true }).click();
    await learner.getByRole('button', { name: 'Отправить ответы', exact: true }).click();
    await expect(learner.getByRole('heading', { name: 'Ответ сохранён' })).toBeVisible();
    await learner.screenshot({ path: 'test-results/quiz-introduction.png', fullPage: true });
  } finally {
    await learner?.close();
    await rm(directory, { recursive: true, force: true });
    await adminApi(page, `/api/courses/${course.id}`, { confirm: true }, 'DELETE');
  }
});
test('checkbox assessment records partial percentages once and shows administrators question details', async ({
  page,
  browser,
  baseURL,
}) => {
  await login(page);
  const course = await adminApi(page, '/api/courses', {
    title: `Проверка частичных ответов ${stamp}`,
  });
  let learner: Page | undefined;
  let staleTab: Page | undefined;
  let learnerContext: BrowserContext | undefined;
  try {
    await page.goto(`/admin/courses/${course.id}`);
    await page.getByRole('button', { name: 'Тест Вопросы с выбором правильного ответа' }).click();
    const dialog = page.getByRole('dialog', { name: 'Новый урок' });
    await dialog.getByLabel('Название урока', { exact: true }).fill('Проверка четырёх правил');
    await dialog.getByLabel('Проходной результат, %', { exact: true }).fill('100');
    await dialog
      .getByLabel('Текст вопроса', { exact: true })
      .fill('Какие действия помогают работать безопасно?');
    await dialog
      .getByRole('combobox', { name: 'Тип ответа вопроса 1', exact: true })
      .selectOption('multiple');
    for (let i = 0; i < 2; i++)
      await dialog.getByRole('button', { name: 'Добавить вариант', exact: true }).click();
    for (const [index, text] of [
      'Проверить оборудование',
      'Временный вариант',
      'Игнорировать неисправность',
      'Надеть средства защиты',
    ].entries())
      await dialog
        .getByRole('textbox', { name: `Вариант ${index + 1} вопроса 1`, exact: true })
        .fill(text);
    await dialog
      .getByRole('checkbox', { name: 'Правильный ответ 4 на вопрос 1', exact: true })
      .check();
    await dialog
      .locator('.option-editor')
      .nth(1)
      .getByRole('button', { name: 'Удалить вариант', exact: true })
      .click();
    await expect(
      dialog.getByRole('checkbox', { name: 'Правильный ответ 3 на вопрос 1', exact: true }),
    ).toBeChecked();
    for (const [offset, text] of ['Проверить ограждения', 'Сообщить об опасности'].entries()) {
      await dialog.getByRole('button', { name: 'Добавить вариант', exact: true }).click();
      await dialog
        .getByRole('textbox', { name: `Вариант ${offset + 4} вопроса 1`, exact: true })
        .fill(text);
      await dialog
        .getByRole('checkbox', { name: `Правильный ответ ${offset + 4} на вопрос 1`, exact: true })
        .check();
    }
    await dialog.getByRole('button', { name: 'Добавить вопрос', exact: true }).click();
    await dialog
      .locator('.question-editor')
      .nth(1)
      .getByLabel('Текст вопроса', { exact: true })
      .fill('Кому нужно сообщить об опасности?');
    await dialog
      .getByRole('textbox', { name: 'Вариант 1 вопроса 2', exact: true })
      .fill('Руководителю');
    await dialog.getByRole('textbox', { name: 'Вариант 2 вопроса 2', exact: true }).fill('Никому');
    await dialog.getByRole('button', { name: 'Сохранить урок', exact: true }).click();
    await page.getByRole('button', { name: 'Опубликовать', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Снять с публикации', exact: true }),
    ).toBeVisible();
    const config = await (await page.request.get(`/api/courses/${course.id}`)).json();
    const lesson = config.lessons[0];
    await page.reload();
    await page
      .getByRole('button', { name: 'Редактировать Проверка четырёх правил', exact: true })
      .click();
    const edit = page.getByRole('dialog', { name: 'Редактировать урок' });
    await expect(
      edit.getByRole('combobox', { name: 'Тип ответа вопроса 1', exact: true }),
    ).toHaveValue('multiple');
    await expect(
      edit.getByRole('checkbox', { name: 'Правильный ответ 5 на вопрос 1', exact: true }),
    ).toBeChecked();
    await edit.getByRole('button', { name: 'Закрыть', exact: true }).click();
    learnerContext = await browser.newContext({ baseURL });
    learner = await learnerContext.newPage();
    await login(learner, 'student@praktika.test', 'DemoStudent2026!');
    await learner.goto(`/courses/${course.id}`);
    await learner.getByRole('button', { name: 'Записаться на курс', exact: true }).click();
    await expect(learner.getByRole('checkbox')).toHaveCount(5);
    await expect(learner.getByRole('radio')).toHaveCount(2);
    const submit = learner.getByRole('button', { name: 'Отправить ответы', exact: true });
    await expect(submit).toBeDisabled();
    await learner.getByText('Проверить оборудование', { exact: true }).click();
    await learner.getByText('Руководителю', { exact: true }).click();
    await learner.getByText('Проверить оборудование', { exact: true }).click();
    await expect(submit).toBeDisabled();
    const firstCheckbox = learner.getByRole('checkbox', {
      name: 'Проверить оборудование',
      exact: true,
    });
    await firstCheckbox.focus();
    await learner.keyboard.press('Space');
    staleTab = await learner.context().newPage();
    await staleTab.goto(learner.url());
    await staleTab.getByRole('checkbox', { name: 'Проверить оборудование', exact: true }).check();
    await staleTab.getByRole('radio', { name: 'Руководителю', exact: true }).check();
    await submit.click();
    await expect(
      learner.getByRole('heading', { name: 'Ответ сохранён', exact: true }),
    ).toBeVisible();
    await staleTab.getByRole('button', { name: 'Отправить ответы', exact: true }).click();
    await expect(
      staleTab.getByRole('heading', { name: 'Ответ сохранён', exact: true }),
    ).toBeVisible();
    await expect(
      staleTab.getByRole('link', { name: 'Посмотреть результаты', exact: true }),
    ).toBeVisible();
    await expect(learner.getByRole('button', { name: 'Повторить', exact: true })).toHaveCount(0);
    await learner.reload();
    await expect(
      learner.getByRole('heading', { name: 'Ответ сохранён', exact: true }),
    ).toBeVisible();
    await expect(learner.getByRole('checkbox')).toHaveCount(0);
    const auth = await (await learner.request.get('/api/auth/me')).json();
    const retry = await learner.request.post(`/api/lessons/${lesson.id}/attempt`, {
      headers: { 'x-csrf-token': auth.csrf },
      data: {
        response: {
          [lesson.activity.questions[0].id]: [0, 2, 3, 4],
          [lesson.activity.questions[1].id]: 0,
        },
      },
    });
    expect(retry.status()).toBe(409);
    await learner.getByRole('link', { name: 'Посмотреть результаты', exact: true }).click();
    await expect(learner.locator('.assessment-total-score')).toHaveText('62,5%');
    await expect(
      learner.getByRole('link', { name: 'Получить сертификат', exact: true }),
    ).toHaveCount(0);
    await learner.screenshot({ path: 'test-results/assessment-results.png', fullPage: true });
    await page.goto('/admin/reports');
    await page.getByRole('textbox', { name: 'Поиск результатов', exact: true }).fill(course.title);
    await page.getByRole('button', { name: /Результаты .*Проверка частичных ответов/ }).click();
    const details = page.getByRole('dialog', { name: 'Результаты ученика' });
    await expect(details.getByText('Средняя оценка: 62,5%', { exact: true })).toBeVisible();
    await details.getByText('По вопросам', { exact: true }).click();
    await expect(details.getByText('25%', { exact: true })).toBeVisible();
    await expect(details.getByText('100%', { exact: true })).toBeVisible();
    await page.screenshot({ path: 'test-results/assessment-report.png', fullPage: true });
  } finally {
    await learnerContext?.close();
    await adminApi(page, `/api/courses/${course.id}`, { confirm: true }, 'DELETE');
  }
});
