/* Mockup UI helpers (status bar, brand mark, me arrow, map markers, Convoy strip). Mockup only. */
window.UI = {
  statusBar(time, light) {
    return `<div class="sb${light ? ' light' : ''}"><span class="num">${time}</span><span class="ic">
      <span class="ms f">signal_cellular_alt</span><span class="ms f">wifi</span><span class="ms f" style="font-size:19px">battery_full</span></span></div>`;
  },
  gest(light) { return `<div class="gest${light ? ' light' : ''}"><i></i></div>`; },
  mark(size, wing = '#0B0F14', lead = '#F97316') {
    return `<svg class="mark" width="${size}" height="${size}" viewBox="0 0 1024 1024"><g transform="translate(512 512) scale(1.18) translate(-512 -530)">
      <path d="M512 192 L648 512 L512 432 L376 512 Z" fill="${lead}" stroke="${lead}" stroke-width="28" stroke-linejoin="round"/>
      <path d="M325 632 L472 545.5 L472 695.5 L240 832 Z" fill="${wing}" stroke="${wing}" stroke-width="28" stroke-linejoin="round"/>
      <path d="M699 632 L552 545.5 L552 695.5 L784 832 Z" fill="${wing}" stroke="${wing}" stroke-width="28" stroke-linejoin="round"/></g></svg>`;
  },
  /** The leader piece of the brand mark = the "me" arrow. rot in degrees (0 = up). */
  meArrow(size, rot = 0, ring = true) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" style="transform:rotate(${rot}deg);display:block;filter:drop-shadow(0 1px 2px rgba(11,15,20,.35))">
      ${ring ? '<circle cx="16" cy="16" r="15" fill="#fff"/>' : ''}
      <path d="M16 5 L24 24 L16 19.5 L8 24 Z" fill="#F97316" stroke="${ring ? '#F97316' : '#fff'}" stroke-width="${ring ? 1.5 : 2.5}" stroke-linejoin="round"/></svg>`;
  },
  mapAvatar(init, color, status) {
    const ring = status === 'stopped' ? 'box-shadow:0 0 0 3px #F59E0B,0 2px 6px rgba(11,15,20,.35);'
      : status === 'sos' ? 'box-shadow:0 0 0 3px #EF4444,0 0 0 10px rgba(239,68,68,.25),0 0 0 18px rgba(239,68,68,.12);'
      : 'box-shadow:0 2px 6px rgba(11,15,20,.35);';
    const op = status === 'offline' ? 'opacity:.6;outline:2px dashed #6B7280;outline-offset:2px;' : '';
    const badge = status === 'stopped' ? `<span style="position:absolute;right:-6px;top:-6px;width:18px;height:18px;border-radius:9px;background:#F59E0B;border:2px solid #fff;display:flex;align-items:center;justify-content:center"><span class="ms f" style="font-size:12px;color:#111827">pause</span></span>`
      : status === 'offline' ? `<span style="position:absolute;right:-6px;top:-6px;width:18px;height:18px;border-radius:9px;background:#9CA3AF;border:2px solid #fff;display:flex;align-items:center;justify-content:center"><span class="ms f" style="font-size:11px;color:#111827">signal_disconnected</span></span>` : '';
    return `<div><div class="av" style="width:36px;height:36px;font-size:13px;background:${color};border:2px solid #fff;${ring}${op}">${init}${badge}</div></div>`;
  },
  /**
   * Convoy strip (16 §2): the group strung out along the route, tail left, lead right.
   * riders: [{init,color,off (m, + = ahead of me), status}], me is off 0.
   */
  convoy(riders, o = {}) {
    const all = riders.concat([{ me: true, off: 0 }]);
    const min = Math.min(...all.map(r => r.off)), max = Math.max(...all.map(r => r.off));
    const span = max - min || 1, W = o.width || 358, pad = 18, inner = W - pad * 2;
    const x = off => pad + ((off - min) / span) * inner;
    const fmt = m => { const a = Math.abs(m); return a >= 1000 ? (a / 1000).toFixed(1) + ' km' : Math.round(a / 50) * 50 + ' m'; };
    // Cluster rule: a rider within 30 px of me is drawn as an avatar stack just behind/ahead of my arrow.
    const px = r => { const v = x(r.off); if (r.me) return v; const d = v - x(0); return Math.abs(d) < 24 ? x(0) + (d >= 0 ? 20 : -20) : v; };
    const dots = all.sort((a, b) => (a.me ? 1 : 0) - (b.me ? 1 : 0) || (a.status === 'sos') - (b.status === 'sos')).map(r => {
      const cx = px(r);
      if (r.me) return `<div style="position:absolute;left:${cx - 15}px;top:${o.top || 26}px;width:30px;height:30px;z-index:3">${UI.meArrow(30, 90)}</div>`;
      const s = r.status, sz = s === 'sos' ? 30 : 26;
      const ring = s === 'stopped' ? 'box-shadow:0 0 0 2px var(--surfaceRaised),0 0 0 4px #F59E0B;'
        : s === 'sos' ? 'box-shadow:0 0 0 2px var(--surfaceRaised),0 0 0 4px #EF4444,0 0 0 10px rgba(239,68,68,.22);'
        : 'box-shadow:0 0 0 2px var(--surfaceRaised);';
      const off = s === 'offline' ? 'opacity:.5;outline:2px dashed var(--offline);outline-offset:1px;' : '';
      const bg = s === 'sos' ? '#B91C1C' : r.color;
      const glyph = s === 'sos' ? '<span class="ms f" style="font-size:16px;color:#fff">warning</span>' : r.init;
      return `<div class="av" style="position:absolute;left:${cx - sz / 2}px;top:${(o.top || 26) + (30 - sz) / 2}px;width:${sz}px;height:${sz}px;font-size:10.5px;background:${bg};${ring}${off};z-index:${s === 'sos' ? 2 : 1}">${glyph}</div>`;
    }).join('');
    const tail = all.find(r => r.off === min), lead = all.find(r => r.off === max);
    const tick = (r, align) => r.me ? '' : `<div class="num" style="position:absolute;top:${(o.top || 26) + 34}px;${align === 'l' ? `left:${Math.max(0, x(r.off) - 18)}px` : `right:${Math.max(0, W - x(r.off) - 18)}px`};font-size:12px;line-height:16px;font-weight:600;color:${r.status === 'offline' ? 'var(--textSubtle)' : r.status === 'stopped' ? 'var(--onStoppedTint)' : 'var(--textMuted)'}">${r.off < 0 ? '−' : '+'}${fmt(r.off)}</div>`;
    const gap = o.gap ? `<div style="position:absolute;left:${x(o.gap[0])}px;width:${x(o.gap[1]) - x(o.gap[0])}px;top:${(o.top || 26) + 14}px;height:2px;background:repeating-linear-gradient(90deg,var(--stopped) 0 5px,transparent 5px 9px)"></div>` : '';
    return `<div class="convoy" style="position:relative;width:${W}px;height:${o.height || 80}px">
      <div style="position:absolute;left:0;right:0;top:0;display:flex;justify-content:space-between;font-size:12px;line-height:16px;font-weight:600;color:var(--textSubtle)">
        <span style="display:flex;align-items:center;gap:2px"><span class="ms" style="font-size:14px">arrow_back</span>Behind</span>
        <span class="num" style="color:var(--textMuted)">${o.spreadText || fmt(span) + ' spread'}</span>
        <span style="display:flex;align-items:center;gap:2px">Ahead<span class="ms" style="font-size:14px">arrow_forward</span></span></div>
      <div style="position:absolute;left:${pad - 6}px;right:${pad - 6}px;top:${(o.top || 26) + 13}px;height:4px;border-radius:2px;background:var(--trackLine)"></div>
      ${gap}${dots}${tick(tail, 'l')}${tick(lead, 'r')}</div>`;
  },
};
