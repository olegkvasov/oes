import { it, expect, vi, afterEach } from 'vitest';
import { createMock } from '../../mock/server';
import type { Snapshot } from '../../src/modules/dispatch/helpers/model';
let app: ReturnType<typeof createMock> | undefined;
afterEach(async () => {
  await app?.close();
  vi.useRealTimers();
});
it('исполнение через 60 секунд меняет назначение машины', async () => {
  vi.useFakeTimers({
    toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
  });
  app = createMock({ load: 6, faults: '' });
  await app.ready();
  const before = (await app.inject('/api/snapshot')).json();
  const d = before.decisions[0];
  await vi.advanceTimersByTimeAsync(60000);
  const after = (await app.inject('/api/snapshot')).json();
  expect(
    after.decisions.find((item: { decision_id: string }) => item.decision_id === d.decision_id)
      .status,
  ).toBe('executed');
  expect(
    after.vehicles.find((v: { vehicle_id: string }) => v.vehicle_id === d.vehicle_id).point_id,
  ).toBe(d.to_point);
});
it('ручные пункты не получают новые автоматические решения', async () => {
  vi.useFakeTimers({
    toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
  });
  app = createMock({ load: 6, faults: '' });
  await app.ready();
  for (let i = 1; i <= 6; i++)
    await app.inject({
      method: 'POST',
      url: `/api/points/p-${i}/mode`,
      headers: { 'if-match': '1', 'idempotency-key': `mode-${i}` },
      payload: { mode: 'manual' },
    });
  const before = (await app.inject('/api/snapshot')).json();
  await vi.advanceTimersByTimeAsync(30000);
  expect((await app.inject('/api/snapshot')).json().decisions.length).toBe(before.decisions.length);
});

it.each([150, 1000])(
  'распределяет %i машин возле всех пунктов и сохраняет движение',
  async (load) => {
    vi.useFakeTimers({
      toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
    });
    app = createMock({ load, faults: '' });
    await app.ready();
    const before = (await app.inject('/api/snapshot')).json<Snapshot>();
    const counts = new Map(before.points.map((p) => [p.point_id, 0]));
    for (const vehicle of before.vehicles) {
      const origin = before.points.find(
        (p) => Math.hypot(vehicle.x_m - p.x_m, vehicle.y_m - p.y_m) <= 650,
      );
      expect(origin).toBeDefined();
      counts.set(origin!.point_id, counts.get(origin!.point_id)! + 1);
      if (vehicle.speed_kmh > 0) expect(vehicle.point_id).not.toBe(origin!.point_id);
      else expect(vehicle.point_id).toBe(origin!.point_id);
    }
    expect(before.vehicles).toHaveLength(load);
    expect(Math.max(...counts.values()) - Math.min(...counts.values())).toBeLessThanOrEqual(1);
    expect(Math.min(...counts.values())).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(1000);
    const after = (await app.inject('/api/snapshot')).json<Snapshot>();
    for (const [i, vehicle] of before.vehicles.entries()) {
      const updated = after.vehicles[i]!;
      const target = before.points.find((p) => p.point_id === vehicle.point_id)!;
      const distance = (v: typeof vehicle) => Math.hypot(v.x_m - target.x_m, v.y_m - target.y_m);
      if (vehicle.speed_kmh > 0) expect(distance(updated)).toBeLessThan(distance(vehicle));
      else {
        expect(updated.x_m).toBe(vehicle.x_m);
        expect(updated.y_m).toBe(vehicle.y_m);
      }
    }
  },
);
