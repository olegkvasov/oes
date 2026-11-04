export type Vehicle = {
  vehicle_id: string;
  name: string;
  x_m: number;
  y_m: number;
  heading_deg: number;
  speed_kmh: number;
  state: 'moving_loaded' | 'moving_empty' | 'queued' | 'service' | 'idle' | 'offline';
  point_id: string;
  last_seen: string;
};
export type VehicleMapFilter = Vehicle['state'] | 'all' | 'stale';
export type Point = {
  point_id: string;
  name: string;
  x_m: number;
  y_m: number;
  mode: 'auto' | 'manual';
  version: number;
  queue: { vehicle_id: string; eta: string; service_start: string; wait_s: number }[];
};
export type Decision = {
  decision_id: string;
  vehicle_id: string;
  from_point: string;
  to_point: string;
  gain_s: number;
  reason: string;
  status: 'pending' | 'executed' | 'cancelled' | 'expired';
  created_at: string;
  execute_at: string;
  version: number;
};
export type Snapshot = {
  seq: number;
  at: string;
  vehicles: Vehicle[];
  points: Point[];
  decisions: Decision[];
};
export type Me = {
  user_id: string;
  name: string;
  role: 'dispatcher' | 'observer';
  site: { name: string; tz: string };
};
export type Change = { seq: number; at: string } & (
  | { type: 'vehicle'; data: Vehicle }
  | { type: 'point'; data: Point }
  | { type: 'decision'; data: Decision }
);
export function sequenceAction(current: number, incoming: number) {
  return incoming <= current ? 'ignore' : incoming === current + 1 ? 'apply' : 'recover';
}
export function siteTime(iso: string, tz: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(iso));
}
export function isStale(vehicle: Vehicle, now: number) {
  return now - Date.parse(vehicle.last_seen) > 30000;
}
