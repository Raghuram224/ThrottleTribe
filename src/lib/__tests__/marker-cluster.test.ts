import {
  CLUSTER_DP,
  clusterRiders,
  projectDp,
  spreadDp,
  worstStatus,
  type ClusterRider,
} from '../marker-cluster';

// One metre of latitude/longitude near the equator.
const M_PER_DEG = 111_320;
const rider = (
  userId: string,
  eastM: number,
  northM = 0,
  extra: Partial<ClusterRider> = {},
): ClusterRider => ({
  userId,
  lat: northM / M_PER_DEG,
  lng: eastM / M_PER_DEG,
  status: 'moving',
  isMe: false,
  ...extra,
});

describe('projectDp', () => {
  it('doubles per zoom level and puts 0,0 at the world centre', () => {
    const a = projectDp(0, 0, 10);
    expect(a.x).toBeCloseTo(512 * 2 ** 10 * 0.5, 3);
    expect(a.y).toBeCloseTo(512 * 2 ** 10 * 0.5, 3);
    expect(projectDp(0, 90, 11).x).toBeCloseTo(2 * projectDp(0, 90, 10).x, 3);
  });
});

describe('clusterRiders', () => {
  // At zoom 17 one metre is about 1.67 dp on the equator, so 44 dp is about 26 m.
  const Z = 17;

  it('groups riders closer than 44 dp and keeps the far ones single', () => {
    const items = clusterRiders([rider('a', 0), rider('b', 10), rider('c', 15), rider('d', 400)], Z);
    expect(items.map((i) => i.kind)).toEqual(['cluster', 'single']);
    const cluster = items[0];
    if (cluster.kind !== 'cluster') throw new Error('expected a cluster');
    expect(cluster.members.map((m) => m.userId)).toEqual(['a', 'b', 'c']);
    expect(cluster.id).toBe('cluster:a+b+c');
  });

  it('declusters when zoomed in (same riders, more dp apart)', () => {
    const riders = [rider('a', 0), rider('b', 10)];
    expect(clusterRiders(riders, 15).map((i) => i.kind)).toEqual(['cluster']);
    expect(clusterRiders(riders, 20).map((i) => i.kind)).toEqual(['single', 'single']);
  });

  it('the threshold is strict: exactly 44 dp apart does not merge', () => {
    // Two points exactly CLUSTER_DP apart horizontally at zoom 10.
    const dpPerDeg = (512 * 2 ** 10) / 360;
    const a: ClusterRider = { userId: 'a', lat: 0, lng: 0, status: 'moving', isMe: false };
    const b: ClusterRider = { ...a, userId: 'b', lng: CLUSTER_DP / dpPerDeg };
    expect(clusterRiders([a, b], 10).map((i) => i.kind)).toEqual(['single', 'single']);
    expect(clusterRiders([a, { ...b, lng: (CLUSTER_DP - 1) / dpPerDeg }], 10).map((i) => i.kind)).toEqual([
      'cluster',
    ]);
  });

  it('never clusters an SOS rider, even on top of others', () => {
    const items = clusterRiders(
      [rider('a', 0), rider('s', 1, 0, { status: 'sos' }), rider('b', 2)],
      Z,
    );
    const kinds = items.map((i) => (i.kind === 'single' ? `single:${i.rider.userId}` : 'cluster'));
    expect(kinds).toEqual(['cluster', 'single:s']);
    const cluster = items.find((i) => i.kind === 'cluster');
    expect(cluster && cluster.kind === 'cluster' && cluster.members.map((m) => m.userId)).toEqual(['a', 'b']);
  });

  it('keeps me separate, never absorbed into a cluster', () => {
    const items = clusterRiders([rider('a', 0), rider('me', 1, 0, { isMe: true }), rider('b', 2)], Z);
    const me = items.find((i) => i.kind === 'single' && i.rider.isMe);
    expect(me).toBeDefined();
    expect(items.filter((i) => i.kind === 'cluster')).toHaveLength(1);
    // Lone neighbour of me stays a single too.
    const alone = clusterRiders([rider('a', 0), rider('me', 1, 0, { isMe: true })], Z);
    expect(alone.every((i) => i.kind === 'single')).toBe(true);
  });

  it('cluster ring uses the worst member status', () => {
    const items = clusterRiders(
      [rider('a', 0), rider('b', 1, 0, { status: 'offline' }), rider('c', 2, 0, { status: 'stopped' })],
      Z,
    );
    const c = items[0];
    expect(c.kind === 'cluster' && c.worst).toBe('offline');
    expect(worstStatus(['moving', 'stopped'])).toBe('stopped');
    expect(worstStatus(['stopped', 'offline', 'sos'])).toBe('sos');
    expect(worstStatus(['moving'])).toBe('moving');
    expect(worstStatus([])).toBe('moving');
  });

  it('handles no riders', () => {
    expect(clusterRiders([], Z)).toEqual([]);
  });
});

describe('spreadDp', () => {
  it('is the largest pairwise distance at the zoom', () => {
    const members = [rider('a', 0), rider('b', 3)];
    expect(spreadDp(members, 18)).toBeLessThan(CLUSTER_DP); // same spot even at max zoom
    expect(spreadDp([rider('a', 0), rider('b', 100)], 18)).toBeGreaterThan(CLUSTER_DP);
    expect(spreadDp([rider('a', 0)], 18)).toBe(0);
  });
});
