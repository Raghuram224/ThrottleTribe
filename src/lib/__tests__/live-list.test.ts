import { buildTrail } from '../geo';
import {
  applyOrder,
  buildLiveList,
  floorToMinute,
  mapHeightFor,
  offsetOf,
  phraseFor,
  rowA11y,
  rowLine1,
  type LiveMember,
} from '../live-list';
import type { RiderStatusResult } from '../rider-status';

// A straight north-south route: `at(km)` is a point km along it.
const at = (km: number) => ({ lat: km / 111.195, lng: 0 });
const trail = buildTrail(Array.from({ length: 41 }, (_, i) => at(i)));
const noTrail = buildTrail([at(0)]);

const member = (userId: string, name: string, extra: Partial<LiveMember> = {}): LiveMember => ({
  userId,
  name,
  colorIndex: 0,
  role: 'rider',
  sos: false,
  sosAt: null,
  leftAt: null,
  ...extra,
});
const moving: RiderStatusResult = { status: 'moving', sinceMs: null };

function keys(items: { key: string }[]) {
  return items.map((i) => i.key);
}

describe('buildLiveList ordering', () => {
  const members = [member('me', 'Me'), member('a', 'Arun'), member('s', 'Sam'), member('p', 'Priya')];

  it('orders by distance along the trail with me in place', () => {
    const items = buildLiveList({
      members,
      positions: { me: at(10), a: at(15), s: at(10.05), p: at(5) },
      statuses: { a: moving, s: moving, p: moving },
      trail,
      myUserId: 'me',
    });
    // Sam is within 100 m of me (level): me first inside the tie group.
    expect(keys(items)).toEqual(['a', 'me', 's', 'p']);
  });

  it('pins SOS riders first, newest SOS first', () => {
    const items = buildLiveList({
      members: [
        member('me', 'Me'),
        member('a', 'Arun', { sos: true, sosAt: '2026-01-01T10:00:00Z' }),
        member('p', 'Priya', { sos: true, sosAt: '2026-01-01T10:05:00Z' }),
      ],
      positions: { me: at(10), a: at(20), p: at(2) },
      statuses: { a: { status: 'sos', sinceMs: 1 }, p: { status: 'sos', sinceMs: 1 } },
      trail,
      myUserId: 'me',
    });
    expect(keys(items)).toEqual(['p', 'a', 'me']);
  });

  it('puts off-route riders under a label by distance, never-seen last', () => {
    const items = buildLiveList({
      members: [...members, member('j', 'Jo'), member('z', 'Zed')],
      positions: {
        me: at(10),
        a: at(15),
        s: at(5),
        p: { lat: 1, lng: 1 }, // far off the trail
        j: { lat: 0.2, lng: 0.2 }, // closer than Priya, still off route
      },
      statuses: { a: moving, s: moving, p: moving, j: moving },
      trail,
      myUserId: 'me',
    });
    expect(keys(items)).toEqual(['a', 'me', 's', 'label', 'j', 'p', 'z']);
  });

  it('with fewer than 2 trail points everyone is away: sorted by distance, no label', () => {
    const items = buildLiveList({
      members,
      positions: { me: at(0), a: at(3), s: at(1), p: at(2) },
      statuses: { a: moving, s: moving, p: moving },
      trail: noTrail,
      myUserId: 'me',
    });
    expect(keys(items)).toEqual(['me', 's', 'p', 'a']);
  });

  it('me off the trail stays on top and everyone is away', () => {
    const items = buildLiveList({
      members,
      positions: { me: { lat: 0.5, lng: 0.5 }, a: at(15), s: at(10), p: at(5) },
      statuses: { a: moving, s: moving, p: moving },
      trail,
      myUserId: 'me',
    });
    expect(items[0].key).toBe('me');
    expect(items.some((i) => i.kind === 'rider' && i.rel?.kind !== 'away')).toBe(false);
  });

  it('shows an info row and no distances without my position', () => {
    const items = buildLiveList({
      members,
      positions: { a: at(15), s: at(10) },
      statuses: { a: moving, s: moving },
      trail,
      myUserId: 'me',
    });
    expect(items[0].kind).toBe('noFix');
    const rider = items.find((i) => i.key === 'a');
    expect(rider && rider.kind === 'rider' && rider.rel).toBeNull();
  });

  it('skips riders who left', () => {
    const items = buildLiveList({
      members: [member('me', 'Me'), member('a', 'Arun', { leftAt: '2026-01-01T10:00:00Z' })],
      positions: { me: at(1), a: at(2) },
      statuses: {},
      trail,
      myUserId: 'me',
    });
    expect(keys(items)).toEqual(['me']);
  });
});

describe('applyOrder', () => {
  it('keeps the frozen order and appends new rows', () => {
    const items = buildLiveList({
      members: [member('me', 'Me'), member('a', 'Arun'), member('b', 'Bo'), member('c', 'Cy')],
      positions: { me: at(10), a: at(15), b: at(5), c: at(20) },
      statuses: { a: moving, b: moving, c: moving },
      trail,
      myUserId: 'me',
    });
    expect(keys(items)).toEqual(['c', 'a', 'me', 'b']);
    expect(keys(applyOrder(items, ['b', 'me', 'a']))).toEqual(['b', 'me', 'a', 'c']);
  });
});

describe('row text', () => {
  const ahead = { kind: 'ahead' as const, distanceM: 4200 };

  it('formats line 1 per kind', () => {
    expect(rowLine1(ahead, true, false)).toEqual({ text: '4.2 km ahead', muted: false });
    expect(rowLine1({ kind: 'level', distanceM: 20 }, true, false).text).toBe('With you');
    expect(rowLine1({ kind: 'away', distanceM: 3100 }, true, false).text).toBe('3.1 km away');
    expect(rowLine1(null, false, false)).toEqual({ text: 'No location yet', muted: true });
    expect(rowLine1(null, true, false).text).toBe('—');
  });

  it('offline or viewer offline: ≈ prefix and muted', () => {
    expect(rowLine1({ kind: 'away', distanceM: 3100 }, true, true)).toEqual({ text: '≈3.1 km away', muted: true });
    expect(rowLine1({ kind: 'level', distanceM: 10 }, true, true).text).toBe('With you');
  });

  it('builds the spoken label', () => {
    expect(
      rowA11y({
        name: 'Priya',
        line1: '4.2 km behind',
        hasPosition: true,
        status: 'stopped',
        sinceMs: 6 * 60_000,
        leader: false,
      }),
    ).toBe('Priya, 4.2 kilometres behind, stopped 6 minutes');
    expect(
      rowA11y({
        name: 'Jo',
        line1: '≈3.1 km away',
        hasPosition: true,
        status: 'offline',
        sinceMs: 4 * 60_000,
        leader: true,
      }),
    ).toBe('Jo, no signal, last seen 4 minutes ago, about 3.1 kilometres away, leader');
  });

  it('floors to whole minutes and computes offsets', () => {
    expect(floorToMinute(125_000)).toBe(120_000);
    expect(floorToMinute(null)).toBeNull();
    expect(
      offsetOf(
        [
          { kind: 'noFix', key: 'noFix' },
          { kind: 'me', key: 'me' },
          { kind: 'label', key: 'label' },
        ],
        2,
      ),
    ).toBe(56 + 56);
  });

  it('map height: 40-55 % of the area, filling what the list does not need', () => {
    expect(mapHeightFor(600, 100)).toBe(360); // capped at 60 %
    expect(mapHeightFor(600, 330)).toBe(270);
    expect(mapHeightFor(600, 500)).toBe(210); // many riders: floor of 35 %, list scrolls
    expect(mapHeightFor(600, 0)).toBe(360);
  });

  it('level hysteresis through the list: a rider at 120 m keeps "With you" once level', () => {
    const members = [member('me', 'Me'), member('a', 'Arun')];
    const memory = new Set<string>();
    const rel = (aKm: number) => {
      const item = buildLiveList({
        members,
        positions: { me: at(10), a: at(aKm) },
        statuses: { a: moving },
        trail,
        myUserId: 'me',
        levelMemory: memory,
      }).find((i) => i.key === 'a');
      return item && item.kind === 'rider' ? item.rel?.kind : undefined;
    };
    expect(rel(10.12)).toBe('ahead'); // 120 m, never level so far
    expect(rel(10.05)).toBe('level'); // 50 m
    expect(rel(10.12)).toBe('level'); // 120 m, but already level
    expect(rel(10.16)).toBe('ahead'); // 160 m: out
    expect(rel(10.12)).toBe('ahead'); // and 120 m is not enough to get back in
  });

  it('phraseFor needs both positions', () => {
    expect(phraseFor(trail, undefined, at(1))).toBeNull();
    expect(phraseFor(trail, at(10), at(15))).toBe('5.0 km ahead');
  });
});
