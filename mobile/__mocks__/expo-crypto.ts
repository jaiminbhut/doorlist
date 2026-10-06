// Random ids for tests, from Node.
import { randomUUID as nodeRandomUUID } from 'node:crypto';

export const randomUUID = jest.fn(() => nodeRandomUUID());
