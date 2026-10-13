import {
  clusterRiders,
  drawOrder,
  nudgeFromSos,
  projectDp,
  SOS_CLEAR_DP,
  unprojectDp,
  type ClusterRider,
} from '../marker-cluster';

const M_PER_DEG = 111_320;
const at = (eastM: number, northM = 0) => ({ lat: northM / M_PER_DEG, lng: eastM / M_PER_DEG });
const rider = (userId: string, eastM: number, status: ClusterRider['status'] = 'moving', isMe = false): ClusterRider => ({
  userId,
  status,
  isMe,
  ...at(eastM),
});

const dpBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }, zoom: number) => {
  const p = projectDp(a.lat, a.lng, zoom);
  const q = projectDp(b.lat, b.lng, zoom);
  return Math.hypot(p.x - q.x, p.y - q.y);
};

describe('unprojectDp', () => {
  it('inverts projectDp', () => {
    const p = projectDp(12.97, 77.59, 15);
    const back = unprojectDp(p.x, p.y, 15);
    expect(back.lat).toBeCloseTo(12.97, 6);
    expect(back.lng).toBeCloseTo(77.59, 6);
  });
});

describe('nudgeFromSos', () => {
  const zoom = 17; // ~0.6 m per dp

  it('pushes a rider that sits on or beside the SOS marker clear of it', () => {
    const sos = rider('sos', 0, 'sos');
    const near = rider('priya', 8); // ~13 dp east
    const items = nudgeFromSos(clusterRiders([sos, near], zoom), zoom);
    const moved = items.find((i) => i.kind === 'single' && i.rider.userId === 'priya');
    if (!moved || moved.kind !== 'single') throw new Error('rider missing');
    expect(dpBetween(moved.rider, sos, zoom)).toBeGreaterThanOrEqual(SOS_CLEAR_DP - 0.5);
  });

  it('separates a rider exactly on top of the SOS marker', () => {
    const items = nudgeFromSos(clusterRiders([rider('sos', 0, 'sos'), rider('on-top', 0)], zoom), zoom);
    const moved = items.find((i) => i.kind === 'single' && i.rider.userId === 'on-top');
    if (!moved || moved.kind !== 'single') throw new Error('rider missing');
    expect(dpBetween(moved.rider, rider('sos', 0), zoom)).toBeGreaterThanOrEqual(SOS_CLEAR_DP - 0.5);
  });

  it('never moves the SOS marker, me, or riders that are already clear', () => {
    const sos = rider('sos', 0, 'sos');
    const me = rider('me', 5, 'moving', true);
    const far = rider('far', 200);
    const items = nudgeFromSos(clusterRiders([sos, me, far], zoom), zoom);
    const find = (id: string) => {
      const i = items.find((x) => x.kind === 'single' && x.rider.userId === id);
      if (!i || i.kind !== 'single') throw new Error(id);
      return i.rider;
    };
    expect(find('sos')).toEqual(sos);
    expect(find('me')).toEqual(me);
    expect(find('far')).toEqual(far);
  });

  it('moves a cluster too, and does nothing without an SOS', () => {
    const a = rider('a', 6);
    const b = rider('b', 9);
    const clustered = clusterRiders([rider('sos', 0, 'sos'), a, b], zoom);
    const out = nudgeFromSos(clustered, zoom);
    const cluster = out.find((i) => i.kind === 'cluster');
    if (!cluster || cluster.kind !== 'cluster') throw new Error('cluster missing');
    expect(dpBetween(cluster, rider('sos', 0), zoom)).toBeGreaterThanOrEqual(SOS_CLEAR_DP - 0.5);

    const calm = clusterRiders([a, b], zoom);
    expect(nudgeFromSos(calm, zoom)).toBe(calm);
  });
});

describe('drawOrder', () => {
  it('draws SOS last (on top), after me and everyone else', () => {
    const order = drawOrder(
      [rider('sos', 0, 'sos'), rider('me', 300, 'moving', true), rider('priya', 600), rider('arun', 900)],
      15,
    );
    const ids = order.map((i) => (i.kind === 'single' ? i.rider.userId : 'cluster'));
    expect(ids[ids.length - 1]).toBe('sos');
    expect(ids.indexOf('me')).toBeGreaterThan(ids.indexOf('priya'));
    expect(ids.indexOf('sos')).toBeGreaterThan(ids.indexOf('me'));
  });

  it('keeps an SOS rider uncovered when another rider is within 36 dp', () => {
    const zoom = 16;
    const order = drawOrder([rider('priya', 10), rider('sos', 0, 'sos')], zoom);
    const pts = order.flatMap((i) => (i.kind === 'single' ? [i.rider] : []));
    const sos = pts.find((p) => p.userId === 'sos')!;
    const priya = pts.find((p) => p.userId === 'priya')!;
    expect(dpBetween(sos, priya, zoom)).toBeGreaterThanOrEqual(SOS_CLEAR_DP - 0.5);
    expect(pts[pts.length - 1].userId).toBe('sos');
  });
});
