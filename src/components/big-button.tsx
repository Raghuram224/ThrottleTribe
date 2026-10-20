import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { buttonA11yLabel, buttonText } from '@/lib/button-label';
import { haptic } from '@/lib/haptics';
import { family, radius, space, touchTarget, type } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

interface BigButtonProps {
  label: string;
  onPress: () => void;
  /** secondary = tonal (no border). outline is for red SOS surfaces. ghost = text only. */
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  disabled?: boolean;
  loading?: boolean;
  /** Icon drawn left of the label (20). */
  icon?: IconName;
  /** Taller primary (Start a ride: 60) with the brand glow in light. */
  prominent?: boolean;
  /** Replaces the icon with any node (e.g. the brand mark). */
  leading?: ReactNode;
  /** Icon drawn right of the label ("Back to ride →"). */
  trailingIcon?: IconName;
  /** Ignore the style's pill shape (SOS surfaces look identical in every style, 17 §0.2). */
  fixedShape?: boolean;
  /** Screen-reader label when it should say more than the visible label ("Start riding to Mysuru Palace"). */
  accessibilityLabel?: string;
  /** What the label says while `loading` ("Ending ride…"); default the label. The button never goes silent (26 E1). */
  loadingLabel?: string;
}

export function BigButton({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  icon,
  prominent,
  leading,
  trailingIcon,
  fixedShape,
  accessibilityLabel,
  loadingLabel,
}: BigButtonProps) {
  const { colors, scheme, traits } = useTheme();
  const inactive = disabled || loading;
  // Disabled (not loading) never keeps the brand colour: it reads as unavailable, not as a washed-out CTA.
  const dead = !!disabled && !loading;

  const palette = (pressed: boolean) => {
    if (dead) return { bg: variant === 'ghost' || variant === 'outline' ? 'transparent' : colors.surface, fg: colors.textSubtle };
    switch (variant) {
      case 'primary':
        return { bg: pressed ? colors.brandPressed : colors.brand.primary, fg: colors.brand.onPrimary };
      case 'danger':
        return { bg: colors.status.sosStrong, fg: colors.onStatus.sosStrong };
      case 'ghost':
        return { bg: pressed ? colors.surfacePressed : 'transparent', fg: colors.brandOnBg };
      case 'outline':
        return { bg: 'transparent', fg: colors.text };
      default:
        return { bg: pressed ? colors.surfacePressed : colors.surface, fg: colors.text };
    }
  };

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={buttonA11yLabel({ label, loading, loadingLabel, accessibilityLabel })}
      accessibilityState={{ disabled: inactive, busy: !!loading }}
      disabled={inactive}
      onPress={() => {
        haptic('select');
        onPress();
      }}
      style={(pressed) => [
        styles.button,
        // SOS surfaces ignore the style's pill shape (17 §0.2).
        variant !== 'danger' && !fixedShape && { borderRadius: traits.buttonRadius },
        prominent && styles.prominent,
        prominent && variant === 'primary' && !dead && scheme === 'light' && {
          shadowColor: colors.accent,
          shadowOpacity: 0.28,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 6 },
          elevation: 4,
        },
        { backgroundColor: palette(pressed).bg },
        variant === 'outline' && { borderWidth: 1, borderColor: colors.borderStrong },
      ]}>
      {(pressed) => (
        // Loading keeps the layout: the spinner takes the icon slot and the words stay, on the normal fill (26 E1).
        <View style={styles.content}>
          {loading ? (
            <ActivityIndicator size="small" color={palette(false).fg} style={styles.spinner} />
          ) : (
            (leading ?? (icon ? <Icon name={icon} color={palette(pressed).fg} size={20} /> : null))
          )}
          <Text style={[styles.label, { color: palette(pressed).fg }]} numberOfLines={1} maxFontSizeMultiplier={1.6}>
            {buttonText({ label, loading, loadingLabel })}
          </Text>
          {trailingIcon && !loading ? <Icon name={trailingIcon} color={palette(pressed).fg} size={20} /> : null}
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: touchTarget,
    borderRadius: radius.md,
    paddingHorizontal: space.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prominent: { minHeight: 60 },
  spinner: { width: 20, height: 20 },
  content: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  // 16/22 semibold: 20/700 on every button was the loudest "cheap" signal (14 §0.2).
  label: {
    fontSize: type.bodyStrong.size,
    lineHeight: type.bodyStrong.line,
    fontFamily: family.semibold,
  },
});
