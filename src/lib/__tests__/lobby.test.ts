import { readiness, sortLobbyMembers } from '../lobby';

const NOW = Date.parse('2026-01-01T10:00:00Z');
const ago = (s: number) => new Date(NOW - s * 1000).toISOString();

describe('readiness', () => {
  it('fresh position is ready, even if not on the channel', () => {
    expect(readiness(ago(30), false, NOW)).toBe('ready');
    expect(readiness(ago(60), true, NOW)).toBe('ready');
  });
  it('stale position falls back to presence', () => {
    expect(readiness(ago(61), true, NOW)).toBe('connected');
    expect(readiness(ago(61), false, NOW)).toBe('away');
  });
  it('no position: connected or away', () => {
    expect(readiness(null, true, NOW)).toBe('connected');
    expect(readiness(null, false, NOW)).toBe('away');
  });
});

describe('sortLobbyMembers', () => {
  const m = (userId: string, role: 'leader' | 'rider', joinedAt: string, leftAt: string | null = null) => ({
    userId,
    role,
    joinedAt,
    leftAt,
  });

  it('me first, then leader, then join order; hides members who left', () => {
    const out = sortLobbyMembers(
      [
        m('c', 'rider', '2026-01-01T10:03:00Z'),
        m('b', 'rider', '2026-01-01T10:02:00Z'),
        m('lead', 'leader', '2026-01-01T10:00:00Z'),
        m('gone', 'rider', '2026-01-01T10:01:00Z', '2026-01-01T10:05:00Z'),
      ],
      'c',
    );
    expect(out.map((x) => x.userId)).toEqual(['c', 'lead', 'b']);
  });

  it('leader viewing: leader row first once (me == leader)', () => {
    const out = sortLobbyMembers(
      [m('b', 'rider', '2026-01-01T10:02:00Z'), m('lead', 'leader', '2026-01-01T10:00:00Z')],
      'lead',
    );
    expect(out.map((x) => x.userId)).toEqual(['lead', 'b']);
  });
});
