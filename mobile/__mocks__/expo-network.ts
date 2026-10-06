// The network for tests: listeners a test can call as if the connection came back.
type Listener = (state: { isConnected: boolean; isInternetReachable: boolean }) => void;

const listeners = new Set<Listener>();

export const addNetworkStateListener = jest.fn((listener: Listener) => {
  listeners.add(listener);
  return { remove: () => listeners.delete(listener) };
});

/** Tells every listener the phone is connected again. */
export function __connect(): void {
  listeners.forEach((listener) => listener({ isConnected: true, isInternetReachable: true }));
}
