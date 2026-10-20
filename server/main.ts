import { buildApp } from './app.js';
import { config } from './config.js';
import { migrate, pool } from './db.js';
import { bootstrapAdmin } from './auth.js';
await migrate();
await bootstrapAdmin();
const app = await buildApp();
await app.listen({ host: '0.0.0.0', port: config.PORT });
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  await app.close();
  await pool.end();
}
process.on('SIGTERM', () => {
  void shutdown();
});
process.on('SIGINT', () => {
  void shutdown();
});
