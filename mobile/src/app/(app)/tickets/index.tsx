import { useSession } from '@/auth/session-context';
import { MyTicketsScreen } from '@/tickets/my-tickets-screen';

export default function Tickets() {
  const { session } = useSession();
  return session ? <MyTicketsScreen session={session} /> : null;
}
