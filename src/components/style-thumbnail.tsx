import { StyleSheet, View } from 'react-native';

import { palette, resolveTokens, resolveTraits, type Scheme, type ThemeStyle } from '@/theme/tokens';

const W = 157;
const H = 212;

/**
 * A tiny Live screen drawn from the tokens of `style` in `scheme` (17 §4), so the picker shows what the
 * app will really look like, light or dark. Pure Views, 157 x 212 design size, scaled to the card width.
 * Non-interactive and hidden from screen readers.
 */
export function StyleThumbnail({ style, scheme, width }: { style: ThemeStyle; scheme: Scheme; width: number }) {
  const t = resolveTokens(style, scheme);
  const traits = resolveTraits(style);
  const dot = traits.meMarker === 'dot';
  const scale = width / W;
  const bar = (w: number, h: number, color: string, extra?: object) => (
    <View style={[{ width: w, height: h, borderRadius: h / 2, backgroundColor: color }, extra]} />
  );

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ width, height: H * scale, borderRadius: 12, overflow: 'hidden' }}>
      <View style={[styles.canvas, { backgroundColor: t.bg, transform: [{ scale }] }]}>
        {/* header */}
        <View style={[styles.header, { backgroundColor: t.surfaceRaised }]}>
          {bar(6, 8, t.text)}
          <View style={styles.titles}>
            {bar(40, 4, t.text)}
            {bar(26, 3, t.textMuted)}
          </View>
          <View style={[styles.seg, { backgroundColor: t.surface, borderRadius: traits.segRadius > 20 ? 7 : 4 }]}>
            <View style={[styles.segThumb, { backgroundColor: t.segThumb, borderRadius: traits.segThumbRadius > 20 ? 6 : 3 }]} />
          </View>
        </View>
        {/* convoy */}
        <View style={[styles.convoy, { backgroundColor: t.surfaceRaised }]}>
          <View style={[styles.track, { backgroundColor: t.trackLine }]} />
          {t.convoyBand !== 'transparent' ? <View style={[styles.band, { backgroundColor: t.convoyBand }]} /> : null}
          <View style={[styles.rider, { left: 14, backgroundColor: palette.rider[3] }]} />
          <View style={[styles.rider, { left: 112, backgroundColor: palette.rider[1] }]} />
          <View style={[styles.rider, { left: 128, backgroundColor: palette.rider[0] }]} />
          {dot ? (
            <View style={[styles.meDot, { left: 71, backgroundColor: t.meMarker, borderColor: t.meRing }]} />
          ) : (
            <View style={[styles.meDisc, { left: 69, backgroundColor: t.meRing }]}>
              <View style={[styles.meArrow, { backgroundColor: t.meMarker }]} />
            </View>
          )}
        </View>
        {/* map */}
        <View style={[styles.map, { backgroundColor: t.mapPreviewLand }]}>
          <View style={[styles.park, { backgroundColor: t.mapPreviewPark }]} />
          <View style={[styles.water, { backgroundColor: t.mapPreviewWater }]} />
          {/* Each road is a 5 dp edge under a 3 dp fill: white on the pale land alone is 1.05:1 and vanishes (24 §1.7). */}
          {[
            { top: 20, left: -10, width: 190, height: 3, rotate: '8deg' },
            { top: 62, left: -10, width: 190, height: 3, rotate: '-6deg' },
            { top: 40, left: 90, width: 120, height: 3, rotate: '90deg' },
          ].map((r) => (
            <View key={`${r.top}-${r.left}`}>
              <View style={[styles.road, { top: r.top - 1, left: r.left, width: r.width, height: 5, transform: [{ rotate: r.rotate }], backgroundColor: t.mapPreviewRoadEdge }]} />
              <View style={[styles.road, { top: r.top, left: r.left, width: r.width, height: r.height, transform: [{ rotate: r.rotate }], backgroundColor: t.mapPreviewRoad }]} />
            </View>
          ))}
          <View style={[styles.major, { backgroundColor: t.mapPreviewMajor }]} />
          <View style={[styles.route, { height: 8, backgroundColor: t.routeCasing }]} />
          <View style={[styles.route, { height: 5, top: 49, backgroundColor: t.routeLine }]} />
          <View style={[styles.rider, { left: 38, top: 56, backgroundColor: palette.rider[3] }]} />
          <View style={[styles.rider, { left: 118, top: 30, backgroundColor: palette.rider[0] }]} />
          {dot ? (
            <>
              <View style={[styles.halo, { backgroundColor: t.meHalo, borderColor: t.meMarker }]} />
              <View style={[styles.meDot, { left: 73, top: 46, backgroundColor: t.meMarker, borderColor: t.meRing, width: 14, height: 14, borderRadius: 7 }]} />
            </>
          ) : (
            <View style={[styles.meDisc, { left: 72, top: 43, width: 18, height: 18, borderRadius: 9, backgroundColor: t.meRing }]}>
              <View style={[styles.meArrow, { backgroundColor: t.meMarker }]} />
            </View>
          )}
        </View>
        {/* rows */}
        {[0, 1].map((i) => (
          <View key={i} style={[styles.row, { backgroundColor: t.surfaceRaised, borderBottomColor: t.border }]}>
            <View style={[styles.rowDot, { backgroundColor: palette.rider[i === 0 ? 0 : 3] }]} />
            <View style={styles.rowTexts}>
              {bar(i === 0 ? 38 : 30, 5, t.text)}
              {bar(22, 3, t.textMuted)}
            </View>
            {i === 1 ? <View style={[styles.stopped, { backgroundColor: palette.status.stopped }]} /> : bar(18, 3, t.textSubtle)}
          </View>
        ))}
        {/* action bar: identical in every style */}
        <View style={[styles.actionBar, { backgroundColor: t.surfaceRaised }]}>
          <View style={[styles.msg, { backgroundColor: t.surface }]} />
          <View style={[styles.sos, { backgroundColor: palette.status.sosStrong }]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { width: W, height: H, transformOrigin: 'top left' },
  header: { height: 22, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8 },
  titles: { flex: 1, gap: 2 },
  seg: { width: 28, height: 12, padding: 1.5 },
  segThumb: { width: 12, height: 9 },
  convoy: { height: 22 },
  track: { position: 'absolute', left: 10, right: 10, top: 10, height: 2, borderRadius: 1 },
  band: { position: 'absolute', left: 18, width: 120, top: 10, height: 2 },
  rider: { position: 'absolute', top: 6, width: 10, height: 10, borderRadius: 5 },
  meDot: { position: 'absolute', top: 5, width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  meDisc: { position: 'absolute', top: 4, width: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  meArrow: { width: 6, height: 6, borderRadius: 1, transform: [{ rotate: '45deg' }] },
  map: { height: 96, overflow: 'hidden' },
  park: { position: 'absolute', left: 8, top: 66, width: 44, height: 24, borderRadius: 5 },
  water: { position: 'absolute', right: -10, top: -6, width: 50, height: 34, borderRadius: 14 },
  road: { position: 'absolute', height: 3 },
  major: { position: 'absolute', left: -10, top: 78, width: 190, height: 5, transform: [{ rotate: '-2deg' }] },
  route: { position: 'absolute', left: -6, width: 170, top: 47.5, borderRadius: 4, transform: [{ rotate: '-14deg' }] },
  halo: { position: 'absolute', left: 60, top: 33, width: 40, height: 40, borderRadius: 20, borderWidth: 1 },
  row: { height: 22, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  rowDot: { width: 12, height: 12, borderRadius: 6 },
  rowTexts: { flex: 1, gap: 2 },
  stopped: { width: 26, height: 9, borderRadius: 5 },
  actionBar: { height: 28, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6 },
  msg: { width: 26, height: 20, borderRadius: 5 },
  sos: { flex: 1, height: 20, borderRadius: 5 },
});
