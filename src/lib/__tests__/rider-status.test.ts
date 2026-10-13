import { deriveRiderStatus, OFFLINE_AFTER_MS } from '../rider-status';

const NOW = Date.parse('2026-01-01T12:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();

const base = { sos: false, sosAt: null, stopThresholdS: 180 };

describe('deriveRiderStatus', () => {
  it('sos wins and reports time since sosAt', () => {
    const r = deriveRiderStatus({ ...base, sos: true, sosAt: ago(20_000), position: null }, NOW);
    expect(r).toEqual({ status: 'sos', sinceMs: 20_000 });
  });

  it('sos overrides offline and stopped', () => {
    const position = { updatedAt: ago(10 * 60_000), slowSince: ago(20 * 60_000) };
    expect(deriveRiderStatus({ ...base, sos: true, sosAt: ago(5_000), position }, NOW).status).toBe('sos');
  });

  it('sos with unknown sosAt has null sinceMs', () => {
    expect(deriveRiderStatus({ ...base, sos: true, position: null }, NOW)).toEqual({
      status: 'sos',
      sinceMs: null,
    });
  });

  it('no position is offline with unknown since', () => {
    expect(deriveRiderStatus({ ...base, position: null }, NOW)).toEqual({ status: 'offline', sinceMs: null });
  });

  it('offline boundary: exactly 60 s is still live, beyond is offline', () => {
    const at = (ms: number) => deriveRiderStatus({ ...base, position: { updatedAt: ago(ms), slowSince: null } }, NOW);
    expect(at(OFFLINE_AFTER_MS).status).toBe('moving');
    expect(at(OFFLINE_AFTER_MS + 1)).toEqual({ status: 'offline', sinceMs: OFFLINE_AFTER_MS + 1 });
  });

  it('offline beats stopped', () => {
    const position = { updatedAt: ago(90_000), slowSince: ago(10 * 60_000) };
    expect(deriveRiderStatus({ ...base, position }, NOW)).toEqual({ status: 'offline', sinceMs: 90_000 });
  });

  it('stopped needs the threshold to be reached', () => {
    const at = (slowMs: number) =>
      deriveRiderStatus({ ...base, position: { updatedAt: ago(5_000), slowSince: ago(slowMs) } }, NOW);
    expect(at(179_000).status).toBe('moving');
    expect(at(180_000)).toEqual({ status: 'stopped', sinceMs: 180_000 });
    expect(at(400_000)).toEqual({ status: 'stopped', sinceMs: 400_000 });
  });

  it('respects a custom threshold', () => {
    const position = { updatedAt: ago(1_000), slowSince: ago(61_000) };
    expect(deriveRiderStatus({ ...base, stopThresholdS: 60, position }, NOW).status).toBe('stopped');
    expect(deriveRiderStatus({ ...base, stopThresholdS: 120, position }, NOW).status).toBe('moving');
  });

  it('null slowSince is moving', () => {
    const r = deriveRiderStatus({ ...base, position: { updatedAt: ago(1_000), slowSince: null } }, NOW);
    expect(r).toEqual({ status: 'moving', sinceMs: null });
  });

  it('clock skew never yields negative durations', () => {
    const r = deriveRiderStatus({ ...base, sos: true, sosAt: new Date(NOW + 5_000).toISOString(), position: null }, NOW);
    expect(r.sinceMs).toBe(0);
  });
});
