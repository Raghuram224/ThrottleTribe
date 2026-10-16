import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, BackHandler, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { BigButton } from '@/components/big-button';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { ErrorText } from '@/components/error-text';
import { Icon } from '@/components/icon';
import { MemberRow } from '@/components/member-row';
import { RideCodeDisplay } from '@/components/ride-code-display';
import { Skeleton } from '@/components/skeleton';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useNow } from '@/hooks/use-now';
import { useRideActions } from '@/hooks/use-ride-actions';
import { copy, errorText, fill, t } from '@/lib/copy';
import { hrefAfterEnter } from '@/lib/enter-ride';
import { haptic } from '@/lib/haptics';
import { setupIncomplete, setupItems, type SetupItem } from '@/lib/home';
import { inviteCounts } from '@/lib/invite'; // invite
import { readiness, sortLobbyMembers } from '@/lib/lobby';
import { href } from '@/lib/nav';
import { firstName } from '@/lib/names';
import { navRideDest } from '@/lib/nav-rides';
import { startRide, toRideError } from '@/lib/ride-api';
import { rideStop } from '@/lib/stop-ui';
import { track } from '@/lib/telemetry';
import { NO_INVITEES, useInviteStore } from '@/store/invite-store'; // invite
import { useRideStore } from '@/store/ride-store';
import { useSosStore } from '@/store/sos-store';
import { showToast } from '@/store/toast-store';
import { elevate, family, radius, size, space, touchTarget } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

export default function Lobby() {
  const { colors, scheme } = useTheme();
  const { rideId, isLeader, shareCode, openInvite, requestLeave, permissions, fixPermission } = useRideActions();
  // --- invite ---
  const invitees = useInviteStore((s) => s.byRide[rideId] ?? NO_INVITEES);
  useEffect(() => {
    useInviteStore.getState().load(rideId);
  }, [rideId]);
  // --- end invite ---
  const ride = useRideStore((s) => s.ride);
  const members = useRideStore((s) => s.members);
  const positions = useRideStore((s) => s.positions);
  const connected = useRideStore((s) => s.connectedUserIds);
  const loaded = useRideStore((s) => s.loaded);
  const loadError = useRideStore((s) => s.loadError);
  const myUserId = useRideStore((s) => s.myUserId);
  const myContactCount = useSosStore((s) => s.myContacts.length);
  const myContactsLoaded = useSosStore((s) => s.myContactsLoaded);
  const now = useNow(5000);
  const [starting, setStarting] = useState(false);
  const startTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lobbyStop = useMemo(() => rideStop(ride), [ride]);
  const rows = sortLobbyMembers(Object.values(members), myUserId);
  const leader = rows.find((m) => m.role === 'leader');
  const inviteSummary = inviteCounts(invitees, rows); // invite
  const notSharing = !!permissions && permissions.snapshot.foreground !== 'granted';

  const stateOf = (userId: string) => {
    if (userId === myUserId && notSharing) return 'notSharing' as const;
    return readiness(positions[userId]?.updatedAt ?? null, connected.has(userId), now);
  };
  // No position is shared in the lobby (tracking starts when the ride is active), so "ready" here is "on the channel".
  const readyCount = rows.filter((m) => stateOf(m.userId) !== 'away' && stateOf(m.userId) !== 'notSharing').length;

  // P2 (13 §7): my own setup, shown only while something is missing.
  const setup = permissions
    ? setupItems({
        locationGranted: permissions.snapshot.foreground === 'granted',
        alertsGranted: permissions.snapshot.notifications === 'granted',
        contactCount: myContactCount,
        contactsLoaded: myContactsLoaded,
      })
    : [];

  useEffect(
    () => () => {
      if (startTimer.current) clearTimeout(startTimer.current);
    },
    [],
  );

  // Back is ignored while Start is in flight: leaving now would orphan the start (22 §13), like Invite's Continue.
  useEffect(() => {
    if (!starting) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [starting]);

  // State lags a render: a double tap on Start must not send start_ride twice (the second would fail and toast).
  const startingRef = useRef(false);
  const start = async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    try {
      // The explainer check comes first: the ride turning active starts background tracking, and the OS prompt must
      // follow the explainer (04), exactly like the Start ride path.
      const target = await hrefAfterEnter({ id: rideId, status: 'active' });
      const started = await startRide(rideId);
      // An Invite riders ride navigates from here (22 D6): the leader's marker says this phone navigates its stop.
      if (lobbyStop && navRideDest(rideId)) track('nav.started', { from: 'map_home' });
      if (target.startsWith('/permissions')) {
        router.replace(href(target));
        return;
      }
      // The ride layout navigates on the `ride` broadcast; if it has not arrived in 3 s, apply the RPC result.
      startTimer.current = setTimeout(() => {
        if (useRideStore.getState().ride?.status === 'lobby') useRideStore.getState().applyRide(started);
      }, 3000);
    } catch (e) {
      startingRef.current = false;
      showToast(errorText(toRideError(e).code));
      void useRideStore.getState().load(rideId);
      setStarting(false);
    }
    // On success Start stays busy until the ride layout moves this screen on to live (or the 3 s fallback does).
  };

  const fixSetup = (key: SetupItem['key']) => {
    if (key === 'contact') router.push(href('/emergency-contacts'));
    else void fixPermission(key === 'location' ? 'location' : 'notifications');
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.content}>
        {loadError ? (
          <View style={styles.block}>
            <ErrorText>{copy['errors.loadRide']}</ErrorText>
            <BigButton
              label={copy['common.tryAgain']}
              variant="secondary"
              onPress={() => void useRideStore.getState().load(rideId)}
            />
          </View>
        ) : null}

        {/* One visual unit: how people get in (13 §7). */}
        <Card gap={space.md}>
          {ride ? (
            <>
              <RideCodeDisplay code={ride.code} onLongPress={() => shareCode('lobby')} />
              <AppText variant="caption" muted>
                {copy['invite.codeNote']}
              </AppText>
              <BigButton label={copy['lobby.invite']} variant="secondary" icon="invite" onPress={openInvite} />
            </>
          ) : (
            <View style={styles.block}>
              <Skeleton height={14} width={90} />
              <Skeleton height={44} width={220} />
            </View>
          )}
        </Card>
        {ride ? (
          <AppText variant="caption" muted>
            {t('lobby.threshold', { n: Math.round(ride.stop_threshold_s / 60) })}
          </AppText>
        ) : null}
        {lobbyStop ? (
          // 22 D6: everyone in the lobby, joiners too, sees where the ride is going (set when the leader tapped Invite riders).
          <View style={styles.destLine} accessible accessibilityLabel={t('lobby.destLine', { place: lobbyStop.name })}>
            <Icon name={lobbyStop.kind === 'break' ? 'coffee' : 'endRide'} color={colors.textMuted} size={16} />
            <AppText variant="caption" muted numberOfLines={1} style={styles.destText}>
              {t('lobby.destLine', { place: lobbyStop.name })}
            </AppText>
          </View>
        ) : null}
        {setupIncomplete(setup) ? <SetupRow items={setup} onFix={fixSetup} /> : null}

        <View style={styles.sectionRow}>
          <AppText variant="heading" accessibilityRole="header">
            {copy['lobby.ridersTitle']}
          </AppText>
          <AppText variant="caption" muted numeric>
            {t('lobby.readyCount', { n: rows.length, r: readyCount })}
          </AppText>
        </View>
        {/* --- invite --- invited list lives on this phone only (10 §5) */}
        {invitees.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={openInvite}
            style={styles.invitedLine}>
            <AppText variant="caption" muted style={styles.invitedText}>
              {t('lobby.invitedLine', { n: inviteSummary.invited, j: inviteSummary.joined })}
            </AppText>
            <Icon name="chevronRight" color={colors.textMuted} size={20} />
          </Pressable>
        ) : null}
        {/* --- end invite --- */}
        {loaded ? (
          <Card padding={0} gap={0}>
            {rows.map((m) => (
              <MemberRow
                key={m.userId}
                name={m.name}
                colorIndex={m.colorIndex}
                isMe={m.userId === myUserId}
                isLeader={m.role === 'leader'}
                state={stateOf(m.userId)}
              />
            ))}
          </Card>
        ) : (
          <View style={styles.block}>
            <Skeleton height={size.rowMember} />
            <Skeleton height={size.rowMember} />
          </View>
        )}
        {loaded && rows.length <= 1 ? (
          <EmptyState
            icon="riders"
            title={copy['lobby.emptyTitle']}
            body={copy['lobby.emptyHint']}
            action={{ label: copy['lobby.invite'], icon: 'invite', onPress: openInvite }}
          />
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.surfaceRaised }, elevate('e2', scheme)]}>
        {isLeader ? (
          <>
            <AppText variant="caption" style={[styles.center, { color: colors.textSubtle }]}>
              {copy['lobby.startHint']}
            </AppText>
            <BigButton label={copy['lobby.start']} loading={starting} onPress={() => void start()} />
          </>
        ) : (
          <>
            <Waiting leader={leader ? firstName(leader.name) : ''} />
            <BigButton label={copy['lobby.leave']} variant="secondary" onPress={requestLeave} />
          </>
        )}
      </View>
    </View>
  );
}

const SETUP_LABEL = {
  location: 'lobby.setupLocation',
  alerts: 'lobby.setupAlerts',
  contact: 'lobby.setupContact',
} as const;

/** "Your setup: ✓ Location ✓ Alerts ○ SOS contact": each item taps through to fix it (13 §7, P2). */
function SetupRow({ items, onFix }: { items: SetupItem[]; onFix: (key: SetupItem['key']) => void }) {
  const { colors } = useTheme();
  return (
    <View>
      <AppText variant="label" muted accessibilityRole="header" style={styles.setupTitle}>
        {copy['lobby.setupTitle']}
      </AppText>
      <View style={styles.setupRow}>
        {items.map((item) => {
          const label = copy[SETUP_LABEL[item.key]];
          return (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityLabel={fill(copy[item.done ? 'lobby.a11ySetupDone' : 'lobby.a11ySetupMissing'], {
                item: label,
              })}
              disabled={item.done}
              onPress={() => {
                haptic('select');
                onFix(item.key);
              }}
              style={[
                styles.setupItem,
                { backgroundColor: item.done ? colors.movingTint : colors.surface },
              ]}>
              <Icon name={item.done ? 'ready' : 'away'} color={item.done ? colors.onMovingTint : colors.text} size={16} />
              <AppText
                variant="caption"
                style={[styles.setupText, { color: item.done ? colors.onMovingTint : colors.text }]}
                numberOfLines={1}
                maxFontSizeMultiplier={1.3}>
                {label}
              </AppText>
              {item.done ? null : <Icon name="chevronRight" color={colors.textMuted} size={16} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Waiting({ leader }: { leader: string }) {
  const { colors } = useTheme();
  const reduce = useReduceMotion();
  const [pulse] = useState(() => new Animated.Value(0.4));
  useEffect(() => {
    // Decorative: static when Reduce Motion is on (13 §0.2).
    if (reduce) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduce]);
  const text = t('lobby.waiting', { leader: leader || 'the leader' });
  return (
    <View accessible accessibilityLiveRegion="polite" accessibilityLabel={text} style={styles.waiting}>
      <Animated.View style={{ opacity: pulse }}>
        <Icon name="connecting" color={colors.textMuted} size={20} />
      </Animated.View>
      <AppText variant="heading" numberOfLines={1} maxFontSizeMultiplier={1.3}>
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: space.lg, gap: space.lg },
  block: { gap: space.md },
  destLine: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  destText: { flex: 1 },
  sectionRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  invitedLine: { minHeight: touchTarget, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, // invite
  invitedText: { flex: 1 }, // invite
  footer: { padding: space.md, gap: space.sm },
  center: { textAlign: 'center' },
  waiting: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  setupTitle: { marginBottom: space.sm },
  setupRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  setupItem: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
  },
  setupText: { fontFamily: family.semibold },
});
