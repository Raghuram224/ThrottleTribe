import { hasStoredSession } from '@/lib/auth-state';
import { copy } from '@/lib/copy';
import type { Tables } from '@/lib/database.types';
import {
  isMessageKind,
  MESSAGE_KIND_LIST,
  MESSAGE_KINDS,
  type MessageKind,
} from '@/lib/message-kinds';
import { cacheOpenRide, cacheProfile } from '@/lib/offline-cache';
import { unmarkNavRide } from '@/lib/nav-rides';
import { mapRecentRides, type RecentRide } from '@/lib/recent-rides';
import type { PlaceCategory } from '@/lib/place-search';
import { supabase } from '@/lib/supabase';
import { useLiveUiStore } from '@/store/live-ui-store';
import { track } from '@/lib/telemetry';

export type RideRow = Tables<'rides'>;
export type MemberRow = Tables<'ride_members'>;
export type PositionRow = Tables<'rider_positions'>;
export type EventRow = Tables<'ride_events'>;
export type ProfileRow = Tables<'profiles'>;

// ---------------------------------------------------------------- errors

export type RideErrorCode =
  | 'not_authenticated'
  | 'profile_required'
  | 'ride_not_found'
  | 'not_leader_or_not_in_lobby'
  | 'not_leader_or_already_ended'
  | 'leader_must_end_ride'
  | 'invalid_message_kind'
  | 'not_a_member'
  | 'stop_invalid'
  | 'stop_leader_only'
  | 'stop_ride_ended'
  | 'proposal_not_found'
  | 'proposal_already_decided'
  | 'rename_leader_only'
  | 'rename_ride_ended'
  | 'rename_invalid'
  | 'rename_unavailable'
  | 'network'
  | 'unknown';

// Texts live in copy.ts (docs/design/09-states-copy.md).
const ERROR_MESSAGES: Record<RideErrorCode, string> = {
  not_authenticated: copy['errors.not_authenticated'],
  profile_required: copy['errors.profile_required'],
  ride_not_found: copy['errors.ride_not_found'],
  not_leader_or_not_in_lobby: copy['errors.not_leader_or_not_in_lobby'],
  not_leader_or_already_ended: copy['errors.not_leader_or_already_ended'],
  leader_must_end_ride: copy['errors.leader_must_end_ride'],
  invalid_message_kind: copy['errors.invalid_message_kind'],
  not_a_member: copy['errors.not_a_member'],
  stop_invalid: copy['errors.stop_invalid'],
  stop_leader_only: copy['errors.stop_leader_only'],
  stop_ride_ended: copy['errors.stop_ride_ended'],
  proposal_not_found: copy['errors.proposal_not_found'],
  proposal_already_decided: copy['errors.proposal_already_decided'],
  rename_leader_only: copy['errors.rename_leader_only'],
  rename_ride_ended: copy['errors.rename_ride_ended'],
  rename_invalid: copy['errors.rename_invalid'],
  rename_unavailable: copy['errors.rename_unavailable'],
  network: copy['errors.network'],
  unknown: copy['errors.unknown'],
};

export class RideError extends Error {
  readonly code: RideErrorCode;

  constructor(code: RideErrorCode, cause?: unknown) {
    super(ERROR_MESSAGES[code]);
    this.name = 'RideError';
    this.code = code;
    if (cause !== undefined) this.cause = cause;
  }
}

const KNOWN_CODES = (Object.keys(ERROR_MESSAGES) as RideErrorCode[]).filter(
  (c) => c !== 'network' && c !== 'unknown',
);

/** Maps a Postgrest/auth/fetch error to a RideError by the RPC's raised message text. */
export function toRideError(error: unknown): RideError {
  if (error instanceof RideError) return error;
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error);
  // Migration 0010 not applied yet: PostgREST says it cannot find the function (PGRST202).
  if (/rename_ride/.test(message) && /could not find|schema cache|does not exist/i.test(message)) {
    return new RideError('rename_unavailable', error);
  }
  const code = KNOWN_CODES.find((c) => message.includes(c));
  if (code) return new RideError(code, error);
  if (/network|fetch|timed? ?out|offline/i.test(message)) return new RideError('network', error);
  return new RideError('unknown', error);
}

/** Unwraps a Supabase `{ data, error }` result or throws a RideError. */
function unwrap<T>(result: { data: T; error: unknown }): NonNullable<T> {
  if (result.error) throw toRideError(result.error);
  if (result.data === null || result.data === undefined) throw new RideError('unknown');
  return result.data;
}

function check(result: { error: unknown }): void {
  if (result.error) throw toRideError(result.error);
}

// ---------------------------------------------------------------- messages

export { isMessageKind, MESSAGE_KIND_LIST, MESSAGE_KINDS, type MessageKind };

// ---------------------------------------------------------------- auth & profile

/** Returns the signed-in user id, signing in anonymously on first launch. */
export async function ensureSignedIn(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw toRideError(error);
  if (data.session) return data.session.user.id;
  // A stored session whose refresh failed must never become a NEW anonymous user: that would
  // orphan the rider's ride membership. Offline-safe: report a network error and let callers retry.
  if (hasStoredSession()) throw new RideError('network');
  const res = await supabase.auth.signInAnonymously();
  if (res.error || !res.data.user) throw toRideError(res.error ?? 'not_authenticated');
  return res.data.user.id;
}

export async function getMyProfile(): Promise<ProfileRow | null> {
  const userId = await ensureSignedIn();
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw toRideError(error);
  cacheProfile(data);
  return data;
}

export async function saveProfile(displayName: string, bike?: string): Promise<ProfileRow> {
  const userId = await ensureSignedIn();
  const row = { id: userId, display_name: displayName.trim(), bike: bike?.trim() || null };
  const saved = unwrap(await supabase.from('profiles').upsert(row).select().single());
  cacheProfile(saved);
  return saved;
}

/**
 * Deletes my account server-side (profile, memberships, samples; rides I lead are ended first).
 * The caller then signs out locally and returns to onboarding.
 */
export async function deleteMyAccount(): Promise<void> {
  await ensureSignedIn();
  check(await supabase.rpc('delete_my_account'));
}

/** Clears the local session. The server may already have deleted the user, so errors are ignored. */
export async function signOutLocal(): Promise<void> {
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    // Nothing to recover: the local session is dropped either way.
  }
}

// ---------------------------------------------------------------- ride RPCs

/** How a ride was made (telemetry only, 22 §11): Start ride or Invite riders (lobby). `just_ride` is retired. */
export type RideStartKind = 'start' | 'invite';

export async function createRide(name: string, stopThresholdS: number, opts: { startKind?: RideStartKind } = {}): Promise<RideRow> {
  await ensureSignedIn();
  const ride = unwrap(await supabase.rpc('create_ride', { p_name: name, p_stop_threshold_s: stopThresholdS }));
  track('ride.created', opts.startKind === undefined ? undefined : { start_kind: opts.startKind });
  // The full-map preference belongs to the ride before: a new ride opens in the normal view (22 L1).
  useLiveUiStore.getState().startNewRide();
  return ride;
}

export async function joinRide(code: string): Promise<RideRow> {
  await ensureSignedIn();
  try {
    const ride = unwrap(await supabase.rpc('join_ride', { p_code: code.trim() }));
    track('ride.joined');
    return ride;
  } catch (e) {
    track('ride.join_failed', { code_error: toRideError(e).code });
    throw e;
  }
}

export async function startRide(id: string): Promise<RideRow> {
  const ride = unwrap(await supabase.rpc('start_ride', { p_ride_id: id }));
  track('ride.started');
  return ride;
}

export async function endRide(id: string): Promise<RideRow> {
  const ride = unwrap(await supabase.rpc('end_ride', { p_ride_id: id }));
  // Also how a lobby is cancelled: that ride never reaches the recent-rides list, so its marker is dropped here (22 L7).
  unmarkNavRide(id);
  track('ride.ended');
  return ride;
}

export async function leaveRide(id: string): Promise<void> {
  check(await supabase.rpc('leave_ride', { p_ride_id: id }));
  track('ride.left');
}

export async function setSos(id: string, on: boolean): Promise<void> {
  check(await supabase.rpc('set_sos', { p_ride_id: id, p_on: on }));
  track(on ? 'sos.triggered' : 'sos.cleared');
}

export async function sendMessage(id: string, kind: MessageKind): Promise<void> {
  check(await supabase.rpc('send_ride_message', { p_ride_id: id, p_kind: kind }));
  track('message.sent', { kind });
}

/** Leader only: renames the ride (lobby or live). Returns the updated row; everyone else gets it by broadcast. */
export async function renameRide(rideId: string, name: string): Promise<RideRow> {
  const ride = unwrap(await supabase.rpc('rename_ride', { p_ride_id: rideId, p_name: name.trim() }));
  track('ride.renamed'); // never the name itself
  return ride;
}

// ---------------------------------------------------------------- next stop

export type StopKind = 'break' | 'destination';

export interface StopInput {
  name: string;
  address?: string | null;
  lat: number;
  lng: number;
  kind: StopKind;
  /** What kind of place it is (picks the icon); omitted/null for a stop with none. */
  category?: PlaceCategory | null;
}

export interface ProposeStopResult {
  /** True when the caller is the leader and the stop was set directly. */
  applied: boolean;
  eventId: number;
}

/** PostgREST could not find a function with these arguments (PGRST202). */
function isFunctionNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const e = error as { code?: unknown; message?: unknown };
  return e.code === 'PGRST202' || (typeof e.message === 'string' && /could not find the function/i.test(e.message));
}

/** Leader: sets the stop now. Rider: sends a proposal the leader must accept. */
export async function proposeStop(rideId: string, stop: StopInput): Promise<ProposeStopResult> {
  const args = {
    p_ride_id: rideId,
    p_name: stop.name,
    p_address: stop.address ?? '',
    p_lat: stop.lat,
    p_lng: stop.lng,
    p_kind: stop.kind,
  };
  // Left out when unknown: the server default is null.
  let result = await supabase.rpc('propose_stop', stop.category ? { ...args, p_category: stop.category } : args);
  // Migration 0012 not applied yet: the 7-argument function does not exist. The stop still works without its icon.
  if (stop.category && result.error && isFunctionNotFound(result.error)) {
    result = await supabase.rpc('propose_stop', args);
  }
  const data = unwrap(result) as { applied?: boolean; event_id?: number };
  return { applied: !!data.applied, eventId: Number(data.event_id) };
}

/** Leader only. `proposalId` is the id of the `stop_proposed` event. */
export async function decideStop(rideId: string, proposalId: number, accept: boolean): Promise<void> {
  check(await supabase.rpc('decide_stop', { p_ride_id: rideId, p_proposal_id: proposalId, p_accept: accept }));
}

/** Leader only: removes the stop for everyone. */
export async function clearStop(rideId: string): Promise<void> {
  check(await supabase.rpc('clear_stop', { p_ride_id: rideId }));
}

// ---------------------------------------------------------------- reads

export interface OpenRide {
  ride: RideRow;
  member: MemberRow;
}

/** My newest membership that I have not left, in a ride that is not over; null if none. */
export async function getMyOpenRide(): Promise<OpenRide | null> {
  const userId = await ensureSignedIn();
  const { data, error } = await supabase
    .from('ride_members')
    .select('*, rides!inner(*)')
    .eq('user_id', userId)
    .is('left_at', null)
    .neq('rides.status', 'ended')
    .order('joined_at', { ascending: false })
    .limit(1);
  if (error) throw toRideError(error);
  const row = data?.[0];
  cacheOpenRide(row ? { id: row.rides.id, status: row.rides.status } : null);
  if (!row) return null;
  const { rides, ...member } = row;
  return { ride: rides, member };
}

// --- recent rides ---
/**
 * My ended rides, newest first: rides I was in until the end (not ones I left early: the ride
 * layout would send me home from their summary), that really started (cancelled lobbies have no
 * `started_at`). `riders` is the member count, so it includes riders who left early.
 */
export async function getMyRecentRides(limit = 10): Promise<RecentRide[]> {
  const userId = await ensureSignedIn();
  const { data, error } = await supabase
    .from('rides')
    .select('id, name, started_at, ended_at, ride_members!inner(user_id, left_at), rider_count:ride_members(count)')
    .eq('status', 'ended')
    .not('started_at', 'is', null)
    .eq('ride_members.user_id', userId)
    .is('ride_members.left_at', null)
    .order('ended_at', { ascending: false })
    .limit(limit);
  if (error) throw toRideError(error);
  return mapRecentRides(data ?? []);
}
// --- end recent rides ---

export interface MySample {
  lat: number;
  lng: number;
  recorded_at: string;
  accuracy_m: number | null;
}

/** My own GPS samples for a ride, oldest first, for the summary distance. */
export async function fetchMySamples(rideId: string): Promise<MySample[]> {
  const userId = await ensureSignedIn();
  const rows: MySample[] = [];
  // PostgREST caps a response at ~1000 rows; page until a short page comes back.
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const page = unwrap(
      await supabase
        .from('ride_samples')
        .select('lat, lng, recorded_at, accuracy_m')
        .eq('ride_id', rideId)
        .eq('user_id', userId)
        .order('recorded_at', { ascending: true })
        .range(from, from + PAGE - 1),
    );
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

/** Every event of a ride, oldest first (the snapshot only holds the newest 50). Capped at 500. */
export async function fetchAllEvents(rideId: string): Promise<EventRow[]> {
  return unwrap(
    await supabase
      .from('ride_events')
      .select('*')
      .eq('ride_id', rideId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(500),
  );
}

export interface MemberWithName extends MemberRow {
  display_name: string;
}

export interface TrailSample {
  lat: number;
  lng: number;
  recorded_at: string;
}

export interface RideSnapshot {
  ride: RideRow;
  members: MemberWithName[];
  positions: PositionRow[];
  /** Newest first, at most 50. */
  events: EventRow[];
  /** Leader's samples, oldest first, at most 5000. */
  leaderTrail: TrailSample[];
}

export async function fetchRideSnapshot(rideId: string): Promise<RideSnapshot> {
  const ride = unwrap(await supabase.from('rides').select('*').eq('id', rideId).single());

  const [membersRes, positionsRes, eventsRes, trailRes] = await Promise.all([
    supabase.from('ride_members').select('*').eq('ride_id', rideId),
    supabase.from('rider_positions').select('*').eq('ride_id', rideId),
    supabase
      .from('ride_events')
      .select('*')
      .eq('ride_id', rideId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(50),
    // Only samples from the start of the ride: lobby GPS can sit at a stale position far away and
    // would poison the trail. Not started yet (lobby) means no trail.
    (async (): Promise<TrailSample[]> => {
      if (!ride.started_at) return [];
      return unwrap(
        await supabase
          .from('ride_samples')
          .select('lat, lng, recorded_at')
          .eq('ride_id', rideId)
          .eq('user_id', ride.leader_id)
          .gte('recorded_at', ride.started_at)
          .order('recorded_at', { ascending: true })
          .limit(5000),
      );
    })(),
  ]);
  const members = unwrap(membersRes);
  const positions = unwrap(positionsRes);
  const events = unwrap(eventsRes);
  const leaderTrail = trailRes;

  const profiles = unwrap(
    await supabase
      .from('profiles')
      .select('id, display_name')
      .in(
        'id',
        members.map((m) => m.user_id),
      ),
  );
  const names = new Map(profiles.map((p) => [p.id, p.display_name]));

  return {
    ride,
    members: members.map((m) => ({ ...m, display_name: names.get(m.user_id) ?? 'Rider' })),
    positions,
    events,
    leaderTrail,
  };
}
