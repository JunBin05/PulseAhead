import type { ReactNode } from 'react';
import { IconCheck, IconClock, IconOctagon, IconTriangle, IconUnknown } from './icons';
import type { LocalState } from './types';

/** A zone's displayed state: the four modelled states, or 'idle' before any data has been received. */
export type ZoneDisplay = LocalState | 'idle';

// Local zone state: green Normal, yellow Pressure building, red Overloaded, gray Cannot assess.
// Colour is never the only signal; every state has its own icon and text. 'idle' (nothing received
// yet) is gray too and reads "Not started", so no data is never shown as Normal.
export const ZONE_LOOK: Record<ZoneDisplay, { tone: string; icon: ReactNode; label: string }> = {
  normal: { tone: 'normal', icon: <IconCheck />, label: 'Normal' },
  building: { tone: 'pressure', icon: <IconTriangle />, label: 'Pressure building' },
  overloaded: { tone: 'overload', icon: <IconOctagon />, label: 'Overloaded' },
  unknown: { tone: 'unknown', icon: <IconUnknown />, label: 'Cannot assess' },
  idle: { tone: 'unknown', icon: <IconClock />, label: 'Not started' },
};
