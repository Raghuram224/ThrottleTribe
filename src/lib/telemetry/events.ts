// Closed list of analytics events. Names must match the SQL check ^[a-z][a-z0-9_.]{0,63}$.
// Props are noted where an event carries any; never add user-entered text, names, codes or coordinates.
export const EVENTS = [
  'app.opened',
  'app.backgrounded',
  'screen.viewed',
  'onboarding.started',
  'onboarding.completed',
  'permission.location', // foreground, background
  'permission.notifications',
  'ride.created',
  'ride.joined',
  'ride.join_failed', // code_error
  'ride.started',
  'ride.ended',
  'ride.left',
  'tracking.started',
  'tracking.stopped',
  'tracking.rejected',
  'sos.triggered',
  'sos.cleared',
  'message.sent', // kind
  'alert.shown', // kind
  'map.fit_all',
  'map.recentre',
  'error.shown',
] as const;

export type EventName = (typeof EVENTS)[number];
