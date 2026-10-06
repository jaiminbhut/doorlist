import { useLocalSearchParams } from 'expo-router';
import { useSession } from '@/auth/session-context';
import { TicketScreen } from '@/tickets/ticket-screen';

export default function Ticket() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  return session ? <TicketScreen owner={session.user.email} id={id} /> : null;
}
