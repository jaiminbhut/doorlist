import { resolveApiUrl } from './api-url';

describe('resolveApiUrl', () => {
  const dev = { configured: undefined, dev: true, platform: 'ios' };

  it('uses the configured address, without a trailing slash', () => {
    expect(
      resolveApiUrl({ ...dev, configured: 'https://doorlist.example.com/', metroHost: undefined }),
    ).toBe('https://doorlist.example.com');
  });

  it("finds the local API on Metro's host in a development build", () => {
    expect(resolveApiUrl({ ...dev, metroHost: '192.168.1.20:8081' })).toBe(
      'http://192.168.1.20:5080',
    );
  });

  it('reaches the computer from the Android emulator through 10.0.2.2', () => {
    expect(resolveApiUrl({ ...dev, platform: 'android', metroHost: 'localhost:8081' })).toBe(
      'http://10.0.2.2:5080',
    );
  });

  it('keeps localhost on the iOS simulator, which shares the computer’s network', () => {
    expect(resolveApiUrl({ ...dev, metroHost: 'localhost:8081' })).toBe('http://localhost:5080');
  });

  it('never guesses in a preview or production build', () => {
    expect(resolveApiUrl({ ...dev, dev: false, metroHost: '192.168.1.20:8081' })).toBeNull();
  });

  it('knows nothing without a configured address or a Metro host', () => {
    expect(resolveApiUrl({ ...dev, metroHost: undefined })).toBeNull();
  });
});
