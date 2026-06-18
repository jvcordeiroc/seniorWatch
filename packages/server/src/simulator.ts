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
  const spo2 = 96 + Math.floor(Math.random() * 3);
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
