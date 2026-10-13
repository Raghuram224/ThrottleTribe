import { StyleSheet } from 'react-native';

import { AppText } from '@/components/app-text';
import { space } from '@/theme/tokens';

/** 12/700 uppercase muted label with 24 above and 8 below (13 §0.4). */
export function SectionLabel({ children }: { children: string }) {
  return (
    <AppText variant="label" muted accessibilityRole="header" style={styles.label} maxFontSizeMultiplier={1.3}>
      {children}
    </AppText>
  );
}

const styles = StyleSheet.create({
  label: { marginTop: space.xl, marginBottom: space.sm },
});
