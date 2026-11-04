import { it, expect } from 'vitest';
import { CommandAttempt, createCommandIntent } from '../../src/modules/dispatch/helpers/command';
const point = {
  point_id: 'p-1',
  name: 'Пункт',
  x_m: 0,
  y_m: 0,
  mode: 'auto' as const,
  version: 1,
  queue: [],
};
it('retry preserves key, version, and body after an unknown outcome', () => {
  const attempt = new CommandAttempt(createCommandIntent('points', point, 'manual', 'key'));
  expect(attempt.begin()).toBe(true);
  expect(attempt.begin()).toBe(false);
  attempt.fail(false);
  expect(attempt.state).toBe('unknown');
  point.version = 2;
  expect(attempt.begin()).toBe(true);
  expect(attempt.intent).toEqual({
    kind: 'points',
    id: 'p-1',
    version: 1,
    key: 'key',
    mode: 'manual',
  });
  attempt.complete();
  expect(attempt.begin()).toBe(false);
});
it('403 and 409 finish an attempt without retrying', () => {
  const attempt = new CommandAttempt(createCommandIntent('points', point, 'manual', 'key'));
  attempt.begin();
  attempt.fail(true);
  expect(attempt.state).toBe('rejected');
  expect(attempt.begin()).toBe(false);
});
