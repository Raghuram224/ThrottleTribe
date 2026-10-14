import { useEffect, useRef } from 'react';
import { AccessibilityInfo, findNodeHandle, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BigButton } from '@/components/big-button';
import { Icon } from '@/components/icon';
import { copy, t } from '@/lib/copy';
import { haptic } from '@/lib/haptics';
import { placeSubline, placeSummaryA11y } from '@/lib/plan-flow';
import type { PlanPlace } from '@/store/plan-store';
import { elevate, family, font, fontNumeric, radius, space, touchTarget, type } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

interface PlacePanelProps {
  place: PlanPlace;
  /** Straight-line metres from my fix; null = no fix. */
  distanceM: number | null;
  onClose: () => void;
  onDirections: () => void;
  /** Screen-reader escape gesture (iOS two-finger Z): the same as Back, one step out (22 §10). */
  onEscape: () => void;
  onLayout: (height: number) => void;
}

/**
 * Place sheet (22 §3.3): confirm this is the right place. Fixed (no drag): name, "≈ distance · category",
 * address, one primary, Directions. No routing request happens in this mode.
 */
export function PlacePanel({ place, distanceM, onClose, onDirections, onEscape, onLayout }: PlacePanelProps) {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const groupRef = useRef<View>(null);

  // Focus moves to the place (the name, distance and address read as one) when the sheet opens (22 §10).
  useEffect(() => {
    const timer = setTimeout(() => {
      const node = findNodeHandle(groupRef.current);
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    }, 300);
    return () => clearTimeout(timer);
  }, [place.id]);

  return (
    <View
      onAccessibilityEscape={onEscape}
      onLayout={(e: LayoutChangeEvent) => onLayout(e.nativeEvent.layout.height)}
      style={[styles.panel, { backgroundColor: colors.surfaceRaised, paddingBottom: space.lg + insets.bottom }, elevate('e3', scheme)]}>
      <View ref={groupRef} accessible accessibilityLabel={placeSummaryA11y(place.name, place.address, distanceM)} style={styles.texts}>
        <View style={styles.titleRow}>
          <Text numberOfLines={2} maxFontSizeMultiplier={1.3} style={[styles.name, { color: colors.text }]}>
            {place.name}
          </Text>
          <View style={styles.closeSlot} />
        </View>
        <Text numberOfLines={2} maxFontSizeMultiplier={1.3} style={[styles.sub, fontNumeric, { color: colors.text }]}>
          {placeSubline(distanceM, place.category)}
        </Text>
        {place.address ? (
          <Text numberOfLines={2} maxFontSizeMultiplier={1.3} style={[styles.address, { color: colors.textMuted }]}>
            {place.address}
          </Text>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('place.closeA11y', { name: place.name })}
        onPress={() => {
          haptic('select');
          onClose();
        }}
        style={styles.close}>
        <Icon name="close" color={colors.textMuted} size={24} />
      </Pressable>
      <BigButton
        label={copy['place.directions']}
        accessibilityLabel={t('place.directionsA11y', { name: place.name })}
        icon="navigate"
        prominent
        onPress={() => {
          haptic('select');
          onDirections();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: space.lg,
    gap: space.sm,
  },
  texts: { gap: space.xs },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start' },
  name: { flex: 1, fontSize: font.lg, lineHeight: type.heading.line, fontFamily: family.semibold },
  // The close button floats in the panel's top-right corner; this keeps the name clear of it.
  closeSlot: { width: touchTarget - space.lg },
  close: { position: 'absolute', top: space.xs, right: space.xs, width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  sub: { fontSize: font.md, lineHeight: 22, fontFamily: family.semibold },
  address: { fontSize: font.sm, lineHeight: 20, fontFamily: family.regular },
});
