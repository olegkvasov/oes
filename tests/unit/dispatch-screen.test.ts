import { it, expect } from 'vitest';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import DispatchScreen from '../../src/modules/dispatch/components/DispatchScreen.vue';

it.each([
  ['connected', 'Подключено'],
  ['reconnecting', 'Переподключение'],
  ['stale and reconnecting', 'Данные устарели · переподключение'],
])('displays connection status: %s', async (_label, status) => {
  const html = await renderToString(
    createSSRApp(DispatchScreen, {
      status,
      mapFilter: 'all',
      showVehicleNames: true,
      mapVehicles: [],
      connectionError: '',
      error: '',
      retry: false,
      busy: false,
      now: Date.now(),
      pending: 0,
    }),
  );
  expect(html).toContain('data-testid="connection-status"');
  expect(html).toContain(`data-connected="${status === 'Подключено'}"`);
  expect(html).toContain(status);
});
