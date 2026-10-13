import { routeBeforeId, type StyleLayerLike } from '../route-style';

const L = (id: string, type: string, src?: string): StyleLayerLike => ({ id, type, 'source-layer': src });

describe('routeBeforeId', () => {
  it('picks the first symbol layer after the last road, not the first symbol layer', () => {
    const layers = [
      L('background', 'background'),
      L('water_name', 'symbol', 'water_name'), // under the roads in the dark style
      L('road_a', 'line', 'transportation'),
      L('building', 'fill', 'building'),
      L('highway_name_other', 'symbol', 'transportation_name'),
      L('place_label', 'symbol', 'place'),
    ];
    expect(routeBeforeId(layers)).toBe('highway_name_other');
  });

  it('ignores non-geometry transportation symbols when finding the last road', () => {
    const layers = [L('road', 'line', 'transportation'), L('road_label', 'symbol', 'transportation'), L('poi', 'symbol', 'poi')];
    expect(routeBeforeId(layers)).toBe('road_label');
  });

  it('returns undefined when no label follows the roads (route goes on top)', () => {
    expect(routeBeforeId([L('road', 'line', 'transportation')])).toBeUndefined();
  });

  it('without any road layer uses the first symbol layer', () => {
    expect(routeBeforeId([L('bg', 'background'), L('label', 'symbol', 'place')])).toBe('label');
  });
});
