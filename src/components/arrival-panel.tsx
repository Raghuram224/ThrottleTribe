import { StyleSheet, Text, View } from 'react-native';

import { BigButton } from '@/components/big-button';
import { Icon } from '@/components/icon';
import { INFO_TILE } from '@/components/stop-card';
import { copy, t } from '@/lib/copy';
import { STOP_CARD_H } from '@/lib/live-sheet';
import { family, font, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

interface ArrivalPanelProps {
  /** The destination's name. */
  name: string;
  onPickNext: () => void;
  /** Opens the End ride confirm; the panel never ends anything by itself. */
  onEnd: () => void;
  /**
   * Alone in the ride but not its leader (the leader is gone): only the leader can end a ride, so the last
   * button is "Leave ride" and `onEnd` opens the leave confirm instead.
   */
  leaveInstead?: boolean;
}

/**
 * Solo arrival (21 §2.8): the "You've arrived" card and the two choices, replacing the stop card and the
 * invite row inside the solo sheet (216 dp, `ARRIVAL_PANEL_H`). Pick next destination is secondary, End ride
 * is primary and lowest (nearest the thumb); End ride only asks, the layout's confirm ends it.
 */
export function ArrivalPanel({ name, onPickNext, onEnd, leaveInstead = false }: ArrivalPanelProps) {
  const { colors } = useTheme();
  return (
    <>
      <View accessible accessibilityLabel={t('nav.a11yArrived', { place: name })} style={styles.card}>
        <View style={[styles.tile, { backgroundColor: colors.navRoute }]}>
          <Icon name="checkCircle" color={colors.onNavRoute} size={20} />
        </View>
        <View style={styles.texts}>
          <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.line, { color: colors.text }]}>
            {copy['stop.arrived']}
          </Text>
          <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.sub, { color: colors.textMuted }]}>
            {name}
          </Text>
        </View>
      </View>
      <View style={styles.actions}>
        <BigButton label={copy['nav.pickNext']} variant="secondary" icon="mapSearch" onPress={onPickNext} />
        <BigButton
          label={leaveInstead ? copy['live.menuLeave'] : copy['live.menuEnd']}
          icon={leaveInstead ? 'leave' : 'endRide'}
          onPress={onEnd}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    height: STOP_CARD_H,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
  },
  tile: { width: INFO_TILE, height: INFO_TILE, borderRadius: INFO_TILE / 2, alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1, justifyContent: 'center' },
  line: { fontSize: font.lg, lineHeight: 26, fontFamily: family.semibold },
  sub: { fontSize: font.sm, lineHeight: 20, fontFamily: family.regular },
  // 12 above the first button, 12 between, 8 below: 12 + 56 + 12 + 56 + 8 (ARRIVAL_ACTIONS_H).
  actions: { gap: space.md, paddingTop: space.md, paddingHorizontal: space.lg, paddingBottom: space.sm },
});
