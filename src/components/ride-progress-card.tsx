import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { AppText } from '@/components/app-text';
import { BigButton } from '@/components/big-button';
import { ConvoyStrip } from '@/components/convoy-strip';
import { Icon } from '@/components/icon';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import type { HomeConvoyState } from '@/hooks/use-home-convoy';
import { copy, riderCount } from '@/lib/copy';
import { elevate, family, font, fontNumeric, motion, resolveTokens, space, type } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

interface RideProgressCardProps {
  name: string;
  /** "You're the leader" / "You're riding". */
  role: string;
  active: boolean;
  /** "1 h 12 min" (active) or "" (lobby). */
  elapsed: string;
  convoy: HomeConvoyState | null;
  onResume: () => void;
}

/**
 * Home "ride in progress" card (16 §3): ink in both themes, the live convoy, one exception line and
 * the single primary button. In the lobby (no convoy yet) it shows the name and who is waiting.
 */
export function RideProgressCard({ name, role, active, elapsed, convoy, onResume }: RideProgressCardProps) {
  const { colors: outer, scheme, style, traits } = useTheme();
  // Ink card: the dark token set applies inside, in both schemes. Surface card (Maps): current tokens.
  const ink = traits.heroCard === 'ink';
  const colors = { ...outer, ...(ink ? resolveTokens(style, 'dark') : null) };
  const meta = convoy ? `${role} · ${riderCount(convoy.riders)}` : role;
  const exc = convoy?.exception;
  const excIcon = exc && exc.status !== 'moving' ? exc.status : null;

  return (
    <View
      style={[
        styles.card,
        ink
          ? [
              { backgroundColor: colors.ink },
              scheme === 'light'
                ? { shadowColor: colors.ink, shadowOpacity: 0.22, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 8 }
                : { borderWidth: 1, borderColor: colors.hairlineOnDark },
            ]
          : [{ backgroundColor: outer.surfaceRaised }, elevate('e1', scheme)],
      ]}>
      <View style={styles.labelRow}>
        <View style={styles.labelLeft}>
          {active ? <PulseDot color={colors.status.moving} /> : <View style={[styles.dot, { backgroundColor: colors.status.offline }]} />}
          <Text maxFontSizeMultiplier={1.3} style={[styles.label, { color: active ? colors.onMovingTint : colors.textMuted }]}>
            {copy['home.resumeLabel']}
          </Text>
        </View>
        {elapsed ? (
          <Text maxFontSizeMultiplier={1.3} style={[styles.elapsed, fontNumeric, { color: colors.textMuted }]}>
            {elapsed}
          </Text>
        ) : null}
      </View>
      <AppText variant="heading" numberOfLines={1} style={[styles.name, { color: colors.text }]} maxFontSizeMultiplier={1.3}>
        {name}
      </AppText>
      <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[styles.meta, { color: colors.textMuted }]}>
        {active ? meta : `${role} · ${copy['home.inLobby']}`}
      </Text>
      {convoy?.model ? (
        <View style={styles.strip}>
          <ConvoyStrip model={convoy.model} tone="ink" />
        </View>
      ) : null}
      {exc ? (
        <View style={styles.exception}>
          <Icon
            name={excIcon ?? 'checkCircle'}
            color={excIcon === 'sos' ? colors.sosOnBg : excIcon === 'stopped' ? colors.status.stopped : excIcon ? colors.textMuted : colors.onMovingTint}
            size={18}
          />
          <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[styles.excText, { color: colors.textMuted }]}>
            {exc.text}
          </Text>
        </View>
      ) : null}
      <BigButton label={copy['home.resume']} trailingIcon="arrowRight" onPress={onResume} />
    </View>
  );
}

/** Green dot with a halo that grows 1 -> 1.8 and fades, 1400 ms loop; static with Reduce Motion. */
function PulseDot({ color }: { color: string }) {
  const reduce = useReduceMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    p.value = withRepeat(withTiming(1, { duration: motion.pulse, easing: Easing.out(Easing.quad) }), -1, false);
    return () => cancelAnimation(p);
  }, [reduce, p]);
  const halo = useAnimatedStyle(() => ({
    opacity: reduce ? 0.3 : 0.4 * (1 - p.value),
    transform: [{ scale: reduce ? 1.6 : 1 + 0.8 * p.value }],
  }));
  return (
    <View style={styles.pulseBox}>
      <Animated.View style={[styles.halo, { backgroundColor: color }, halo]} />
      <View style={[styles.dot, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: space.lg, gap: space.xs },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  labelLeft: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  label: {
    fontSize: type.label.size,
    lineHeight: type.label.line,
    letterSpacing: type.label.track,
    fontFamily: family.semibold,
    textTransform: 'uppercase',
  },
  elapsed: { fontSize: font.sm, lineHeight: 20, fontFamily: family.regular },
  name: { fontSize: 22, lineHeight: 28, fontFamily: family.bold, marginTop: space.xs },
  meta: { fontSize: font.sm, lineHeight: 20, fontFamily: family.regular },
  strip: { marginTop: space.sm },
  exception: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.xs, marginBottom: space.sm },
  excText: { flex: 1, fontSize: font.md, lineHeight: 22, fontFamily: family.regular },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pulseBox: { width: 8, height: 8, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 8, height: 8, borderRadius: 4 },
});
