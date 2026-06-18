import { z } from 'zod';
import type { Telemetry } from './contracts.js';

const telemetrySchema = z.object({
  deviceId: z.string().min(1),
  timestamp: z.string().datetime(),
  heartRate: z.number().int().min(0).max(300),
  steps: z.number().int().min(0),
  spo2: z.number().int().min(0).max(100),
  battery: z.number().int().min(0).max(100),
  location: z.object({
    lat: z.number(),
    lng: z.number(),
    accuracy: z.number().min(0),
  }),
  fallDetected: z.boolean(),
});

export type ParseResult =
  | { success: true; data: Telemetry }
  | { success: false; error: string };

export function parseTelemetry(input: unknown): ParseResult {
  const r = telemetrySchema.safeParse(input);
  if (r.success) return { success: true, data: r.data };
  const first = r.error.issues[0];
  return { success: false, error: `${first.path.join('.') || '(raiz)'}: ${first.message}` };
}
