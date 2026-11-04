import Fastify from 'fastify';
import { pathToFileURL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import type {
  Snapshot,
  Change,
  Decision,
  Point,
  Vehicle,
} from '../src/modules/dispatch/helpers/model';
export function createMock(options: { faults?: string; role?: string; load?: number } = {}) {
  const timers: ReturnType<typeof setTimeout>[] = [];
  const every = (callback: () => void, ms: number) => {
    const timer = setInterval(callback, ms);
    timers.push(timer);
    return timer;
  };
  const app = Fastify();
  const faults = new Set((options.faults ?? process.env.FAULTS ?? '').split(','));
  const role = options.role ?? process.env.ROLE;
  const iso = () => new Date().toISOString();
  const points: Point[] = Array.from({ length: 6 }, (_, i) => ({
    point_id: `p-${i + 1}`,
    name: `Пункт ${i + 1}`,
    x_m: 1000 + (i % 3) * 2000,
    y_m: 1000 + Math.floor(i / 3) * 2000,
    mode: 'auto',
    version: 1,
    queue: [],
  }));
  const load = Number(options.load ?? process.env.LOAD ?? 150);
  const state: Snapshot = {
    seq: 0,
    at: iso(),
    points,
    vehicles: Array.from({ length: load }, (_, i) => {
      const originIndex = i % points.length;
      const origin = points[originIndex]!;
      const groupIndex = Math.floor(i / points.length);
      const groupSize = Math.ceil((load - originIndex) / points.length);
      const angle = groupIndex * Math.PI * (3 - Math.sqrt(5));
      const radius = 260 + 390 * Math.sqrt((groupIndex + 0.5) / groupSize);
      const x = origin.x_m + Math.cos(angle) * radius;
      const y = origin.y_m + Math.sin(angle) * radius;
      const vehicleState = (
        ['moving_empty', 'moving_loaded', 'queued', 'service', 'idle', 'offline'] as const
      )[groupIndex % 6]!;
      const moving = vehicleState === 'moving_empty' || vehicleState === 'moving_loaded';
      const target = moving ? points[(originIndex + 1) % points.length]! : origin;
      return {
        vehicle_id: `v-${i + 1}`,
        name: `Т-${i + 1}`,
        x_m: x,
        y_m: y,
        heading_deg: (Math.atan2(target.y_m - y, target.x_m - x) * 180) / Math.PI,
        speed_kmh: moving ? 24 : 0,
        state: vehicleState,
        point_id: target.point_id,
        last_seen: iso(),
      };
    }),
    decisions: [],
  };
  const history: Change[] = [];
  let resetBefore = -1;
  let commands = 0;
  let paused = false;
  const replies = new Map<string, { code: number; body: unknown }>();
  const executions: Record<string, number> = {};
  const wss = new WebSocketServer({ noServer: true });
  function emit(type: Change['type'], data: Vehicle | Point | Decision) {
    const event = { seq: ++state.seq, at: iso(), type, data: structuredClone(data) } as Change;
    history.push(event);
    if (history.length > 20000) history.splice(0, history.length - 20000);
    for (const ws of wss.clients) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      if (faults.has('drop') && event.seq % 31 === 0) continue;
      const send = () => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(event));
      };
      if (faults.has('reorder') && event.seq % 17 === 0) setTimeout(send, 100);
      else send();
      if (faults.has('dup') && event.seq % 13 === 0) send();
    }
  }
  function decision() {
    if (paused) return;
    const targets = state.points.filter((p) => p.mode === 'auto');
    if (!targets.length) return;
    const v = state.vehicles[Math.floor(Math.random() * state.vehicles.length)]!;
    const target = targets.find((p) => p.point_id !== v.point_id);
    if (!target) return;
    const d: Decision = {
      decision_id: `d-${Date.now()}`,
      vehicle_id: v.vehicle_id,
      from_point: v.point_id,
      to_point: target.point_id,
      gain_s: 140,
      reason: 'На соседнем пункте меньше очередь. Сокращение ожидания — 2 мин 20 с.',
      status: 'pending',
      created_at: iso(),
      execute_at: new Date(Date.now() + 60000).toISOString(),
      version: 1,
    };
    state.decisions.unshift(d);
    emit('decision', d);
  }
  app.addHook('preHandler', async (req) => {
    if (faults.has('slow') && req.url.startsWith('/api/'))
      await new Promise((r) => setTimeout(r, 3000));
  });
  app.get('/api/me', () => ({
    user_id: 'u-7',
    name: 'Иванова А. С.',
    role: role === 'observer' ? 'observer' : 'dispatcher',
    site: { name: 'Площадка 3', tz: 'Asia/Krasnoyarsk' },
  }));
  app.get('/api/snapshot', async () => {
    if (state.seq === resetBefore) {
      emit('point', state.points[0]!);
    }
    return { ...state, at: iso() };
  });
  if (process.env.TEST_CONTROL === '1')
    app.post<{ Body: { paused: boolean } }>('/debug/pause', async (req) => {
      paused = req.body.paused;
      return { ...state, at: iso() };
    });
  app.get('/debug/state', () => ({ ...state, at: iso(), executions }));
  app.post<{
    Params: { kind: string; id: string; action: string };
    Body: { mode?: 'auto' | 'manual' };
  }>('/api/:kind/:id/:action', async (req, reply) => {
    if (role === 'observer') return reply.code(403).send({ message: 'Нет прав' });
    if (
      !(
        (req.params.kind === 'decisions' && req.params.action === 'cancel') ||
        (req.params.kind === 'points' && req.params.action === 'mode')
      )
    )
      return reply.code(404).send({ message: 'Неизвестная команда' });
    const key = String(req.headers['idempotency-key'] ?? '');
    if (!key) return reply.code(400).send({ message: 'Idempotency-Key required' });
    const previous = replies.get(key);
    if (previous) return reply.code(previous.code).send(previous.body);
    const obj =
      req.params.kind === 'decisions'
        ? state.decisions.find((d) => d.decision_id === req.params.id)
        : state.points.find((p) => p.point_id === req.params.id);
    if (!obj) return reply.code(404).send({ message: 'Не найдено' });
    let code = 200;
    if ('status' in obj && obj.status === 'pending' && Date.parse(obj.execute_at) <= Date.now()) {
      obj.status = 'executed';
      const vehicle = state.vehicles.find((v) => v.vehicle_id === obj.vehicle_id);
      if (vehicle) {
        vehicle.point_id = obj.to_point;
        vehicle.state = 'moving_empty';
        vehicle.speed_kmh = 24;
        emit('vehicle', vehicle);
      }
      obj.version++;
      emit('decision', obj);
    }
    if (
      obj.version !== Number(req.headers['if-match']) ||
      ('status' in obj && (obj.status !== 'pending' || Date.parse(obj.execute_at) <= Date.now()))
    )
      code = 409;
    else {
      if ('status' in obj) {
        obj.status = 'cancelled';
      } else {
        if (req.body.mode !== 'auto' && req.body.mode !== 'manual')
          return reply.code(400).send({ message: 'Invalid mode' });
        obj.mode = req.body.mode;
      }
      obj.version++;
      executions[key] = (executions[key] ?? 0) + 1;
      emit('status' in obj ? 'decision' : 'point', obj);
    }
    const body = structuredClone(obj);
    replies.set(key, { code, body });
    if (faults.has('slow') && ++commands % 2 === 1) await new Promise((r) => setTimeout(r, 3500));
    return reply.code(code).send(body);
  });
  app.server.on('upgrade', (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, (ws) => {
      const since = Number(new URL(req.url!, 'http://localhost').searchParams.get('since'));
      if (
        since <= resetBefore ||
        since > state.seq ||
        since < (history[0]?.seq ?? state.seq + 1) - 1
      ) {
        ws.send(JSON.stringify({ type: 'reset' }));
        return;
      }
      for (const event of history) if (event.seq > since) ws.send(JSON.stringify(event));
    });
  });
  every(() => {
    if (paused) return;
    for (const [i, v] of state.vehicles.entries()) {
      if (faults.has('stale') && i % 10 === 0) continue;
      if (v.state === 'moving_empty' || v.state === 'moving_loaded') {
        const p = state.points.find((p) => p.point_id === v.point_id)!;
        const dx = p.x_m - v.x_m,
          dy = p.y_m - v.y_m,
          length = Math.hypot(dx, dy);
        v.heading_deg = (Math.atan2(dy, dx) * 180) / Math.PI;
        if (length < 10) {
          v.state = 'queued';
          v.speed_kmh = 0;
        } else {
          v.x_m += (dx / length) * 7;
          v.y_m += (dy / length) * 7;
        }
      }
      v.last_seen = iso();
      emit('vehicle', v);
    }
    for (const d of state.decisions) {
      if (d.status === 'pending' && Date.parse(d.execute_at) <= Date.now()) {
        d.status = 'executed';
        const vehicle = state.vehicles.find((v) => v.vehicle_id === d.vehicle_id);
        if (vehicle) {
          vehicle.point_id = d.to_point;
          vehicle.state = 'moving_empty';
          vehicle.speed_kmh = 24;
          emit('vehicle', vehicle);
        }
        d.version++;
        emit('decision', d);
      }
    }
    state.decisions = state.decisions.filter(
      (d) => Date.parse(d.created_at) > Date.now() - 3600000,
    );
  }, 1000);
  every(() => {
    if (paused) return;
    for (const p of state.points) {
      p.queue = state.vehicles
        .filter((v) => v.point_id === p.point_id)
        .slice(0, 4)
        .map((v, i) => ({
          vehicle_id: v.vehicle_id,
          eta: new Date(Date.now() + (i + 1) * 60000).toISOString(),
          service_start: new Date(Date.now() + (i + 1) * 90000).toISOString(),
          wait_s: (i + 1) * 30,
        }));
      p.version++;
      emit('point', p);
    }
  }, 10000);
  every(() => {
    for (const ws of wss.clients)
      if (ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ type: 'heartbeat', seq: state.seq, at: iso() }));
  }, 5000);
  if (faults.has('reset'))
    every(() => {
      if (paused) return;
      resetBefore = state.seq;
      history.length = 0;
      for (const ws of wss.clients) {
        ws.close();
      }
    }, 120000);
  function scheduleDecision() {
    const timer = setTimeout(
      () => {
        timers.splice(timers.indexOf(timer), 1);
        decision();
        scheduleDecision();
      },
      5000 + Math.random() * 10000,
    );
    timers.push(timer);
  }
  scheduleDecision();
  decision();
  app.addHook('onClose', async () => {
    for (const timer of timers) clearTimeout(timer);
    for (const ws of wss.clients) ws.terminate();
    wss.close();
  });
  return app;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = createMock();
  await app.listen({ port: Number(process.env.PORT ?? 3001), host: '127.0.0.1' });
  console.log('Mock http://127.0.0.1:3001');
}
