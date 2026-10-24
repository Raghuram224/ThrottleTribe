import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RideHeader } from '@/components/ride-header';
import { useRideBanners } from '@/components/ride/use-ride-banners';
import type { RideSession } from '@/components/ride/use-ride-session';
import { Screen } from '@/components/screen';
import { WebRideNotices } from '@/components/web-ride-notices';
import { RideActionsContext } from '@/hooks/use-ride-actions';
import { headerSearchVisible } from '@/lib/live-chrome';
import { href } from '@/lib/nav';
import { RIDE_ON_HOME } from '@/lib/ride-on-home';
import { useLiveUiStore } from '@/store/live-ui-store';
import { useRideSessionStore } from '@/store/ride-session-store';
import { useTheme } from '@/theme/use-theme';

/**
 * The ride container (00 §1): header, banner stack and the Stack of lobby / live / summary / invite / search.
 * The session itself (channel, tracking, keep-awake, redirects, actions, the SOS panels and the menu / confirm
 * sheets) is owned by `RideHost` in the (app) layout and arrives through the session store: exactly one
 * session, whether a ride screen or Home is in front. The banner stack comes from `useRideBanners`, shared with
 * Home's ride view. With the ride on Home's map the live screen is only a hand-off and shows no chrome.
 */
export default function RideLayout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = useRideSessionStore((s) => s.session);
  // The host publishes before paint; until it has this ride there is nothing to show (screens need the actions).
  if (!session || session.rideId !== id) return <Screen padded={false}>{null}</Screen>;
  return <RideChrome id={id} session={session} />;
}

function RideChrome({ id, session }: { id: string; session: RideSession }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { child, connection, netOffline, rideName, status, rideLive, openMenu, openSearch, actions } = session;
  const fullMap = useLiveUiStore((s) => s.fullMap);
  const { visible: visibleBanners, kept: keptBanners, approvalCards, meta } = useRideBanners(id, session);

  // Full map (19 B) hides the header and every banner except SOS and not-sharing; approval cards remain.
  const fullMapOn = fullMap && child === 'live' && rideLive;
  const floatingStack = fullMapOn ? [...keptBanners.slice(0, 3), ...approvalCards] : [];
  const floatingShown = floatingStack.length > 0;
  // The live screen offsets its own overlays by the floating stack's height.
  useEffect(() => {
    if (!floatingShown) useLiveUiStore.getState().setTopStackH(0);
  }, [floatingShown]);

  // The invite screen has its own top bar (10 §2); the stop search has its own back + input row; the live hand-off to
  // Home's map shows nothing while it redirects.
  const handOff = RIDE_ON_HOME && child === 'live';
  const showHeader = child !== 'summary' && child !== 'invite' && child !== 'search' && status !== 'ended' && !handOff;

  return (
    <RideActionsContext.Provider value={actions}>
      <Screen
        padded={false}
        // The status-bar band takes the header's colour and the nav-bar band the action bar's / footer's (26 L3).
        insetTopColor={showHeader && !fullMapOn ? colors.surfaceRaised : undefined}
        insetBottomColor={(child === 'live' && !handOff) || child === 'summary' ? colors.surfaceRaised : undefined}
        edgeToEdge={fullMapOn}
        top={
          handOff ? null : (
            <>
              {showHeader && !fullMapOn ? (
                <RideHeader
                  name={rideName}
                  meta={meta}
                  connection={connection}
                  netOffline={netOffline}
                  // Back leaves the ride screens, not the ride: tracking continues, Home shows the resume card.
                  onBack={() => (router.canGoBack() ? router.back() : router.replace(href('/home')))}
                  onMenu={openMenu}
                  onSearch={headerSearchVisible({ child, rideLive, connection }) ? openSearch : undefined}
                />
              ) : null}
              {fullMapOn ? null : visibleBanners}
              {fullMapOn ? null : approvalCards}
              {Platform.OS === 'web' && rideLive && !fullMapOn ? <WebRideNotices child={child} /> : null}
            </>
          )
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
    </RideActionsContext.Provider>
  );
}
