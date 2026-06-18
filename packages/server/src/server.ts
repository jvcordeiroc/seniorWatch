import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import { AlertEngine } from './alert-engine.js';
import { TelemetryStore } from './telemetry-store.js';
import { RealtimeHub } from './realtime-hub.js';
import { parseTelemetry } from './validation.js';
import { DEFAULT_THRESHOLDS, type Thresholds, type TelemetryEvent } from './contracts.js';

export interface ServerOptions {
  dbPath?: string;
  thresholds?: Thresholds;
}

export interface EloServer extends FastifyInstance {
  store: TelemetryStore;
  engine: AlertEngine;
  hub: RealtimeHub;
}

export function buildServer(opts: ServerOptions = {}): EloServer {
  const app = Fastify({ logger: false }) as unknown as EloServer;
  app.store = new TelemetryStore(opts.dbPath ?? ':memory:');
  app.engine = new AlertEngine(opts.thresholds ?? DEFAULT_THRESHOLDS);
  app.hub = new RealtimeHub();

  app.register(websocket);

  app.post('/v1/telemetry', async (request, reply) => {
    const parsed = parseTelemetry(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error });
    }
    const t = parsed.data;
    app.store.insert(t);

    const telemetryEvent: TelemetryEvent = { type: 'telemetry', deviceId: t.deviceId, data: t };
    app.hub.broadcast(telemetryEvent);

    const alerts = app.engine.evaluate(t, new Date(t.timestamp).getTime());
    for (const alert of alerts) app.hub.broadcast(alert);

    return reply.code(202).send({ accepted: true, alerts: alerts.length });
  });

  app.get('/v1/devices', async () => app.store.devices());

  app.get<{ Params: { id: string } }>('/v1/devices/:id/latest', async (request, reply) => {
    const latest = app.store.latest(request.params.id);
    if (!latest) return reply.code(404).send({ error: 'dispositivo sem telemetria' });
    return latest;
  });

  app.get<{ Params: { id: string }; Querystring: { limit?: string } }>(
    '/v1/devices/:id/history',
    async (request) => {
      const limit = Math.min(Number(request.query.limit ?? 50) || 50, 500);
      return app.store.history(request.params.id, limit);
    },
  );

  app.register(async (scoped) => {
    scoped.get('/v1/stream', { websocket: true }, (socket) => {
      app.hub.add(socket);
      socket.on('close', () => app.hub.remove(socket));
    });
  });

  return app;
}
