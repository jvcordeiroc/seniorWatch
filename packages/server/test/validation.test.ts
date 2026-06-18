import { describe, it, expect } from 'vitest';
import { parseTelemetry } from '../src/validation.js';

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

describe('parseTelemetry', () => {
  it('aceita um payload válido', () => {
    const r = parseTelemetry(valid);
    expect(r.success).toBe(true);
  });

  it('rejeita quando falta deviceId', () => {
    const { deviceId, ...rest } = valid;
    const r = parseTelemetry(rest);
    expect(r.success).toBe(false);
  });

  it('rejeita heartRate negativo', () => {
    const r = parseTelemetry({ ...valid, heartRate: -5 });
    expect(r.success).toBe(false);
  });

  it('rejeita spo2 fora de 0-100', () => {
    expect(parseTelemetry({ ...valid, spo2: 150 }).success).toBe(false);
  });

  it('rejeita location malformada', () => {
    expect(parseTelemetry({ ...valid, location: { lat: 1 } }).success).toBe(false);
  });
});
