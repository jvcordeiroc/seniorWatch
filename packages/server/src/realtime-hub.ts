import type { StreamEvent } from './contracts.js';

export interface Sendable {
  send(data: string): void;
}

export class RealtimeHub {
  private clients = new Set<Sendable>();

  add(client: Sendable): void {
    this.clients.add(client);
  }

  remove(client: Sendable): void {
    this.clients.delete(client);
  }

  get size(): number {
    return this.clients.size;
  }

  broadcast(event: StreamEvent): void {
    const payload = JSON.stringify(event);
    for (const client of this.clients) {
      try {
        client.send(payload);
      } catch {
        // cliente provavelmente desconectou; será removido no evento de close
      }
    }
  }
}
