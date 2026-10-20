// Pure view-model helpers for the shared next stop UI (docs/design/19 A): the ride's stop, the
// "Suggested by" line, the leader's approval card and result glyphs. No React, so unit-tested.
import { fill, copy } from '@/lib/copy';
import { formatDistance } from '@/lib/format';
import { haversineM, type LatLng } from '@/lib/geo';
import type { IconName } from '@/lib/icon-names';
import { firstName } from '@/lib/names';
import type { PlaceCategory } from '@/lib/place-search';
import type { RideRow, StopKind } from '@/lib/ride-api';
import type { PendingProposal } from '@/lib/stop-proposals';

export interface RideStop {
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  kind: StopKind;
  setBy: string | null;
}

type StopColumns = Pick<
  RideRow,
  'stop_name' | 'stop_address' | 'stop_lat' | 'stop_lng' | 'stop_kind' | 'stop_set_by'
>;

/** The ride's next stop, or null when none is set (the columns are all null together). */
export function rideStop(ride: StopColumns | null | undefined): RideStop | null {
  if (!ride || !ride.stop_name || ride.stop_lat == null || ride.stop_lng == null) return null;
  const kind: StopKind = ride.stop_kind === 'destination' ? 'destination' : 'break';
  return {
    name: ride.stop_name,
    address: ride.stop_address || null,
    lat: ride.stop_lat,
    lng: ride.stop_lng,
    kind,
    setBy: ride.stop_set_by,
  };
}

/**
 * The ride with this stop set, as the server's `propose_stop` leaves it when the leader proposes. Applied to the
 * local store at once (the realtime update later carries the same values), so the live screen does not wait
 * for the broadcast to show the new destination. Never mutates `ride`.
 */
export function withStop<R extends StopColumns & { stop_set_at: string | null }>(
  ride: R,
  stop: { name: string; address?: string | null; lat: number; lng: number; kind: StopKind },
  byUserId: string | null,
  nowIso: string,
): R {
  return {
    ...ride,
    stop_name: stop.name,
    stop_address: stop.address ?? '',
    stop_lat: stop.lat,
    stop_lng: stop.lng,
    stop_kind: stop.kind,
    stop_set_by: byUserId,
    stop_set_at: nowIso,
  };
}

/**
 * First name for the muted "Suggested by X" line: only when the stop came from someone other than
 * the leader (a leader's own pick is not a suggestion) and that rider is known.
 */
export function suggestedByName(
  stop: Pick<RideStop, 'setBy'> | null,
  leaderId: string | null | undefined,
  nameOf: (userId: string) => string | undefined,
): string | null {
  if (!stop?.setBy || stop.setBy === leaderId) return null;
  const name = nameOf(stop.setBy);
  const first = name ? firstName(name) : '';
  return first || null;
}

// The app's own icon font, not emoji (they look different on every phone maker's font). Same icons as the search chips.
const CATEGORY_ICON: Record<PlaceCategory, IconName> = {
  cafe: 'coffee',
  fuel: 'fuel',
  restaurant: 'food',
  parking: 'parking',
  toilets: 'toilets',
  other: 'permLocation',
};

export function categoryIcon(category: PlaceCategory): IconName {
  return CATEGORY_ICON[category];
}

export interface ApprovalMember {
  name: string;
  leftAt?: string | null;
}

export interface ApprovalCardModel {
  /** Id of the `stop_proposed` event: pass it to decideStop. */
  proposalId: number;
  /** Proposer's first name. */
  name: string;
  /** "Priya suggests a break · Cafe Coffee Day · 2.1 km" (no distance part without my position). */
  text: string;
  /** Further pending proposals behind this one ("+N more"). */
  moreCount: number;
  /** Place name, for the local notification. */
  place: string;
  /** Drives the card icon: cup for a break, flag for the destination. */
  kind: StopKind;
}

/**
 * The one approval card the leader sees: the newest pending proposal whose proposer is still in the
 * ride, plus how many more wait behind it. Null when there is nothing to decide.
 */
export function approvalCardModel(args: {
  proposals: readonly PendingProposal[];
  members: Readonly<Record<string, ApprovalMember | undefined>>;
  me: LatLng | null;
}): ApprovalCardModel | null {
  const live = [...args.proposals]
    .filter((p) => !args.members[p.userId]?.leftAt)
    .sort((a, b) => b.id - a.id);
  const top = live[0];
  if (!top) return null;
  const name = firstName(args.members[top.userId]?.name ?? '') || 'A rider';
  const km = args.me ? formatDistance(haversineM(args.me, top.stop)) : '';
  const template = copy[top.stop.kind === 'destination' ? 'stop.approvalDestination' : 'stop.approvalBreak'];
  // Without my position the trailing " · {km}" has nothing to say.
  const text = fill(template, { name, place: top.stop.name, km }).replace(/ · $/, '');
  return { proposalId: top.id, name, text, moreCount: live.length - 1, place: top.stop.name, kind: top.stop.kind };
}

/** What the live map draws for my route to the stop. */
export interface NavLine {
  coords: LatLng[];
  /** True for the straight-line fallback while no road route is known. */
  dashed: boolean;
  /** Who computed the road route (the credit names it); undefined for the dashed line. */
  provider?: 'locationiq' | 'osrm';
}

/** The road route when there is one, else the dashed straight line; null when there is nothing to draw. */
export function navLineFor(state: {
  route: { coords: LatLng[]; provider?: 'locationiq' | 'osrm' } | null;
  straightLine: LatLng[];
}): NavLine | null {
  if (state.route && state.route.coords.length >= 2) return { coords: state.route.coords, dashed: false, provider: state.route.provider };
  if (state.straightLine.length >= 2) return { coords: state.straightLine, dashed: true };
  return null;
}
