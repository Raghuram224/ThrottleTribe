import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { bannerEnter, bannerExit } from '@/components/motion-presets';
import { copy } from '@/lib/copy';
import type { BannerView } from '@/lib/nav-banner-view';
import { elevate, family, fontNumeric, radius, size, space, type } from '@/theme/tokens';
import { statusColors, useTheme } from '@/theme/use-theme';

interface NavBannerProps {
  view: BannerView;
  /** Sheet mode: docked full-bleed (radius 0). Full map: floating card inset 8 dp with radius 16. */
  floating: boolean;
  /** Tap: re-centre (follow). P3 also repeats the current instruction. */
  onPress: () => void;
}

/**
 * The turn banner (21 §2.5): a 96 dp main row (maneuver arrow 48, distance 36 bold, instruction 20 with the road
 * truncating first) and, in `guide` with a close next maneuver, a 40 dp "Then" row. The whole banner is one tap
 * target. Dark blue means guidance; grey (`status.offline`) means no data (no GPS, offline off route); never amber.
 * The height is fixed: at 1.3x type the road truncates, the banner never grows.
 */
export const NavBanner = memo(function NavBanner({ view, floating, onPress }: NavBannerProps) {
  const { colors, scheme } = useTheme();
  const grey = view.tone === 'grey';
  const offline = statusColors('offline');
  const bg = grey ? offline.bg : colors.navBannerBg;
  const fg = grey ? offline.fg : colors.onNavBanner;
  const muted = grey ? offline.fg : colors.onNavBannerMuted;
  const radiusPx = floating ? radius.lg : 0;

  return (
    <Animated.View
      entering={bannerEnter}
      exiting={bannerExit}
      style={[{ backgroundColor: bg, borderRadius: radiusPx }, elevate('e2', scheme)]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={view.a11y}
        accessibilityHint={view.a11yHint ?? undefined}
        onPress={onPress}
        style={({ pressed }) => [styles.clip, { borderRadius: radiusPx, opacity: pressed ? 0.92 : 1 }]}>
        <View style={styles.main}>
          <View style={styles.iconCol}>
            <View style={{ transform: [{ rotate: `${view.iconRotateDeg}deg` }] }}>
              <Icon name={view.icon} color={fg} size={size.maneuverIcon} />
            </View>
          </View>
          <View style={styles.texts}>
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
              style={[view.line1Big ? styles.distance : styles.status, { color: fg }]}>
              {view.line1}
            </Text>
            {view.line2Sub ? (
              <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.sub, { color: muted }]}>
                {view.primary}
              </Text>
            ) : (
              // Two spans: the road truncates before the maneuver does.
              <View style={styles.line2}>
                {/* Shrinks (to 70 %) before it ever truncates: "Destination on the right" must keep "right". */}
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                  maxFontSizeMultiplier={1.3}
                  style={[styles.instruction, styles.primary, { color: fg }]}>
                  {view.primary}
                </Text>
                {view.road ? (
                  <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.instruction, styles.road, { color: fg }]}>
                    {` ${view.road}`}
                  </Text>
                ) : null}
              </View>
            )}
          </View>
        </View>
        {view.then ? (
          <View style={[styles.then, { backgroundColor: colors.navBannerThenBg }]}>
            <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.thenLabel, { color: colors.onNavBannerMuted }]}>
              {copy['nav.then']}
            </Text>
            <Icon name={view.then.icon} color={colors.onNavBanner} size={20} />
            <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.thenText, { color: colors.onNavBanner }]}>
              {view.then.text}
            </Text>
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  main: {
    height: size.navBanner,
    paddingHorizontal: space.lg,
    gap: space.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconCol: { width: 56, alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1, justifyContent: 'center' },
  distance: {
    ...fontNumeric,
    fontSize: type.display.size,
    lineHeight: type.display.line,
    fontFamily: family.bold,
  },
  status: { fontSize: type.heading.size, lineHeight: type.heading.line, fontFamily: family.semibold },
  sub: { fontSize: type.body.size, lineHeight: type.body.line, fontFamily: family.regular },
  line2: { flexDirection: 'row', alignItems: 'center' },
  instruction: { fontSize: type.heading.size, lineHeight: type.heading.line, fontFamily: family.semibold },
  primary: { flexShrink: 0, maxWidth: '100%' },
  road: { flexShrink: 1 },
  then: {
    height: size.navThenRow,
    paddingHorizontal: space.lg,
    gap: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  thenLabel: { fontSize: type.caption.size, lineHeight: type.caption.line, fontFamily: family.semibold },
  thenText: { flex: 1, fontSize: type.caption.size, lineHeight: type.caption.line, fontFamily: family.semibold },
});
