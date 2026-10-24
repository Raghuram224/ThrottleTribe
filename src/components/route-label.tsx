import { StyleSheet, Text, View } from 'react-native';

import { family, font, fontNumeric, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

/**
 * The duration on a route line (Google Maps): "42 min" in a pill. The chosen route's pill is the route colour, the others
 * sit on a plain surface with a border. The word is the label, so colour is never the only difference (the chosen route
 * also has a heavier outline). The 8 dp margin is transparent and only widens the touch area; the Marker takes the press.
 */
export function RouteLabel({ text, selected }: { text: string; selected: boolean }) {
  const { colors } = useTheme();
  return (
    <View pointerEvents="none" style={styles.hit}>
      <View
        style={[
          styles.pill,
          selected
            ? { backgroundColor: colors.navRoute, borderColor: colors.navRouteCasing, borderWidth: 2 }
            : { backgroundColor: colors.surfaceRaised, borderColor: colors.borderStrong, borderWidth: 1 },
        ]}>
        <Text maxFontSizeMultiplier={1.3} style={[styles.text, { color: selected ? colors.onNavRoute : colors.text }]}>
          {text}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hit: { padding: space.sm },
  pill: { minHeight: 32, paddingHorizontal: space.md, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  text: { ...fontNumeric, fontSize: font.sm, lineHeight: 20, fontFamily: family.bold },
});
