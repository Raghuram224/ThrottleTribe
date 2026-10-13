import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { copy, fill } from '@/lib/copy';
import { formatPhone, spokenPhone, type CallItem } from '@/lib/emergency-contacts';
import { haptic } from '@/lib/haptics';
import { showToast } from '@/store/toast-store';
import { family, font, fontNumeric, radius, size, space, touchTarget } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

/** Opens the dialer with the number filled in. No CALL_PHONE permission: the rider taps call there. */
export function dial(phone: string): void {
  haptic('medium', { safety: true });
  Linking.openURL(`tel:${phone}`).catch(() =>
    showToast(fill(copy['sosMe.callFail'], { phone: formatPhone(phone) })),
  );
}

/**
 * filled = strongest (SOS red fill), outline = other calls on the sender panel (2 px sosOnBg border),
 * onRed = receiver takeover (white outline on the red screen, 72 tall).
 */
export type CallButtonVariant = 'filled' | 'outline' | 'onRed';

export function SosCallButton({ item, variant }: { item: CallItem; variant: CallButtonVariant }) {
  const { colors } = useTheme();
  const filled = variant === 'filled';
  const onRed = variant === 'onRed';
  const fg = filled ? colors.onStatus.sosStrong : onRed ? colors.onStatus.sosStrong : colors.sosOnBg;
  const border = onRed ? colors.onStatus.sosStrong : colors.sosOnBg;
  const spoken = `${item.label}${item.sub && item.sub !== formatPhone(item.phone) ? `, ${item.sub}` : ''}, ${spokenPhone(item.phone)}`;

  // Takeover rows (14 §2): name left, number right, one 56 line. 112 is the always-there row: faint white fill.
  const compact = onRed && item.title !== undefined && item.number !== undefined;
  const is112 = item.key === 'builtin-112';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spoken}
      onPress={() => dial(item.phone)}
      style={({ pressed }) => [
        styles.button,
        { height: compact ? touchTarget : onRed ? 72 : size.rowLive, opacity: pressed ? 0.8 : 1 },
        filled
          ? { backgroundColor: colors.status.sosStrong }
          : {
              backgroundColor: is112 && compact ? 'rgba(255,255,255,0.15)' : onRed ? 'transparent' : colors.bg,
              borderWidth: 2,
              borderColor: compact ? 'rgba(255,255,255,0.6)' : border,
            },
      ]}>
      <Icon name="call" color={fg} size={24} />
      {compact ? (
        <>
          <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[styles.title, { color: fg }]}>
            {item.title}
          </Text>
          <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[styles.number, { color: fg }, fontNumeric]}>
            {item.number}
          </Text>
        </>
      ) : (
        <View style={styles.text}>
          <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[styles.label, { color: fg }]}>
            {item.label}
          </Text>
          {item.sub ? (
            <Text
              maxFontSizeMultiplier={1.3}
              numberOfLines={1}
              style={[styles.sub, { color: fg, opacity: filled || onRed ? 0.9 : 1 }]}>
              {item.sub}
            </Text>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
  },
  text: { flex: 1 },
  label: { fontSize: font.lg, fontFamily: family.bold },
  sub: { fontSize: font.sm, fontFamily: family.regular },
  title: { flex: 1, fontSize: font.md, lineHeight: 22, fontFamily: family.semibold },
  number: { fontSize: font.sm, lineHeight: 20, fontFamily: family.regular, textAlign: 'right' },
});
