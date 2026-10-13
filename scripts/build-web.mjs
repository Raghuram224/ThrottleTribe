// Builds the web/PWA app into web/app/ (GitHub Pages: https://<user>.github.io/throttletribe/app/).
// `web.output` is "single" (dynamic routes like /ride/[id] cannot be pre-rendered), and in that
// mode Expo ignores src/app/+html.tsx, so the head tags are injected here. Keep HEAD in step with
// +html.tsx (which only takes effect if the output mode ever changes to "static").
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = '/throttletribe/app';
const root = new URL('..', import.meta.url).pathname;
const dist = join(root, 'dist');
const out = join(root, 'web', 'app');

if (!process.argv.includes('--skip-export')) {
  rmSync(dist, { recursive: true, force: true });
  execSync('npx expo export --platform web', { cwd: root, stdio: 'inherit' });
}

const css = `
html, body { height: 100%; overflow: hidden; }
/* position: fixed stops the document itself from scrolling (focus or a map gesture can shift it). */
body { margin: 0; position: fixed; inset: 0; width: 100%; background: #E9ECF0; overscroll-behavior: none; -webkit-text-size-adjust: 100%; }
#root { display: flex; height: 100%; width: 100%; max-width: 480px; margin: 0 auto; position: relative; background: #fff; transform: translateZ(0); }
@media (min-width: 600px) { #root { box-shadow: 0 0 0 1px rgba(11,15,20,0.06), 0 8px 32px rgba(11,15,20,0.12); } }
@media (prefers-color-scheme: dark) { body { background: #05070A; } #root { background: #0B0F14; box-shadow: 0 0 0 1px rgba(255,255,255,0.06); } }
[role="button"], button, a { cursor: pointer; }
[role="button"]:focus-visible, button:focus-visible, a:focus-visible, input:focus-visible { outline: 2px solid #F97316; outline-offset: 2px; }
@media (hover: hover) { [role="button"]:hover { opacity: 0.92; } }
`;

const HEAD = `
<meta name="theme-color" content="#F97316">
<link rel="manifest" href="${BASE}/manifest.webmanifest">
<link rel="icon" type="image/png" href="${BASE}/favicon.png">
<link rel="apple-touch-icon" href="${BASE}/apple-touch-icon.png">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Throttle Tribe">
<style id="tt-shell">${css}</style>
`;

let html = readFileSync(join(dist, 'index.html'), 'utf8');
html = html.replace(/<meta name="viewport"[^>]*>/, '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">');
html = html.replace(/<meta name="theme-color"[^>]*>/, '');
const fonts = [];
const findFonts = (dir) => {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) findFonts(p);
    else if (/Inter_(400Regular|600SemiBold|700Bold)\..*\.ttf$/.test(e.name)) fonts.push(p.slice(dist.length));
  }
};
findFonts(join(dist, 'assets', 'node_modules', '@expo-google-fonts'));
const preload = fonts.map((f) => `<link rel="preload" href="${BASE}${f}" as="font" type="font/ttf" crossorigin>`).join('\n');
html = html.replace('</head>', `${HEAD}${preload}\n</head>`);
// The spinner-less first paint matches the splash colour instead of a white flash.
writeFileSync(join(dist, 'index.html'), html);
// GitHub Pages serves 404.html for unknown paths, so deep links (/app/join?code=...) still boot the SPA.
writeFileSync(join(dist, '404.html'), html);

// The Inter package registers every weight; ship only the font files the bundle references.
const js = readdirSync(join(dist, '_expo/static/js/web')).map((f) => readFileSync(join(dist, '_expo/static/js/web', f), 'utf8')).join('');
const fontDir = join(dist, 'assets', 'node_modules', '@expo-google-fonts');
if (existsSync(fontDir)) {
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.ttf') && !/Inter_(400Regular|600SemiBold|700Bold)\./.test(e.name)) rmSync(p);
    }
  };
  walk(fontDir);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(dist, out, { recursive: true });
console.log(`Web app written to ${out}`);
