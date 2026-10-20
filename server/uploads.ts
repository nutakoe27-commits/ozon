import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { mkdir, open, statfs, stat, unlink, rm } from 'node:fs/promises';
import { z } from 'zod';
import sharp from 'sharp';
import { config, CHUNK_SIZE } from './config.js';
import { sql, transaction } from './db.js';
import { requireAdmin, requireUser, HttpError } from './auth.js';

export const uuid = z.string().uuid();
export const uploadPath = (id: string) =>
  path.join(config.MEDIA_ROOT, 'uploads', `${uuid.parse(id)}.part`);
export const mediaPath = (id: string) => path.join(config.MEDIA_ROOT, 'media', uuid.parse(id));
export async function prepareStorage() {
  await mkdir(path.join(config.MEDIA_ROOT, 'uploads'), { recursive: true });
  await mkdir(path.join(config.MEDIA_ROOT, 'media'), { recursive: true });
}
export async function diskAvailable() {
  const s = await statfs(config.MEDIA_ROOT);
  return s.bavail * s.bsize;
}
export async function uploadRoutes(app: FastifyInstance) {
  app.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer', bodyLimit: CHUNK_SIZE },
    (_request, body, done) => done(null, body),
  );
  app.get('/api/storage', async (request) => {
    requireAdmin(request);
    return {
      freeBytes: await diskAvailable(),
      reserveBytes: config.DISK_RESERVE_BYTES,
      maxUploadBytes: config.UPLOAD_MAX_BYTES,
      chunkSize: CHUNK_SIZE,
    };
  });
  app.get('/api/uploads', async (request) => {
    const user = requireAdmin(request);
    return sql(
      "SELECT id,name,size,offset_bytes,updated_at FROM uploads WHERE owner_id=$1 AND status='uploading' ORDER BY updated_at DESC",
      [user.id],
    );
  });
  app.delete('/api/media/:id', async (request) => {
    requireAdmin(request);
    const { id } = request.params as any;
    uuid.parse(id);
    await transaction(async (db) => {
      const {
        rows: [item],
      } = await db.query('SELECT status FROM media WHERE id=$1 FOR UPDATE', [id]);
      if (!item) throw new HttpError(404, 'Материал не найден');
      if (item.status === 'processing' || item.status === 'queued')
        throw new HttpError(409, 'Дождитесь завершения обработки');
      const { rows: refs } = await db.query(
        'SELECT 1 FROM lessons WHERE video_id=$1 OR image_id=$1 LIMIT 1',
        [id],
      );
      if (refs.length)
        throw new HttpError(409, 'Материал используется в уроке. Сначала удалите ссылку на него.');
      await db.query('DELETE FROM media WHERE id=$1', [id]);
      await db.query('DELETE FROM uploads WHERE id=$1', [id]);
      await rm(mediaPath(id), { recursive: true, force: true });
      await unlink(uploadPath(id)).catch((e: NodeJS.ErrnoException) => {
        if (e.code !== 'ENOENT') throw e;
      });
    });
    return { ok: true };
  });
  app.get('/api/media', async (request) => {
    requireAdmin(request);
    return sql(
      'SELECT id,name,kind,status,duration,width,height,error,created_at FROM media ORDER BY created_at DESC LIMIT 200',
    );
  });
  app.post('/api/uploads', async (request, reply) => {
    const user = requireAdmin(request);
    const body = z
      .object({
        name: z.string().trim().min(1).max(255),
        size: z.number().int().min(1).max(config.UPLOAD_MAX_BYTES),
      })
      .parse(request.body);
    const id = randomUUID();
    await transaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(73281742)');
      const {
        rows: [pending],
      } = await db.query(
        `SELECT COALESCE(sum(size-offset_bytes),0)::text AS bytes FROM uploads WHERE status='uploading'`,
      );
      const {
        rows: [own],
      } = await db.query(
        `SELECT count(*)::int AS count FROM uploads WHERE status='uploading' AND owner_id=$1`,
        [user.id],
      );
      if (own.count >= 4) throw new HttpError(409, 'Завершите или отмените предыдущие загрузки');
      if (
        (await diskAvailable()) <
        config.DISK_RESERVE_BYTES + Number(pending.bytes) * 2 + body.size * 2
      )
        throw new HttpError(507, 'Недостаточно места: нужен запас для исходника и обработки видео');
      await db.query('INSERT INTO uploads(id,owner_id,name,size) VALUES($1,$2,$3,$4)', [
        id,
        user.id,
        body.name,
        body.size,
      ]);
      const fd = await open(uploadPath(id), 'wx', 0o600);
      await fd.close();
    });
    return reply.code(201).send({ id, offset: 0, chunkSize: CHUNK_SIZE });
  });
  app.get('/api/uploads/:id', async (request) => {
    const user = requireAdmin(request);
    const { id } = request.params as any;
    uuid.parse(id);
    const [upload] = await sql('SELECT * FROM uploads WHERE id=$1 AND owner_id=$2', [id, user.id]);
    if (!upload) throw new HttpError(404, 'Загрузка не найдена');
    return {
      id: upload.id,
      name: upload.name,
      size: Number(upload.size),
      offset: Number(upload.offset_bytes),
      status: upload.status,
      chunkSize: CHUNK_SIZE,
    };
  });
  app.put(
    '/api/uploads/:id',
    { bodyLimit: CHUNK_SIZE, config: { rateLimit: { max: 600, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const user = requireAdmin(request);
      const { id } = request.params as any;
      uuid.parse(id);
      const offset = z.coerce.number().int().nonnegative().parse(request.headers['upload-offset']);
      if (!Buffer.isBuffer(request.body) || request.body.length === 0)
        throw new HttpError(400, 'Пустая часть файла');
      const chunk = request.body as Buffer;
      const next = await transaction(async (db) => {
        const {
          rows: [upload],
        } = await db.query('SELECT * FROM uploads WHERE id=$1 AND owner_id=$2 FOR UPDATE', [
          id,
          user.id,
        ]);
        if (!upload) throw new HttpError(404, 'Загрузка не найдена');
        if (upload.status !== 'uploading') throw new HttpError(409, 'Загрузка уже завершена');
        if (Number(upload.offset_bytes) !== offset)
          throw new HttpError(409, 'Смещение изменилось. Возобновите загрузку');
        if (offset + chunk.length > Number(upload.size))
          throw new HttpError(400, 'Часть выходит за размер файла');
        if ((await diskAvailable()) < config.DISK_RESERVE_BYTES + chunk.length)
          throw new HttpError(507, 'Свободное место закончилось');
        const fd = await open(uploadPath(id), 'r+');
        try {
          const file = await fd.stat();
          if (file.size < offset)
            throw new HttpError(409, 'Исходник повреждён, начните загрузку заново');
          if (file.size > offset) await fd.truncate(offset);
          let written = 0;
          while (written < chunk.length) {
            const result = await fd.write(chunk, written, chunk.length - written, offset + written);
            if (!result.bytesWritten) throw new Error('Could not write upload chunk');
            written += result.bytesWritten;
          }
          await fd.sync();
        } finally {
          await fd.close();
        }
        await db.query('UPDATE uploads SET offset_bytes=$2,updated_at=now() WHERE id=$1', [
          id,
          offset + chunk.length,
        ]);
        return offset + chunk.length;
      });
      return reply.header('Upload-Offset', next).send({ offset: next });
    },
  );
  app.post('/api/uploads/:id/complete', async (request) => {
    const user = requireAdmin(request);
    const { id } = request.params as any;
    uuid.parse(id);
    return transaction(async (db) => {
      const {
        rows: [upload],
      } = await db.query('SELECT * FROM uploads WHERE id=$1 AND owner_id=$2 FOR UPDATE', [
        id,
        user.id,
      ]);
      if (!upload) throw new HttpError(404, 'Загрузка не найдена');
      if (Number(upload.size) !== Number(upload.offset_bytes))
        throw new HttpError(400, 'Не все части загружены');
      if (upload.status === 'uploading') {
        const file = await stat(uploadPath(id));
        if (file.size !== Number(upload.size))
          throw new HttpError(409, 'Размер исходника не совпадает');
        await db.query(
          `INSERT INTO media(id,kind,name,owner_id) VALUES($1,'video',$2,$3) ON CONFLICT DO NOTHING`,
          [id, upload.name, user.id],
        );
        await db.query(`UPDATE uploads SET status='complete',updated_at=now() WHERE id=$1`, [id]);
      }
      return { id, status: 'queued' };
    });
  });
  app.delete('/api/uploads/:id', async (request) => {
    const user = requireAdmin(request);
    const { id } = request.params as any;
    uuid.parse(id);
    await transaction(async (db) => {
      const result = await db.query(
        `DELETE FROM uploads WHERE id=$1 AND owner_id=$2 AND status='uploading' RETURNING id`,
        [id, user.id],
      );
      if (!result.rowCount) throw new HttpError(409, 'Эту загрузку уже нельзя отменить');
      await unlink(uploadPath(id)).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
      });
    });
    return { ok: true };
  });
  app.post('/api/images', async (request, reply) => {
    const user = requireAdmin(request);
    const file = await request.file({ limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
    if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype))
      throw new HttpError(400, 'Выберите PNG, JPEG или WebP до 10 МБ');
    if ((await diskAvailable()) < config.DISK_RESERVE_BYTES + 20 * 1024 * 1024)
      throw new HttpError(507, 'Недостаточно места для изображения');
    const buffer = await file.toBuffer();
    const id = randomUUID();
    await mkdir(mediaPath(id), { recursive: true });
    let info;
    try {
      info = await sharp(buffer, { limitInputPixels: 32_000_000 })
        .rotate()
        .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85 })
        .toFile(path.join(mediaPath(id), 'image.webp'));
    } catch {
      throw new HttpError(400, 'Не удалось прочитать изображение');
    }
    await sql(
      `INSERT INTO media(id,kind,name,owner_id,status,width,height) VALUES($1,'image',$2,$3,'ready',$4,$5)`,
      [id, file.filename.slice(0, 255), user.id, info.width, info.height],
    );
    return reply.code(201).send({ id, url: `/api/media/${id}/image.webp` });
  });
  app.post('/api/media/:id/retry', async (request) => {
    requireAdmin(request);
    const { id } = request.params as any;
    uuid.parse(id);
    try {
      await stat(uploadPath(id));
    } catch {
      throw new HttpError(409, 'Исходник недоступен, загрузите видео заново');
    }
    const [media] = await sql(
      `UPDATE media SET status='queued',error=NULL,attempts=0,updated_at=now() WHERE id=$1 AND status='failed' RETURNING id`,
      [id],
    );
    if (!media) throw new HttpError(409, 'Повтор доступен только для неудачной обработки');
    return { ok: true };
  });
  app.get('/api/media/:id/*', async (request, reply) => {
    const user = requireUser(request);
    const { id, '*': file } = request.params as any;
    uuid.parse(id);
    if (!/^(master\.m3u8|poster\.jpg|image\.webp|v\d{2,4}\/(?:index\.m3u8|\d{5,}\.ts))$/.test(file))
      throw new HttpError(404, 'Файл не найден');
    const [media] = await sql('SELECT status FROM media WHERE id=$1', [id]);
    if (!media || media.status !== 'ready') throw new HttpError(404, 'Материал ещё не готов');
    if (user.role !== 'admin') {
      const [access] = await sql(
        `SELECT 1 FROM lessons l JOIN courses c ON c.id=l.course_id JOIN enrollments e ON e.course_id=c.id WHERE (l.video_id=$1 OR l.image_id=$1) AND e.user_id=$2 AND c.published LIMIT 1`,
        [id, user.id],
      );
      if (!access) throw new HttpError(404, 'Материал не найден');
    }
    reply.header(
      'Cache-Control',
      file.endsWith('.m3u8') ? 'private, no-store' : 'private, max-age=300',
    );
    if (file.endsWith('.m3u8')) reply.type('application/vnd.apple.mpegurl');
    if (file.endsWith('.ts')) reply.type('video/mp2t');
    return reply.sendFile(file, mediaPath(id));
  });
}
