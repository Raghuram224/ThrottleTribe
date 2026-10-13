// File name kept from the contacts-only card; it now renders the single Home nudge (contacts or
// save account). The old per-card state moved to store/nudge-store.ts.
import { router } from 'expo-router';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { copy } from '@/lib/copy';
import type { NudgeKind } from '@/lib/home';
import { href } from '@/lib/nav';
import { useNudgeStore } from '@/store/nudge-store';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

/**
 * The one nudge card on Home (13 §3; 11 §4, 12 §4). Which kind to show is decided by `pickNudge`
 * (lib/home.ts), never both. Secondary button, so "Start a ride" keeps the one primary action.
 * "Later" hides it until the next ride ends.
 */
export const NudgeCard = memo(function NudgeCard({ kind }: { kind: NudgeKind }) {
  const { colors } = useTheme();
  const contacts = kind === 'contacts';
  // One row (16 §3): the brand tile carries the colour, no accent bar. The small close = "Later".
  return (
    <Card gap={space.md}>
      <View style={styles.head}>
        <View style={[styles.tile, { backgroundColor: colors.brandTint }]}>
          <Icon name={contacts ? 'shield' : 'cloudSave'} color={colors.brandOnBg} size={22} />
        </View>
        <View style={styles.texts}>
          <AppText variant="bodyStrong" maxFontSizeMultiplier={1.3}>
            {contacts ? copy['nudge.contactsTitle'] : copy['nudge.saveTitle']}
          </AppText>
          <AppText variant="caption" muted maxFontSizeMultiplier={1.3}>
            {contacts ? copy['nudge.contactsBody'] : copy['nudge.saveBody']}
          </AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={contacts ? copy['nudge.contactsCta'] : copy['nudge.saveCta']}
          hitSlop={8}
          onPress={() => router.push(href(contacts ? '/emergency-contacts' : '/auth/identify?mode=save'))}
          style={styles.cta}>
          <AppText variant="bodyStrong" maxFontSizeMultiplier={1.3} style={{ color: colors.brandOnBg }}>
            {contacts ? copy['nudge.addShort'] : copy['nudge.saveShort']}
          </AppText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy['nudge.later']}
          hitSlop={8}
          onPress={() => useNudgeStore.getState().dismiss(kind)}
          style={styles.close}>
          <Icon name="close" color={colors.textSubtle} size={20} />
        </Pressable>
      </View>
    </Card>
  );
});

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  tile: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1, gap: 2 },
  cta: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.xs },
  close: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },
});
