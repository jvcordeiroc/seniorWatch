import { describe, it, expect } from 'vitest';
import { RealtimeHub, type Sendable } from '../src/realtime-hub.js';
import type { StreamEvent } from '../src/contracts.js';

class FakeSocket implements Sendable {
  sent: string[] = [];
  send(data: string) {
    this.sent.push(data);
  }
}

const event: StreamEvent = {
  type: 'alert',
  deviceId: 'watch-001',
  alert: 'fall',
  severity: 'critical',
  message: 'Queda detectada',
  timestamp: '2026-06-02T12:00:00.000Z',
  value: null,
};

describe('RealtimeHub', () => {
  it('faz broadcast para todos os clientes conectados', () => {
    const hub = new RealtimeHub();
    const a = new FakeSocket();
    const b = new FakeSocket();
    hub.add(a);
    hub.add(b);
    hub.broadcast(event);
    expect(JSON.parse(a.sent[0])).toMatchObject({ alert: 'fall' });
    expect(JSON.parse(b.sent[0])).toMatchObject({ alert: 'fall' });
  });

  it('não envia para clientes removidos', () => {
    const hub = new RealtimeHub();
    const a = new FakeSocket();
    hub.add(a);
    hub.remove(a);
    hub.broadcast(event);
    expect(a.sent).toHaveLength(0);
  });

  it('continua o broadcast mesmo se um cliente lançar erro ao enviar', () => {
    const hub = new RealtimeHub();
    const bad: Sendable = {
      send() {
        throw new Error('socket morto');
      },
    };
    const good = new FakeSocket();
    hub.add(bad);
    hub.add(good);
    expect(() => hub.broadcast(event)).not.toThrow();
    expect(good.sent).toHaveLength(1);
  });
});
