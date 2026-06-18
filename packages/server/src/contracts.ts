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
