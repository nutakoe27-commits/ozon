import { migrate, pool } from './db.js';
await migrate();
console.info('Database schema ready');
await pool.end();
