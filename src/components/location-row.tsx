import { Linking, StyleSheet, Text, View } from 'react-native';

import { BigButton } from '@/components/big-button';
import { Icon } from '@/components/icon';
import type { LocationPerm } from '@/hooks/use-planning-position';
import { copy } from '@/lib/copy';
import { family, font, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

interface LocationRowProps {
  perm: LocationPerm;
  onAllow: () => void;
  /** Phone-wide location switch (null = unknown). Off: the row sends the rider to Settings (22 §3.1.5). */
  servicesEnabled?: boolean | null;
  /** Overrides the Where to? wording (the map home uses its own). */
  title?: string;
  body?: string;
  /** A hairline under the row (the search screen's header slot); the sheet has none. */
  divider?: boolean;
}

/** True when the row has something to say: not granted yet, or granted with the phone's location switched off. */
export function locationRowVisible(perm: LocationPerm, servicesEnabled: boolean | null | undefined): boolean {
  if (perm.status === 'unknown') return false;
  return perm.status !== 'granted' || servicesEnabled === false;
}

/**
 * Explain before asking (rule 8, 21 §2.2.1): why location, who receives what, then one button. Search and
 * picking work without it (no bias, no distances). When the OS will not ask again, or the phone's location is
 * off, the button opens system settings; coming back re-reads the permission.
 */
export function LocationRow({ perm, onAllow, servicesEnabled, title, body, divider = true }: LocationRowProps) {
  const { colors } = useTheme();
  if (!locationRowVisible(perm, servicesEnabled)) return null;
  const servicesOff = perm.status === 'granted' && servicesEnabled === false;
  const blocked = perm.status === 'denied' && !perm.canAskAgain;
  const openSettings = servicesOff || blocked;
  const shownTitle = servicesOff ? copy['homeMap.locServicesTitle'] : (title ?? copy['whereTo.locTitle']);
  const shownBody = servicesOff ? copy['homeMap.locServicesBody'] : (body ?? copy['whereTo.locBody']);
  return (
    <View style={[styles.block, divider && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <View style={styles.row}>
        <View style={[styles.tile, { backgroundColor: colors.brandTint }]}>
          <Icon name="permLocation" color={colors.brandOnBg} size={20} />
        </View>
        <View style={styles.texts}>
          <Text maxFontSizeMultiplier={1.3} style={[styles.title, { color: colors.text }]}>
            {shownTitle}
          </Text>
          <Text numberOfLines={4} maxFontSizeMultiplier={1.3} style={[styles.body, { color: colors.textMuted }]}>
            {shownBody}
          </Text>
        </View>
      </View>
      <BigButton
        label={openSettings ? copy['perm.openSettings'] : copy['whereTo.locAllow']}
        variant="secondary"
        onPress={openSettings ? () => void Linking.openSettings().catch(() => {}) : onAllow}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  block: { padding: space.lg, gap: space.md },
  row: { flexDirection: 'row', gap: space.md },
  tile: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1, gap: 2 },
  title: { fontSize: font.md, lineHeight: 22, fontFamily: family.semibold },
  body: { fontSize: font.sm, lineHeight: 20, fontFamily: family.regular },
});
