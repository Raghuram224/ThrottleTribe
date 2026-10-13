import { memo, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { MeMarker } from '@/components/me-marker';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import {
  convoyA11y,
  layoutConvoy,
  spreadLabel,
  type ConvoyModel,
  type ConvoyRider,
} from '@/lib/convoy';
import { initialsOf } from '@/lib/names';
import { family, font, fontNumeric, motion, palette, resolveTokens } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';
import { copy, t } from '@/lib/copy';

const DOT = 26;
const ME = 30;
const SOS = 30;
const CUT = 2;
const TRACK_H = 4;
/** Height of the strip in dp; the live map treats it as top chrome. */
export const CONVOY_STRIP_H = 84;
const CENTER = 20;
const AREA_H = 52;
const HALO = SOS + 20;

interface ConvoyStripProps {
  model: ConvoyModel;
  /** `ink`: transparent, light-on-dark colours for the Home ride-in-progress card. */
  /** `ink`: dark token set (ink card); `bare`: current tokens, no background (surface card); `surface`: own raised band. */
  tone?: 'surface' | 'ink' | 'bare';
}

/**
 * Convoy strip (16 §2.1): the whole group on one line, tail on the left, lead on the right, me as the
 * brand arrow. Display-only plain Views; each dot glides to its new place (600 ms, UI thread).
 */
export const ConvoyStrip = memo(function ConvoyStrip({ model, tone = 'surface' }: ConvoyStripProps) {
  const { colors: outer, style } = useTheme();
  const ink = tone === 'ink';
  const bare = tone !== 'surface';
  const colors = ink ? { ...outer, ...resolveTokens(style, 'dark') } : outer;
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));

  const layout = useMemo(() => (width > 0 ? layoutConvoy(model.riders, width) : null), [model.riders, width]);
  const byKey = useMemo(() => new Map(model.riders.map((r) => [r.key, r])), [model.riders]);
  const label = useMemo(() => convoyA11y(model), [model]);

  const cutout = ink ? colors.inkRaised : colors.surfaceRaised;
  const subtle = ink ? colors.onInkSubtle : colors.textSubtle;
  const muted = ink ? colors.onInkMuted : colors.textMuted;
  const track = ink ? colors.inkTrack : colors.trackLine;

  const tail = model.riders.reduce((a, r) => (r.offsetM < a.offsetM ? r : a), model.riders[0]);
  const tickColor = !layout
    ? muted
    : tail.status === 'stopped'
      ? ink ? colors.status.stopped : colors.onStoppedTint
      : tail.status === 'offline'
        ? subtle
        : muted;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={[styles.root, !bare && { backgroundColor: colors.surfaceRaised, borderColor: colors.border }, bare && styles.rootInk]}>
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <View style={styles.labels}>
          <View style={styles.end}>
            <Icon name="arrowLeft" color={subtle} size={12} />
            <Text maxFontSizeMultiplier={1.2} style={[styles.endText, { color: subtle }]}>
              {copy['convoy.behind']}
            </Text>
          </View>
          <Text
            maxFontSizeMultiplier={1.2}
            numberOfLines={1}
            style={[
              styles.spread,
              fontNumeric,
              { color: layout?.together ? (ink ? colors.onMovingTint : colors.onMovingTint) : muted },
            ]}>
            {layout ? spreadLabel(layout.spreadM) : ' '}
          </Text>
          <View style={styles.end}>
            <Text maxFontSizeMultiplier={1.2} style={[styles.endText, { color: subtle }]}>
              {copy['convoy.ahead']}
            </Text>
            <Icon name="arrowRight" color={subtle} size={12} />
          </View>
        </View>

        <View style={styles.area} onLayout={onLayout}>
          <View style={[styles.track, { backgroundColor: track, top: CENTER - TRACK_H / 2 }]} />
          {layout && colors.convoyBand !== 'transparent' ? (
            <View style={[styles.band, { left: layout.band.x1, width: Math.max(0, layout.band.x2 - layout.band.x1), backgroundColor: colors.convoyBand }]} />
          ) : null}
          {layout?.gap ? <GapLine x1={layout.gap.x1} x2={layout.gap.x2} color={colors.status.stopped} /> : null}
          {layout
            ? [...layout.dots]
                .sort((a, b) => weight(byKey.get(a.key)) - weight(byKey.get(b.key)))
                .map((d) => {
                  const r = byKey.get(d.key);
                  return r ? <Dot key={d.key} rider={r} x={d.x} cutout={cutout} /> : null;
                })
            : null}
          {layout?.bubbles.map((b) => (
            <View key={`b${b.x}`} style={[styles.bubble, { left: b.x - 12, backgroundColor: ink ? colors.surfacePressed : colors.surface }]}>
              <Text allowFontScaling={false} style={[styles.bubbleText, { color: colors.text }]}>{`+${b.count}`}</Text>
            </View>
          ))}
        </View>

        <View style={styles.ticks}>
          <Text maxFontSizeMultiplier={1.2} style={[styles.tick, fontNumeric, { color: tickColor }]}>
            {layout?.tailTick ?? ' '}
          </Text>
          {model.offRoute > 0 ? (
            <View style={[styles.offRoute, { backgroundColor: ink ? colors.inkRaised : colors.surface }]}>
              <Text maxFontSizeMultiplier={1.2} style={[styles.offRouteText, { color: muted }]}>
                {t('convoy.offRoute', { n: model.offRoute })}
              </Text>
            </View>
          ) : null}
          <Text maxFontSizeMultiplier={1.2} style={[styles.tick, fontNumeric, { color: muted }]}>
            {layout?.leadTick ?? ' '}
          </Text>
        </View>
      </View>
    </View>
  );
});

/** Draw order: others, then SOS, then me on top. */
function weight(r: ConvoyRider | undefined): number {
  if (!r) return 0;
  return r.isMe ? 2 : r.status === 'sos' ? 1 : 0;
}

function GapLine({ x1, x2, color }: { x1: number; x2: number; color: string }) {
  const count = Math.max(0, Math.floor((x2 - x1) / 9));
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.gap, { left: x1 + i * 9, backgroundColor: color }]} />
      ))}
    </>
  );
}

const Dot = memo(function Dot({ rider, x, cutout }: { rider: ConvoyRider; x: number; cutout: string }) {
  const { colors } = useTheme();
  const reduce = useReduceMotion();
  const size = rider.isMe ? ME : rider.status === 'sos' ? SOS : DOT;
  const left = useSharedValue(x - size / 2);

  useEffect(() => {
    left.value = withTiming(x - size / 2, {
      duration: motion.glide,
      easing: Easing.out(Easing.cubic),
      reduceMotion: ReduceMotion.System,
    });
  }, [x, size, left]);
  const style = useAnimatedStyle(() => ({ left: left.value }));

  const sos = rider.status === 'sos';
  const offline = rider.status === 'offline';
  const stopped = rider.status === 'stopped';

  return (
    <Animated.View style={[styles.dotBox, { width: size, height: size, top: CENTER - size / 2 }, style]}>
      {sos ? <Halo still={reduce} /> : null}
      {rider.isMe ? (
        <View style={styles.meBox}>
          <MeMarker variant="strip" />
        </View>
      ) : (
        <View
          style={[
            styles.ring,
            {
              width: size + CUT * 2 + (stopped || offline ? 4 : 0),
              height: size + CUT * 2 + (stopped || offline ? 4 : 0),
              borderRadius: 99,
              backgroundColor: cutout,
              borderWidth: stopped || offline ? 2 : 0,
              borderColor: stopped ? colors.status.stopped : colors.status.offline,
              borderStyle: offline ? 'dashed' : 'solid',
              opacity: offline ? 0.5 : 1,
            },
          ]}>
          {sos ? (
            <View style={[styles.sosDot, { width: size, height: size, borderRadius: size / 2, backgroundColor: palette.status.sosStrong }]}>
              <Icon name="sos" color={palette.onStatus.sosStrong} size={16} />
            </View>
          ) : (
            <View
              style={[
                styles.fill,
                { width: size, height: size, borderRadius: size / 2, backgroundColor: palette.rider[((rider.colorIndex % 16) + 16) % 16] },
              ]}>
              <Text allowFontScaling={false} style={styles.initials}>
                {initialsOf(rider.name)}
              </Text>
            </View>
          )}
        </View>
      )}
    </Animated.View>
  );
});

/** SOS halo: scale 1 -> 1.35 and fade, 1400 ms loop; a static soft halo with Reduce Motion. */
function Halo({ still }: { still: boolean }) {
  const p = useSharedValue(0);
  useEffect(() => {
    if (still) return;
    p.value = withRepeat(withTiming(1, { duration: motion.pulse, easing: Easing.out(Easing.quad) }), -1, false);
    return () => cancelAnimation(p);
  }, [still, p]);
  const style = useAnimatedStyle(() => ({
    opacity: still ? 0.22 : 0.35 * (1 - p.value),
    transform: [{ scale: still ? 1 : 1 + 0.35 * p.value }],
  }));
  return <Animated.View style={[styles.halo, style]} />;
}

const styles = StyleSheet.create({
  root: {
    height: CONVOY_STRIP_H,
    paddingTop: 6,
    paddingBottom: 4,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rootInk: { paddingHorizontal: 0, paddingTop: 2, borderWidth: 0 },
  labels: { height: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  end: { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 64 },
  endText: { fontSize: font.xs, lineHeight: 16, fontFamily: family.semibold },
  spread: { fontSize: font.xs, lineHeight: 16, fontFamily: family.semibold },
  area: { height: AREA_H, marginTop: -2 },
  track: { position: 'absolute', left: 0, right: 0, height: TRACK_H, borderRadius: 2 },
  gap: { position: 'absolute', top: CENTER - 1, width: 5, height: 2 },
  dotBox: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  ring: { alignItems: 'center', justifyContent: 'center' },
  fill: { alignItems: 'center', justifyContent: 'center' },
  initials: { color: palette.onRider, fontSize: 10.5, fontFamily: family.semibold },
  sosDot: { alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', top: (SOS - HALO) / 2, left: (SOS - HALO) / 2, width: HALO, height: HALO, borderRadius: HALO / 2, backgroundColor: palette.status.sos },
  meBox: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  band: { position: 'absolute', top: CENTER - TRACK_H / 2, height: TRACK_H, borderRadius: 2 },
  bubble: { position: 'absolute', top: 11, minWidth: 24, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  bubbleText: { fontSize: 11, fontFamily: family.semibold },
  ticks: { height: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: -6 },
  tick: { fontSize: font.xs, lineHeight: 16, fontFamily: family.semibold },
  offRoute: { height: 20, borderRadius: 10, paddingHorizontal: 8, justifyContent: 'center' },
  offRouteText: { fontSize: font.xs, fontFamily: family.semibold },
});
