import { it, expect, vi, afterEach } from 'vitest';
import { createRenderer, nextTick, ssrContextKey } from 'vue';
import type { Snapshot } from '../../src/modules/dispatch/helpers/model';
const mocks = vi.hoisted(() => ({
  getSnapshot: vi.fn(),
  openStream: vi.fn(),
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
  command: vi.fn(),
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
  vi.clearAllMocks();
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
it('зависший WebSocket восстанавливается, а статус устаревания виден до нового снимка', async () => {
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
it('ошибка снимка очищается после успешного переподключения', async () => {
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
