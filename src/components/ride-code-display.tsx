import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { copy, groupCode, t, spokenCode } from '@/lib/copy';
import { haptic } from '@/lib/haptics';
import { space } from '@/theme/tokens';

interface RideCodeDisplayProps {
  code: string;
  /** Long-press shares the code. */
  onLongPress?: () => void;
}

/** The ride code as the largest text on the lobby: "483 259", tabular, wide letter-spacing. */
export function RideCodeDisplay({ code, onLongPress }: RideCodeDisplayProps) {
  return (
    <Pressable
      accessible
      accessibilityLabel={t('lobby.a11yCode', { digits: spokenCode(code) })}
      onLongPress={() => {
        if (!onLongPress) return;
        haptic('light'); // 13 §0.3: long-press share on the code
        onLongPress();
      }}
      style={styles.wrap}>
      <View>
        <AppText variant="label" muted>
          {copy['lobby.codeLabel']}
        </AppText>
        <AppText variant="display" numeric style={styles.code} maxFontSizeMultiplier={1.3}>
          {groupCode(code)}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  // Display scale with extra tracking: codes read better spaced.
  code: { letterSpacing: 2 },
});
