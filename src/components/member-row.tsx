import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Icon } from '@/components/icon';
import { RiderAvatar } from '@/components/rider-avatar';
import { copy } from '@/lib/copy';
import { splitNameTag } from '@/lib/names';
import type { Readiness } from '@/lib/lobby';
import { family, font, radius, size, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

interface MemberRowProps {
  name: string;
  colorIndex: number;
  isMe?: boolean;
  isLeader?: boolean;
  /** `notSharing` is only for my own row when location is denied. */
  state: Readiness | 'notSharing';
}

const SPOKEN = {
  ready: 'ready',
  connected: 'connected',
  away: 'away',
  notSharing: 'not sharing location',
} as const;

/** Lobby row (05): 64 tall, avatar without status ring, name, leader tag, readiness on the right. */
export const MemberRow = memo(function MemberRow({ name, colorIndex, isMe, isLeader, state }: MemberRowProps) {
  const { colors } = useTheme();
  const { base, tag } = splitNameTag(name);
  const label = [name, isMe ? 'you' : null, isLeader ? 'leader' : null, SPOKEN[state]]
    .filter(Boolean)
    .join(', ');

  return (
    <View
      accessible
      accessibilityLabel={label}
      style={[styles.row, { borderBottomColor: colors.border }]}>
      <RiderAvatar name={name} colorIndex={colorIndex} me={isMe} />
      <View style={styles.names}>
        <AppText numberOfLines={1} maxFontSizeMultiplier={1.3} style={styles.name}>
          {base}
          {tag ? <Text style={{ color: colors.textSubtle, fontFamily: family.regular, fontSize: font.sm }}> {tag}</Text> : null}
          {isMe ? <Text style={{ color: colors.textMuted, fontFamily: family.regular }}> {copy['lobby.you']}</Text> : null}
        </AppText>
        {isLeader ? (
          <View style={[styles.tag, { backgroundColor: colors.surface }]}>
            <Icon name="leader" color={colors.text} size={12} />
            <Text maxFontSizeMultiplier={1.3} style={[styles.tagText, { color: colors.text }]}>
              {copy['lobby.leaderTag']}
            </Text>
          </View>
        ) : null}
      </View>
      <ReadinessBadge state={state} />
    </View>
  );
});

function ReadinessBadge({ state }: { state: MemberRowProps['state'] }) {
  const { colors } = useTheme();
  if (state === 'ready') {
    return (
      <View style={[styles.chip, { backgroundColor: colors.movingTint }]}>
        <Icon name="ready" color={colors.onMovingTint} size={16} />
        <Text maxFontSizeMultiplier={1.3} style={[styles.chipText, { color: colors.onMovingTint }]}>
          {copy['lobby.ready']}
        </Text>
      </View>
    );
  }
  if (state === 'notSharing') {
    return (
      <View style={[styles.chip, { backgroundColor: colors.status.stopped }]}>
        <Icon name="notSharing" color={colors.onStatus.stopped} size={16} />
        <Text maxFontSizeMultiplier={1.3} style={[styles.chipText, { color: colors.onStatus.stopped }]}>
          {copy['lobby.notSharing']}
        </Text>
      </View>
    );
  }
  const connected = state === 'connected';
  const tint = connected ? colors.text : colors.textMuted;
  return (
    <View style={styles.inline}>
      <Icon name={connected ? 'connected' : 'away'} color={tint} size={12} />
      <Text maxFontSizeMultiplier={1.3} style={[styles.chipText, { color: tint }]}>
        {connected ? copy['lobby.connected'] : copy['lobby.away']}
      </Text>
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
  names: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  name: { flexShrink: 1, fontSize: font.md, fontFamily: family.semibold },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
  tagText: { fontSize: font.xs, lineHeight: 16, fontFamily: family.semibold },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
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
