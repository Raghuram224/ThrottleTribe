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
  // start_kind: start | invite. (`with_dest`, from the group form that D5 removed, and `just_ride`, the no-destination start, are retired: not sent.)
  'ride.created',
  'ride.group_formed', // the first other rider joined a ride I lead: no props (22 D6)
  'invite.shared', // via: share | sms | menu | lobby: the code or link was handed to the share sheet / an SMS composer
  'ride.renamed', // the leader renamed the ride: no props, never the name
  'ride.joined',
  'ride.join_failed', // code_error
  'ride.started',
  'ride.ended',
  'ride.left',
  'tracking.started', // background: boolean; terrain: boolean (Terrain on for this ride, 25 §11)
  'tracking.stopped',
  'tracking.rejected',
  'sos.triggered',
  'sos.cleared',
  'message.sent', // kind
  'alert.shown', // kind
  'map.fit_all',
  'map.recentre', // screen: home (map home)
  'map.layer_changed', // layer: standard | terrain; from: home | profile (25 §11)
  'nav.started', // from: where_to | in_ride | map_home
  'nav.arrived',
  'nav.rerouted',
  'nav.route_failed', // code: no_route | failed | rate_limited
  'route.rate_limited', // scope: second | minute | day | user; context: preview | nav | stop (24 §10)
  'search.fallback', // reason: rate_limited | quota | error | timeout | unreachable; kind: typed | chip (24 §10)
  'search.failed', // reason: busy | network; kind: typed | chip
  'search.chip_widened', // found: boolean
  'nav.expressways_toggled', // allowed: boolean
  'nav.exclude_rejected', // the router refused exclude=motorway; no props
  'nav.voice_muted', // muted: boolean (true = muted)
  'nav.voice_skipped', // reason: session (the audio session could not start)
  'nav.fix_latency', // n, avg_ms, max_ms, max_batch, app_state: fix time vs engine receipt, per minute of navigation
  'home.search_opened', // from: bar | chip | fab | ride (the ride view's stop search, 28 §8)
  'home.place_opened', // from: search | recent
  'home.directions',
  'error.shown',
] as const;

export type EventName = (typeof EVENTS)[number];
