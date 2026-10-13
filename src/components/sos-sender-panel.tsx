import { router } from 'expo-router';
import * as SMS from '@/lib/sms';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { BigButton } from '@/components/big-button';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { HoldButton } from '@/components/hold-button';
import { Icon } from '@/components/icon';
import { SosCallButton } from '@/components/sos-call-button';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { copy, fill } from '@/lib/copy';
import {
  buildSosSms,
  senderCallList,
  textableContacts,
  textRecipientNames,
} from '@/lib/emergency-contacts';
import { haptic } from '@/lib/haptics';
import { href } from '@/lib/nav';
import { useRideStore } from '@/store/ride-store';
import { useSessionStore } from '@/store/session-store';
import { useSosStore } from '@/store/sos-store';
import { showToast } from '@/store/toast-store';
import { elevate, family, font, motion, radius, size, space, timing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

/**
 * My own SOS panel (11 §5): a full-screen overlay in the ride layout that opens when my SOS turns
 * on. One-tap calls to my contacts and 112, one tap to text my location, and the same hold-to-cancel
 * as the live screen. `Map` minimises it to the pinned banner, which reopens it.
 *
 * The group is always alerted and that cannot be turned off, so the panel says so and has no switch.
 * Never a spinner in front of 112: contacts come from an in-memory cache.
 */
export function SosSenderPanel({ rideId }: { rideId: string }) {
  const phase = useSosStore((s) => s.phase);
  const open = useSosStore((s) => s.panelOpen);
  if (!open || phase === 'idle') return null;
  return <PanelContent rideId={rideId} />;
}

function PanelContent({ rideId }: { rideId: string }) {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const phase = useSosStore((s) => s.phase);
  const contacts = useSosStore((s) => s.myContacts);
  const profileName = useSessionStore((s) => s.profile?.display_name ?? '');
  const [smsAvailable, setSmsAvailable] = useState<boolean | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const reduce = useReduceMotion();
  const [slide] = useState(() => new Animated.Value(0));

  const calls = useMemo(() => senderCallList(contacts), [contacts]);
  const textable = useMemo(() => textableContacts(contacts), [contacts]);
  const hasContacts = contacts.length > 0;

  // Refresh the cache in the background; what is cached shows immediately.
  useEffect(() => {
    void useSosStore.getState().loadMyContacts();
  }, []);

  useEffect(() => {
    let alive = true;
    SMS.isAvailableAsync()
      .then((ok) => alive && setSmsAvailable(ok))
      .catch(() => alive && setSmsAvailable(false));
    return () => {
      alive = false;
    };
  }, []);

  // Band slides down in 200 ms (no slide with Reduce Motion).
  useEffect(() => {
    if (reduce) {
      slide.setValue(1);
      return;
    }
    const run = Animated.timing(slide, { toValue: 1, duration: motion.base, useNativeDriver: true });
    run.start();
    return () => run.stop();
  }, [slide, reduce]);

  const minimise = () => useSosStore.getState().closePanel();

  // Android back minimises; it never cancels the SOS.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      useSosStore.getState().closePanel();
      return true;
    });
    return () => sub.remove();
  }, []);

  const statusLine =
    phase === 'active'
      ? copy['sosMe.alerted']
      : phase === 'sending'
        ? copy['sosMe.sending']
        : copy['sosMe.retrying'];

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(`${copy['sosMe.title']}. ${statusLine}`);
  }, [statusLine]);

  const textLocation = async () => {
    haptic('medium', { safety: true });
    const myUserId = useRideStore.getState().myUserId;
    const pos = myUserId ? useRideStore.getState().positions[myUserId] : undefined;
    const body = buildSosSms(profileName, pos ? { lat: pos.lat, lng: pos.lng } : null);
    try {
      await SMS.sendSMSAsync(
        textable.map((c) => c.phone),
        body,
      );
      showToast(copy['sosMe.smsOpened']);
    } catch {
      showToast(copy['sosMe.smsFail']);
    }
  };

  const white = colors.onStatus.sosStrong;
  const canText = textable.length > 0 && smsAvailable !== false;

  return (
    <View
      accessibilityViewIsModal
      style={[StyleSheet.absoluteFill, styles.root, { backgroundColor: colors.bg }]}>
      <StatusBar style="light" />
      <Animated.View
        accessible
        accessibilityRole="header"
        accessibilityLabel={`${copy['sosMe.title']}. ${statusLine}. ${copy['sosMe.alwaysOn']}`}
        style={[
          styles.band,
          {
            backgroundColor: colors.status.sosStrong,
            paddingTop: insets.top + space.lg,
            opacity: slide,
            transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }],
          },
        ]}>
        <View style={styles.titleRow}>
          <Icon name="sos" color={white} size={36} />
          <Text maxFontSizeMultiplier={1.3} style={[styles.title, { color: white }]}>
            {copy['sosMe.title']}
          </Text>
        </View>
        <Text maxFontSizeMultiplier={1.3} style={[styles.status, { color: white }]}>
          {statusLine}
        </Text>
        <View style={styles.alwaysRow}>
          <Icon name="lock" color={white} size={16} />
          <Text maxFontSizeMultiplier={1.3} style={[styles.always, { color: white }]}>
            {copy['sosMe.alwaysOn']}
          </Text>
        </View>
      </Animated.View>

      <ScrollView style={styles.flex} contentContainerStyle={styles.body}>
        {calls.map((item) => (
          <SosCallButton key={item.key} item={item} variant={item.strongest ? 'filled' : 'outline'} />
        ))}

        {canText || (textable.length > 0 && smsAvailable === false) ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${copy['sosMe.text']}. ${textSub(textable.length > 0 && smsAvailable !== false, textRecipientNames(contacts))}`}
            accessibilityState={{ disabled: !canText }}
            disabled={!canText}
            onPress={() => void textLocation()}
            style={({ pressed }) => [
              styles.textButton,
              { backgroundColor: pressed ? colors.surfacePressed : colors.surface, opacity: !canText ? 0.5 : 1 },
            ]}>
            <Icon name="message" color={colors.text} size={24} />
            <View style={styles.flex}>
              <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[styles.textLabel, { color: colors.text }]}>
                {copy['sosMe.text']}
              </Text>
              <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[styles.textSub, { color: colors.textMuted }]}>
                {canText ? fill(copy['sosMe.textSub'], { names: textRecipientNames(contacts) }) : copy['sosMe.smsUnavailable']}
              </Text>
            </View>
          </Pressable>
        ) : null}

        {!hasContacts ? (
          <View style={[styles.empty, { backgroundColor: colors.surface }]}>
            <AppText variant="heading">
              {copy['sosMe.emptyTitle']}
            </AppText>
            <BigButton
              label={copy['sosMe.emptyAdd']}
              variant="secondary"
              fixedShape
              onPress={() => router.push(href('/emergency-contacts'))}
            />
          </View>
        ) : null}
      </ScrollView>

      <View
        style={[
          styles.actions,
          { backgroundColor: colors.surfaceRaised, paddingBottom: space.md + insets.bottom },
          elevate('e2', scheme),
        ]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy['sosMe.a11yMinimise']}
          onPress={minimise}
          style={({ pressed }) => [styles.map, { backgroundColor: pressed ? colors.surfacePressed : colors.surface }]}>
          <Icon name="back" color={colors.text} size={24} />
          <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[styles.mapText, { color: colors.text }]}>
            {copy['sosMe.minimise']}
          </Text>
        </Pressable>
        <HoldButton
          tone="cancel"
          icon="close"
          label={copy['sos.cancelHold']}
          durationMs={timing.sosCancelHoldMs}
          flex={2}
          onComplete={() => void useSosStore.getState().cancel(rideId)}
          onEarlyRelease={() => showToast(copy['sos.holdHint'])}
          onA11yActivate={() => setConfirmCancel(true)}
        />
      </View>

      <ConfirmSheet
        visible={confirmCancel}
        title={copy['sos.cancelHold']}
        confirmLabel={copy['sos.cancelHold']}
        tone="primary"
        onConfirm={() => {
          setConfirmCancel(false);
          void useSosStore.getState().cancel(rideId);
        }}
        onCancel={() => setConfirmCancel(false)}
      />
    </View>
  );
}

const textSub = (ok: boolean, names: string) =>
  ok ? fill(copy['sosMe.textSub'], { names }) : copy['sosMe.smsUnavailable'];

const styles = StyleSheet.create({
  root: { zIndex: 10, elevation: 10 },
  flex: { flex: 1 },
  band: { paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  title: { fontSize: font.xxl, lineHeight: 40, letterSpacing: -0.8, fontFamily: family.bold },
  status: { fontSize: font.lg, fontFamily: family.semibold },
  alwaysRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  always: { flex: 1, fontSize: font.sm, fontFamily: family.regular, opacity: 0.9 },
  body: { padding: space.lg, gap: space.md },
  textButton: {
    height: size.rowLive,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
  },
  textLabel: { fontSize: font.lg, fontFamily: family.bold },
  textSub: { fontSize: font.sm, fontFamily: family.regular },
  empty: { borderRadius: radius.lg, padding: space.lg, gap: space.md },
  actions: {
    flexDirection: 'row',
    gap: space.md,
    padding: space.md,
  },
  map: {
    flex: 1,
    height: size.actionBar,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  mapText: { fontSize: font.md, fontFamily: family.bold },
});
