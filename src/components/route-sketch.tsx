import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { sketchPoints, sketchSegments, type SketchPoint } from '@/lib/route-sketch';
import { radius } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

const BOX = 56;
const PAD = 10;
const LINE = 3;
const DOT = 8;

/**
 * 56 dp route-shape tile for Recent rides (16 §3). Pure Views: each segment is a bar rotated about
 * its centre, joints get 3 dp dots, start is a hollow ink dot and the end a filled one. Without a
 * sketch (never opened on this phone) the tile shows a flag glyph instead. Memoised.
 */
export const RouteSketch = memo(function RouteSketch({ points }: { points: readonly SketchPoint[] | null }) {
  const { colors, scheme } = useTheme();
  const geometry = useMemo(
    () => (points ? { segments: sketchSegments(points, BOX, PAD), joints: sketchPoints(points, BOX, PAD) } : null),
    [points],
  );
  const ink = scheme === 'dark' ? colors.paper : colors.ink;

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[styles.tile, { backgroundColor: colors.surface }]}>
      {geometry ? (
        <>
          {geometry.segments.map((s, i) => (
            <View
              key={i}
              style={[
                styles.segment,
                {
                  left: s.cx - s.length / 2,
                  top: s.cy - LINE / 2,
                  width: s.length,
                  backgroundColor: colors.routeLine,
                  transform: [{ rotate: `${s.angleDeg}deg` }],
                },
              ]}
            />
          ))}
          {geometry.joints.slice(1, -1).map((p, i) => (
            <View key={`j${i}`} style={[styles.joint, { left: p.x - LINE / 2, top: p.y - LINE / 2, backgroundColor: colors.routeLine }]} />
          ))}
          <View
            style={[
              styles.end,
              { left: geometry.joints[0].x - DOT / 2, top: geometry.joints[0].y - DOT / 2, borderColor: ink, backgroundColor: colors.surface },
            ]}
          />
          <View
            style={[
              styles.end,
              {
                left: geometry.joints[geometry.joints.length - 1].x - DOT / 2,
                top: geometry.joints[geometry.joints.length - 1].y - DOT / 2,
                borderColor: ink,
                backgroundColor: ink,
              },
            ]}
          />
        </>
      ) : (
        <View style={styles.glyph}>
          <Icon name="endRide" color={colors.textMuted} size={24} />
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  tile: { width: BOX, height: BOX, borderRadius: radius.md + 2, overflow: 'hidden' },
  segment: { position: 'absolute', height: LINE, borderRadius: LINE / 2 },
  joint: { position: 'absolute', width: LINE, height: LINE, borderRadius: LINE / 2 },
  end: { position: 'absolute', width: DOT, height: DOT, borderRadius: DOT / 2, borderWidth: 2 },
  glyph: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
