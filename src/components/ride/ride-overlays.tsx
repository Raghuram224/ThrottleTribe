import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View } from 'react-native';

import { Sheet } from '@/components/sheet';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { RenameRideSheet } from '@/components/rename-ride-sheet';
import { SheetAction, SheetActionList } from '@/components/sheet-action';
import { SosSenderPanel } from '@/components/sos-sender-panel';
import { SosPinnedBanner, SosTakeover, useReceiverSos } from '@/components/sos-takeover';
import { copy, t } from '@/lib/copy';
import { RIDE_ON_HOME } from '@/lib/ride-on-home';
import { toggleVoice } from '@/lib/voice-toggle';
import { useRideViewStore } from '@/store/ride-view-store';

import type { RideSession } from './use-ride-session';

/**
 * Everything the ride shows above the screens: my SOS panel, the receiver SOS takeover, the ⋯ menu, the
 * rename sheet and the leave / end / remove-stop confirms. Rendered by `RideHost` over the whole (app) stack.
 */
export function RideOverlays({ session }: { session: RideSession }) {
  const { active: receivedSos, target: sosTarget } = useReceiverSos();
  const insets = useSafeAreaInsets();
  // Home's ride view draws the pinned SOS banner itself (with the rest of its banner stack).
  const rideViewShown = useRideViewStore((s) => s.shown);
  const {
    rideId,
    child,
    status,
    rideLive,
    solo,
    isLeader,
    hasStop,
    stopInfo,
    navOn,
    voiceOn,
    canRename,
    ride,
    menuOpen,
    setMenuOpen,
    renameOpen,
    setRenameOpen,
    afterMenu,
    confirm,
    setConfirm,
    working,
    openInvite,
    shareCode,
    doLeave,
    doEnd,
    doClearStop,
    doRename,
    mySosOn,
    myPos,
    myFixAtMs,
  } = session;

  const inLobby = status === 'lobby';
  const sosWarning = mySosOn ? ` ${copy['sos.leaveWarning']}` : '';
  const leaveTitle = inLobby ? copy['lobby.leaveTitle'] : copy['live.leaveTitle'];
  const leaveBody = (inLobby ? copy['lobby.leaveBody'] : copy['live.leaveBody']) + sosWarning;
  const endTitle = inLobby ? copy['lobby.cancelTitle'] : solo ? copy['nav.endTitleSolo'] : copy['live.endTitle'];
  const endBody = (inLobby ? copy['lobby.cancelBody'] : solo ? copy['nav.endBodySolo'] : copy['live.endBody']) + sosWarning;
  const endConfirm = inLobby ? copy['lobby.cancelConfirm'] : copy['live.endConfirm'];
  const endMenuLabel = inLobby ? copy['lobby.cancelRide'] : copy['live.menuEnd'];
  const leaveMenuLabel = inLobby ? copy['lobby.leave'] : copy['live.menuLeave'];
  const leaveConfirm = inLobby ? copy['lobby.leaveConfirm'] : copy['live.leaveConfirm'];

  // My SOS panel covers a ride screen only: it pushes the contacts screen, which must stay reachable.
  const senderVisible = rideLive && !!rideId && child !== null;
  // A rider's SOS reaches me wherever I am in the app: the channel stays open on Home now, and the takeover
  // never pushes a screen (its one link opens the maps app).
  const takeoverVisible = rideLive && !!rideId;

  return (
    <>
      {/* My own SOS panel (11 §5); the receiver takeover below is drawn on top of it. */}
      {senderVisible && rideId ? <SosSenderPanel rideId={rideId} /> : null}

      {/* Receiver SOS takeover: covers header and survives navigation inside the ride and back to Home. */}
      {takeoverVisible && rideId ? <SosTakeover rideId={rideId} target={sosTarget} /> : null}

      {/* A dismissed SOS stays pinned on Home and other screens; ride screens show it in the ride layout. */}
      {takeoverVisible && (child === null || (RIDE_ON_HOME && child === 'live' && !rideViewShown)) && receivedSos.length > 0 && !sosTarget ? (
        <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingTop: insets.top }}>
          <SosPinnedBanner active={receivedSos} />
        </View>
      ) : null}

      <Sheet visible={menuOpen} onClose={() => setMenuOpen(false)} onDismiss={afterMenu.onDismiss} hideClose>
        <SheetActionList>
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
          {canRename ? (
            <SheetAction
              icon="edit"
              label={copy['rename.menu']}
              onPress={() => {
                setMenuOpen(false);
                afterMenu.schedule(() => setRenameOpen(true));
              }}
            />
          ) : null}
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
        </SheetActionList>
      </Sheet>

      {canRename && renameOpen ? (
        <RenameRideSheet
          current={ride?.name.trim() ?? ''}
          speedMps={myPos?.speedMps ?? null}
          fixAtMs={myFixAtMs}
          onSave={doRename}
          onCancel={() => setRenameOpen(false)}
        />
      ) : null}

      <ConfirmSheet
        visible={confirm === 'clearStop'}
        title={solo ? t('nav.stopTitle', { place: stopInfo?.name ?? '' }) : copy['stop.clearTitle']}
        body={solo ? copy['nav.stopBody'] : undefined}
        confirmLabel={solo ? copy['nav.stopConfirm'] : copy['stop.clearConfirm']}
        cancelLabel={solo ? copy['nav.stopCancel'] : copy['stop.clearCancel']}
        tone={solo ? 'primary' : 'danger'}
        loading={working}
        loadingLabel={solo ? copy['nav.stopping'] : copy['stop.clearing']}
        onCancel={() => !working && setConfirm(null)}
        onConfirm={() => void doClearStop()}
      />
      <ConfirmSheet
        visible={confirm === 'leave'}
        title={leaveTitle}
        body={leaveBody}
        confirmLabel={leaveConfirm}
        loading={working}
        loadingLabel={copy['live.leaving']}
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
        loadingLabel={inLobby ? copy['lobby.cancelling'] : copy['live.ending']}
        onCancel={() => !working && setConfirm(null)}
        onConfirm={() => void doEnd()}
      />
    </>
  );
}
