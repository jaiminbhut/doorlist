import { useLocalSearchParams } from 'expo-router';
import { useSession } from '@/auth/session-context';
import { MyTicketsScreen } from '@/tickets/my-tickets-screen';

export default function Tickets() {
  const { claimed } = useLocalSearchParams<{ claimed?: string }>();
  const { session } = useSession();
  return session ? <MyTicketsScreen session={session} claimed={claimed} /> : null;
}
