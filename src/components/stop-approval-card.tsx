import { StyleSheet, Text, View } from 'react-native';

import { BigButton } from '@/components/big-button';
import { Icon } from '@/components/icon';
import { copy, t } from '@/lib/copy';
import type { PlaceCategory } from '@/lib/place-search';
import { breakIcon } from '@/lib/stop-ui';
import { family, font, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

interface StopApprovalCardProps {
  /** approvalCardModel().text: "Priya suggests a break · Cafe · 2.1 km". */
  text: string;
  kind: 'break' | 'destination';
  category: PlaceCategory | null;
  moreCount: number;
  /** Which button is in flight; both are disabled meanwhile. */
  busy: 'accept' | 'decline' | null;
  onAccept: () => void;
  onDecline: () => void;
}

/**
 * Leader approval card (19 A): sits in the ride banner stack, never behind the 2-banner cap, and
 * stays until decided. Accept is primary; "+N more" shows when other proposals wait behind it.
 */
export function StopApprovalCard({ text, kind, category, moreCount, busy, onAccept, onDecline }: StopApprovalCardProps) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.root, { backgroundColor: colors.surfaceRaised, borderBottomColor: colors.border }]}>
      <View style={styles.head}>
        <Icon name={kind === 'destination' ? 'flag' : breakIcon(category)} color={colors.brandOnBg} size={20} />
        <Text numberOfLines={2} maxFontSizeMultiplier={1.3} style={[styles.text, { color: colors.text }]}>
          {text}
        </Text>
        {moreCount > 0 ? (
          <View style={[styles.more, { backgroundColor: colors.surface }]}>
            <Text maxFontSizeMultiplier={1.3} style={[styles.moreText, { color: colors.textMuted }]}>
              {t('stop.more', { n: moreCount })}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.buttons}>
        <View style={styles.button}>
          <BigButton
            label={copy['stop.accept']}
            loading={busy === 'accept'}
            disabled={busy === 'decline'}
            onPress={onAccept}
          />
        </View>
        <View style={styles.button}>
          <BigButton
            label={copy['stop.decline']}
            variant="secondary"
            loading={busy === 'decline'}
            disabled={busy === 'accept'}
            onPress={onDecline}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.md, borderBottomWidth: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  text: { flex: 1, fontSize: font.md, fontFamily: family.bold },
  more: { borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.xs },
  moreText: { fontSize: font.xs, fontFamily: family.semibold },
  buttons: { flexDirection: 'row', gap: space.md },
  button: { flex: 1 },
});
