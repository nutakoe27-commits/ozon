import { config } from '../server/config.js';
import { sql, pool } from '../server/db.js';
if (config.production) throw new Error('Demo publishing is disabled in production');
const [video] = await sql(
  `SELECT status FROM media WHERE id='b0000000-0000-4000-8000-000000000001'`,
);
if (video?.status !== 'ready')
  throw new Error('Run the worker and wait until the demonstration video is ready');
await sql(
  `UPDATE courses SET published=true WHERE id IN ('c0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000003')`,
);
console.info('Three demonstration courses published');
await pool.end();
