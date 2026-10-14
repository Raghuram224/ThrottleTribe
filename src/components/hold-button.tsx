import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, type Insets, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { copy } from '@/lib/copy';
import { haptic } from '@/lib/haptics';
import { family, font, radius, size, space, timing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

interface HoldButtonProps {
  label: string;
  icon?: IconName;
  /** Shown while the finger is down. Defaults to "Keep holding…". */
  holdingLabel?: string;
  /** 'send' = solid SOS red; 'cancel' = white with a red border (cancel my SOS). */
  tone?: 'send' | 'cancel';
  /** Hold duration in ms. Defaults to `timing.sosHoldMs` (2 s). */
  durationMs?: number;
  /** Fired once when the hold completes. */
  onComplete: () => void;
  /** Fired when the finger lifts before completion (show the "hold for 2 seconds" hint). */
  onEarlyRelease?: () => void;
  /** Screen-reader activation (double tap). The screen should confirm in a sheet, then act. */
  onA11yActivate?: () => void;
  accessibilityLabel?: string;
  disabled?: boolean;
  /** Layout flex, e.g. 1.5 next to a 1-flex Msg button. */
  flex?: number;
  /** Overrides the 72 dp height (the live action bar uses 64, 16 §2.4). */
  height?: number;
  /** Circle of this diameter (floating SOS in full map): icon over `shortLabel`, same hold behaviour. */
  round?: number;
  shortLabel?: string;
  /** Finger down / up (also on completion and unmount), so the screen can hold off layout changes mid-hold. */
  onHoldChange?: (holding: boolean) => void;
}

/**
 * How far (dp) a held finger may drift outside the button before the hold counts as a slide-off and rewinds.
 * RN Pressability measures the press rect once, at press-in, so a bar re-layout under a held finger (a rider joins,
 * Message fades in) never cancels the hold by itself. This only governs deliberate or accidental finger drift.
 */
function retentionFor(tone: 'send' | 'cancel', round: number | undefined): Insets {
  // TODO(human): choose the drift allowance per case. Placeholder below is the engineer's draft for every case.
  return { top: 40, bottom: 40, left: 120, right: 40 };
}

/**
 * Long-press button with a progress fill (07 §4; 14 §1: no white outline ring on the SOS tone). Haptic Light at the start,
 * Medium halfway, Error on completion. Releasing early rewinds in 200 ms.
 */
export function HoldButton({
  label,
  icon,
  holdingLabel = copy['sos.holding'],
  tone = 'send',
  durationMs = timing.sosHoldMs,
  onComplete,
  onEarlyRelease,
  onA11yActivate,
  accessibilityLabel,
  disabled,
  flex,
  height,
  round,
  shortLabel,
  onHoldChange,
}: HoldButtonProps) {
  const { colors } = useTheme();
  const [progress] = useState(() => new Animated.Value(0));
  const midHaptic = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [holding, setHolding] = useState(false);
  // Source of truth for "finger is down". State alone is stale on a quick tap: onPressOut runs
  // before the re-render, sees holding=false and returns, so the hold animation used to finish
  // and fire onComplete (an SOS from a single tap). Refs are current inside both handlers.
  const holdingRef = useRef(false);

  const clearTimer = () => {
    if (midHaptic.current) clearTimeout(midHaptic.current);
    midHaptic.current = null;
  };
  const holdChange = useRef(onHoldChange);
  useEffect(() => {
    holdChange.current = onHoldChange;
  });
  useEffect(
    () => () => {
      clearTimer();
      // Unmounted mid-hold: the release will never reach us, so clear the flag here.
      if (holdingRef.current) holdChange.current?.(false);
    },
    [],
  );

  const send = tone === 'send';
  // The cancel tone sits on bg: red text and border use sosOnBg so they pass contrast in dark (13 §11).
  const fg = send ? colors.onStatus.sosStrong : colors.sosOnBg;
  const bg = send ? colors.status.sosStrong : colors.bg;
  const fillColor = send ? 'rgba(255,255,255,0.35)' : colors.sosOnBg;

  const onPressIn = () => {
    if (disabled) return;
    holdingRef.current = true;
    setHolding(true);
    holdChange.current?.(true);
    haptic('light', { safety: true });
    midHaptic.current = setTimeout(() => {
      haptic('medium', { safety: true });
    }, durationMs / 2);
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: durationMs,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start(({ finished }) => {
      // Fire only if the finger is still down at the end of the full hold.
      if (!finished || !holdingRef.current) return;
      holdingRef.current = false;
      clearTimer();
      setHolding(false);
      holdChange.current?.(false);
      haptic('error', { safety: true });
      onComplete();
      progress.setValue(0);
    });
  };

  const onPressOut = () => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    clearTimer();
    setHolding(false);
    holdChange.current?.(false);
    // stop() makes the running animation's callback report finished=false.
    progress.stopAnimation();
    Animated.timing(progress, { toValue: 0, duration: 200, useNativeDriver: false }).start();
    onEarlyRelease?.();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={() => onA11yActivate?.()}
      disabled={disabled}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      pressRetentionOffset={retentionFor(tone, round)}
      style={[
        styles.button,
        { backgroundColor: bg, borderColor: send ? 'transparent' : colors.sosOnBg },
        flex !== undefined && { flex },
        height !== undefined && { minHeight: height },
        round !== undefined && { width: round, height: round, minHeight: round, borderRadius: round / 2 },
        disabled && { opacity: 0.5 },
      ]}>
      <View
        style={[StyleSheet.absoluteFill, styles.clip, round !== undefined && { borderRadius: round / 2 }]}
        pointerEvents="none">
        <Animated.View
          style={[
            styles.fill,
            {
              backgroundColor: fillColor,
              width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
            },
          ]}
        />
      </View>
      {round !== undefined ? (
        <View style={styles.roundContent}>
          {icon ? <Icon name={icon} color={fg} size={24} /> : null}
          {shortLabel ? (
            <Text allowFontScaling={false} numberOfLines={1} style={[styles.shortLabel, { color: fg }]}>
              {shortLabel}
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.content}>
          {icon ? <Icon name={icon} color={fg} size={20} /> : null}
          <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[styles.label, { color: fg }]}>
            {holding ? holdingLabel : label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: size.actionBar,
    borderRadius: radius.lg,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  clip: { overflow: 'hidden', borderRadius: radius.lg },
  fill: { height: '100%' },
  content: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  label: { fontSize: font.lg, fontFamily: family.bold },
  roundContent: { alignItems: 'center', justifyContent: 'center' },
  shortLabel: { fontSize: 11, lineHeight: 13, fontFamily: family.bold },
});
