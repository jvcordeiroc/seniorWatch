import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildServer, type EloServer } from '../src/server.js';

const fallTelemetry = {
  deviceId: 'watch-001',
  timestamp: '2026-06-02T12:00:00.000Z',
  heartRate: 78,
  steps: 100,
  spo2: 97,
  battery: 80,
  location: { lat: -23.56, lng: -46.64, accuracy: 12 },
  fallDetected: true,
};

describe('end-to-end: telemetria de queda chega ao cliente WS', () => {
  let app: EloServer;
  let baseUrl: string;

  beforeEach(async () => {
    app = buildServer({ dbPath: ':memory:' });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    if (addr === null || typeof addr === 'string') throw new Error('sem endereço de porta');
    baseUrl = `127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    await app.close();
  });

  it('cliente recebe evento de telemetria e alerta de fall', async () => {
    const ws = new WebSocket(`ws://${baseUrl}/v1/stream`);
    const received: any[] = [];

    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => resolve());
      ws.addEventListener('error', () => reject(new Error('falha ao abrir WS')));
    });

    ws.addEventListener('message', (ev) => received.push(JSON.parse(ev.data as string)));

    await fetch(`http://${baseUrl}/v1/telemetry`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(fallTelemetry),
    });

    // espera as mensagens chegarem
    await new Promise((r) => setTimeout(r, 200));
    ws.close();

    const types = received.map((m) => m.type);
    expect(types).toContain('telemetry');
    expect(received.find((m) => m.type === 'alert')?.alert).toBe('fall');
  });
});
