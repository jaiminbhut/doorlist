// Screen brightness for tests: starts at 40%.
export const getBrightnessAsync = jest.fn(async () => 0.4);
export const setBrightnessAsync = jest.fn(async (_level: number) => undefined);
export const restoreSystemBrightnessAsync = jest.fn(async () => undefined);
