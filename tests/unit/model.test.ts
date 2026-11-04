import { describe, it, expect } from 'vitest';
import { sequenceAction, siteTime } from '../../src/modules/dispatch/helpers/model';
describe('Stream', () => {
  it('accepts only the next sequence number', () => expect(sequenceAction(10, 11)).toBe('apply'));
  it('ignores duplicates and older messages', () => {
    expect(sequenceAction(10, 10)).toBe('ignore');
    expect(sequenceAction(10, 9)).toBe('ignore');
  });
  it('recovers from a sequence gap', () => expect(sequenceAction(10, 12)).toBe('recover'));
});
it('uses the site time zone', () =>
  expect(siteTime('2026-10-01T04:12:09Z', 'Asia/Krasnoyarsk')).toBe('11:12:09'));
