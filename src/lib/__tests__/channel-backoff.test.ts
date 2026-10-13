import { CHANNEL_BACKOFF_MS, immediateRetry, nextChannelStep } from '../channel-backoff';

describe('nextChannelStep', () => {
  it('SUBSCRIBED resets the attempt counter and does nothing', () => {
    expect(nextChannelStep('SUBSCRIBED', 3, false)).toEqual({ action: 'none', delayMs: 0, attempt: 0 });
  });

  it('recreates on error, timeout and close with growing backoff capped at 30 s', () => {
    let attempt = 0;
    const delays: number[] = [];
    for (let i = 0; i < 7; i += 1) {
      const step = nextChannelStep(i % 2 ? 'TIMED_OUT' : 'CHANNEL_ERROR', attempt, false);
      expect(step.action).toBe('recreate');
      delays.push(step.delayMs);
      attempt = step.attempt;
    }
    expect(delays).toEqual([2000, 4000, 8000, 16000, 30000, 30000, 30000]);
    expect(CHANNEL_BACKOFF_MS[CHANNEL_BACKOFF_MS.length - 1]).toBe(30000);
    expect(nextChannelStep('CLOSED', 0, false).action).toBe('recreate');
  });

  it('an intentional close never recreates', () => {
    expect(nextChannelStep('CLOSED', 2, true)).toEqual({ action: 'none', delayMs: 0, attempt: 2 });
  });
});

describe('immediateRetry', () => {
  it('retries at once and restarts the backoff only when the channel is not up', () => {
    expect(immediateRetry(false)).toEqual({ action: 'recreate', delayMs: 0, attempt: 0 });
    expect(immediateRetry(true).action).toBe('none');
  });
});
