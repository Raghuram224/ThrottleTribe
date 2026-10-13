import type { EventRow } from '../ride-api';
import { applyEventToProposals, derivePendingProposals, noticeForEvent, parseStopPayload } from '../stop-proposals';

const stop = (name: string) => ({ name, address: 'MG Road', lat: 12.9, lng: 77.5, kind: 'break' });
let n = 0;
function ev(type: string, userId: string | null, payload: Record<string, unknown> = {}, id = ++n): EventRow {
  return { id, ride_id: 'r1', user_id: userId, type, payload: payload as EventRow['payload'], created_at: '2026-01-01T00:00:00Z' };
}

describe('parseStopPayload', () => {
  it('accepts a valid payload and nulls an empty address', () => {
    expect(parseStopPayload({ ...stop('Cafe'), address: '' })).toEqual({
      name: 'Cafe', address: null, lat: 12.9, lng: 77.5, kind: 'break',
    });
  });
  it('rejects bad name, coordinates and kind', () => {
    expect(parseStopPayload({ ...stop(' ') })).toBeNull();
    expect(parseStopPayload({ ...stop('x'), lat: 'a' })).toBeNull();
    expect(parseStopPayload({ ...stop('x'), kind: 'home' })).toBeNull();
    expect(parseStopPayload(null)).toBeNull();
  });
});

describe('derivePendingProposals', () => {
  it('keeps only the newest proposal per rider, newest first', () => {
    const a1 = ev('stop_proposed', 'priya', stop('A1'), 1);
    const b1 = ev('stop_proposed', 'karthik', stop('B1'), 2);
    const a2 = ev('stop_proposed', 'priya', stop('A2'), 3);
    const out = derivePendingProposals([a2, b1, a1]); // order of input does not matter
    expect(out.map((p) => [p.id, p.userId, p.stop.name])).toEqual([
      [3, 'priya', 'A2'],
      [2, 'karthik', 'B1'],
    ]);
  });
  it('removes accepted and declined proposals', () => {
    const p1 = ev('stop_proposed', 'priya', stop('A'), 10);
    const p2 = ev('stop_proposed', 'karthik', stop('B'), 11);
    const p3 = ev('stop_proposed', 'meena', stop('C'), 12);
    const set = ev('stop_set', 'arun', { ...stop('A'), proposal_id: 10, proposed_by: 'priya' }, 13);
    const dec = ev('stop_declined', 'arun', { proposal_id: 11 }, 14);
    expect(derivePendingProposals([p1, p2, p3, set, dec]).map((p) => p.id)).toEqual([12]);
  });
  it('a decision of an old proposal does not hide the newer one', () => {
    const old = ev('stop_proposed', 'priya', stop('A'), 20);
    const set = ev('stop_set', 'arun', { ...stop('A'), proposal_id: 20 }, 21);
    const fresh = ev('stop_proposed', 'priya', stop('B'), 22);
    expect(derivePendingProposals([old, set, fresh]).map((p) => p.id)).toEqual([22]);
  });
  it('a leader direct stop_set (null proposal_id) leaves proposals pending', () => {
    const p = ev('stop_proposed', 'priya', stop('A'), 30);
    const direct = ev('stop_set', 'arun', { ...stop('Z'), proposal_id: null }, 31);
    expect(derivePendingProposals([p, direct]).map((x) => x.id)).toEqual([30]);
  });
  it('ignores malformed proposals', () => {
    expect(derivePendingProposals([ev('stop_proposed', 'priya', { name: 'x' }, 40)])).toEqual([]);
  });
});

describe('applyEventToProposals', () => {
  it('matches derivePendingProposals when folded event by event', () => {
    const events = [
      ev('stop_proposed', 'priya', stop('A1'), 50),
      ev('stop_proposed', 'karthik', stop('B'), 51),
      ev('stop_proposed', 'priya', stop('A2'), 52),
      ev('stop_declined', 'arun', { proposal_id: 51 }, 53),
    ];
    const folded = events.reduce<ReturnType<typeof derivePendingProposals>>((acc, e) => applyEventToProposals(acc, e), []);
    expect(folded).toEqual(derivePendingProposals(events));
    expect(folded.map((p) => p.id)).toEqual([52]);
  });
});

describe('noticeForEvent', () => {
  const names: Record<string, string> = { arun: 'Arun Kumar', priya: 'Priya', me: 'Me' };
  const ctx = (myUserId: string) => ({ myUserId, nameOf: (id: string | null) => (id ? names[id] : '') ?? 'Rider' });

  it('tells everyone else about a new stop', () => {
    const e = ev('stop_set', 'arun', { ...stop('Cafe Coffee Day'), proposal_id: null, proposed_by: 'arun' });
    expect(noticeForEvent(e, ctx('priya'))?.text).toBe('Next stop: Cafe Coffee Day');
  });
  it('is silent for the leader who set it', () => {
    const e = ev('stop_set', 'arun', { ...stop('X'), proposal_id: 1, proposed_by: 'priya' });
    expect(noticeForEvent(e, ctx('arun'))).toBeNull();
  });
  it('tells the proposer it was accepted or declined, by the leader first name', () => {
    const acc = ev('stop_set', 'arun', { ...stop('X'), proposal_id: 1, proposed_by: 'priya' });
    expect(noticeForEvent(acc, ctx('priya'))).toMatchObject({ kind: 'accepted', text: 'Arun accepted your stop' });
    const dec = ev('stop_declined', 'arun', { proposal_id: 1, proposed_by: 'priya' });
    expect(noticeForEvent(dec, ctx('priya'))).toMatchObject({ kind: 'declined', text: 'Arun declined your stop' });
    expect(noticeForEvent(dec, ctx('me'))).toBeNull();
  });
  it('announces a cleared stop to others and gives each notice a new nonce', () => {
    const e = ev('stop_cleared', 'arun');
    const a = noticeForEvent(e, ctx('priya'));
    const b = noticeForEvent(e, ctx('priya'));
    expect(a?.kind).toBe('cleared');
    expect(a?.nonce).not.toBe(b?.nonce);
    expect(noticeForEvent(e, ctx('arun'))).toBeNull();
  });
  it('ignores unrelated events', () => {
    expect(noticeForEvent(ev('message', 'arun', { kind: 'fuel' }), ctx('priya'))).toBeNull();
  });
});
