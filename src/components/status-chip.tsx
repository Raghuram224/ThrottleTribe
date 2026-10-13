import { StyleSheet, Text } from 'react-native';
import Animated from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { chipEnter } from '@/components/motion-presets';
import { statusText } from '@/lib/copy';
import { formatDuration } from '@/lib/format';
import type { RiderStatus } from '@/lib/rider-status';
import { family, font, radius, space } from '@/theme/tokens';
import { statusColors, useTheme } from '@/theme/use-theme';

interface StatusChipProps {
  status: RiderStatus;
  /** How long in this state; null/undefined = unknown. Offline with null reads "No signal yet". */
  sinceMs?: number | null;
  size?: 'md' | 'sm';
  /** Leave the age out of the text (dense rows show it elsewhere so the distance never truncates). */
  hideDuration?: boolean;
}

/**
 * Colour, icon and text together: status must never rely on colour alone. Moving is a quiet tint chip
 * (onboarding preview only; live rows draw none, 16 §2.2). Stopped is a filled amber chip with its
 * age; offline is an OUTLINE chip (a filled grey one read as disabled and close to stopped).
 */
export function StatusChip({ status, sinceMs, size = 'md', hideDuration = false }: StatusChipProps) {
  const { colors } = useTheme();
  const duration = sinceMs != null && status !== 'moving' && !hideDuration ? formatDuration(sinceMs) : null;
  // "Stopped 6 min" on a chip: the dot separator is for running text.
  const text = statusText(status, duration, status === 'offline' && sinceMs == null).replace(' · ', ' ');
  const quiet = status === 'moving';
  const outline = status === 'offline';
  const { bg, fg } = quiet
    ? { bg: colors.movingTint, fg: colors.onMovingTint }
    : outline
      ? { bg: colors.surfaceRaised, fg: colors.onOfflineTint }
      : statusColors(status);
  // Quiet and outline chips are 14 / 32 / icon 16. Filled chips are 15 / 36 / icon 18 (14 / 32 / 16 in dense rows).
  const compact = quiet || outline || size === 'sm';

  return (
    <Animated.View
      entering={chipEnter}
      accessible
      accessibilityLabel={text}
      style={[
        styles.chip,
        compact ? styles.chipSm : styles.chipMd,
        { backgroundColor: bg },
        outline && { borderWidth: 1.5, borderColor: colors.status.offline },
      ]}>
      <Icon name={status} color={fg} size={compact ? 16 : 18} />
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
        style={[compact ? styles.textSm : styles.textMd, { color: fg }]}>
        {text}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  chip: { alignSelf: 'flex-start', flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: space.xs, borderRadius: radius.pill },
  chipMd: { height: 36, paddingHorizontal: space.md },
  chipSm: { height: 32, paddingHorizontal: space.md - 2 },
  textMd: { fontSize: 15, lineHeight: 22, fontFamily: family.semibold },
  textSm: { fontSize: font.sm, lineHeight: 20, fontFamily: family.semibold },
});
