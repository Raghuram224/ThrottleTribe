// Pure model for the Home "ride in progress" card (16 §3): the convoy and the one exception line,
// built from a ride snapshot. No React, no native modules.
import { buildConvoy, type ConvoyModel } from '@/lib/convoy';
import { copy, fill } from '@/lib/copy';
import { formatDuration } from '@/lib/format';
import { buildTrail } from '@/lib/geo';
import { buildLiveList, type LiveMember } from '@/lib/live-list';
import { splitNameTag } from '@/lib/names';
import { deriveRiderStatus, type RiderStatusResult } from '@/lib/rider-status';

/** The subset of `RideSnapshot` the card needs (structural, so tests need no Supabase types). */
export interface HomeSnapshot {
  ride: { stop_threshold_s: number; started_at: string | null };
  members: {
    user_id: string;
    display_name: string;
    role: string;
    color_index: number;
    sos: boolean;
    sos_at: string | null;
    left_at: string | null;
  }[];
  positions: {
    user_id: string;
    lat: number;
    lng: number;
    updated_at: string;
    slow_since: string | null;
  }[];
  leaderTrail: { lat: number; lng: number; recorded_at: string }[];
}

export interface HomeConvoy {
  model: ConvoyModel | null;
  /** "Priya · no signal 1 min", or "Everyone is moving". */
  exception: { text: string; status: 'moving' | 'stopped' | 'offline' | 'sos' };
}

const SEVERITY = { sos: 3, offline: 2, stopped: 1, moving: 0 } as const;

export function homeConvoy(snap: HomeSnapshot, myUserId: string, now: number): HomeConvoy {
  const members: LiveMember[] = snap.members.map((m) => ({
    userId: m.user_id,
    name: m.display_name,
    colorIndex: m.color_index,
    role: m.role === 'leader' ? 'leader' : 'rider',
    sos: m.sos,
    sosAt: m.sos_at,
    leftAt: m.left_at,
  }));
  const positions: Record<string, { lat: number; lng: number }> = {};
  const byPos = new Map(snap.positions.map((p) => [p.user_id, p]));
  for (const p of snap.positions) positions[p.user_id] = { lat: p.lat, lng: p.lng };

  const statuses: Record<string, RiderStatusResult> = {};
  for (const m of members) {
    if (m.leftAt) continue;
    const p = byPos.get(m.userId);
    statuses[m.userId] = deriveRiderStatus(
      {
        sos: m.sos,
        sosAt: m.sosAt,
        position: p ? { updatedAt: p.updated_at, slowSince: p.slow_since } : null,
        stopThresholdS: snap.ride.stop_threshold_s,
      },
      now,
    );
  }

  const trail = buildTrail(snap.leaderTrail.map((s) => ({ lat: s.lat, lng: s.lng, t: Date.parse(s.recorded_at) })));
  const items = buildLiveList({ members, positions, statuses, trail, myUserId });
  const riders = items.flatMap((i) => {
    if (i.kind !== 'rider') return [];
    const m = members.find((x) => x.userId === i.userId);
    return m ? [{ userId: i.userId, name: m.name, colorIndex: m.colorIndex, status: i.status, rel: i.rel }] : [];
  });
  const mine = members.find((m) => m.userId === myUserId);
  const model = buildConvoy({
    riders,
    me: mine ? { name: mine.name, colorIndex: mine.colorIndex } : null,
    trail,
    positions,
    myUserId,
  });

  // The most severe exception, longest first.
  let worst: { name: string; status: RiderStatusResult['status']; sinceMs: number | null } | null = null;
  for (const m of members) {
    if (m.leftAt || m.userId === myUserId) continue;
    const st = statuses[m.userId];
    if (!st || st.status === 'moving') continue;
    const better =
      !worst ||
      SEVERITY[st.status] > SEVERITY[worst.status] ||
      (SEVERITY[st.status] === SEVERITY[worst.status] && (st.sinceMs ?? 0) > (worst.sinceMs ?? 0));
    if (better) worst = { name: splitNameTag(m.name).base, status: st.status, sinceMs: st.sinceMs };
  }
  if (!worst) return { model, exception: { text: copy['home.convoyAllMoving'], status: 'moving' } };
  const age = worst.sinceMs != null ? formatDuration(worst.sinceMs) : '';
  const key =
    worst.status === 'sos' ? 'home.excSos' : worst.status === 'offline' ? 'home.excNoSignal' : 'home.excStopped';
  return {
    model,
    exception: { text: fill(copy[key], { name: worst.name, age }).replace(/\s+$/, ''), status: worst.status },
  };
}
