import type { RideAlert } from '../alerts';
import {
  advance,
  alertKey,
  dismissCurrent,
  dropRider,
  EMPTY_QUEUE,
  enqueue,
  MAX_QUEUE,
  MIN_SHOW_MS,
  nextWakeAt,
  shouldNotify,
} from '../alert-queue';

jest.mock('expo-notifications', () => ({}));
jest.mock('expo-haptics', () => ({}));

const alert = (kind: RideAlert['kind'], userId: string, name = userId): RideAlert => ({
  kind,
  userId,
  title: '',
  body: '',
  name,
  distance: null,
  minutes: null,
});

describe('alert queue', () => {
  it('shows the first alert immediately and ignores kinds without a banner', () => {
    let q = enqueue(EMPTY_QUEUE, alert('sos', 'a'), 0);
    expect(q.current).toBeNull();
    q = enqueue(q, alert('stopped', 'a'), 1000);
    expect(q.current?.key).toBe('a:stopped');
    expect(q.current?.shownAt).toBe(1000);
  });

  it('same rider+kind replaces in place, no duplicates', () => {
    let q = enqueue(EMPTY_QUEUE, alert('stopped', 'a'), 0);
    q = enqueue(q, alert('stopped', 'a', 'Arun'), 500);
    expect(q.current?.alert.name).toBe('Arun');
    expect(q.items).toHaveLength(0);

    q = enqueue(q, alert('message', 'b'), 600);
    q = enqueue(q, alert('message', 'b', 'Bo'), 700);
    expect(q.items).toHaveLength(1);
    expect(q.items[0].alert.name).toBe('Bo');
  });

  it('a newer same-priority alert waits for the 3 s minimum, then replaces the current one', () => {
    let q = enqueue(EMPTY_QUEUE, alert('stopped', 'a'), 0);
    q = enqueue(q, alert('offline', 'b'), 1000);
    expect(q.current?.key).toBe('a:stopped');
    q = advance(q, MIN_SHOW_MS);
    expect(q.current?.key).toBe('b:offline');
    expect(q.items).toHaveLength(0);
  });

  it('priority: stopped/offline beat message beat sos_cleared; lower priority never displaces higher', () => {
    let q = enqueue(EMPTY_QUEUE, alert('message', 'a'), 0);
    q = enqueue(q, alert('sos_cleared', 'b'), 100);
    q = enqueue(q, alert('stopped', 'c'), 200);
    q = advance(q, 3000);
    expect(q.current?.key).toBe('c:stopped');
    q = enqueue(q, alert('message', 'd'), 3100);
    q = advance(q, 7000);
    expect(q.current?.key).toBe('c:stopped'); // message cannot displace a status alert
  });

  it('expires banners: messages after 8 s, status alerts after 15 s', () => {
    let q = enqueue(EMPTY_QUEUE, alert('message', 'a'), 0);
    expect(advance(q, 7999).current).not.toBeNull();
    expect(advance(q, 8000).current).toBeNull();
    q = enqueue(EMPTY_QUEUE, alert('stopped', 'a'), 0);
    expect(advance(q, 14999).current).not.toBeNull();
    expect(advance(q, 15000).current).toBeNull();
  });

  it('keeps at most 5 waiting, dropping the oldest', () => {
    let q = enqueue(EMPTY_QUEUE, alert('stopped', 'first'), 0);
    for (let i = 0; i < MAX_QUEUE + 2; i++) q = enqueue(q, alert('message', `m${i}`), 10 + i);
    expect(q.items).toHaveLength(MAX_QUEUE);
    expect(q.items.some((i) => i.key === 'm0:message')).toBe(false);
  });

  it('dismissing promotes the next one; dropRider forgets a rider', () => {
    let q = enqueue(EMPTY_QUEUE, alert('stopped', 'a'), 0);
    q = enqueue(q, alert('message', 'b'), 100);
    q = dismissCurrent(q, 200);
    expect(q.current?.key).toBe('b:message');
    expect(dropRider(q, 'b').current).toBeNull();
  });

  it('nextWakeAt covers expiry and the minimum-show promotion', () => {
    expect(nextWakeAt(EMPTY_QUEUE, 0)).toBeNull();
    let q = enqueue(EMPTY_QUEUE, alert('stopped', 'a'), 0);
    expect(nextWakeAt(q, 0)).toBe(15_000);
    q = enqueue(q, alert('stopped', 'b'), 500);
    expect(nextWakeAt(q, 500)).toBe(MIN_SHOW_MS);
  });
});

describe('shouldNotify', () => {
  it('de-duplicates the same rider+kind inside the window only', () => {
    const last = new Map<string, number>();
    const a = alert('stopped', 'a');
    expect(shouldNotify(last, a, 0)).toBe(true);
    expect(shouldNotify(last, a, 10_000)).toBe(false);
    expect(shouldNotify(last, alert('offline', 'a'), 10_000)).toBe(true);
    expect(shouldNotify(last, alert('stopped', 'b'), 10_000)).toBe(true);
    expect(shouldNotify(last, a, 30_000)).toBe(true);
    expect(alertKey(a)).toBe('a:stopped');
  });
});
