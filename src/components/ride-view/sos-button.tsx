import { useState, type ReactNode } from 'react';

import { ConfirmSheet } from '@/components/confirm-sheet';
import { HoldButton } from '@/components/hold-button';
import { copy } from '@/lib/copy';
import { useLiveUiStore } from '@/store/live-ui-store';
import { useSosStore } from '@/store/sos-store';
import { showToast } from '@/store/toast-store';
import { timing } from '@/theme/tokens';

/** Action bar buttons (16 §2.4). */
export const ACTION_H = 64;

interface RideSosButtonProps {
  rideId: string;
  sosOn: boolean;
  /** Round form (a floating circle of this diameter); left out = the action bar's wide button. */
  round?: number;
  /** Screen readers cannot hold: they confirm in a sheet instead. */
  onA11yActivate: (which: 'send' | 'cancel') => void;
}

/**
 * The ride's group SOS (07, 11): hold 2 s to alert the group, or, while it is on, hold to cancel it. One body for the
 * live screen's action bar and the round circle in Home's ride view, so the hold and the screen-reader alternative behave
 * the same in both.
 */
export function RideSosButton({ rideId, sosOn, round, onA11yActivate }: RideSosButtonProps) {
  const setSosHolding = useLiveUiStore((s) => s.setSosHolding);
  return sosOn ? (
    <HoldButton
      tone="cancel"
      icon="close"
      label={copy['sos.cancelHold']}
      shortLabel={copy['live.sosCancelShort']}
      durationMs={timing.sosCancelHoldMs}
      round={round}
      flex={round ? undefined : 1}
      height={round ? undefined : ACTION_H}
      onComplete={() => void useSosStore.getState().cancel(rideId)}
      onEarlyRelease={() => showToast(copy['sos.holdHint'])}
      onHoldChange={setSosHolding}
      onA11yActivate={() => onA11yActivate('cancel')}
    />
  ) : (
    <HoldButton
      icon="sos"
      label={copy['live.sos']}
      shortLabel={copy['live.sosShort']}
      accessibilityLabel={copy['live.a11ySos']}
      round={round}
      flex={round ? undefined : 1}
      height={round ? undefined : ACTION_H}
      onComplete={() => useSosStore.getState().trigger(rideId)}
      onEarlyRelease={() => showToast(copy['sos.holdHint'])}
      onHoldChange={setSosHolding}
      onA11yActivate={() => onA11yActivate('send')}
    />
  );
}

/** The screen-reader confirm of the group SOS: `ask('send' | 'cancel')` opens it; `sheet` goes in the tree. */
export function useSosConfirm(rideId: string): { ask: (which: 'send' | 'cancel') => void; sheet: ReactNode } {
  const [which, setWhich] = useState<'send' | 'cancel' | null>(null);
  const confirm = () => {
    const picked = which;
    setWhich(null);
    if (picked === 'send') useSosStore.getState().trigger(rideId);
    else if (picked === 'cancel') void useSosStore.getState().cancel(rideId);
  };
  const sheet = (
    <ConfirmSheet
      visible={which !== null}
      title={which === 'cancel' ? copy['sos.cancelHold'] : copy['sos.a11yConfirm']}
      confirmLabel={which === 'cancel' ? copy['sos.cancelHold'] : copy['live.sos']}
      tone={which === 'cancel' ? 'primary' : 'danger'}
      onConfirm={confirm}
      onCancel={() => setWhich(null)}
    />
  );
  return { ask: setWhich, sheet };
}
