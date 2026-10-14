import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Icon } from '@/components/icon';
import { PlaceRow } from '@/components/place-search-view';
import { copy } from '@/lib/copy';
import { haversineM, type LatLng } from '@/lib/geo';
import type { Place } from '@/lib/place-search';
import { shownRecents, type RecentPlace } from '@/lib/recent-places';
import { useRecentsStore } from '@/store/recents-store';
import { family, font, space, touchTarget } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

interface RecentPlacesSectionProps {
  /** My position, for the distance column; null = no distances. */
  me: LatLng | null;
  onPick: (place: Place) => void;
  /** Shows the "Clear" action (Where to? owns the confirm); the in-ride search has none. */
  onClear?: () => void;
}

/** The recent places list (21 §2.2): shared by Where to? and the in-ride stop search. Null when there are none. */
export function RecentPlacesSection({ me, onPick, onClear }: RecentPlacesSectionProps) {
  const { colors } = useTheme();
  const recents = useRecentsStore((s) => s.recents);
  const shown = shownRecents(recents);
  if (shown.length === 0) return null;
  const asPlace = (r: RecentPlace): Place => ({ ...r, distanceM: me ? haversineM(me, r) : null });
  return (
    <View>
      <View style={styles.sectionRow}>
        <AppText variant="label" muted accessibilityRole="header" maxFontSizeMultiplier={1.3}>
          {copy['whereTo.recent']}
        </AppText>
        {onClear ? (
          <Pressable accessibilityRole="button" accessibilityLabel={copy['whereTo.clearTitle']} onPress={onClear} style={styles.clear}>
            <Text maxFontSizeMultiplier={1.3} style={[styles.clearText, { color: colors.brandOnBg }]}>
              {copy['whereTo.clear']}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {shown.map((r) => {
        const place = asPlace(r);
        return (
          <PlaceRow
            key={r.id}
            name={r.name}
            address={r.address}
            // Recomputed from my fix; without one there is no distance column.
            distanceM={place.distanceM}
            leading={<Icon name="history" color={colors.textMuted} size={20} />}
            onPress={() => onPick(place)}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionRow: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: space.lg,
    marginTop: space.sm,
  },
  // 56 dp hit area; the word itself is small.
  clear: { minHeight: touchTarget, minWidth: touchTarget, paddingHorizontal: space.lg, alignItems: 'center', justifyContent: 'center' },
  clearText: { fontSize: font.md, fontFamily: family.semibold },
});
