import {
  buildConvoy,
  CONVOY_MIN_SPAN_M,
  CONVOY_PAD_DP,
  convoyA11y,
  formatOffset,
  layoutConvoy,
  scaleFor,
  spreadLabel,
  type ConvoyRider,
} from '../convoy';
import { buildTrail } from '../geo';

const r = (key: string, offsetM: number, over: Partial<ConvoyRider> = {}): ConvoyRider => ({
  key,
  name: key,
  colorIndex: 0,
  status: 'moving',
  offsetM,
  isMe: key === 'me',
  ...over,
});

describe('formatOffset', () => {
  it('signs with a real minus and formats like row distances', () => {
    expect(formatOffset(500)).toBe('+500 m');
    expect(formatOffset(-1300)).toBe('−1.3 km');
    expect(formatOffset(12_400)).toBe('+12 km');
  });
});

describe('scaleFor', () => {
  it('maps min..max onto the padded bar', () => {
    const x = scaleFor(-1000, 1000, 300);
    expect(x(-1000)).toBe(CONVOY_PAD_DP);
    expect(x(1000)).toBe(300 - CONVOY_PAD_DP);
    expect(x(0)).toBe(150);
  });

  it('enforces a minimum 500 m span, centred, so a tight group does not fill the bar', () => {
    const x = scaleFor(-50, 50, 300);
    // 100 m of spread on a 500 m scale: 20 % of the 264 dp inner width.
    expect(x(50) - x(-50)).toBeCloseTo(((100 / CONVOY_MIN_SPAN_M) * (300 - CONVOY_PAD_DP * 2)), 5);
    expect(x(0)).toBeCloseTo(150, 5);
  });
});

describe('layoutConvoy', () => {
  it('orders dots tail to lead and reports spread and ticks', () => {
    const l = layoutConvoy([r('pr', -1300), r('me', 0), r('ar', 400), r('ka', 500)], 300);
    const x = (k: string) => l.dots.find((d) => d.key === k)?.x ?? NaN;
    expect(x('pr')).toBeLessThan(x('me'));
    expect(x('me')).toBeLessThan(x('ar'));
    expect(x('ar')).toBeLessThan(x('ka'));
    expect(l.spreadM).toBe(1800);
    expect(l.tailTick).toBe('−1.3 km');
    expect(l.leadTick).toBe('+500 m');
    expect(l.together).toBe(false);
    expect(spreadLabel(l.spreadM)).toBe('1.8 km spread');
  });

  it('omits the tick for an end that is me, and says "Riding together" under 200 m', () => {
    const l = layoutConvoy([r('me', 0), r('a', -120)], 300);
    expect(l.leadTick).toBeNull();
    expect(l.tailTick).toBe('−100 m');
    expect(l.together).toBe(true);
    expect(spreadLabel(l.spreadM)).toBe('Riding together');
  });

  it('keeps every dot inside the bar', () => {
    const l = layoutConvoy([r('me', 0), r('a', 90), r('b', 95), r('c', 100), r('d', 100), r('e', -20)], 320);
    for (const d of l.dots) {
      expect(d.x).toBeGreaterThanOrEqual(CONVOY_PAD_DP);
      expect(d.x).toBeLessThanOrEqual(320 - CONVOY_PAD_DP);
    }
  });

  it('splits a rider hugging me to the left or right of the arrow, 20 dp away', () => {
    const l = layoutConvoy([r('me', 0), r('ahead', 5), r('behind', -5), r('far', 4000), r('farBack', -4000)], 360);
    const x = (k: string) => l.dots.find((d) => d.key === k)?.x ?? NaN;
    expect(x('ahead') - x('me')).toBeCloseTo(20, 5);
    expect(x('me') - x('behind')).toBeCloseTo(20, 5);
  });

  it('stacks two nearby non-me dots 14 dp apart and collapses 4+ into one dot and a +N bubble', () => {
    const two = layoutConvoy([r('me', 0), r('a', 3000), r('b', 3010), r('z', 6000)], 360);
    const a = two.dots.find((d) => d.key === 'a')?.x ?? 0;
    const b = two.dots.find((d) => d.key === 'b')?.x ?? 0;
    expect(b - a).toBeCloseTo(14, 5);
    expect(two.bubbles).toHaveLength(0);

    const many = layoutConvoy([r('me', 0), r('a', 3000), r('b', 3001), r('c', 3002), r('d', 3003), r('z', 6000)], 360);
    expect(many.dots).toHaveLength(3); // me, z and one dot for the cluster
    expect(many.bubbles).toEqual([{ x: expect.any(Number), count: 3 }]);
  });

  it('highlights the largest gap only when it is >= 1 km and >= 40 % of the spread', () => {
    const gap = layoutConvoy([r('pr', -3000), r('me', 0), r('ka', 200)], 300);
    expect(gap.gap).not.toBeNull();
    expect(gap.gap!.x1).toBeLessThan(gap.gap!.x2);
    expect(layoutConvoy([r('a', -800), r('me', 0), r('b', 800)], 300).gap).toBeNull(); // < 1 km
    expect(layoutConvoy([r('a', -1500), r('x', -700), r('me', 0), r('y', 700), r('b', 1500)], 300).gap).toBeNull(); // < 40 %
  });
});

describe('buildConvoy', () => {
  // A straight 6 km route going north from lat 12.0.
  const trail = buildTrail(Array.from({ length: 61 }, (_, i) => ({ lat: 12 + i * 0.0009, lng: 77 })));
  const pos = (lat: number) => ({ lat, lng: 77 });
  const input = {
    me: { name: 'Me', colorIndex: 1 },
    trail,
    myUserId: 'me',
  };

  it('signs offsets along the route, me is 0, off-route riders are only counted', () => {
    const model = buildConvoy({
      ...input,
      positions: { me: pos(12.02), ahead: pos(12.03), behind: pos(12.01), off: pos(12.2) },
      riders: [
        { userId: 'ahead', name: 'A', colorIndex: 2, status: 'moving', rel: { kind: 'ahead', distanceM: 1112 } },
        { userId: 'behind', name: 'B', colorIndex: 3, status: 'stopped', rel: { kind: 'behind', distanceM: 1112 } },
        { userId: 'off', name: 'C', colorIndex: 4, status: 'moving', rel: { kind: 'away', distanceM: 20000 } },
      ],
    });
    expect(model?.riders.map((x) => [x.key, Math.sign(x.offsetM)])).toEqual([
      ['me', 0],
      ['ahead', 1],
      ['behind', -1],
    ]);
    expect(model?.offRoute).toBe(1);
  });

  it('keeps the sign of a level rider from the raw delta', () => {
    const model = buildConvoy({
      ...input,
      positions: { me: pos(12.02), l: pos(12.0195) },
      riders: [{ userId: 'l', name: 'L', colorIndex: 2, status: 'moving', rel: { kind: 'level', distanceM: 55 } }],
    });
    expect(model?.riders[1].offsetM).toBeLessThan(0);
    expect(model?.riders[1].offsetM).toBe(-55);
  });

  it('is hidden without my fix or with fewer than two positioned riders', () => {
    expect(buildConvoy({ ...input, positions: {}, riders: [] })).toBeNull();
    expect(buildConvoy({ ...input, positions: { me: pos(12.02) }, riders: [] })).toBeNull();
    expect(
      buildConvoy({
        ...input,
        positions: { me: pos(12.02) },
        riders: [{ userId: 'x', name: 'X', colorIndex: 0, status: 'offline', rel: null }],
      }),
    ).toBeNull();
  });

  it('describes the strip for screen readers', () => {
    const text = convoyA11y({
      riders: [r('me', 0), r('Priya', -1300, { status: 'offline' }), r('Karthik', 500)],
      offRoute: 1,
    });
    expect(text).toContain('Group spread 1.8 kilometres');
    expect(text).toContain('1 rider ahead, 1 behind');
    expect(text).toContain('Priya has no signal');
    expect(text).toContain('1 off route');
  });
});
