import { meCoversCluster } from '../marker-cluster';

const M_PER_DEG = 111_320;
const at = (eastM: number, northM = 0) => ({ lat: northM / M_PER_DEG, lng: eastM / M_PER_DEG });

describe('meCoversCluster', () => {
  // At zoom 17 one dp is about 0.6 m on the ground.
  it('is true when my dot is inside the cluster radius', () => {
    expect(meCoversCluster(at(0), at(0), 17)).toBe(true);
    expect(meCoversCluster(at(0), at(10), 17)).toBe(true); // ~17 dp
  });

  it('is false when my dot is clear of the cluster', () => {
    expect(meCoversCluster(at(0), at(40), 17)).toBe(false); // ~67 dp
  });

  it('depends on zoom: the same 40 m gap overlaps when zoomed out', () => {
    expect(meCoversCluster(at(0), at(40), 14)).toBe(true); // ~8 dp
  });

  it('is false without my position', () => {
    expect(meCoversCluster(at(0), null, 17)).toBe(false);
  });
});
