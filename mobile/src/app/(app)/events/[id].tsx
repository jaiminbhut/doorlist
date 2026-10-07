import { useLocalSearchParams } from 'expo-router';
import { useSession } from '@/auth/session-context';
import { EventScreen } from '@/events/event-screen';

export default function Event() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  return session ? <EventScreen id={Number(id)} session={session} /> : null;
}
