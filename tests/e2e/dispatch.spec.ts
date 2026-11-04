import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
const scenario = process.env.SCENARIO ?? 'normal';
test.describe.configure({ mode: 'serial' });
async function ready(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('img', { name: 'Схема площадки: пункты и машины' })).toBeVisible({
    timeout: 15000,
  });
}
async function state(request: APIRequestContext) {
  return (await request.get('http://127.0.0.1:3001/debug/state')).json();
}
async function compareDecisions(page: Page, request: APIRequestContext) {
  const server = await (
    await request.post('http://127.0.0.1:3001/debug/pause', { data: { paused: true } })
  ).json();
  try {
    const normalize = (s: Record<string, unknown>) => ({
      seq: s.seq,
      vehicles: [...(s.vehicles as { vehicle_id: string }[])].sort((a, b) =>
        a.vehicle_id.localeCompare(b.vehicle_id),
      ),
      points: [...(s.points as { point_id: string }[])].sort((a, b) =>
        a.point_id.localeCompare(b.point_id),
      ),
      decisions: [...(s.decisions as { decision_id: string }[])].sort((a, b) =>
        a.decision_id.localeCompare(b.decision_id),
      ),
    });
    await expect
      .poll(
        async () => {
          const client = await page.evaluate(
            () =>
              (window as unknown as { __dispatchState: Record<string, unknown> }).__dispatchState,
          );
          return client ? normalize(client) : null;
        },
        { timeout: 20000 },
      )
      .toEqual(normalize(server));
    for (const d of server.decisions.slice(0, 100))
      await expect(page.locator(`[data-decision-id="${d.decision_id}"]`)).toHaveAttribute(
        'data-status',
        d.status,
      );
    for (const p of server.points)
      await expect(page.locator(`[data-point-id="${p.point_id}"]`)).toHaveAttribute(
        'data-mode',
        p.mode,
      );
  } finally {
    await request.post('http://127.0.0.1:3001/debug/pause', { data: { paused: false } });
  }
}
test('отмена совпадает с сервером', async ({ page, request }) => {
  test.skip(scenario !== 'normal');
  await ready(page);
  const initial = await state(request);
  const d = initial.decisions.find((d: { status: string }) => d.status === 'pending');
  const card = page.locator(`[data-decision-id="${d.decision_id}"]`);
  await card.getByRole('button', { name: 'Отменить', exact: true }).click();
  await expect(card).toHaveAttribute('data-status', 'cancelled');
  const after = await state(request);
  expect(
    after.decisions.find((item: { decision_id: string }) => item.decision_id === d.decision_id)
      .status,
  ).toBe('cancelled');
  expect(Object.values(after.executions).every((count) => count === 1)).toBe(true);
  await compareDecisions(page, request);
});
test('страница не загружает внешние ресурсы', async ({ page, request }) => {
  test.skip(scenario !== 'normal');
  const external: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).hostname !== '127.0.0.1') external.push(r.url());
  });
  await ready(page);
  expect(external).toEqual([]);
  await compareDecisions(page, request);
});
test('пять минут потерь, дублей и перестановок', async ({ page, request }) => {
  test.skip(scenario !== 'drop,dup,reorder');
  test.setTimeout(360000);
  await ready(page);
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(30000);
    await compareDecisions(page, request);
  }
});
test('восстановление после reset', async ({ page, request }) => {
  test.skip(scenario !== 'reset');
  test.setTimeout(170000);
  await ready(page);
  await page.waitForTimeout(125000);
  await expect(page.getByRole('img', { name: 'Схема площадки: пункты и машины' })).toBeVisible({
    timeout: 15000,
  });
  await compareDecisions(page, request);
});
test('таймаут и повтор сохраняют одно выполнение', async ({ page, request }) => {
  test.skip(scenario !== 'slow');
  test.setTimeout(45000);
  await ready(page);
  const d = (await state(request)).decisions.find(
    (d: { status: string }) => d.status === 'pending',
  );
  await page
    .locator(`[data-decision-id="${d.decision_id}"]`)
    .getByRole('button', { name: 'Отменить', exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'Повторить команду' })).toBeVisible({
    timeout: 10000,
  });
  await page.getByRole('button', { name: 'Повторить команду' }).click();
  await expect(page.getByRole('button', { name: 'Повторить команду' })).toHaveCount(0);
  const after = await state(request);
  expect(Object.values(after.executions)).toEqual([1]);
  await compareDecisions(page, request);
});
test('устаревшие машины после 30 секунд', async ({ page, request }) => {
  test.skip(scenario !== 'stale');
  test.setTimeout(50000);
  await ready(page);
  await page.waitForTimeout(31000);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const canvas = document.querySelector('canvas')!;
        const ctx = canvas.getContext('2d')!;
        const state = (
          window as unknown as {
            __dispatchState: {
              vehicles: { x_m: number; y_m: number; last_seen: string }[];
              at: string;
            };
          }
        ).__dispatchState;
        return state.vehicles
          .filter((v) => Date.parse(state.at) - Date.parse(v.last_seen) > 30000)
          .some((v) => {
            const x = (20 + (v.x_m / 6000) * (canvas.clientWidth - 40)) * devicePixelRatio;
            const y = (20 + (v.y_m / 4000) * (canvas.clientHeight - 40)) * devicePixelRatio;
            const pixel = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
            return pixel[0] === 104 && pixel[1] === 119 && pixel[2] === 122;
          });
      }),
    )
    .toBe(true);
  await compareDecisions(page, request);
});
test('наблюдатель не видит действий и получает 403 при обходе UI', async ({ page, request }) => {
  test.skip(scenario !== 'observer');
  await ready(page);
  await expect(page.getByRole('button', { name: 'Отменить', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'В ручной режим' })).toHaveCount(0);
  const response = await request.post('http://127.0.0.1:3001/api/points/p-1/mode', {
    headers: { 'Idempotency-Key': 'observer-test', 'If-Match': '1' },
    data: { mode: 'manual' },
  });
  expect(response.status()).toBe(403);
  await compareDecisions(page, request);
});
test('интерфейс объясняет отказ 403', async ({ page, request }) => {
  test.skip(scenario !== 'normal');
  await ready(page);
  await page.route('**/api/decisions/*/cancel', (route) =>
    route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Forbidden' }),
    }),
  );
  await page.getByRole('button', { name: 'Отменить', exact: true }).first().click();
  await expect(page.getByRole('alert')).toContainText('Нет прав');
  await compareDecisions(page, request);
});
test('409 при исполнении решения до доставки отмены', async ({ page, request }) => {
  test.skip(scenario !== 'normal');
  test.setTimeout(90000);
  await ready(page);
  const d = (await state(request)).decisions.find(
    (d: { status: string }) => d.status === 'pending',
  );
  await page.route(`**/api/decisions/${d.decision_id}/cancel`, async (route) => {
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, Date.parse(d.execute_at) - Date.now() + 100)),
    );
    const response = await request.post(
      `http://127.0.0.1:3001/api/decisions/${d.decision_id}/cancel`,
      { headers: route.request().headers(), data: {} },
    );
    await route.fulfill({ response });
  });
  // The delayed reply must arrive before the client timeout for this conflict test.
  await page.waitForTimeout(Math.max(0, Date.parse(d.execute_at) - Date.now() - 2000));
  await page
    .locator(`[data-decision-id="${d.decision_id}"]`)
    .getByRole('button', { name: 'Отменить', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('Состояние изменилось', { timeout: 10000 });
  await expect(page.locator(`[data-decision-id="${d.decision_id}"]`)).toHaveAttribute(
    'data-status',
    'executed',
  );
  await compareDecisions(page, request);
});
