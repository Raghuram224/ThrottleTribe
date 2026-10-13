import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { copy } from '@/lib/copy';
import { family, font, motion, space, touchTarget } from '@/theme/tokens';
import { statusColors, useTheme } from '@/theme/use-theme';

export type BannerTone = 'sos' | 'offline' | 'warning' | 'success' | 'message' | 'info';

export interface BannerAction {
  label: string;
  onPress: () => void;
}

interface BannerProps {
  tone: BannerTone;
  icon?: IconName;
  /** Plain text. Use `children` instead when the name must truncate separately from the rest. */
  text?: string;
  children?: ReactNode;
  /** Tapping the banner body. */
  onPress?: () => void;
  /** Text button at the right (e.g. "Fix", "View"), 56 tall. */
  action?: BannerAction;
  /** Shows a close button (56x56). Omit for banners that cannot be closed (e.g. alert banners). */
  onClose?: () => void;
  /** Screen readers announce SOS assertively, everything else politely. */
  accessibilityLabel?: string;
}

/**
 * Full-bleed banner (00 §2.5): min height 56, icon + one line of 16/700 text, optional action and
 * close. Slides down in 150 ms. Icon at x = 16 and text at x = 48 on every banner so stacked
 * banners line up. Colour never carries the meaning alone: every banner has an icon or words.
 */
export function Banner({
  tone,
  icon,
  text,
  children,
  onPress,
  action,
  onClose,
  accessibilityLabel,
}: BannerProps) {
  const { colors } = useTheme();
  const reduce = useReduceMotion();
  const [slide] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(slide, { toValue: 1, duration: motion.fast, useNativeDriver: true }).start();
  }, [slide]);

  const { bg, fg, iconColor } = toneColors(tone, colors);
  const body = (
    <View style={styles.body}>
      <View style={styles.iconSlot}>{icon ? <Icon name={icon} color={iconColor} size={20} /> : null}</View>
      <View style={styles.textWrap}>
        {children ?? (
          <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.text, { color: fg }]}>
            {text}
          </Text>
        )}
      </View>
    </View>
  );

  return (
    <Animated.View
      accessibilityRole="alert"
      accessibilityLiveRegion={tone === 'sos' ? 'assertive' : 'polite'}
      style={[
        styles.root,
        { backgroundColor: bg, borderBottomColor: colors.border },
        tone === 'message' && { borderLeftWidth: 4, borderLeftColor: colors.brand.primary },
        {
          opacity: slide,
          // The slide-down is decorative; with Reduce Motion only the 150 ms fade remains.
          transform: reduce
            ? []
            : [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [-space.lg, 0] }) }],
        },
      ]}>
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel ?? text}
          onPress={onPress}
          style={styles.flex}>
          {body}
        </Pressable>
      ) : (
        <View accessible accessibilityLabel={accessibilityLabel ?? text} style={styles.flex}>
          {body}
        </View>
      )}
      {action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={action.onPress}
          style={styles.action}>
          <Text maxFontSizeMultiplier={1.3} style={[styles.text, { color: fg }]}>
            {action.label}
          </Text>
        </Pressable>
      ) : null}
      {onClose ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy['common.close']}
          onPress={onClose}
          style={styles.close}>
          <Icon name="close" color={fg} size={20} />
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

function toneColors(tone: BannerTone, colors: ReturnType<typeof useTheme>['colors']) {
  switch (tone) {
    case 'sos': {
      const c = statusColors('sos');
      return { ...c, iconColor: c.fg };
    }
    case 'offline': {
      const c = statusColors('offline');
      return { ...c, iconColor: c.fg };
    }
    case 'warning': {
      const c = statusColors('stopped');
      return { ...c, iconColor: c.fg };
    }
    case 'success': {
      const c = statusColors('moving');
      return { ...c, iconColor: c.fg };
    }
    case 'message':
      return { bg: colors.surfaceRaised, fg: colors.text, iconColor: colors.text };
    case 'info':
      return { bg: colors.surfaceRaised, fg: colors.text, iconColor: colors.textMuted };
  }
}

const styles = StyleSheet.create({
  root: { minHeight: touchTarget, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  flex: { flex: 1, alignSelf: 'stretch', justifyContent: 'center' },
  body: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingLeft: space.lg, paddingRight: space.sm },
  iconSlot: { width: 20, alignItems: 'center', justifyContent: 'center' },
  textWrap: { flex: 1, flexDirection: 'row' },
  text: { fontSize: font.md, fontFamily: family.bold },
  action: { minWidth: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.sm },
  close: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
});
