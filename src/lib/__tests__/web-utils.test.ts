import {
  isIosUserAgent,
  pausedText,
  positionToRow,
  RESUME_THRESHOLD_MS,
  sampleDue,
  shouldShowResume,
  smsUrl,
} from '../web/web-utils';

describe('web utils', () => {
  it('words the paused banner in seconds or minutes', () => {
    expect(pausedText(45_000)).toBe('Sharing paused for 45 sec while this page was hidden');
    expect(pausedText(4 * 60_000)).toBe('Sharing paused for 4 min while this page was hidden');
  });

  it('shows the resume banner only after the threshold', () => {
    expect(shouldShowResume(null)).toBe(false);
    expect(shouldShowResume(RESUME_THRESHOLD_MS)).toBe(false);
    expect(shouldShowResume(RESUME_THRESHOLD_MS + 1)).toBe(true);
  });

  it('builds sms links with several recipients and an encoded body', () => {
    expect(smsUrl(['+91 98765 43210', '112'], 'Help & "now"')).toBe(
      'sms:+919876543210,112?&body=Help%20%26%20%22now%22',
    );
  });

  it('detects iPhone and iPadOS user agents', () => {
    expect(isIosUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(true);
    expect(isIosUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe(true);
    expect(isIosUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe(false);
    expect(isIosUserAgent('Mozilla/5.0 (Linux; Android 14)')).toBe(false);
  });

  it('maps a browser position to an upload row, nulling unknown values', () => {
    const row = positionToRow(
      'r1',
      { timestamp: 1_700_000_000_000, coords: { latitude: 1, longitude: 2, accuracy: 8, speed: null, heading: NaN } },
      'active',
      0.5,
    );
    expect(row).toEqual({
      ride_id: 'r1',
      recorded_at: '2023-11-14T22:13:20.000Z',
      lat: 1,
      lng: 2,
      accuracy_m: 8,
      speed_mps: null,
      heading: null,
      app_state: 'active',
      battery: 0.5,
    });
  });

  it('throttles samples', () => {
    expect(sampleDue(0, 3999)).toBe(false);
    expect(sampleDue(0, 4000)).toBe(true);
  });
});
