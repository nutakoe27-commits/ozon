import { spawn } from 'node:child_process';
import { mkdir, open, writeFile, rm, unlink, stat } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { config } from './config.js';
import { migrate, pool, sql, transaction } from './db.js';
import { mediaPath, uploadPath, prepareStorage, diskAvailable } from './uploads.js';

export function command(
  program: string,
  args: string[],
  timeoutMs = 6 * 3600_000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let errors = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, timeoutMs);
    child.stdout.on('data', (data) => {
      output = (output + data).slice(-256_000);
    });
    child.stderr.on('data', (data) => {
      errors = (errors + data).slice(-8000);
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      code === 0
        ? resolve(output)
        : reject(new Error(`${program} exited ${code}: ${errors.slice(-2000)}`));
    });
  });
}
async function containerFormat(source: string) {
  const fd = await open(source, 'r');
  try {
    const bytes = Buffer.alloc(16);
    await fd.read(bytes, 0, 16, 0);
    if (bytes.subarray(4, 8).toString() === 'ftyp') return 'mov';
    if (bytes.subarray(0, 4).toString('hex') === '1a45dfa3') return 'matroska';
    throw new Error(
      'Поддерживаются MP4, современные MOV, WebM и MKV. Пересохраните видео в MP4 (H.264).',
    );
  } finally {
    await fd.close();
  }
}
export async function processNext() {
  const job = await transaction(async (db) => {
    const {
      rows: [next],
    } = await db.query(
      `SELECT * FROM media WHERE kind='video' AND (status='queued' OR (status='processing' AND lease_at < now()-interval '2 minutes')) AND attempts<3 ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1`,
    );
    if (!next) return null;
    await db.query(
      `UPDATE media SET status='processing',attempts=attempts+1,lease_at=now(),updated_at=now() WHERE id=$1`,
      [next.id],
    );
    return next;
  });
  if (!job) return false;
  const heartbeat = setInterval(() => {
    void sql('UPDATE media SET lease_at=now() WHERE id=$1', [job.id]).catch(() => undefined);
  }, 20_000);
  const target = mediaPath(job.id);
  const source = uploadPath(job.id);
  try {
    const file = await stat(source);
    if ((await diskAvailable()) < config.DISK_RESERVE_BYTES + file.size)
      throw new Error('Недостаточно места для обработки. Освободите диск и повторите.');
    const format = await containerFormat(source);
    const input = ['-protocol_whitelist', 'file', '-f', format, '-i', source];
    const probe = JSON.parse(
      await command(
        'ffprobe',
        ['-v', 'error', ...input, '-show_format', '-show_streams', '-of', 'json'],
        60_000,
      ),
    );
    const stream = probe.streams.find((s: any) => s.codec_type === 'video');
    const duration = Number(probe.format.duration);
    if (
      !stream ||
      !Number.isFinite(duration) ||
      duration <= 0 ||
      duration > 7 * 86400 ||
      stream.width > 8192 ||
      stream.height > 8192
    )
      throw new Error('Видео не читается или превышает допустимые параметры (8K / 7 суток).');
    await rm(target, { recursive: true, force: true });
    await mkdir(target, { recursive: true });
    const rotation = Math.abs(
      Number(stream.side_data_list?.find((s: any) => 'rotation' in s)?.rotation || 0),
    );
    const inputHeight = rotation === 90 || rotation === 270 ? stream.width : stream.height;
    const heights = [360, 720, 1080].filter(
      (h) => h <= config.MAX_VIDEO_HEIGHT && h <= inputHeight,
    );
    if (!heights.length) heights.push(Math.max(2, Math.floor(inputHeight / 2) * 2));
    const renditions: string[] = [];
    for (const height of heights) {
      const variant = `v${height}`;
      await mkdir(path.join(target, variant));
      const playlist = path.join(target, variant, 'index.m3u8');
      await command('ffmpeg', [
        '-hide_banner',
        '-loglevel',
        'error',
        '-nostdin',
        '-y',
        '-threads',
        String(config.TRANSCODE_THREADS),
        ...input,
        '-map',
        '0:v:0',
        '-map',
        '0:a:0?',
        '-sn',
        '-dn',
        '-vf',
        `scale=-2:${height}`,
        '-filter_threads',
        '1',
        '-c:v',
        'libx264',
        '-threads',
        String(config.TRANSCODE_THREADS),
        '-preset',
        'veryfast',
        '-crf',
        '23',
        '-pix_fmt',
        'yuv420p',
        '-force_key_frames',
        'expr:gte(t,n_forced*6)',
        '-c:a',
        'aac',
        '-b:a',
        '96k',
        '-ac',
        '2',
        '-f',
        'hls',
        '-hls_time',
        '6',
        '-hls_playlist_type',
        'vod',
        '-hls_segment_filename',
        path.join(target, variant, '%05d.ts'),
        playlist,
      ]);
      const p = JSON.parse(
        await command(
          'ffprobe',
          [
            '-v',
            'error',
            '-select_streams',
            'v:0',
            '-show_entries',
            'stream=width,height',
            '-of',
            'json',
            path.join(target, variant, '00000.ts'),
          ],
          30_000,
        ),
      );
      renditions.push(
        `#EXT-X-STREAM-INF:BANDWIDTH=${height <= 360 ? 900000 : height <= 720 ? 2800000 : 5000000},RESOLUTION=${p.streams[0].width}x${p.streams[0].height}\n${variant}/index.m3u8`,
      );
    }
    await command(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-nostdin',
        '-y',
        ...input,
        '-ss',
        String(Math.min(3, duration / 4)),
        '-frames:v',
        '1',
        '-vf',
        'scale=960:-2',
        '-threads',
        '1',
        path.join(target, 'poster.jpg'),
      ],
      60_000,
    );
    await writeFile(
      path.join(target, 'master.m3u8'),
      `#EXTM3U\n#EXT-X-VERSION:3\n${renditions.join('\n')}\n`,
    );
    await sql(
      `UPDATE media SET status='ready',duration=$2,width=$3,height=$4,error=NULL,updated_at=now() WHERE id=$1`,
      [job.id, duration, stream.width, stream.height],
    );
    await unlink(source).catch(() => undefined);
    console.info(`Video ${job.id}: ready (${Math.round(duration)} seconds)`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Ошибка обработки';
    console.error(`Video ${job.id}: ${detail}`);
    await sql(`UPDATE media SET status='failed',error=$2,updated_at=now() WHERE id=$1`, [
      job.id,
      detail.slice(0, 2500),
    ]);
  } finally {
    clearInterval(heartbeat);
  }
  return true;
}
let stopping = false;
async function main() {
  await prepareStorage();
  await migrate();
  process.on('SIGTERM', () => {
    stopping = true;
  });
  process.on('SIGINT', () => {
    stopping = true;
  });
  console.info('Video worker started; concurrency=1');
  let cleanedAt = 0;
  while (!stopping) {
    try {
      if (Date.now() - cleanedAt > 3600_000) {
        await sql('DELETE FROM sessions WHERE expires_at<now()');
        const expired = await sql(
          `DELETE FROM uploads WHERE status='uploading' AND updated_at<now()-interval '7 days' RETURNING id`,
        );
        for (const upload of expired) await unlink(uploadPath(upload.id)).catch(() => undefined);
        // A machine killed on its final processing attempt should expose a retryable failure.
        await sql(
          `UPDATE media SET status='failed',error='Обработка прервалась. Нажмите «Повторить».',updated_at=now() WHERE status='processing' AND attempts>=3 AND lease_at<now()-interval '2 minutes'`,
        );
        cleanedAt = Date.now();
      }
      if (!(await processNext())) await delay(2000);
    } catch (error) {
      console.error('Worker loop:', error instanceof Error ? error.message : 'error');
      await delay(5000);
    }
  }
  await pool.end();
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
