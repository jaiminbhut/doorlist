import type { ColorValue } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

interface IconProps {
  color: ColorValue;
  size: number;
}

/** A ticket with notched sides, as on the My tickets stub. */
export function TicketIcon({ color, size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2.2a2.8 2.8 0 0 0 0 5.6V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2.2a2.8 2.8 0 0 0 0-5.6z"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Path d="M15 6v2.5M15 11v2M15 15.5V18" stroke={color} strokeWidth={2} />
    </Svg>
  );
}

/** The door mark from the wordmark. */
export function DoorIcon({ color, size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" stroke={color} strokeWidth={2} />
      <Path d="M3.5 21h17" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Circle cx={14.5} cy={12.5} r={1.4} fill={color} />
    </Svg>
  );
}

/** A calendar page, for Events. */
export function EventsIcon({ color, size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={5} width={18} height={16} rx={2} stroke={color} strokeWidth={2} />
      <Path d="M3 10h18M8 3v4M16 3v4" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Circle cx={12} cy={15.5} r={1.6} fill={color} />
    </Svg>
  );
}
