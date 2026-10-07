// Seeds a fresh stack for the app screenshots (scripts/app-screenshots.sh).
// Three published events, like the web's screenshots; Asha Rao holding
// tickets; and a crowd at the meetup, half of it already in, so the door's
// tally looks like a real night. Prints the ticket codes the door flows scan.
//
//   node mobile/maestro/seed.mjs http://localhost:5090

import { randomUUID } from 'node:crypto';

const [base] = process.argv.slice(2);
const PASSWORD = 'Doorlist-demo-2026';

async function call(method, path, token, body) {
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${path}: ${response.status} ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

const login = async (email) =>
  (await call('POST', '/auth/login', null, { email, password: PASSWORD })).accessToken;
const register = async (email, displayName) =>
  (await call('POST', '/auth/register', null, { email, password: PASSWORD, displayName }))
    .accessToken;

/** The first Friday at least two days away, plus `extraDays`, at `hour`. */
function fromFriday(extraDays, hour) {
  const date = new Date();
  date.setDate(date.getDate() + 2);
  date.setDate(date.getDate() + ((5 - date.getDay() + 7) % 7) + extraDays);
  date.setHours(hour, 0, 0, 0);
  return date;
}
const hoursLater = (date, hours) => new Date(date.getTime() + hours * 3_600_000);

const organizer = await login('organizer@example.com');
const events = [
  {
    name: 'Friday Night Jazz',
    venue: 'The Blue Room',
    startsAt: fromFriday(0, 20),
    types: [
      ['General admission', 120],
      ['Front row', 12],
    ],
  },
  {
    name: 'Frontend Meetup: Signals in Practice',
    venue: 'Hall B, Innovation Hub',
    startsAt: fromFriday(7, 18),
    types: [['Attendee', 80]],
  },
  {
    name: 'Community Run 5K',
    venue: 'Riverside Park',
    startsAt: fromFriday(9, 7),
    types: [
      ['Runner', 300],
      ['Volunteer', 25],
    ],
  },
];
const ids = [];
for (const e of events) {
  const created = await call('POST', '/events', organizer, {
    name: e.name,
    venue: e.venue,
    description: 'Doors open 30 minutes before the start. Bring your QR ticket on your phone.',
    startsAt: e.startsAt.toISOString(),
    endsAt: hoursLater(e.startsAt, 3).toISOString(),
  });
  for (const [name, capacity] of e.types) {
    await call('POST', `/events/${created.id}/ticket-types`, organizer, { name, capacity });
  }
  await call('POST', `/events/${created.id}/publish`, organizer);
  ids.push(created.id);
}
const [jazz, meetup] = ids;

async function claim(token, eventId, quantity) {
  const event = await call('GET', `/events/${eventId}`, token);
  return call('POST', `/events/${eventId}/tickets`, token, {
    ticketTypeId: event.ticketTypes[0].id,
    quantity,
  });
}

const asha = await register('asha@example.com', 'Asha Rao');
await claim(asha, jazz, 2);
await claim(asha, meetup, 2);

// The meetup's crowd: 13 more people with 2 to 4 tickets each, 38 in all.
const crowd = [
  ['Priya Shah', 'priya'],
  ['Daniel Okafor', 'daniel'],
  ['Mei Lin', 'mei'],
  ['Tomás Rivera', 'tomas'],
  ['Hannah Becker', 'hannah'],
  ['Kwame Mensah', 'kwame'],
  ['Sofia Rossi', 'sofia'],
  ['Arjun Mehta', 'arjun'],
  ['Lena Novak', 'lena'],
  ['Omar Haddad', 'omar'],
  ['Grace Kim', 'grace'],
  ['Lucas Martin', 'lucas'],
  ['Ana Costa', 'ana'],
];
const tickets = [];
for (const [i, [name, user]] of crowd.entries()) {
  const token = await register(`${user}@example.com`, name);
  for (const ticket of await claim(token, meetup, 2 + (i % 3))) {
    tickets.push({ holder: name, code: ticket.code });
  }
}

// Ticket B is let in at the South door before the phone, offline, lets it
// in too: syncing then flags it as let in twice.
const early = tickets.slice(0, 26);
const [online, offlineA, ...rest] = tickets.slice(26);
const offlineB = rest.find((ticket) => ticket.holder !== offlineA.holder);

// Half the room is already in, through two other doors. Their scans are
// stamped from 08:40, before the status bar's 9:41, so the times add up.
const door = await login('door@example.com');
for (const [label, minute, batch] of [
  ['East door', 40, early.slice(0, 14)],
  ['South door', 45, [...early.slice(14), offlineB]],
]) {
  await call('POST', `/events/${meetup}/checkins`, door, {
    deviceId: randomUUID(),
    deviceLabel: label,
    scans: batch.map((ticket, i) => {
      const scannedAt = new Date();
      scannedAt.setHours(8, minute, i * 90, 0);
      return { scanId: randomUUID(), code: ticket.code, scannedAt: scannedAt.toISOString() };
    }),
  });
}

console.log(
  JSON.stringify({ online: online.code, offlineA: offlineA.code, offlineB: offlineB.code }),
);
