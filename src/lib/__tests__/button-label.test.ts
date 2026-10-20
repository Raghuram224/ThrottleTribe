import { buttonA11yLabel, buttonText } from '../button-label';

describe('a loading button keeps its words (26 E1)', () => {
  it('shows the loading label while loading, and the label otherwise', () => {
    expect(buttonText({ label: 'End ride', loading: true, loadingLabel: 'Ending ride…' })).toBe('Ending ride…');
    expect(buttonText({ label: 'End ride', loading: false, loadingLabel: 'Ending ride…' })).toBe('End ride');
  });
  it('without a loading label the label stays (never empty)', () => {
    expect(buttonText({ label: 'Starting…', loading: true })).toBe('Starting…');
  });
  it('the spoken label becomes the loading text; idle prefers the explicit label', () => {
    expect(buttonA11yLabel({ label: 'End ride', loading: true, loadingLabel: 'Ending ride…', accessibilityLabel: 'End the ride' })).toBe('Ending ride…');
    expect(buttonA11yLabel({ label: 'Start ride', accessibilityLabel: 'Start riding to Mysuru' })).toBe('Start riding to Mysuru');
    expect(buttonA11yLabel({ label: 'Start ride' })).toBe('Start ride');
  });
});
