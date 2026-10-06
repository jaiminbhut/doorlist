import { ApiError, ApiUnreachableError } from '@/api/client';
import { signInMessage, signUpErrors } from './auth-api';

describe('signInMessage', () => {
  it('says the credentials are wrong on 401, without saying which one', () => {
    expect(signInMessage(new ApiError(401, 'Email or password is incorrect.'))).toBe(
      'Email or password is incorrect.',
    );
  });

  it('asks to wait when rate limited', () => {
    expect(signInMessage(new ApiError(429, null))).toBe(
      'Too many attempts. Wait a minute and try again.',
    );
  });

  it('says when the API cannot be reached', () => {
    expect(signInMessage(new ApiUnreachableError())).toMatch(/Can't reach Doorlist/);
  });

  it('falls back to a general message', () => {
    expect(signInMessage(new ApiError(500, null))).toBe('Could not sign in. Try again.');
  });
});

describe('signUpErrors', () => {
  it("passes the API's field errors through", () => {
    const errors = { email: ["Email 'a@b.c' is already taken."], password: ['Too short.'] };

    expect(signUpErrors(new ApiError(400, 'Validation failed', errors))).toEqual(errors);
  });

  it('puts anything else under the form as a whole', () => {
    expect(signUpErrors(new ApiError(429, null))).toEqual({
      '': ['Too many attempts. Wait a minute and try again.'],
    });
    expect(signUpErrors(new ApiError(500, null))).toEqual({
      '': ['Could not sign up. Try again.'],
    });
  });
});
