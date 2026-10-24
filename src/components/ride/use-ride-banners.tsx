import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Linking } from 'react-native';

import { AlertBanner } from '@/components/alert-banner';
import { Banner } from '@/components/banner';
import { SosPinnedBanner, useReceiverSos } from '@/components/sos-takeover';
import { StopApprovalCard } from '@/components/stop-approval-card';
import type { RideSession } from '@/components/ride/use-ride-session';
import { copy, riderCount as riderCountText, t } from '@/lib/copy';
import { formatElapsed } from '@/lib/format';
import { showLobbyContactsBanner } from '@/lib/home';
import { phraseFor } from '@/lib/live-list';
import { href } from '@/lib/nav';
import { sosIsOn } from '@/lib/sos';
import { useAlertStore } from '@/store/alert-store';
import { useLiveUiStore } from '@/store/live-ui-store';
import { useNudgeStore } from '@/store/nudge-store';
import { useRideStore } from '@/store/ride-store';
import { useSosStore } from '@/store/sos-store';

type Dismissable = 'bgOff' | 'notifOff';

export interface RideBanners {
  /** The banner stack (max 2, priority order). */
  visible: ReactNode[];
  /** The banners that stay over the full map (19 B): safety never hides. SOS, and "not sharing" / GPS off. */
  kept: ReactNode[];
  /** Leader approval card ("Priya suggests a break ..."), after the capped stack so it is never squeezed out. */
  approvalCards: ReactNode[];
  /** Header meta line: the elapsed time once live, "Lobby · 4 riders" before. */
  meta: string;
}

/**
 * The ride's banner stack, approval card and header meta, shared by the ride layout (lobby, invite, summary, the live
 * screen on web) and Home's ride view. Banner priority (00 §2.5): SOS, offline / reconnecting, permissions, one alert,
 * the lobby contacts nudge; at most two show.
 */
export function useRideBanners(id: string, session: RideSession): RideBanners {
  const { child, connection, netOffline, permissions, fixPermission, now, ride, status, rideLive, solo, riderCount, navOn, engineOffRoute, approval, deciding, decide } =
    session;
  const positions = useRideStore((s) => s.positions);
  const trail = useRideStore((s) => s.leaderTrail);
  const myUserId = useRideStore((s) => s.myUserId);
  const sosPhase = useSosStore((s) => s.phase);
  const sosCancelled = useSosStore((s) => s.cancelledNotice);
  const alertCurrent = useAlertStore((s) => s.queue.current);
  const myContactsLoaded = useSosStore((s) => s.myContactsLoaded);
  const myContactCount = useSosStore((s) => s.myContacts.length);
  const lobbyNudgeDismissed = useNudgeStore((s) => !!s.lobbyDismissed[id]);
  const { active: receivedSos, target: sosTarget } = useReceiverSos();
  const [dismissed, setDismissed] = useState<Record<Dismissable, boolean>>({ bgOff: false, notifOff: false });
  const [backOnline, setBackOnline] = useState(false);
  const previousConnection = useRef(connection);

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

  const snapshot = permissions?.snapshot;
  const banners: ReactNode[] = [];
  const keptBanners: ReactNode[] = [];
  const pushKept = (node: ReactNode) => {
    banners.push(node);
    keptBanners.push(node);
  };
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
        // Grey, not amber: no data is not "stopped" (26 L1).
        <Banner key="reconnecting" tone="offline" icon="connecting" text={copy['banner.reconnecting']} />
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
  if (child === 'lobby' && rideLive && showLobbyContactsBanner(myContactsLoaded, myContactCount, lobbyNudgeDismissed)) {
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
  const approvalCards: ReactNode[] = [];
  if (approval) {
    approvalCards.push(
      <StopApprovalCard
        key="stop-approval"
        text={approval.text}
        kind={approval.kind}
        category={approval.category}
        moreCount={approval.moreCount}
        busy={deciding?.id === approval.proposalId ? (deciding.accept ? 'accept' : 'decline') : null}
        onAccept={() => void decide(true)}
        onDecline={() => void decide(false)}
      />,
    );
  }

  const startedMs = ride?.started_at ? Date.parse(ride.started_at) : NaN;
  const meta =
    status === 'active' && !Number.isNaN(startedMs)
      ? formatElapsed(now - startedMs) // the sheet summary owns the rider count (20 C3)
      : t('lobby.headerMeta', { riders: riderCountText(riderCount) });

  return { visible: banners.slice(0, 2), kept: keptBanners, approvalCards, meta };
}
