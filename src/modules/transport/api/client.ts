export class HttpError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(
      status === 403
        ? 'Нет прав для выполнения команды'
        : status === 409
          ? 'Состояние изменилось. Получены актуальные данные.'
          : `Ошибка сервера: ${status}`,
    );
  }
}
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...init, signal: AbortSignal.timeout(5000) });
  const body: unknown = await response.json();
  if (!response.ok) throw new HttpError(response.status, body);
  return body as T;
}
export function connect(since: number) {
  return new WebSocket(
    `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws?since=${since}`,
  );
}
