import { test, expect, type Page } from '@playwright/test';
const stamp = Date.now();
async function login(page: Page, email = 'admin@praktika.test', password = 'DemoAdmin2026!') {
  await page.goto('/');
  await page.getByLabel('Электронная почта', { exact: true }).fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти в аккаунт' }).click();
  await expect(page.getByRole('heading', { name: /Рады видеть/ })).toBeVisible();
}
async function adminApi(page: Page, url: string, body: any, method = 'POST') {
  const me = await page.request.get('/api/auth/me');
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
  await page.getByRole('button', { name: 'Проверить ответы', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Отличная работа!' })).toBeVisible();
  await page.getByRole('link', { name: 'Следующий урок', exact: true }).click();
  const scene = page.locator('.hotspot-scene');
  const box = (await scene.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.17, box.y + box.height * 0.8);
  await page.getByRole('button', { name: 'Проверить решение', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Курс завершён. Поздравляем!' })).toBeVisible();
  await page.screenshot({ path: 'test-results/visual-exercise.png', fullPage: true });
  await page.getByRole('link', { name: 'Получить сертификат' }).click();
  await expect(
    page.locator('.certificate-document').getByRole('heading', { name: 'Ученик проверки' }),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/certificate.png', fullPage: true });
});
test('custom HLS player actually plays, changes speed and saves progress', async ({ page }) => {
  await login(page, 'student@praktika.test', 'DemoStudent2026!');
  await page.goto('/courses/c0000000-0000-4000-8000-000000000001');
  await page.getByRole('link', { name: /Начать обучение|Продолжить/ }).click();
  await expect(page.locator('video')).toHaveJSProperty('readyState', 4);
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
  expect(result.passed).toBe(true);
  expect(result.certificateId).toBeNull();

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
