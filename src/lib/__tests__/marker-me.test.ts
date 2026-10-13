import {
  CONE_MIN_SPEED_MPS,
  coneRotation,
  HALO_MAX_DP,
  HALO_MIN_DP,
  HALO_UNKNOWN_DP,
  haloDiameterDp,
  metersPerDp,
} from '../marker-style';

describe('metersPerDp', () => {
  it('halves with each zoom level and shrinks away from the equator', () => {
    expect(metersPerDp(0, 10) / metersPerDp(0, 11)).toBeCloseTo(2, 6);
    expect(metersPerDp(60, 12)).toBeCloseTo(metersPerDp(0, 12) / 2, 3);
  });
});

describe('haloDiameterDp', () => {
  it('is a fixed size when accuracy is unknown or invalid', () => {
    expect(haloDiameterDp(null, 12, 14)).toBe(HALO_UNKNOWN_DP);
    expect(haloDiameterDp(0, 12, 14)).toBe(HALO_UNKNOWN_DP);
    expect(haloDiameterDp(Number.NaN, 12, 14)).toBe(HALO_UNKNOWN_DP);
  });

  it('is clamped to 40..160 dp', () => {
    expect(haloDiameterDp(1, 12, 10)).toBe(HALO_MIN_DP); // tiny at low zoom
    expect(haloDiameterDp(5000, 12, 17)).toBe(HALO_MAX_DP); // huge at high zoom
  });

  it('scales with accuracy and zoom in between', () => {
    const near = haloDiameterDp(30, 12.9, 16);
    const far = haloDiameterDp(30, 12.9, 17);
    expect(far).toBeGreaterThan(near);
    expect(near).toBeGreaterThanOrEqual(HALO_MIN_DP);
    expect(far).toBeLessThanOrEqual(HALO_MAX_DP);
  });
});

describe('coneRotation', () => {
  it('needs a heading and at least 3 km/h', () => {
    expect(coneRotation(null, 10)).toBeNull();
    expect(coneRotation(90, null)).toBeNull();
    expect(coneRotation(90, CONE_MIN_SPEED_MPS - 0.01)).toBeNull();
    expect(coneRotation(Number.NaN, 10)).toBeNull();
  });
  it('normalises the heading', () => {
    expect(coneRotation(90, 5)).toBe(90);
    expect(coneRotation(-90, 5)).toBe(270);
    expect(coneRotation(450, 5)).toBe(90);
  });
});
