import { Tabs } from 'expo-router';
import { canCheckIn, isAttendee } from '@/auth/session';
import { useSession } from '@/auth/session-context';
import { DoorIcon, EventsIcon, TicketIcon } from '@/components/tab-icons';
import { fonts, usePalette } from '@/theme';

/**
 * The signed-in app. Each tab is guarded by role, like the web's links:
 * attendees get events and their tickets, door staff and organizers get the
 * door. The tab bar only shows when there's a choice.
 */
export default function AppLayout() {
  const palette = usePalette();
  const { session } = useSession();
  if (!session) {
    return null;
  }

  const attendee = isAttendee(session.user);
  const door = canCheckIn(session.user);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: palette.ground },
        tabBarActiveTintColor: palette.stamp,
        tabBarInactiveTintColor: palette.inkSoft,
        tabBarLabelStyle: { fontFamily: fonts.textBold },
        tabBarStyle: {
          // Attendees have Events and My tickets; door staff and organizers only the door.
          display: attendee ? 'flex' : 'none',
          backgroundColor: palette.paper,
          borderTopColor: palette.line,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Protected guard={attendee}>
        <Tabs.Screen name="events" options={{ title: 'Events', tabBarIcon: EventsIcon }} />
        <Tabs.Screen name="tickets" options={{ title: 'My tickets', tabBarIcon: TicketIcon }} />
      </Tabs.Protected>
      <Tabs.Protected guard={door}>
        <Tabs.Screen name="door" options={{ title: 'Door', tabBarIcon: DoorIcon }} />
      </Tabs.Protected>
    </Tabs>
  );
}
