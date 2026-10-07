import { useEffect, useReducer, useState } from 'react';
import { ApiError, ApiUnreachableError } from '@/api/client';
import type { Session } from '@/auth/session';
import { cacheTickets, cachedTickets } from './ticket-cache';
import { myTickets, type Ticket } from './tickets-api';

/**
 * - loading: nothing to show yet.
 * - current: the API's latest answer.
 * - offline: the API can't be reached; showing the cache, if there is one.
 * - signInAgain: the token has expired; showing the cache until a fresh sign-in.
 * - failed: the API refused for another reason.
 */
export type TicketsStatus = 'loading' | 'current' | 'offline' | 'signInAgain' | 'failed';

export interface MyTickets {
  status: TicketsStatus;
  tickets: Ticket[] | null;
  fetchedAt: string | null;
  refreshing: boolean;
  refresh(): void;
}

type State = Omit<MyTickets, 'refresh'>;

type Action =
  | { type: 'cached'; tickets: Ticket[]; fetchedAt: string }
  | { type: 'fetched'; tickets: Ticket[]; fetchedAt: string }
  | { type: 'notFetched'; status: 'offline' | 'signInAgain' | 'failed' }
  | { type: 'refreshing' };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'cached':
      // The cache can land after the API has answered: it's ignored only if
      // what's on screen is newer. Just after a claim, the cache is the newer.
      return state.fetchedAt !== null && Date.parse(state.fetchedAt) > Date.parse(action.fetchedAt)
        ? state
        : { ...state, tickets: action.tickets, fetchedAt: action.fetchedAt };
    case 'fetched':
      return {
        status: 'current',
        tickets: action.tickets,
        fetchedAt: action.fetchedAt,
        refreshing: false,
      };
    case 'notFetched':
      return { ...state, status: action.status, refreshing: false };
    case 'refreshing':
      return { ...state, refreshing: true };
  }
}

/**
 * The signed-in person's tickets: the cached copy at once, then the API's,
 * which replaces the cache (ADR 9). Without a connection, or with an expired
 * token, the cached tickets stay on screen, QR codes and all. A new
 * `claimed` reads both again, after a claim has added tickets to the cache.
 */
export function useMyTickets(session: Session, claimed = ''): MyTickets {
  const owner = session.user.email;
  const token = session.accessToken;
  const [attempt, setAttempt] = useState(0);
  const [state, dispatch] = useReducer(reducer, {
    status: 'loading',
    tickets: null,
    fetchedAt: null,
    refreshing: false,
  });

  useEffect(() => {
    let current = true;
    cachedTickets(owner).then(
      (cached) => current && cached && dispatch({ type: 'cached', ...cached }),
      () => undefined,
    );
    fetchTickets(owner, token).then((action) => current && dispatch(action));
    return () => {
      current = false;
    };
  }, [owner, token, attempt, claimed]);

  return {
    ...state,
    refresh: () => {
      dispatch({ type: 'refreshing' });
      setAttempt((count) => count + 1);
    },
  };
}

async function fetchTickets(owner: string, token: string): Promise<Action> {
  let tickets: Ticket[];
  try {
    tickets = await myTickets(token);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return { type: 'notFetched', status: 'signInAgain' };
    }
    return {
      type: 'notFetched',
      status: error instanceof ApiUnreachableError ? 'offline' : 'failed',
    };
  }

  const fetchedAt = new Date().toISOString();
  // A cache that can't be written still leaves the fresh tickets on screen.
  await cacheTickets(owner, tickets, fetchedAt).catch(() => undefined);
  return { type: 'fetched', tickets, fetchedAt };
}
