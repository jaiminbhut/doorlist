import { HttpErrorResponse } from '@angular/common/http';

/** The title of an API ProblemDetails response, if it has one. */
export function problemTitle(error: unknown): string | null {
  if (error instanceof HttpErrorResponse && typeof error.error?.title === 'string') {
    return error.error.title;
  }
  return null;
}
