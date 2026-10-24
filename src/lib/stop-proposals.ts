// Pure reducer for the shared next stop (docs/design/19 section A). Proposals are ride_events;
// no React, no store, so it is unit-tested.
import { t } from '@/lib/copy';
import { firstName } from '@/lib/names';
import { asPlaceCategory, type PlaceCategory } from '@/lib/place-search';
import type { EventRow, StopKind } from '@/lib/ride-api';

export interface StopPayload {
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  kind: StopKind;
  /** Null when the proposer's app sent none. */
  category: PlaceCategory | null;
}

export interface PendingProposal {
  /** Id of the `stop_proposed` event: pass it to decideStop. */
  id: number;
  userId: string;
  createdAt: string;
  stop: StopPayload;
}

export interface StopNotice {
  /** Changes on every notice so the UI can react to two identical ones in a row. */
  nonce: number;
  kind: 'set' | 'accepted' | 'declined' | 'cleared';
  /** Ready-to-show toast text. */
  text: string;
}

function asObject(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Reads a stop_proposed / stop_set payload; null when a field is missing or invalid. */
export function parseStopPayload(payload: unknown): StopPayload | null {
  const p = asObject(payload);
  const { name, address, lat, lng, kind, category } = p;
  if (typeof name !== 'string' || !name.trim()) return null;
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (kind !== 'break' && kind !== 'destination') return null;
  return { name, address: typeof address === 'string' && address ? address : null, lat, lng, kind, category: asPlaceCategory(category) };
}

function proposalIdOf(e: EventRow): number | null {
  const id = asObject(e.payload).proposal_id;
  return typeof id === 'number' ? id : null;
}

/**
 * Newest `stop_proposed` per proposer that was not accepted (`stop_set` with its proposal_id),
 * declined, or superseded by a newer proposal from the same rider. Newest first. Event order in
 * `events` does not matter (ids are sequential).
 */
export function derivePendingProposals(events: readonly EventRow[]): PendingProposal[] {
  const sorted = [...events].sort((a, b) => a.id - b.id);
  const newestByUser = new Map<string, PendingProposal>();
  const decided = new Set<number>();
  for (const e of sorted) {
    if (e.type === 'stop_proposed' && e.user_id) {
      const stop = parseStopPayload(e.payload);
      if (stop) newestByUser.set(e.user_id, { id: e.id, userId: e.user_id, createdAt: e.created_at, stop });
    } else if (e.type === 'stop_set' || e.type === 'stop_declined') {
      const id = proposalIdOf(e);
      if (id !== null) decided.add(id);
    }
  }
  return [...newestByUser.values()].filter((p) => !decided.has(p.id)).sort((a, b) => b.id - a.id);
}

/**
 * Folds one live event into the pending list without needing the (capped) event history, so a
 * proposal never drops out just because 50 newer events arrived. Same rules as derivePendingProposals.
 */
export function applyEventToProposals(pending: readonly PendingProposal[], e: EventRow): PendingProposal[] {
  if (e.type === 'stop_proposed' && e.user_id) {
    const stop = parseStopPayload(e.payload);
    if (!stop) return [...pending];
    const rest = pending.filter((p) => p.userId !== e.user_id && p.id !== e.id);
    return [{ id: e.id, userId: e.user_id, createdAt: e.created_at, stop }, ...rest].sort((a, b) => b.id - a.id);
  }
  if (e.type === 'stop_set' || e.type === 'stop_declined') {
    const id = proposalIdOf(e);
    return id === null ? [...pending] : pending.filter((p) => p.id !== id);
  }
  return [...pending];
}

export interface NoticeContext {
  myUserId: string | null;
  /** Display name for a user id (first name is taken here). */
  nameOf: (userId: string | null) => string;
}

let nextNonce = 1;

/**
 * The toast a LIVE event should cause for me, or null. Call for broadcast events only, never for the
 * initial snapshot (old decisions must not toast again).
 */
export function noticeForEvent(e: EventRow, ctx: NoticeContext): StopNotice | null {
  const p = asObject(e.payload);
  const byMe = !!ctx.myUserId && e.user_id === ctx.myUserId;
  const who = firstName(ctx.nameOf(e.user_id));
  const mine = (key: string) => !!ctx.myUserId && p[key] === ctx.myUserId;
  const make = (kind: StopNotice['kind'], text: string): StopNotice => ({ nonce: nextNonce++, kind, text });

  if (e.type === 'stop_set') {
    if (byMe) return null; // the leader just did it
    const stop = parseStopPayload(p);
    if (mine('proposed_by')) return make('accepted', t('stop.toastAccepted', { name: who }));
    return stop ? make('set', t('stop.toastSet', { name: stop.name })) : null;
  }
  if (e.type === 'stop_declined') {
    return mine('proposed_by') && !byMe ? make('declined', t('stop.toastDeclined', { name: who })) : null;
  }
  if (e.type === 'stop_cleared') return byMe ? null : make('cleared', t('stop.toastCleared'));
  return null;
}
