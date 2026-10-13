import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { haptic } from '@/lib/haptics';
import { elevate, family, font, motion, radius, touchTarget } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

export interface SegmentOption<T extends string | number> {
  value: T;
  label: string;
  /** Spoken label, e.g. "3 minutes". */
  a11yLabel?: string;
  /** Sub-label under the label (12 muted), e.g. "city". */
  hint?: string;
}

interface SegmentedControlProps<T extends string | number> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Label for the whole group. */
  accessibilityLabel?: string;
}

/**
 * 2-3 equal segments, 56 tall. Track `surface`; the selected thumb is `surfaceRaised` + e1 with a
 * check icon, so it is not colour alone. The thumb (`segThumb`) glides between segments. Orange fills stay reserved for the one primary button.
 */
export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: SegmentedControlProps<T>) {
  const { colors, scheme, traits } = useTheme();
  const [trackW, setTrackW] = useState(0);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const segW = trackW > 0 ? (trackW - PAD * 2 - GAP * (options.length - 1)) / options.length : 0;
  const x = useSharedValue(0);
  useEffect(() => {
    x.value = withTiming(PAD + index * (segW + GAP), {
      duration: motion.layout,
      easing: Easing.out(Easing.cubic),
      reduceMotion: ReduceMotion.System,
    });
  }, [index, segW, x]);
  const thumb = useAnimatedStyle(() => ({ left: x.value }));
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
      style={[styles.row, { backgroundColor: colors.surface, borderRadius: traits.segRadius }]}>
      {segW > 0 ? (
        <Animated.View
          style={[
            styles.thumb,
            { width: segW, backgroundColor: colors.segThumb, borderRadius: traits.segThumbRadius },
            traits.segThumbShadow ? elevate('e1', scheme) : null,
            thumb,
          ]}
        />
      ) : null}
      {options.map((option) => {
        const selected = option.value === value;
        const spoken = [option.a11yLabel ?? option.label, option.hint].filter(Boolean).join(', ');
        return (
          <Pressable
            key={String(option.value)}
            accessibilityRole="radio"
            accessibilityLabel={selected ? `${spoken}, selected` : spoken}
            accessibilityState={{ selected, checked: selected }}
            onPress={() => {
              if (selected) return;
              haptic('select');
              onChange(option.value);
            }}
            style={styles.segment}>
            <View style={styles.content}>
              {selected && traits.segCheck ? <Icon name="ready" color={colors.segThumbIcon} size={traits.cardElevation === 'outline' ? 18 : 16} /> : null}
              <Text
                maxFontSizeMultiplier={1.3}
                style={[styles.label, { color: selected ? colors.segThumbIcon : colors.text, fontFamily: selected ? family.bold : family.semibold }]}>
                {option.label}
              </Text>
            </View>
            {option.hint ? (
              <Text maxFontSizeMultiplier={1.3} style={[styles.hint, { color: selected ? colors.segThumbIcon : colors.textMuted }]}>
                {option.hint}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const PAD = 4;
const GAP = 4;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', borderRadius: radius.md, padding: PAD, gap: GAP },
  thumb: { position: 'absolute', top: PAD, bottom: PAD, borderRadius: radius.md - 4 },
  segment: {
    flex: 1,
    minHeight: touchTarget - 8,
    borderRadius: radius.md - 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  label: { fontSize: font.md, lineHeight: 22, fontFamily: family.semibold },
  hint: { fontSize: font.xs, lineHeight: 16, fontFamily: family.regular },
});
