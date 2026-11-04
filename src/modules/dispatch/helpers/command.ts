import type { Decision, Point } from './model';
export type CommandIntent = Readonly<{
  kind: 'decisions' | 'points';
  id: string;
  version: number;
  key: string;
  mode?: Point['mode'];
}>;
export function createCommandIntent(
  kind: CommandIntent['kind'],
  object: Decision | Point,
  mode: Point['mode'] | undefined,
  key: string,
): CommandIntent {
  return Object.freeze({
    kind,
    id: 'decision_id' in object ? object.decision_id : object.point_id,
    version: object.version,
    key,
    mode,
  });
}
export class CommandAttempt {
  state: 'idle' | 'sending' | 'confirmed' | 'unknown' | 'rejected' = 'idle';
  constructor(readonly intent: CommandIntent) {}
  begin() {
    if (this.state === 'sending' || this.state === 'confirmed' || this.state === 'rejected')
      return false;
    this.state = 'sending';
    return true;
  }
  complete() {
    this.state = 'confirmed';
  }
  fail(definitive: boolean) {
    this.state = definitive ? 'rejected' : 'unknown';
  }
}
