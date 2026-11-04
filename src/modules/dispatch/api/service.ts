import { request, connect, HttpError } from '../../transport';
import type { Point } from '../helpers/model';
import { meSchema, snapshotSchema, parseCommand } from './schemas';
export { parseEvent } from './schemas';
export const getMe = async () => meSchema.parse(await request<unknown>('/api/me'));
export const getSnapshot = async () =>
  snapshotSchema.parse(await request<unknown>('/api/snapshot'));
export const openStream = connect;
export async function command(
  kind: 'decisions' | 'points',
  id: string,
  version: number,
  key: string,
  mode?: Point['mode'],
) {
  try {
    return parseCommand(
      kind,
      await request<unknown>(
        `/api/${kind}/${encodeURIComponent(id)}/${kind === 'decisions' ? 'cancel' : 'mode'}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'If-Match': String(version),
            'Idempotency-Key': key,
          },
          body: JSON.stringify(mode ? { mode } : {}),
        },
      ),
    );
  } catch (error) {
    if (error instanceof HttpError && error.status === 409)
      error.body = parseCommand(kind, error.body);
    throw error;
  }
}
