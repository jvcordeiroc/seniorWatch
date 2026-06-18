# Elo Saúde — Triângulo End-to-End — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir o triângulo end-to-end do Elo Saúde — backend (ingestão + tempo real + alertas), simulador de relógio e app web do tutor — demonstrável sem hardware.

**Architecture:** Monorepo npm com dois pacotes: `packages/server` (Fastify + WebSocket + `node:sqlite` + motor de alertas + simulador CLI) e `apps/tutor` (React + Vite, mobile-first). O relógio é substituído por um simulador que fala o mesmo contrato HTTP/WS. Telemetria entra por `POST /v1/telemetry`, é persistida e avaliada pelo motor de alertas, e telemetria+alertas são repassados ao tutor por WebSocket (`/v1/stream`).

**Tech Stack:** Node 25 (TypeScript via `tsx`), Fastify 5, `@fastify/websocket`, `node:sqlite` (nativo), Zod, Vitest, React 18 + Vite 6. Globais nativos usados: `fetch`, `WebSocket`.

**Decisões de fronteira (do spec):** O app do tutor mantém sua própria cópia mínima dos tipos de contrato (`apps/tutor/src/contracts.ts`), espelhando `packages/server/src/contracts.ts`. É duplicação type-only consciente na fronteira de rede, escolhida para eliminar fricção de build cross-package. Qualquer mudança de contrato deve ser aplicada nos dois arquivos.

---

## Estrutura de arquivos

```
elo-saude/
  package.json                         # workspaces + scripts de conveniência
  tsconfig.base.json                   # opções TS compartilhadas
  packages/server/
    package.json
    tsconfig.json
    vitest.config.ts
    src/
      contracts.ts                     # tipos do contrato + thresholds (fonte da verdade)
      validation.ts                    # schema Zod da telemetria
      alert-engine.ts                  # AlertEngine (puro, com cooldown)
      telemetry-store.ts               # TelemetryStore (node:sqlite)
      realtime-hub.ts                  # RealtimeHub (broadcast WS)
      server.ts                        # buildServer() — monta o Fastify
      index.ts                         # bootstrap (porta + offline checker)
      simulator.ts                     # CLI do relógio simulado
    test/
      alert-engine.test.ts
      telemetry-store.test.ts
      realtime-hub.test.ts
      api.test.ts
      e2e.test.ts
  apps/tutor/
    package.json
    tsconfig.json
    vite.config.ts
    index.html
    src/
      main.tsx
      App.tsx
      contracts.ts                     # cópia espelhada dos tipos de contrato
      useStream.ts                     # hook: conexão WS + estado
      components/DeviceCard.tsx
      components/AlertFeed.tsx
      styles.css
```

---

## Task 1: Scaffold do monorepo

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `packages/server/package.json`
- Create: `packages/server/tsconfig.json`
- Create: `packages/server/vitest.config.ts`
- Create: `apps/tutor/package.json`

- [ ] **Step 1: Criar `package.json` da raiz**

```json
{
  "name": "elo-saude",
  "private": true,
  "version": "0.0.0",
  "workspaces": ["packages/*", "apps/*"],
  "scripts": {
    "dev:server": "npm run dev -w @elo/server",
    "dev:tutor": "npm run dev -w @elo/tutor",
    "sim": "npm run sim -w @elo/server --",
    "test": "npm run test -w @elo/server"
  }
}
```

- [ ] **Step 2: Criar `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  }
}
```

- [ ] **Step 3: Criar `packages/server/package.json`**

```json
{
  "name": "@elo/server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "sim": "tsx src/simulator.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@fastify/websocket": "^11.0.2",
    "fastify": "^5.2.0",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@types/node": "^22.10.5",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 4: Criar `packages/server/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "types": ["node"]
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 5: Criar `packages/server/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
```

- [ ] **Step 6: Criar `apps/tutor/package.json`**

```json
{
  "name": "@elo/tutor",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview --port 4173"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.18",
    "@types/react-dom": "^18.3.5",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.7.2",
    "vite": "^6.0.7"
  }
}
```

- [ ] **Step 7: Instalar dependências**

Run: `npm install`
Expected: instala sem erro e cria `node_modules/` + `package-lock.json`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold do monorepo (server + tutor)"
```

---

## Task 2: Contratos de dados

**Files:**
- Create: `packages/server/src/contracts.ts`

- [ ] **Step 1: Criar `packages/server/src/contracts.ts`**

```ts
// Fonte da verdade dos contratos de dados do Elo Saúde.
// O app do tutor mantém uma cópia espelhada em apps/tutor/src/contracts.ts.

export interface Telemetry {
  deviceId: string;
  timestamp: string; // ISO-8601
  heartRate: number; // BPM
  steps: number; // contador do dia
  spo2: number; // saturação de O2 (%)
  battery: number; // % de bateria do relógio
  location: { lat: number; lng: number; accuracy: number };
  fallDetected: boolean;
}

export type AlertType = 'fall' | 'high_hr' | 'low_hr' | 'low_battery' | 'offline';
export type Severity = 'info' | 'warning' | 'critical';

export interface AlertEvent {
  type: 'alert';
  deviceId: string;
  alert: AlertType;
  severity: Severity;
  message: string;
  timestamp: string;
  value: number | null;
}

export interface TelemetryEvent {
  type: 'telemetry';
  deviceId: string;
  data: Telemetry;
}

export type StreamEvent = TelemetryEvent | AlertEvent;

export interface Thresholds {
  highHr: number;
  lowHr: number;
  lowBattery: number;
  offlineMs: number;
  cooldownMs: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  highHr: 120,
  lowHr: 45,
  lowBattery: 15,
  offlineMs: 60_000,
  cooldownMs: 60_000,
};
```

- [ ] **Step 2: Commit**

```bash
git add packages/server/src/contracts.ts
git commit -m "feat: contratos de dados (telemetria, alertas, thresholds)"
```

---

## Task 3: Motor de alertas (TDD)

**Files:**
- Create: `packages/server/test/alert-engine.test.ts`
- Create: `packages/server/src/alert-engine.ts`

- [ ] **Step 1: Escrever o teste que falha**

`packages/server/test/alert-engine.test.ts`:

```ts
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
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm run test -w @elo/server -- alert-engine`
Expected: FAIL — `Cannot find module '../src/alert-engine.js'`.

- [ ] **Step 3: Implementar `packages/server/src/alert-engine.ts`**

```ts
import {
  DEFAULT_THRESHOLDS,
  type AlertEvent,
  type AlertType,
  type Severity,
  type Telemetry,
  type Thresholds,
} from './contracts.js';

interface Candidate {
  alert: AlertType;
  severity: Severity;
  message: string;
  value: number | null;
}

export class AlertEngine {
  private lastFired = new Map<string, number>(); // `${deviceId}:${alert}` -> epoch ms

  constructor(private readonly thresholds: Thresholds = DEFAULT_THRESHOLDS) {}

  evaluate(t: Telemetry, nowMs: number): AlertEvent[] {
    const candidates: Candidate[] = [];
    if (t.fallDetected) {
      candidates.push({ alert: 'fall', severity: 'critical', message: 'Queda detectada', value: null });
    }
    if (t.heartRate > this.thresholds.highHr) {
      candidates.push({ alert: 'high_hr', severity: 'warning', message: `Batimento alto: ${t.heartRate} bpm`, value: t.heartRate });
    }
    if (t.heartRate < this.thresholds.lowHr) {
      candidates.push({ alert: 'low_hr', severity: 'warning', message: `Batimento baixo: ${t.heartRate} bpm`, value: t.heartRate });
    }
    if (t.battery < this.thresholds.lowBattery) {
      candidates.push({ alert: 'low_battery', severity: 'warning', message: `Bateria baixa: ${t.battery}%`, value: t.battery });
    }
    return this.applyCooldown(t.deviceId, candidates, nowMs);
  }

  checkOffline(lastSeen: Map<string, number>, nowMs: number): AlertEvent[] {
    const candidatesByDevice: Array<[string, Candidate]> = [];
    for (const [deviceId, seen] of lastSeen) {
      if (nowMs - seen > this.thresholds.offlineMs) {
        candidatesByDevice.push([
          deviceId,
          { alert: 'offline', severity: 'critical', message: 'Relógio offline', value: null },
        ]);
      }
    }
    return candidatesByDevice.flatMap(([deviceId, c]) => this.applyCooldown(deviceId, [c], nowMs));
  }

  private applyCooldown(deviceId: string, candidates: Candidate[], nowMs: number): AlertEvent[] {
    const fired: AlertEvent[] = [];
    for (const c of candidates) {
      const key = `${deviceId}:${c.alert}`;
      const last = this.lastFired.get(key);
      if (last !== undefined && nowMs - last < this.thresholds.cooldownMs) continue;
      this.lastFired.set(key, nowMs);
      fired.push({
        type: 'alert',
        deviceId,
        alert: c.alert,
        severity: c.severity,
        message: c.message,
        timestamp: new Date(nowMs).toISOString(),
        value: c.value,
      });
    }
    return fired;
  }
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npm run test -w @elo/server -- alert-engine`
Expected: PASS (todos os casos).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/alert-engine.ts packages/server/test/alert-engine.test.ts
git commit -m "feat: motor de alertas com cooldown (TDD)"
```

---

## Task 4: Store de telemetria (TDD)

**Files:**
- Create: `packages/server/test/telemetry-store.test.ts`
- Create: `packages/server/src/telemetry-store.ts`

- [ ] **Step 1: Escrever o teste que falha**

`packages/server/test/telemetry-store.test.ts`:

```ts
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
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm run test -w @elo/server -- telemetry-store`
Expected: FAIL — `Cannot find module '../src/telemetry-store.js'`.

- [ ] **Step 3: Implementar `packages/server/src/telemetry-store.ts`**

```ts
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
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npm run test -w @elo/server -- telemetry-store`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/telemetry-store.ts packages/server/test/telemetry-store.test.ts
git commit -m "feat: store de telemetria com node:sqlite (TDD)"
```

---

## Task 5: Validação de telemetria (TDD)

**Files:**
- Create: `packages/server/test/validation.test.ts`
- Create: `packages/server/src/validation.ts`

- [ ] **Step 1: Escrever o teste que falha**

`packages/server/test/validation.test.ts`:

```ts
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
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm run test -w @elo/server -- validation`
Expected: FAIL — `Cannot find module '../src/validation.js'`.

- [ ] **Step 3: Implementar `packages/server/src/validation.ts`**

```ts
import { z } from 'zod';
import type { Telemetry } from './contracts.js';

const telemetrySchema = z.object({
  deviceId: z.string().min(1),
  timestamp: z.string().datetime(),
  heartRate: z.number().int().min(0).max(300),
  steps: z.number().int().min(0),
  spo2: z.number().int().min(0).max(100),
  battery: z.number().int().min(0).max(100),
  location: z.object({
    lat: z.number(),
    lng: z.number(),
    accuracy: z.number().min(0),
  }),
  fallDetected: z.boolean(),
});

export type ParseResult =
  | { success: true; data: Telemetry }
  | { success: false; error: string };

export function parseTelemetry(input: unknown): ParseResult {
  const r = telemetrySchema.safeParse(input);
  if (r.success) return { success: true, data: r.data };
  const first = r.error.issues[0];
  return { success: false, error: `${first.path.join('.') || '(raiz)'}: ${first.message}` };
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npm run test -w @elo/server -- validation`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/validation.ts packages/server/test/validation.test.ts
git commit -m "feat: validação de telemetria com Zod (TDD)"
```

---

## Task 6: Realtime hub (TDD)

**Files:**
- Create: `packages/server/test/realtime-hub.test.ts`
- Create: `packages/server/src/realtime-hub.ts`

- [ ] **Step 1: Escrever o teste que falha**

`packages/server/test/realtime-hub.test.ts`:

```ts
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
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm run test -w @elo/server -- realtime-hub`
Expected: FAIL — `Cannot find module '../src/realtime-hub.js'`.

- [ ] **Step 3: Implementar `packages/server/src/realtime-hub.ts`**

```ts
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
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npm run test -w @elo/server -- realtime-hub`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/realtime-hub.ts packages/server/test/realtime-hub.test.ts
git commit -m "feat: realtime hub para broadcast WS (TDD)"
```

---

## Task 7: Montagem do servidor Fastify (TDD com inject)

**Files:**
- Create: `packages/server/test/api.test.ts`
- Create: `packages/server/src/server.ts`

- [ ] **Step 1: Escrever o teste que falha**

`packages/server/test/api.test.ts`:

```ts
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
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm run test -w @elo/server -- api`
Expected: FAIL — `Cannot find module '../src/server.js'`.

- [ ] **Step 3: Implementar `packages/server/src/server.ts`**

```ts
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
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npm run test -w @elo/server -- api`
Expected: PASS.

> Nota: `@fastify/websocket` v11 entrega o `WebSocket` diretamente como primeiro argumento do handler (`socket`), que já possui `.send()` e `.on('close')` — compatível com a interface `Sendable`.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/server.ts packages/server/test/api.test.ts
git commit -m "feat: API Fastify de ingestão, consulta e stream WS (TDD)"
```

---

## Task 8: Bootstrap do servidor + offline checker

**Files:**
- Create: `packages/server/src/index.ts`

- [ ] **Step 1: Implementar `packages/server/src/index.ts`**

```ts
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
```

- [ ] **Step 2: Subir o servidor e verificar manualmente**

Run: `npm run dev:server`
Expected: log `[elo] servidor ouvindo em http://localhost:3000`. Encerre com Ctrl+C.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/index.ts
git commit -m "feat: bootstrap do servidor com verificador de offline"
```

---

## Task 9: Simulador de relógio (CLI)

**Files:**
- Create: `packages/server/src/simulator.ts`

- [ ] **Step 1: Implementar `packages/server/src/simulator.ts`**

```ts
import type { Telemetry } from './contracts.js';

type Scenario = 'normal' | 'fall' | 'tachycardia' | 'bradycardia' | 'low-battery' | 'offline';

interface Args {
  url: string;
  deviceId: string;
  scenario: Scenario;
  intervalMs: number;
}

function parseArgs(argv: string[]): Args {
  const get = (name: string, fallback: string) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split('=').slice(1).join('=') : fallback;
  };
  return {
    url: get('url', 'http://localhost:3000'),
    deviceId: get('device', 'watch-001'),
    scenario: get('scenario', 'normal') as Scenario,
    intervalMs: Number(get('interval', '2000')),
  };
}

let steps = 0;
let battery = 90;

function sample(deviceId: string, scenario: Scenario): Telemetry {
  steps += Math.floor(Math.random() * 20);
  battery = Math.max(0, battery - 0.2);
  let heartRate = 70 + Math.floor(Math.random() * 15);
  let spo2 = 96 + Math.floor(Math.random() * 3);
  let fallDetected = false;
  let bat = battery;

  switch (scenario) {
    case 'fall':
      fallDetected = Math.random() < 0.3;
      break;
    case 'tachycardia':
      heartRate = 125 + Math.floor(Math.random() * 20);
      break;
    case 'bradycardia':
      heartRate = 38 + Math.floor(Math.random() * 5);
      break;
    case 'low-battery':
      bat = 8;
      break;
    case 'offline':
      // tratado no loop: simplesmente não envia
      break;
  }

  return {
    deviceId,
    timestamp: new Date().toISOString(),
    heartRate,
    steps,
    spo2,
    battery: Math.round(bat),
    location: { lat: -23.56 + Math.random() * 0.01, lng: -46.64 + Math.random() * 0.01, accuracy: 8 + Math.random() * 10 },
    fallDetected,
  };
}

async function send(url: string, t: Telemetry): Promise<void> {
  try {
    const res = await fetch(`${url}/v1/telemetry`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(t),
    });
    const body = (await res.json()) as { alerts?: number };
    console.log(`[sim] ${t.deviceId} hr=${t.heartRate} bat=${t.battery}% fall=${t.fallDetected} -> ${res.status} alerts=${body.alerts ?? 0}`);
  } catch (err) {
    console.error(`[sim] falha ao enviar:`, (err as Error).message);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`[sim] cenário=${args.scenario} device=${args.deviceId} -> ${args.url} a cada ${args.intervalMs}ms`);
  if (args.scenario === 'offline') {
    console.log('[sim] cenário offline: nenhuma telemetria será enviada (aguarde o alerta de offline no tutor).');
    return;
  }
  const tick = async () => send(args.url, sample(args.deviceId, args.scenario));
  await tick();
  setInterval(tick, args.intervalMs);
}

main();
```

- [ ] **Step 2: Verificar o simulador contra o servidor**

Em um terminal: `npm run dev:server`
Em outro: `npm run sim -w @elo/server -- --scenario=fall`
Expected: linhas `[sim] watch-001 ... -> 202 alerts=...` e, ocasionalmente, `alerts=1` quando `fall=true`.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/simulator.ts
git commit -m "feat: simulador de relógio com cenários de alerta"
```

---

## Task 10: Teste end-to-end (simulador → backend → cliente WS)

**Files:**
- Create: `packages/server/test/e2e.test.ts`

- [ ] **Step 1: Escrever o teste end-to-end**

`packages/server/test/e2e.test.ts`:

```ts
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
```

- [ ] **Step 2: Rodar o teste e confirmar que passa**

Run: `npm run test -w @elo/server -- e2e`
Expected: PASS — o cliente recebe `telemetry` e o alerta `fall`.

- [ ] **Step 3: Rodar a suíte completa**

Run: `npm run test -w @elo/server`
Expected: todos os arquivos de teste passam.

- [ ] **Step 4: Commit**

```bash
git add packages/server/test/e2e.test.ts
git commit -m "test: e2e simulador->backend->cliente WS (fall)"
```

---

## Task 11: App do tutor — contratos + scaffold Vite

**Files:**
- Create: `apps/tutor/src/contracts.ts`
- Create: `apps/tutor/vite.config.ts`
- Create: `apps/tutor/tsconfig.json`
- Create: `apps/tutor/index.html`
- Create: `apps/tutor/src/main.tsx`

- [ ] **Step 1: Criar `apps/tutor/src/contracts.ts` (espelho do server)**

```ts
// ESPELHO de packages/server/src/contracts.ts — manter em sincronia.
export interface Telemetry {
  deviceId: string;
  timestamp: string;
  heartRate: number;
  steps: number;
  spo2: number;
  battery: number;
  location: { lat: number; lng: number; accuracy: number };
  fallDetected: boolean;
}

export type AlertType = 'fall' | 'high_hr' | 'low_hr' | 'low_battery' | 'offline';
export type Severity = 'info' | 'warning' | 'critical';

export interface AlertEvent {
  type: 'alert';
  deviceId: string;
  alert: AlertType;
  severity: Severity;
  message: string;
  timestamp: string;
  value: number | null;
}

export interface TelemetryEvent {
  type: 'telemetry';
  deviceId: string;
  data: Telemetry;
}

export type StreamEvent = TelemetryEvent | AlertEvent;
```

- [ ] **Step 2: Criar `apps/tutor/vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/v1': { target: 'http://localhost:3000', changeOrigin: true, ws: true },
    },
  },
});
```

- [ ] **Step 3: Criar `apps/tutor/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "esModuleInterop": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Criar `apps/tutor/index.html`**

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
    <title>Elo Saúde — Tutor</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Criar `apps/tutor/src/main.tsx`**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 6: Commit**

```bash
git add apps/tutor/src/contracts.ts apps/tutor/vite.config.ts apps/tutor/tsconfig.json apps/tutor/index.html apps/tutor/src/main.tsx
git commit -m "feat: scaffold do app do tutor (Vite + contratos espelhados)"
```

---

## Task 12: App do tutor — hook de stream

**Files:**
- Create: `apps/tutor/src/useStream.ts`

- [ ] **Step 1: Implementar `apps/tutor/src/useStream.ts`**

```ts
import { useEffect, useRef, useState } from 'react';
import type { AlertEvent, StreamEvent, Telemetry } from './contracts';

export interface StreamState {
  connected: boolean;
  devices: Record<string, Telemetry>;
  alerts: AlertEvent[];
}

const MAX_ALERTS = 50;

export function useStream(): StreamState {
  const [connected, setConnected] = useState(false);
  const [devices, setDevices] = useState<Record<string, Telemetry>>({});
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const retry = useRef(0);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let stopped = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${window.location.host}/v1/stream`);

      ws.onopen = () => {
        setConnected(true);
        retry.current = 0;
      };

      ws.onmessage = (ev) => {
        const event = JSON.parse(ev.data) as StreamEvent;
        if (event.type === 'telemetry') {
          setDevices((prev) => ({ ...prev, [event.deviceId]: event.data }));
        } else if (event.type === 'alert') {
          setAlerts((prev) => [event, ...prev].slice(0, MAX_ALERTS));
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (stopped) return;
        const delay = Math.min(1000 * 2 ** retry.current, 10_000);
        retry.current += 1;
        reconnectTimer = setTimeout(connect, delay);
      };

      ws.onerror = () => ws?.close();
    };

    connect();

    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  return { connected, devices, alerts };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/tutor/src/useStream.ts
git commit -m "feat: hook useStream com reconexão por backoff"
```

---

## Task 13: App do tutor — componentes e layout

**Files:**
- Create: `apps/tutor/src/components/DeviceCard.tsx`
- Create: `apps/tutor/src/components/AlertFeed.tsx`
- Create: `apps/tutor/src/App.tsx`
- Create: `apps/tutor/src/styles.css`

- [ ] **Step 1: Criar `apps/tutor/src/components/DeviceCard.tsx`**

```tsx
import type { Telemetry } from '../contracts';

function secondsAgo(timestamp: string): number {
  return Math.round((Date.now() - new Date(timestamp).getTime()) / 1000);
}

export function DeviceCard({ telemetry }: { telemetry: Telemetry }) {
  const age = secondsAgo(telemetry.timestamp);
  const online = age < 60;
  return (
    <section className="card">
      <header className="card__head">
        <h2>{telemetry.deviceId}</h2>
        <span className={`badge ${online ? 'badge--on' : 'badge--off'}`}>
          {online ? 'online' : 'offline'}
        </span>
      </header>
      <div className="metrics">
        <Metric label="Batimento" value={`${telemetry.heartRate}`} unit="bpm" />
        <Metric label="SpO₂" value={`${telemetry.spo2}`} unit="%" />
        <Metric label="Passos" value={`${telemetry.steps}`} unit="" />
        <Metric label="Bateria" value={`${telemetry.battery}`} unit="%" />
      </div>
      <footer className="card__foot">
        <span>📍 {telemetry.location.lat.toFixed(4)}, {telemetry.location.lng.toFixed(4)}</span>
        <span>{age}s atrás</span>
      </footer>
    </section>
  );
}

function Metric({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="metric">
      <span className="metric__value">{value}<small>{unit}</small></span>
      <span className="metric__label">{label}</span>
    </div>
  );
}
```

- [ ] **Step 2: Criar `apps/tutor/src/components/AlertFeed.tsx`**

```tsx
import type { AlertEvent } from '../contracts';

function timeLabel(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString('pt-BR');
}

export function AlertFeed({ alerts }: { alerts: AlertEvent[] }) {
  if (alerts.length === 0) {
    return <p className="empty">Nenhum alerta. Tudo tranquilo. 🌿</p>;
  }
  return (
    <ul className="alerts">
      {alerts.map((a, i) => (
        <li key={`${a.timestamp}-${a.alert}-${i}`} className={`alert alert--${a.severity}`}>
          <span className="alert__msg">{a.message}</span>
          <span className="alert__meta">{a.deviceId} · {timeLabel(a.timestamp)}</span>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 3: Criar `apps/tutor/src/App.tsx`**

```tsx
import { useStream } from './useStream';
import { DeviceCard } from './components/DeviceCard';
import { AlertFeed } from './components/AlertFeed';

export function App() {
  const { connected, devices, alerts } = useStream();
  const list = Object.values(devices);

  return (
    <div className="app">
      <header className="app__head">
        <h1>Elo Saúde</h1>
        <span className={`conn ${connected ? 'conn--on' : 'conn--off'}`}>
          {connected ? 'conectado' : 'reconectando…'}
        </span>
      </header>

      <main className="app__body">
        <section>
          <h3 className="section-title">Monitorados</h3>
          {list.length === 0 ? (
            <p className="empty">Aguardando o primeiro sinal do relógio…</p>
          ) : (
            <div className="grid">
              {list.map((t) => (
                <DeviceCard key={t.deviceId} telemetry={t} />
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="section-title">Alertas</h3>
          <AlertFeed alerts={alerts} />
        </section>
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Criar `apps/tutor/src/styles.css`**

```css
:root {
  --bg: #0f1720;
  --card: #18222e;
  --line: #243140;
  --text: #e6edf3;
  --muted: #93a4b5;
  --warn: #d99425;
  --crit: #e5484d;
  --ok: #3fb950;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}

* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); }

.app { max-width: 560px; margin: 0 auto; padding: 16px; }
.app__head {
  display: flex; align-items: center; justify-content: space-between;
  padding-bottom: 12px; border-bottom: 1px solid var(--line);
}
.app__head h1 { font-size: 20px; margin: 0; }
.conn { font-size: 12px; padding: 4px 10px; border-radius: 999px; }
.conn--on { background: rgba(63,185,80,.15); color: var(--ok); }
.conn--off { background: rgba(229,72,77,.15); color: var(--crit); }

.section-title { color: var(--muted); font-size: 13px; text-transform: uppercase; letter-spacing: .05em; margin: 20px 0 8px; }

.grid { display: grid; gap: 12px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 14px; }
.card__head { display: flex; align-items: center; justify-content: space-between; }
.card__head h2 { font-size: 16px; margin: 0; }
.badge { font-size: 11px; padding: 3px 8px; border-radius: 999px; }
.badge--on { background: rgba(63,185,80,.15); color: var(--ok); }
.badge--off { background: rgba(229,72,77,.15); color: var(--crit); }

.metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 14px 0; }
.metric { display: flex; flex-direction: column; align-items: center; }
.metric__value { font-size: 22px; font-weight: 600; }
.metric__value small { font-size: 12px; color: var(--muted); margin-left: 2px; }
.metric__label { font-size: 11px; color: var(--muted); margin-top: 2px; }

.card__foot { display: flex; justify-content: space-between; font-size: 12px; color: var(--muted); }

.alerts { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.alert { display: flex; flex-direction: column; padding: 10px 12px; border-radius: 10px; border-left: 4px solid var(--muted); background: var(--card); }
.alert--warning { border-left-color: var(--warn); }
.alert--critical { border-left-color: var(--crit); }
.alert__msg { font-weight: 600; }
.alert__meta { font-size: 12px; color: var(--muted); margin-top: 2px; }

.empty { color: var(--muted); font-size: 14px; padding: 8px 0; }
```

- [ ] **Step 5: Subir tutor + servidor + simulador e verificar no navegador**

Em três terminais:
1. `npm run dev:server`
2. `npm run sim -w @elo/server -- --scenario=tachycardia`
3. `npm run dev:tutor`

Abra `http://localhost:5173`. Expected: cartão `watch-001` aparece com batimento alto e alertas `Batimento alto` na lista; o indicador mostra "conectado".

- [ ] **Step 6: Commit**

```bash
git add apps/tutor/src/components apps/tutor/src/App.tsx apps/tutor/src/styles.css
git commit -m "feat: painel do tutor (cartões de dispositivo + feed de alertas)"
```

---

## Task 14: README e fechamento

**Files:**
- Create: `README.md`

- [ ] **Step 1: Criar `README.md`**

````markdown
# Elo Saúde

Acompanhamento remoto de saúde de idosos. Um relógio coleta sensores e envia em
tempo real; o tutor acompanha tudo num painel e recebe alertas.

Este repositório contém o **triângulo end-to-end**: backend, simulador de relógio
e app web do tutor. O app de relógio nativo é um sub-projeto futuro que reusa os
mesmos contratos (`packages/server/src/contracts.ts`).

## Rodando (3 terminais)

```bash
npm install

# 1) backend
npm run dev:server

# 2) simulador de relógio (escolha um cenário)
npm run sim -w @elo/server -- --scenario=normal
#   cenários: normal | fall | tachycardia | bradycardia | low-battery | offline

# 3) app do tutor
npm run dev:tutor   # abre em http://localhost:5173
```

## Testes

```bash
npm test
```

## Arquitetura

Veja `docs/superpowers/specs/2026-06-02-elo-saude-design.md` e o plano em
`docs/superpowers/plans/2026-06-02-elo-saude-triangulo.md`.
````

- [ ] **Step 2: Rodar a suíte completa uma última vez**

Run: `npm test`
Expected: todos os testes passam.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README com instruções de execução"
```

---

## Notas de verificação final

- Toda a lógica de domínio (alertas, store, validação, hub) tem cobertura de
  testes unitários; o fluxo completo tem cobertura e2e.
- O simulador cobre cada cenário de alerta para demonstração manual.
- Contratos duplicados (`packages/server/src/contracts.ts` ↔
  `apps/tutor/src/contracts.ts`) devem ser mantidos em sincronia — qualquer
  mudança de contrato toca os dois arquivos.
