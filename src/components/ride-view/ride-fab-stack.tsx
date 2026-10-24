import { StyleSheet, View } from 'react-native';

import { FabCircle } from '@/components/fab-circle';
import { MapCircleButton } from '@/components/map-controls';
import { RideSosButton } from '@/components/ride-view/sos-button';
import { copy } from '@/lib/copy';
import { FAB_STACK } from '@/lib/plan-flow';
import type { RideStackItem } from '@/lib/ride-view';
import { elevate, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

interface RideFabStackProps {
  rideId: string;
  /** The circles to draw, top to bottom (`rideStackItems`). */
  items: readonly RideStackItem[];
  sosOn: boolean;
  onSosA11y: (which: 'send' | 'cancel') => void;
  onSearch: () => void;
  onMessage: () => void;
  /** Voice guidance (null while not navigating: no Speak). */
  voice: { on: boolean; onToggle: () => void } | null;
  fullMap: boolean;
  onToggleFullMap: () => void;
  overview: boolean;
  onFitAll: () => void;
}

/**
 * The ride view's floating stack, bottom right (28 §8), in the same look as Home's Search / SOS stack: 56 dp circles with
 * an icon and a word. Search (stops along the way), Speak (voice guidance, only while navigating), Message (group rides)
 * and SOS (the group SOS, hold 2 s, with its screen-reader confirm), under the two map view controls (full map, fit all).
 * Positioned inside the map chrome's overlay, so it rides the rider list's top edge with the other controls.
 */
export function RideFabStack({
  rideId,
  items,
  sosOn,
  onSosA11y,
  onSearch,
  onMessage,
  voice,
  fullMap,
  onToggleFullMap,
  overview,
  onFitAll,
}: RideFabStackProps) {
  const { colors, scheme } = useTheme();
  return (
    <View style={styles.stack} pointerEvents="box-none">
      {items.map((item) => {
        switch (item) {
          case 'fitAll':
            return (
              <MapCircleButton
                key={item}
                icon="fitPage"
                iconColor={overview ? colors.brandOnBg : colors.fabIcon}
                ring={overview ? colors.brandOnBg : 'transparent'}
                accessibilityLabel={copy['live.fitAllA11y']}
                accessibilityState={{ selected: overview }}
                onPress={onFitAll}
              />
            );
          case 'fullMap':
            return (
              <MapCircleButton
                key={item}
                icon={fullMap ? 'collapse' : 'expand'}
                accessibilityLabel={fullMap ? copy['live.exitFullMapA11y'] : copy['live.fullMapA11y']}
                onPress={onToggleFullMap}
              />
            );
          case 'message':
            return (
              <FabCircle
                key={item}
                icon="message"
                word={copy['live.msg']}
                accessibilityLabel={copy['rideFab.messageA11y']}
                onPress={onMessage}
              />
            );
          case 'search':
            return (
              <FabCircle
                key={item}
                icon="search"
                word={copy['homeFab.search']}
                accessibilityLabel={copy['rideFab.searchA11y']}
                accessibilityHint={copy['homeMap.searchHint']}
                onPress={onSearch}
              />
            );
          case 'speak':
            // Muted = the 2 dp ring + `selected` + the muted icon and word (never colour alone).
            return voice ? (
              <FabCircle
                key={item}
                icon={voice.on ? 'voiceOn' : 'voiceOff'}
                word={voice.on ? copy['rideFab.speak'] : copy['rideFab.speakMuted']}
                tint={voice.on ? colors.fabIcon : colors.brandOnBg}
                ring={voice.on ? 'transparent' : colors.brandOnBg}
                accessibilityLabel={voice.on ? copy['nav.a11yVoiceOn'] : copy['nav.a11yVoiceOff']}
                accessibilityHint={voice.on ? copy['nav.a11yVoiceOnHint'] : copy['nav.a11yVoiceOffHint']}
                accessibilityState={{ selected: !voice.on }}
                onPress={voice.onToggle}
              />
            ) : null;
          case 'sos':
            // The shadow needs its own round view: the hold button clips its progress fill.
            return (
              <View key={item} style={[styles.sosShadow, elevate('e2', scheme)]}>
                <RideSosButton rideId={rideId} sosOn={sosOn} round={FAB_STACK.size} onA11yActivate={onSosA11y} />
              </View>
            );
        }
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // Anchored like the live screen's view column: 12 dp from the right and from the overlay bottom.
  stack: { position: 'absolute', right: space.md, bottom: space.md, gap: FAB_STACK.gap, alignItems: 'center' },
  sosShadow: { width: FAB_STACK.size, height: FAB_STACK.size, borderRadius: FAB_STACK.size / 2 },
});
