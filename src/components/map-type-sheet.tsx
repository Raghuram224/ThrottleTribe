import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Icon } from '@/components/icon';
import { MapTypeThumbnail } from '@/components/map-type-thumbnail';
import { Sheet } from '@/components/sheet';
import { copy, fill } from '@/lib/copy';
import type { MapLayer } from '@/lib/dem';
import { haptic } from '@/lib/haptics';
import { radius, size, space, touchTarget } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

interface MapTypeSheetProps {
  visible: boolean;
  onClose: () => void;
  layer: MapLayer;
  onChange: (layer: MapLayer) => void;
  /** The viewer is offline: the note says so first (25 §2.2). */
  offline: boolean;
}

const CARDS: { value: MapLayer; titleKey: 'mapType.standard' | 'mapType.terrain'; subKey: 'mapType.standardSub' | 'mapType.terrainSub' }[] = [
  { value: 'standard', titleKey: 'mapType.standard', subKey: 'mapType.standardSub' },
  { value: 'terrain', titleKey: 'mapType.terrain', subKey: 'mapType.terrainSub' },
];

/**
 * The Map type sheet (25 §2.2): two cards, Standard and Terrain. Tapping a card changes the map behind the sheet at once and
 * the sheet stays open so the rider sees it; the close button, the scrim or Back closes it. Selected = a thicker border,
 * a check and the checked state (never colour alone).
 */
export function MapTypeSheet({ visible, onClose, layer, onChange, offline }: MapTypeSheetProps) {
  const { colors } = useTheme();
  const pick = (next: MapLayer) => {
    if (next === layer) return;
    haptic('select');
    onChange(next);
    AccessibilityInfo.announceForAccessibility(next === 'terrain' ? copy['mapType.announceTerrain'] : copy['mapType.announceStandard']);
  };
  return (
    <Sheet visible={visible} onClose={onClose} hideClose>
      <View style={styles.titleRow}>
        <AppText variant="heading" maxFontSizeMultiplier={1.3} accessibilityRole="header" style={styles.title}>
          {copy['mapType.title']}
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy['common.close']}
          onPress={onClose}
          style={({ pressed }) => [styles.close, { backgroundColor: pressed ? colors.surfacePressed : 'transparent' }]}>
          <Icon name="close" color={colors.text} size={24} />
        </Pressable>
      </View>
      {offline ? (
        // Viewer offline is said first (25 §2.2), before the cards.
        <AppText variant="caption" muted maxFontSizeMultiplier={1.3}>
          {copy['mapType.offlineNote']}
        </AppText>
      ) : null}
      <View accessibilityRole="radiogroup" accessibilityLabel={copy['mapType.title']} style={styles.cards}>
        {CARDS.map((c) => {
          const selected = c.value === layer;
          return (
            <Pressable
              key={c.value}
              accessibilityRole="radio"
              accessibilityLabel={fill(copy['mapType.cardA11y'], { type: copy[c.titleKey], sub: copy[c.subKey] })}
              accessibilityState={{ checked: selected, selected }}
              onPress={() => pick(c.value)}
              style={({ pressed }) => [
                styles.card,
                {
                  backgroundColor: pressed ? colors.surfacePressed : colors.surfaceRaised,
                  borderColor: selected ? colors.brandOnBg : colors.borderStrong,
                  borderWidth: selected ? 2 : 1,
                  // The 1 dp the thin border lacks goes to padding, so the content never moves when selected.
                  padding: selected ? space.sm : space.sm + 1,
                },
              ]}>
              <MapTypeThumbnail layer={c.value} />
              <View style={styles.labelRow}>
                <AppText variant="bodyStrong" maxFontSizeMultiplier={1.3} style={styles.label}>
                  {copy[c.titleKey]}
                </AppText>
                {selected ? <Icon name="checkCircle" color={colors.brandOnBg} size={20} /> : null}
              </View>
              <AppText variant="caption" muted maxFontSizeMultiplier={1.3}>
                {copy[c.subKey]}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      {offline ? null : (
        <View style={styles.note}>
          <Icon name="alertCircle" color={colors.textMuted} size={16} />
          <AppText variant="caption" muted maxFontSizeMultiplier={1.3} style={styles.noteText}>
            {copy['mapType.dataNote']}
          </AppText>
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { flex: 1 },
  close: { width: size.mapControl, height: touchTarget, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  // The thumbnail fills the card's inner width; the card grows in height with a larger font.
  card: { flex: 1, minHeight: 168, minWidth: 160, borderRadius: radius.lg, padding: space.sm, gap: space.xs, alignItems: 'flex-start' },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, alignSelf: 'stretch', justifyContent: 'space-between' },
  label: { flexShrink: 1 },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  noteText: { flex: 1 },
});
