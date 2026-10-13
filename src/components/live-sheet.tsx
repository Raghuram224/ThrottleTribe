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
  nextSnap,
  settleSnap,
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
  /** "5 riders · 1 SOS · 1 stopped" */
  summary: string;
  /** Next-stop card (56 dp, `STOP_CARD_H`) above the summary line; `heights` must account for it. */
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
 * Draggable rider panel over the full-screen map (18 §B). The sheet is `heights.expanded` tall and is
 * translated down so only `visible` dp show. Only the header (grabber, summary, pinned alerts) takes the
 * drag, so the rider list keeps its own scrolling. Snap by dragging, flinging, tapping the header or the
 * chevron, or with the screen-reader increment / decrement actions. Reduce motion snaps without animation.
 */
export function LiveSheet({ snap, onSnapChange, heights, visible, summary, stopCard, pinned, children }: LiveSheetProps) {
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

  const commit = useCallback(
    (h: number, velocityY: number) => {
      const next = settleSnap({ visibleH: h, velocityY, heights, from: snap });
      if (next === snap) {
        animateTo(heights[snap]);
        return;
      }
      haptic('select');
      onSnapChange(next);
    },
    [heights, snap, animateTo, onSnapChange],
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

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: maxH - visible.get() }] }));

  const cycle = () => {
    haptic('select');
    onSnapChange(nextSnap(snap));
  };
  const onA11yAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'increment') onSnapChange(stepSnap(snap, 1));
    else if (e.nativeEvent.actionName === 'decrement') onSnapChange(stepSnap(snap, -1));
  };

  const collapsed = snap === 'collapsed';
  const expanded = snap === 'expanded';

  return (
    <Reanimated.View
      style={[
        styles.sheet,
        { height: maxH, backgroundColor: colors.surfaceRaised },
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
              accessibilityLabel={expanded ? copy['live.sheetCollapseA11y'] : copy['live.sheetExpandA11y']}
              onPress={cycle}
              style={styles.chevron}>
              <Icon name={expanded ? 'chevronDown' : 'chevronUp'} color={colors.text} size={28} />
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
