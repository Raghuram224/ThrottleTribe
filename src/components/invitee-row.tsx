import { memo, useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Icon } from '@/components/icon';
import { RiderAvatar } from '@/components/rider-avatar';
import { useMotion } from '@/hooks/use-reduce-motion';
import { copy, t } from '@/lib/copy';
import type { InviteState } from '@/lib/invite';
import { initialsOf } from '@/lib/names';
import { family, font, motion, radius, size, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

interface InviteeRowProps {
  /** Invitee id, passed back to `onPress` so the parent can pass one stable handler to every row. */
  id: string;
  name: string;
  /** Formatted phone for display. */
  phone: string;
  /** "5:12 PM". */
  time: string;
  state: InviteState;
  /** The matched rider (state joined or left); primitives so the memoised row stays equal. */
  riderName: string | null;
  riderColorIndex: number;
  onPress: (id: string) => void;
}

/** Invite list row (10 §2): neutral avatar until matched, then the rider's colour; state chip. */
export const InviteeRow = memo(function InviteeRow({
  id,
  name,
  phone,
  time,
  state,
  riderName,
  riderColorIndex,
  onPress,
}: InviteeRowProps) {
  const { colors } = useTheme();
  const meta =
    state === 'invited'
      ? `${phone} · ${t('invite.sentAt', { time })}`
      : t('invite.joinedAs', { rider: riderName ?? name });
  const stateText =
    state === 'joined'
      ? copy['invite.stateJoined']
      : state === 'left'
        ? copy['invite.stateLeft']
        : copy['invite.stateInvited'];
  const label = t('invite.a11yRow', {
    name,
    state: stateText.toLowerCase(),
    meta: state === 'invited' ? t('invite.sentAt', { time }) : t('invite.joinedAs', { rider: riderName ?? name }),
  });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => onPress(id)}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: colors.border, backgroundColor: pressed ? colors.surfacePressed : 'transparent' },
      ]}>
      <MatchAvatar name={name} riderName={riderName} riderColorIndex={riderColorIndex} />
      <View style={styles.texts}>
        <AppText numberOfLines={1} maxFontSizeMultiplier={1.3} style={styles.name}>
          {name}
        </AppText>
        <AppText variant="caption" muted numberOfLines={1} maxFontSizeMultiplier={1.3}>
          {meta}
        </AppText>
      </View>
      {state === 'joined' ? (
        <View style={[styles.chip, { backgroundColor: colors.movingTint }]}>
          <Icon name="ready" color={colors.onMovingTint} size={16} />
          <Text maxFontSizeMultiplier={1.3} style={[styles.chipText, { color: colors.onMovingTint }]}>
            {stateText}
          </Text>
        </View>
      ) : state === 'left' ? (
        <Text maxFontSizeMultiplier={1.3} style={[styles.chipText, { color: colors.textMuted }]}>
          {stateText}
        </Text>
      ) : (
        <View style={[styles.chip, { backgroundColor: colors.surface }]}>
          <Icon name="invited" color={colors.textMuted} size={16} />
          <Text maxFontSizeMultiplier={1.3} style={[styles.chipText, { color: colors.textMuted }]}>
            {stateText}
          </Text>
        </View>
      )}
    </Pressable>
  );
});

/**
 * Neutral initials avatar that crossfades (150 ms) into the rider's coloured avatar when the invitee
 * matches a joined rider (13 §7). Decorative: with Reduce Motion it swaps instantly. A row that
 * mounts already matched starts on the rider avatar, no animation.
 */
function MatchAvatar({
  name,
  riderName,
  riderColorIndex,
}: {
  name: string;
  riderName: string | null;
  riderColorIndex: number;
}) {
  const { colors } = useTheme();
  const { duration } = useMotion();
  const matched = riderName !== null;
  const [mix] = useState(() => new Animated.Value(matched ? 1 : 0));

  useEffect(() => {
    Animated.timing(mix, {
      toValue: matched ? 1 : 0,
      duration: duration(motion.fast),
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [matched, mix, duration]);

  return (
    <View style={styles.avatarBox}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.avatar,
          styles.layer,
          { backgroundColor: colors.surface, opacity: mix.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) },
        ]}>
        <Text allowFontScaling={false} style={[styles.initials, { color: colors.textMuted }]}>
          {initialsOf(name)}
        </Text>
      </Animated.View>
      <Animated.View style={[styles.layer, { opacity: mix }]}>
        <RiderAvatar name={riderName ?? name} colorIndex={riderColorIndex} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: size.rowMember,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatarBox: { width: size.avatar, height: size.avatar },
  layer: { position: 'absolute', top: 0, left: 0 },
  avatar: {
    width: size.avatar,
    height: size.avatar,
    borderRadius: size.avatar / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { fontSize: font.sm, fontFamily: family.bold },
  texts: { flex: 1, gap: 2 },
  name: { fontSize: font.md, fontFamily: family.semibold },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.pill,
    height: 32,
    paddingHorizontal: space.md - 2,
  },
  chipText: { fontSize: font.sm, lineHeight: 20, fontFamily: family.semibold },
});
