# Elo Saúde — Design

**Data:** 2026-06-02
**Status:** Aprovado para implementação (decisões tomadas pelo agente a pedido do usuário)

## Visão geral

Sistema de acompanhamento remoto de saúde de idosos. Um relógio (smartwatch) no
pulso do idoso coleta dados de sensores e os envia em tempo real. Um tutor
(familiar/cuidador) instala um app no celular e acompanha os dados ao vivo,
recebendo alertas em situações de risco.

A frase original do usuário: *"Um app para relógio para acompanhamento de dados
de idosos. O tutor baixa o app no celular que recebe as informações em tempo
real do relógio."*

## Decomposição em sub-projetos

O produto completo é grande demais para um único ciclo de implementação. Ele se
divide em três componentes que se comunicam por contratos bem definidos:

1. **Backend (núcleo)** — recebe telemetria, persiste histórico, avalia regras de
   alerta e repassa dados/alertas ao vivo.
2. **App do tutor** — consome os dados em tempo real e exibe painel + alertas.
3. **App do relógio (nativo)** — coleta sensores no dispositivo e envia telemetria.

**Este spec cobre o primeiro sub-projeto: o triângulo end-to-end** composto por
**Backend + Simulador de relógio + App do tutor (web)**. O app de relógio nativo
(Wear OS / watchOS) é um sub-projeto posterior que reaproveita os mesmos
contratos de dados — por isso é substituído, neste primeiro ciclo, por um
**simulador** que gera e envia os sensores.

### Por que começar pelo triângulo end-to-end

- É demonstrável imediatamente, sem depender de hardware ou de publicação em
  lojas de apps.
- Congela os **contratos de dados** (telemetria e alertas), que são a interface
  da qual os apps nativos dependerão depois.
- Permite validar as regras de alerta com cenários simulados (queda, taquicardia,
  bateria baixa, dispositivo offline) de forma reprodutível.

## Stack

| Componente | Tecnologia | Motivo |
|------------|-----------|--------|
| Backend | Node 20+ / TypeScript / Fastify | Leve, rápido, tipado |
| Tempo real | WebSocket (`ws`) | Push de telemetria e alertas ao tutor |
| Persistência | SQLite (`better-sqlite3`) | Zero dependência externa no MVP |
| Simulador do relógio | Node / TypeScript (CLI) | Substitui o hardware; reusa o contrato |
| App do tutor | React + Vite + TypeScript | Mobile-first; abre no navegador hoje |
| Testes | Vitest | Mesmo ecossistema, rápido |

## Arquitetura e fluxo de dados

```
  ⌚ Simulador de relógio                ☁️ Backend                 📱 App do tutor
  (device: BPM, passos,                                            (React, mobile-first)
   SpO2, bateria, GPS,        POST /v1/telemetry  ┌───────────┐
   queda)  ────────────────────────────────────► │ Ingestão  │
                                                  │  + valida │
                                                  └─────┬─────┘
                                                        │
                                                  ┌─────▼─────┐   persiste histórico
                                                  │  SQLite   │◄──────────────────
                                                  └─────┬─────┘
                                                        │
                                                  ┌─────▼──────┐  avalia regras
                                                  │ Alertas    │  (queda, BPM,
                                                  │ (motor)    │   bateria, offline)
                                                  └─────┬──────┘
                                                        │ push (telemetria+alertas)
                                                  ┌─────▼──────┐   WS /v1/stream
                                                  │ WebSocket  │ ─────────────────►  painel ao vivo
                                                  └────────────┘                     + alertas
```

### Contrato de telemetria (relógio → backend)

`POST /v1/telemetry`

```jsonc
{
  "deviceId": "watch-001",       // identificador do relógio
  "timestamp": "2026-06-02T12:00:00.000Z",
  "heartRate": 78,                // BPM
  "steps": 5421,                  // contador do dia
  "spo2": 97,                     // saturação de O2 (%)
  "battery": 64,                  // % de bateria do relógio
  "location": { "lat": -23.56, "lng": -46.64, "accuracy": 12 },
  "fallDetected": false           // flag de queda do sensor
}
```

### Contrato de evento ao vivo (backend → app do tutor) via WebSocket

```jsonc
// telemetria repassada
{ "type": "telemetry", "deviceId": "watch-001", "data": { /* igual acima */ } }

// alerta disparado
{
  "type": "alert",
  "deviceId": "watch-001",
  "alert": "fall",               // fall | high_hr | low_hr | low_battery | offline
  "severity": "critical",        // info | warning | critical
  "message": "Queda detectada",
  "timestamp": "2026-06-02T12:00:01.000Z",
  "value": null                  // valor que disparou a regra, quando aplicável
}
```

## Motor de alertas (regras do MVP)

Avaliadas a cada telemetria recebida (e por um verificador periódico para
`offline`):

| Alerta | Regra | Severidade |
|--------|-------|-----------|
| `fall` | `fallDetected === true` | critical |
| `high_hr` | `heartRate > 120` (em repouso/limiar configurável) | warning |
| `low_hr` | `heartRate < 45` | warning |
| `low_battery` | `battery < 15` | warning |
| `offline` | sem telemetria há > 60s | critical |

Limiares ficam num arquivo de configuração por dispositivo (valores padrão
acima). Anti-spam: cada tipo de alerta por dispositivo respeita um cooldown
(padrão 60s) para não repetir o mesmo alerta em rajada.

## Componentes (unidades isoladas)

**Backend**
- `telemetry-store` — persistência e consulta de telemetria (SQLite). Entrada:
  registros validados; saída: histórico por dispositivo.
- `alert-engine` — recebe uma telemetria + estado, devolve a lista de alertas
  disparados. Função pura testável, sem I/O.
- `realtime-hub` — gerencia conexões WebSocket e faz broadcast de telemetria e
  alertas para tutores inscritos num dispositivo.
- `http-api` — Fastify: rota de ingestão, rotas de consulta de histórico, e o
  endpoint WebSocket.

**Simulador**
- `watch-simulator` — CLI que gera telemetria realista e a envia ao backend;
  suporta cenários (`--scenario fall|tachycardia|low-battery|offline|normal`)
  para demonstrar cada alerta.

**App do tutor (web)**
- `live-dashboard` — conecta no WebSocket, mostra cartões com BPM, passos, SpO₂,
  bateria, última localização e status (online/offline).
- `alert-feed` — lista de alertas recebidos, com destaque por severidade.

## Tratamento de erros

- Telemetria com payload inválido → `400` com detalhe do campo; nada é
  persistido.
- `deviceId` desconhecido → aceito mesmo assim no MVP (auto-registro), mas
  marcado; autenticação/pareamento fica para sub-projeto futuro.
- Queda de conexão WebSocket → o app do tutor reconecta com backoff e busca o
  último estado via REST ao reconectar.
- Backend reiniciado → histórico persiste em SQLite; estado de "online/offline" é
  reconstruído a partir do último timestamp.

## Testes

- `alert-engine`: testes unitários cobrindo cada regra e o cooldown (função pura
  → fácil de cobrir exaustivamente).
- `telemetry-store`: testes de persistência/consulta com SQLite em memória.
- `http-api`: testes de integração da rota de ingestão (payload válido/ inválido)
  e do fluxo WebSocket (telemetria entra → evento sai).
- Teste end-to-end: simulador `--scenario fall` → backend → cliente WS recebe
  alerta `fall`.

## Fora de escopo (sub-projetos futuros)

- App de relógio **nativo** (Wear OS / watchOS) com acesso real aos sensores.
- Autenticação, contas e **pareamento** tutor ↔ relógio.
- App do tutor **nativo** (iOS/Android) com push notifications do SO.
- Múltiplos idosos por tutor / múltiplos tutores por idoso (multi-tenant).
- Histórico de longo prazo, gráficos e relatórios.
- LGPD/conformidade e criptografia em repouso (será necessário antes de produção).

## Decisões pendentes assumidas (o usuário pode reverter)

1. **Relógio é simulado neste primeiro ciclo** (hardware nativo vem depois).
2. **App do tutor é web mobile-first** (nativo vem depois).
3. **Sem autenticação no MVP** (pareamento vem depois).
4. **SQLite** como armazenamento inicial.
