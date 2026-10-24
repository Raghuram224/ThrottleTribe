import { useEffect, useRef } from 'react';
import { AccessibilityInfo, ActivityIndicator, findNodeHandle, Pressable, StyleSheet, Switch, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BigButton } from '@/components/big-button';
import { RouteChoiceRow } from '@/components/route-choices';
import { CreditRow } from '@/components/credit-row';
import { Icon } from '@/components/icon';
import { Skeleton } from '@/components/skeleton';
import { useNow } from '@/hooks/use-now';
import type { LocationPerm } from '@/hooks/use-planning-position';
import type { PreviewRouteState } from '@/hooks/use-preview-route';
import { copy, spokenDistance, spokenDuration, t } from '@/lib/copy';
import { CREDIT_URLS, routeCreditLink } from '@/lib/credits';
import { ROUTING_SUPPORTS_EXCLUDE } from '@/lib/flags';
import { formatClockTime, formatDistance, formatDuration } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { distinctAddress } from '@/lib/place-search';
import { routeActions, type GoingKind } from '@/lib/plan-flow';
import { clampRouteIndex, routeChoices } from '@/lib/route-choices';
import { track } from '@/lib/telemetry';
import { usePrefsStore } from '@/store/prefs-store';
import type { PlanPlace } from '@/store/plan-store';
import { elevate, family, font, fontNumeric, radius, space, touchTarget, type } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

interface RoutePanelProps {
  place: PlanPlace;
  state: PreviewRouteState;
  /** Which of `state`'s routes is chosen (the one on the map in the route colour); the summary follows it. */
  selected: number;
  onSelectRoute: (index: number) => void;
  /** Straight-line metres from me; null = no fix. */
  straightM: number | null;
  /** Expressways are being avoided (flagged routers only): decides which "no route" note to show. */
  avoidMotorways: boolean;
  offline: boolean;
  permission: LocationPerm;
  /** Start or Invite riders was tapped (the ride is being made): that button loads and the other is blocked. */
  going: GoingKind;
  onRetry: () => void;
  onStart: () => void;
  /** Invite riders (22 D6): the ride is made in the lobby with this destination, then the invite screen opens. */
  onInvite: () => void;
  /** The "Allow location" ghost button (no permission): the OS prompt, or Settings when blocked. */
  onAllowLocation: () => void;
  /** Screen-reader escape gesture (iOS two-finger Z): the same as Back, one step out (22 §10). */
  onEscape: () => void;
  onLayout: (height: number) => void;
}

/**
 * Route mode panel (21 §2.3, 22 §3.4): the preview's summary, arrive time, car note and expressway row, then one
 * primary, Start ride, with Invite riders (secondary) under it, both at the thumb. One kind of ride: it becomes a
 * group when its code is shared (22 D5, D6). Nothing here touches Supabase: the ride is made only when one is tapped.
 */
export function RoutePanel({
  place,
  state,
  selected,
  onSelectRoute,
  straightM,
  avoidMotorways,
  offline,
  permission,
  going,
  onRetry,
  onStart,
  onInvite,
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
  const actions = routeActions({ offline, going });
  const busy = going !== null;

  const updating = state.status === 'updating';
  const routes = state.status === 'ok' || updating ? state.routes : [];
  const chosen = clampRouteIndex(selected, routes.length);
  // Everything below (duration, distance, arrive time, the credit, the expressway note, what Start seeds) is the chosen route's.
  const route = routes[chosen] ?? null;
  const settledRoute = state.status === 'ok' ? (routes[chosen] ?? null) : null;
  // The credit names whoever computed this route (LocationIQ, or the OSRM demo in a dev / transition build).
  const routeCredit = routeCreditLink(route?.provider);
  const durationText = route ? formatDuration(route.durationS * 1000) : null;
  const distanceText = route ? formatDistance(route.distanceM) : straightM != null ? formatDistance(straightM) : null;
  const noLocation = permission.status !== 'granted' && permission.status !== 'unknown';
  const blocked = permission.status === 'denied' && !permission.canAskAgain;

  // Focus moves to the summary when the route opens (22 §10), then the note and Start.
  useEffect(() => {
    const timer = setTimeout(() => {
      const node = findNodeHandle(summaryRef.current);
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    }, 300);
    return () => clearTimeout(timer);
  }, [place.id]);

  const summaryA11y = route
    ? t('preview.a11ySummaryArrive', {
        duration: spokenDuration(route.durationS * 1000),
        distance: spokenDistance(formatDistance(route.distanceM)),
        name: place.name,
        time: formatClockTime(now + route.durationS * 1000),
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
            : state.status === 'rate_limited'
              ? copy['preview.routeBusy']
              : state.status === 'locating'
              ? copy['preview.noFix']
              : copy['preview.loading'];

  return (
    <View
      onAccessibilityEscape={onEscape}
      onLayout={(e: LayoutChangeEvent) => onLayout(e.nativeEvent.layout.height)}
      style={[styles.panel, { backgroundColor: colors.surfaceRaised, paddingBottom: space.lg + insets.bottom }, elevate('e3', scheme)]}>
      <View ref={summaryRef} accessible accessibilityLabel={summaryA11y} style={styles.group}>
        {/* Trip group (26 R1): the duration alone is the glance; distance and arrive time share line 2. */}
        <View style={styles.trip}>
          {state.status === 'ok' || state.status === 'no_route' || state.status === 'failed' || state.status === 'rate_limited' ? (
            <>
              {durationText || distanceText ? (
                <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.duration, { color: colors.text }]}>
                  {durationText ?? t('stop.cardDistanceApprox', { km: distanceText ?? '' })}
                </Text>
              ) : null}
              {route && distanceText ? (
                <Text numberOfLines={2} maxFontSizeMultiplier={1.3} style={[styles.tripLine, fontNumeric, { color: colors.text }]}>
                  {t('preview.tripLine', { km: distanceText, time: formatClockTime(now + route.durationS * 1000) })}
                </Text>
              ) : null}
            </>
          ) : state.status === 'loading' || updating ? (
            <>
              <Skeleton height={28} width={160} />
              <Skeleton height={16} width={200} />
            </>
          ) : (
            <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.placeHeading, { color: colors.text }]}>
              {place.name}
            </Text>
          )}
        </View>
        {/* Place group: the name, and an address line only when it tells something the name does not (26 H1). */}
        {state.status === 'locating' ? null : (
          <View style={styles.placeGroup}>
            <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.name, { color: colors.text }]}>
              {place.name}
            </Text>
            {distinctAddress(place.name, place.address) ? (
              <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.address, { color: colors.textMuted }]}>
                {distinctAddress(place.name, place.address)}
              </Text>
            ) : null}
          </View>
        )}
      </View>

      {routes.length > 1 ? (
        <RouteChoiceRow choices={routeChoices(routes, now)} selected={chosen} onSelect={onSelectRoute} disabled={busy || updating} />
      ) : null}

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
      {state.status === 'failed' || state.status === 'rate_limited' ? <BigButton label={copy['common.tryAgain']} variant="ghost" onPress={onRetry} /> : null}

      {/* Expressways: off by default (two-wheeler bans), the choice is remembered on this phone. Only shown
          when the router can honour it (flags); the public demo cannot, so it would do nothing. */}
      {ROUTING_SUPPORTS_EXCLUDE ? (
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel={allowExpressways ? copy['preview.a11yExpresswaysOn'] : copy['preview.a11yExpresswaysOff']}
          accessibilityState={{ checked: allowExpressways, busy: updating, disabled: busy }}
          disabled={busy}
          onPress={() => {
            haptic('select');
            track('nav.expressways_toggled', { allowed: !allowExpressways });
            setAllowExpressways(!allowExpressways);
          }}
          style={[styles.switchRow, busy && styles.dim]}>
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

      {/* LocationIQ asks for a visible link where its routes are shown; the dashed fallback shows none of their data (24 §4.3). */}
      {route && routeCredit ? (
        <View style={[styles.creditRow, { borderTopColor: colors.border }]}>
          <CreditRow
            links={[
              { label: copy[routeCredit.labelKey], url: routeCredit.url, site: routeCredit.site },
              { label: copy['credit.osm'], url: CREDIT_URLS.osm, site: 'openstreetmap.org' },
            ]}
          />
        </View>
      ) : null}

      <View style={styles.actions}>
        <BigButton
          label={going === 'start' ? copy['preview.starting'] : copy['preview.start']}
          accessibilityLabel={t('preview.startA11y', { name: place.name })}
          icon="navigate"
          prominent
          loading={actions.start.loading}
          disabled={actions.start.disabled}
          onPress={onStart}
        />
        {/* Secondary, under Start (22 D6): the ride waits in the lobby with this destination until the leader starts it. */}
        <BigButton
          label={going === 'invite' ? copy['preview.inviting'] : copy['preview.invite']}
          accessibilityLabel={t('preview.inviteA11y', { name: place.name })}
          icon="invite"
          variant="secondary"
          loading={actions.invite.loading}
          disabled={actions.invite.disabled}
          onPress={onInvite}
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
  trip: { gap: space.xs },
  placeGroup: { gap: 0, marginTop: space.sm },
  // 28 bold tabular, alone on line 1; line 2 is 16 regular and wraps.
  duration: { ...fontNumeric, fontSize: type.glance.size, lineHeight: type.glance.line, fontFamily: family.bold },
  tripLine: { fontSize: font.md, lineHeight: 24, fontFamily: family.regular },
  placeHeading: { fontSize: font.lg, lineHeight: type.heading.line, fontFamily: family.semibold },
  name: { fontSize: font.md, lineHeight: 22, fontFamily: family.semibold },
  address: { fontSize: font.sm, lineHeight: 20, fontFamily: family.regular },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, paddingTop: space.xs },
  note: { flex: 1, fontSize: font.sm, lineHeight: 20, fontFamily: family.regular },
  switchRow: { minHeight: touchTarget, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  dim: { opacity: 0.5 },
  stateWord: { fontSize: font.sm, lineHeight: 20, fontFamily: family.semibold },
  switchLabel: { flex: 1, fontSize: font.md, lineHeight: 22, fontFamily: family.semibold },
  creditRow: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: space.sm },
  actions: { paddingTop: space.md, gap: space.sm },
});
