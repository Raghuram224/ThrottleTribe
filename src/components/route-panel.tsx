import { useEffect, useRef } from 'react';
import { AccessibilityInfo, ActivityIndicator, findNodeHandle, Pressable, StyleSheet, Switch, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { BigButton } from '@/components/big-button';
import { Icon } from '@/components/icon';
import { Skeleton } from '@/components/skeleton';
import { useNow } from '@/hooks/use-now';
import type { LocationPerm } from '@/hooks/use-planning-position';
import type { PreviewRouteState } from '@/hooks/use-preview-route';
import { copy, spokenDistance, spokenDuration, t } from '@/lib/copy';
import { ROUTING_SUPPORTS_EXCLUDE } from '@/lib/flags';
import { formatClockTime, formatDistance, formatDuration } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { track } from '@/lib/telemetry';
import { usePrefsStore } from '@/store/prefs-store';
import type { PlanPlace } from '@/store/plan-store';
import { elevate, family, font, fontNumeric, radius, space, touchTarget, type } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

interface RoutePanelProps {
  place: PlanPlace;
  state: PreviewRouteState;
  /** Straight-line metres from me; null = no fix. */
  straightM: number | null;
  /** Expressways are being avoided (flagged routers only): decides which "no route" note to show. */
  avoidMotorways: boolean;
  offline: boolean;
  permission: LocationPerm;
  /** Ride solo is starting (the ride is being made): Ride solo loads, Ride with a group waits. */
  going: boolean;
  onRetry: () => void;
  onSolo: () => void;
  onGroup: () => void;
  /** The "Allow location" ghost button (no permission): the OS prompt, or Settings when blocked. */
  onAllowLocation: () => void;
  /** Screen-reader escape gesture (iOS two-finger Z): the same as Back, one step out (22 §10). */
  onEscape: () => void;
  onLayout: (height: number) => void;
}

/**
 * Route mode panel (21 §2.3, 22 §3.4): the preview's summary, arrive time, car note and expressway row, then
 * "How are you riding?" with Ride with a group (secondary) above Ride solo (the filled primary, lowest, at the
 * thumb). Nothing here touches Supabase: a ride is made only when one of the two is chosen.
 */
export function RoutePanel({
  place,
  state,
  straightM,
  avoidMotorways,
  offline,
  permission,
  going,
  onRetry,
  onSolo,
  onGroup,
  onAllowLocation,
  onEscape,
  onLayout,
}: RoutePanelProps) {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const now = useNow(60_000);
  const allowExpressways = usePrefsStore((s) => s.allowExpressways);
  const setAllowExpressways = usePrefsStore((s) => s.setAllowExpressways);
  const summaryRef = useRef<View>(null);

  const updating = state.status === 'updating';
  const route = state.status === 'ok' || updating ? state.route : null;
  const settledRoute = state.status === 'ok' ? state.route : null;
  const durationText = route ? formatDuration(route.durationS * 1000) : null;
  const distanceText = route ? formatDistance(route.distanceM) : straightM != null ? formatDistance(straightM) : null;
  const noLocation = permission.status !== 'granted' && permission.status !== 'unknown';
  const blocked = permission.status === 'denied' && !permission.canAskAgain;

  // Focus moves to the summary when the route opens (22 §10), then the note, the choice label, the buttons.
  useEffect(() => {
    const timer = setTimeout(() => {
      const node = findNodeHandle(summaryRef.current);
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    }, 300);
    return () => clearTimeout(timer);
  }, [place.id]);

  const summaryA11y = route
    ? t('preview.a11ySummary', {
        duration: spokenDuration(route.durationS * 1000),
        distance: spokenDistance(formatDistance(route.distanceM)),
        name: place.name,
      })
    : place.name;

  // Which note under the trip: what the route did about expressways, or why there is no road route.
  const noteOk = !ROUTING_SUPPORTS_EXCLUDE
    ? copy['preview.carNoteMayUse']
    : allowExpressways || settledRoute?.avoidedMotorways === undefined
      ? copy['preview.carNoteAllowed']
      : settledRoute.avoidedMotorways
        ? copy['preview.carNote']
        : copy['preview.carNoteNoAvoid'];
  const note = noLocation
    ? copy['preview.noLocation']
    : state.status === 'ok'
      ? noteOk
      : updating
        ? copy['preview.updating']
        : state.status === 'no_route'
          ? // Only point at the switch when it was on "avoid".
            avoidMotorways
            ? copy['preview.noRouteAvoid']
            : copy['preview.noRoute']
          : state.status === 'failed'
            ? copy['preview.routeFailed']
            : state.status === 'locating'
              ? copy['preview.noFix']
              : copy['preview.loading'];

  return (
    <View
      onAccessibilityEscape={onEscape}
      onLayout={(e: LayoutChangeEvent) => onLayout(e.nativeEvent.layout.height)}
      style={[styles.panel, { backgroundColor: colors.surfaceRaised, paddingBottom: space.lg + insets.bottom }, elevate('e3', scheme)]}>
      <View ref={summaryRef} accessible accessibilityLabel={summaryA11y} style={styles.group}>
        {/* Line 1: the glance. */}
        {state.status === 'ok' || state.status === 'no_route' || state.status === 'failed' ? (
          <View style={styles.line1}>
            {durationText ? (
              <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.duration, styles.keep, { color: colors.text }]}>
                {durationText}
              </Text>
            ) : null}
            {distanceText ? (
              <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[durationText ? styles.distance : styles.duration, styles.shrink, { color: colors.text }]}>
                {durationText ? ` ${t('preview.distanceSpan', { km: distanceText })}` : t('stop.cardDistanceApprox', { km: distanceText })}
              </Text>
            ) : null}
          </View>
        ) : state.status === 'loading' || updating ? (
          <View style={styles.line1}>
            <Skeleton height={28} width={160} />
          </View>
        ) : (
          <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.placeHeading, { color: colors.text }]}>
            {place.name}
          </Text>
        )}
        {state.status === 'locating' ? null : (
          <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.name, { color: colors.text }]}>
            {place.name}
          </Text>
        )}
        {place.address ? (
          <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.address, { color: colors.textMuted }]}>
            {place.address}
          </Text>
        ) : null}
        {route ? (
          <Text maxFontSizeMultiplier={1.3} style={[styles.address, fontNumeric, { color: colors.textMuted }]}>
            {t('preview.arrive', { time: formatClockTime(now + route.durationS * 1000) })}
          </Text>
        ) : null}
      </View>

      <View style={styles.noteRow}>
        <Icon name="alertCircle" color={colors.textMuted} size={16} />
        <Text
          numberOfLines={2}
          accessibilityLiveRegion={updating ? 'polite' : 'none'}
          maxFontSizeMultiplier={1.3}
          style={[styles.note, { color: colors.textMuted }]}>
          {note}
        </Text>
      </View>
      {noLocation ? (
        <BigButton
          label={blocked ? copy['perm.openSettings'] : copy['whereTo.locAllow']}
          variant="ghost"
          onPress={onAllowLocation}
        />
      ) : null}
      {state.status === 'failed' ? <BigButton label={copy['common.tryAgain']} variant="ghost" onPress={onRetry} /> : null}

      {/* Expressways: off by default (two-wheeler bans), the choice is remembered on this phone. Only shown
          when the router can honour it (flags); the public demo cannot, so it would do nothing. */}
      {ROUTING_SUPPORTS_EXCLUDE ? (
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel={allowExpressways ? copy['preview.a11yExpresswaysOn'] : copy['preview.a11yExpresswaysOff']}
          accessibilityState={{ checked: allowExpressways, busy: updating, disabled: going }}
          disabled={going}
          onPress={() => {
            haptic('select');
            track('nav.expressways_toggled', { allowed: !allowExpressways });
            setAllowExpressways(!allowExpressways);
          }}
          style={[styles.switchRow, going && styles.dim]}>
          <Text maxFontSizeMultiplier={1.3} style={[styles.switchLabel, { color: colors.text }]}>
            {copy['preview.allowExpressways']}
          </Text>
          {updating ? <ActivityIndicator size="small" color={colors.textMuted} /> : null}
          {/* The state is a word, not only the switch position or colour. */}
          <Text maxFontSizeMultiplier={1.3} style={[styles.stateWord, { color: colors.textMuted }]}>
            {allowExpressways ? copy['preview.expresswaysOn'] : copy['preview.expresswaysOff']}
          </Text>
          {/* The row takes the tap; the native switch only shows the state. */}
          <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <Switch value={allowExpressways} trackColor={{ false: colors.borderStrong, true: colors.brand.primary }} thumbColor={colors.surfaceRaised} />
          </View>
        </Pressable>
      ) : null}

      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <AppText variant="caption" accessibilityRole="header" maxFontSizeMultiplier={1.3} style={[styles.choice, { color: colors.textMuted }]}>
        {copy['preview.choiceLabel']}
      </AppText>
      <View style={styles.actions}>
        {/* Fixed positions, never re-ordered by a remembered choice (gloves, muscle memory). */}
        <BigButton
          label={copy['preview.rideGroup']}
          accessibilityLabel={t('preview.rideGroupA11y', { name: place.name })}
          variant="secondary"
          icon="riders"
          disabled={offline || going}
          onPress={onGroup}
        />
        <BigButton
          label={going ? copy['preview.starting'] : copy['preview.rideSolo']}
          accessibilityLabel={t('preview.rideSoloA11y', { name: place.name })}
          icon="navigate"
          prominent
          loading={going}
          disabled={offline}
          onPress={onSolo}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: space.lg,
    gap: space.xs,
  },
  group: { gap: space.xs },
  line1: { flexDirection: 'row', alignItems: 'center', minHeight: type.glance.line },
  // 28 bold tabular for the duration; the distance (20 semibold) shrinks first.
  duration: { ...fontNumeric, fontSize: type.glance.size, lineHeight: type.glance.line, fontFamily: family.bold },
  distance: { ...fontNumeric, fontSize: font.lg, lineHeight: type.heading.line, fontFamily: family.semibold },
  keep: { flexShrink: 0 },
  shrink: { flexShrink: 1 },
  placeHeading: { fontSize: font.lg, lineHeight: type.heading.line, fontFamily: family.semibold },
  name: { fontSize: font.md, lineHeight: 22, fontFamily: family.semibold },
  address: { fontSize: font.sm, lineHeight: 20, fontFamily: family.regular },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, paddingTop: space.xs },
  note: { flex: 1, fontSize: font.sm, lineHeight: 20, fontFamily: family.regular },
  switchRow: { minHeight: touchTarget, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  dim: { opacity: 0.5 },
  stateWord: { fontSize: font.sm, lineHeight: 20, fontFamily: family.semibold },
  switchLabel: { flex: 1, fontSize: font.md, lineHeight: 22, fontFamily: family.semibold },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: space.md },
  choice: { fontFamily: family.semibold },
  // 12 dp gap between the two actions (22 §3.4.1).
  actions: { gap: space.md },
});
