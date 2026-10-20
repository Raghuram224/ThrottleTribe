import { useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type AccessibilityActionEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { copy } from '@/lib/copy';
import { haptic } from '@/lib/haptics';
import {
  isLastSnap,
  nextSnap,
  settleSnap,
  SOLO_TOP,
  SHEET_HEADER_H,
  stepSnap,
  type SheetSnap,
} from '@/lib/live-sheet';
import { elevate, family, font, motion, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

interface LiveSheetProps {
  snap: SheetSnap;
  onSnapChange: (snap: SheetSnap) => void;
  /** Visible height at each snap, in dp (`snapHeights`). */
  heights: Record<SheetSnap, number>;
  /**
   * Visible sheet height right now. Owned by the parent so the map's controls and camera padding can
   * follow it; this component animates it.
   */
  visible: SharedValue<number>;
  /** The snaps the sheet can rest at (`snapHeights`); the chevron and the gestures walk only these. */
  snaps: readonly SheetSnap[];
  /** `solo`: a fixed panel (stop card + children), no grabber, summary, chevron or drag (20 C4). */
  variant?: 'group' | 'solo';
  /** "5 riders · 1 SOS · 1 stopped" */
  summary: string;
  /** Next-stop card (64 dp, `STOP_CARD_H`) above the summary line; `heights` must account for it. */
  stopCard?: ReactNode;
  /** Alert rows kept in view while collapsed (SOS / stopped / offline, max 2). */
  pinned: ReactNode;
  /** The rider list. */
  children: ReactNode;
}

const VALUE_KEY = {
  collapsed: 'live.sheetValueCollapsed',
  half: 'live.sheetValueHalf',
  expanded: 'live.sheetValueExpanded',
} as const;

/**
 * Draggable rider panel over the full-screen map (18 §B, 20 C6). The sheet is at least `heights.expanded` tall (content-driven, capped at 85 %; it follows `visible` while that shrinks) and is
 * translated down so only `visible` dp show. Only the header (grabber, summary, pinned alerts) takes the
 * drag, so the rider list keeps its own scrolling. Snap by dragging, flinging, tapping the header or the
 * chevron, or with the screen-reader increment / decrement actions. Reduce motion snaps without animation.
 */
export function LiveSheet({
  snap,
  onSnapChange,
  heights,
  visible,
  snaps,
  variant = 'group',
  summary,
  stopCard,
  pinned,
  children,
}: LiveSheetProps) {
  const { colors, scheme } = useTheme();
  const reduceMotion = useReduceMotion();
  const startH = useSharedValue(0);
  const minH = heights.collapsed;
  const maxH = heights.expanded;
  const target = heights[snap];

  const animateTo = useCallback(
    (h: number) => {
      visible.set(reduceMotion ? h : withTiming(h, { duration: motion.layout, easing: Easing.out(Easing.cubic) }));
    },
    [visible, reduceMotion],
  );

  // Follows external changes: a snap chosen elsewhere, a new alert row (collapsed height), rotation.
  useEffect(() => {
    animateTo(target);
  }, [target, animateTo]);

  // The map's credit pill, controls and SOS ride on `visible` (overlayShift = -visible). When the sheet goes away (full map,
  // layout reset) the value must not stay at its last height, or they are left floating mid-map.
  useEffect(
    () => () => {
      visible.set(0);
    },
    [visible],
  );

  const commit = useCallback(
    (h: number, velocityY: number) => {
      const next = settleSnap({ visibleH: h, velocityY, heights, from: snap, snaps });
      if (next === snap) {
        animateTo(heights[snap]);
        return;
      }
      haptic('select');
      onSnapChange(next);
    },
    [heights, snap, snaps, animateTo, onSnapChange],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-10, 10])
        .failOffsetX([-40, 40])
        .onStart(() => {
          startH.set(visible.get());
        })
        .onUpdate((e) => {
          visible.set(Math.min(maxH, Math.max(minH, startH.get() - e.translationY)));
        })
        .onEnd((e) => {
          runOnJS(commit)(visible.get(), e.velocityY);
        }),
    [startH, visible, minH, maxH, commit],
  );

  // Height and offset come from one worklet: `maxH` jumps in a frame while `visible` eases over `motion.layout`,
  // so a static height would let the sheet lift off the action bar (translateY < 0) when content shrinks.
  const sheetStyle = useAnimatedStyle(() => {
    const v = visible.get();
    const h = Math.max(maxH, v);
    return { height: h, transform: [{ translateY: h - v }] };
  });

  const cycle = () => {
    haptic('select');
    onSnapChange(nextSnap(snap, snaps));
  };
  const onA11yAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'increment') onSnapChange(stepSnap(snap, 1, snaps));
    else if (e.nativeEvent.actionName === 'decrement') onSnapChange(stepSnap(snap, -1, snaps));
  };

  const collapsed = snap === 'collapsed';
  const atLast = isLastSnap(snap, snaps);

  if (variant === 'solo') {
    return (
      <Reanimated.View
        style={[
          styles.sheet,
          { backgroundColor: colors.surfaceRaised, paddingTop: SOLO_TOP },
          elevate('e3', scheme),
          sheetStyle,
        ]}>
        {stopCard}
        {children}
      </Reanimated.View>
    );
  }

  return (
    <Reanimated.View
      style={[
        styles.sheet,
        { backgroundColor: colors.surfaceRaised },
        elevate('e3', scheme),
        sheetStyle,
      ]}>
      <GestureDetector gesture={pan}>
        <View style={styles.header}>
          <View pointerEvents="none" style={[styles.grabber, { backgroundColor: colors.borderStrong }]} />
          {stopCard}
          <View style={styles.row}>
            <Pressable
              accessibilityRole="adjustable"
              accessibilityLabel={copy['live.sheetA11y']}
              accessibilityValue={{ text: `${copy[VALUE_KEY[snap]]}. ${summary}` }}
              accessibilityActions={[
                { name: 'increment', label: copy['live.sheetExpandA11y'] },
                { name: 'decrement', label: copy['live.sheetCollapseA11y'] },
              ]}
              onAccessibilityAction={onA11yAction}
              onPress={cycle}
              style={styles.summaryPress}>
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={1.3}
                style={[styles.summary, { color: colors.text }]}>
                {summary}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={atLast ? copy['live.sheetCollapseA11y'] : copy['live.sheetExpandA11y']}
              onPress={cycle}
              style={styles.chevron}>
              <Icon name={atLast ? 'chevronDown' : 'chevronUp'} color={colors.text} size={28} />
            </Pressable>
          </View>
          {collapsed ? pinned : null}
        </View>
      </GestureDetector>
      <View
        style={styles.body}
        accessibilityElementsHidden={collapsed}
        importantForAccessibility={collapsed ? 'no-hide-descendants' : 'auto'}>
        {children}
      </View>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  // Grabber 16 + summary row 56 = SHEET_HEADER_H.
  header: { paddingTop: SHEET_HEADER_H - 56 },
  grabber: {
    position: 'absolute',
    top: 8,
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  row: { height: 56, flexDirection: 'row', alignItems: 'center' },
  summaryPress: { flex: 1, height: 56, justifyContent: 'center', paddingLeft: space.lg },
  summary: { fontSize: font.md, lineHeight: 22, fontFamily: family.semibold },
  chevron: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 },
});
