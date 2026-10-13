import { buildTrail, type LatLng } from '../geo';
import { splitTrailAt, trimRouteAt } from '../trail-split';

const M_PER_DEG = (6_371_008.8 * Math.PI) / 180;
const pt = (m: number, eastM = 0): LatLng => ({ lat: m / M_PER_DEG, lng: eastM / M_PER_DEG });
const trail = buildTrail(Array.from({ length: 41 }, (_, i) => pt(i * 50)).map((p, i) => ({ ...p, t: i * 1000 })));

describe('splitTrailAt', () => {
  it('splits in the middle and shares the projected point', () => {
    const { behind, ahead } = splitTrailAt(trail, pt(1030, 20));
    expect(behind[behind.length - 1]).toEqual(ahead[0]);
    expect(behind[behind.length - 1].lat * M_PER_DEG).toBeCloseTo(1030, 0);
    expect(behind[0]).toEqual(trail.points[0]);
    expect(ahead[ahead.length - 1]).toEqual(trail.points[40]);
    expect(behind).toHaveLength(22); // 21 points up to 1000 m, plus the split
    expect(ahead).toHaveLength(21); // the split plus 20 points from 1050 m
  });

  it('leader at the head: everything behind', () => {
    const r = splitTrailAt(trail, pt(2000));
    expect(r.ahead).toEqual([]);
    expect(r.behind).toHaveLength(41);
    expect(splitTrailAt(trail, pt(2040)).ahead).toEqual([]);
  });

  it('leader on an out-and-back road: everything behind, even where an earlier pass is nearest', () => {
    // Out 2 km and back to 500 m: the leader is beside the outbound segment at 500 m.
    const outAndBack = buildTrail(
      [...Array.from({ length: 41 }, (_, i) => pt(i * 50)), ...Array.from({ length: 30 }, (_, i) => pt(1950 - i * 50, 10))].map(
        (p, i) => ({ ...p, t: i * 1000 }),
      ),
    );
    const r = splitTrailAt(outAndBack, pt(500, 10), true);
    expect(r.ahead).toEqual([]);
    expect(r.behind).toHaveLength(outAndBack.points.length);
  });

  it('trimRouteAt drops the part of my route already ridden', () => {
    const route = Array.from({ length: 41 }, (_, i) => pt(i * 50));
    const cut = trimRouteAt(route, pt(1030, 15));
    expect(cut[0].lat * M_PER_DEG).toBeCloseTo(1030, 0);
    expect(cut[cut.length - 1]).toEqual(route[40]);
    expect(trimRouteAt(route, pt(1030, 400))).toBe(route); // off route: keep until re-routed
    expect(trimRouteAt(route, null)).toBe(route);
  });

  it('me before the start: everything ahead', () => {
    const r = splitTrailAt(trail, pt(-30));
    expect(r.behind).toEqual([]);
    expect(r.ahead).toHaveLength(41);
  });

  it('off route or no position: whole trail ahead', () => {
    expect(splitTrailAt(trail, pt(1000, 400)).behind).toEqual([]);
    expect(splitTrailAt(trail, pt(1000, 400)).ahead).toHaveLength(41);
    expect(splitTrailAt(trail, null).ahead).toHaveLength(41);
  });

  it('empty and single-point trails', () => {
    expect(splitTrailAt(buildTrail([]), pt(0))).toEqual({ behind: [], ahead: [] });
    const one = buildTrail([{ ...pt(0), t: 0 }]);
    expect(splitTrailAt(one, pt(0)).behind).toEqual([]);
    expect(splitTrailAt(one, pt(0)).ahead).toHaveLength(1);
  });
});
