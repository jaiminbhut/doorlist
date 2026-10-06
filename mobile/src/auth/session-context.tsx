import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { forgetTickets } from '@/tickets/ticket-cache';
import { signInRequest, signUpRequest } from './auth-api';
import { loadSession, saveSession, type Session } from './session';

interface SessionState {
  /** True until the stored session has been read. */
  loading: boolean;
  session: Session | null;
  signIn(email: string, password: string): Promise<void>;
  signUp(displayName: string, email: string, password: string): Promise<void>;
  /** A fresh token for the same person, after theirs expired. Nothing on the phone is lost. */
  signInAgain(password: string): Promise<void>;
  /** Forgets the session and the cached tickets (ADR 9). */
  signOut(): Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    loadSession()
      .catch(() => null)
      .then((stored) => {
        setSession(stored);
        setLoading(false);
      });
  }, []);

  const start = useCallback(async (next: Session) => {
    await saveSession(next);
    setSession(next);
  }, []);

  const value = useMemo<SessionState>(
    () => ({
      loading,
      session,
      signIn: async (email, password) => start(await signInRequest(email, password)),
      signUp: async (displayName, email, password) =>
        start(await signUpRequest(displayName, email, password)),
      signInAgain: async (password) => {
        if (session) {
          await start(await signInRequest(session.user.email, password));
        }
      },
      signOut: async () => {
        await saveSession(null);
        await forgetTickets().catch(() => undefined);
        setSession(null);
      },
    }),
    [loading, session, start],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const state = useContext(SessionContext);
  if (!state) {
    throw new Error('useSession needs a SessionProvider above it.');
  }
  return state;
}
