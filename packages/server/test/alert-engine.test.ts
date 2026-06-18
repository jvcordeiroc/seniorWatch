import { describe, it, expect } from 'vitest';
import { AlertEngine } from '../src/alert-engine.js';
import { DEFAULT_THRESHOLDS, type Telemetry } from '../src/contracts.js';

function tel(over: Partial<Telemetry> = {}): Telemetry {
  return {
    deviceId: 'watch-001',
    timestamp: '2026-06-02T12:00:00.000Z',
    heartRate: 78,
    steps: 100,
    spo2: 97,
    battery: 80,
    location: { lat: -23.56, lng: -46.64, accuracy: 12 },
    fallDetected: false,
    ...over,
  };
}

describe('AlertEngine.evaluate', () => {
  it('não dispara nada em telemetria normal', () => {
    const e = new AlertEngine();
    expect(e.evaluate(tel(), 1000)).toEqual([]);
  });

  it('dispara fall (critical) quando fallDetected', () => {
    const e = new AlertEngine();
    const alerts = e.evaluate(tel({ fallDetected: true }), 1000);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ alert: 'fall', severity: 'critical', deviceId: 'watch-001' });
  });

  it('dispara high_hr acima do limiar', () => {
    const e = new AlertEngine();
    const alerts = e.evaluate(tel({ heartRate: 130 }), 1000);
    expect(alerts.map((a) => a.alert)).toContain('high_hr');
    expect(alerts.find((a) => a.alert === 'high_hr')?.value).toBe(130);
  });

  it('dispara low_hr abaixo do limiar', () => {
    const e = new AlertEngine();
    expect(e.evaluate(tel({ heartRate: 40 }), 1000).map((a) => a.alert)).toContain('low_hr');
  });

  it('dispara low_battery abaixo do limiar', () => {
    const e = new AlertEngine();
    expect(e.evaluate(tel({ battery: 10 }), 1000).map((a) => a.alert)).toContain('low_battery');
  });

  it('respeita cooldown: não repete o mesmo alerta dentro da janela', () => {
    const e = new AlertEngine();
    expect(e.evaluate(tel({ fallDetected: true }), 1000)).toHaveLength(1);
    expect(e.evaluate(tel({ fallDetected: true }), 1000 + 30_000)).toHaveLength(0);
  });

  it('volta a disparar após o cooldown', () => {
    const e = new AlertEngine();
    e.evaluate(tel({ fallDetected: true }), 1000);
    const later = 1000 + DEFAULT_THRESHOLDS.cooldownMs + 1;
    expect(e.evaluate(tel({ fallDetected: true }), later)).toHaveLength(1);
  });
});

describe('AlertEngine.checkOffline', () => {
  it('dispara offline quando o último contato passou do limiar', () => {
    const e = new AlertEngine();
    const lastSeen = new Map([['watch-001', 0]]);
    const alerts = e.checkOffline(lastSeen, DEFAULT_THRESHOLDS.offlineMs + 1);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ alert: 'offline', severity: 'critical', deviceId: 'watch-001' });
  });

  it('não dispara offline dentro do limiar', () => {
    const e = new AlertEngine();
    const lastSeen = new Map([['watch-001', 0]]);
    expect(e.checkOffline(lastSeen, 1000)).toHaveLength(0);
  });
});
