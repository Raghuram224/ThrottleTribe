import { StyleSheet, Text, View } from 'react-native';

import { markerLiftStyle } from '@/components/marker-lift';
import { Icon } from '@/components/icon';
import { initialsOf } from '@/lib/names';
import type { RiderStatus } from '@/lib/rider-status';
import { family, palette, size as sizes } from '@/theme/tokens';
import { statusColors, useTheme } from '@/theme/use-theme';

interface RiderAvatarProps {
  name: string;
  /** ride_members.color_index (0..15). Ignored when `me` is set. */
  colorIndex: number;
  /** Diameter of the filled circle; defaults to `size.avatar` (40). */
  size?: number;
  /** Status ring in the status colour. Omit for no ring (lobby, summary). */
  status?: RiderStatus;
  /** Last known data: dashed ring, body at 0.6 opacity. Ring and badge stay at full opacity. */
  stale?: boolean;
  /** Draws a star badge bottom-right. */
  leader?: boolean;
  /** Use the reserved "me" orange instead of a rider colour. */
  me?: boolean;
  /** Draw the ring for a moving rider (map markers). List rows pass false: green everywhere is noise. */
  ringWhenMoving?: boolean;
  /** White stroke width round the circle (default 2; map markers use 3). */
  strokeWidth?: number;
  /** Drop shadow under the circle (map markers). */
  lift?: boolean;
}

/** Rider colour fill + initials, optional status ring and badges (06 §3). */
export function RiderAvatar({
  name,
  colorIndex,
  size = sizes.avatar,
  status,
  stale,
  leader,
  me,
  ringWhenMoving = true,
  strokeWidth = 2,
  lift = false,
}: RiderAvatarProps) {
  const { colors, scheme } = useTheme();
  const fill = me ? colors.accent : palette.rider[((colorIndex % 16) + 16) % 16];
  const drawRing = !!status && (status !== 'moving' || ringWhenMoving);
  const ringWidth = status === 'sos' ? 6 : sizes.statusRing;
  // Offline in dark: a dimmer dashed ring (16 D6) so the mud-coloured avatar still reads as "last known".
  const ringColor =
    drawRing && status
      ? status === 'sos'
        ? palette.status.sos
        : status === 'offline' && scheme === 'dark'
          ? colors.textSubtle
          : statusColors(status).bg
      : null;
  const pad = ringColor ? ringWidth : 0;
  const outer = size + pad * 2;
  const showBadge = !!status && status !== 'moving';
  const initials = initialsOf(name);
  const onFill = me ? colors.onAccent : palette.onRider;

  return (
    <View accessible={false} style={{ width: outer, height: outer }}>
      <View
        style={[
          styles.ring,
          {
            width: outer,
            height: outer,
            borderRadius: outer / 2,
            borderWidth: ringColor ? ringWidth : 0,
            borderColor: ringColor ?? 'transparent',
            borderStyle: stale ? 'dashed' : 'solid',
          },
        ]}>
        <View
          style={[
            styles.circle,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: fill,
              borderWidth: strokeWidth,
              borderColor: palette.markerOutline,
              opacity: stale ? (scheme === 'dark' ? 0.7 : 0.55) : 1,
            },
            lift && markerLiftStyle(),
          ]}>
          {initials === '?' ? (
            // Unknown name: a person glyph, never a question mark.
            <Icon name="person" color={onFill} size={Math.round(size * 0.6)} />
          ) : (
            <Text
              allowFontScaling={false}
              style={{ color: onFill, fontSize: size >= 40 ? 14 : 12, fontFamily: family.bold }}>
              {initials}
            </Text>
          )}
        </View>
      </View>
      {showBadge && status ? (
        <View
          style={[
            styles.badge,
            styles.badgeTop,
            { backgroundColor: status === 'sos' ? palette.status.sos : statusColors(status).bg },
          ]}>
          <Icon name={status} color={statusColors(status).fg} size={12} />
        </View>
      ) : null}
      {leader ? (
        <View style={[styles.badge, styles.badgeBottom, { backgroundColor: colors.bg }]}>
          <Icon name="leader" color={colors.text} size={12} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { alignItems: 'center', justifyContent: 'center' },
  circle: { alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  badge: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeTop: { top: -4, right: -4 },
  badgeBottom: { bottom: -4, right: -4, width: 16, height: 16, borderRadius: 8 },
});
