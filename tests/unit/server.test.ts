import { afterEach, describe, it, expect } from 'vitest';
import { createMock } from '../../mock/server';
const servers: ReturnType<typeof createMock>[] = [];
function server(role = 'dispatcher') {
  const app = createMock({ role, load: 6, faults: '' });
  servers.push(app);
  return app;
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map((app) => app.close()));
});
describe('Command contract through Fastify inject (without opening ports)', () => {
  it('replays the response without another execution even after a version change', async () => {
    const app = server();
    const initial = (await app.inject('/api/snapshot')).json();
    const d = initial.decisions[0];
    const request = {
      method: 'POST' as const,
      url: `/api/decisions/${d.decision_id}/cancel`,
      headers: { 'idempotency-key': 'same', 'if-match': String(d.version) },
      payload: {},
    };
    const first = await app.inject(request);
    const second = await app.inject(request);
    expect(first.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());
    expect((await app.inject('/debug/state')).json().executions.same).toBe(1);
  });
  it('409 returns the current object', async () => {
    const app = server();
    const d = (await app.inject('/api/snapshot')).json().decisions[0];
    await app.inject({
      method: 'POST',
      url: `/api/decisions/${d.decision_id}/cancel`,
      headers: { 'idempotency-key': 'one', 'if-match': '1' },
      payload: {},
    });
    const response = await app.inject({
      method: 'POST',
      url: `/api/decisions/${d.decision_id}/cancel`,
      headers: { 'idempotency-key': 'two', 'if-match': '1' },
      payload: {},
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ status: 'cancelled', version: 2 });
  });
  it('observer cannot change state', async () => {
    const app = server('observer');
    expect((await app.inject('/api/me')).json().role).toBe('observer');
    const response = await app.inject({
      method: 'POST',
      url: '/api/points/p-1/mode',
      headers: { 'idempotency-key': 'observer', 'if-match': '1' },
      payload: { mode: 'manual' },
    });
    expect(response.statusCode).toBe(403);
    expect((await app.inject('/debug/state')).json().executions).toEqual({});
  });
  it('rejects an unknown route and an invalid mode', async () => {
    const app = server();
    const headers = { 'idempotency-key': 'bad', 'if-match': '1' };
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/points/p-1/delete',
          headers,
          payload: { mode: 'manual' },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/points/p-1/mode',
          headers,
          payload: { mode: 'bad' },
        })
      ).statusCode,
    ).toBe(400);
  });
});
