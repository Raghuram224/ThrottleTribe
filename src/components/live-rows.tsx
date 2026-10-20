import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { AppText } from '@/components/app-text';
import { Icon } from '@/components/icon';
import { MeMarker } from '@/components/me-marker';
import { rowEnter, rowExit, rowLayout } from '@/components/motion-presets';
import { RiderAvatar } from '@/components/rider-avatar';
import { StatusChip } from '@/components/status-chip';
import { copy, statusText, t } from '@/lib/copy';
import { formatDuration } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { ROW_HEIGHTS } from '@/lib/live-list';
import { splitNameTag } from '@/lib/names';
import type { RiderStatus } from '@/lib/rider-status';
import { family, font, fontNumeric, palette, radius, size, space, type } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

interface LiveRiderRowProps {
  userId: string;
  name: string;
  colorIndex: number;
  leader: boolean;
  status: RiderStatus;
  /** Floored to the minute by the caller so the memo holds for a minute at a time (06 §7). */
  sinceMs: number | null;
  line1: string;
  muted: boolean;
  /** No position yet: line 1 is the small "No location yet". */
  noPosition: boolean;
  /** Whole km/h for a moving rider; null when unknown or under 3 km/h. */
  speedKmh: number | null;
  selected: boolean;
  a11yLabel: string;
  onPress: (userId: string) => void;
}

const NUMBER_FIRST = /^(≈?\d+(?:\.\d+)?) (km|m)(.*)$/;

/**
 * Live rider row (16 §2.2), 72 tall. Distance 28 semibold with a small unit, then an arrow and the
 * direction word. Quiet default: a moving rider has no chip, just speed. The exceptions pop: a filled
 * amber chip with the age for stopped, an outline chip for no signal (age moves to the sub line).
 * Rows glide to their new place on re-sort (reanimated layout transition). Memoised on primitives only.
 */
export const LiveRiderRow = memo(function LiveRiderRow({
  userId,
  name,
  colorIndex,
  leader,
  status,
  sinceMs,
  line1,
  muted,
  noPosition,
  speedKmh,
  selected,
  a11yLabel,
  onPress,
}: LiveRiderRowProps) {
  const { colors } = useTheme();
  const sos = status === 'sos';
  const fg = sos ? colors.onStatus.sosStrong : muted ? colors.textMuted : colors.text;
  const nameColor = sos ? colors.onStatus.sosStrong : colors.text;
  const dirColor = sos ? fg : colors.textMuted;
  const match = NUMBER_FIRST.exec(line1);
  const level = line1 === copy['live.level'];
  const { base, tag } = splitNameTag(name);
  // Offline: the age moves from the chip to the sub line ("Priya · seen 4 min ago").
  const seen = status === 'offline' && sinceMs != null ? t('live.seenAgo', { age: formatDuration(sinceMs) }) : null;
  const bar = status === 'stopped' ? colors.status.stopped : status === 'offline' ? colors.status.offline : null;
  const direction = match ? match[3].trim() : '';
  const dirIcon = direction === 'ahead' ? 'arrowUp' : direction === 'behind' ? 'arrowDown' : null;

  return (
    <Animated.View layout={rowLayout} entering={rowEnter} exiting={rowExit}>
      <Pressable
        accessible
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        onPress={() => onPress(userId)}
        style={({ pressed }) => [
          styles.row,
          {
            backgroundColor: sos
              ? colors.status.sosStrong
              : pressed
                ? colors.surfacePressed
                : colors.surfaceRaised,
            borderColor: selected ? colors.brand.primary : 'transparent',
          },
        ]}>
        {/* Exception rows (stopped, offline) get a 4 px left bar; it fades in with the status change. */}
        {bar ? (
          <Animated.View entering={rowEnter} style={[styles.statusBar, { backgroundColor: bar }]} />
        ) : null}
        <View style={sos ? styles.sosRing : undefined}>
          <RiderAvatar
            name={name}
            colorIndex={colorIndex}
            status={status}
            stale={status === 'offline'}
            leader={leader}
            ringWhenMoving={false}
          />
        </View>
        <View style={styles.body}>
          {noPosition ? (
            <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[styles.noLocation, { color: fg }]}>
              {line1}
            </Text>
          ) : match ? (
            <View style={styles.line1}>
              <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[styles.number, { color: fg }, fontNumeric]}>
                {match[1]}
                <Text style={styles.unit}>{` ${match[2]}`}</Text>
              </Text>
              {dirIcon ? <Icon name={dirIcon} color={dirColor} size={16} /> : null}
              {direction ? (
                <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[styles.direction, { color: dirColor }]}>
                  {direction}
                </Text>
              ) : null}
            </View>
          ) : level ? (
            <View style={styles.line1}>
              <Icon name="equal" color={dirColor} size={20} />
              <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[styles.level, { color: fg }]}>
                {line1}
              </Text>
            </View>
          ) : (
            <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[styles.number, { color: fg }, fontNumeric]}>
              {line1}
            </Text>
          )}
          <View style={styles.names}>
            <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[styles.name, { color: nameColor }]}>
              {base}
            </Text>
            {tag ? (
              <Text
                maxFontSizeMultiplier={1.3}
                numberOfLines={1}
                style={[styles.botTag, { color: sos ? nameColor : colors.textSubtle }]}>
                {tag}
              </Text>
            ) : null}
            {seen ? (
              <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[styles.age, { color: colors.textSubtle }]}>
                {`· ${seen}`}
              </Text>
            ) : null}
            {leader ? (
              <View style={styles.tagWrap}>
                <Icon name="leader" color={nameColor} size={12} />
                <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[styles.tag, { color: nameColor }]}>
                  {copy['lobby.leaderTag']}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        {sos ? (
          <SosPill sinceMs={sinceMs} />
        ) : status === 'moving' ? (
          speedKmh !== null ? (
            <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[styles.speed, { color: colors.textSubtle }, fontNumeric]}>
              {speedKmh}
              <Text style={styles.speedUnit}> km/h</Text>
            </Text>
          ) : null
        ) : (
          <StatusChip status={status} sinceMs={sinceMs} size="sm" hideDuration={status === 'offline'} />
        )}
        {sos ? null : <View style={[styles.divider, { backgroundColor: colors.border }]} />}
      </Pressable>
    </Animated.View>
  );
});

/** On a red row the normal red chip would vanish: white pill, red text. */
function SosPill({ sinceMs }: { sinceMs: number | null }) {
  const { colors } = useTheme();
  const text = statusText('sos', sinceMs != null ? formatDuration(sinceMs) : null);
  return (
    <View accessible={false} style={[styles.pill, { backgroundColor: colors.onStatus.sosStrong }]}>
      <Icon name="sos" color={colors.status.sosStrong} size={16} />
      <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[styles.pillText, { color: colors.status.sosStrong }]}>
        {text}
      </Text>
    </View>
  );
}

interface LiveMeRowProps {
  /** Whole km/h, or null when unknown or under 3 km/h. Read out only; not drawn (20 C3). */
  speedKmh: number | null;
  sharing: boolean;
  sosOn: boolean;
  onFix: () => void;
}

/**
 * My reference row (06 §4): 56 tall, orange bar, "You", sharing state. My speed is not drawn here (the
 * map's speed bubble owns it, 20 C3); it stays in the screen-reader label.
 */
export const LiveMeRow = memo(function LiveMeRow({ speedKmh, sharing, sosOn, onFix }: LiveMeRowProps) {
  const { colors } = useTheme();
  const speedText = speedKmh !== null ? t('live.speedA11y', { kmh: speedKmh }) : null;
  const label = [
    copy['live.you'],
    speedText,
    sosOn ? 'SOS on' : sharing ? 'sharing location' : 'not sharing location',
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <View
      accessible
      accessibilityLabel={label}
      style={[styles.me, { backgroundColor: colors.meRowBg, borderBottomColor: colors.border }]}>
      <View style={[styles.meBar, { backgroundColor: colors.me }]} />
      {/* The brand arrow (leader piece of the mark), no disc. */}
      <View style={styles.meMark}>
        <MeMarker variant="row" />
      </View>
      <AppText variant="bodyStrong" numberOfLines={1} maxFontSizeMultiplier={1.3}>
        {copy['live.you']}
      </AppText>
      <View style={styles.spacer} />
      {sosOn ? (
        <View style={[styles.meChip, { backgroundColor: colors.status.sosStrong }]}>
          <Icon name="sos" color={colors.onStatus.sosStrong} size={14} />
          <Text maxFontSizeMultiplier={1.3} style={[styles.meChipText, { color: colors.onStatus.sosStrong }]}>
            {copy['live.sosOn']}
          </Text>
        </View>
      ) : sharing ? (
        <View style={styles.meSharing}>
          <Icon name="checkCircle" color={colors.onMovingTint} size={16} />
          <Text maxFontSizeMultiplier={1.3} style={[styles.meChipText, { color: colors.onMovingTint }]}>
            {copy['live.sharing']}
          </Text>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${copy['live.notSharing']}. ${copy['banner.fix']}`}
          onPress={onFix}
          style={[styles.meChip, styles.meChipTouch, { backgroundColor: colors.status.stopped }]}>
          <Icon name="notSharing" color={colors.onStatus.stopped} size={14} />
          <Text maxFontSizeMultiplier={1.3} style={[styles.meChipText, { color: colors.onStatus.stopped }]}>
            {copy['live.notSharing']}
          </Text>
        </Pressable>
      )}
    </View>
  );
});

/** Solo panel row (20 C4): the 64 dp info-row anatomy with an invite action. */
export function SoloInviteRow({ left, onPress }: { left: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const sub = copy[left ? 'live.soloSubLeft' : 'live.soloSub'];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('live.soloInviteA11y', { sub })}
      onPress={() => {
        // Act first: feedback must never be able to delay or swallow the action.
        onPress();
        haptic('select');
      }}
      style={({ pressed }) => [styles.info, { backgroundColor: pressed ? colors.surfacePressed : 'transparent' }]}>
      <View style={[styles.tile, { backgroundColor: colors.brandTint }]}>
        <Icon name="inviteOutline" color={colors.brandOnBg} size={22} />
      </View>
      <View style={styles.infoTexts}>
        <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.infoTitle, { color: colors.text }]}>
          {copy['invite.cta']}
        </Text>
        <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.infoSub, { color: colors.textMuted }]}>
          {sub}
        </Text>
      </View>
      <Icon name="chevronRight" color={colors.textMuted} size={20} />
    </Pressable>
  );
}

/** Load error (06 §6): a 64 dp row at the top of the group sheet; the last data stays below it. */
export function LoadErrorRow({ onRetry }: { onRetry: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.info, { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <View style={[styles.tile, { backgroundColor: colors.stoppedTint }]}>
        <Icon name="alertCircle" color={colors.onStoppedTint} size={22} />
      </View>
      <Text numberOfLines={2} maxFontSizeMultiplier={1.3} style={[styles.infoTitle, styles.infoTexts, { color: colors.text }]}>
        {copy['errors.loadRide']}
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel={copy['common.tryAgain']} onPress={onRetry} style={styles.retry}>
        <Text maxFontSizeMultiplier={1.3} style={[styles.infoTitle, { color: colors.brandOnBg }]}>
          {copy['common.tryAgain']}
        </Text>
      </Pressable>
    </View>
  );
}

export function OffRouteLabel() {
  const { colors } = useTheme();
  return (
    <View style={[styles.label, { backgroundColor: colors.bg }]}>
      <AppText variant="label" muted maxFontSizeMultiplier={1.3}>
        {copy['live.offRoute']}
      </AppText>
    </View>
  );
}

export function NoFixRow() {
  const { colors } = useTheme();
  return (
    <View style={[styles.noFix, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
      <AppText variant="caption" muted maxFontSizeMultiplier={1.3}>
        {copy['live.noMyFix']}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    height: ROW_HEIGHTS.rider,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderWidth: 3,
  },
  statusBar: { position: 'absolute', left: -3, top: -3, bottom: -3, width: 4 },
  // Hairline inset 68: starts after the avatar.
  divider: { position: 'absolute', left: 68, right: 0, bottom: -3, height: StyleSheet.hairlineWidth },
  sosRing: { borderRadius: 30, borderWidth: 2, borderColor: palette.markerOutline, padding: 2 },
  body: { flex: 1, justifyContent: 'center' },
  line1: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  number: { fontSize: type.glance.size, lineHeight: type.glance.line, letterSpacing: -0.6, fontFamily: family.semibold },
  unit: { fontSize: 18, letterSpacing: 0, fontFamily: family.semibold },
  direction: { fontSize: 15, lineHeight: 20, fontFamily: family.regular },
  speed: { fontSize: font.sm, lineHeight: 20, fontFamily: family.regular },
  speedUnit: { fontSize: font.xs, fontFamily: family.regular },
  // "With you" is a phrase, not a distance: smaller than real distances so those stay the biggest thing.
  level: { fontSize: font.lg, lineHeight: 32, fontFamily: family.semibold },
  noLocation: { fontSize: font.lg, lineHeight: 32, fontFamily: family.semibold },
  names: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  name: { flexShrink: 1, fontSize: font.md, lineHeight: 22, fontFamily: family.semibold },
  age: { flexShrink: 0, fontSize: font.sm, lineHeight: 20, fontFamily: family.regular },
  botTag: { fontSize: font.sm, lineHeight: 20, fontFamily: family.regular },
  tag: { fontSize: font.xs, fontFamily: family.semibold },
  tagWrap: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  meSharing: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    borderRadius: radius.pill,
    height: 32,
    paddingHorizontal: space.md,
  },
  pillText: { fontSize: font.sm, lineHeight: 20, fontFamily: family.semibold },

  me: {
    height: ROW_HEIGHTS.me,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingRight: space.lg,
    borderBottomWidth: 1,
  },
  meBar: { width: 4, alignSelf: 'stretch' },
  meMark: { width: 26, alignItems: 'center', justifyContent: 'center' },
  spacer: { flex: 1 },
  meChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    borderRadius: 12,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  meChipTouch: { minHeight: 40, justifyContent: 'center', paddingHorizontal: space.md, borderRadius: radius.md },
  meChipText: { fontSize: font.sm, lineHeight: 20, fontFamily: family.semibold },

  info: {
    height: size.sheetInfoRow,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingLeft: space.lg,
    paddingRight: space.lg,
  },
  // A circle, like the stop card's tile (26 L4).
  tile: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  infoTexts: { flex: 1, justifyContent: 'center' },
  infoTitle: { fontSize: font.md, lineHeight: 22, fontFamily: family.semibold },
  infoSub: { fontSize: font.sm, lineHeight: 20, fontFamily: family.regular },
  retry: { minWidth: 56, height: 56, alignItems: 'center', justifyContent: 'center' },

  label: { height: ROW_HEIGHTS.label, justifyContent: 'center', paddingHorizontal: space.lg },
  noFix: {
    height: ROW_HEIGHTS.noFix,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderBottomWidth: 1,
  },
});
