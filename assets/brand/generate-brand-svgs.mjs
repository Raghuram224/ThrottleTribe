import fs from 'node:fs';
const OUT = process.argv[2];
const ORANGE = '#F97316', ORANGE_HI = '#FB923C', ORANGE_LO = '#EA580C', INK = '#0B0F14';
const k = 160 / 272; // slope of the notch edges
const r = (n) => Math.round(n * 10) / 10;
// Mark geometry on a 1024 grid. Arrowhead T(512,192) L(240,832) N(512,672) R(784,832),
// split into a leader (half-size arrow) and two wing riders. G = vertical gap, g = centre gap, s = rounding stroke.
function mark({ G = 90, g = 80 } = {}) {
  const lead = [[512, 192], [648, 512], [512, 432], [376, 512]];
  const t = (240 + G) / 480;
  const p1 = [512 - 272 * t, 192 + 640 * t];
  const cx = 512 - g / 2;
  const p2 = [cx, 432 + G + k * (g / 2)];
  const p3 = [cx, 672 + k * (g / 2)];
  const left = [p1, p2, p3, [240, 832]];
  const right = left.map(([x, y]) => [1024 - x, y]);
  const d = (pts) => 'M' + pts.map(([x, y]) => `${r(x)} ${r(y)}`).join(' L') + ' Z';
  return { lead: d(lead), left: d(left), right: d(right) };
}
function markGroup({ fill, leadFill = fill, transform = '', s = 28, G, g }) {
  const m = mark({ G, g });
  const st = (c) => s ? ` stroke="${c}" stroke-width="${s}" stroke-linejoin="round"` : '';
  return `<g${transform ? ` transform="${transform}"` : ''}>
    <path d="${m.lead}" fill="${leadFill}"${st(leadFill)}/>
    <path d="${m.left}" fill="${fill}"${st(fill)}/>
    <path d="${m.right}" fill="${fill}"${st(fill)}/>
  </g>`;
}
const svg = (w, h, body, title) => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <title>${title}</title>
  ${body}
</svg>
`;
const grad = `<defs>
    <linearGradient id="tt-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${ORANGE_HI}"/>
      <stop offset="1" stop-color="${ORANGE_LO}"/>
    </linearGradient>
  </defs>`;
// Optical centre: shift up 18 so the heavy wings do not make the mark sit low.
const centred = (scale, cy = 530) => `translate(512 512) scale(${scale}) translate(-512 -${cy})`;
// Safe-zone centre (equal distance tip/wings to centre, 570) for circular masks.
const files = {
  'logo-mark.svg': svg(1024, 1024, markGroup({ fill: INK, leadFill: ORANGE, transform: centred(1.18) }), 'Throttle Tribe mark'),
  'logo-mark-mono.svg': svg(1024, 1024, markGroup({ fill: INK, transform: centred(1.18) }), 'Throttle Tribe mark, one colour'),
  'logo-mark-on-dark.svg': svg(1024, 1024, `<rect width="1024" height="1024" fill="${INK}"/>` + markGroup({ fill: '#F9FAFB', leadFill: ORANGE, transform: centred(1.18) }), 'Throttle Tribe mark on dark'),
  'app-icon.svg': svg(1024, 1024, grad + `<rect width="1024" height="1024" fill="url(#tt-bg)"/>` + markGroup({ fill: INK, transform: centred(0.86) }), 'Throttle Tribe app icon'),
  'adaptive-foreground.svg': svg(1024, 1024, markGroup({ fill: INK, transform: centred(0.72, 570) }), 'Throttle Tribe adaptive icon foreground'),
  'adaptive-background.svg': svg(1024, 1024, grad + `<rect width="1024" height="1024" fill="url(#tt-bg)"/>`, 'Throttle Tribe adaptive icon background'),
  'monochrome.svg': svg(1024, 1024, markGroup({ fill: '#000000', transform: centred(0.72, 570) }), 'Throttle Tribe themed icon'),
  'splash-icon.svg': svg(1024, 1024, markGroup({ fill: INK, transform: centred(1.08) }), 'Throttle Tribe splash (on orange)'),
  'splash-icon-dark.svg': svg(1024, 1024, markGroup({ fill: '#F9FAFB', leadFill: ORANGE, transform: centred(1.08) }), 'Throttle Tribe splash (on dark)'),
  // Favicon: wider gaps, thinner rounding, bigger mark so the split survives at 16-32 px.
  'favicon.svg': svg(1024, 1024, `<rect width="1024" height="1024" rx="200" fill="${ORANGE}"/>` + markGroup({ fill: INK, transform: centred(1.04, 524), G: 130, g: 120, s: 20 }), 'Throttle Tribe'),
};
// ---- Wordmark: hand-drawn geometric monoline letters, stroke 20, cap 100 (y 0..100), x-height top 30.
const L = {
  T: { w: 64, d: 'M0 10 H64 M32 10 V100' },
  h: { w: 68, d: 'M10 0 V100 M10 64 A24 24 0 0 1 58 64 V100' },
  r: { w: 48, d: 'M10 30 V100 M10 64 A24 24 0 0 1 34 40 H48' },
  o: { w: 70, circle: [35, 65, 25] },
  t: { w: 46, d: 'M20 6 V100 M0 40 H46' },
  l: { w: 20, d: 'M10 0 V100' },
  e: { w: 70, d: 'M10 65 H60 A25 25 0 1 0 52.7 82.7' },
  i: { w: 20, d: 'M10 30 V100', dot: [10, 9, 11] },
  b: { w: 70, d: 'M10 0 V100', circle: [35, 65, 25] },
};
function word(text, x0, track, kern = {}) {
  let x = x0; const parts = [];
  [...text].forEach((ch, i) => {
    const g = L[ch];
    const pair = text[i - 1] ? text[i - 1] + ch : '';
    if (i) x += track + (kern[pair] ?? 0);
    let s = '';
    if (g.d) s += `<path d="${g.d}"/>`;
    if (g.circle) s += `<circle cx="${g.circle[0]}" cy="${g.circle[1]}" r="${g.circle[2]}"/>`;
    if (g.dot) s += `<circle cx="${g.dot[0]}" cy="${g.dot[1]}" r="${g.dot[2]}" fill="currentColor" stroke="none"/>`;
    parts.push(`<g transform="translate(${x} 0)">${s}</g>`);
    x += g.w;
  });
  return { svg: parts.join(''), end: x };
}
function wordmark(inkWord1, inkWord2, markFill, markLead, bg) {
  const kern = { Th: -4, hr: 0, ro: -2, ot: -2, tt: -2, tl: 0, le: 0, Tr: -14, ri: 0, ib: 0, be: 0 };
  const w1 = word('Throttle', 0, 10, kern);
  const w2 = word('Tribe', w1.end + 34, 10, kern);
  const textW = w2.end;
  // Layout: mark 160 tall box, text cap height 100 scaled 0.9 -> 90, gap 40.
  const markBox = 168, gap = 44, scaleT = 0.92, pad = 24;
  const H = markBox + pad * 2;
  const W = pad + markBox + gap + textW * scaleT + pad;
  const ty = pad + (markBox - 100 * scaleT) / 2 + 6;
  const style = (c) => `fill="none" stroke="${c}" stroke-width="20" stroke-linecap="butt" stroke-linejoin="round" color="${c}"`;
  const body = `${bg ? `<rect width="${r(W)}" height="${H}" fill="${bg}"/>` : ''}
  <g transform="translate(${pad} ${pad}) scale(${markBox / 1024})">${markGroup({ fill: markFill, leadFill: markLead, transform: centred(1.18) })}</g>
  <g transform="translate(${r(pad + markBox + gap)} ${r(ty)}) scale(${scaleT})">
    <g ${style(inkWord1)}>${w1.svg}</g>
    <g ${style(inkWord2)}>${w2.svg}</g>
  </g>`;
  return svg(Math.ceil(W), H, body, 'Throttle Tribe');
}
files['logo-wordmark.svg'] = wordmark(INK, ORANGE_LO, INK, ORANGE);
files['logo-wordmark-dark.svg'] = wordmark('#F9FAFB', ORANGE, '#F9FAFB', ORANGE, INK);
for (const [n, c] of Object.entries(files)) fs.writeFileSync(`${OUT}/${n}`, c);
console.log(Object.keys(files).join('\n'));
