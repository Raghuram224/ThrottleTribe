// Instruction text for the turn banner now and for voice later (docs/design/21 §3.4, §3.5). Pure, no React.
import { t, type CopyKey } from '@/lib/copy';
import { formatDistance } from '@/lib/format';
import type { IconName } from '@/lib/icon-names';
import { treatedAs, type ManeuverType, type Modifier, type NavStep } from '@/lib/nav-steps';

/** Banner text: rendered as `primary` + (road ? ' ' + road : ''). `road` is the connector phrase ("onto MG Road"). */
export interface BannerText {
  primary: string;
  road: string | null;
}

// ---------------------------------------------------------------- road names

const firstToken = (s: string): string => s.split(';')[0]?.trim() ?? '';

/** The road as written on signs: first token of `ref` ("NH275;NH948" -> "NH275"), else the name, else ''. */
export function roadLabel(step: Pick<NavStep, 'ref' | 'name'>): string {
  return firstToken(step.ref) || step.name.trim();
}

/** "NH275" -> "N H 275" so a speech engine spells it. Tokens that do not look like a route number are unchanged. */
export function spellRef(token: string): string {
  const m = /^([A-Z]{1,4})[- ]?(\d+[A-Z]?)$/.exec(token.trim());
  return m ? `${m[1].split('').join(' ')} ${m[2]}` : token.trim();
}

/** The road as spoken: its name, else the spelled-out first ref. */
export function spokenRoad(step: Pick<NavStep, 'ref' | 'name'>): string {
  const name = step.name.trim();
  if (name) return name;
  const ref = firstToken(step.ref);
  return ref ? spellRef(ref) : '';
}

/** "NH48: Pune, Satara" -> "Pune" (text after the first ':', then the first comma-separated item). */
export function destinationOf(step: Pick<NavStep, 'destinations'>): string {
  const raw = step.destinations;
  const afterColon = raw.includes(':') ? raw.slice(raw.indexOf(':') + 1) : raw;
  return afterColon.split(',')[0]?.trim() ?? '';
}

// ---------------------------------------------------------------- modifier helpers

type Side = 'left' | 'right' | null;

function sideOf(mod: Modifier | null): Side {
  if (mod === null) return null;
  return mod.includes('left') ? 'left' : mod.includes('right') ? 'right' : null;
}

const isUturn = (step: NavStep) => step.modifier === 'uturn';

function turnBannerKey(mod: Modifier | null): CopyKey {
  switch (mod) {
    case 'left':
      return 'nav.v.turnLeft';
    case 'right':
      return 'nav.v.turnRight';
    case 'slight left':
      return 'nav.v.slightLeft';
    case 'slight right':
      return 'nav.v.slightRight';
    case 'sharp left':
      return 'nav.v.sharpLeft';
    case 'sharp right':
      return 'nav.v.sharpRight';
    case 'uturn':
      return 'nav.v.uturn';
    default:
      return 'nav.v.straight';
  }
}

/** "left", "slightly right", "sharp left"; '' when the modifier has no side. */
function dirWord(mod: Modifier | null): string {
  switch (mod) {
    case 'left':
      return t('nav.say.dirLeft');
    case 'right':
      return t('nav.say.dirRight');
    case 'slight left':
      return t('nav.say.dirSlightLeft');
    case 'slight right':
      return t('nav.say.dirSlightRight');
    case 'sharp left':
      return t('nav.say.dirSharpLeft');
    case 'sharp right':
      return t('nav.say.dirSharpRight');
    default:
      return '';
  }
}

/** "Turn left", "Turn slightly right", "Go straight", "Make a U-turn". */
function turnVoice(mod: Modifier | null): string {
  if (mod === 'uturn') return t('nav.say.uturn');
  const dir = dirWord(mod);
  return dir ? t('nav.say.turn', { dir }) : t('nav.say.straight');
}

function sideWord(mod: Modifier | null): string {
  const side = sideOf(mod);
  return side === 'left' ? t('nav.say.sideLeft') : side === 'right' ? t('nav.say.sideRight') : '';
}

const ORD_KEYS = (prefix: 'nav.ord.' | 'nav.sayOrd.', n: number): CopyKey => `${prefix}${n}` as CopyKey;

/** "3rd exit", or "exit 12" past ten. */
function exitBanner(n: number): string {
  return n <= 10 ? t('nav.exit.ord', { o: t(ORD_KEYS('nav.ord.', n)) }) : t('nav.ord.n', { n });
}

// ---------------------------------------------------------------- connector

type Connector = { kind: 'onto' | 'stayOn'; road: string } | { kind: 'towards'; place: string } | null;

function connectorFor(step: NavStep, as: ManeuverType, road: string): Connector {
  if (as === 'arrive' || isUturn(step)) return null;
  if ((as === 'roundabout' || as === 'rotary') && step.exit === null) return null;
  if ((as === 'on ramp' || as === 'off ramp') && step.destinations) {
    const place = destinationOf(step);
    if (place) return { kind: 'towards', place };
  }
  if (!road) return null;
  return { kind: as === 'continue' ? 'stayOn' : 'onto', road };
}

function connectorText(c: Connector): string | null {
  if (!c) return null;
  if (c.kind === 'towards') return t('nav.towards', { place: c.place });
  return t(c.kind === 'stayOn' ? 'nav.stayOn' : 'nav.onto', { road: c.road });
}

// ---------------------------------------------------------------- banner

function bannerPrimary(step: NavStep, as: ManeuverType): string {
  if (as !== 'arrive' && as !== 'roundabout' && as !== 'rotary' && isUturn(step)) return t('nav.v.uturn');
  switch (as) {
    case 'fork':
    case 'continue': {
      const side = sideOf(step.modifier);
      // `continue` with a hard turn reads as a turn; a slight one (and every fork) as "keep".
      if (as === 'continue' && step.modifier !== 'slight left' && step.modifier !== 'slight right') {
        return t(turnBannerKey(step.modifier));
      }
      return side ? t(side === 'left' ? 'nav.v.keepLeft' : 'nav.v.keepRight') : t('nav.v.straight');
    }
    case 'merge': {
      const side = sideOf(step.modifier);
      return side ? t(side === 'left' ? 'nav.v.mergeLeft' : 'nav.v.mergeRight') : t('nav.v.merge');
    }
    case 'on ramp':
      return t('nav.v.ramp');
    case 'off ramp':
      return step.exits ? t('nav.v.exitNumber', { n: step.exits }) : t('nav.v.exit');
    case 'roundabout':
    case 'rotary':
      if (step.exit === null) return t('nav.v.roundaboutEnter');
      // A named rotary reads "2nd exit" here and "· Hardinge Circle" in the road part (see bannerText).
      return as === 'rotary' && step.rotaryName ? exitBanner(step.exit) : t('nav.v.roundabout', { e: exitBanner(step.exit) });
    case 'arrive': {
      const side = sideOf(step.modifier);
      return t(side === 'left' ? 'nav.v.arriveLeft' : side === 'right' ? 'nav.v.arriveRight' : 'nav.v.arriveAhead');
    }
    default:
      // turn, end of road, roundabout turn: the modifier's own wording.
      return t(turnBannerKey(step.modifier));
  }
}

/** Banner wording for an announced step. `short` (the "Then" row) is the primary only. */
export function bannerText(step: NavStep, opts: { short?: boolean } = {}): BannerText {
  const as = treatedAs(step);
  const primary = bannerPrimary(step, as);
  if (opts.short) return { primary, road: null };
  const onto = connectorText(connectorFor(step, as, roadLabel(step)));
  if (as === 'rotary' && step.exit !== null && step.rotaryName) {
    const via = t('nav.v.rotaryName', { name: step.rotaryName });
    return { primary, road: onto ? `${via} ${onto}` : via };
  }
  return { primary, road: onto };
}

// ---------------------------------------------------------------- voice

function voiceBase(step: NavStep, as: ManeuverType, place: string): string {
  if (as !== 'arrive' && as !== 'roundabout' && as !== 'rotary' && isUturn(step)) return t('nav.say.uturn');
  switch (as) {
    case 'end of road': {
      const dir = dirWord(step.modifier);
      return dir ? t('nav.say.endOfRoad', { dir }) : turnVoice(step.modifier);
    }
    case 'fork': {
      const side = sideOf(step.modifier);
      return side
        ? t('nav.say.fork', { dir: t(side === 'left' ? 'nav.say.dirLeft' : 'nav.say.dirRight') })
        : t('nav.say.straight');
    }
    case 'continue': {
      const side = sideOf(step.modifier);
      if ((step.modifier === 'slight left' || step.modifier === 'slight right') && side) {
        return t('nav.say.keep', { dir: t(side === 'left' ? 'nav.say.dirLeft' : 'nav.say.dirRight') });
      }
      return turnVoice(step.modifier);
    }
    case 'merge': {
      const side = sideOf(step.modifier);
      return side ? t(side === 'left' ? 'nav.say.mergeLeft' : 'nav.say.mergeRight') : t('nav.say.merge');
    }
    case 'on ramp':
      return t('nav.say.ramp', { side: sideWord(step.modifier) });
    case 'off ramp':
      return step.exits ? t('nav.say.exitNumber', { n: step.exits }) : t('nav.say.exit', { side: sideWord(step.modifier) });
    case 'roundabout':
    case 'rotary': {
      if (step.exit === null) return t('nav.say.roundaboutEnter');
      const named = as === 'rotary' && step.rotaryName;
      if (step.exit > 10) {
        return named
          ? t('nav.say.rotaryN', { name: step.rotaryName, n: step.exit })
          : t('nav.say.roundaboutN', { n: step.exit });
      }
      const ow = t(ORD_KEYS('nav.sayOrd.', step.exit));
      return named ? t('nav.say.rotary', { name: step.rotaryName, ow }) : t('nav.say.roundabout', { ow });
    }
    case 'roundabout turn': {
      const dir = dirWord(step.modifier);
      return dir ? t('nav.say.roundaboutTurn', { dir }) : turnVoice(step.modifier);
    }
    case 'arrive': {
      const side = sideOf(step.modifier);
      return t(side === 'left' ? 'nav.say.arriveLeft' : side === 'right' ? 'nav.say.arriveRight' : 'nav.say.arriveAhead', {
        place,
      });
    }
    default:
      return turnVoice(step.modifier);
  }
}

/** Voice wording in the "now" form: "Turn left onto MG Road". The road part is dropped with `withRoad: false`. */
export function voiceText(step: NavStep, place: string, opts: { withRoad?: boolean } = {}): string {
  const as = treatedAs(step);
  const base = voiceBase(step, as, place);
  if (opts.withRoad === false) return base;
  const road = connectorText(connectorFor(step, as, spokenRoad(step)));
  return road ? `${base} ${road}` : base;
}

// ---------------------------------------------------------------- icon

function arrowFor(mod: Modifier | null): IconName {
  switch (mod) {
    case 'left':
      return 'turnLeft';
    case 'right':
      return 'turnRight';
    case 'slight left':
      return 'slightLeft';
    case 'slight right':
      return 'slightRight';
    case 'sharp left':
      return 'sharpLeft';
    case 'sharp right':
      return 'sharpRight';
    default:
      return 'straight';
  }
}

/**
 * Banner glyph (§3.4). Roundabouts follow the driving side (left = clockwise), a U-turn crosses the oncoming lane
 * (left-hand traffic turns right), arrive is the flag, merge its own glyph; the rest use the modifier's arrow.
 */
export function maneuverIcon(step: NavStep): IconName {
  const as = treatedAs(step);
  if (as === 'arrive') return 'endRide';
  if (as === 'roundabout' || as === 'rotary') return step.drivingSide === 'left' ? 'roundaboutCw' : 'roundaboutCcw';
  if (isUturn(step)) return step.drivingSide === 'left' ? 'uturnRight' : 'uturnLeft';
  if (as === 'merge') return 'merge';
  return arrowFor(step.modifier);
}

// ---------------------------------------------------------------- distance

/** Banner line 1 (§3.5): "Now" under 15 m, 10 m steps under 100 m, then the app's distance format. */
export function formatManeuverDistance(m: number): string {
  if (!Number.isFinite(m) || m < 15) return t('nav.now');
  if (m < 100) return `${Math.round(m / 10) * 10} m`;
  return formatDistance(m);
}

/** Voice distance (§3.5): nearest 50 m under 200, 100 m under 1 km, 0.5 km under 10 km, whole km above. */
export function spokenDistance(m: number): string {
  const d = Math.max(0, Number.isFinite(m) ? m : 0);
  if (d < 200) return t('nav.say.metres', { n: Math.max(50, Math.round(d / 50) * 50) });
  if (d < 1000) {
    const n = Math.round(d / 100) * 100;
    if (n < 1000) return t('nav.say.metres', { n });
    return t('nav.say.km1');
  }
  if (d < 10_000) {
    const km = Math.round(d / 500) / 2;
    if (km === 1) return t('nav.say.km1');
    return t('nav.say.km', { n: km });
  }
  return t('nav.say.km', { n: Math.round(d / 1000) });
}
