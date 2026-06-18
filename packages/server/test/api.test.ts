import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../src/server.js';
import type { FastifyInstance } from 'fastify';

const valid = {
  deviceId: 'watch-001',
  timestamp: '2026-06-02T12:00:00.000Z',
  heartRate: 78,
  steps: 100,
  spo2: 97,
  battery: 80,
  location: { lat: -23.56, lng: -46.64, accuracy: 12 },
  fallDetected: false,
};

describe('HTTP API', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = buildServer({ dbPath: ':memory:' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('aceita telemetria válida com 202', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/telemetry', payload: valid });
    expect(res.statusCode).toBe(202);
  });

  it('rejeita telemetria inválida com 400 e detalhe', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/telemetry', payload: { ...valid, spo2: 999 } });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toHaveProperty('error');
  });

  it('devolve a última telemetria do dispositivo', async () => {
    await app.inject({ method: 'POST', url: '/v1/telemetry', payload: { ...valid, heartRate: 88 } });
    const res = await app.inject({ method: 'GET', url: '/v1/devices/watch-001/latest' });
    expect(res.statusCode).toBe(200);
    expect(res.json().heartRate).toBe(88);
  });

  it('404 ao buscar último de dispositivo desconhecido', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/devices/nada/latest' });
    expect(res.statusCode).toBe(404);
  });

  it('lista dispositivos conhecidos', async () => {
    await app.inject({ method: 'POST', url: '/v1/telemetry', payload: valid });
    const res = await app.inject({ method: 'GET', url: '/v1/devices' });
    expect(res.json()).toEqual(['watch-001']);
  });

  it('devolve histórico do dispositivo', async () => {
    await app.inject({ method: 'POST', url: '/v1/telemetry', payload: { ...valid, timestamp: '2026-06-02T12:00:00.000Z' } });
    await app.inject({ method: 'POST', url: '/v1/telemetry', payload: { ...valid, timestamp: '2026-06-02T12:00:01.000Z' } });
    const res = await app.inject({ method: 'GET', url: '/v1/devices/watch-001/history?limit=10' });
    expect(res.json()).toHaveLength(2);
  });
});
