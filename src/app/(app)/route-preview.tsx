import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { View } from 'react-native';

import { href } from '@/lib/nav';
import { parsePreviewParams } from '@/lib/preview-params';
import { usePlanStore } from '@/store/plan-store';
import { useTheme } from '@/theme/use-theme';

/**
 * The route preview is Home's `route` mode now (22 §5.4). Old links and bookmarks
 * (`/route-preview?id&name&address&lat&lng&category`) land here, set the plan and go to Home; bad params go
 * to Home with nothing set. Nothing is shown (the map home mounts under this screen for the one frame).
 */
export default function RoutePreviewRedirect() {
  const { colors } = useTheme();
  const params = useLocalSearchParams();
  const place = useMemo(() => parsePreviewParams(params), [params]);
  useEffect(() => {
    if (place) usePlanStore.getState().openRoute(place, 'recent');
    // SDK 57: dismisses screens until Home is reached, or replaces this one when it is not in the stack.
    router.dismissTo(href('/home'));
  }, [place]);
  return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
}
