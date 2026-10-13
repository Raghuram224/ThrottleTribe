import { create } from 'zustand';

import { appendToTrail, buildTrail, type Trail } from '@/lib/geo';
import {
  ensureSignedIn,
  fetchRideSnapshot,
  toRideError,
  type EventRow,
  type MemberRow,
  type PositionRow,
  type RideRow,
} from '@/lib/ride-api';
import { syncCachedRide } from '@/lib/offline-cache';
import { applyEventToProposals, derivePendingProposals, noticeForEvent, type PendingProposal, type StopNotice } from '@/lib/stop-proposals';
import { deriveRiderStatus, type RiderStatusResult } from '@/lib/rider-status';

export type ChannelStatus = 'idle' | 'connecting' | 'subscribed' | 'closed' | 'error';

export interface RideMember {
  userId: string;
  name: string;
  role: 'leader' | 'rider';
  colorIndex: number;
  sos: boolean;
  sosAt: string | null;
  joinedAt: string;
  leftAt: string | null;
}

export interface RiderPosition {
  userId: string;
  lat: number;
  lng: number;
  accuracyM: number | null;
  speedMps: number | null;
  heading: number | null;
  recordedAt: string;
  slowSince: string | null;
  updatedAt: string;
}

const MAX_EVENTS = 50;
const UNKNOWN_NAME = 'Rider';

function toMember(row: MemberRow, name: string): RideMember {
  return {
    userId: row.user_id,
    name,
    role: row.role === 'leader' ? 'leader' : 'rider',
    colorIndex: row.color_index,
    sos: row.sos,
    sosAt: row.sos_at,
    joinedAt: row.joined_at,
    leftAt: row.left_at,
  };
}

function toPosition(row: PositionRow): RiderPosition {
  return {
    userId: row.user_id,
    lat: row.lat,
    lng: row.lng,
    accuracyM: row.accuracy_m,
    speedMps: row.speed_mps,
    heading: row.heading,
    recordedAt: row.recorded_at,
    slowSince: row.slow_since,
    updatedAt: row.updated_at,
  };
}

interface RideState {
  myUserId: string | null;
  rideId: string | null;
  ride: RideRow | null;
  members: Record<string, RideMember>;
  positions: Record<string, RiderPosition>;
  /** Newest first, capped at 50. */
  events: EventRow[];
  /** Leader's route, downsampled; extended live by leader position broadcasts. */
  leaderTrail: Trail;
  channelStatus: ChannelStatus;
  /** user_ids currently present on the ride channel (Realtime Presence). Replaced on every sync. */
  connectedUserIds: ReadonlySet<string>;
  /** True once the first snapshot for `rideId` has landed. */
  loaded: boolean;
  loadError: string | null;
  /** Newest undecided stop proposal per rider, newest first (leader UI shows these). */
  pendingProposals: PendingProposal[];
  /** Latest toast-worthy stop event for me (live events only); `nonce` changes on every one. */
  stopNotice: StopNotice | null;

  load: (rideId: string) => Promise<void>;
  applyPosition: (row: PositionRow) => void;
  applyMember: (row: MemberRow) => void;
  applyRide: (row: RideRow) => void;
  applyEvent: (row: EventRow) => void;
  setChannelStatus: (status: ChannelStatus) => void;
  setConnected: (userIds: Iterable<string>) => void;
  reset: () => void;
}

const EMPTY_TRAIL: Trail = { points: [], cumulativeM: [], totalM: 0 };

const INITIAL = {
  myUserId: null,
  rideId: null,
  ride: null,
  members: {},
  positions: {},
  events: [],
  leaderTrail: EMPTY_TRAIL,
  channelStatus: 'idle' as ChannelStatus,
  connectedUserIds: new Set<string>() as ReadonlySet<string>,
  loaded: false,
  loadError: null,
  pendingProposals: [] as PendingProposal[],
  stopNotice: null as StopNotice | null,
};

export const useRideStore = create<RideState>((set, get) => ({
  ...INITIAL,

  load: async (rideId) => {
    // Switching rides must not flash the previous ride's riders.
    if (get().rideId !== rideId) set({ ...INITIAL, rideId, channelStatus: get().channelStatus });
    try {
      const [myUserId, snap] = await Promise.all([ensureSignedIn(), fetchRideSnapshot(rideId)]);
      // A newer load/reset may have superseded this one while the request was in flight.
      if (get().rideId !== rideId) return;

      const members: Record<string, RideMember> = {};
      for (const m of snap.members) members[m.user_id] = toMember(m, m.display_name);
      const positions: Record<string, RiderPosition> = {};
      for (const p of snap.positions) positions[p.user_id] = toPosition(p);

      const mine = snap.members.find((m) => m.user_id === myUserId);
      syncCachedRide(snap.ride.id, snap.ride.status, !mine || !!mine.left_at);
      set({
        myUserId,
        ride: snap.ride,
        members,
        positions,
        events: snap.events.slice(0, MAX_EVENTS),
        pendingProposals: derivePendingProposals(snap.events),
        leaderTrail: buildTrail(
          snap.leaderTrail.map((s) => ({ lat: s.lat, lng: s.lng, t: Date.parse(s.recorded_at) })),
        ),
        loaded: true,
        loadError: null,
      });
    } catch (e) {
      if (get().rideId === rideId) set({ loadError: toRideError(e).message });
    }
  },

  applyPosition: (row) => {
    const { rideId, ride, positions, leaderTrail } = get();
    if (row.ride_id !== rideId) return;
    const prev = positions[row.user_id];
    // Broadcasts can arrive out of order; the server never moves a rider backwards either.
    if (prev && Date.parse(prev.recordedAt) > Date.parse(row.recorded_at)) return;
    const next: Partial<RideState> = {
      positions: { ...positions, [row.user_id]: toPosition(row) },
    };
    // Lobby positions (before started_at) are not part of the route.
    if (ride && ride.started_at && row.user_id === ride.leader_id) {
      const t = Date.parse(row.recorded_at);
      if (!(t < Date.parse(ride.started_at))) {
        next.leaderTrail = appendToTrail(leaderTrail, { lat: row.lat, lng: row.lng, t });
      }
    }
    set(next);
  },

  applyMember: (row) => {
    const { rideId, members, myUserId, ride } = get();
    if (row.ride_id !== rideId) return;
    if (row.user_id === myUserId && ride) syncCachedRide(ride.id, ride.status, !!row.left_at);
    const name = members[row.user_id]?.name ?? UNKNOWN_NAME;
    set({ members: { ...members, [row.user_id]: toMember(row, name) } });
  },

  applyRide: (row) => {
    const { rideId, ride, myUserId, members } = get();
    if (row.id !== rideId) return;
    const mine = myUserId ? members[myUserId] : undefined;
    syncCachedRide(row.id, row.status, !!mine?.leftAt);
    // Lobby -> active: whatever the trail held is pre-start GPS, so begin a fresh one.
    if (ride && !ride.started_at && row.started_at) set({ ride: row, leaderTrail: EMPTY_TRAIL });
    else set({ ride: row });
  },

  applyEvent: (row) => {
    const { rideId, events, myUserId, members, pendingProposals } = get();
    if (row.ride_id !== rideId || events.some((e) => e.id === row.id)) return;
    const next = [row, ...events].slice(0, MAX_EVENTS);
    const patch: Partial<RideState> = { events: next };
    if (row.type.startsWith('stop_')) {
      patch.pendingProposals = applyEventToProposals(pendingProposals, row);
      const notice = noticeForEvent(row, {
        myUserId,
        nameOf: (id) => (id ? members[id]?.name : undefined) ?? UNKNOWN_NAME,
      });
      if (notice) patch.stopNotice = notice;
    }
    set(patch);
  },

  setChannelStatus: (channelStatus) => set({ channelStatus }),

  setConnected: (userIds) => set({ connectedUserIds: new Set(userIds) }),

  reset: () => set({ ...INITIAL }),
}));

export const selectPendingProposals = (state: Pick<RideState, 'pendingProposals'>) => state.pendingProposals;

export type StatusMap = Record<string, RiderStatusResult>;

/** Derived status for every member who is still in the ride. Pure; pass `Date.now()` from a ticker. */
export function selectStatuses(
  state: Pick<RideState, 'members' | 'positions' | 'ride'>,
  now: number,
): StatusMap {
  const out: StatusMap = {};
  const stopThresholdS = state.ride?.stop_threshold_s ?? 180;
  for (const m of Object.values(state.members)) {
    if (m.leftAt) continue;
    const p = state.positions[m.userId];
    out[m.userId] = deriveRiderStatus(
      {
        sos: m.sos,
        sosAt: m.sosAt,
        position: p ? { updatedAt: p.updatedAt, slowSince: p.slowSince } : null,
        stopThresholdS,
      },
      now,
    );
  }
  return out;
}
