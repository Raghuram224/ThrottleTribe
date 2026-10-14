import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Icon } from '@/components/icon';
import type { ConnectionState } from '@/hooks/use-connection';
import { copy } from '@/lib/copy';
import { haptic } from '@/lib/haptics';
import { family, font, radius, space, touchTarget } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

interface RideHeaderProps {
  name: string;
  /** "Lobby · 4 riders" in the lobby, the elapsed time ("1 h 24 min") once the ride is live. */
  meta: string;
  connection: ConnectionState;
  onBack: () => void;
  onMenu: () => void;
  /** Live rides: stop search (20 C2). Shown only while connected; the connection pill takes its place otherwise. */
  onSearch?: () => void;
}

/** Ride header (00 §2.3, 20 C2): back, name + meta, connection pill or search, menu. 60 tall. */
export function RideHeader({ name, meta, connection, onBack, onMenu, onSearch }: RideHeaderProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: colors.surfaceRaised, borderBottomColor: colors.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy['common.back']}
        onPress={onBack}
        style={styles.touch}>
        <Icon name="back" color={colors.text} size={28} />
      </Pressable>
      <View style={styles.titles}>
        <AppText variant="bodyStrong" numberOfLines={1} maxFontSizeMultiplier={1.3}>
          {name}
        </AppText>
        <AppText variant="caption" muted numeric numberOfLines={1} maxFontSizeMultiplier={1.3}>
          {meta}
        </AppText>
      </View>
      {/* Healthy = silent: the me row says "Sharing". Only a problem earns a pill. */}
      {connection === 'live' ? null : <ConnectionPill state={connection} />}
      {onSearch && connection === 'live' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy['search.headerA11y']}
          onPress={() => {
            // Act first: feedback must never be able to delay or swallow the action.
            onSearch();
            haptic('select');
          }}
          style={styles.touch}>
          <Icon name="search" color={colors.text} size={24} />
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Ride menu"
        onPress={onMenu}
        style={styles.touch}>
        <Icon name="menu" color={colors.text} size={24} />
      </Pressable>
    </View>
  );
}

function ConnectionPill({ state }: { state: ConnectionState }) {
  const { colors } = useTheme();
  const label = state === 'connecting' ? copy['live.connConnecting'] : copy['live.connOffline'];
  const fg = colors.onStatus.offline;
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={[styles.pill, { backgroundColor: colors.status.offline }]}>
      <Icon name="offline" color={fg} size={16} />
      <Text maxFontSizeMultiplier={1.3} style={[styles.pillText, { color: fg }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  touch: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  titles: { flex: 1, justifyContent: 'center' },
  pill: {
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
  },
  pillText: { fontSize: font.sm, lineHeight: 20, fontFamily: family.semibold },
});
