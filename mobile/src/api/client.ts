import { apiUrl } from './api-url';

/** The request never got an answer: no connection, the server is down, or it took too long. */
export class ApiUnreachableError extends Error {
  constructor(cause?: unknown) {
    super("Couldn't reach the Doorlist API.", { cause });
    this.name = 'ApiUnreachableError';
  }
}

/** The API answered with an error status, usually as ProblemDetails. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly title: string | null,
    /** Validation errors by field, from a ValidationProblem. */
    readonly errors: Record<string, string[]> = {},
  ) {
    super(title ?? `The API answered ${status}.`);
    this.name = 'ApiError';
  }
}

/** This build doesn't know where the API is (see resolveApiUrl). */
export class ApiNotConfiguredError extends Error {
  constructor() {
    super('This build has no API address. Set EXPO_PUBLIC_API_URL for its profile.');
    this.name = 'ApiNotConfiguredError';
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  token?: string | null;
  /** Venue networks tend to hang rather than fail, so every request has a deadline. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;

/** Calls the API and returns its JSON (or text) body. */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!apiUrl) {
    throw new ApiNotConfiguredError();
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${apiUrl}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch (error) {
    throw new ApiUnreachableError(error);
  } finally {
    clearTimeout(timer);
  }

  const body = await readBody(response);
  if (!response.ok) {
    const problem = typeof body === 'object' && body !== null ? (body as Problem) : {};
    throw new ApiError(
      response.status,
      typeof problem.title === 'string' ? problem.title : null,
      problem.errors ?? {},
    );
  }
  return body as T;
}

interface Problem {
  title?: unknown;
  errors?: Record<string, string[]>;
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  const type = response.headers.get('Content-Type') ?? '';
  if (type.includes('json')) {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
  return text;
}
