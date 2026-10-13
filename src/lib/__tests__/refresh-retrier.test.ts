import { createRefreshRetrier, withTimeout } from '../refresh-retrier';

const flush = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

describe('createRefreshRetrier', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('retries on the 2 s, 5 s, 10 s backoff until one succeeds, then stops', async () => {
    const run = jest
      .fn<Promise<void>, []>()
      .mockRejectedValueOnce(new Error('token not ready'))
      .mockRejectedValueOnce(new Error('still not'))
      .mockResolvedValue(undefined);
    const r = createRefreshRetrier({ run });
    r.kick();
    await flush();
    expect(run).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1999);
    await flush();
    expect(run).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    await flush();
    expect(run).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(5000);
    await flush();
    expect(run).toHaveBeenCalledTimes(3);
    expect(r.isStale()).toBe(false);
    jest.advanceTimersByTime(60_000);
    await flush();
    expect(run).toHaveBeenCalledTimes(3);
    r.kick(); // already fresh: an hourly TOKEN_REFRESHED does not refetch
    await flush();
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('gives up after the last delay, and a later trigger starts over', async () => {
    const run = jest.fn<Promise<void>, []>().mockRejectedValue(new Error('offline'));
    const r = createRefreshRetrier({ run });
    r.kick();
    for (const ms of [2000, 5000, 10000]) {
      await flush();
      jest.advanceTimersByTime(ms);
    }
    await flush();
    expect(run).toHaveBeenCalledTimes(4);
    jest.advanceTimersByTime(60_000);
    await flush();
    expect(run).toHaveBeenCalledTimes(4);
    run.mockResolvedValue(undefined);
    r.kick();
    await flush();
    expect(run).toHaveBeenCalledTimes(5);
    expect(r.isStale()).toBe(false);
  });

  it('markStale makes the next kick run again', async () => {
    const run = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);
    const r = createRefreshRetrier({ run });
    r.kick();
    await flush();
    r.markStale();
    r.kick();
    await flush();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('a hung attempt times out and does not block the retry', async () => {
    const run = jest
      .fn<Promise<void>, []>()
      .mockImplementationOnce(() => new Promise<void>(() => {}))
      .mockResolvedValue(undefined);
    const r = createRefreshRetrier({ run, attemptTimeoutMs: 8000 });
    r.kick();
    jest.advanceTimersByTime(8000);
    await flush();
    jest.advanceTimersByTime(2000);
    await flush();
    expect(run).toHaveBeenCalledTimes(2);
    expect(r.isStale()).toBe(false);
  });

  it('cancel stops pending retries', async () => {
    const run = jest.fn<Promise<void>, []>().mockRejectedValue(new Error('x'));
    const r = createRefreshRetrier({ run });
    r.kick();
    await flush();
    r.cancel();
    jest.advanceTimersByTime(60_000);
    await flush();
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('withTimeout', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('falls back when the promise is slow or fails, passes the value when fast', async () => {
    const slow = withTimeout(new Promise<string>(() => {}), 1500, 'fallback');
    jest.advanceTimersByTime(1500);
    await expect(slow).resolves.toBe('fallback');
    await expect(withTimeout(Promise.resolve('fresh'), 1500, 'fallback')).resolves.toBe('fresh');
    await expect(withTimeout(Promise.reject(new Error('x')), 1500, 'fallback')).resolves.toBe('fallback');
  });
});
