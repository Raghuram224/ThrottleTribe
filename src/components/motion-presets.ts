import { Platform } from 'react-native';
import { Easing, FadeIn, FadeOut, Keyframe, LinearTransition, ReduceMotion } from 'react-native-reanimated';

import { motion } from '@/theme/tokens';

/**
 * Reanimated layout animations (16 §5). Every preset carries `ReduceMotion.System`, so with the OS
 * "Remove animations" on they resolve instantly. Disabled on web: layout animations there are not
 * verified in a browser, and the spec prefers no transition over a broken one.
 */
const enabled = Platform.OS !== 'web';
const ease = Easing.out(Easing.cubic);

export const rowLayout = enabled
  ? LinearTransition.duration(motion.layout).easing(ease).reduceMotion(ReduceMotion.System)
  : undefined;
export const rowEnter = enabled ? FadeIn.duration(motion.fast).reduceMotion(ReduceMotion.System) : undefined;
export const rowExit = enabled ? FadeOut.duration(120).reduceMotion(ReduceMotion.System) : undefined;
export const chipEnter = enabled
  ? new Keyframe({
      0: { opacity: 0, transform: [{ scale: 0.96 }] },
      100: { opacity: 1, transform: [{ scale: 1 }] },
    })
      .duration(motion.fast)
      .reduceMotion(ReduceMotion.System)
  : undefined;

/** Summary entrance (16 §5): the map fades in 300 ms, the sheet slides up 24 dp and fades, 320 ms. */
export const mapEnter = enabled ? FadeIn.duration(motion.slow).reduceMotion(ReduceMotion.System) : undefined;
export const sheetEnter = enabled
  ? new Keyframe({
      0: { opacity: 0, transform: [{ translateY: 24 }] },
      100: { opacity: 1, transform: [{ translateY: 0 }] },
    })
      .duration(motion.enter)
      .reduceMotion(ReduceMotion.System)
  : undefined;
/** Sheet panel (26 E2): opacity 0 to 1 and a 24 dp rise in 200 ms, ease-out; the Modal itself only fades. Instant under Reduce Motion. */
export const panelEnter = enabled
  ? new Keyframe({
      0: { opacity: 0, transform: [{ translateY: 24 }] },
      100: { opacity: 1, transform: [{ translateY: 0 }], easing: Easing.out(Easing.cubic) },
    })
      .duration(motion.base)
      .reduceMotion(ReduceMotion.System)
  : undefined;
/** Welcome (16 §1): hero fade 300; notification card slides down 12 dp and fades, 320 ms, after 500 ms. */
export const notifEnter = enabled
  ? new Keyframe({
      0: { opacity: 0, transform: [{ translateY: -12 }] },
      100: { opacity: 1, transform: [{ translateY: 0 }] },
    })
      .duration(motion.enter)
      .delay(500)
      .reduceMotion(ReduceMotion.System)
  : undefined;

/** Turn banner (21 §2.5): 150 ms fade plus an 8 dp slide down on entry, fade out on exit; instant under Reduce Motion. */
export const bannerEnter = enabled
  ? new Keyframe({
      0: { opacity: 0, transform: [{ translateY: -8 }] },
      100: { opacity: 1, transform: [{ translateY: 0 }] },
    })
      .duration(motion.fast)
      .reduceMotion(ReduceMotion.System)
  : undefined;
export const bannerExit = enabled ? FadeOut.duration(motion.fast).reduceMotion(ReduceMotion.System) : undefined;
