import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Icon } from '@/components/icon';
import { Sheet } from '@/components/sheet';
import { copy, fill } from '@/lib/copy';
import { creditEntries } from '@/lib/credits';
import { DEM_PROVIDER } from '@/lib/flags';
import { haptic } from '@/lib/haptics';
import { family, font, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

/** Profile > Privacy > "Map and search credits" (24 §4.4, 25 §5.2): seven rows, each one a link; reaches the OSM licence. */
export function CreditsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  return (
    <Sheet visible={visible} onClose={onClose}>
      <AppText variant="heading" maxFontSizeMultiplier={1.3} accessibilityRole="header">
        {copy['credits.title']}
      </AppText>
      <View>
        {creditEntries(DEM_PROVIDER).map((c) => (
          <Pressable
            key={c.id}
            accessibilityRole="link"
            accessibilityLabel={fill(copy['credit.linkA11y'], { name: copy[c.titleKey] as string, site: c.site })}
            onPress={() => {
              haptic('select');
              void Linking.openURL(c.url);
            }}
            style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.surfacePressed : 'transparent' }]}>
            <View style={styles.texts}>
              <AppText style={styles.title} maxFontSizeMultiplier={1.3}>
                {copy[c.titleKey] as string}
              </AppText>
              <AppText variant="caption" muted maxFontSizeMultiplier={1.3}>
                {copy[c.subKey] as string}
              </AppText>
            </View>
            <Icon name="openInNew" color={colors.textMuted} size={20} />
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  texts: { flex: 1 },
  title: { fontFamily: family.semibold, fontSize: font.md },
});
