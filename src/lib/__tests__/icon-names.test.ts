import glyphMap from '@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json';

import { ICON_GLYPHS } from '../icon-names';

describe('icon names', () => {
  it('every glyph exists in the MaterialCommunityIcons glyph map', () => {
    const map = glyphMap as Record<string, number>;
    for (const [semantic, glyph] of Object.entries(ICON_GLYPHS)) {
      expect({ semantic, glyph, exists: glyph in map }).toEqual({ semantic, glyph, exists: true });
    }
  });
});
