import { z } from 'zod';
const instant = z.iso.datetime({ offset: true });
const version = z.number().int().nonnegative();
export const vehicleSchema = z.object({
  vehicle_id: z.string(),
  name: z.string(),
  x_m: z.number().finite(),
  y_m: z.number().finite(),
  heading_deg: z.number().finite(),
  speed_kmh: z.number().finite(),
  state: z.enum(['moving_loaded', 'moving_empty', 'queued', 'service', 'idle', 'offline']),
  point_id: z.string(),
  last_seen: instant,
});
export const pointSchema = z.object({
  point_id: z.string(),
  name: z.string(),
  x_m: z.number().finite(),
  y_m: z.number().finite(),
  mode: z.enum(['auto', 'manual']),
  version,
  queue: z.array(
    z.object({ vehicle_id: z.string(), eta: instant, service_start: instant, wait_s: z.number() }),
  ),
});
export const decisionSchema = z.object({
  decision_id: z.string(),
  vehicle_id: z.string(),
  from_point: z.string(),
  to_point: z.string(),
  gain_s: z.number(),
  reason: z.string(),
  status: z.enum(['pending', 'executed', 'cancelled', 'expired']),
  created_at: instant,
  execute_at: instant,
  version,
});
export const snapshotSchema = z.object({
  seq: version,
  at: instant,
  vehicles: z.array(vehicleSchema),
  points: z.array(pointSchema),
  decisions: z.array(decisionSchema),
});
export const meSchema = z.object({
  user_id: z.string(),
  name: z.string(),
  role: z.enum(['dispatcher', 'observer']),
  site: z.object({
    name: z.string(),
    tz: z.string().refine((tz) => {
      try {
        new Intl.DateTimeFormat('ru', { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }),
  }),
});
export const eventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('reset') }),
  z.object({ type: z.literal('heartbeat'), seq: version, at: instant }),
  z.object({ type: z.literal('vehicle'), seq: version, at: instant, data: vehicleSchema }),
  z.object({ type: z.literal('point'), seq: version, at: instant, data: pointSchema }),
  z.object({ type: z.literal('decision'), seq: version, at: instant, data: decisionSchema }),
]);
export function parseEvent(text: string) {
  return eventSchema.parse(JSON.parse(text));
}
export function parseCommand(kind: 'decisions' | 'points', value: unknown) {
  return kind === 'decisions' ? decisionSchema.parse(value) : pointSchema.parse(value);
}
