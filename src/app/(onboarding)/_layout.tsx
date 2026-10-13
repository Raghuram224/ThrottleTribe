import { Stack } from 'expo-router';

import { ThemeStyleOverride } from '@/theme/use-theme';

export default function OnboardingLayout() {
  // Welcome and onboarding are always the Tribe style: the rider has not chosen anything yet and it is
  // the brand moment (17 §0.3).
  return (
    <ThemeStyleOverride value="tribe">
      {/* Welcome -> name slides up as a continuation of the hero; reduce motion = none (the OS setting is
          honoured by the native stack for 'fade_from_bottom'-style transitions as well). */}
      <Stack screenOptions={{ headerShown: false }}>
        {/* Welcome is the root of this stack: no back gesture, Android back exits the app. */}
        <Stack.Screen name="welcome" options={{ gestureEnabled: false }} />
        <Stack.Screen name="name" options={{ animation: 'fade_from_bottom' }} />
      </Stack>
    </ThemeStyleOverride>
  );
}
