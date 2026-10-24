import { useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';

import { AppText } from '@/components/app-text';
import { BigButton } from '@/components/big-button';
import { Sheet } from '@/components/sheet';
import { useAfterModalClose } from '@/hooks/use-after-modal';
import { copy, errorText, t } from '@/lib/copy';
import { formatDistance } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { panelVariant } from '@/lib/live-chrome';
import { firstName } from '@/lib/names';
import type { Place } from '@/lib/place-search';
import { proposeStop, toRideError, type StopKind } from '@/lib/ride-api';
import { STOP_ADDRESS_MAX, STOP_NAME_MAX, stopKindFor } from '@/lib/solo-nav';
import { rideStop } from '@/lib/stop-ui';
import { track } from '@/lib/telemetry';
import { useLiveUiStore } from '@/store/live-ui-store';
import { useRecentsStore } from '@/store/recents-store';
import { useRideStore } from '@/store/ride-store';
import { showToast } from '@/store/toast-store';
import { space } from '@/theme/tokens';

interface StopPickSheetProps {
  rideId: string;
  /** The place picked from the stop search; null = closed. */
  picked: Place | null;
  /** The sheet was dismissed without choosing (nothing is sent). */
  onClose: () => void;
  /** A stop was set or proposed and the sheet has finished closing: the search goes away (a screen change waits for the sheet). */
  onDone: () => void;
}

/**
 * What a picked place does in a live ride (19 A, 21 §2.10): in a group ride the leader sets the stop at once and a rider
 * sends the leader a proposal; in a ride of one there is one button, "Go here". Shared by the stop search screen and the
 * inline stop search on Home's map. Never writes the ride directly: `propose_stop` is the one RPC.
 */
export function StopPickSheet({ rideId, picked, onClose, onDone }: StopPickSheetProps) {
  const ride = useRideStore((s) => s.ride);
  const loaded = useRideStore((s) => s.loaded);
  const members = useRideStore((s) => s.members);
  const myUserId = useRideStore((s) => s.myUserId);
  const isLeader = !!ride && !!myUserId && ride.leader_id === myUserId;
  const leaderName = ride ? members[ride.leader_id]?.name : undefined;
  const activeCount = useMemo(() => Object.values(members).filter((m) => !m.leftAt).length, [members]);
  // Solo "Go here" sets my own stop, so it needs me to be the leader. Alone but not the leader (the leader is
  // gone): the group sheet, where I can only send the leader a proposal, instead of a button that proposes to nobody.
  const solo = panelVariant(loaded, activeCount) === 'solo' && isLeader;
  const currentStop = useMemo(() => rideStop(ride), [ride]);
  const [sending, setSending] = useState<StopKind | null>(null);
  const afterSheet = useAfterModalClose();

  const submit = async (kind: StopKind) => {
    if (!picked || sending) return;
    setSending(kind);
    try {
      const stop = {
        name: picked.name.slice(0, STOP_NAME_MAX),
        address: picked.address.slice(0, STOP_ADDRESS_MAX),
        lat: picked.lat,
        lng: picked.lng,
        kind,
        category: picked.category,
      };
      const result = await proposeStop(rideId, stop);
      haptic('success');
      // The new destination shows on the live screen at once; realtime later says the same.
      if (result.applied) useRideStore.getState().applyOwnStop(rideId, stop);
      if (solo && result.applied) {
        useRecentsStore.getState().add(picked);
        track('nav.started', { from: 'in_ride' });
      }
      onClose();
      // Android drops a screen change while the sheet is still closing: leave once it has gone.
      afterSheet.schedule(() => {
        // A solo rider keeps following the road: the camera is not framed on the stop (21 decision 4).
        if (result.applied) {
          if (!solo) useLiveUiStore.getState().focusStop();
        } else {
          showToast(t('stop.toastSent', { name: firstName(leaderName ?? '') || 'the leader' }));
        }
        onDone();
      });
    } catch (e) {
      showToast(errorText(toRideError(e).code));
    } finally {
      setSending(null);
    }
  };

  return (
    <Sheet visible={picked !== null} onClose={() => !sending && onClose()} onDismiss={afterSheet.onDismiss} hideClose>
      {picked ? (
        <>
          <AppText variant="heading" numberOfLines={2}>
            {picked.name}
          </AppText>
          {picked.address ? <AppText muted>{picked.address}</AppText> : null}
          {picked.distanceM != null ? (
            <AppText muted numeric>
              {t('search.away', { km: formatDistance(picked.distanceM) })}
            </AppText>
          ) : null}
          {solo ? (
            <>
              {currentStop ? (
                <AppText variant="caption" muted numberOfLines={2} style={styles.replaces}>
                  {t('nav.replaces', { place: currentStop.name })}
                </AppText>
              ) : null}
              <BigButton
                label={copy['nav.goHere']}
                icon="navigate"
                loading={sending !== null}
                onPress={() => void submit(stopKindFor(picked.category))}
              />
            </>
          ) : (
            <>
              <BigButton
                label={isLeader ? copy['stop.leaderBreak'] : copy['stop.riderBreak']}
                icon="coffee"
                loading={sending === 'break'}
                disabled={sending === 'destination'}
                onPress={() => void submit('break')}
              />
              <BigButton
                label={isLeader ? copy['stop.leaderDestination'] : copy['stop.riderDestination']}
                icon="endRide"
                variant="secondary"
                loading={sending === 'destination'}
                disabled={sending === 'break'}
                onPress={() => void submit('destination')}
              />
            </>
          )}
        </>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  replaces: { marginBottom: space.xs },
});
