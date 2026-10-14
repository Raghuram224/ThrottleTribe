// What the turn banner shows for a BannerModel: icon, texts and the screen-reader label (docs/design/21 §2.5,
// §2.7, §7). Pure, so every state is a unit test and the component only draws.
import { t } from '@/lib/copy';
import { formatDistance } from '@/lib/format';
import type { IconName } from '@/lib/icon-names';
import { bannerText, formatManeuverDistance, maneuverIcon, spokenDistance, voiceText } from '@/lib/nav-instructions';
import type { BannerModel } from '@/lib/nav-engine';

export interface BannerView {
  /** blue = guidance and routing states; grey (`status.offline`) = "no data" states only. Never amber. */
  tone: 'blue' | 'grey';
  icon: IconName;
  /** noRoute: the compass arrow turned toward the destination (degrees clockwise). */
  iconRotateDeg: number;
  /** Line 1: the maneuver distance (36 bold) in guide and noRoute, a short status (20 semibold) otherwise. */
  line1: string;
  line1Big: boolean;
  /** Line 2: `primary` + (road ? ' ' + road : ''). In status states it is the sub line and `road` is null. */
  primary: string;
  road: string | null;
  /** Status states: line 2 is the quiet 16 sub line, not the 20 semibold instruction. */
  line2Sub: boolean;
  /** The "Then" row (guide only). */
  then: { icon: IconName; text: string } | null;
  a11y: string;
  /** What a tap does, for the screen reader's hint (guide only: it repeats the instruction). Not part of the label. */
  a11yHint: string | null;
}

const lowerFirst = (s: string): string => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/** Degrees clockwise 0..360 for a compass arrow on a map turned by `mapBearing`. */
export function relativeBearing(toDestDeg: number, mapBearing: number): number {
  return (((toDestDeg - mapBearing) % 360) + 360) % 360;
}

export function describeBanner(model: BannerModel, opts: { place: string; mapBearing: number }): BannerView {
  const base = { iconRotateDeg: 0, line1Big: false, road: null, line2Sub: true, then: null, a11yHint: null };
  switch (model.kind) {
    case 'starting': {
      const line1 = t('nav.starting');
      const primary = t('nav.startingSub');
      return { ...base, tone: 'blue', icon: 'navigate', line1, primary, a11y: `${line1}. ${primary}` };
    }
    case 'toRoad': {
      const line1 = t('nav.toRoad');
      const primary = t('nav.toRoadSub');
      return { ...base, tone: 'blue', icon: 'navigate', line1, primary, a11y: `${line1}. ${primary}` };
    }
    case 'noRoute': {
      const line1 =
        model.straightM !== null ? t('stop.cardDistanceApprox', { km: formatDistance(model.straightM) }) : t('nav.noRouteSub');
      const primary = t('nav.noRouteSub');
      return {
        ...base,
        tone: 'blue',
        icon: 'navigation',
        iconRotateDeg: model.bearingDeg === null ? 0 : relativeBearing(model.bearingDeg, opts.mapBearing),
        line1,
        line1Big: model.straightM !== null,
        primary,
        a11y: `${line1}. ${primary}`,
      };
    }
    case 'rerouting': {
      const line1 = t('nav.rerouting');
      const primary = t('nav.reroutingSub');
      return { ...base, tone: 'blue', icon: 'reroute', line1, primary, a11y: `${line1}. ${primary}` };
    }
    case 'offlineOffRoute': {
      const line1 = t('nav.offRoute');
      const primary = t('nav.offRouteOfflineSub');
      return { ...base, tone: 'grey', icon: 'offline', line1, primary, a11y: `${line1}. ${primary}` };
    }
    case 'noGps': {
      const line1 = t('nav.noGps');
      const primary = t('nav.noGpsSub');
      return { ...base, tone: 'grey', icon: 'noGps', line1, primary, a11y: `${line1}. ${primary}` };
    }
    case 'guide': {
      const step = model.step;
      if (!step) return describeBanner({ ...model, kind: 'starting' }, opts);
      const { primary, road } = bannerText(step);
      const instruction = lowerFirst(voiceText(step, opts.place));
      const lead =
        model.distanceM < 15
          ? t('nav.a11yNow', { instruction })
          : t('nav.a11yIn', { distance: spokenDistance(model.distanceM), instruction });
      const thenStep = model.then;
      const then = thenStep ? { icon: maneuverIcon(thenStep), text: bannerText(thenStep, { short: true }).primary } : null;
      const thenA11y = thenStep ? t('nav.a11yThen', { instruction: lowerFirst(voiceText(thenStep, opts.place, { withRoad: false })) }) : '';
      return {
        tone: 'blue',
        icon: maneuverIcon(step),
        iconRotateDeg: 0,
        line1: formatManeuverDistance(model.distanceM),
        line1Big: true,
        primary,
        road,
        line2Sub: false,
        then,
        a11y: t('nav.a11yBanner', { instruction: lead, then: thenA11y }).trim(),
        a11yHint: t('nav.a11yBannerHint'),
      };
    }
  }
}

/**
 * The instruction to announce to a screen reader when the maneuver changes (not on every distance tick), or ''.
 * P3 only announces it while voice is muted, so nothing is spoken twice.
 */
export function maneuverAnnouncement(model: BannerModel | null, place: string): string {
  if (!model || model.kind !== 'guide' || !model.step) return '';
  return voiceText(model.step, place);
}
