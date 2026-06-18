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
