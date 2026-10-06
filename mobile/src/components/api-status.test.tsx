import { fireEvent, render, screen } from '@testing-library/react-native';
import { ApiUnreachableError, request } from '@/api/client';
import { ApiStatus } from './api-status';

jest.mock('@/api/api-url', () => ({ apiUrl: 'http://192.168.1.20:5080' }));
jest.mock('@/api/client', () => ({
  ...jest.requireActual('@/api/client'),
  request: jest.fn(),
}));

const requestMock = jest.mocked(request);

beforeEach(() => requestMock.mockReset());

describe('ApiStatus', () => {
  it('shows which API this build uses, and that it answers', async () => {
    requestMock.mockResolvedValue('Healthy');

    await render(<ApiStatus />);

    expect(screen.getByText('http://192.168.1.20:5080')).toBeOnTheScreen();
    expect(await screen.findByText('Connected')).toBeOnTheScreen();
    expect(requestMock).toHaveBeenCalledWith('/api/health', expect.anything());
  });

  it("says when the API can't be reached, and checks again on request", async () => {
    requestMock.mockRejectedValueOnce(new ApiUnreachableError()).mockResolvedValueOnce('Healthy');

    await render(<ApiStatus />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Check again' }));

    expect(await screen.findByText('Connected')).toBeOnTheScreen();
    expect(requestMock).toHaveBeenCalledTimes(2);
  });
});
