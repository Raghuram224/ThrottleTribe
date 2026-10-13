import { setCurrentStyle } from '@/theme/current-style';
import {
  DEFAULT_THEME_STYLE,
  elevate,
  elevation,
  palettes,
  parseThemeStyle,
  resolveTokens,
  resolveTraits,
  styleTraits,
  THEME_STYLES,
  type ThemeStyle,
} from '@/theme/tokens';

describe('theme resolution', () => {
  it('resolves tokens per (style, scheme)', () => {
    expect(resolveTokens('tribe', 'light')).toBe(palettes.tribe.light);
    expect(resolveTokens('tribe', 'dark')).toBe(palettes.tribe.dark);
    expect(resolveTokens('maps', 'dark')).toBe(palettes.maps.dark);
  });

  it('falls back to the default style for an unknown style', () => {
    expect(resolveTokens('nope' as ThemeStyle, 'light')).toBe(palettes[DEFAULT_THEME_STYLE].light);
  });

  it('every style defines every token in both schemes, as strings', () => {
    const keys = Object.keys(palettes.tribe.light).sort();
    for (const style of THEME_STYLES) {
      for (const scheme of ['light', 'dark'] as const) {
        const tokens = palettes[style][scheme];
        expect(Object.keys(tokens).sort()).toEqual(keys);
        for (const v of Object.values(tokens)) expect(typeof v).toBe('string');
      }
    }
  });

  it('parses the stored style and defaults to tribe', () => {
    expect(parseThemeStyle('maps')).toBe('maps');
    expect(parseThemeStyle('tribe')).toBe('tribe');
    expect(parseThemeStyle('garbage')).toBe('tribe');
    expect(parseThemeStyle(null)).toBe('tribe');
  });

  it('tribe dark uses a dark basemap and the route colours from the spec', () => {
    expect(palettes.tribe.dark.mapStyle).toMatch(/styles\/dark$/);
    expect(palettes.tribe.light.mapStyle).toMatch(/styles\/positron$/);
    expect(palettes.tribe.light.routeLine).toBe('#F97316');
    expect(palettes.tribe.dark.routeCasing).toBe('#0B0F14');
    expect(palettes.tribe.dark.routeBeforeId).toBe('highway_name_other');
  });
});

describe('Maps style (17)', () => {
  const STATUS_KEYS = [
    'successTint',
    'movingTint',
    'onMovingTint',
    'stoppedTint',
    'onStoppedTint',
    'onOfflineTint',
    'sosOnBg',
    'wordmarkAccent',
    'meRing',
    'ink',
    'inkRaised',
    'paper',
  ] as const;

  it('keeps status, SOS, identity and ink tokens identical to Tribe in both schemes', () => {
    for (const scheme of ['light', 'dark'] as const) {
      for (const key of STATUS_KEYS) {
        expect({ scheme, key, v: palettes.maps[scheme][key] }).toEqual({ scheme, key, v: palettes.tribe[scheme][key] });
      }
    }
  });

  it('uses the blue accent, liberty / fiord basemaps and their verified route insert layers', () => {
    expect(palettes.maps.light.accent).toBe('#1A73E8');
    expect(palettes.maps.dark.accent).toBe('#8AB4F8');
    expect(palettes.maps.light.mapStyle).toMatch(/styles\/liberty$/);
    expect(palettes.maps.dark.mapStyle).toMatch(/styles\/fiord$/);
    expect(palettes.maps.light.routeBeforeId).toBe('waterway_line_label');
    expect(palettes.maps.dark.routeBeforeId).toBe('water_name');
    expect(palettes.maps.light.convoyBand).not.toBe('transparent');
    expect(palettes.tribe.light.convoyBand).toBe('transparent');
  });

  it('never mentions another map product in a token value', () => {
    for (const style of THEME_STYLES) for (const scheme of ['light', 'dark'] as const) {
      expect(JSON.stringify(palettes[style][scheme]).toLowerCase()).not.toContain('google');
    }
  });
});

describe('style traits', () => {
  it('tribe keeps today shapes; maps is pill, outlined, dot, surface hero', () => {
    expect(resolveTraits('tribe')).toMatchObject({ cardElevation: 'shadow', meMarker: 'arrow', heroCard: 'ink', startIcon: 'mark' });
    expect(resolveTraits('maps')).toMatchObject({
      buttonRadius: 999,
      segRadius: 999,
      cardElevation: 'outline',
      meMarker: 'dot',
      heroCard: 'surface',
      startIcon: 'navigation-variant',
      segThumbShadow: false,
    });
  });

  it('falls back to tribe for an unknown style', () => {
    expect(resolveTraits('x' as ThemeStyle)).toBe(styleTraits.tribe);
  });

  it('elevate: maps draws cards as a 1 dp outline in both schemes, tribe keeps shadow / hairline', () => {
    setCurrentStyle('maps');
    expect(elevate('e1', 'light')).toEqual({ borderWidth: 1, borderColor: '#DADCE0' });
    expect(elevate('e1', 'dark')).toEqual({ borderWidth: 1, borderColor: '#3C4043' });
    // Floating elements keep today's behaviour: shadow in light.
    expect(elevate('e2', 'light')).toBe(elevation.e2);
    setCurrentStyle('tribe');
    expect(elevate('e1', 'light')).toBe(elevation.e1);
    expect(elevate('e1', 'dark')).toMatchObject({ borderColor: 'rgba(255,255,255,0.06)' });
    expect(elevate('e0', 'dark')).toEqual({});
  });
});
