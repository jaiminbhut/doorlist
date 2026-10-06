import { ApiError, ApiUnreachableError, request } from './client';

jest.mock('./api-url', () => ({ apiUrl: 'http://api.test' }));

const fetchMock = jest.fn<Promise<Response>, [string, RequestInit]>();

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

function json(status: number, body: unknown, type = 'application/json'): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': type } });
}

describe('request', () => {
  it('sends JSON with the bearer token and returns the parsed body', async () => {
    fetchMock.mockResolvedValue(json(200, { id: 7 }));

    const body = await request<{ id: number }>('/api/things', {
      method: 'POST',
      body: { name: 'x' },
      token: 'jwt',
    });

    expect(body).toEqual({ id: 7 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api.test/api/things');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"name":"x"}');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer jwt',
      'Content-Type': 'application/json',
    });
  });

  it('returns a plain-text body as text', async () => {
    fetchMock.mockResolvedValue(
      new Response('Healthy', { status: 200, headers: { 'Content-Type': 'text/plain' } }),
    );

    await expect(request<string>('/api/health')).resolves.toBe('Healthy');
  });

  it('turns a ProblemDetails answer into an ApiError with its title and field errors', async () => {
    fetchMock.mockResolvedValue(
      json(
        400,
        { title: 'One or more validation errors occurred.', errors: { email: ['Taken.'] } },
        'application/problem+json',
      ),
    );

    const error = await request('/api/auth/register').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      title: 'One or more validation errors occurred.',
      errors: { email: ['Taken.'] },
    });
  });

  it('reports an error status without a body', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));

    await expect(request('/api/tickets/mine')).rejects.toMatchObject({ status: 401, title: null });
  });

  it('reports a failed connection as unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));

    await expect(request('/api/health')).rejects.toBeInstanceOf(ApiUnreachableError);
  });

  it('gives up after the timeout and reports the API as unreachable', async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) =>
          init.signal?.addEventListener('abort', () => reject(new Error('Aborted'))),
        ),
    );

    const pending = request('/api/health', { timeoutMs: 3_000 });
    jest.advanceTimersByTime(3_000);

    await expect(pending).rejects.toBeInstanceOf(ApiUnreachableError);
    jest.useRealTimers();
  });
});
