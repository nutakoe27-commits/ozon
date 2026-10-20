import { randomUUID } from 'node:crypto';
import { mkdir, stat } from 'node:fs/promises';
import { config } from './config.js';
import { hashPassword } from './auth.js';
import { migrate, pool, sql, transaction } from './db.js';
import { prepareStorage, uploadPath } from './uploads.js';
import { command } from './worker.js';
if (config.production) throw new Error('Demo data is disabled in production');
await migrate();
await prepareStorage();
const adminId = 'a0000000-0000-4000-8000-000000000001';
const studentId = 'a0000000-0000-4000-8000-000000000002';
const videoId = 'b0000000-0000-4000-8000-000000000001';
await sql(
  `INSERT INTO users(id,email,name,password_hash,role) VALUES($1,'admin@praktika.test','Александр Иванов',$2,'admin'),($3,'student@praktika.test','Мария Смирнова',$4,'student') ON CONFLICT DO NOTHING`,
  [
    adminId,
    await hashPassword('DemoAdmin2026!'),
    studentId,
    await hashPassword('DemoStudent2026!'),
  ],
);
const [existing] = await sql('SELECT id FROM media WHERE id=$1', [videoId]);
if (!existing) {
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
      'color=c=0x233e32:s=960x540:r=24:d=12',
      '-f',
      'lavfi',
      '-i',
      'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-t',
      '12',
      '-vf',
      "drawtext=text='ПРАКТИКА':fontcolor=0xd9ed83:fontsize=54:x=(w-tw)/2:y=170,drawtext=text='Демонстрационный видеоурок':fontcolor=white:fontsize=28:x=(w-tw)/2:y=260,drawtext=text='Загрузите свои учебные материалы':fontcolor=0xa8ba9c:fontsize=21:x=(w-tw)/2:y=315",
      '-c:v',
      'libx264',
      '-threads',
      '1',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-movflags',
      '+faststart',
      '-f',
      'mp4',
      uploadPath(videoId),
    ],
    60_000,
  );
  const file = await stat(uploadPath(videoId));
  await sql(
    `INSERT INTO uploads(id,owner_id,name,size,offset_bytes,status) VALUES($1,$2,'Демонстрационный видеоурок.mp4',$3,$3,'complete')`,
    [videoId, adminId, file.size],
  );
  await sql(
    `INSERT INTO media(id,kind,name,owner_id) VALUES($1,'video','Демонстрационный видеоурок.mp4',$2)`,
    [videoId, adminId],
  );
}
const examples = [
  {
    id: 'c0000000-0000-4000-8000-000000000001',
    title: 'Охрана труда: уверенный старт',
    category: 'Основы безопасности',
    color: 'sage',
    description:
      'Разберитесь в основных правилах, научитесь замечать риски и выбирать безопасные действия.',
  },
  {
    id: 'c0000000-0000-4000-8000-000000000002',
    title: 'Безопасная работа на складе',
    category: 'Безопасность на производстве',
    color: 'peach',
    description: 'Маршруты движения, рабочие зоны и внимательность рядом с погрузочной техникой.',
  },
  {
    id: 'c0000000-0000-4000-8000-000000000003',
    title: 'Средства индивидуальной защиты',
    category: 'Личная безопасность',
    color: 'blue',
    description: 'Узнайте, как подбирать, проверять и правильно использовать средства защиты.',
  },
];
for (const [index, c] of examples.entries()) {
  await transaction(async (db) => {
    const result = await db.query(
      `INSERT INTO courses(id,title,description,category,color,created_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING id`,
      [c.id, c.title, c.description, c.category, c.color, adminId],
    );
    if (result.rowCount) {
      const quiz = {
        passPercent: 80,
        questions: [
          {
            id: 'risk',
            prompt: 'Что нужно сделать, если вы заметили опасность на рабочем месте?',
            options: [
              'Продолжить работу и сообщить об этом позже',
              'Остановить опасные действия и сообщить ответственному',
              'Попросить коллегу разобраться после смены',
            ],
            correctIndex: 1,
            explanation:
              'Не продолжайте действия, создающие угрозу. Сообщите ответственному лицу и следуйте правилам организации.',
          },
          {
            id: 'ppe',
            prompt: 'Когда нужно проверить исправность средств индивидуальной защиты?',
            options: ['Только при получении', 'Перед каждым использованием', 'Раз в год'],
            correctIndex: 1,
            explanation:
              'Перед использованием убедитесь, что средства защиты исправны, подходят по размеру и соответствуют выполняемой работе.',
          },
        ],
      };
      const hotspot = {
        instruction:
          'Погрузчик работает в правой части склада. Переместите работника в выделенную пешеходную зону.',
        target: { x: 4, y: 67, width: 28, height: 26 },
        explanation:
          'Пешеходная зона отмечена зелёной разметкой слева. Не выходите на путь движения погрузчика.',
      };
      await db.query(
        `INSERT INTO lessons(id,course_id,title,type,position,body,video_id) VALUES($1,$2,'Введение в безопасную работу','video',0,'Это демонстрационное видео. Для реального обучения администратор должен загрузить утверждённые учебные материалы.',$3)`,
        [randomUUID(), c.id, videoId],
      );
      await db.query(
        `INSERT INTO lessons(id,course_id,title,type,position,activity) VALUES($1,$2,'Проверим основные правила','quiz',1,$3),($4,$2,'Выберите безопасное место','hotspot',2,$5)`,
        [randomUUID(), c.id, quiz, randomUUID(), hotspot],
      );
    }
    for (const user of [adminId, studentId])
      await db.query(
        'INSERT INTO enrollments(user_id,course_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [user, c.id],
      );
  });
}
console.info('Demo users and 3 example courses prepared. Credentials are listed in README.md.');
console.info('Run the video worker, then publish the sample courses with npm run demo:publish.');
await pool.end();
