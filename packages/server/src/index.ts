import { buildServer } from './server.js';

const PORT = Number(process.env.PORT ?? 3000);
const DB_PATH = process.env.DB_PATH ?? 'elo.sqlite';
const OFFLINE_CHECK_MS = 15_000;

const app = buildServer({ dbPath: DB_PATH });

// Verificador periódico de dispositivos offline.
const timer = setInterval(() => {
  const alerts = app.engine.checkOffline(app.store.lastSeen(), Date.now());
  for (const alert of alerts) app.hub.broadcast(alert);
}, OFFLINE_CHECK_MS);

app.addHook('onClose', async () => clearInterval(timer));

app
  .listen({ port: PORT, host: '0.0.0.0' })
  .then(() => console.log(`[elo] servidor ouvindo em http://localhost:${PORT}`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
