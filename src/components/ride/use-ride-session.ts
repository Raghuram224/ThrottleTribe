import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { MODAL_CLOSE_MS, useAfterModalClose } from '@/hooks/use-after-modal';
import { useConnection, useNetOffline } from '@/hooks/use-connection';
import { useInviteMatching } from '@/hooks/use-invite-matching';
import { useNavigation } from '@/hooks/use-navigation';
import { useNavRide } from '@/hooks/use-nav-ride';
import { useNow } from '@/hooks/use-now';
import { usePermissions } from '@/hooks/use-permissions';
import { type RideActions } from '@/hooks/use-ride-actions';
import { useRideAlerts } from '@/hooks/use-ride-alerts';
import { useRideChannel } from '@/hooks/use-ride-channel';
import { notifyStopProposal, setupNotifications } from '@/lib/alerts';
import { copy, errorText, t } from '@/lib/copy';
import { INVITE_BASE_URL } from '@/lib/flags';
import { noteRiderCount } from '@/lib/group-formed';
import { haptic } from '@/lib/haptics';
import { inviteLink, inviteShareMessage } from '@/lib/invite';
import { panelVariant } from '@/lib/live-chrome';
import { getRideId } from '@/lib/location/ride-config';
import { shouldStartTracking } from '@/lib/location/start-rule';
import { isTracking, startRideTracking, stopRideTracking } from '@/lib/location/tracking';
import { href } from '@/lib/nav';
import { destKey, isArrived } from '@/lib/nav-arrival';
import { isNavActive } from '@/lib/nav-engine';
import { markNavRide, unmarkNavRide } from '@/lib/nav-rides';
import { displayRideName, firstName } from '@/lib/names';
import { fixPermission as fixPermissionAction } from '@/lib/permissions';
import { renameMenuVisible } from '@/lib/rename-ride';
import { clearStop, decideStop, endRide, leaveRide, renameRide, setSos, toRideError } from '@/lib/ride-api';
import { invalidateOpenRide } from '@/lib/open-ride-signal';
import { openLiveRide } from '@/lib/reset-to-ride';
import { RIDE_ON_HOME } from '@/lib/ride-on-home';
import { rideRedirect, type RideChild } from '@/lib/routing';
import { shareText } from '@/lib/share-text';
import { approvalCardModel, rideStop } from '@/lib/stop-ui';
import { setTelemetryRideId, track } from '@/lib/telemetry';
import { useAlertStore } from '@/store/alert-store';
import { useLiveUiStore } from '@/store/live-ui-store';
import { arrivalForRide, useNavStore } from '@/store/nav-store';
import { useNudgeStore } from '@/store/nudge-store';
import { selectPendingProposals, useRideStore } from '@/store/ride-store';
import { useSosStore } from '@/store/sos-store';
import { showToast } from '@/store/toast-store';

export type ConfirmKind = 'leave' | 'end' | 'clearStop' | null;

/**
 * The ONE ride session (00 §1), mounted by `RideHost` in the (app) layout: the Realtime channel, background
 * tracking, keep-awake, alerts, SOS wiring, the status redirect table and every ride action. It runs for the
 * ride on screen or, after Back to Home, for the stored lobby / active ride. The ride layout and the overlays
 * only read what it returns. `child` is the ride screen in front (null on Home and elsewhere; 'live' on Home while its ride
 * view is open, 28 §8). `onHome` says Home itself is the screen in front: the redirect table and "leave" then push or clear the
 * ride view instead of replacing Home, which would reload its map.
 */
export function useRideSession(rideId: string | null, child: RideChild | null, onHome = false) {
  const id = rideId ?? undefined;
  // Ride screens in front: the permissions explainer (outside the ride) asks before tracking starts, and a
  // route outside the ride (e.g. /join from a deep link) must not redirect back into it.
  const inRide = child !== null;
  // Read by async handlers (leave, end), which must see where the rider is now, not where they were when it started.
  const onHomeRef = useRef(onHome);
  useEffect(() => {
    onHomeRef.current = onHome;
  });
  /** Out of the ride: Home when it is already in front (the ride view just closes), else a replace to Home. */
  const goHome = () => {
    useLiveUiStore.getState().setViewRideId(null);
    // One Home: dismissTo pops to the Home under this screen (a replace could leave a second Home, and a second ride view).
    if (!onHomeRef.current) router.dismissTo(href('/home'));
    // Home's cached open ride is stale now.
    invalidateOpenRide();
  };

  const channelStatus = useRideChannel(id);
  const connection = useConnection(channelStatus);
  const netOffline = useNetOffline();
  const { info: permissions, refresh: refreshPermissions } = usePermissions();
  // One 5 s ticker for the header clock and the alert detection (06 §7).
  const now = useNow(5000);

  const storeRideId = useRideStore((s) => s.rideId);
  const ride = useRideStore((s) => s.ride);
  const loaded = useRideStore((s) => s.loaded);
  const members = useRideStore((s) => s.members);
  const positions = useRideStore((s) => s.positions);
  const myUserId = useRideStore((s) => s.myUserId);
  const pendingProposals = useRideStore(selectPendingProposals);
  const stopNotice = useRideStore((s) => s.stopNotice);

  useRideAlerts(id, now);

  const me = myUserId ? members[myUserId] : undefined;
  const isLeader = !!ride && !!myUserId && ride.leader_id === myUserId;
  const status = storeRideId === id ? ride?.status : undefined;
  const left = !!me?.leftAt;
  const riderCount = Object.values(members).filter((m) => !m.leftAt).length;
  const rideLive = status !== 'ended' && !left;
  // The first other rider joins a ride I lead: the ride became a group (22 D6, one event per ride).
  useEffect(() => {
    if (!id || !isLeader || !loaded || storeRideId !== id || status === 'ended') return;
    if (noteRiderCount(id, riderCount)) track('ride.group_formed');
  }, [id, isLeader, loaded, storeRideId, status, riderCount]);
  // A ride of one (20 C4): its copy must not talk about "everyone" (21 decision 5).
  const solo = panelVariant(loaded && storeRideId === id, riderCount) === 'solo';

  const [menuOpen, setMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const afterMenu = useAfterModalClose(); // invite: menu -> confirm sheet hand-off
  useInviteMatching(id, child); // invite
  const [confirm, setConfirm] = useState<ConfirmKind>(null);
  const [working, setWorking] = useState(false);
  // While ending: do not route to the summary until the confirm sheet has finished closing.
  const [holdRedirect, setHoldRedirect] = useState(false);
  // Leader approval card: the button in flight, and proposals decided here (hidden before the broadcast lands).
  const [deciding, setDeciding] = useState<{ id: number; accept: boolean } | null>(null);
  const [decidedIds, setDecidedIds] = useState<number[]>([]);
  const trackingStart = useRef(false);

  // Telemetry context and notification channels (silent: no permission prompt here).
  useEffect(() => {
    // No ride, nothing to set up and (below) nothing to clear: the store may be primed for the next one.
    if (!id) return;
    setTelemetryRideId(id);
    void setupNotifications({ prompt: false }).catch(() => {});
    return () => {
      setTelemetryRideId(null);
      // Stale data from this ride must not flash on the next one, nor trigger wrong redirects.
      useRideStore.getState().reset();
      useSosStore.getState().reset();
      useAlertStore.getState().reset();
      useLiveUiStore.getState().clear();
      // The preview route and expressway choice go with the ride session, but only this ride's own (a newer
      // ride may already have started its session). The arrival latch stays: reopening the ride must not
      // re-arrive; it is cleared when the ride ends.
      useNavStore.getState().resetSession(id);
    };
  }, [id]);

  // Mirror my member row into the SOS state machine (restart, other device, server-side clear).
  const mySos = me?.sos;
  useEffect(() => {
    if (mySos !== undefined) useSosStore.getState().syncServer(mySos);
  }, [mySos]);

  // Stop notices (19 A) for everyone, on any screen: "Next stop: ...", accepted / declined / removed.
  // The value present on mount is old news; only changes toast.
  const lastNoticeNonce = useRef(stopNotice?.nonce);
  useEffect(() => {
    if (!stopNotice || stopNotice.nonce === lastNoticeNonce.current) return;
    lastNoticeNonce.current = stopNotice.nonce;
    showToast(stopNotice.text);
    haptic(stopNotice.kind === 'declined' ? 'warning' : 'success');
  }, [stopNotice]);

  // --- sos contacts --- my contacts are cached for the ride (panel renders instantly, offline too). The
  // host sits above every screen, so "focus" is the ride screen changing: a return from the contacts screen
  // lands on another child (or Home) and picks up the edits.
  useEffect(() => {
    if (id) void useSosStore.getState().loadMyContacts();
  }, [id, child]);
  // The Home "add a contact" card may come back once a ride has ended.
  useEffect(() => {
    if (status === 'ended') useNudgeStore.getState().reset();
  }, [status]);
  // An ended ride (or one I left) takes its arrival latch with it.
  useEffect(() => {
    if (id && (status === 'ended' || left)) {
      useNavStore.getState().clearArrival(id);
      // ...and its device-local "I navigate this ride" marker (22 D5), which is otherwise kept for good.
      unmarkNavRide(id);
    }
  }, [id, status, left]);
  // --- end sos contacts ---

  // No SOS retries once the ride is over or I have left.
  const over = status === 'ended' || left;
  useEffect(() => {
    if (over) useSosStore.getState().reset();
  }, [over]);

  // Keep the screen on in lobby and live (also over other screens and on Home); released on summary and with the session.
  const awake = status !== 'ended';
  useEffect(() => {
    if (!awake) return;
    void activateKeepAwakeAsync('ride').catch(() => {});
    return () => {
      void deactivateKeepAwake('ride').catch(() => {});
    };
  }, [awake]);

  // Route between lobby / live / summary / home on status changes (00 redirect table). Only while a ride
  // screen is shown: the rider is never pulled off Home (or any other screen) by a status change.
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
    // A lobby ride that started: the live view opens on Home's map (no screen slides in).
    if (redirect.to === 'live' && RIDE_ON_HOME) {
      openLiveRide(id);
      return;
    }
    // From the ride view on Home the target is pushed over Home (a replace would take Home, and its map, away). The ride view
    // closes at once for the lobby (the store still holds that ride, so the session carries on) and for Home (I left); for the
    // summary the host closes it once the summary is in front, because an ended ride is released with the view.
    if (redirect.to === 'home' || redirect.to === 'lobby') useLiveUiStore.getState().setViewRideId(null);
    if (redirect.to === 'home') invalidateOpenRide();
    if (onHome) {
      if (redirect.to !== 'home') router.push(href(`/ride/${id}/${redirect.to}`));
      return;
    }
    if (redirect.to === 'home') router.dismissTo(href('/home'));
    else router.replace(href(`/ride/${id}/${redirect.to}`));
  }, [inRide, loaded, storeRideId, id, status, child, left, holdRedirect, onHome]);

  // Start background tracking when a ride is ACTIVE with foreground permission (covers the skipped-permissions
  // path and app restarts); re-evaluated when status or permissions change, so a lobby that turns active starts at
  // once. Never in the lobby: it shares no position, and the background prompt belongs to the explainer at Start.
  const foreground = permissions?.snapshot.foreground;
  useEffect(() => {
    if (!shouldStartTracking({ loaded, storeRideId, id, status, left, foreground, inRide })) return;
    if (!id || trackingStart.current) return;
    trackingStart.current = true;
    (async () => {
      try {
        if (!(await isTracking()) || getRideId() !== id) await startRideTracking(id);
      } finally {
        trackingStart.current = false;
      }
    })().catch(() => {});
  }, [loaded, storeRideId, id, status, left, foreground, inRide]);

  // ------------------------------------------------------------ actions

  const rideName = ride ? displayRideName(ride.name) : '';

  // --- invite --- share text = https link when EXPO_PUBLIC_INVITE_BASE_URL is set, else code only.
  const shareCode = (via: 'menu' | 'lobby' = 'menu') => {
    if (!ride) return;
    const message = inviteShareMessage(rideName, ride.code, inviteLink(ride.code, INVITE_BASE_URL));
    track('invite.shared', { via });
    void shareText(message);
  };
  const openInvite = useCallback(() => {
    // navigate, not push: an invite screen already open is reused, never stacked twice.
    if (id) router.navigate(href(`/ride/${id}/invite`));
  }, [id]);
  // --- end invite ---

  const handleError = (e: unknown) => {
    const code = toRideError(e).code;
    showToast(errorText(code));
    if (code === 'not_a_member') {
      void stopRideTracking().catch(() => {});
      goHome();
      // Not in this ride: release the session (it follows the store while the ride looks lobby / active).
      useRideStore.getState().reset();
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
      goHome();
      // The store still says lobby / active with me in it: reset it so the session releases on Home.
      useRideStore.getState().reset();
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

  // Leader-only "Rename ride" (22 section 3.6): the sheet throws to stay open with the error under the field.
  const canRename = renameMenuVisible({ isLeader, status, left });
  const doRename = async (name: string) => {
    if (!id) return;
    const row = await renameRide(id, name);
    // Show it now; the broadcast of the same row follows and is a no-op.
    useRideStore.getState().applyRide(row);
    setRenameOpen(false);
    showToast(copy['rename.toast']);
    haptic('success');
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
  // This phone navigated THIS stop as the ride's leader (22 D6). Read live, so the session and the live screen
  // always agree, whether or not they remounted since the marker was written.
  const navRide = useNavRide(id, stopLL);
  const navOn = isNavActive({
    solo,
    leader: isLeader,
    navRide,
    rideLive: status === 'active' && !left,
    hasStop: !!stopLL,
    arrived: isArrived(arrivalLatch, stopLL),
    engineRunning: isLeader && engineKey !== '' && engineKey === destKey(stopLL),
  });
  // The leader who navigates keeps turn-by-turn to this stop after riders join, also after Back to Home or a restart
  // (22 D5). The marker holds the stop: a different one set later with riders present is not navigated (D6).
  useEffect(() => {
    if (id && navOn && isLeader && stopLL) markNavRide(id, destKey(stopLL));
  }, [id, navOn, isLeader, stopLL]);
  const voiceOn = useNavStore((s) => s.voiceOn);
  useNavigation({
    rideId: id,
    // Also on Home and over other screens: navigation moves onto Home's map.
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

  return {
    rideId: rideId ?? null,
    child,
    actions,
    connection,
    netOffline,
    permissions,
    fixPermission,
    now,
    ride,
    rideName,
    status,
    left,
    rideLive,
    isLeader,
    solo,
    riderCount,
    navOn,
    engineOffRoute,
    voiceOn,
    stopInfo,
    hasStop,
    canRename,
    approval,
    deciding,
    decide,
    openMenu,
    openSearch,
    openInvite,
    shareCode,
    // Overlay state and handlers.
    menuOpen,
    setMenuOpen,
    renameOpen,
    setRenameOpen,
    afterMenu,
    confirm,
    setConfirm,
    working,
    doLeave,
    doEnd,
    doClearStop,
    doRename,
    mySosOn: !!me?.sos,
    myPos,
    myFixAtMs: Number.isNaN(myT) ? null : myT,
  };
}

export type RideSession = ReturnType<typeof useRideSession>;
