import { detectAlerts, type AlertSnapshot } from '../alerts';
import type { RiderStatus } from '../rider-status';

// babel-jest hoists these above the imports.
jest.mock('expo-haptics', () => ({}));
jest.mock('expo-notifications', () => ({}));
jest.mock('@/lib/telemetry', () => ({ track: jest.fn() }));

const snap = (
  statuses: Record<string, RiderStatus | [RiderStatus, number | null]>,
  myUserId: string | null = 'me',
): AlertSnapshot => ({
  statuses: Object.fromEntries(
    Object.entries(statuses).map(([id, s]) => [
      id,
      Array.isArray(s) ? { status: s[0], sinceMs: s[1] } : { status: s, sinceMs: null },
    ]),
  ),
  names: { a: 'Asha', b: 'Bala', me: 'Me' },
  myUserId,
});

describe('detectAlerts status transitions', () => {
  it('alerts when someone becomes stopped', () => {
    const out = detectAlerts(snap({ a: 'moving' }), snap({ a: ['stopped', 200_000] }), []);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: 'stopped', userId: 'a' });
    expect(out[0].title).toContain('Asha');
  });

  it('does not repeat while the status is unchanged', () => {
    expect(detectAlerts(snap({ a: 'stopped' }), snap({ a: 'stopped' }), [])).toEqual([]);
  });

  it('alerts offline only when a position had been seen', () => {
    expect(detectAlerts(snap({ a: 'moving' }), snap({ a: ['offline', 70_000] }), [])[0].kind).toBe('offline');
    expect(detectAlerts(snap({ a: 'moving' }), snap({ a: ['offline', null] }), [])).toEqual([]);
  });

  it('sos and sos_cleared', () => {
    expect(detectAlerts(snap({ a: 'moving' }), snap({ a: 'sos' }), [])[0].kind).toBe('sos');
    expect(detectAlerts(snap({ a: 'sos' }), snap({ a: 'moving' }), [])[0].kind).toBe('sos_cleared');
  });

  it('sos beats the offline/stopped it replaces', () => {
    const out = detectAlerts(snap({ a: ['offline', 90_000] }), snap({ a: 'sos' }), []);
    expect(out.map((a) => a.kind)).toEqual(['sos']);
  });

  it('never alerts about myself', () => {
    expect(detectAlerts(snap({ me: 'moving' }), snap({ me: 'sos' }), [])).toEqual([]);
  });

  it('does not flood when a rider first appears (initial load)', () => {
    expect(detectAlerts(snap({}), snap({ a: 'stopped', b: 'sos' }), [])).toEqual([]);
  });
});

describe('detectAlerts texts', () => {
  const withDistance = (s: AlertSnapshot, phrase: string | null, rideName = 'Sunday Run'): AlertSnapshot => ({
    ...s,
    distanceText: () => phrase,
    rideName,
  });

  it('stopped: distance, minutes and ride name', () => {
    const next = withDistance(snap({ a: ['stopped', 4 * 60_000 + 20_000] }), '4.2 km behind');
    const [alert] = detectAlerts(snap({ a: 'moving' }), next, []);
    expect(alert.title).toBe('Asha has stopped');
    expect(alert.body).toBe('4.2 km behind you · 4 min · Sunday Run');
    expect(alert).toMatchObject({ name: 'Asha', distance: '4.2 km behind', minutes: 4 });
  });

  it('stopped without distance or minutes still reads well', () => {
    const [alert] = detectAlerts(snap({ a: 'moving' }), snap({ a: ['stopped', 10_000] }), []);
    expect(alert.body).toBe('Check the map.');
    expect(alert.minutes).toBeNull();
  });

  it('offline and sos use the distance phrase', () => {
    const next = withDistance(snap({ a: ['offline', 70_000] }), '3.1 km away');
    expect(detectAlerts(snap({ a: 'moving' }), next, [])[0].body).toBe('Last seen 3.1 km away');
    const sos = detectAlerts(snap({ a: 'moving' }), withDistance(snap({ a: 'sos' }), 'With you'), []);
    expect(sos[0].title).toBe('⚠ SOS from Asha');
    expect(sos[0].body).toBe('With you · tap to see where');
  });

  it('sos_cleared names the ride', () => {
    const [alert] = detectAlerts(snap({ a: 'sos' }), withDistance(snap({ a: 'moving' }), null), []);
    expect(alert.title).toBe('Asha is OK');
    expect(alert.body).toBe('SOS cleared · Sunday Run');
  });

  it('truncates long rider names to 14 characters in titles', () => {
    const next = snap({ a: ['stopped', 200_000] });
    next.names.a = 'Bartholomew Montgomery-Smythe';
    const [alert] = detectAlerts(snap({ a: 'moving' }), next, []);
    expect(alert.title).toBe('Bartholomew Mo… has stopped');
    expect(alert.name).toBe('Bartholomew Montgomery-Smythe');
  });

  it('message and ended notifications name the ride', () => {
    const next = withDistance(snap({}), null);
    const out = detectAlerts(next, next, [
      { id: 1, type: 'message', user_id: 'a', payload: { kind: 'on_my_way' } },
      { id: 2, type: 'ended', user_id: 'a', payload: {} },
    ]);
    expect(out[0]).toMatchObject({ title: '🏍 On my way', body: 'From Asha · Sunday Run', messageKind: 'on_my_way' });
    expect(out[1]).toMatchObject({ title: 'Ride ended', body: 'Sunday Run is over. See your summary.' });
  });
});

describe('detectAlerts events', () => {
  const none = snap({});

  it('quick messages from others', () => {
    const out = detectAlerts(none, none, [{ id: 1, type: 'message', user_id: 'a', payload: { kind: 'fuel' } }]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: 'message', userId: 'a' });
    expect(out[0].title).toContain('Fuel stop');
    expect(out[0].body).toContain('Asha');
  });

  it('ignores my own messages, unknown kinds and noise events', () => {
    const out = detectAlerts(none, none, [
      { id: 1, type: 'message', user_id: 'me', payload: { kind: 'fuel' } },
      { id: 2, type: 'message', user_id: 'a', payload: { kind: 'nope' } },
      { id: 3, type: 'joined', user_id: 'a', payload: {} },
      { id: 4, type: 'stopped', user_id: 'a', payload: {} },
    ]);
    expect(out).toEqual([]);
  });

  it('ride ended', () => {
    const out = detectAlerts(none, none, [{ id: 5, type: 'ended', user_id: 'a', payload: {} }]);
    expect(out[0].kind).toBe('ended');
    expect(detectAlerts(none, none, [{ id: 6, type: 'ended', user_id: 'me', payload: {} }])).toEqual([]);
  });
});
