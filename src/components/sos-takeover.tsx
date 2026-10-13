import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import {
  AccessibilityInfo,
  BackHandler,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Banner } from '@/components/banner';
import { Icon } from '@/components/icon';
import { SosCallButton } from '@/components/sos-call-button';
import { useNow } from '@/hooks/use-now';
import { distHeadline } from '@/lib/alert-text';
import { copy, errorText, fill, t } from '@/lib/copy';
import { fetchSosContacts } from '@/lib/emergency-contacts-api';
import { receiverView, type ReceiverContactsState } from '@/lib/emergency-contacts';
import { formatDuration } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { phraseFor } from '@/lib/live-list';
import { firstName, splitNameTag } from '@/lib/names';
import { sendMessage, toRideError } from '@/lib/ride-api';
import {
  activeSos,
  navigationUrl,
  positionFromPayload,
  takeoverTarget,
  type ActiveSos,
} from '@/lib/sos';
import { useRideStore } from '@/store/ride-store';
import { useSosStore } from '@/store/sos-store';
import { showToast } from '@/store/toast-store';
import { family, font, type, fontNumeric, radius, size, space, touchTarget } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

const REPEAT_HAPTIC_MS = 1500;
/** The first Error haptic comes with the notification; the takeover adds the remaining four. */
const REPEAT_HAPTIC_COUNT = 4;

/** Other riders' SOS plus the one the takeover currently shows (null = closed or none). */
export function useReceiverSos() {
  const members = useRideStore((s) => s.members);
  const myUserId = useRideStore((s) => s.myUserId);
  const dismissed = useSosStore((s) => s.dismissed);
  const cursor = useSosStore((s) => s.cursor);
  const active = useMemo(() => activeSos(Object.values(members), myUserId), [members, myUserId]);
  const target = takeoverTarget(active, dismissed, cursor);
  return { active, target };
}

/**
 * Receiver SOS takeover (07 §3): a full-screen red overlay, an absolute sibling of <Screen> in the
 * ride layout so it survives navigation inside the ride. Dismiss shrinks it to the pinned banner.
 */
export function SosTakeover({ rideId, target }: { rideId: string; target: { sos: ActiveSos; more: number } | null }) {
  if (!target) return null;
  return <TakeoverContent key={target.sos.key} rideId={rideId} sos={target.sos} more={target.more} />;
}

function TakeoverContent({ rideId, sos, more }: { rideId: string; sos: ActiveSos; more: number }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const now = useNow(5000);
  const positions = useRideStore((s) => s.positions);
  const events = useRideStore((s) => s.events);
  const trail = useRideStore((s) => s.leaderTrail);
  const myUserId = useRideStore((s) => s.myUserId);
  const sent = useSosStore((s) => !!s.onMyWaySent[sos.key]);
  const [sending, setSending] = useState(false);

  const live = positions[sos.userId];
  const fallback = useMemo(() => {
    const ev = events.find((e) => e.type === 'sos' && e.user_id === sos.userId);
    return ev ? positionFromPayload(ev.payload) : null;
  }, [events, sos.userId]);
  const pos = live ?? fallback;
  const myPos = myUserId ? positions[myUserId] : undefined;
  const phrase = phraseFor(trail, myPos, pos ?? undefined);
  const distance = distHeadline(phrase);
  const updatedMs = live ? Date.parse(live.updatedAt) : NaN;
  const age = Number.isNaN(updatedMs)
    ? copy['sos.positionUnknown']
    : t('sos.lastPosition', { duration: formatDuration(now - updatedMs) });
  const sentAt = sos.sosAt ? new Date(sos.sosAt) : null;
  const sentText =
    sentAt && !Number.isNaN(sentAt.getTime())
      ? t('sos.sentAt', { time: sentAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) })
      : null;
  const first = firstName(sos.name) || sos.name;
  // The "(bot)" suffix is not part of the name in a headline.
  const headName = splitNameTag(sos.name).base;

  // Haptics repeat every 1.5 s until any button is pressed (07 §3).
  const [quiet, setQuiet] = useState(false);
  useEffect(() => {
    if (quiet) return;
    let n = 0;
    const id = setInterval(() => {
      if (++n > REPEAT_HAPTIC_COUNT) {
        clearInterval(id);
        return;
      }
      haptic('error', { safety: true });
    }, REPEAT_HAPTIC_MS);
    return () => clearInterval(id);
  }, [quiet]);

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(
      [copy['sos.title'], t('sos.needsHelp', { name: headName }), distance].filter(Boolean).join('. '),
    );
  }, [headName, distance]);

  const dismiss = () => {
    setQuiet(true);
    useSosStore.getState().dismiss(sos.key);
  };

  // Android back = Dismiss (never a way to lose the SOS: the pinned banner stays).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      useSosStore.getState().dismiss(sos.key);
      return true;
    });
    return () => sub.remove();
  }, [sos.key]);

  const navigate = () => {
    if (!pos) return;
    setQuiet(true);
    const url = navigationUrl(Platform.OS, pos.lat, pos.lng, sos.name);
    Linking.openURL(url).catch(() => showToast(errorText('unknown')));
    // Back from the maps app lands on the pinned banner, not on the takeover again.
    useSosStore.getState().dismiss(sos.key);
  };

  const onMyWay = async () => {
    setQuiet(true);
    setSending(true);
    try {
      await sendMessage(rideId, 'on_my_way');
      useSosStore.getState().markOnMyWay(sos.key);
    } catch (e) {
      showToast(errorText(toRideError(e).code));
    } finally {
      setSending(false);
    }
  };

  const fg = colors.onStatus.sosStrong;
  return (
    <View
      accessibilityViewIsModal
      style={[
        StyleSheet.absoluteFill,
        styles.root,
        { backgroundColor: colors.status.sosStrong, paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.lg },
      ]}>
      <StatusBar style="light" />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
      <View style={styles.facts}>
        <View style={styles.titleRow}>
          <Icon name="sos" color={fg} size={32} />
          <Text accessibilityRole="header" maxFontSizeMultiplier={1.3} style={[styles.sos, { color: fg }]}>
            {copy['sos.title']}
          </Text>
        </View>
        <Text maxFontSizeMultiplier={1.3} numberOfLines={2} style={[styles.needs, { color: fg }]}>
          {t('sos.needsHelp', { name: headName })}
        </Text>
        <Text
          maxFontSizeMultiplier={1.3}
          style={[styles.distance, { color: fg }, fontNumeric]}>
          {distance ?? copy['sos.positionUnknown']}
        </Text>
        <Text maxFontSizeMultiplier={1.3} style={[styles.age, { color: fg }]}>
          {[age, sentText].filter(Boolean).join(' · ')}
        </Text>
      </View>

      {/* Flexible spacing spreads the content over the full height instead of leaving a red void below. */}
      <View style={styles.spacerTop} />
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={pos ? fill(copy['sos.navigate'], { name: first }) : copy['sos.noPosition']}
          accessibilityState={{ disabled: !pos }}
          disabled={!pos}
          onPress={navigate}
          style={[styles.big, styles.primaryBig, { backgroundColor: fg }, !pos && styles.disabled]}>
          {pos ? <Icon name="navigate" color={colors.status.sosStrong} size={24} /> : null}
          <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[styles.bigText, { color: colors.status.sosStrong }]}>
            {pos ? fill(copy['sos.navigate'], { name: first }) : copy['sos.noPosition']}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${copy['sos.onMyWay']} — ${first}`}
          accessibilityState={{ disabled: sent || sending }}
          disabled={sent || sending}
          onPress={() => void onMyWay()}
          style={[styles.big, styles.secondaryBig, styles.outline, { borderColor: fg }, (sent || sending) && styles.disabled]}>
          <Icon name={sent ? 'ready' : 'bike'} color={fg} size={24} />
          <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[styles.bigText, { color: fg }]}>
            {sent ? copy['sos.onMyWaySent'] : copy['sos.onMyWay']}
          </Text>
        </Pressable>
        {/* --- sos contacts --- */}
        <ReceiverContacts sos={sos} first={first} />
        {/* --- end sos contacts --- */}
      </View>
      {/* The spacer sits above Dismiss: on tall phones the buttons stay in thumb reach (14 §2). */}
      <View style={styles.spacer} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy['sos.dismiss']}
        onPress={dismiss}
        style={styles.dismiss}>
        <Text maxFontSizeMultiplier={1.3} style={[styles.dismissText, { color: fg }]}>
          {copy['sos.dismiss']}
        </Text>
      </Pressable>
      {more > 0 ? (
      <Pressable
          accessibilityRole="button"
          onPress={() => {
            setQuiet(true);
            useSosStore.getState().nextCursor();
          }}
          style={styles.more}>
          <Text maxFontSizeMultiplier={1.3} style={[styles.moreText, { color: fg }]}>
            {t('sos.more', { n: more })}
          </Text>
        </Pressable>
      ) : null}
      </ScrollView>
    </View>
  );
}

// --- sos contacts (11 §6) ---

/**
 * The sender's emergency contacts, fetched when the takeover opens and held in component state only:
 * never persisted, never logged, gone when the SOS clears or the takeover unmounts. RLS returns []
 * once the SOS is off, which the view treats as "none". A failed fetch keeps 112 on screen.
 */
function useSosContacts(userId: string) {
  const [state, setState] = useState<ReceiverContactsState>({ status: 'loading' });
  // Bumped by "Try again"; the effect below refetches whenever it changes.
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    fetchSosContacts(userId)
      .then((contacts) => live && setState({ status: 'ready', contacts }))
      .catch(() => live && setState({ status: 'error' }));
    return () => {
      live = false;
    };
  }, [userId, attempt]);
  const retry = () => {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  };
  return { state, retry };
}

function ReceiverContacts({ sos, first }: { sos: ActiveSos; first: string }) {
  const { colors } = useTheme();
  const { state, retry } = useSosContacts(sos.userId);
  const view = receiverView(state, sos.name);
  const fg = colors.onStatus.sosStrong;
  return (
    <View style={styles.contacts}>
      <Text accessibilityRole="header" maxFontSizeMultiplier={1.3} style={[styles.contactsTitle, { color: fg }]}>
        {fill(copy['sos.contactsTitle'], { name: first }).toUpperCase()}
      </Text>
      {view.skeleton ? (
        <View importantForAccessibility="no-hide-descendants" style={[styles.skeleton, { backgroundColor: fg }]} />
      ) : null}
      {view.list.map((item) => (
        <SosCallButton key={item.key} item={item} variant="onRed" />
      ))}
      {view.error ? (
        <View style={styles.contactsNote}>
          <Text maxFontSizeMultiplier={1.3} style={[styles.contactsNoteText, { color: fg }]}>
            {fill(copy['sos.contactsUnavailable'], { name: first })}
          </Text>
          <Pressable accessibilityRole="button" onPress={retry} style={styles.retry}>
            <Text maxFontSizeMultiplier={1.3} style={[styles.moreText, { color: fg }]}>
              {copy['common.tryAgain']}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {view.none ? (
        <Text maxFontSizeMultiplier={1.3} style={[styles.contactsNoteText, { color: fg }]}>
          {fill(copy['sos.contactsNone'], { name: first })}
        </Text>
      ) : null}
      <View style={styles.privacyRow}>
        <Icon name="lock" color={fg} size={16} />
        <Text maxFontSizeMultiplier={1.3} style={[styles.contactsNoteText, { color: fg, flex: 1 }]}>
          {fill(copy['sos.contactsPrivacy'], { name: first })}
        </Text>
      </View>
    </View>
  );
}
// --- end sos contacts ---

/** Pinned, non-closable SOS banner shown while a dismissed SOS is still on (07 §3). */
export function SosPinnedBanner({ active }: { active: ActiveSos[] }) {
  const positions = useRideStore((s) => s.positions);
  const trail = useRideStore((s) => s.leaderTrail);
  const myUserId = useRideStore((s) => s.myUserId);
  const first = active[0];
  if (!first) return null;
  const phrase = phraseFor(trail, myUserId ? positions[myUserId] : undefined, positions[first.userId]);
  const name = firstName(first.name) || first.name;
  const text =
    active.length > 1
      ? t('alert.sosPinnedMany', { n: active.length, name, more: active.length - 1 })
      : phrase
        ? t('alert.sosPinned', { name, dist: phrase.charAt(0).toLowerCase() + phrase.slice(1) })
        : t('alert.sosPinnedNoDist', { name });
  return (
    <Banner
      tone="sos"
      icon="sos"
      text={text}
      accessibilityLabel={text}
      onPress={() => useSosStore.getState().reopen()}
      action={{ label: copy['alert.view'], onPress: () => useSosStore.getState().reopen() }}
    />
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: space.lg, zIndex: 10, elevation: 10 },
  flex: { flex: 1 },
  // Scrolls on small screens or large fonts once the contacts section is added.
  scrollContent: { flexGrow: 1, gap: space.xl },
  contacts: { gap: space.md, marginTop: space.md },
  contactsTitle: { fontSize: font.xs, lineHeight: 16, fontFamily: family.semibold, letterSpacing: 0.6, opacity: 0.9 },
  contactsNote: { gap: space.xs },
  contactsNoteText: { fontSize: font.sm, lineHeight: 20, fontFamily: family.regular, opacity: 0.9 },
  privacyRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  skeleton: { height: 72, borderRadius: radius.lg, opacity: 0.2 },
  retry: { height: touchTarget, justifyContent: 'center' },
  facts: { gap: space.xs },
  // "SOS" is a 12 label next to the warning icon; the name and the one big fact carry the weight.
  sos: { fontSize: font.xs, lineHeight: 16, fontFamily: family.semibold, letterSpacing: 0.6, textTransform: 'uppercase', opacity: 0.9 },
  needs: { fontSize: type.title.size, lineHeight: type.title.line, letterSpacing: type.title.track, fontFamily: family.bold },
  distance: { fontSize: type.display.size, lineHeight: type.display.line, letterSpacing: type.display.track, fontFamily: family.bold },
  age: { fontSize: font.md, lineHeight: 24, fontFamily: family.regular, opacity: 0.9 },
  spacer: { flexGrow: 1 },
  spacerTop: { flexGrow: 0.6 },
  actions: { gap: space.md },
  primaryBig: { height: 64 },
  secondaryBig: { height: touchTarget },
  big: {
    height: size.rowLive,
    borderRadius: radius.lg,
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  outline: { borderWidth: 2 },
  disabled: { opacity: 0.6 },
  bigText: { fontSize: font.lg, lineHeight: 26, fontFamily: family.bold },
  dismiss: { height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  dismissText: { fontSize: font.md, lineHeight: 22, fontFamily: family.semibold },
  more: { height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  moreText: { fontSize: font.md, fontFamily: family.semibold, textDecorationLine: 'underline' },
});
