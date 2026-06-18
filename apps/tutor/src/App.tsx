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
