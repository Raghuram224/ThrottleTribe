import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { BigButton } from '@/components/big-button';
import { ErrorText } from '@/components/error-text';
import { Icon } from '@/components/icon';
import { mapEnter, notifEnter } from '@/components/motion-presets';
import { copy, errorText } from '@/lib/copy';
import { href } from '@/lib/nav';
import { ensureSignedIn, toRideError } from '@/lib/ride-api';
import { track } from '@/lib/telemetry';
import { family, font, fontNumeric, palette, radius, resolveTokens, space } from '@/theme/tokens';

// Welcome is ink in both schemes (16 §1): it reads the dark Tribe tokens directly.
const ink = resolveTokens('tribe', 'dark');
const FADE_BANDS = 10;

export default function Welcome() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 390 x 520 at the design width; the image is 3:4 and anchored to the top.
  const heroH = Math.round((width * 4) / 3);

  useEffect(() => {
    track('onboarding.started');
  }, []);

  const start = async () => {
    setLoading(true);
    setError(null);
    try {
      // Anonymous sign-in happens here, not at launch. Already signed in? ensureSignedIn is a no-op.
      await ensureSignedIn();
      router.push(href('/name'));
    } catch (e) {
      const code = toRideError(e).code;
      setError(code === 'network' ? copy['welcome.errorNetwork'] : errorText(code));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: ink.ink }]}>
      <StatusBar style="light" />
      <Animated.View entering={mapEnter} style={[styles.hero, { height: heroH }]} pointerEvents="none">
        <Image
          source={require('../../../assets/brand/png/welcome-hero.png')}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        {/* Fade to ink from y 230 to 380 of the 520 hero, as stacked bands (no gradient dependency). */}
        <View style={[styles.fade, { top: heroH * (230 / 520), height: heroH * (150 / 520) }]}>
          {Array.from({ length: FADE_BANDS }, (_, i) => (
            <View key={i} style={{ flex: 1, backgroundColor: ink.ink, opacity: (i + 1) / FADE_BANDS }} />
          ))}
        </View>
        <View style={[styles.fadeSolid, { top: heroH * (380 / 520), backgroundColor: ink.ink }]} />
        <Text maxFontSizeMultiplier={1.2} style={[styles.attribution, { top: heroH * 0.66, color: ink.onInkSubtle }]}>
          {copy['live.attribution']}
        </Text>
      </Animated.View>

      {/* Live-looking notification, a real view so it stays crisp and translatable. */}
      <Animated.View
        entering={notifEnter}
        accessible
        accessibilityLabel={`${copy['welcome.notifTitle']}. ${copy['welcome.notifSub']}`}
        style={[styles.notif, { top: Math.max(64, insets.top + 12), backgroundColor: `${ink.inkRaised}EB`, borderColor: ink.hairlineOnDark }]}>
        <View style={[styles.notifTile, { backgroundColor: palette.status.stopped }]}>
          <Icon name="stopped" color={palette.onStatus.stopped} size={22} />
        </View>
        <View style={styles.flex}>
          <Text maxFontSizeMultiplier={1.2} numberOfLines={1} style={[styles.notifTitle, { color: ink.paper }]}>
            {copy['welcome.notifTitle']}
          </Text>
          <Text maxFontSizeMultiplier={1.2} numberOfLines={1} style={[styles.notifSub, fontNumeric, { color: ink.onInkMuted }]}>
            {copy['welcome.notifSub']}
          </Text>
        </View>
        <Text maxFontSizeMultiplier={1.2} style={[styles.notifNow, { color: ink.onInkSubtle }]}>
          {copy['welcome.notifNow']}
        </Text>
      </Animated.View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, space.lg) + space.sm }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.lockup} accessible accessibilityRole="header" accessibilityLabel={copy['welcome.title']}>
          <Image
            source={require('../../../assets/brand/png/logo-mark-on-dark.png')}
            style={styles.mark}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text maxFontSizeMultiplier={1.3} style={[styles.wordmark, { color: ink.paper }]}>
            {'Throttle '}
            <Text style={{ color: ink.wordmarkAccent }}>Tribe</Text>
          </Text>
        </View>
        <AppText accessibilityRole="header" maxFontSizeMultiplier={1.2} style={[styles.headline, { color: ink.paper }]}>
          {copy['welcome.headline']}
        </AppText>
        <AppText maxFontSizeMultiplier={1.3} style={[styles.body, { color: ink.onInkMuted }]}>
          {copy['welcome.body']}
        </AppText>
        {error ? <ErrorText>{error}</ErrorText> : null}
        <View style={styles.actions}>
          <BigButton
            label={error ? copy['common.tryAgain'] : copy['welcome.cta']}
            prominent
            loading={loading}
            onPress={() => void start()}
          />
          {/* --- account --- returning rider: sign in. No ensureSignedIn here: signing in creates the session. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy['welcome.signIn']}
            onPress={() => router.push(href('/auth/identify?mode=signin'))}
            style={styles.ghost}>
            <Text maxFontSizeMultiplier={1.3} style={[styles.ghostText, { color: ink.paper }]}>
              {copy['welcome.signIn']}
            </Text>
          </Pressable>
          {/* --- end account --- */}
        </View>
        <Text maxFontSizeMultiplier={1.3} style={[styles.noSignup, { color: ink.onInkSubtle }]}>
          {copy['welcome.noSignup']}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  hero: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
  fade: { position: 'absolute', left: 0, right: 0 },
  fadeSolid: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  attribution: { position: 'absolute', left: 12, fontSize: 10, lineHeight: 14, fontFamily: family.regular, opacity: 0.8 },
  notif: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  notifTile: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  notifTitle: { fontSize: 15, lineHeight: 20, fontFamily: family.semibold },
  notifSub: { fontSize: 13, lineHeight: 18, fontFamily: family.regular },
  notifNow: { fontSize: 13, fontFamily: family.regular },
  content: { flexGrow: 1, justifyContent: 'flex-end', paddingHorizontal: space.lg, gap: space.md },
  lockup: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  mark: { width: 32, height: 32 },
  wordmark: { fontSize: 18, lineHeight: 24, fontFamily: family.bold },
  headline: { fontSize: 38, lineHeight: 42, letterSpacing: -1.2, fontFamily: family.bold },
  body: { fontSize: font.md, lineHeight: 24, fontFamily: family.regular },
  actions: { gap: space.sm, marginTop: space.sm },
  ghost: { minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  ghostText: { fontSize: font.md, fontFamily: family.semibold },
  noSignup: { fontSize: 13, lineHeight: 18, fontFamily: family.regular, textAlign: 'center' },
});
