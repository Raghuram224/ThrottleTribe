import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Icon } from '@/components/icon';
import { haptic } from '@/lib/haptics';
import { family, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

interface ErrorTextProps {
  children: ReactNode;
  /** Announce immediately (form submit errors) instead of politely. */
  assertive?: boolean;
  /** Bold, centred (the join code error). */
  emphasis?: boolean;
}

/** Inline error line: warning icon + text. The icon is hidden from screen readers; the words carry it. */
export function ErrorText({ children, assertive, emphasis }: ErrorTextProps) {
  const { colors } = useTheme();
  // 13 §0.3: an error line appearing buzzes once. Screens must not add their own error haptic.
  useEffect(() => {
    haptic('error');
  }, []);
  return (
    <View style={[styles.row, emphasis && styles.center]}>
      <Icon name="warning" color={colors.text} size={20} />
      <AppText
        accessibilityLiveRegion={assertive ? 'assertive' : 'polite'}
        style={[styles.text, emphasis && styles.bold]}>
        {children}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  center: { justifyContent: 'center', alignItems: 'center' },
  text: { flexShrink: 1 },
  bold: { fontFamily: family.bold, textAlign: 'center' },
});
