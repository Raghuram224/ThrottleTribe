import { rideBack, type RideBackAction, type RideBackState } from '@/lib/plan-flow';
import { RIDE_ON_HOME } from '@/lib/ride-on-home';
import { useLiveUiStore } from '@/store/live-ui-store';
import { usePlanStore } from '@/store/plan-store';
import { usePrefsStore } from '@/store/prefs-store';
import { useRideViewStore } from '@/store/ride-view-store';

/** What is open on Home's ride view right now, read from the stores (the decision itself is the pure `rideBack`). */
export function currentRideBackState(): RideBackState {
  const live = useLiveUiStore.getState();
  const plan = usePlanStore.getState();
  return {
    rideView: RIDE_ON_HOME && !!live.viewRideId,
    stopSearch: RIDE_ON_HOME && !!live.viewRideId && plan.mode === 'search' && plan.searchContext === 'ride-stop',
    riderSelected: !!live.selectedUserId,
    fullMap: live.fullMap,
    stripOpen: useRideViewStore.getState().stripOpen,
  };
}

/** Does one step of Back in the ride view. False = nothing to do here (Home's own Back, then the OS, decide). */
export function runRideBack(): boolean {
  const action: RideBackAction | null = rideBack(currentRideBackState());
  if (!action) return false;
  const live = useLiveUiStore.getState();
  switch (action) {
    case 'close-stop-search':
      usePlanStore.getState().back();
      break;
    case 'clear-selection':
      live.clear();
      break;
    case 'exit-full-map':
      live.setFullMap(false);
      break;
    case 'collapse-strip':
      usePrefsStore.getState().setLiveSheetSnap('collapsed');
      break;
    case 'system':
      // Nothing left to step out of: the OS backgrounds the app and the ride keeps running.
      return false;
  }
  return true;
}
