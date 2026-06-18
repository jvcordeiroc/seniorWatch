import {
  DEFAULT_THRESHOLDS,
  type AlertEvent,
  type AlertType,
  type Severity,
  type Telemetry,
  type Thresholds,
} from './contracts.js';

interface Candidate {
  alert: AlertType;
  severity: Severity;
  message: string;
  value: number | null;
}

export class AlertEngine {
  private lastFired = new Map<string, number>(); // `${deviceId}:${alert}` -> epoch ms

  constructor(private readonly thresholds: Thresholds = DEFAULT_THRESHOLDS) {}

  evaluate(t: Telemetry, nowMs: number): AlertEvent[] {
    const candidates: Candidate[] = [];
    if (t.fallDetected) {
      candidates.push({ alert: 'fall', severity: 'critical', message: 'Queda detectada', value: null });
    }
    if (t.heartRate > this.thresholds.highHr) {
      candidates.push({ alert: 'high_hr', severity: 'warning', message: `Batimento alto: ${t.heartRate} bpm`, value: t.heartRate });
    }
    if (t.heartRate < this.thresholds.lowHr) {
      candidates.push({ alert: 'low_hr', severity: 'warning', message: `Batimento baixo: ${t.heartRate} bpm`, value: t.heartRate });
    }
    if (t.battery < this.thresholds.lowBattery) {
      candidates.push({ alert: 'low_battery', severity: 'warning', message: `Bateria baixa: ${t.battery}%`, value: t.battery });
    }
    return this.applyCooldown(t.deviceId, candidates, nowMs);
  }

  checkOffline(lastSeen: Map<string, number>, nowMs: number): AlertEvent[] {
    const candidatesByDevice: Array<[string, Candidate]> = [];
    for (const [deviceId, seen] of lastSeen) {
      if (nowMs - seen > this.thresholds.offlineMs) {
        candidatesByDevice.push([
          deviceId,
          { alert: 'offline', severity: 'critical', message: 'Relógio offline', value: null },
        ]);
      }
    }
    return candidatesByDevice.flatMap(([deviceId, c]) => this.applyCooldown(deviceId, [c], nowMs));
  }

  private applyCooldown(deviceId: string, candidates: Candidate[], nowMs: number): AlertEvent[] {
    const fired: AlertEvent[] = [];
    for (const c of candidates) {
      const key = `${deviceId}:${c.alert}`;
      const last = this.lastFired.get(key);
      if (last !== undefined && nowMs - last < this.thresholds.cooldownMs) continue;
      this.lastFired.set(key, nowMs);
      fired.push({
        type: 'alert',
        deviceId,
        alert: c.alert,
        severity: c.severity,
        message: c.message,
        timestamp: new Date(nowMs).toISOString(),
        value: c.value,
      });
    }
    return fired;
  }
}
