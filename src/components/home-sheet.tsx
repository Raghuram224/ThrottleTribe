import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type AccessibilityActionEvent, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { copy } from '@/lib/copy';
import { haptic } from '@/lib/haptics';
import { homeStripHeight, settleHomeSnap, toggleHomeSnap, type HomeSnap } from '@/lib/plan-flow';
import { elevate, family, font, motion, radius, size, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

interface HomeSheetProps {
  snap: HomeSnap;
  onSnapChange: (snap: HomeSnap) => void;
  /** The strip's one line: the greeting, or the first-run welcome. */
  title: string;
  /**
   * A ride is open: the strip's line is a compact "Back to <ride>" row that opens the ride (tapping elsewhere on the strip,
   * the grab handle, or dragging still expands it).
   */
  resume?: { label: string; a11yLabel: string; onPress: () => void };
  /** "Join with a code": a compact pill at the right end of the title strip. Omitted while a ride is open (no resume row has it). */
  onJoin?: () => void;
  /** Visible height right now. Owned by the parent so the map controls follow it; this component animates it. */
  visible: SharedValue<number>;
  /** The expanded sheet stops here (8 dp under the search bar, 22 §3.1.1). */
  maxHeight: number;
  /** Everything but the strip: ride card, recent places and so on, reached by pulling the strip up. */
  expanded: ReactNode;
  /**
   * The map attribution, shown in a footer row above the gesture inset while the sheet is expanded (it reaches up
   * under the search bar, where a pill on the map would float against the bar). Null = none (peek: it is on the map).
   * One line per `\n` (the licence line, plus the terrain credit while Terrain is on, 25 §5.1).
   */
  attribution?: string | null;
  /** The two resting heights (the strip, and the expanded sheet once measured); the parent's camera padding follows them. */
  onHeights: (heights: { peek: number; expanded: number }) => void;
}

/**
 * Two-snap bottom sheet of the map home (22 §3.1.1, 28). Collapsed it is a thin strip, a grab handle and one line, like
 * Google Maps' "Explore" strip; tapping or pulling it up shows everything. Mechanics copied from the live group sheet:
 * only the strip takes the drag, so the body keeps its own scrolling; release settles by velocity; Reduce Motion snaps
 * without animation; every drag has a tap equivalent (the strip) and a screen-reader action.
 */
export function HomeSheet({ snap, onSnapChange, title, resume, onJoin, visible, maxHeight, expanded, attribution, onHeights }: HomeSheetProps) {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const [expandedBlockH, setExpandedBlockH] = useState(0);

  // The strip, then the gesture inset (the body is clipped above it, so the inset sits after the last row visible in
  // either snap and the expanded blocks never show through it), then the expanded blocks.
  // 8 + 16 a line (24 for one, as the map pill).
  const attrRow = attribution ? space.sm + 16 * attribution.split('\n').length : 0;
  const peekH = homeStripHeight(insets.bottom);
  const contentH = peekH + expandedBlockH + attrRow;
  const expandedH = Math.max(peekH, Math.min(contentH, maxHeight));
  const target = snap === 'expanded' ? expandedH : peekH;
  const canScroll = contentH > expandedH;

  useEffect(() => {
    onHeights({ peek: peekH, expanded: expandedH });
  }, [peekH, expandedH, onHeights]);

  const animateTo = useCallback(
    (h: number) => {
      visible.set(reduceMotion ? h : withTiming(h, { duration: motion.layout, easing: Easing.out(Easing.cubic) }));
    },
    [visible, reduceMotion],
  );
  useEffect(() => {
    animateTo(target);
  }, [target, animateTo]);

  const commit = useCallback(
    (h: number, velocityY: number) => {
      const next = settleHomeSnap({ visibleH: h, velocityY, peekH, expandedH });
      if (next === snap) {
        animateTo(target);
        return;
      }
      haptic('select');
      onSnapChange(next);
    },
    [peekH, expandedH, snap, target, animateTo, onSnapChange],
  );

  // Collapsing after scrolling must not leave the peek showing the middle of the list (scrolling is off there).
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    if (snap === 'peek') scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [snap]);

  const startH = useSharedValue(0);
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-10, 10])
        .failOffsetX([-40, 40])
        .onStart(() => {
          startH.set(visible.get());
        })
        .onUpdate((e) => {
          visible.set(Math.min(expandedH, Math.max(peekH, startH.get() - e.translationY)));
        })
        .onEnd((e) => {
          runOnJS(commit)(visible.get(), e.velocityY);
        }),
    [startH, visible, peekH, expandedH, commit],
  );

  // Height and offset come from one worklet (as the live sheet): the sheet is as tall as it can get and is
  // translated down until only `visible` dp show.
  const sheetStyle = useAnimatedStyle(() => {
    const v = visible.get();
    const h = Math.max(expandedH, v);
    return { height: h, transform: [{ translateY: h - v }] };
  });

  // The scroll viewport is what shows between the header and the footer: it follows the visible height, so the
  // inset (and the attribution row, expanded) is panel colour under the last row.
  const headerH = size.sheetHeader;
  const footerH = insets.bottom + (snap === 'expanded' ? attrRow : 0);
  const bodyStyle = useAnimatedStyle(() => ({ height: Math.max(0, visible.get() - headerH - footerH) }));
  const attributionStyle = useAnimatedStyle(() => ({ top: visible.get() - footerH }));

  const toggle = () => {
    haptic('select');
    onSnapChange(toggleHomeSnap(snap));
  };
  const onA11yAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'expand') onSnapChange('expanded');
    else if (e.nativeEvent.actionName === 'collapse') onSnapChange('peek');
  };
  const isExpanded = snap === 'expanded';
  const stripActions = [
    { name: 'expand', label: copy['homeMap.sheetExpandA11y'] },
    { name: 'collapse', label: copy['homeMap.sheetCollapseA11y'] },
  ];
  const stripHint = isExpanded ? copy['homeMap.sheetCollapseA11y'] : copy['homeMap.sheetExpandA11y'];

  const onExpandedLayout = (e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height);
    setExpandedBlockH((prev) => (prev === h ? prev : h));
  };

  return (
    <Reanimated.View style={[styles.sheet, { backgroundColor: colors.surfaceRaised }, elevate('e3', scheme), sheetStyle]}>
      <GestureDetector gesture={pan}>
        <View style={styles.header}>
          <View pointerEvents="none" style={[styles.grabber, { backgroundColor: colors.borderStrong }]} />
          {resume ? (
            <>
              {/* The handle is the expand control while a ride is open (the line below opens the ride). */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy['homeMap.sheetA11y']}
                accessibilityHint={stripHint}
                accessibilityActions={stripActions}
                onAccessibilityAction={onA11yAction}
                onPress={toggle}
                style={styles.handleZone}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={resume.a11yLabel}
                accessibilityActions={stripActions}
                onAccessibilityAction={onA11yAction}
                onPress={() => {
                  haptic('select');
                  resume.onPress();
                }}
                style={styles.resumeRow}>
                <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.title, { color: colors.text }]}>
                  {resume.label}
                </Text>
                <Icon name="chevronRight" color={colors.textMuted} size={24} />
              </Pressable>
            </>
          ) : (
            <View style={styles.titleRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy['homeMap.sheetA11y']}
                accessibilityValue={{ text: `${isExpanded ? copy['live.sheetValueExpanded'] : copy['live.sheetValueCollapsed']}. ${title}` }}
                accessibilityHint={stripHint}
                accessibilityActions={stripActions}
                onAccessibilityAction={onA11yAction}
                onPress={toggle}
                style={[styles.titlePress, onJoin ? { paddingRight: space.sm } : null]}>
                <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.title, { color: colors.text }]}>
                  {title}
                </Text>
              </Pressable>
              {onJoin ? (
                // The touch target is the full 56 dp strip height; the pill inside is smaller. The greeting truncates, never this.
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel={copy['homeMap.stripJoinA11y']}
                  hitSlop={{ left: space.sm, right: space.sm }}
                  onPress={() => {
                    haptic('select');
                    onJoin();
                  }}
                  style={styles.joinHit}>
                  {(pressed) => (
                    <View style={[styles.joinPill, { backgroundColor: colors.brandTint, opacity: pressed ? 0.85 : 1 }]}>
                      <Icon name="dialpad" color={colors.brandOnBg} size={20} />
                      <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.joinText, { color: colors.brandOnBg }]}>
                        {copy['homeMap.stripJoin']}
                      </Text>
                    </View>
                  )}
                </PressableScale>
              ) : null}
            </View>
          )}
        </View>
      </GestureDetector>
      <Reanimated.View style={[styles.bodyClip, bodyStyle]}>
        <ScrollView
          ref={scrollRef}
          style={styles.body}
          scrollEnabled={isExpanded && canScroll}
          bounces={false}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          <View
            onLayout={onExpandedLayout}
            style={{ paddingBottom: space.lg }}
            // Below the fold while collapsed: never focusable (a clipped "Clear recent places?" sliver was). It stays mounted,
            // because its height sizes the expanded sheet; `collapsable` keeps Android from flattening the view away with
            // the hiding props on it.
            collapsable={false}
            pointerEvents={isExpanded ? 'auto' : 'none'}
            accessibilityElementsHidden={!isExpanded}
            importantForAccessibility={isExpanded ? 'auto' : 'no-hide-descendants'}>
            {expanded}
          </View>
        </ScrollView>
      </Reanimated.View>
      {isExpanded && attribution ? (
        <Reanimated.View pointerEvents="none" style={[styles.attribution, { height: attrRow }, attributionStyle]}>
          <Text maxFontSizeMultiplier={1.3} style={[styles.attributionText, { color: colors.textMuted }]}>
            {attribution}
          </Text>
        </Reanimated.View>
      ) : null}
    </Reanimated.View>
  );
}

const HANDLE_ZONE = 24;

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  header: { height: size.sheetHeader },
  grabber: { position: 'absolute', top: 6, alignSelf: 'center', left: '50%', marginLeft: -20, width: 40, height: 4, borderRadius: 2 },
  // The whole strip is the button; the line sits below the handle.
  titleRow: { height: size.sheetHeader, flexDirection: 'row', alignItems: 'center' },
  titlePress: { flex: 1, height: size.sheetHeader, justifyContent: 'center', paddingTop: space.md, paddingLeft: space.lg, paddingRight: space.lg },
  // Full strip height is the touch target; the pill sits in the part below the handle, like the title.
  joinHit: { height: size.sheetHeader, justifyContent: 'center', paddingTop: space.md, paddingRight: space.lg },
  joinPill: { height: size.stripJoin, flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.md, borderRadius: radius.pill },
  joinText: { fontSize: font.sm, lineHeight: 20, fontFamily: family.semibold },
  // With a ride open: a 24 dp handle zone on top, the 32 dp resume row under it.
  handleZone: { height: HANDLE_ZONE },
  resumeRow: { height: size.sheetHeader - HANDLE_ZONE, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg },
  title: { flex: 1, fontSize: font.md, lineHeight: 22, fontFamily: family.semibold },
  bodyClip: { overflow: 'hidden' },
  body: { flex: 1 },
  attribution: { position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  attributionText: { fontSize: font.xs, lineHeight: 16, fontFamily: family.regular },
});
