import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionCard } from '@/components/action-card';
import { AppText } from '@/components/app-text';
import { Banner } from '@/components/banner';
import { BigButton } from '@/components/big-button';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { Icon } from '@/components/icon';
import { NudgeCard } from '@/components/contacts-nudge-card';
import { FirstRunSteps, StatsStrip } from '@/components/home-widgets';
import { RecentRidesSection, useRecentRides } from '@/components/recent-rides-section';
import { RideProgressCard } from '@/components/ride-progress-card';
import { RiderAvatar } from '@/components/rider-avatar';
import { Screen } from '@/components/screen';
import { useContactCount } from '@/hooks/use-contact-count';
import { useHomeConvoy } from '@/hooks/use-home-convoy';
import { useNetOffline } from '@/hooks/use-connection';
import { useNow } from '@/hooks/use-now';
import { copy, t } from '@/lib/copy';
import { formatElapsed } from '@/lib/format';
import { greetingCopyKey, isGuest, pickNudge, profilePill, profileTodoCount } from '@/lib/home';
import { href } from '@/lib/nav';
import { displayRideName, firstName } from '@/lib/names';
import { monthStats } from '@/lib/recent-rides';
import { readRideStats } from '@/lib/ride-stats';
import { getMyOpenRide, type OpenRide } from '@/lib/ride-api';
import { rideHref } from '@/lib/routing';
import { useNudgeStore } from '@/store/nudge-store';
import { useSessionStore } from '@/store/session-store';
import { showToast } from '@/store/toast-store';
import { family, space, touchTarget } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

type HomeSheet = 'switch' | 'leaderBusy' | null;

export default function Home() {
  const { colors, scheme, traits } = useTheme();
  const profile = useSessionStore((s) => s.profile);
  const user = useSessionStore((s) => s.session?.user);
  const { welcome } = useLocalSearchParams<{ welcome?: string }>();
  const offline = useNetOffline();
  // Kept across refetches so the resume card shows the last known ride while offline.
  const [open, setOpen] = useState<OpenRide | null>(null);  const [sheet, setSheet] = useState<HomeSheet>(null);
  // Ticks so "Started N min ago" keeps counting and the greeting follows the clock.
  const now = useNow(30_000);

  const name = profile?.display_name ?? '';
  const first = firstName(name);

  // One nudge at most: emergency contacts first, then saving the account (13 §3).
  const contactCount = useContactCount();
  const dismissed = useNudgeStore((s) => s.dismissed);
  const guest = isGuest(user);
  const nudge = pickNudge({ contacts: contactCount, guest, dismissed });
  const todo = profileTodoCount(contactCount, guest);

  // Bumped when a reconnect reload succeeded: refetch what this screen shows.
  const dataEpoch = useSessionStore((s) => s.dataEpoch);
  const refresh = useCallback(async () => {
    try {
      setOpen(await getMyOpenRide());
    } catch {
      // Offline or failing: keep showing what we have; Start/Join explain their own errors.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataEpoch]);

  // Refetch on every focus and when the app returns to the foreground.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  // Onboarding hands over `?welcome=1`; greet once, then clear the param so it cannot repeat.
  useEffect(() => {
    if (welcome !== '1' || !name) return;
    showToast(t('home.toastWelcome', { name: first }));
    router.setParams({ welcome: undefined });
  }, [welcome, name, first]);

  const onStart = () => {
    if (!open) return router.push(href('/new-ride'));
    setSheet(open.member.role === 'leader' ? 'leaderBusy' : 'switch');
  };

  const goToOpenRide = () => {
    if (open) router.push(href(rideHref(open.ride.id, open.ride.status)));
  };

  const hasRide = !!open;
  const active = open?.ride.status === 'active';
  const startedMs = open?.ride.started_at ? Date.parse(open.ride.started_at) : NaN;
  // Convoy + month stats (16 §3).
  const myUserId = user?.id ?? null;
  const convoy = useHomeConvoy(open?.ride.id ?? null, active, myUserId);
  const { rides, failed } = useRecentRides();
  const stats = rides ? monthStats(rides, readRideStats(), now) : null;
  // First run: no rides ever (and not just offline with nothing cached).
  const firstRun = rides !== null && rides.length === 0 && !hasRide;

  const todoWords =
    todo === 0 ? '' : todo === 1 ? copy['home.a11yProfileTodoOne'] : t('home.a11yProfileTodo', { n: todo });
  const pill = profilePill(first, todoWords);

  return (
    <Screen
      scroll
      top={offline ? <Banner tone="offline" icon="offline" text={copy['home.offlineSaved']} /> : null}
      footer={
        // Join lives in the Quick join card (13 §3); Start is the single footer action. While a ride is
        // active you cannot ride two, so the footer goes away (16 §3).
        active ? null : (
          <BigButton
            label={copy['home.start']}
            variant={hasRide ? 'secondary' : 'primary'}
            prominent={!hasRide}
            leading={
              traits.startIcon === 'mark' ? (
                <Image
                  source={require('../../../assets/brand/png/logo-mark.png')}
                  style={[styles.startMark, { tintColor: hasRide ? colors.text : colors.onAccent }]}
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                />
              ) : (
                <Icon name="navigate" color={hasRide ? colors.text : colors.onAccent} size={22} />
              )
            }
            onPress={onStart}
          />
        )
      }>
      <View style={styles.topRow}>
        {/* Brand lockup (15 §8): the mark + "Throttle Tribe" with Tribe in the brand orange (never themed). */}
        <View style={styles.lockup} accessible accessibilityRole="header" accessibilityLabel={copy['home.appName']}>
          <Image
            source={
              scheme === 'dark'
                ? require('../../../assets/brand/png/logo-mark-on-dark.png')
                : require('../../../assets/brand/png/logo-mark.png')
            }
            style={styles.mark}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <AppText variant="heading" style={styles.appName} numberOfLines={1} maxFontSizeMultiplier={1.3}>
            {'Throttle '}
            <Text style={{ color: colors.wordmarkAccent }}>Tribe</Text>
          </AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={pill.label}
          onPress={() => router.push(href('/profile'))}
          style={styles.chip}>
          <View>
            <RiderAvatar name={name || '?'} colorIndex={0} size={40} me />
            {/* Amber dot + the words in the label: profile has things to set up. */}
            {todo > 0 ? (
              <View style={[styles.todoDot, { backgroundColor: colors.status.stopped, borderColor: colors.bg }]} />
            ) : null}
          </View>
        </Pressable>
      </View>

      <View style={styles.hero}>
        <AppText variant="title" accessibilityRole="header" maxFontSizeMultiplier={1.3}>
          {firstRun
            ? first
              ? t('home.firstTitle', { name: first })
              : copy['home.firstTitleNoName']
            : t(greetingCopyKey(new Date(now).getHours(), !!first), { name: first })}
        </AppText>
        {hasRide ? null : <AppText muted>{firstRun ? copy['home.firstSub'] : copy['home.heading']}</AppText>}
      </View>

      {open ? (
        <RideProgressCard
          name={displayRideName(open.ride.name)}
          role={open.member.role === 'leader' ? copy['home.roleLeader'] : copy['home.roleRider']}
          active={active}
          elapsed={active && !Number.isNaN(startedMs) ? formatElapsed(now - startedMs) : ''}
          convoy={convoy}
          onResume={goToOpenRide}
        />
      ) : null}

      {firstRun ? <FirstRunSteps /> : null}

      {stats && !hasRide ? <StatsStrip stats={stats} /> : null}

      {/* The only Join entry on Home (the footer Join button was the duplicate). */}
      {hasRide ? null : (
        <ActionCard
          icon="dialpad"
          title={copy['home.joinTitle']}
          sub={copy['home.joinSub']}
          onPress={() => router.push(href('/join'))}
        />
      )}

      {hasRide ? null : (
        // Solo starts at Where to? (21 §2.1): pick a place, or "Just ride" from there.
        <ActionCard
          icon="mapSearch"
          title={copy['home.whereToTitle']}
          sub={copy['home.whereToSub']}
          onPress={() => router.push(href('/where-to'))}
        />
      )}

      {nudge ? <NudgeCard kind={nudge} /> : null}

      {firstRun ? null : <RecentRidesSection rides={rides} failed={failed} />}

      <ConfirmSheet
        visible={sheet === 'switch'}
        title={t('home.confirmSwitchTitle', { ride: open ? displayRideName(open.ride.name) : '' })}
        body={t('home.confirmSwitchBody', { ride: open ? displayRideName(open.ride.name) : '' })}
        confirmLabel={copy['home.confirmSwitchConfirm']}
        onCancel={() => setSheet(null)}
        onConfirm={() => {
          setSheet(null);
          // New ride screen leaves the old ride only when Create succeeds, so Cancel there is free.
          router.push(href(`/new-ride?leaveRideId=${open?.ride.id ?? ''}`));
        }}
      />
      <ConfirmSheet
        visible={sheet === 'leaderBusy'}
        title={t('home.leaderBusyTitle', { ride: open ? displayRideName(open.ride.name) : '' })}
        body={copy['home.leaderBusyBody']}
        confirmLabel={t('home.leaderBusyAction', { ride: open ? displayRideName(open.ride.name) : '' })}
        tone="primary"
        hideCancel
        onCancel={() => setSheet(null)}
        onConfirm={() => {
          setSheet(null);
          goToOpenRide();
        }}
      />
    </Screen>
  );
}

const TODO_DOT = 10;

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  lockup: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  mark: { width: 28, height: 28 },
  startMark: { width: 24, height: 24 },
  appName: { flexShrink: 1, fontSize: 20, fontFamily: family.bold },
  // 40 avatar inside a 56 hit area.
  chip: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  todoDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: TODO_DOT,
    height: TODO_DOT,
    borderRadius: TODO_DOT / 2,
    borderWidth: 1,
  },
  hero: { gap: space.xs, paddingTop: space.md },
});
