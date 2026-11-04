import { it, expect, vi, afterEach } from 'vitest';
import { createRenderer, nextTick, ssrContextKey } from 'vue';
import type { Snapshot, Point } from '../../src/modules/dispatch/helpers/model';
import { HttpError } from '../../src/modules/transport';
const mocks = vi.hoisted(() => ({
  getSnapshot: vi.fn(),
  openStream: vi.fn(),
  command: vi.fn(),
  view: {} as Record<string, unknown>,
}));
vi.mock('../../src/modules/dispatch/api/service', () => ({
  getMe: async () => ({
    name: 'Оператор',
    role: 'dispatcher',
    site: { name: 'Площадка', tz: 'UTC' },
  }),
  getSnapshot: mocks.getSnapshot,
  openStream: mocks.openStream,
  command: mocks.command,
  parseEvent: (text: string) => JSON.parse(text),
}));
import Container from '../../src/modules/dispatch/DispatchContainer.vue';
// Exercise the real setup/lifecycle with a host renderer; no browser DOM is required.
Container.render = () => null;
const renderer = createRenderer<object, object>({
  patchProp: () => {},
  insert: () => {},
  remove: () => {},
  createElement: () => ({}),
  createText: () => ({}),
  createComment: () => ({}),
  setText: () => {},
  setElementText: () => {},
  parentNode: () => null,
  nextSibling: () => null,
});
let unmount: () => void = () => {};
afterEach(() => {
  unmount();
  vi.useRealTimers();
  vi.resetAllMocks();
});
const snapshot = (): Snapshot => ({
  seq: 0,
  at: new Date().toISOString(),
  vehicles: [],
  points: [],
  decisions: [],
});
async function flush() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
  await nextTick();
}
it('recovers a stalled WebSocket and retains stale status until a new snapshot', async () => {
  vi.useFakeTimers();
  let finish: (s: Snapshot) => void = () => {};
  mocks.getSnapshot.mockResolvedValueOnce(snapshot()).mockImplementationOnce(
    () =>
      new Promise<Snapshot>((resolve) => {
        finish = resolve;
      }),
  );
  const socket = {
    close: vi.fn(),
    onopen: () => {},
    onmessage: (_e: { data: string }) => {},
    onclose: () => {},
  };
  mocks.openStream.mockReturnValue(socket);
  const app = renderer.createApp(Container);
  app.provide(ssrContextKey, { modules: new Set() });
  const vm = app.mount({});
  mocks.view = (vm.$ as unknown as { setupState: Record<string, unknown> }).setupState;
  unmount = () => app.unmount();
  await flush();
  socket.onopen();
  await nextTick();
  expect(mocks.view.status).toBe('Подключено');
  await vi.advanceTimersByTimeAsync(15200);
  await nextTick();
  expect(socket.close).toHaveBeenCalled();
  expect(mocks.getSnapshot).toHaveBeenCalledTimes(2);
  expect(mocks.view.status).toContain('Данные устарели');
  socket.onmessage({
    data: JSON.stringify({
      type: 'vehicle',
      seq: 1,
      at: new Date().toISOString(),
      data: { vehicle_id: 'obsolete' },
    }),
  });
  expect((mocks.view.state as Snapshot).seq).toBe(0);
  finish(snapshot());
  await flush();
  socket.onopen();
  await nextTick();
  expect(mocks.view.status).toBe('Подключено');
});
it('clears snapshot errors after successful reconnection', async () => {
  vi.useFakeTimers();
  mocks.getSnapshot.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(snapshot());
  mocks.openStream.mockReturnValue({ close: vi.fn() });
  const app = renderer.createApp(Container);
  app.provide(ssrContextKey, { modules: new Set() });
  const vm = app.mount({});
  mocks.view = (vm.$ as unknown as { setupState: Record<string, unknown> }).setupState;
  unmount = () => app.unmount();
  await flush();
  expect(mocks.view.connectionError).toContain('Сервер недоступен');
  await vi.advanceTimersByTimeAsync(1000);
  await flush();
  expect(mocks.getSnapshot).toHaveBeenCalledTimes(2);
  expect(mocks.view.connectionError).toBe('');
});

const point: Point = {
  point_id: 'p-1',
  name: 'Пункт',
  x_m: 0,
  y_m: 0,
  mode: 'auto',
  version: 1,
  queue: [],
};
type CommandView = {
  act: (kind: 'points', point: Point, mode: Point['mode']) => Promise<void>;
  retry?: () => Promise<void>;
  error: string;
  busy: boolean;
};
async function mountCommands() {
  vi.useFakeTimers();
  mocks.getSnapshot.mockResolvedValue(snapshot());
  mocks.openStream.mockReturnValue({ close: vi.fn() });
  const app = renderer.createApp(Container);
  app.provide(ssrContextKey, { modules: new Set() });
  const vm = app.mount({});
  unmount = () => app.unmount();
  await flush();
  return (vm.$ as unknown as { setupState: CommandView }).setupState;
}
it('primary retry preserves intent after an error even when the version has changed', async () => {
  const view = await mountCommands();
  mocks.command.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({
    ...point,
    mode: 'manual',
    version: 2,
  });
  await view.act('points', point, 'manual');
  expect(view.retry).toBeTypeOf('function');
  await view.act('points', { ...point, version: 8 }, 'manual');
  expect(mocks.command).toHaveBeenCalledTimes(2);
  expect(mocks.command.mock.calls[1]).toEqual(mocks.command.mock.calls[0]);
  expect(view.retry).toBeUndefined();
  expect(view.busy).toBe(false);
});
it('a new command preserves unresolved intent and retry sends the original request', async () => {
  const view = await mountCommands();
  mocks.command.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({
    ...point,
    mode: 'manual',
    version: 2,
  });
  await view.act('points', point, 'manual');
  const retry = view.retry;
  await view.act('points', { ...point, point_id: 'p-2' }, 'manual');
  expect(mocks.command).toHaveBeenCalledTimes(1);
  expect(view.error).toContain('Сначала повторите');
  expect(view.retry).toBe(retry);
  await view.retry?.();
  expect(mocks.command.mock.calls[1]).toEqual(mocks.command.mock.calls[0]);
});
it('allows a new intent with a new key after a definitive refusal', async () => {
  const view = await mountCommands();
  mocks.command.mockRejectedValueOnce(new HttpError(403, {})).mockResolvedValueOnce(point);
  await view.act('points', point, 'manual');
  expect(view.retry).toBeUndefined();
  await view.act('points', point, 'manual');
  expect(mocks.command.mock.calls[1]![3]).not.toBe(mocks.command.mock.calls[0]![3]);
});
it('another click while sending does not create a second request', async () => {
  const view = await mountCommands();
  let finish: (value: Point) => void = () => {};
  mocks.command.mockImplementationOnce(
    () =>
      new Promise<Point>((resolve) => {
        finish = resolve;
      }),
  );
  const pending = view.act('points', point, 'manual');
  await view.act('points', point, 'manual');
  expect(mocks.command).toHaveBeenCalledTimes(1);
  finish({ ...point, mode: 'manual', version: 2 });
  await pending;
  expect(view.busy).toBe(false);
});
