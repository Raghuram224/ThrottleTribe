import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Skeleton } from '@/components/skeleton';
import { Icon, type IconName } from '@/components/icon';
import { copy, fill } from '@/lib/copy';
import { elevate, family, font, radius, size, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

interface StatTileProps {
  value: string;
  label: string;
  /** Icon 20 above the value. */
  icon?: IconName;
  /** Value not known yet: a skeleton bar instead of a misleading "—". */
  loading?: boolean;
}

/** 96 tall raised tile (e1, no border): value 28 bold tabular, label 14 muted (14 §6). Read as one phrase. */
export function StatTile({ value, label, icon, loading }: StatTileProps) {
  const { colors, scheme } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={loading ? label : fill(copy['summary.a11yTile'], { label, value })}
      style={[
        styles.tile,
        { backgroundColor: colors.surfaceRaised },
        elevate('e1', scheme),
      ]}>
      {icon ? <Icon name={icon} color={colors.textMuted} size={20} /> : null}
      {loading ? (
        <View style={styles.valueSkeleton}>
          <Skeleton height={font.xl} width={48} />
        </View>
      ) : (
        <AppText numeric numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.3} style={styles.value}>
          {value}
        </AppText>
      )}
      <AppText variant="caption" muted numberOfLines={1} maxFontSizeMultiplier={1.3}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minHeight: size.statTile,
    borderRadius: radius.lg,
    padding: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  valueSkeleton: { height: font.xl + 6, justifyContent: 'center' },
  value: { fontSize: font.xl, fontFamily: family.bold },
});
