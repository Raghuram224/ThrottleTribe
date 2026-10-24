import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Sheet } from '@/components/sheet';
import { useNow } from '@/hooks/use-now';
import { copy, errorText, t } from '@/lib/copy';
import { haptic } from '@/lib/haptics';
import { MESSAGE_KINDS, QUICK_MESSAGE_KINDS, type MessageKind } from '@/lib/message-kinds';
import { cooldownLeft } from '@/lib/quick-message';
import { sendMessage, toRideError } from '@/lib/ride-api';
import { showToast } from '@/store/toast-store';
import { family, font, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

/**
 * The one-tap messages (06 §5): `open()` shows the sheet, a pick sends it. A kind is disabled for 10 s after sending, and
 * there is no offline queue (a stale "Regroup" is worse than none). `sheet` goes in the tree.
 */
export function useQuickMessages(rideId: string): { open: () => void; sheet: ReactNode } {
  const [msgOpen, setMsgOpen] = useState(false);
  const [cooldowns, setCooldowns] = useState<Partial<Record<MessageKind, number>>>({});

  const send = async (kind: MessageKind) => {
    setMsgOpen(false);
    setCooldowns((c) => ({ ...c, [kind]: Date.now() }));
    try {
      await sendMessage(rideId, kind);
      haptic('success');
      const { icon, label } = MESSAGE_KINDS[kind];
      showToast(t('live.msgSent', { icon, label }));
    } catch (e) {
      // No offline queue: a stale "Regroup" is worse than none (06 §5).
      setCooldowns((c) => ({ ...c, [kind]: undefined }));
      showToast(errorText(toRideError(e).code));
    }
  };

  const sheet = (
    <Sheet visible={msgOpen} onClose={() => setMsgOpen(false)}>
      <QuickMessages cooldowns={cooldowns} onPick={(k) => void send(k)} />
    </Sheet>
  );
  return { open: () => setMsgOpen(true), sheet };
}

/** 2x3 grid of one-tap messages (06 §5). A kind is disabled for 10 s after sending. */
function QuickMessages({
  cooldowns,
  onPick,
}: {
  cooldowns: Partial<Record<MessageKind, number>>;
  onPick: (kind: MessageKind) => void;
}) {
  const { colors } = useTheme();
  const now = useNow(1000);
  return (
    <View style={styles.msgSheet}>
      <AppText variant="heading" style={styles.msgTitle}>
        {copy['live.msgTitle']}
      </AppText>
      <View style={styles.grid}>
        {QUICK_MESSAGE_KINDS.map((kind) => {
          const { icon, label } = MESSAGE_KINDS[kind];
          const cooling = cooldownLeft(cooldowns[kind], now) > 0;
          return (
            <Pressable
              key={kind}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ disabled: cooling }}
              disabled={cooling}
              onPressIn={() => haptic('select')}
              onPress={() => onPick(kind)}
              style={[styles.tile, { backgroundColor: colors.surface, opacity: cooling ? 0.5 : 1 }]}>
              <Text allowFontScaling={false} style={styles.tileIcon}>
                {icon}
              </Text>
              <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[styles.tileLabel, { color: colors.text }]}>
                {cooling ? copy['live.msgSentTile'] : label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  msgSheet: { gap: space.md },
  msgTitle: { fontFamily: family.semibold },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    height: 100,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  tileIcon: { fontSize: 36 },
  tileLabel: { fontSize: font.md, fontFamily: family.semibold },
});
