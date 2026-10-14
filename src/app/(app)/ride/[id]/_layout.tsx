import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { router, Stack, useFocusEffect, useLocalSearchParams, useSegments } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Linking, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AlertBanner } from '@/components/alert-banner';
import { Banner } from '@/components/banner';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { RideHeader } from '@/components/ride-header';
import { Screen } from '@/components/screen';
import { WebRideNotices } from '@/components/web-ride-notices';
import { Sheet } from '@/components/sheet';
import { StopApprovalCard } from '@/components/stop-approval-card';
import { SheetAction } from '@/components/sheet-action';
import { SosSenderPanel } from '@/components/sos-sender-panel'; // sos contacts
import { SosPinnedBanner, SosTakeover, useReceiverSos } from '@/components/sos-takeover';
import { MODAL_CLOSE_MS, useAfterModalClose } from '@/hooks/use-after-modal'; // invite
import { useConnection, useNetOffline } from '@/hooks/use-connection';
import { useInviteMatching } from '@/hooks/use-invite-matching'; // invite
import { useNavigation } from '@/hooks/use-navigation';
import { useNow } from '@/hooks/use-now';
import { usePermissions } from '@/hooks/use-permissions';
import { useRideAlerts } from '@/hooks/use-ride-alerts';
import { useRideChannel } from '@/hooks/use-ride-channel';
import { RideActionsContext, type RideActions } from '@/hooks/use-ride-actions';
import { notifyStopProposal, setupNotifications } from '@/lib/alerts';
import { copy, errorText, riderCount as riderCountText, t } from '@/lib/copy';
import { headerSearchVisible, panelVariant } from '@/lib/live-chrome';
import { isNavActive } from '@/lib/nav-engine';
import { destKey, isArrived } from '@/lib/nav-arrival';
import { INVITE_BASE_URL } from '@/lib/flags'; // invite
import { formatElapsed } from '@/lib/format';
import { displayRideName, firstName } from '@/lib/names';
import { inviteLink, inviteShareMessage } from '@/lib/invite'; // invite
import { haptic } from '@/lib/haptics';
import { toggleVoice } from '@/lib/voice-toggle';
import { shareText } from '@/lib/share-text';
import { phraseFor } from '@/lib/live-list';
import { showLobbyContactsBanner } from '@/lib/home';
import { getRideId } from '@/lib/location/ride-config';
import { isTracking, startRideTracking, stopRideTracking } from '@/lib/location/tracking';
import { href } from '@/lib/nav';
import { fixPermission as fixPermissionAction } from '@/lib/permissions';
import { clearStop, decideStop, endRide, leaveRide, setSos, toRideError } from '@/lib/ride-api';
import { rideRedirect, type RideChild } from '@/lib/routing';
import { setTelemetryRideId } from '@/lib/telemetry';
import { sosIsOn } from '@/lib/sos';
import { approvalCardModel, rideStop } from '@/lib/stop-ui';
import { useAlertStore } from '@/store/alert-store';
import { useLiveUiStore } from '@/store/live-ui-store';
import { arrivalForRide, useNavStore } from '@/store/nav-store';
import { useNudgeStore } from '@/store/nudge-store';
import { selectPendingProposals, useRideStore } from '@/store/ride-store';
import { useSosStore } from '@/store/sos-store';
import { showToast } from '@/store/toast-store';
import { useTheme } from '@/theme/use-theme';

type ConfirmKind = 'leave' | 'end' | 'clearStop' | null;
type Dismissable = 'bgOff' | 'notifOff';

function childOf(segments: string[]): RideChild | null {
  const last = segments[segments.length - 1];
  return last === 'lobby' || last === 'live' || last === 'summary' || last === 'invite' || last === 'search'
    ? last
    : null;
}

/**
 * The ride container (00 §1): mounts the Realtime channel once for lobby/live/summary, keeps the
 * screen awake, owns background tracking, redirects on ride status changes, and hosts the header,
 * banner stack and the leave/end/menu sheets. Pass-2 overlays (SOS takeover, alert banner queue)
 * mount here too: banners via `banners` below, the takeover as an absolute sibling of <Screen>.
 */
export default function RideLayout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const segments = useSegments() as string[];
  const child = childOf(segments);

  const channelStatus = useRideChannel(id);
  const connection = useConnection(channelStatus);
  const netOffline = useNetOffline();
  // A route outside this ride (e.g. /join opened by a deep link) leaves this layout mounted
  // underneath; its segments then match no child, which must not redirect back into the ride.
  const inRide = segments.includes('ride');
  const { info: permissions, refresh: refreshPermissions } = usePermissions();
  const fullMap = useLiveUiStore((s) => s.fullMap);
  const insets = useSafeAreaInsets();
  // One 5 s ticker for the header clock and the alert detection (06 §7).
  const now = useNow(5000);

  const storeRideId = useRideStore((s) => s.rideId);
  const ride = useRideStore((s) => s.ride);
  const loaded = useRideStore((s) => s.loaded);
  const members = useRideStore((s) => s.members);
  const positions = useRideStore((s) => s.positions);
  const trail = useRideStore((s) => s.leaderTrail);
  const myUserId = useRideStore((s) => s.myUserId);
  const pendingProposals = useRideStore(selectPendingProposals);
  const stopNotice = useRideStore((s) => s.stopNotice);
  const sosPhase = useSosStore((s) => s.phase);
  const sosCancelled = useSosStore((s) => s.cancelledNotice);
  const alertCurrent = useAlertStore((s) => s.queue.current);
  const myContactsLoaded = useSosStore((s) => s.myContactsLoaded);
  const myContactCount = useSosStore((s) => s.myContacts.length);
  const lobbyNudgeDismissed = useNudgeStore((s) => !!id && !!s.lobbyDismissed[id]);
  const { active: receivedSos, target: sosTarget } = useReceiverSos();

  useRideAlerts(id, now);

  const me = myUserId ? members[myUserId] : undefined;
  const isLeader = !!ride && !!myUserId && ride.leader_id === myUserId;
  const status = storeRideId === id ? ride?.status : undefined;
  const left = !!me?.leftAt;
  const riderCount = Object.values(members).filter((m) => !m.leftAt).length;
  // A ride of one (20 C4): its copy must not talk about "everyone" (21 decision 5).
  const solo = panelVariant(loaded && storeRideId === id, riderCount) === 'solo';

  const [menuOpen, setMenuOpen] = useState(false);
  const afterMenu = useAfterModalClose(); // invite: menu -> confirm sheet hand-off
  useInviteMatching(id, child); // invite
  const [confirm, setConfirm] = useState<ConfirmKind>(null);
  const [working, setWorking] = useState(false);
  // While ending: do not route to the summary until the confirm sheet has finished closing.
  const [holdRedirect, setHoldRedirect] = useState(false);
  const [dismissed, setDismissed] = useState<Record<Dismissable, boolean>>({ bgOff: false, notifOff: false });
  const [backOnline, setBackOnline] = useState(false);
  // Leader approval card: the button in flight, and proposals decided here (hidden before the broadcast lands).
  const [deciding, setDeciding] = useState<{ id: number; accept: boolean } | null>(null);
  const [decidedIds, setDecidedIds] = useState<number[]>([]);
  const previousConnection = useRef(connection);
  const trackingStart = useRef(false);

  // Telemetry context and notification channels (silent: no permission prompt here).
  useEffect(() => {
    setTelemetryRideId(id);
    void setupNotifications({ prompt: false }).catch(() => {});
    return () => {
      setTelemetryRideId(null);
      // Stale data from this ride must not flash on the next one, nor trigger wrong redirects.
      useRideStore.getState().reset();
      useSosStore.getState().reset();
      useAlertStore.getState().reset();
      useLiveUiStore.getState().clear();
      // The preview route and expressway choice go with the ride screens, but only this ride's own (a newer
      // ride may already have started its session). The arrival latch stays: reopening the ride must not
      // re-arrive; it is cleared when the ride ends.
      useNavStore.getState().resetSession(id ?? '');
    };
  }, [id]);

  // Mirror my member row into the SOS state machine (restart, other device, server-side clear).
  const mySos = me?.sos;
  useEffect(() => {
    if (mySos !== undefined) useSosStore.getState().syncServer(mySos);
  }, [mySos]);

  // Stop notices (19 A) for everyone, on any ride child: "Next stop: ...", accepted / declined / removed.
  // The value present on mount is old news; only changes toast.
  const lastNoticeNonce = useRef(stopNotice?.nonce);
  useEffect(() => {
    if (!stopNotice || stopNotice.nonce === lastNoticeNonce.current) return;
    lastNoticeNonce.current = stopNotice.nonce;
    showToast(stopNotice.text);
    haptic(stopNotice.kind === 'declined' ? 'warning' : 'success');
  }, [stopNotice]);

  // --- sos contacts --- my contacts are cached for the ride (panel renders instantly, offline too);
  // refreshed on focus so edits made on the contacts screen are picked up.
  useFocusEffect(
    useCallback(() => {
      void useSosStore.getState().loadMyContacts();
    }, []),
  );
  // The Home "add a contact" card may come back once a ride has ended.
  useEffect(() => {
    if (status === 'ended') useNudgeStore.getState().reset();
  }, [status]);
  // An ended ride (or one I left) takes its arrival latch with it.
  useEffect(() => {
    if (id && (status === 'ended' || left)) useNavStore.getState().clearArrival(id);
  }, [id, status, left]);
  // --- end sos contacts ---

  // No SOS retries once the ride is over or I have left.
  const over = status === 'ended' || left;
  useEffect(() => {
    if (over) useSosStore.getState().reset();
  }, [over]);

  // Keep the screen on in lobby and live; released on summary and when leaving the ride screens.
  const awake = status !== 'ended';
  useEffect(() => {
    if (!awake) return;
    void activateKeepAwakeAsync('ride').catch(() => {});
    return () => {
      void deactivateKeepAwake('ride').catch(() => {});
    };
  }, [awake]);

  // Route between lobby / live / summary / home on status changes (00 redirect table).
  useEffect(() => {
    if (!inRide || !loaded || storeRideId !== id || !status || holdRedirect) return;
    const redirect = rideRedirect({ status, child, left });
    if (!redirect) return;
    if (redirect.stopTracking) void stopRideTracking().catch(() => {});
    if (redirect.successHaptic) {
      haptic('success');
      showToast(copy['lobby.started']);
    }
    // Ride ended (summary arrives): one Success haptic, but not for a ride cancelled in the lobby.
    if (redirect.to === 'summary' && useRideStore.getState().ride?.started_at) haptic('success');
    router.replace(href(redirect.to === 'home' ? '/home' : `/ride/${id}/${redirect.to}`));
  }, [inRide, loaded, storeRideId, id, status, child, left, holdRedirect]);

  // Start background tracking when entering a live ride with foreground permission (covers the
  // skipped-permissions path and app restarts); re-evaluated when permissions change.
  const foreground = permissions?.snapshot.foreground;
  useEffect(() => {
    if (!loaded || storeRideId !== id || !status || status === 'ended' || left) return;
    if (foreground !== 'granted' || trackingStart.current) return;
    trackingStart.current = true;
    (async () => {
      try {
        if (!(await isTracking()) || getRideId() !== id) await startRideTracking(id);
      } finally {
        trackingStart.current = false;
      }
    })().catch(() => {});
  }, [loaded, storeRideId, id, status, left, foreground]);

  // "Back online" confirmation for 3 s after an offline spell.
  useEffect(() => {
    const was = previousConnection.current;
    previousConnection.current = connection;
    if (was !== 'offline' || connection !== 'live') return;
    const show = setTimeout(() => setBackOnline(true), 0);
    const hide = setTimeout(() => setBackOnline(false), 3000);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [connection]);

  // ------------------------------------------------------------ actions

  const rideName = ride ? displayRideName(ride.name) : '';

  // --- invite --- share text = https link when EXPO_PUBLIC_INVITE_BASE_URL is set, else code only.
  const shareCode = () => {
    if (!ride) return;
    const message = inviteShareMessage(rideName, ride.code, inviteLink(ride.code, INVITE_BASE_URL));
    void shareText(message);
  };
  const openInvite = useCallback(() => {
    if (id) router.push(href(`/ride/${id}/invite`));
  }, [id]);
  // --- end invite ---

  const handleError = (e: unknown) => {
    const code = toRideError(e).code;
    showToast(errorText(code));
    if (code === 'not_a_member') {
      void stopRideTracking().catch(() => {});
      router.replace(href('/home'));
    } else if (id) {
      void useRideStore.getState().load(id);
    }
  };

  // Clear my SOS first (never rely on the server doing it), then leave / end.
  const clearMySos = async () => {
    if (me?.sos && id) await setSos(id, false);
  };

  const doLeave = async () => {
    if (!id) return;
    setWorking(true);
    try {
      await clearMySos();
      await leaveRide(id);
      await stopRideTracking();
      setConfirm(null);
      router.replace(href('/home'));
    } catch (e) {
      setConfirm(null);
      handleError(e);
    } finally {
      setWorking(false);
    }
  };

  const doEnd = async () => {
    if (!id) return;
    setWorking(true);
    setHoldRedirect(true);
    try {
      await clearMySos();
      const ended = await endRide(id);
      setConfirm(null);
      // Let the sheet slide out before the summary mounts (it must never render behind an open sheet).
      setTimeout(() => setHoldRedirect(false), MODAL_CLOSE_MS);
      // The `ride` broadcast normally routes everyone; if it has not arrived in 3 s, apply the RPC result.
      setTimeout(() => {
        if (useRideStore.getState().ride?.status !== 'ended') useRideStore.getState().applyRide(ended);
      }, 3000);
    } catch (e) {
      setConfirm(null);
      setHoldRedirect(false);
      handleError(e);
    } finally {
      setWorking(false);
    }
  };

  // Leader-only "Remove next stop" (20 C5): moved here from the stop card's ✕; confirms like Leave / End.
  // In a solo ride it is "Stop directions" (21 §2.10): the ride goes on.
  const stopInfo = useMemo(() => rideStop(ride), [ride]);
  const hasStop = !!stopInfo;
  const doClearStop = async () => {
    if (!id) return;
    setWorking(true);
    try {
      await clearStop(id);
    } catch (e) {
      showToast(errorText(toRideError(e).code));
    } finally {
      setWorking(false);
      setConfirm(null);
    }
  };

  const openSearch = useCallback(() => {
    if (id) router.push(href(`/ride/${id}/search`));
  }, [id]);

  // --- leader approval of stop proposals (19 A) ---
  const myPos = myUserId ? positions[myUserId] : undefined;
  const myLat = myPos?.lat;
  const myLng = myPos?.lng;
  const meLL = useMemo(() => (myLat != null && myLng != null ? { lat: myLat, lng: myLng } : null), [myLat, myLng]);
  // The echo with its fix time, so the engine can tell a fresh position from a stale one (21 L4).
  const myT = myPos ? Date.parse(myPos.recordedAt) : NaN;
  const originFix = useMemo(
    () => (myLat != null && myLng != null && !Number.isNaN(myT) ? { lat: myLat, lng: myLng, t: myT } : null),
    [myLat, myLng, myT],
  );
  const approvalActive = isLeader && status === 'active' && !left;

  // Turn-by-turn navigation (21 §3 intro): the engine (lib/nav-session.ts, no React) is started and stopped from
  // here, not from the live screen, so it keeps running while a ride child such as the search screen is on top.
  const stopLL = useMemo(() => (stopInfo ? { lat: stopInfo.lat, lng: stopInfo.lng } : null), [stopInfo]);
  const arrivalLatch = useNavStore((s) => arrivalForRide(s, id ?? ''));
  const engineKey = useNavStore((s) => (s.engine.active ? s.engine.key : ''));
  const engineOffRoute = useNavStore((s) => !!s.engine.progress?.offRoute);
  const navOn = isNavActive({
    solo,
    rideLive: status === 'active' && !left,
    hasStop: !!stopLL,
    arrived: isArrived(arrivalLatch, stopLL),
    engineRunning: isLeader && engineKey !== '' && engineKey === destKey(stopLL),
  });
  const voiceOn = useNavStore((s) => s.voiceOn);
  useNavigation({
    rideId: id,
    active: navOn && storeRideId === id,
    dest: stopLL,
    place: stopInfo?.name ?? '',
    origin: originFix,
    netOffline,
    locationPermitted: foreground === 'granted' && (permissions?.servicesEnabled ?? true),
  });
  const approval = approvalActive
    ? approvalCardModel({
        proposals: pendingProposals.filter((p) => !decidedIds.includes(p.id)),
        members,
        me: meLL,
      })
    : null;

  // A new proposal: warning haptic, and a local notification when the app is in the background.
  // Proposals already there when the ride loaded are not announced again.
  const seenProposals = useRef<Set<number> | null>(null);
  useEffect(() => {
    if (!loaded || storeRideId !== id) {
      seenProposals.current = null;
      return;
    }
    const seen = seenProposals.current;
    if (!seen) {
      seenProposals.current = new Set(pendingProposals.map((p) => p.id));
      return;
    }
    for (const p of pendingProposals) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      const proposer = members[p.userId];
      if (!approvalActive || proposer?.leftAt) continue;
      haptic('warning');
      if (AppState.currentState !== 'active') {
        void notifyStopProposal(
          t('stop.notifTitle', { name: firstName(proposer?.name ?? '') || 'A rider' }),
          t('stop.notifBody', { place: p.stop.name }),
          id,
        );
      }
    }
  }, [loaded, storeRideId, id, pendingProposals, approvalActive, members]);

  const decide = async (accept: boolean) => {
    if (!id || !approval || deciding) return;
    const proposalId = approval.proposalId;
    setDeciding({ id: proposalId, accept });
    try {
      await decideStop(id, proposalId, accept);
      setDecidedIds((ids) => [...ids, proposalId]);
    } catch (e) {
      // Already decided (another phone, or a retry): drop the card, tell the leader, and reload.
      if (toRideError(e).code === 'proposal_already_decided') setDecidedIds((ids) => [...ids, proposalId]);
      handleError(e);
    } finally {
      setDeciding(null);
    }
  };
  // --- end leader approval ---

  const fixPermission: RideActions['fixPermission'] = async (target) => {
    if (permissions) await fixPermissionAction(target, permissions);
    await refreshPermissions();
  };

  // Stable identities: the live screen's action bar is memoised on these, so the 1 s / 5 s clock
  // ticks never re-render a button that is mid-press. setState setters never change.
  const requestLeave = useCallback(() => setConfirm('leave'), []);
  const requestEnd = useCallback(() => setConfirm('end'), []);
  const openMenu = useCallback(() => setMenuOpen(true), []);

  const actions: RideActions = {
    rideId: id ?? '',
    isLeader,
    connection,
    permissions,
    shareCode,
    openInvite,
    requestLeave,
    requestEnd,
    openMenu,
    fixPermission,
  };

  // ------------------------------------------------------------ banners (max 2, priority order)

  const snapshot = permissions?.snapshot;
  const banners: ReactNode[] = [];
  // The banners that stay over the full map (19 B): safety never hides. SOS, and "not sharing" / GPS off
  // (the group cannot see me).
  const keptBanners: ReactNode[] = [];
  const pushKept = (node: ReactNode) => {
    banners.push(node);
    keptBanners.push(node);
  };
  const rideLive = status !== 'ended' && !left;
  // 1. SOS banners come first (00 §2.5): mine (not closable) and, once dismissed, the received ones.
  if (rideLive && sosIsOn(sosPhase)) {
    pushKept(
      <Banner
        key="mySos"
        tone="sos"
        icon="sos"
        text={
          sosPhase === 'active'
            ? copy['sos.active']
            : sosPhase === 'sending'
              ? copy['sos.sending']
              : copy['sos.retrying']
        }
        onPress={() => useSosStore.getState().openPanel()} // sos contacts: banner reopens the panel
        accessibilityLabel={copy['sosMe.a11yReopen']}
        action={{ label: copy['sos.call'], onPress: () => void Linking.openURL('tel:112').catch(() => {}) }}
      />,
    );
  } else if (rideLive && sosCancelled) {
    banners.push(<Banner key="sosCancelled" tone="success" icon="ready" text={copy['sos.cancelled']} />);
  }
  if (rideLive && receivedSos.length > 0 && !sosTarget) {
    pushKept(<SosPinnedBanner key="sosPinned" active={receivedSos} />);
  }
  if (connection === 'offline') {
    banners.push(
      netOffline ? (
        <Banner
          key="offline"
          tone="offline"
          icon="offline"
          // A ride of one that is navigating on its steps keeps working offline (21 §2.7); off route it does not.
          text={solo && navOn && !engineOffRoute ? copy['banner.offlineSolo'] : copy['banner.offline']}
        />
      ) : (
        <Banner key="reconnecting" tone="warning" icon="connecting" text={copy['banner.reconnecting']} />
      ),
    );
  } else if (backOnline) {
    banners.push(<Banner key="online" tone="success" icon="ready" text={copy['banner.backOnline']} />);
  }
  if (snapshot && status !== 'ended') {
    if (snapshot.foreground !== 'granted') {
      pushKept(
        <Banner
          key="notSharing"
          tone="warning"
          icon="notSharing"
          text={copy['banner.notSharing']}
          action={{ label: copy['banner.fix'], onPress: () => void fixPermission('location') }}
        />,
      );
    } else if (permissions && !permissions.servicesEnabled) {
      pushKept(
        <Banner
          key="gpsOff"
          tone="warning"
          icon="notSharing"
          text={copy['banner.gpsOff']}
          action={{ label: copy['banner.fix'], onPress: () => void fixPermission('location') }}
        />,
      );
    } else if (snapshot.background !== 'granted' && !dismissed.bgOff) {
      banners.push(
        <Banner
          key="bgOff"
          tone="warning"
          icon="bgOff"
          text={copy['banner.bgOff']}
          action={{ label: copy['banner.fix'], onPress: () => void fixPermission('background') }}
          onClose={() => setDismissed((d) => ({ ...d, bgOff: true }))}
        />,
      );
    }
    if (child === 'lobby' && snapshot.notifications === 'denied' && !dismissed.notifOff) {
      banners.push(
        <Banner
          key="notifOff"
          tone="info"
          icon="notifOff"
          text={copy['banner.notifOff']}
          onClose={() => setDismissed((d) => ({ ...d, notifOff: true }))}
        />,
      );
    }
  }
  // 4. One alert banner at a time (07 §1); it waits when two higher banners are showing.
  if (alertCurrent && rideLive) {
    const { alert } = alertCurrent;
    const canView = child === 'live' && !!alert.userId && !!positions[alert.userId];
    banners.push(
      <AlertBanner
        key={`alert-${alertCurrent.key}-${alertCurrent.shownAt}`}
        alert={alert}
        canView={canView}
        livePhrase={phraseFor(trail, myUserId ? positions[myUserId] : undefined, positions[alert.userId])}
        onView={() => {
          useLiveUiStore.getState().select(alert.userId);
          useAlertStore.getState().dismiss();
        }}
      />,
    );
  }
  // 5. Lowest priority, lobby only (11 §4): no emergency contacts yet. Closable, once per ride.
  if (
    child === 'lobby' &&
    rideLive &&
    id &&
    showLobbyContactsBanner(myContactsLoaded, myContactCount, lobbyNudgeDismissed)
  ) {
    banners.push(
      <Banner
        key="lobbyContacts"
        tone="info"
        icon="shield"
        text={copy['nudge.lobbyBanner']}
        action={{ label: copy['nudge.lobbyAdd'], onPress: () => router.push(href('/emergency-contacts')) }}
        onClose={() => useNudgeStore.getState().dismissLobby(id)}
      />,
    );
  }
  const visibleBanners = banners.slice(0, 2);
  // Leader approval card ("Priya suggests a break ..."): after the capped banner stack (never squeezed
  // out) and also over the full map. One card, with "+N more" when others wait behind it.
  const approvalCards: ReactNode[] = [];
  if (approval) {
    approvalCards.push(
      <StopApprovalCard
        key="stop-approval"
        text={approval.text}
        kind={approval.kind}
        moreCount={approval.moreCount}
        busy={deciding?.id === approval.proposalId ? (deciding.accept ? 'accept' : 'decline') : null}
        onAccept={() => void decide(true)}
        onDecline={() => void decide(false)}
      />,
    );
  }

  // Full map (19 B) hides the header and every banner except SOS and not-sharing; approval cards remain.
  const fullMapOn = fullMap && child === 'live' && rideLive;
  const floatingStack = fullMapOn ? [...keptBanners.slice(0, 3), ...approvalCards] : [];
  const floatingShown = floatingStack.length > 0;
  // The live screen offsets its own overlays by the floating stack's height.
  useEffect(() => {
    if (!floatingShown) useLiveUiStore.getState().setTopStackH(0);
  }, [floatingShown]);

  // ------------------------------------------------------------ header

  const startedMs = ride?.started_at ? Date.parse(ride.started_at) : NaN;
  const meta =
    status === 'active' && !Number.isNaN(startedMs)
      ? formatElapsed(now - startedMs) // the sheet summary owns the rider count (20 C3)
      : t('lobby.headerMeta', { riders: riderCountText(riderCount) });
  // The invite screen has its own top bar (10 §2); the stop search has its own back + input row.
  const showHeader = child !== 'summary' && child !== 'invite' && child !== 'search' && status !== 'ended';

  // ------------------------------------------------------------ sheets

  const inLobby = status === 'lobby';
  const sosWarning = me?.sos ? ` ${copy['sos.leaveWarning']}` : '';
  const leaveTitle = inLobby ? copy['lobby.leaveTitle'] : copy['live.leaveTitle'];
  const leaveBody = (inLobby ? copy['lobby.leaveBody'] : copy['live.leaveBody']) + sosWarning;
  const endTitle = inLobby ? copy['lobby.cancelTitle'] : solo ? copy['nav.endTitleSolo'] : copy['live.endTitle'];
  const endBody = (inLobby ? copy['lobby.cancelBody'] : solo ? copy['nav.endBodySolo'] : copy['live.endBody']) + sosWarning;
  const endConfirm = inLobby ? copy['lobby.cancelConfirm'] : copy['live.endConfirm'];
  const endMenuLabel = inLobby ? copy['lobby.cancelRide'] : copy['live.menuEnd'];
  const leaveMenuLabel = inLobby ? copy['lobby.leave'] : copy['live.menuLeave'];
  const leaveConfirm = inLobby ? copy['lobby.leaveConfirm'] : copy['live.leaveConfirm'];

  return (
    <RideActionsContext.Provider value={actions}>
      <Screen
        padded={false}
        edgeToEdge={fullMapOn}
        top={
          <>
            {showHeader && !fullMapOn ? (
              <RideHeader
                name={rideName}
                meta={meta}
                connection={connection}
                // Back leaves the ride screens, not the ride: tracking continues, Home shows the resume card.
                onBack={() => (router.canGoBack() ? router.back() : router.replace(href('/home')))}
                onMenu={() => setMenuOpen(true)}
                onSearch={headerSearchVisible({ child, rideLive, connection }) ? openSearch : undefined}
              />
            ) : null}
            {fullMapOn ? null : visibleBanners}
            {fullMapOn ? null : approvalCards}
            {Platform.OS === 'web' && rideLive && !fullMapOn ? <WebRideNotices child={child} /> : null}
          </>
        }>
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />
        </View>
      </Screen>

      {/* Full map: SOS banners and approval cards float over the edge-to-edge map, below the status bar. */}
      {floatingShown ? (
        <View
          pointerEvents="box-none"
          onLayout={(e) => useLiveUiStore.getState().setTopStackH(e.nativeEvent.layout.height)}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingTop: insets.top }}>
          {floatingStack}
        </View>
      ) : null}

      {/* My own SOS panel (11 §5); the receiver takeover below is drawn on top of it. */}
      {rideLive && id ? <SosSenderPanel rideId={id} /> : null}

      {/* Receiver SOS takeover: absolute sibling of <Screen> so it covers header and survives navigation. */}
      {rideLive && id ? <SosTakeover rideId={id} target={sosTarget} /> : null}

      <Sheet visible={menuOpen} onClose={() => setMenuOpen(false)} onDismiss={afterMenu.onDismiss} hideClose>
        <SheetAction
          icon="inviteOutline"
          label={copy['live.menuInvite']}
          onPress={() => {
            setMenuOpen(false);
            openInvite();
          }}
        />
        <SheetAction
          icon="shareOutline"
          label={copy['live.menuShare']}
          onPress={() => {
            setMenuOpen(false);
            shareCode();
          }}
        />
        {navOn ? (
          // Voice toggle (21 §2.10): always reachable here, also when the map's right column is hidden.
          <SheetAction
            icon={voiceOn ? 'voiceOff' : 'voiceOn'}
            label={voiceOn ? copy['nav.menuVoiceOff'] : copy['nav.menuVoiceOn']}
            onPress={() => {
              setMenuOpen(false);
              toggleVoice();
            }}
          />
        ) : null}
        {isLeader && hasStop ? (
          <SheetAction
            icon="close"
            label={solo ? copy['nav.menuStop'] : copy['stop.menuRemove']}
            destructive={!solo}
            onPress={() => {
              setMenuOpen(false);
              afterMenu.schedule(() => setConfirm('clearStop'));
            }}
          />
        ) : null}
        <SheetAction
          icon={isLeader ? 'endRide' : 'leave'}
          label={isLeader ? endMenuLabel : leaveMenuLabel}
          destructive={isLeader}
          last
          onPress={() => {
            setMenuOpen(false);
            // Android drops a Modal opened while another is still closing: wait for the menu to go.
            afterMenu.schedule(() => setConfirm(isLeader ? 'end' : 'leave'));
          }}
        />
      </Sheet>

      <ConfirmSheet
        visible={confirm === 'clearStop'}
        title={solo ? t('nav.stopTitle', { place: stopInfo?.name ?? '' }) : copy['stop.clearTitle']}
        body={solo ? copy['nav.stopBody'] : undefined}
        confirmLabel={solo ? copy['nav.stopConfirm'] : copy['stop.clearConfirm']}
        cancelLabel={solo ? copy['nav.stopCancel'] : copy['stop.clearCancel']}
        tone={solo ? 'primary' : 'danger'}
        loading={working}
        onCancel={() => !working && setConfirm(null)}
        onConfirm={() => void doClearStop()}
      />
      <ConfirmSheet
        visible={confirm === 'leave'}
        title={leaveTitle}
        body={leaveBody}
        confirmLabel={leaveConfirm}
        loading={working}
        onCancel={() => !working && setConfirm(null)}
        onConfirm={() => void doLeave()}
      />
      <ConfirmSheet
        visible={confirm === 'end'}
        title={endTitle}
        body={endBody}
        confirmLabel={endConfirm}
        cancelLabel={inLobby ? undefined : copy['live.keepRiding']}
        loading={working}
        onCancel={() => !working && setConfirm(null)}
        onConfirm={() => void doEnd()}
      />
    </RideActionsContext.Provider>
  );
}
