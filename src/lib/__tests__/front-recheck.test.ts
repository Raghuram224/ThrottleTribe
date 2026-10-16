import { FRONT_RECHECK_MS, recheckFront } from '../location/front-recheck';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('recheckFront: Android cold start reports an unknown app state and no change event follows (22 D6, M2)', () => {
  it('re-reads the state a few times over about two seconds and runs once it is active', () => {
    let state = 'unknown';
    const onFront = jest.fn();
    recheckFront({ state: () => state, onFront });
    jest.advanceTimersByTime(FRONT_RECHECK_MS[0]);
    expect(onFront).not.toHaveBeenCalled();
    state = 'active';
    jest.advanceTimersByTime(FRONT_RECHECK_MS[FRONT_RECHECK_MS.length - 1]);
    expect(onFront).toHaveBeenCalledTimes(1);
    expect(FRONT_RECHECK_MS[FRONT_RECHECK_MS.length - 1]).toBeLessThanOrEqual(2500);
  });

  it('stops after the first success: later checks do nothing', () => {
    const onFront = jest.fn();
    recheckFront({ state: () => 'active', onFront });
    jest.advanceTimersByTime(10_000);
    expect(onFront).toHaveBeenCalledTimes(1);
  });

  it('gives up when the app is explicitly behind: starting a foreground service from there throws on Android 12+', () => {
    let state = 'unknown';
    const onFront = jest.fn();
    recheckFront({ state: () => state, onFront });
    jest.advanceTimersByTime(FRONT_RECHECK_MS[0]);
    state = 'background';
    jest.advanceTimersByTime(10_000);
    // It came to the front later: that is the change event's job, not a poll.
    state = 'active';
    jest.advanceTimersByTime(10_000);
    expect(onFront).not.toHaveBeenCalled();
  });

  it('never runs when it stays unknown for the whole window', () => {
    const onFront = jest.fn();
    recheckFront({ state: () => 'unknown', onFront });
    jest.advanceTimersByTime(10_000);
    expect(onFront).not.toHaveBeenCalled();
  });

  it('cancel (a change event arrived, or unmount) drops every pending check', () => {
    const onFront = jest.fn();
    const cancel = recheckFront({ state: () => 'active', onFront });
    cancel();
    jest.advanceTimersByTime(10_000);
    expect(onFront).not.toHaveBeenCalled();
  });

  it('tolerates a state read that throws (AppState unavailable): no throw, treated as unknown', () => {
    const onFront = jest.fn();
    recheckFront({
      state: () => {
        throw new TypeError("Cannot read properties of undefined (reading 'currentState')");
      },
      onFront,
    });
    expect(() => jest.advanceTimersByTime(10_000)).not.toThrow();
    expect(onFront).not.toHaveBeenCalled();
  });
});
