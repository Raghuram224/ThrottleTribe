import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { BigButton } from '@/components/big-button';
import { Icon, type IconName } from '@/components/icon';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

interface EmptyStateProps {
  icon: IconName;
  title: string;
  body?: string;
  /** Optional secondary button. */
  action?: { label: string; onPress: () => void; icon?: IconName };
}

/** Centred icon 48, title 20/600, body 16 muted (max 3 lines), max width 320 (13 §0.4). */
export function EmptyState({ icon, title, body, action }: EmptyStateProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.root}>
      <Icon name={icon} color={colors.textMuted} size={48} />
      <AppText variant="heading" style={styles.center} maxFontSizeMultiplier={1.3}>
        {title}
      </AppText>
      {body ? (
        <AppText muted numberOfLines={3} style={styles.center} maxFontSizeMultiplier={1.3}>
          {body}
        </AppText>
      ) : null}
      {action ? (
        <View style={styles.action}>
          <BigButton label={action.label} variant="secondary" icon={action.icon} onPress={action.onPress} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: space.sm, paddingVertical: space.lg, maxWidth: 320, alignSelf: 'center' },
  center: { textAlign: 'center' },
  action: { alignSelf: 'stretch', marginTop: space.sm },
});
