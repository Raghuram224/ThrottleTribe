import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/use-theme';

/** Opacity of each third, strongest at the very top: a stepped fade (no gradient library in the app). */
const STEPS = [0.6, 0.35, 0.15] as const;

/**
 * A soft band behind the status bar over a full-bleed map, so the system icons stay readable over bright roads. As tall as
 * the safe-area top inset, the page colour (`bg`: pale in light, near-black in dark) fading out downwards, and never
 * touchable. Draw it above the map and below the floating controls.
 */
export function StatusBarScrim() {
  const { colors } = useTheme();
  const { top } = useSafeAreaInsets();
  if (top <= 0) return null;
  const step = top / STEPS.length;
  return (
    <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={[styles.root, { height: top }]}>
      {STEPS.map((opacity) => (
        <View key={opacity} style={{ height: step, backgroundColor: colors.bg, opacity }} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0 },
});
