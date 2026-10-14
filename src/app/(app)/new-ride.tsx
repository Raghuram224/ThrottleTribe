import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { AppTextInput } from '@/components/app-text-input';
import { BigButton } from '@/components/big-button';
import { ErrorText } from '@/components/error-text';
import { DestinationCard } from '@/components/destination-card';
import { Screen } from '@/components/screen';
import { SectionLabel } from '@/components/section-label';
import { SegmentedControl } from '@/components/segmented-control';
import { TopBar } from '@/components/top-bar';
import { copy, errorText, minuteCount, t } from '@/lib/copy';
import { formatDistance, formatDuration } from '@/lib/format';
import { createGroupRide } from '@/lib/group-ride';
import { haversineM } from '@/lib/geo';
import { haptic } from '@/lib/haptics';
import { href } from '@/lib/nav';
import { defaultRideName, firstName, isValidRideName } from '@/lib/names';
import { toRideError, type RideErrorCode } from '@/lib/ride-api';
import { resetToRide } from '@/lib/reset-to-ride';
import { isRideStartBusy } from '@/lib/ride-start';
import { track } from '@/lib/telemetry';
import { useNavStore } from '@/store/nav-store';
import { usePlanStore } from '@/store/plan-store';
import { usePrefsStore } from '@/store/prefs-store';
import { useRecentsStore } from '@/store/recents-store';
import { useSessionStore } from '@/store/session-store';
import { showToast } from '@/store/toast-store';
import { family, font, radius, size, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

const THRESHOLDS = [
  { value: 60, label: copy['newRide.threshold1'], a11yLabel: minuteCount(1), hint: copy['newRide.threshold1Hint'] },
  { value: 180, label: copy['newRide.threshold3'], a11yLabel: minuteCount(3), hint: copy['newRide.threshold3Hint'] },
  { value: 300, label: copy['newRide.threshold5'], a11yLabel: minuteCount(5), hint: copy['newRide.threshold5Hint'] },
];

const SUGGESTIONS = [copy['newRide.suggest1'], copy['newRide.suggest2'], copy['newRide.suggest3']];

export default function NewRide() {
  const { leaveRideId, dest: destParam } = useLocalSearchParams<{ leaveRideId?: string; dest?: string }>();
  const { colors } = useTheme();
  const profile = useSessionStore((s) => s.profile);
  const thresholdS = usePrefsStore((s) => s.stopThresholdS);
  const setThresholdS = usePrefsStore((s) => s.setStopThresholdS);
  // null = untouched: follows the default, which updates when the profile finishes loading.
  const [edited, setName] = useState<string | null>(null);
  // With `dest=1` the place chosen on the map home is the ride's destination (22 §3.6); a cold URL with no
  // place behaves as the form always did.
  const planPlace = usePlanStore((s) => s.place);
  const routeSummary = usePlanStore((s) => s.routeSummary);
  const origin = useNavStore((s) => s.origin);
  const dest = destParam === '1' ? planPlace : null;
  // Never "To {place}": the invite text carries the ride name, and the destination is not in it (22 decision 3).
  const name = edited ?? defaultRideName(firstName(profile?.display_name ?? ''));
  const destDetail = !dest
    ? ''
    : routeSummary
      ? `${formatDistance(routeSummary.distanceM)} · ${formatDuration(routeSummary.durationS * 1000)}`
      : origin
        ? t('stop.cardDistanceApprox', { km: formatDistance(haversineM(origin, dest)) })
        : dest.address;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<RideErrorCode | null>(null);

  // Back (hardware, the modal swipe, the close button) is blocked while the ride is being made: leaving mid-create
  // could land on the invite with no Home below, or lose the error that says it failed.
  useEffect(() => {
    if (!loading) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [loading]);

  const trimmed = name.trim();
  const valid = isValidRideName(trimmed);

  const create = async () => {
    if (!valid || loading) return;
    if (error === 'profile_required') return router.replace(href('/profile'));
    setLoading(true);
    setError(null);
    try {
      // Confirmed on Home: the old ride is left now that the new one is really being created (inside the one
      // start lock); with a destination, propose_stop follows create_ride and a failure rolls the ride back.
      const start = await createGroupRide({ name: trimmed, thresholdS, dest, leaveRideId });
      if (start.existing) {
        // A ride was already open: it is opened as it is (never a second one), as the solo path does.
        showToast(dest ? t('preview.existingRide', { name: dest.name }) : copy['newRide.existingRide']);
        haptic('success');
        resetToRide(start.href);
        return;
      }
      const ride = start.ride;
      haptic('success');
      if (dest) {
        useRecentsStore.getState().add(dest);
        track('plan.choice', { choice: 'group' });
      }
      usePlanStore.getState().reset();
      // Invite riders first (10 §1); its Continue button then runs the permissions check and the lobby.
      router.replace(href(`/ride/${ride.id}/invite?first=1`));
    } catch (e) {
      // A start already in flight elsewhere is not an error to show.
      if (!isRideStartBusy(e)) setError(toRideError(e).code);
      setLoading(false);
    }
  };

  return (
    <Screen
      scroll
      keyboardAvoiding
      top={
        <TopBar
          glyph="close"
          title={dest ? copy['newRide.titleDest'] : copy['newRide.title']}
          onBack={() => {
            if (!loading) router.back();
          }}
        />
      }
      footer={
        <>
          {error ? (
            <ErrorText>{errorText(error)}</ErrorText>
          ) : null}
          <BigButton
            label={
              error === 'profile_required'
                ? copy['newRide.setName']
                : error
                  ? copy['common.tryAgain']
                  : copy['newRide.cta']
            }
            disabled={!valid}
            loading={loading}
            onPress={() => void create()}
          />
        </>
      }>
      <Stack.Screen options={{ gestureEnabled: !loading }} />
      {dest ? (
        <View style={styles.field}>
          <SectionLabel>{copy['newRide.destLabel']}</SectionLabel>
          <DestinationCard
            name={dest.name}
            detail={destDetail}
            category={dest.category}
            a11yLabel={t('newRide.a11yDest', { name: dest.name, distance: destDetail })}
          />
          <AppText variant="caption" muted>
            {copy['newRide.destNote']}
          </AppText>
        </View>
      ) : null}
      <View style={styles.field}>
        <AppText style={styles.label}>{copy['newRide.nameLabel']}</AppText>
        <AppTextInput
          value={name}
          onChangeText={setName}
          maxLength={60}
          selectTextOnFocus
          returnKeyType="done"
          accessibilityLabel={copy['newRide.nameLabel']}
        />
        <View style={styles.chips}>
          {SUGGESTIONS.map((s) => (
            <Pressable
              key={s}
              accessibilityRole="button"
              accessibilityLabel={s}
              onPress={() => {
                haptic('select');
                setName(s);
              }}
              hitSlop={{ top: 4, bottom: 4 }}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor:
                    name === s ? colors.brandTint : pressed ? colors.surfacePressed : colors.surface,
                },
              ]}>
              <Text
                maxFontSizeMultiplier={1.3}
                style={[styles.chipText, { color: name === s ? colors.brandOnBg : colors.text }]}>
                {s}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={styles.field}>
        <AppText style={styles.label}>{copy['newRide.thresholdLabel']}</AppText>
        <SegmentedControl
          options={THRESHOLDS}
          value={thresholdS}
          // Persisted on selection: the last choice is the next default.
          onChange={setThresholdS}
          accessibilityLabel={copy['newRide.thresholdLabel']}
        />
        <AppText variant="caption" muted>
          {t('newRide.thresholdPreview', { n: Math.round(thresholdS / 60) })}
        </AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  field: { gap: space.sm },
  label: { fontSize: font.sm, lineHeight: 20, fontFamily: family.semibold },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    height: size.chip - 8,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
  },
  chipText: { fontSize: font.sm, fontFamily: family.semibold },
});
