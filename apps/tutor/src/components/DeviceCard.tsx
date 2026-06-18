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
