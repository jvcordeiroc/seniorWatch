# seniorWatch — Triângulo End-to-End — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir o triângulo end-to-end do seniorWatch — backend (ingestão + tempo real + alertas), simulador de relógio e app web do tutor — demonstrável sem hardware.

**Architecture:** Monorepo npm com dois pacotes: `packages/server` (Fastify + WebSocket + `node:sqlite` + motor de alertas + simulador CLI) e `apps/tutor` (React + Vite, mobile-first). O relógio é substituído por um simulador que fala o mesmo contrato HTTP/WS. Telemetria entra por `POST /v1/telemetry`, é persistida e avaliada pelo motor de alertas, e telemetria+alertas são repassados ao tutor por WebSocket (`/v1/stream`).

**Tech Stack:** Node 25 (TypeScript via `tsx`), Fastify 5, `@fastify/websocket`, `node:sqlite` (nativo), Zod, Vitest, React 18 + Vite 6. Globais nativos usados: `fetch`, `WebSocket`.

**Decisões de fronteira (do spec):** O app do tutor mantém sua própria cópia mínima dos tipos de contrato (`apps/tutor/src/contracts.ts`), espelhando `packages/server/src/contracts.ts`. É duplicação type-only consciente na fronteira de rede, escolhida para eliminar fricção de build cross-package. Qualquer mudança de contrato deve ser aplicada nos dois arquivos.

---

## Estrutura de arquivos

```
seniorWatch/
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
  "name": "seniorWatch",
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
// Fonte da verdade dos contratos de dados do seniorWatch.
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

... (restante do conteúdo preservado inalterado) ...
