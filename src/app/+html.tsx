import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

// Root HTML for the web/PWA build (hosted under /throttletribe/app/). Runs only in the Node export
// process, so no browser APIs here. Absolute URLs include the base path because GitHub Pages
// serves the app from a subfolder.
const BASE = '/throttletribe/app';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>Throttle Tribe</title>
        <meta name="description" content="Group motorcycle ride tracking: see who is ahead, who is behind and who needs help." />
        <meta name="theme-color" content="#F97316" />
        <link rel="manifest" href={`${BASE}/manifest.webmanifest`} />
        <link rel="icon" type="image/png" href={`${BASE}/favicon.png`} />
        <link rel="apple-touch-icon" href={`${BASE}/apple-touch-icon.png`} />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Throttle Tribe" />
        <ScrollViewStyleReset />
        {/* Desktop: the app sits in a centred phone-width column on a neutral background. */}
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>{children}</body>
    </html>
  );
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
