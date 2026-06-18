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
