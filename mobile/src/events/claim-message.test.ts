import { ApiError, ApiUnreachableError } from '@/api/client';
import { claimMessage } from './claim-message';

describe('claimMessage', () => {
  it("uses the API's reason for a refused claim", () => {
    expect(claimMessage(new ApiError(409, "There aren't enough of these tickets left."))).toBe(
      "There aren't enough of these tickets left.",
    );
  });

  it("uses a validation problem's field message, not its generic title", () => {
    const problem = new ApiError(400, 'One or more validation errors occurred.', {
      quantity: ['Claim between 1 and 4 tickets.'],
    });
    expect(claimMessage(problem)).toBe('Claim between 1 and 4 tickets.');
  });

  it('says an event that has gone does not exist', () => {
    expect(claimMessage(new ApiError(404, null))).toBe('This event does not exist.');
  });

  it('says when Doorlist cannot be reached', () => {
    expect(claimMessage(new ApiUnreachableError())).toBe(
      "Can't reach Doorlist. Check your connection and try again.",
    );
  });

  it('falls back to the web message', () => {
    expect(claimMessage(new ApiError(500, null))).toBe('Could not claim tickets. Try again.');
    expect(claimMessage(new Error('boom'))).toBe('Could not claim tickets. Try again.');
  });
});
