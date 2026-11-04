import { describe, it, expect } from 'vitest';
import { Synchronization } from '../../src/modules/dispatch/helpers/synchronization';
import { snapshotSchema, eventSchema } from '../../src/modules/dispatch/api/schemas';
import {
  isStale,
  type Snapshot,
  type Decision,
  type Vehicle,
} from '../../src/modules/dispatch/helpers/model';
const at = '2026-10-01T04:12:09Z';
const d: Decision = {
  decision_id: 'd-1',
  vehicle_id: 'v-1',
  from_point: 'p-1',
  to_point: 'p-2',
  gain_s: 10,
  reason: '<script>alert(1)</script>',
  status: 'pending',
  created_at: at,
  execute_at: '2026-10-01T04:13:09Z',
  version: 1,
};
const v: Vehicle = {
  vehicle_id: 'v-1',
  name: 'T-1',
  x_m: 0,
  y_m: 0,
  heading_deg: 0,
  speed_kmh: 0,
  state: 'idle',
  point_id: 'p-1',
  last_seen: at,
};
const initial: Snapshot = { seq: 10, at, vehicles: [v], points: [], decisions: [d] };
describe('Состояние потока', () => {
  it('не применяет события после пропуска и восстанавливается снимком', () => {
    const sync = new Synchronization();
    sync.reset(initial);
    expect(sync.apply({ seq: 12, at, type: 'vehicle', data: { ...v, x_m: 12 } })).toBe('recover');
    expect(sync.seq).toBe(10);
    expect(sync.snapshot(Date.parse(at)).vehicles[0]?.x_m).toBe(0);
    sync.reset({ ...initial, seq: 12, vehicles: [{ ...v, x_m: 12 }] });
    expect(sync.apply({ seq: 11, at, type: 'vehicle', data: v })).toBe('ignore');
    expect(sync.snapshot(Date.parse(at)).vehicles[0]?.x_m).toBe(12);
  });
  it('защищает новый HTTP-ответ от старого события, сохраняя seq', () => {
    const sync = new Synchronization();
    sync.reset(initial);
    sync.accept({ ...d, status: 'cancelled', version: 3 });
    expect(sync.apply({ seq: 11, at, type: 'decision', data: { ...d, version: 2 } })).toBe('apply');
    expect(sync.seq).toBe(11);
    expect(sync.snapshot(Date.parse(at)).decisions[0]?.status).toBe('cancelled');
  });
  it('удаляет решения старше часа', () => {
    const sync = new Synchronization();
    sync.reset(initial);
    expect(sync.snapshot(Date.parse(at) + 3600001).decisions).toEqual([]);
  });
  it('новый снимок полностью заменяет набор объектов', () => {
    const sync = new Synchronization();
    sync.reset(initial);
    sync.reset({ ...initial, vehicles: [], decisions: [] });
    expect(sync.snapshot(Date.parse(at)).vehicles).toEqual([]);
  });
});
it('порог устаревания — строго больше 30 секунд', () => {
  expect(isStale(v, Date.parse(at) + 30000)).toBe(false);
  expect(isStale(v, Date.parse(at) + 30001)).toBe(true);
});
it('проверяет входные данные и сохраняет reason как обычную строку', () => {
  expect(snapshotSchema.parse(initial).decisions[0]?.reason).toBe(d.reason);
  expect(
    eventSchema.safeParse({ seq: 11, at, type: 'vehicle', data: { ...v, x_m: 'bad' } }).success,
  ).toBe(false);
});
it('ответ команды во время загрузки снимка не откатывается старым снимком', () => {
  const sync = new Synchronization();
  sync.reset(initial, [{ ...d, status: 'cancelled', version: 2 }]);
  expect(sync.snapshot(Date.parse(at)).decisions[0]?.status).toBe('cancelled');
  expect(sync.seq).toBe(initial.seq);
});
