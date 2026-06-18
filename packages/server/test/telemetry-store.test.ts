import { describe, it, expect } from 'vitest';
import { TelemetryStore } from '../src/telemetry-store.js';
import type { Telemetry } from '../src/contracts.js';

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

describe('TelemetryStore', () => {
  it('persiste e devolve a telemetria mais recente', () => {
    const store = new TelemetryStore(':memory:');
    store.insert(tel({ heartRate: 70, timestamp: '2026-06-02T12:00:00.000Z' }));
    store.insert(tel({ heartRate: 90, timestamp: '2026-06-02T12:00:05.000Z' }));
    const latest = store.latest('watch-001');
    expect(latest?.heartRate).toBe(90);
    expect(latest?.location).toEqual({ lat: -23.56, lng: -46.64, accuracy: 12 });
  });

  it('devolve null quando não há telemetria do dispositivo', () => {
    const store = new TelemetryStore(':memory:');
    expect(store.latest('inexistente')).toBeNull();
  });

  it('devolve o histórico em ordem decrescente de tempo, respeitando o limite', () => {
    const store = new TelemetryStore(':memory:');
    store.insert(tel({ timestamp: '2026-06-02T12:00:00.000Z', heartRate: 1 }));
    store.insert(tel({ timestamp: '2026-06-02T12:00:01.000Z', heartRate: 2 }));
    store.insert(tel({ timestamp: '2026-06-02T12:00:02.000Z', heartRate: 3 }));
    const hist = store.history('watch-001', 2);
    expect(hist.map((t) => t.heartRate)).toEqual([3, 2]);
  });

  it('lista os dispositivos conhecidos', () => {
    const store = new TelemetryStore(':memory:');
    store.insert(tel({ deviceId: 'a' }));
    store.insert(tel({ deviceId: 'b' }));
    expect(store.devices().sort()).toEqual(['a', 'b']);
  });

  it('reporta o último contato (epoch ms) por dispositivo', () => {
    const store = new TelemetryStore(':memory:');
    store.insert(tel({ deviceId: 'a', timestamp: '2026-06-02T12:00:00.000Z' }));
    const seen = store.lastSeen();
    expect(seen.get('a')).toBe(new Date('2026-06-02T12:00:00.000Z').getTime());
  });
});
