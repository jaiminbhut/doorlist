import { useLocalSearchParams } from 'expo-router';
import { useSession } from '@/auth/session-context';
import { DoorConsoleScreen } from '@/door/door-console-screen';

export default function DoorConsole() {
  const { eventId, name } = useLocalSearchParams<{ eventId: string; name?: string }>();
  const { session } = useSession();
  return session ? (
    <DoorConsoleScreen session={session} eventId={Number(eventId)} eventName={name} />
  ) : null;
}
