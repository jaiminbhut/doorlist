// An in-memory Keychain for tests. Jest uses it for every test automatically.
const items = new Map<string, string>();

export const getItemAsync = jest.fn(async (key: string) => items.get(key) ?? null);

export const setItemAsync = jest.fn(async (key: string, value: string) => {
  items.set(key, value);
});

export const deleteItemAsync = jest.fn(async (key: string) => {
  items.delete(key);
});

/** Empties the store between tests. */
export function __reset(): void {
  items.clear();
}
