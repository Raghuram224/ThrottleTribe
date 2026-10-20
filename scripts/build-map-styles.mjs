// Builds the tuned map styles shipped in the app (docs/design/24 §1.2).
//   node scripts/build-map-styles.mjs            fetch the upstream OpenFreeMap styles, tune, write assets/map-styles/*.json
//   node scripts/build-map-styles.mjs --dir DIR  read liberty.json / dark.json / sprite.json from DIR instead of the network
// Needs Node 22.18+ (runs src/lib/map-style-tune.ts directly with built-in type stripping) and network access to
// tiles.openfreemap.org unless --dir is given. Outputs are committed; run again when upgrading the upstream styles.
// sources, sprite and glyphs are left as upstream: tiles, sprites and fonts still come from OpenFreeMap.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { iconsUsed, tuneStyleWithReport, UPSTREAM_STYLE_URL } from '../src/lib/map-style-tune.ts';

const root = new URL('..', import.meta.url).pathname;
const out = join(root, 'assets', 'map-styles');
const dirFlag = process.argv.indexOf('--dir');
const dir = dirFlag > -1 ? process.argv[dirFlag + 1] : null;
const localName = { 'tt-liberty': 'liberty.json', 'tt-dark': 'dark.json' };

const readJson = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
};

mkdirSync(out, { recursive: true });
let failed = false;
for (const id of ['tt-liberty', 'tt-dark']) {
  let upstream;
  if (dir) {
    upstream = JSON.parse(readFileSync(join(dir, localName[id]), 'utf8'));
  } else {
    upstream = await readJson(UPSTREAM_STYLE_URL[id]);
  }
  const { style, report } = tuneStyleWithReport(upstream, id);
  const sprite = new Set(Object.keys(dir ? JSON.parse(readFileSync(join(dir, 'sprite.json'), 'utf8')) : await readJson(`${style.sprite}.json`)));
  // A missing sprite image draws nothing (this is how upstream Dark's forests vanished). Fail on any image our tuning
  // introduced; images upstream already lacks are reported, since they are not ours to fix here.
  const inherited = new Set(iconsUsed(upstream));
  const lacking = iconsUsed(style).filter((name) => !sprite.has(name));
  const missingIcons = lacking.filter((name) => !inherited.has(name));
  const upstreamIcons = lacking.filter((name) => inherited.has(name));
  writeFileSync(join(out, `${id}.json`), `${JSON.stringify(style, null, 2)}\n`);
  console.log(`${id}: ${style.layers.length} layers`);
  console.log(`  removed (${report.removed.length}): ${report.removed.join(', ') || '-'}`);
  console.log(`  changed (${report.changed.length}): ${report.changed.join(', ') || '-'}`);
  console.log(`  added (${report.added.length}): ${report.added.join(', ') || '-'}`);
  console.log(`  sprite images used: ${iconsUsed(style).length}, missing from the sprite: ${lacking.length}`);
  if (upstreamIcons.length) console.warn(`  (upstream already asks for images the sprite lacks: ${upstreamIcons.join(', ')})`);
  if (missingIcons.length) {
    failed = true;
    console.warn(`  MISSING sprite images (a tuned layer would draw no icon): ${missingIcons.join(', ')}`);
  }
  if (report.missing.length) {
    failed = true;
    console.warn(`  MISSING upstream layers (the style changed, update src/lib/map-style-tune.ts): ${report.missing.join(', ')}`);
  }
}
if (failed) process.exitCode = 1;
