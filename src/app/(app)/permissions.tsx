import * as Location from 'expo-location';
import * as Notifications from '@/lib/notifications';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { BigButton } from '@/components/big-button';
import { ErrorText } from '@/components/error-text';
import { Icon, type IconName } from '@/components/icon';
import { Screen } from '@/components/screen';
import { copy, t } from '@/lib/copy';
import { startRideTracking } from '@/lib/location/tracking';
import { href } from '@/lib/nav';
import { readPermissions } from '@/lib/permissions';
import { nextPermissionStep, permissionSteps, type PermissionStep } from '@/lib/routing';
import { setupNotifications } from '@/lib/alerts';
import { track } from '@/lib/telemetry';
import { family, font, radius, space, touchTarget } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

const ICON: Record<PermissionStep, IconName> = {
  loc: 'permLocation',
  bg: 'permBackground',
  notif: 'permNotifications',
};

/** Renders `**bold**` segments (the exact OS button text) inside a line of copy. */
function Emphasis({ text, color }: { text: string; color: string }) {
  return (
    <Text style={{ color, fontSize: font.md, fontFamily: family.bold }}>
      {text.split('**').map((part, i) => (
        <Text key={i} style={i % 2 === 1 ? styles.bold : undefined}>
          {part}
        </Text>
      ))}
    </Text>
  );
}

export default function Permissions() {
  const { rideId, next } = useLocalSearchParams<{ rideId?: string; next?: string }>();
  const { colors } = useTheme();
  const [steps, setSteps] = useState<PermissionStep[] | null>(null);
  const [current, setCurrent] = useState<PermissionStep | null>(null);
  const [loading, setLoading] = useState(false);
  const [startFailed, setStartFailed] = useState(false);
  // The OS will not ask again for location: the only way forward is the system settings (13 §6).
  const [blocked, setBlocked] = useState(false);
  const foregroundGranted = useRef(false);

  const finish = () => {
    // The ride layout starts tracking if it is not running yet, so skipping anything is safe.
    router.replace(href(rideId ? `/ride/${rideId}/${next === 'live' ? 'live' : 'lobby'}` : '/home'));
  };

  useEffect(() => {
    let cancelled = false;
    readPermissions()
      .then((info) => {
        if (cancelled) return;
        const s = permissionSteps(info.snapshot);
        foregroundGranted.current = info.snapshot.foreground === 'granted';
        if (s.length === 0) return finish();
        setSteps(s);
        setCurrent(s[0]);
      })
      .catch(() => {
        if (!cancelled) finish();
      });
    return () => {
      cancelled = true;
    };
    // Runs once per mount: the steps are decided from the permissions at arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const advance = (from: PermissionStep) => {
    if (!steps) return finish();
    const following = nextPermissionStep(steps, from, foregroundGranted.current);
    setStartFailed(false);
    setBlocked(false);
    if (following) setCurrent(following);
    else finish();
  };

  // Coming back from the system settings with location allowed: carry on without another tap.
  useEffect(() => {
    if (!blocked) return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      readPermissions()
        .then((info) => {
          if (info.snapshot.foreground !== 'granted') return;
          foregroundGranted.current = true;
          advance('loc');
        })
        .catch(() => {});
    });
    return () => sub.remove();
    // advance only reads refs and setters; re-subscribing on its identity would be churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocked, steps]);

  const requestLocation = async () => {
    setLoading(true);
    try {
      const res = await Location.requestForegroundPermissionsAsync();
      foregroundGranted.current = res.granted;
      if (!res.granted && !res.canAskAgain) {
        setBlocked(true);
        setLoading(false);
        return;
      }
      // Granted is tracked by startRideTracking with the background answer.
      if (!res.granted) track('permission.location', { foreground: false, background: false });
    } catch {
      foregroundGranted.current = false;
    }
    setLoading(false);
    advance('loc');
  };

  const requestBackground = async (skip: boolean) => {
    if (!rideId) return advance('bg');
    setLoading(true);
    try {
      // Re-uses the granted foreground permission and asks for background.
      const result = await startRideTracking(rideId);
      if (!result.ok && result.reason === 'start-failed' && !skip) {
        setStartFailed(true);
        setLoading(false);
        return;
      }
      if (!result.ok) foregroundGranted.current = result.reason !== 'foreground-denied';
    } catch {
      // Skip still works; the ride layout retries tracking.
    }
    setLoading(false);
    advance('bg');
  };

  const requestNotifications = async (skip: boolean) => {
    setLoading(true);
    try {
      await setupNotifications({ prompt: !skip });
      const state = await Notifications.getPermissionsAsync();
      if (!skip) track('permission.notifications', { granted: state.granted });
    } catch {
      // Alerts are best effort.
    }
    setLoading(false);
    finish();
  };

  if (!steps || !current) {
    return <Screen>{null}</Screen>;
  }

  const index = steps.indexOf(current) + 1;
  const skip = () => {
    if (current === 'loc') {
      foregroundGranted.current = false;
      advance('loc');
    } else if (current === 'bg') void requestBackground(true);
    else void requestNotifications(true);
  };
  const cta =
    current === 'loc'
      ? blocked
        ? { label: copy['perm.openSettings'], run: () => void Linking.openSettings().catch(() => {}) }
        : { label: copy['perm.loc.cta'], run: () => void requestLocation() }
      : current === 'bg'
        ? { label: startFailed ? copy['common.tryAgain'] : copy['perm.bg.cta'], run: () => void requestBackground(false) }
        : { label: copy['perm.notif.cta'], run: () => void requestNotifications(false) };
  const title =
    current === 'loc' ? copy['perm.loc.title'] : current === 'bg' ? copy['perm.bg.title'] : copy['perm.notif.title'];
  const bullets =
    current === 'loc'
      ? [copy['perm.loc.why1'], copy['perm.loc.why2'], copy['perm.loc.why3']]
      : current === 'bg'
        ? [copy['perm.bg.why']]
        : [copy['perm.notif.why']];

  return (
    <Screen
      scroll
      footer={<BigButton label={cta.label} icon={ICON[current]} loading={loading} onPress={cta.run} />}>
      <View style={styles.topRow}>
        <View style={styles.stepInfo}>
          {/* Dots plus the words: progress never relies on the dots alone. */}
          <View style={styles.dots} accessible={false} importantForAccessibility="no-hide-descendants">
            {steps.map((s) => (
              <View
                key={s}
                style={[styles.stepDot, { backgroundColor: s === current ? colors.brand.primary : colors.border }]}
              />
            ))}
          </View>
          <AppText variant="caption" muted>
            {t('perm.step', { n: index, total: steps.length })}
          </AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy['perm.a11ySkip']}
          onPress={skip}
          disabled={loading}
          style={styles.skip}>
          <AppText style={styles.skipText}>{copy['perm.skip']}</AppText>
        </Pressable>
      </View>

      <View style={[styles.tile, { backgroundColor: colors.brand.primary }]}>
        <Icon name={ICON[current]} color={colors.brand.onPrimary} size={28} />
      </View>
      <AppText variant="title" accessibilityRole="header">
        {title}
      </AppText>
      <View style={styles.bullets}>
        {bullets.map((b) => (
          <AppText key={b}>{bullets.length > 1 ? `• ${b}` : b}</AppText>
        ))}
      </View>

      {current === 'bg' ? (
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Emphasis
            text={Platform.OS === 'ios' ? copy['perm.bg.iosHow'] : copy['perm.bg.androidHow']}
            color={colors.text}
          />
        </View>
      ) : null}

      {Platform.OS === 'web' && current === 'loc' ? (
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <AppText>
            Your browser will ask to allow location for this site: choose Allow (on iPhone, Allow While
            Using). Location is shared only while this page is open and on screen.
          </AppText>
        </View>
      ) : null}

      {startFailed ? <ErrorText>{copy['perm.startFailed']}</ErrorText> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepInfo: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  dots: { flexDirection: 'row', gap: space.sm },
  stepDot: { width: space.sm, height: space.sm, borderRadius: space.xs },
  skip: { minHeight: touchTarget, minWidth: touchTarget, alignItems: 'flex-end', justifyContent: 'center' },
  skipText: { fontFamily: family.bold },
  tile: { width: 72, height: 72, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  bullets: { gap: space.md },
  card: { borderRadius: radius.md, padding: space.lg },
  bold: { fontFamily: family.bold },
});
