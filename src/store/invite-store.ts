import { create } from 'zustand';

import {
  addInvitee,
  matchInvitees,
  parseInvitees,
  shouldPurge,
  type Invitee,
  type MatchMember,
} from '@/lib/invite';
import { readItem, writeItem } from '@/lib/storage';

// The invited list is local to this phone (10 §5): phone numbers are never uploaded.
const listKey = (rideId: string) => `invites:${rideId}`;
const INDEX_KEY = 'invites:index';

export const NO_INVITEES: Invitee[] = [];

function readIndex(): string[] {
  try {
    const value: unknown = JSON.parse(readItem(INDEX_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function persist(rideId: string, list: Invitee[]): void {
  const index = readIndex().filter((id) => id !== rideId);
  if (list.length === 0) {
    writeItem(listKey(rideId), null);
  } else {
    writeItem(listKey(rideId), JSON.stringify(list));
    index.push(rideId);
  }
  writeItem(INDEX_KEY, JSON.stringify(index));
}

let counter = 0;
const newId = () => `${Date.now().toString(36)}${(counter++).toString(36)}`;

interface InviteState {
  byRide: Record<string, Invitee[]>;
  /** Reads a ride's list from storage into memory (idempotent). */
  load: (rideId: string) => Invitee[];
  /** Adds a number we just opened the SMS app for. Returns false for a duplicate. */
  add: (rideId: string, entry: { name: string; phone: string }) => boolean;
  remove: (rideId: string, id: string) => void;
  /** Runs the first-name match; returns invitees that just became Joined. */
  applyMatches: (rideId: string, members: MatchMember[], myUserId: string | null) => Invitee[];
  /** Drops lists of rides that ended more than 24 h ago and lists nobody touched for a week. */
  purge: (endedAtMs: Record<string, number>) => void;
}

export const useInviteStore = create<InviteState>((set, get) => ({
  byRide: {},
  load: (rideId) => {
    const existing = get().byRide[rideId];
    if (existing) return existing;
    const list = parseInvitees(readItem(listKey(rideId)));
    set((s) => ({ byRide: { ...s.byRide, [rideId]: list } }));
    return list;
  },
  add: (rideId, entry) => {
    const current = get().load(rideId);
    const next = addInvitee(current, entry, Date.now(), newId());
    if (!next) return false;
    persist(rideId, next);
    set((s) => ({ byRide: { ...s.byRide, [rideId]: next } }));
    return true;
  },
  remove: (rideId, id) => {
    const next = get()
      .load(rideId)
      .filter((i) => i.id !== id);
    persist(rideId, next);
    set((s) => ({ byRide: { ...s.byRide, [rideId]: next } }));
  },
  applyMatches: (rideId, members, myUserId) => {
    const current = get().load(rideId);
    if (current.length === 0) return NO_INVITEES;
    const next = matchInvitees(current, members, myUserId);
    if (next === current) return NO_INVITEES;
    persist(rideId, next);
    set((s) => ({ byRide: { ...s.byRide, [rideId]: next } }));
    const before = new Set(current.filter((i) => i.matchedUserId).map((i) => i.id));
    return next.filter((i) => i.matchedUserId && !before.has(i.id));
  },
  purge: (endedAtMs) => {
    const now = Date.now();
    const keep: Record<string, Invitee[]> = {};
    for (const rideId of readIndex()) {
      const list = parseInvitees(readItem(listKey(rideId)));
      if (shouldPurge(list, endedAtMs[rideId] ?? null, now)) {
        writeItem(listKey(rideId), null);
        continue;
      }
      keep[rideId] = list;
    }
    writeItem(INDEX_KEY, JSON.stringify(Object.keys(keep)));
    set((s) => {
      const byRide: Record<string, Invitee[]> = {};
      for (const [rideId, list] of Object.entries(s.byRide)) if (rideId in keep) byRide[rideId] = list;
      return { byRide };
    });
  },
}));
