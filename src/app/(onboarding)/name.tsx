import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { AppTextInput } from '@/components/app-text-input';
import { BigButton } from '@/components/big-button';
import { Card } from '@/components/card';
import { ErrorText } from '@/components/error-text';
import { RiderAvatar } from '@/components/rider-avatar';
import { Screen } from '@/components/screen';
import { StatusChip } from '@/components/status-chip';
import { TopBar } from '@/components/top-bar';
import { useMotion } from '@/hooks/use-reduce-motion';
import { copy, errorText, fill } from '@/lib/copy';
import { haptic } from '@/lib/haptics';
import { href } from '@/lib/nav';
import { firstName, initialsOf } from '@/lib/names';
import { saveProfile, toRideError } from '@/lib/ride-api';
import { track } from '@/lib/telemetry';
import { getPendingJoinCode, setPendingJoinCode } from '@/store/prefs-store';
import { useSessionStore } from '@/store/session-store';
import { family, motion, size, space } from '@/theme/tokens';

const MAX = 40;
/** Past this many characters the hint says what riders will actually see in alerts (13 §2, P2). */
const LONG_NAME = 12;

export default function Name() {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = name.trim();
  const valid = trimmed.length >= 1 && trimmed.length <= MAX;
  const tooLong = name.length > MAX;
  const first = firstName(trimmed);
  const preview = trimmed || '?';

  const submit = async () => {
    if (!valid || loading) return;
    setLoading(true);
    setError(null);
    try {
      // saveProfile signs in first if the session is gone, so "Try again" covers not_authenticated too.
      const profile = await saveProfile(trimmed);
      useSessionStore.getState().setProfile(profile);
      track('onboarding.completed');
      haptic('success');
      const pending = getPendingJoinCode();
      if (pending) {
        setPendingJoinCode(null);
        router.replace(href(`/join?code=${pending}`));
      } else {
        router.replace(href('/home?welcome=1'));
      }
    } catch (e) {
      setError(errorText(toRideError(e).code));
      setLoading(false);
    }
  };

  return (
    <Screen
      scroll
      keyboardAvoiding
      top={<TopBar onBack={() => router.back()} />}
      footer={
        <>
          {error ? (
            <ErrorText>{error}</ErrorText>
          ) : null}
          <BigButton
            label={error ? copy['common.tryAgain'] : copy['name.cta']}
            disabled={!valid}
            loading={loading}
            onPress={() => void submit()}
          />
        </>
      }>
      <View style={styles.head}>
        <AppText variant="title" accessibilityRole="header">
          {copy['name.title']}
        </AppText>
        <AppText muted>{copy['name.subtitle']}</AppText>
      </View>
      <View style={styles.field}>
        <AppTextInput
          value={name}
          onChangeText={(v) => {
            setName(v);
            setError(null);
          }}
          autoFocus
          autoCapitalize="words"
          autoCorrect={false}
          maxLength={MAX}
          returnKeyType="done"
          textContentType="nickname"
          accessibilityLabel={copy['name.a11yInput']}
          onSubmitEditing={() => void submit()}
        />
        <View style={styles.helper}>
          {tooLong ? (
            <View style={styles.hint}>
              <ErrorText>{copy['name.errorTooLong']}</ErrorText>
            </View>
          ) : (
            <AppText variant="caption" muted style={styles.hint}>
              {trimmed.length > LONG_NAME ? fill(copy['name.hintLong'], { first }) : copy['name.hint']}
            </AppText>
          )}
          <AppText variant="caption" muted numeric accessibilityLabel={`${name.length} of ${MAX} characters`}>
            {name.length}/{MAX}
          </AppText>
        </View>
      </View>

      {/* Live identity preview: teaches the list language before the first ride (13 §2). */}
      <Card gap={space.md}>
        <AppText variant="caption" muted>
          {copy['name.previewLabel']}
        </AppText>
        <View style={styles.previewAvatar}>
          <PreviewAvatar name={preview} large />
        </View>
        <View
          accessible
          accessibilityLabel={`${preview}, ${copy['status.moving']}`}
          style={styles.mock}>
          <PreviewAvatar name={preview} />
          <AppText numberOfLines={1} style={styles.mockName} maxFontSizeMultiplier={1.3}>
            {first || preview}
          </AppText>
          <StatusChip status="moving" size="sm" />
        </View>
      </Card>
    </Screen>
  );
}

/** "Me" avatar whose initials crossfade (150 ms) when they change; instant with Reduce Motion. */
function PreviewAvatar({ name, large }: { name: string; large?: boolean }) {
  const { duration } = useMotion();
  const initials = initialsOf(name);
  const [opacity] = useState(() => new Animated.Value(1));

  useEffect(() => {
    opacity.setValue(0.3);
    const run = Animated.timing(opacity, {
      toValue: 1,
      duration: duration(motion.fast),
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    run.start();
    return () => run.stop();
  }, [initials, opacity, duration]);

  return (
    <Animated.View style={{ opacity }}>
      <RiderAvatar name={name} colorIndex={0} me size={large ? size.avatarSos : size.avatar} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  head: { gap: space.sm },
  field: { gap: space.sm },
  helper: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  hint: { flex: 1 },
  previewAvatar: { alignItems: 'flex-start' },
  mock: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  mockName: { flexShrink: 1, fontFamily: family.semibold },
});
