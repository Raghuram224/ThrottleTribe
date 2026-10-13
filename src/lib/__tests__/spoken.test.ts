import { hourCount, minuteCount, spokenDistance, spokenDuration } from '../copy';
import { rowA11y, spoken } from '../live-list';

describe('spoken plurals', () => {
  it('minuteCount and hourCount', () => {
    expect(minuteCount(1)).toBe('1 minute');
    expect(minuteCount(5)).toBe('5 minutes');
    expect(hourCount(1)).toBe('1 hour');
    expect(hourCount(2)).toBe('2 hours');
  });

  it('spokenDuration floors and pluralises', () => {
    expect(spokenDuration(30_000)).toBe('less than a minute');
    expect(spokenDuration(Number.NaN)).toBe('less than a minute');
    expect(spokenDuration(60_000)).toBe('1 minute');
    expect(spokenDuration(119_999)).toBe('1 minute');
    expect(spokenDuration(6 * 60_000)).toBe('6 minutes');
    expect(spokenDuration(60 * 60_000)).toBe('1 hour');
    expect(spokenDuration(61 * 60_000)).toBe('1 hour 1 minute');
    expect(spokenDuration(125 * 60_000)).toBe('2 hours 5 minutes');
  });

  it('spokenDistance handles 1 vs n', () => {
    expect(spokenDistance('1.0 km behind')).toBe('1 kilometre behind');
    expect(spokenDistance('4.2 km behind')).toBe('4.2 kilometres behind');
    expect(spokenDistance('12 km away')).toBe('12 kilometres away');
    expect(spokenDistance('350 m ahead')).toBe('350 metres ahead');
    expect(spokenDistance('Priya · stopped · 1.0 km behind')).toBe('Priya · stopped · 1 kilometre behind');
    expect(spoken('≈1.0 km away')).toBe('about 1 kilometre away');
  });

  it('rowA11y says "1 minute", not "1 minutes"', () => {
    const base = { name: 'Jo', line1: '1.0 km behind', hasPosition: true, leader: false } as const;
    expect(rowA11y({ ...base, status: 'offline', sinceMs: 60_000 })).toBe(
      'Jo, no signal, last seen 1 minute ago, 1 kilometre behind',
    );
    expect(rowA11y({ ...base, status: 'stopped', sinceMs: 61 * 60_000 })).toBe(
      'Jo, 1 kilometre behind, stopped 1 hour 1 minute',
    );
    expect(rowA11y({ ...base, status: 'offline', sinceMs: 3 * 60_000 })).toContain('3 minutes ago');
  });
});
