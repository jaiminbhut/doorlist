import { ApiError, ApiUnreachableError, request } from '@/api/client';
import type { Session } from './session';

export function signInRequest(email: string, password: string): Promise<Session> {
  return request<Session>('/api/auth/login', {
    method: 'POST',
    body: { email: email.trim(), password },
  });
}

/** Sign-up always creates an attendee (ADR 6). */
export function signUpRequest(
  displayName: string,
  email: string,
  password: string,
): Promise<Session> {
  return request<Session>('/api/auth/register', {
    method: 'POST',
    body: { displayName: displayName.trim(), email: email.trim(), password },
  });
}

/** The same messages as the web's sign-in page, plus one for no connection. */
export function signInMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) {
    return 'Email or password is incorrect.';
  }
  if (error instanceof ApiError && error.status === 429) {
    return 'Too many attempts. Wait a minute and try again.';
  }
  if (error instanceof ApiUnreachableError) {
    return "Can't reach Doorlist. Check your connection and try again.";
  }
  return 'Could not sign in. Try again.';
}

/**
 * Field errors from the API's validation problem, keyed displayName, email
 * and password, with anything else under "". The same as the web's sign-up page.
 */
export function signUpErrors(error: unknown): Record<string, string[]> {
  if (error instanceof ApiError && error.status === 400 && Object.keys(error.errors).length > 0) {
    return error.errors;
  }
  if (error instanceof ApiError && error.status === 429) {
    return { '': ['Too many attempts. Wait a minute and try again.'] };
  }
  if (error instanceof ApiUnreachableError) {
    return { '': ["Can't reach Doorlist. Check your connection and try again."] };
  }
  return { '': ['Could not sign up. Try again.'] };
}
