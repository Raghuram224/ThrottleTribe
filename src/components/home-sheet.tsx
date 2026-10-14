import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type AccessibilityActionEvent, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { copy } from '@/lib/copy';
import { haptic } from '@/lib/haptics';
import { settleHomeSnap, toggleHomeSnap, type HomeSnap } from '@/lib/plan-flow';
import { elevate, family, font, motion, radius, size, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

interface HomeSheetProps {
  snap: HomeSnap;
  onSnapChange: (snap: HomeSnap) => void;
  /** Header text: the greeting, or the first-run welcome. */
  title: string;
  /** Visible height right now. Owned by the parent so the map controls follow it; this component animates it. */
  visible: SharedValue<number>;
  /** The expanded sheet stops here (8 dp under the search bar, 22 §3.1.1). */
  maxHeight: number;
  /** Always visible, under the header. */
  peek: ReactNode;
  /** Under the peek block; reached by expanding. */
  expanded: ReactNode;
  /**
   * The map attribution, shown in a footer row above the gesture inset while the sheet is expanded (it reaches up
   * under the search bar, where a pill on the map would float against the bar). Null = none (peek: it is on the map).
   */
  attribution?: string | null;
  /** The two resting heights, once measured (the parent's camera padding follows them). */
  onHeights: (heights: { peek: number; expanded: number }) => void;
}

/**
 * Two-snap bottom sheet of the map home (22 §3.1.1). Mechanics copied from the live group sheet: only the
 * header takes the drag, so the body keeps its own scrolling; release settles by velocity; Reduce Motion
 * snaps without animation; every drag has a tap equivalent (header, chevron) and a screen-reader action.
 */
export function HomeSheet({ snap, onSnapChange, title, visible, maxHeight, peek, expanded, attribution, onHeights }: HomeSheetProps) {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const [peekBlockH, setPeekBlockH] = useState(0);
  const [expandedBlockH, setExpandedBlockH] = useState(0);

  // Header + the peek block, then the gesture inset (the body is clipped above it, so the inset sits after the
  // last row visible in either snap and the expanded blocks never show through it), then the expanded blocks.
  const attrRow = attribution ? space.xl : 0;
  const peekH = size.sheetHeader + peekBlockH + insets.bottom;
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
    if (e.nativeEvent.actionName === 'increment') onSnapChange('expanded');
    else if (e.nativeEvent.actionName === 'decrement') onSnapChange('peek');
  };
  const isExpanded = snap === 'expanded';

  const onPeekLayout = (e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height);
    setPeekBlockH((prev) => (prev === h ? prev : h));
  };
  const onExpandedLayout = (e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height);
    setExpandedBlockH((prev) => (prev === h ? prev : h));
  };

  return (
    <Reanimated.View style={[styles.sheet, { backgroundColor: colors.surfaceRaised }, elevate('e3', scheme), sheetStyle]}>
      <GestureDetector gesture={pan}>
        <View style={styles.header}>
          <View pointerEvents="none" style={[styles.grabber, { backgroundColor: colors.borderStrong }]} />
          <Pressable
            accessibilityRole="adjustable"
            accessibilityLabel={copy['homeMap.sheetA11y']}
            accessibilityValue={{ text: `${isExpanded ? copy['live.sheetValueExpanded'] : copy['live.sheetValueCollapsed']}. ${title}` }}
            accessibilityActions={[
              { name: 'increment', label: copy['live.sheetExpandA11y'] },
              { name: 'decrement', label: copy['live.sheetCollapseA11y'] },
            ]}
            onAccessibilityAction={onA11yAction}
            onPress={toggle}
            style={styles.titlePress}>
            <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.title, { color: colors.text }]}>
              {title}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isExpanded ? copy['live.sheetCollapseA11y'] : copy['live.sheetExpandA11y']}
            onPress={toggle}
            style={styles.chevron}>
            <Icon name={isExpanded ? 'chevronDown' : 'chevronUp'} color={colors.textMuted} size={24} />
          </Pressable>
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
          <View onLayout={onPeekLayout} style={{ paddingBottom: space.sm }}>
            {peek}
          </View>
          <View
            onLayout={onExpandedLayout}
            style={{ paddingBottom: space.lg }}
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

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  header: { height: size.sheetHeader, flexDirection: 'row', alignItems: 'center' },
  grabber: { position: 'absolute', top: 6, alignSelf: 'center', left: '50%', marginLeft: -20, width: 40, height: 4, borderRadius: 2 },
  titlePress: { flex: 1, height: size.sheetHeader, justifyContent: 'center', paddingLeft: space.lg },
  title: { fontSize: font.md, lineHeight: 22, fontFamily: family.semibold },
  chevron: { width: size.sheetHeader, height: size.sheetHeader, alignItems: 'center', justifyContent: 'center' },
  bodyClip: { overflow: 'hidden' },
  body: { flex: 1 },
  attribution: { position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  attributionText: { fontSize: font.xs, lineHeight: 16, fontFamily: family.regular },
});
