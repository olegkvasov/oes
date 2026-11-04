import { describe, it, expect } from 'vitest';
import { sequenceAction, siteTime } from '../../src/modules/dispatch/helpers/model';
describe('Поток', () => {
  it('принимает только следующий номер', () => expect(sequenceAction(10, 11)).toBe('apply'));
  it('игнорирует дубль и старое сообщение', () => {
    expect(sequenceAction(10, 10)).toBe('ignore');
    expect(sequenceAction(10, 9)).toBe('ignore');
  });
  it('восстанавливает пропуск', () => expect(sequenceAction(10, 12)).toBe('recover'));
});
it('использует часовой пояс площадки', () =>
  expect(siteTime('2026-10-01T04:12:09Z', 'Asia/Krasnoyarsk')).toBe('11:12:09'));
