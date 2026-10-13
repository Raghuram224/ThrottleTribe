import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { markerLiftStyle } from '@/components/marker-lift';
import { useTheme } from '@/theme/use-theme';

const PIN = 28;
const RING = 2.5;
const lift = markerLiftStyle();

/** Summary route pins (16 §4): start = `circle-double`, finish = chequered flag; 28 dp with a white ring. Colours are style tokens. */
export function RoutePin({ kind }: { kind: 'start' | 'end' }) {
  const { colors } = useTheme();
  const start = kind === 'start';
  return (
    <View
      pointerEvents="none"
      style={[
        styles.pin,
        lift,
        { backgroundColor: start ? colors.pinStartBg : colors.pinEndBg, borderColor: colors.markerOutline },
      ]}>
      <Icon name={start ? 'startPin' : 'endRide'} color={start ? colors.pinStartFg : colors.pinEndFg} size={start ? 18 : 16} />
    </View>
  );
}

const styles = StyleSheet.create({
  pin: {
    width: PIN + RING * 2,
    height: PIN + RING * 2,
    borderRadius: (PIN + RING * 2) / 2,
    borderWidth: RING,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
