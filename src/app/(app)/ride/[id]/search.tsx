import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { AppTextInput } from '@/components/app-text-input';
import { BigButton } from '@/components/big-button';
import { ErrorText } from '@/components/error-text';
import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { Sheet } from '@/components/sheet';
import { useAfterModalClose } from '@/hooks/use-after-modal';
import { usePlaceSearch } from '@/hooks/use-place-search';
import { copy, errorText, t } from '@/lib/copy';
import { formatDistance } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { href } from '@/lib/nav';
import { firstName } from '@/lib/names';
import { SEARCH_CHIPS, type Place } from '@/lib/place-search';
import { proposeStop, toRideError, type StopKind } from '@/lib/ride-api';
import { categoryGlyph } from '@/lib/stop-ui';
import { useLiveUiStore } from '@/store/live-ui-store';
import { useRideStore } from '@/store/ride-store';
import { showToast } from '@/store/toast-store';
import { family, font, radius, space, touchTarget } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

/** The RPC limits (19 A): name 1-80 characters, address up to 160. */
const NAME_MAX = 80;
const ADDRESS_MAX = 160;

/**
 * Stop search (19 A): full-screen route pushed from the live search pill. Typed text or a category
 * chip searches Photon; picking a result opens a sheet. The leader sets the stop at once, a rider
 * sends the leader a proposal. Either way it returns to the live screen.
 */
export default function StopSearch() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const rideId = id ?? '';
  const { colors } = useTheme();

  const ride = useRideStore((s) => s.ride);
  const members = useRideStore((s) => s.members);
  const positions = useRideStore((s) => s.positions);
  const myUserId = useRideStore((s) => s.myUserId);
  const isLeader = !!ride && !!myUserId && ride.leader_id === myUserId;
  const leaderName = ride ? members[ride.leader_id]?.name : undefined;

  const myPos = myUserId ? positions[myUserId] : undefined;
  const myLat = myPos?.lat;
  const myLng = myPos?.lng;
  const me = useMemo(() => (myLat != null && myLng != null ? { lat: myLat, lng: myLng } : null), [myLat, myLng]);

  const { text, setText, chip, setChip, state, retry } = usePlaceSearch(me);
  const [picked, setPicked] = useState<Place | null>(null);
  const [sending, setSending] = useState<StopKind | null>(null);
  const afterSheet = useAfterModalClose();

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(href(`/ride/${rideId}/live`));
  }, [rideId]);

  const submit = async (kind: StopKind) => {
    if (!picked || sending) return;
    setSending(kind);
    try {
      const result = await proposeStop(rideId, {
        name: picked.name.slice(0, NAME_MAX),
        address: picked.address.slice(0, ADDRESS_MAX),
        lat: picked.lat,
        lng: picked.lng,
        kind,
      });
      haptic('success');
      setPicked(null);
      // Android drops a screen change while the sheet is still closing: leave once it has gone.
      afterSheet.schedule(() => {
        if (result.applied) useLiveUiStore.getState().focusStop();
        else showToast(t('stop.toastSent', { name: firstName(leaderName ?? '') || 'the leader' }));
        goBack();
      });
    } catch (e) {
      showToast(errorText(toRideError(e).code));
    } finally {
      setSending(null);
    }
  };

  const closeSheet = () => {
    if (!sending) setPicked(null);
  };

  const showClear = text.length > 0;
  const typedTooShort = state.status === 'idle' && text.trim().length > 0;

  return (
    <Screen padded={false} keyboardAvoiding footer={<Attribution />}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy['search.a11yBack']}
          onPress={goBack}
          style={styles.back}>
          <Icon name="back" color={colors.text} size={28} />
        </Pressable>
        <View style={styles.inputWrap}>
          <AppTextInput
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
            value={text}
            onChangeText={setText}
            placeholder={copy['search.placeholder']}
            accessibilityLabel={copy['search.placeholder']}
            style={styles.input}
          />
          {showClear ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy['search.a11yClear']}
              onPress={() => setText('')}
              style={styles.clear}>
              <Icon name="close" color={colors.textMuted} size={22} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
        {SEARCH_CHIPS.map((c) => {
          const on = chip === c.key;
          return (
            <Pressable
              key={c.key}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              hitSlop={{ top: 4, bottom: 4 }}
              onPress={() => {
                haptic('select');
                setChip(on ? null : c.key);
              }}
              style={[
                styles.chip,
                { backgroundColor: on ? colors.brandTint : colors.surface, borderColor: on ? colors.brandOnBg : 'transparent' },
              ]}>
              <Text allowFontScaling={false} style={styles.chipGlyph}>
                {c.glyph}
              </Text>
              <Text maxFontSizeMultiplier={1.3} style={[styles.chipLabel, { color: on ? colors.brandOnBg : colors.text }]}>
                {copy[c.labelKey]}
              </Text>
              {on ? <Icon name="ready" color={colors.brandOnBg} size={16} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView style={styles.flex} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.results}>
        {typedTooShort ? (
          <AppText muted style={styles.note}>
            {copy['search.hintMin']}
          </AppText>
        ) : null}
        {state.status === 'loading' ? <ActivityIndicator color={colors.brandOnBg} style={styles.note} /> : null}
        {state.status === 'error' ? (
          <View style={styles.note}>
            <ErrorText>{copy['search.error']}</ErrorText>
            <BigButton label={copy['search.retry']} variant="secondary" onPress={retry} />
          </View>
        ) : null}
        {state.status === 'results' && state.places.length === 0 ? (
          <AppText muted style={styles.note}>
            {copy['search.empty']}
          </AppText>
        ) : null}
        {state.status === 'results'
          ? state.places.map((p) => (
              <PlaceRow
                key={p.id}
                place={p}
                onPress={() => {
                  haptic('select');
                  setPicked(p);
                }}
              />
            ))
          : null}
      </ScrollView>

      <Sheet visible={picked !== null} onClose={closeSheet} onDismiss={afterSheet.onDismiss} hideClose>
        {picked ? (
          <>
            <AppText variant="heading" numberOfLines={2}>
              {picked.name}
            </AppText>
            {picked.address ? <AppText muted>{picked.address}</AppText> : null}
            {picked.distanceM != null ? (
              <AppText muted numeric>
                {t('search.away', { km: formatDistance(picked.distanceM) })}
              </AppText>
            ) : null}
            <BigButton
              label={isLeader ? copy['stop.leaderBreak'] : copy['stop.riderBreak']}
              icon="coffee"
              loading={sending === 'break'}
              disabled={sending === 'destination'}
              onPress={() => void submit('break')}
            />
            <BigButton
              label={isLeader ? copy['stop.leaderDestination'] : copy['stop.riderDestination']}
              icon="endRide"
              variant="secondary"
              loading={sending === 'destination'}
              disabled={sending === 'break'}
              onPress={() => void submit('destination')}
            />
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}

function PlaceRow({ place, onPress }: { place: Place; onPress: () => void }) {
  const { colors } = useTheme();
  const distance = place.distanceM != null ? formatDistance(place.distanceM) : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[place.name, place.address, distance].filter(Boolean).join(', ')}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.surfacePressed : 'transparent', borderBottomColor: colors.border }]}>
      <View style={[styles.glyphBox, { backgroundColor: colors.surface }]}>
        <Text allowFontScaling={false} style={styles.glyph}>
          {categoryGlyph(place.category)}
        </Text>
      </View>
      <View style={styles.rowText}>
        <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.name, { color: colors.text }]}>
          {place.name}
        </Text>
        {place.address ? (
          <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.address, { color: colors.textMuted }]}>
            {place.address}
          </Text>
        ) : null}
      </View>
      {distance ? (
        <Text maxFontSizeMultiplier={1.3} style={[styles.distance, { color: colors.textMuted }]}>
          {distance}
        </Text>
      ) : null}
    </Pressable>
  );
}

function Attribution() {
  const { colors } = useTheme();
  return (
    <Text maxFontSizeMultiplier={1.3} style={[styles.attribution, { color: colors.textSubtle }]}>
      {copy['search.attribution']}
    </Text>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingRight: space.lg },
  back: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  inputWrap: { flex: 1, justifyContent: 'center' },
  input: { paddingRight: touchTarget },
  clear: { position: 'absolute', right: 0, width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  chipsScroll: { flexGrow: 0 },
  chips: { gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md },
  chip: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 2,
  },
  chipGlyph: { fontSize: font.lg },
  chipLabel: { fontSize: font.md, fontFamily: family.semibold },
  results: { paddingBottom: space.lg },
  note: { padding: space.lg, gap: space.md },
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  glyphBox: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  glyph: { fontSize: font.lg },
  rowText: { flex: 1 },
  name: { fontSize: font.md, lineHeight: 22, fontFamily: family.bold },
  address: { fontSize: font.sm, lineHeight: 18, fontFamily: family.regular },
  distance: { fontSize: font.sm, fontFamily: family.semibold },
  attribution: { textAlign: 'center', fontSize: font.xs, fontFamily: family.regular, paddingVertical: space.sm },
});
