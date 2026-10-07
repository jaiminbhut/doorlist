import { ApiError, ApiUnreachableError } from '@/api/client';

/**
 * Why a claim failed, in the API's words where it has them, as on the web:
 * the per-attendee limit, too few left, or an event that has started. An
 * expired session is asked about separately (sign in again).
 */
export function claimMessage(error: unknown): string {
  if (error instanceof ApiError) {
    // A ValidationProblem's title is generic; its field messages say what's wrong.
    const field = Object.values(error.errors).flat()[0];
    if (field) {
      return field;
    }
    if (error.status === 404) {
      return 'This event does not exist.';
    }
    if (error.title) {
      return error.title;
    }
  }
  if (error instanceof ApiUnreachableError) {
    return "Can't reach Doorlist. Check your connection and try again.";
  }
  return 'Could not claim tickets. Try again.';
}
