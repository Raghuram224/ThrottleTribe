import { clusterRingStatus, markerRingStatus, meMarkerMode } from '../marker-style';

describe('marker style', () => {
  it('draws no ring for a moving rider', () => {
    expect(markerRingStatus('moving')).toBeNull();
    expect(markerRingStatus('stopped')).toBe('stopped');
    expect(markerRingStatus('offline')).toBe('offline');
    expect(markerRingStatus('sos')).toBe('sos');
  });

  it('rings a cluster only for its worst non-moving status', () => {
    expect(clusterRingStatus('moving')).toBeNull();
    expect(clusterRingStatus('sos')).toBe('sos');
  });

  it('shows the heading arrow only with a heading and real speed', () => {
    expect(meMarkerMode(null, 10)).toEqual({ kind: 'dot' });
    expect(meMarkerMode(90, 1)).toEqual({ kind: 'dot' });
    expect(meMarkerMode(90, null)).toEqual({ kind: 'dot' });
    expect(meMarkerMode(90, 10)).toEqual({ kind: 'arrow', rotationDeg: 90 });
    expect(meMarkerMode(-90, 10)).toEqual({ kind: 'arrow', rotationDeg: 270 });
    expect(meMarkerMode(450, 10)).toEqual({ kind: 'arrow', rotationDeg: 90 });
  });
});
