import { HOME_FALLBACK_CAMERA } from '../plan-flow';
import { LIVE_ME_ZOOM, liveStartView, PLANNING_SEED_MAX_AGE_MS } from '../live-camera';

const NOW = 10_000_000;
const none = { me: null, bounds: null, planning: null, planningAt: 0, now: NOW, saved: null };
const planning = { lat: 12.97, lng: 77.59 };
const fresh = { planning, planningAt: NOW - 60_000 };

describe('liveStartView', () => {
  it('starts on my own fix at street level', () => {
    expect(liveStartView({ ...none, me: { lat: 1, lng: 2 }, ...fresh })).toEqual({ kind: 'me', center: [2, 1], zoom: LIVE_ME_ZOOM });
  });

  it('without my fix, frames everyone who has a position', () => {
    const bounds: [number, number, number, number] = [77, 12, 78, 13];
    expect(liveStartView({ ...none, bounds, ...fresh })).toEqual({ kind: 'bounds', bounds });
  });

  it('without anyone, starts on the planning position Home already holds (not the Atlantic)', () => {
    expect(liveStartView({ ...none, ...fresh })).toEqual({ kind: 'planning', center: [77.59, 12.97], zoom: LIVE_ME_ZOOM });
  });

  it("then on Home's saved camera", () => {
    const saved = { lat: 9, lng: 76, zoom: 11 };
    expect(liveStartView({ ...none, saved })).toEqual({ kind: 'saved', center: [76, 9], zoom: 11 });
  });

  it('and only with nothing at all on the India view Home uses', () => {
    expect(liveStartView(none)).toEqual({
      kind: 'saved',
      center: [HOME_FALLBACK_CAMERA.lng, HOME_FALLBACK_CAMERA.lat],
      zoom: HOME_FALLBACK_CAMERA.zoom,
    });
  });

  it('ignores a planning position older than 30 min and uses the saved camera', () => {
    const saved = { lat: 9, lng: 76, zoom: 11 };
    const old = { planning, planningAt: NOW - PLANNING_SEED_MAX_AGE_MS - 1 };
    expect(liveStartView({ ...none, ...old, saved })).toEqual({ kind: 'saved', center: [76, 9], zoom: 11 });
    expect(liveStartView({ ...none, planning, planningAt: NOW - PLANNING_SEED_MAX_AGE_MS, saved }).kind).toBe('planning');
  });
});
