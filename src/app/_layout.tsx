// Side-effect import: defineTask must run at bundle load, including headless background launches.
import '@/lib/location/background-task';
import '@/lib/web/netinfo-config';

import * as Notifications from '@/lib/notifications';
import { router, Stack, usePathname, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AppText } from '@/components/app-text';
import { BigButton } from '@/components/big-button';
import { Screen } from '@/components/screen';
import { ToastHost } from '@/components/toast-host';
import { useAppFonts } from '@/hooks/use-app-fonts';
import { copy } from '@/lib/copy';
import { setLastAppState } from '@/lib/location/ride-config';
import { href } from '@/lib/nav';
import { initTelemetry, reportError, setScreen, track } from '@/lib/telemetry';
import { useSessionStore } from '@/store/session-store';

// Keep the native splash up until Inter is ready (no text swap on first paint).
void SplashScreen.preventAutoHideAsync().catch(() => {});

// Telemetry: install crash handlers once at bundle load, not in render.
initTelemetry();

// Telemetry: Expo Router renders this when a screen throws while rendering.
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    reportError(error, { kind: 'render' });
    track('error.shown');
  }, [error]);

  return (
    <Screen footer={<BigButton label={copy['common.tryAgain']} onPress={() => void retry()} />}>
      <AppText variant="title">Something went wrong</AppText>
      <AppText muted>The problem was reported. Try again, or restart the app if it keeps happening.</AppText>
    </Screen>
  );
}

export default function RootLayout() {
  const init = useSessionStore((s) => s.init);
  const pathname = usePathname();
  const fontsReady = useAppFonts();

  useEffect(() => {
    if (fontsReady) void SplashScreen.hideAsync().catch(() => {});
  }, [fontsReady]);

  useEffect(() => init(), [init]);

  // Telemetry: record screen changes.
  useEffect(() => setScreen(pathname), [pathname]);

  // The headless location task cannot observe AppState reliably on Android, so the UI process records it.
  useEffect(() => {
    setLastAppState(AppState.currentState);
    const subscription = AppState.addEventListener('change', setLastAppState);
    return () => subscription.remove();
  }, []);

  // Tapping a ride notification opens that ride (the ride layout redirects to the right child).
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const rideId = response.notification.request.content.data?.rideId;
      if (typeof rideId === 'string') router.navigate(href(`/ride/${rideId}/live`));
    });
    return () => sub.remove();
  }, []);

  if (!fontsReady) return null;

  return (
    // Gesture Handler needs one root view above everything that uses gestures (the live rider sheet).
    <GestureHandlerRootView style={styles.root}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
      <ToastHost />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
