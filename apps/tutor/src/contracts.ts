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
