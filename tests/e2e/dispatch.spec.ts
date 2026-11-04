import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
const scenario = process.env.SCENARIO ?? 'normal';
test.describe.configure({ mode: 'serial' });
async function ready(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('connection-status')).toHaveAttribute('data-connected', 'true', {
    timeout: 15000,
  });
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
    for (const d of server.decisions.slice(0, 100)) {
      await page.locator(`[data-decision-slot-id="${d.decision_id}"]`).scrollIntoViewIfNeeded();
      await expect(page.locator(`[data-decision-id="${d.decision_id}"]`)).toHaveAttribute(
        'data-status',
        d.status,
      );
    }
    for (const p of server.points)
      await expect(page.locator(`[data-point-id="${p.point_id}"]`)).toHaveAttribute(
        'data-mode',
        p.mode,
      );
  } finally {
    await request.post('http://127.0.0.1:3001/debug/pause', { data: { paused: false } });
  }
}
test('cancellation matches server state', async ({ page, request }) => {
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
test('page loads no external resources', async ({ page, request }) => {
  test.skip(scenario !== 'normal');
  const external: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).hostname !== '127.0.0.1') external.push(r.url());
  });
  await ready(page);
  expect(external).toEqual([]);
  await compareDecisions(page, request);
});
test('five minutes of dropped, duplicated, and reordered events', async ({ page, request }) => {
  test.skip(scenario !== 'drop,dup,reorder');
  test.setTimeout(360000);
  await ready(page);
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(30000);
    await compareDecisions(page, request);
  }
});
test('recovery after reset', async ({ page, request }) => {
  test.skip(scenario !== 'reset');
  test.setTimeout(170000);
  await ready(page);
  await page.waitForTimeout(125000);
  await expect(page.getByRole('img', { name: 'Схема площадки: пункты и машины' })).toBeVisible({
    timeout: 15000,
  });
  await compareDecisions(page, request);
});
test('timeout and retry execute the command once', async ({ page, request }) => {
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
test('primary action retries the original request after a network error', async ({
  page,
  request,
}) => {
  test.skip(scenario !== 'normal');
  await request.post('http://127.0.0.1:3001/debug/pause', { data: { paused: true } });
  try {
    await ready(page);
    const attempts: { key: string; version: string; body: string | null }[] = [];
    await page.route('**/api/points/p-1/mode', async (route) => {
      const outgoing = route.request();
      const headers = outgoing.headers();
      attempts.push({
        key: headers['idempotency-key']!,
        version: headers['if-match']!,
        body: outgoing.postData(),
      });
      if (attempts.length === 1) await route.abort('failed');
      else await route.continue();
    });
    const card = page.locator('[data-point-id="p-1"]');
    await card.getByRole('button', { name: 'В ручной режим' }).click();
    await expect(page.getByRole('button', { name: 'Повторить команду' })).toBeVisible();
    await card.getByRole('button', { name: 'В ручной режим' }).click();
    await expect(card).toHaveAttribute('data-mode', 'manual');
    expect(attempts).toHaveLength(2);
    expect(attempts[0]!.key).not.toBe('');
    expect(attempts[1]).toEqual(attempts[0]);
    expect((await state(request)).executions[attempts[0]!.key]).toBe(1);
    await compareDecisions(page, request);
  } finally {
    await request.post('http://127.0.0.1:3001/debug/pause', { data: { paused: false } });
  }
});
test('vehicles become stale after 30 seconds', async ({ page, request }) => {
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
test('observer sees no actions and receives 403 when bypassing the UI', async ({
  page,
  request,
}) => {
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
test('UI explains a 403 refusal', async ({ page, request }) => {
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
test('409 when a decision executes before cancellation arrives', async ({ page, request }) => {
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
  await page.locator(`[data-decision-slot-id="${d.decision_id}"]`).scrollIntoViewIfNeeded();
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

test('feed retains 100 decisions but renders only visible cards', async ({ page, request }) => {
  test.skip(scenario !== 'normal');
  await page.route('**/api/snapshot', async (route) => {
    const snapshot = await (await request.get('http://127.0.0.1:3001/api/snapshot')).json();
    const original = snapshot.decisions[0];
    snapshot.decisions = Array.from({ length: 100 }, (_, i) => ({
      ...original,
      decision_id: `virtual-${i}`,
      status: 'executed',
      created_at: new Date(Date.now() - i * 1000).toISOString(),
      reason: i === 99 ? 'Длинная причина последнего решения. '.repeat(100) : `Причина ${i}`,
    }));
    await route.fulfill({ json: snapshot });
  });
  await ready(page);
  const feed = page.getByRole('region', { name: 'Лента решений', exact: true });
  await expect(feed.locator('[data-decision-slot-id]')).toHaveCount(100);
  await expect.poll(() => feed.locator('[data-decision-id]').count()).toBeLessThan(20);
  const lastSlot = feed.locator('[data-decision-slot-id="virtual-99"]');
  await lastSlot.scrollIntoViewIfNeeded();
  const lastCard = feed.locator('[data-decision-id="virtual-99"]');
  await expect(lastCard).toBeVisible();
  await expect(lastCard.locator('p')).toHaveText(
    'Длинная причина последнего решения. '.repeat(100).trim(),
  );
  await expect(feed.locator('[data-decision-id="virtual-0"]')).toHaveCount(0);
  await expect.poll(() => feed.locator('[data-decision-id]').count()).toBeLessThan(20);
  await feed.locator('[data-decision-slot-id="virtual-0"]').scrollIntoViewIfNeeded();
  await expect(feed.locator('[data-decision-id="virtual-0"]')).toBeVisible();
});
