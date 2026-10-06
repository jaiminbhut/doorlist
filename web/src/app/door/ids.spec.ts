import { newId } from './ids';

describe('newId', () => {
  it('makes version 4 UUIDs, even where crypto.randomUUID is missing (plain HTTP)', () => {
    const randomUUID = crypto.randomUUID;
    try {
      Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
      const ids = new Set(Array.from({ length: 50 }, () => newId()));

      expect(ids.size).toBe(50);
      for (const id of ids) {
        expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      }
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: randomUUID, configurable: true });
    }
  });
});
