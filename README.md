# seniorWatch

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
