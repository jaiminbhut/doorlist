/**
 * Dates as the web shows them, in the phone's time zone. Each field has its
 * own formatter and the punctuation is ours: whole-date formats differ
 * between ICU versions (Node's adds a comma after the weekday), and Hermes
 * on a phone isn't the Node that runs the tests.
 */
const field = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', options);
const weekday = field({ weekday: 'long' });
const shortWeekday = field({ weekday: 'short' });
const dayOfMonth = field({ day: 'numeric' });
const month = field({ month: 'long' });
const shortMonth = field({ month: 'short' });
const year = field({ year: 'numeric' });
const time = field({ hour: '2-digit', minute: '2-digit', hour12: false });

/** "Friday 9 October 2026, 20:00", like the web's tickets. */
export function formatWhen(iso: string): string {
  const date = new Date(iso);
  return `${weekday.format(date)} ${dayOfMonth.format(date)} ${month.format(date)} ${year.format(date)}, ${time.format(date)}`;
}

/** "Tue 6 Oct, 14:02", for when something was saved. */
export function formatSavedAt(iso: string): string {
  const date = new Date(iso);
  return `${shortWeekday.format(date)} ${dayOfMonth.format(date)} ${shortMonth.format(date)}, ${time.format(date)}`;
}
