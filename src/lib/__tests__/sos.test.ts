import { anyOutside, fitBoundsFor } from '../map-fit';
import { cooldownLeft } from '../quick-message';
import {
  activeSos,
  navigationUrl,
  positionFromPayload,
  receiverTakeoverShowing,
  sosIsOn,
  sosReduce,
  takeoverTarget,
  type SosEvent,
  type SosPhase,
} from '../sos';

const run = (events: SosEvent[], from: SosPhase = 'idle') => events.reduce(sosReduce, from);

describe('sender state machine', () => {
  it('trigger -> sending -> success -> active', () => {
    expect(run(['trigger'])).toBe('sending');
    expect(run(['trigger', 'success'])).toBe('active');
  });

  it('failure retries until success (never drops the SOS)', () => {
    expect(run(['trigger', 'failure'])).toBe('retrying');
    expect(run(['trigger', 'failure', 'failure', 'failure'])).toBe('retrying');
    expect(run(['trigger', 'failure', 'failure', 'success'])).toBe('active');
  });

  it('cancel always returns to idle; a late failure/success does nothing after it', () => {
    expect(run(['trigger', 'failure', 'cancel'])).toBe('idle');
    expect(run(['trigger', 'cancel', 'failure'])).toBe('idle');
    expect(run(['trigger', 'cancel', 'success'])).toBe('idle');
  });

  it('a second trigger while on does nothing', () => {
    expect(run(['trigger', 'trigger'])).toBe('sending');
    expect(run(['trigger', 'success', 'trigger'])).toBe('active');
  });

  it('follows the member row without losing an in-flight attempt', () => {
    expect(run(['server_on'])).toBe('active');
    expect(run(['server_off'], 'active')).toBe('idle');
    expect(run(['server_off'], 'sending')).toBe('sending');
    expect(run(['server_off'], 'retrying')).toBe('retrying');
    expect(run(['server_on'], 'retrying')).toBe('retrying');
  });

  it('sosIsOn is true for every phase but idle', () => {
    expect(sosIsOn('idle')).toBe(false);
    expect(['sending', 'retrying', 'active'].every((p) => sosIsOn(p as SosPhase))).toBe(true);
  });
});

describe('receiver selection', () => {
  const members = [
    { userId: 'me', name: 'Me', sos: true, sosAt: '2026-01-01T10:00:00Z', leftAt: null },
    { userId: 'a', name: 'Arun', sos: true, sosAt: '2026-01-01T10:01:00Z', leftAt: null },
    { userId: 'p', name: 'Priya', sos: true, sosAt: '2026-01-01T10:05:00Z', leftAt: null },
    { userId: 'j', name: 'Jo', sos: false, sosAt: null, leftAt: null },
    { userId: 'x', name: 'Xan', sos: true, sosAt: '2026-01-01T10:06:00Z', leftAt: '2026-01-01T10:07:00Z' },
  ];

  it('lists other riders in SOS, newest first, never me or those who left', () => {
    expect(activeSos(members, 'me').map((a) => a.userId)).toEqual(['p', 'a']);
  });

  it('shows the cursor-th undismissed SOS and the count of others', () => {
    const active = activeSos(members, 'me');
    expect(takeoverTarget(active, {}, 0)).toMatchObject({ sos: { userId: 'p' }, more: 1 });
    expect(takeoverTarget(active, {}, 1)).toMatchObject({ sos: { userId: 'a' }, more: 1 });
    expect(takeoverTarget(active, {}, 2)?.sos.userId).toBe('p');
    expect(takeoverTarget(active, { [active[0].key]: true }, 0)).toMatchObject({ sos: { userId: 'a' }, more: 0 });
    expect(takeoverTarget(active, { [active[0].key]: true, [active[1].key]: true }, 0)).toBeNull();
    expect(takeoverTarget([], {}, 0)).toBeNull();
  });

  it('a re-triggered SOS is a new key, so an old dismissal does not hide it', () => {
    const first = activeSos([{ ...members[1], sosAt: '2026-01-01T10:01:00Z' }], 'me');
    const again = activeSos([{ ...members[1], sosAt: '2026-01-01T11:00:00Z' }], 'me');
    expect(takeoverTarget(again, { [first[0].key]: true }, 0)).not.toBeNull();
  });
});

describe('navigation', () => {
  it('builds the Android geo: URL with a labelled pin', () => {
    expect(navigationUrl('android', 12.5, 77.25, 'Priya Kumar')).toBe('geo:12.5,77.25?q=12.5,77.25(Priya)');
  });
  it('builds the iOS Apple Maps URL', () => {
    expect(navigationUrl('ios', 12.5, 77.25, 'Priya')).toBe('http://maps.apple.com/?daddr=12.5,77.25&dirflg=d');
  });
  it('reads a position from an event payload', () => {
    expect(positionFromPayload({ lat: 1, lng: 2, recorded_at: 'x' })).toEqual({ lat: 1, lng: 2 });
    expect(positionFromPayload({})).toBeNull();
    expect(positionFromPayload(null)).toBeNull();
  });
});

describe('quick message cooldown', () => {
  it('counts down 10 s from the send', () => {
    expect(cooldownLeft(undefined, 5000)).toBe(0);
    expect(cooldownLeft(1000, 1000)).toBe(10_000);
    expect(cooldownLeft(1000, 10_999)).toBe(1);
    expect(cooldownLeft(1000, 11_000)).toBe(0);
  });
});

describe('map fit', () => {
  it('returns null without points', () => {
    expect(fitBoundsFor([])).toBeNull();
  });

  it('grows a single point to the minimum span in both directions', () => {
    const b = fitBoundsFor([{ lat: 0, lng: 0 }], 900);
    expect(b).not.toBeNull();
    const [w, s, e, n] = b!;
    expect((n - s) * 111_320).toBeCloseTo(900, 0);
    expect((e - w) * 111_320).toBeCloseTo(900, 0);
  });

  it('keeps a wide spread as is', () => {
    const b = fitBoundsFor([
      { lat: 0, lng: 0 },
      { lat: 0.1, lng: 0.1 },
    ]);
    expect(b).toEqual([0, 0, 0.1, 0.1]);
  });

  it('detects riders outside the viewport', () => {
    const view: [number, number, number, number] = [0, 0, 1, 1];
    expect(anyOutside([{ lat: 0.5, lng: 0.5 }], view)).toBe(false);
    expect(anyOutside([{ lat: 0.5, lng: 0.5 }, { lat: 2, lng: 0.5 }], view)).toBe(true);
  });
});

describe('receiverTakeoverShowing (Home Back yields to the takeover)', () => {
  const m = (userId: string, sos: boolean) => ({ userId, name: userId, sos, sosAt: '2026-10-24T10:00:00Z', leftAt: null });
  it('is true while another rider\'s SOS is on and not dismissed', () => {
    expect(receiverTakeoverShowing([m('a', true)], 'me', {}, 0)).toBe(true);
  });
  it('is false for my own SOS, no SOS, or a dismissed one', () => {
    expect(receiverTakeoverShowing([m('me', true)], 'me', {}, 0)).toBe(false);
    expect(receiverTakeoverShowing([m('a', false)], 'me', {}, 0)).toBe(false);
    expect(receiverTakeoverShowing([m('a', true)], 'me', { 'a:2026-10-24T10:00:00Z': true }, 0)).toBe(false);
  });
});
