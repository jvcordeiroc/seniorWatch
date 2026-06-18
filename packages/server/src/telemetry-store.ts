import type * as NodeSqlite from 'node:sqlite';
import type { Telemetry } from './contracts.js';

// node:sqlite é experimental e não consta em builtinModules sem o prefixo, o que
// quebra bundlers (Vite/Vitest). process.getBuiltinModule (Node 22.3+) carrega o
// módulo nativo em runtime, fora do alcance do bundler; os tipos vêm do import type.
const { DatabaseSync } = process.getBuiltinModule('node:sqlite') as typeof NodeSqlite;

interface Row {
  deviceId: string;
  timestamp: string;
  heartRate: number;
  steps: number;
  spo2: number;
  battery: number;
  lat: number;
  lng: number;
  accuracy: number;
  fallDetected: number;
}

function rowToTelemetry(r: Row): Telemetry {
  return {
    deviceId: r.deviceId,
    timestamp: r.timestamp,
    heartRate: r.heartRate,
    steps: r.steps,
    spo2: r.spo2,
    battery: r.battery,
    location: { lat: r.lat, lng: r.lng, accuracy: r.accuracy },
    fallDetected: r.fallDetected === 1,
  };
}

export class TelemetryStore {
  private db: InstanceType<typeof DatabaseSync>;

  constructor(path = ':memory:') {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS telemetry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        deviceId TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        heartRate INTEGER NOT NULL,
        steps INTEGER NOT NULL,
        spo2 INTEGER NOT NULL,
        battery INTEGER NOT NULL,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        accuracy REAL NOT NULL,
        fallDetected INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_device_time ON telemetry (deviceId, timestamp);
    `);
  }

  insert(t: Telemetry): void {
    this.db
      .prepare(
        `INSERT INTO telemetry
         (deviceId, timestamp, heartRate, steps, spo2, battery, lat, lng, accuracy, fallDetected)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        t.deviceId,
        t.timestamp,
        t.heartRate,
        t.steps,
        t.spo2,
        t.battery,
        t.location.lat,
        t.location.lng,
        t.location.accuracy,
        t.fallDetected ? 1 : 0,
      );
  }

  latest(deviceId: string): Telemetry | null {
    const row = this.db
      .prepare(`SELECT * FROM telemetry WHERE deviceId = ? ORDER BY timestamp DESC, id DESC LIMIT 1`)
      .get(deviceId) as Row | undefined;
    return row ? rowToTelemetry(row) : null;
  }

  history(deviceId: string, limit = 50): Telemetry[] {
    const rows = this.db
      .prepare(`SELECT * FROM telemetry WHERE deviceId = ? ORDER BY timestamp DESC, id DESC LIMIT ?`)
      .all(deviceId, limit) as unknown as Row[];
    return rows.map(rowToTelemetry);
  }

  devices(): string[] {
    const rows = this.db.prepare(`SELECT DISTINCT deviceId FROM telemetry`).all() as Array<{ deviceId: string }>;
    return rows.map((r) => r.deviceId);
  }

  lastSeen(): Map<string, number> {
    const rows = this.db
      .prepare(`SELECT deviceId, MAX(timestamp) AS ts FROM telemetry GROUP BY deviceId`)
      .all() as Array<{ deviceId: string; ts: string }>;
    return new Map(rows.map((r) => [r.deviceId, new Date(r.ts).getTime()]));
  }
}
