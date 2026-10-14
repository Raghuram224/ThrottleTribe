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
  'ride.created', // with_dest: boolean (a group ride made with a destination)
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
  'map.recentre', // screen: home (map home)
  'nav.started', // from: where_to | in_ride | map_home
  'nav.arrived',
  'nav.rerouted',
  'nav.route_failed', // code: no_route | failed
  'nav.expressways_toggled', // allowed: boolean
  'nav.exclude_rejected', // the router refused exclude=motorway; no props
  'nav.voice_muted', // muted: boolean (true = muted)
  'nav.voice_skipped', // reason: session (the audio session could not start)
  'nav.fix_latency', // n, avg_ms, max_ms, max_batch, app_state: fix time vs engine receipt, per minute of navigation
  'home.search_opened', // from: bar | chip
  'home.place_opened', // from: search | recent
  'home.directions',
  'plan.choice', // choice: solo | group
  'error.shown',
] as const;

export type EventName = (typeof EVENTS)[number];
