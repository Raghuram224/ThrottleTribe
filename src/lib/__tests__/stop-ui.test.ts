import type { PendingProposal } from '../stop-proposals';
import { approvalCardModel, breakIcon, categoryIcon, navLineFor, rideStop, suggestedByName, withStop } from '../stop-ui';

const prop = (id: number, userId: string, name = 'Cafe', kind: 'break' | 'destination' = 'break'): PendingProposal => ({
  id,
  userId,
  createdAt: '2026-01-01T00:00:00Z',
  stop: { name, address: null, lat: 12.9, lng: 77.5, kind, category: null },
});
const members = {
  priya: { name: 'Priya Nair' },
  karthik: { name: 'Karthik' },
  gone: { name: 'Gone Rider', leftAt: '2026-01-01T00:00:00Z' },
};
const near = { lat: 12.9, lng: 77.52 }; // ~2.2 km west of the stop

describe('rideStop', () => {
  const cols = {
    stop_name: 'Cafe',
    stop_address: '',
    stop_lat: 12.9,
    stop_lng: 77.5,
    stop_kind: 'destination',
    stop_set_by: 'priya',
  };
  it('reads the columns, with an empty address as null', () => {
    expect(rideStop(cols)).toEqual({ name: 'Cafe', address: null, lat: 12.9, lng: 77.5, kind: 'destination', category: null, setBy: 'priya' });
  });
  it('reads the category, and ignores a missing or unknown one (old rides, cached rows)', () => {
    expect(rideStop({ ...cols, stop_kind: 'break', stop_category: 'fuel' })?.category).toBe('fuel');
    expect(rideStop({ ...cols, stop_category: null })?.category).toBeNull();
    expect(rideStop({ ...cols, stop_category: 'spaceport' })?.category).toBeNull();
    expect(rideStop(cols)?.category).toBeNull();
  });
  it('is null without a stop, and an unknown kind falls back to break', () => {
    expect(rideStop(null)).toBeNull();
    expect(rideStop({ ...cols, stop_name: null, stop_lat: null, stop_lng: null })).toBeNull();
    expect(rideStop({ ...cols, stop_kind: 'x' })?.kind).toBe('break');
  });
});

describe('suggestedByName', () => {
  const nameOf = (id: string) => (members as Record<string, { name: string }>)[id]?.name;
  it('shows the proposer first name only when it is not the leader', () => {
    expect(suggestedByName({ setBy: 'priya' }, 'leader', nameOf)).toBe('Priya');
    expect(suggestedByName({ setBy: 'leader' }, 'leader', nameOf)).toBeNull();
    expect(suggestedByName({ setBy: null }, 'leader', nameOf)).toBeNull();
    expect(suggestedByName(null, 'leader', nameOf)).toBeNull();
    expect(suggestedByName({ setBy: 'stranger' }, 'leader', nameOf)).toBeNull();
  });
});

describe('approvalCardModel', () => {
  it('is null when nothing is pending', () => {
    expect(approvalCardModel({ proposals: [], members, me: near })).toBeNull();
  });
  it('shows the newest proposal with name, kind text and distance, and counts the rest', () => {
    const m = approvalCardModel({ proposals: [prop(5, 'karthik', 'Fuel Stop'), prop(9, 'priya', 'Coffee Day')], members, me: near });
    expect(m).toMatchObject({ proposalId: 9, name: 'Priya', moreCount: 1, place: 'Coffee Day' });
    expect(m?.text).toBe('Priya suggests a break · Coffee Day · 2.2 km');
  });
  it('uses the destination wording', () => {
    const m = approvalCardModel({ proposals: [prop(1, 'priya', 'Home', 'destination')], members, me: near });
    expect(m?.text).toBe('Priya suggests a destination · Home · 2.2 km');
    expect(m?.moreCount).toBe(0);
  });
  it('skips proposals whose proposer has left', () => {
    const m = approvalCardModel({ proposals: [prop(9, 'gone'), prop(2, 'karthik')], members, me: near });
    expect(m?.proposalId).toBe(2);
    expect(m?.moreCount).toBe(0);
    expect(approvalCardModel({ proposals: [prop(9, 'gone')], members, me: near })).toBeNull();
  });
  it('drops the distance when my position is unknown', () => {
    expect(approvalCardModel({ proposals: [prop(1, 'priya', 'Coffee Day')], members, me: null })?.text).toBe(
      'Priya suggests a break · Coffee Day',
    );
  });
});

describe('categoryIcon', () => {
  it('has an icon from the app set for every category, the same as the search chips', () => {
    expect(categoryIcon('cafe')).toBe('coffee');
    expect(categoryIcon('fuel')).toBe('fuel');
    expect(categoryIcon('restaurant')).toBe('food');
    expect(categoryIcon('other')).toBe('permLocation');
  });
});

describe('navLineFor', () => {
  const a = { lat: 1, lng: 1 };
  const b = { lat: 2, lng: 2 };
  it('prefers the road route, solid', () => {
    expect(navLineFor({ route: { coords: [a, b] }, straightLine: [a, b] })).toEqual({ coords: [a, b], dashed: false });
  });
  it('falls back to the dashed straight line', () => {
    expect(navLineFor({ route: null, straightLine: [a, b] })).toEqual({ coords: [a, b], dashed: true });
  });
  it('is null with nothing to draw', () => {
    expect(navLineFor({ route: null, straightLine: [] })).toBeNull();
  });
});

describe('withStop', () => {
  const ride = { id: 'r', stop_name: null, stop_address: null, stop_lat: null, stop_lng: null, stop_kind: null, stop_set_by: null, stop_set_at: null };
  it('sets every stop column together and reads back through rideStop, leaving the input alone', () => {
    const next = withStop(ride, { name: 'Palace', address: 'Mysuru', lat: 12.3, lng: 76.6, kind: 'destination' }, 'me', '2026-10-14T10:00:00Z');
    expect(rideStop(next)).toEqual({ name: 'Palace', address: 'Mysuru', lat: 12.3, lng: 76.6, kind: 'destination', category: null, setBy: 'me' });
    expect(next.stop_set_at).toBe('2026-10-14T10:00:00Z');
    expect(next.id).toBe('r');
    expect(ride.stop_name).toBeNull();
  });
  it('keeps the category the stop was set with', () => {
    const next = withStop(ride, { name: 'Shell', lat: 1, lng: 2, kind: 'break', category: 'fuel' }, 'me', 't');
    expect(rideStop(next)?.category).toBe('fuel');
  });
  it('replaces an earlier stop', () => {
    const first = withStop(ride, { name: 'A', lat: 1, lng: 2, kind: 'break' }, 'me', 't1');
    expect(rideStop(withStop(first, { name: 'B', lat: 3, lng: 4, kind: 'break' }, 'me', 't2'))?.name).toBe('B');
  });
});

describe('breakIcon', () => {
  it('shows the icon of the kind of place for a break, so a fuel stop is not a coffee cup', () => {
    expect(breakIcon('fuel')).toBe('fuel');
    expect(breakIcon('cafe')).toBe('coffee');
    expect(breakIcon('toilets')).toBe('toilets');
  });
  it('keeps the cup when the category is unknown (old rides)', () => {
    expect(breakIcon(null)).toBe('coffee');
    expect(breakIcon(undefined)).toBe('coffee');
    expect(breakIcon('other')).toBe('coffee');
  });
});
