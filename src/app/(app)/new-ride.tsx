import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { AppTextInput } from '@/components/app-text-input';
import { BigButton } from '@/components/big-button';
import { ErrorText } from '@/components/error-text';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented-control';
import { TopBar } from '@/components/top-bar';
import { copy, errorText, minuteCount, t } from '@/lib/copy';
import { haptic } from '@/lib/haptics';
import { stopRideTracking } from '@/lib/location/tracking';
import { href } from '@/lib/nav';
import { defaultRideName, firstName, isValidRideName } from '@/lib/names';
import { createRide, leaveRide, toRideError, type RideErrorCode } from '@/lib/ride-api';
import { usePrefsStore } from '@/store/prefs-store';
import { useSessionStore } from '@/store/session-store';
import { family, font, radius, size, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

const THRESHOLDS = [
  { value: 60, label: copy['newRide.threshold1'], a11yLabel: minuteCount(1), hint: copy['newRide.threshold1Hint'] },
  { value: 180, label: copy['newRide.threshold3'], a11yLabel: minuteCount(3), hint: copy['newRide.threshold3Hint'] },
  { value: 300, label: copy['newRide.threshold5'], a11yLabel: minuteCount(5), hint: copy['newRide.threshold5Hint'] },
];

const SUGGESTIONS = [copy['newRide.suggest1'], copy['newRide.suggest2'], copy['newRide.suggest3']];

export default function NewRide() {
  const { leaveRideId } = useLocalSearchParams<{ leaveRideId?: string }>();
  const { colors } = useTheme();
  const profile = useSessionStore((s) => s.profile);
  const thresholdS = usePrefsStore((s) => s.stopThresholdS);
  const setThresholdS = usePrefsStore((s) => s.setStopThresholdS);
  // null = untouched: follows the default, which updates when the profile finishes loading.
  const [edited, setName] = useState<string | null>(null);
  const name = edited ?? defaultRideName(firstName(profile?.display_name ?? ''));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<RideErrorCode | null>(null);

  const trimmed = name.trim();
  const valid = isValidRideName(trimmed);

  const create = async () => {
    if (!valid || loading) return;
    if (error === 'profile_required') return router.replace(href('/profile'));
    setLoading(true);
    setError(null);
    try {
      if (leaveRideId) {
        // Confirmed on Home: leave the old ride now that the new one is really being created.
        try {
          await leaveRide(leaveRideId);
        } catch (e) {
          if (toRideError(e).code !== 'not_a_member') throw e;
        }
        await stopRideTracking();
      }
      const ride = await createRide(trimmed, thresholdS);
      haptic('success');
      // Invite riders first (10 §1); its Continue button then runs the permissions check and the lobby.
      router.replace(href(`/ride/${ride.id}/invite?first=1`));
    } catch (e) {
      setError(toRideError(e).code);
      setLoading(false);
    }
  };

  return (
    <Screen
      scroll
      keyboardAvoiding
      top={<TopBar glyph="close" title={copy['newRide.title']} onBack={() => router.back()} />}
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
