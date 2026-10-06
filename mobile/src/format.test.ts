import { formatSavedAt, formatWhen } from './format';

// Tests run in UTC (jest.global-setup.js).
describe('dates', () => {
  it('shows when an event starts as the web does', () => {
    expect(formatWhen('2026-10-09T20:00:00+00:00')).toBe('Friday 9 October 2026, 20:00');
  });

  it('shows when tickets were saved, briefly', () => {
    expect(formatSavedAt('2026-10-06T14:02:00Z')).toBe('Tue 6 Oct, 14:02');
  });
});
