import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useToastStore } from '@/store/toast-store';
import { elevate, family, font, radius, size, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

/** Renders the current toast as an inverted pill (e2) above the bottom controls. Mount once, in the root layout. */
export function ToastHost() {
  const toast = useToastStore((s) => s.toast);
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  if (!toast) return null;
  return (
    <View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[styles.wrap, { bottom: insets.bottom + size.actionBar + space.xl }]}>
      <View style={[styles.pill, { backgroundColor: colors.toastBg }, elevate('e2', scheme)]}>
        <Text maxFontSizeMultiplier={1.3} style={[styles.text, { color: colors.toastText }]}>
          {toast.text}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: space.lg, right: space.lg, alignItems: 'center' },
  pill: {
    borderRadius: radius.lg,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    maxWidth: '100%',
    elevation: 6,
  },
  text: { fontSize: font.sm, lineHeight: 20, fontFamily: family.semibold, textAlign: 'center' },
});
