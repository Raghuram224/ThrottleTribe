import {
  BATCH_SIZE,
  enqueueError,
  enqueueEvent,
  flushTelemetry,
  MAX_QUEUE,
  peekQueue,
  type ErrorRow,
  type EventRow,
} from '../telemetry/queue';

jest.mock('expo-sqlite/localStorage/install', () => ({}));

const mockGetSession = jest.fn();
const mockInsert = jest.fn();
const mockFrom = jest.fn((_table: string) => ({ insert: mockInsert }));

jest.mock('../supabase', () => ({
  supabase: {
    auth: { getSession: () => mockGetSession() },
    from: (table: string) => mockFrom(table),
  },
}));

function installStorage(): Map<string, string> {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  return store;
}

const base = {
  session_id: 's1',
  platform: 'android' as const,
  client_at: '2026-01-01T00:00:00.000Z',
};
const ev = (n: number): EventRow => ({ ...base, name: 'screen.viewed', props: { n } });
const err = (n: number): ErrorRow => ({ ...base, kind: 'js_error', message: `boom ${n}` });

beforeEach(() => {
  installStorage();
  mockGetSession.mockReset().mockResolvedValue({ data: { session: { user: { id: 'u' } } }, error: null });
  mockInsert.mockReset().mockResolvedValue({ error: null });
  mockFrom.mockClear();
});

describe('telemetry queue', () => {
  it('caps each queue at MAX_QUEUE and drops the oldest', () => {
    for (let i = 0; i < MAX_QUEUE + 10; i++) enqueueEvent(ev(i));
    const q = peekQueue('events');
    expect(q).toHaveLength(MAX_QUEUE);
    expect((q[0] as EventRow).props).toEqual({ n: 10 });
  });

  it('keeps events and errors in separate queues', () => {
    enqueueEvent(ev(1));
    enqueueError(err(1));
    expect(peekQueue('events')).toHaveLength(1);
    expect(peekQueue('errors')).toHaveLength(1);
  });

  it('flushes in batches and never sends seq', async () => {
    for (let i = 0; i < BATCH_SIZE + 5; i++) enqueueEvent(ev(i));
    await flushTelemetry();
    expect(mockInsert).toHaveBeenCalledTimes(2);
    expect(mockInsert.mock.calls[0][0]).toHaveLength(BATCH_SIZE);
    expect(mockInsert.mock.calls[0][0][0]).not.toHaveProperty('seq');
    expect(peekQueue('events')).toHaveLength(0);
  });

  it('removes sent rows by seq even if the cap dropped some while in flight', async () => {
    for (let i = 0; i < MAX_QUEUE; i++) enqueueEvent(ev(i));
    mockInsert.mockImplementationOnce(async () => {
      // While the first batch is in flight: 10 more rows push the oldest 10 out of the queue.
      for (let i = 0; i < 10; i++) enqueueEvent(ev(1000 + i));
      return { error: null };
    });
    mockInsert.mockResolvedValue({ error: { code: '08006', message: 'down' } });
    await flushTelemetry();
    const q = peekQueue('events');
    // Batch of 50 (seq 1..50) sent; 10 of them were already evicted, so only 40 are removed.
    // Removing by count (50) would have wrongly deleted seq 51..60 too.
    expect(q).toHaveLength(MAX_QUEUE - 40);
    expect(q[0].seq).toBe(51);
    expect((q[q.length - 1] as EventRow).props).toEqual({ n: 1009 });
  });

  it('keeps rows when there is no session and when the insert fails', async () => {
    enqueueEvent(ev(1));
    mockGetSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    await flushTelemetry();
    expect(mockInsert).not.toHaveBeenCalled();
    expect(peekQueue('events')).toHaveLength(1);

    mockInsert.mockResolvedValueOnce({ error: { code: '08006', message: 'down' } });
    await flushTelemetry();
    expect(peekQueue('events')).toHaveLength(1);
  });

  it('drops a batch the server rejects permanently (integrity error)', async () => {
    enqueueError(err(1));
    mockInsert.mockResolvedValueOnce({ error: { code: '23514', message: 'check' } });
    await flushTelemetry();
    expect(peekQueue('errors')).toHaveLength(0);
  });

  it('runs one flush at a time', async () => {
    enqueueEvent(ev(1));
    await Promise.all([flushTelemetry(), flushTelemetry()]);
    expect(mockGetSession).toHaveBeenCalledTimes(1);
  });

  it('never throws when storage or supabase blow up', async () => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => {
        throw new Error('storage');
      },
      setItem: () => {
        throw new Error('storage');
      },
      removeItem: () => undefined,
    };
    expect(() => enqueueEvent(ev(1))).not.toThrow();
    expect(() => enqueueError(err(1))).not.toThrow();
    mockGetSession.mockRejectedValue(new Error('auth'));
    await expect(flushTelemetry()).resolves.toBeUndefined();
  });
});
