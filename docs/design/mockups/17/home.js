/* Home mockups (16 §3). renderHome({variant:'empty'|'recent'|'active', dark}) */
window.renderHome = function ({ variant = 'recent', dark = false } = {}) {
  if (dark) document.documentElement.classList.add('dark');
  if (window.STYLE === 'maps') document.documentElement.classList.add('maps');

  /** Route sketch: the ride's own polyline, normalised into a tile (pure RN Views in the app; SVG here). */
  function sketch(fromM, toM, rot = 0, size = 56) {
    const pts = TT.slice(fromM, toM).filter((_, i, a) => i % Math.max(1, Math.floor(a.length / 60)) === 0 || i === a.length - 1);
    const r = rot * Math.PI / 180;
    const xy = pts.map(([lng, lat]) => { const x = lng * Math.cos(13.2 * Math.PI / 180), y = -lat; return [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)]; });
    const xs = xy.map(p => p[0]), ys = xy.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const sc = (size - 16) / Math.max(maxX - minX, maxY - minY);
    const ox = (size - (maxX - minX) * sc) / 2, oy = (size - (maxY - minY) * sc) / 2;
    const d = xy.map((p, i) => (i ? 'L' : 'M') + ((p[0] - minX) * sc + ox).toFixed(1) + ' ' + ((p[1] - minY) * sc + oy).toFixed(1)).join(' ');
    const [sx, sy] = d.slice(1).split(' L')[0].split(' '); const last = d.split(' L').pop().split(' ');
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="display:block;border-radius:14px;background:var(--surface)">
      <path d="${d}" fill="none" stroke="var(--routeLine)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${sx}" cy="${sy}" r="3.5" fill="var(--surfaceRaised)" stroke="var(--text)" stroke-width="2"/>
      <circle cx="${last[0]}" cy="${last[1]}" r="3.5" fill="var(--text)"/></svg>`;
  }
  const rideRow = (s, title, meta, when, last) => `<div style="position:relative;display:flex;align-items:center;gap:14px;padding:12px 16px;height:80px">
      ${s}<div style="flex:1;min-width:0"><div style="font-size:16px;line-height:22px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${title}</div>
      <div class="num" style="font-size:14px;line-height:20px;color:var(--textMuted);white-space:nowrap">${meta}</div></div>
      <div class="num" style="font-size:13px;color:var(--textSubtle);align-self:flex-start;margin-top:8px">${when}</div>
      ${last ? '' : '<div style="position:absolute;left:86px;right:0;bottom:0;height:1px;background:var(--border)"></div>'}</div>`;

  const topBar = `<div style="height:64px;flex:none;display:flex;align-items:center;justify-content:space-between;padding:0 12px 0 16px">
      <div style="display:flex;align-items:center;gap:8px">${UI.mark(28, dark ? '#F9FAFB' : '#0B0F14')}<span style="font-size:20px;font-weight:700;letter-spacing:-.4px">Throttle <span style="color:var(--wordmark)">Tribe</span></span></div>
      <div style="width:56px;height:56px;display:flex;align-items:center;justify-content:center;position:relative">
        <div class="av" style="background:var(--brand);color:var(--onBrand);font-weight:700">RA</div>
        <span style="position:absolute;right:9px;top:9px;width:12px;height:12px;border-radius:6px;background:var(--stopped);border:2px solid var(--bg)"></span></div></div>`;

  const statStrip = `<div style="display:flex;background:var(--surfaceRaised);border-radius:16px;box-shadow:var(--e1);padding:14px 0">
      ${[['214', 'km', 'This month'], ['3', '', 'Rides'], ['7', 'h 40', 'In the saddle']].map((s, i) => `
        <div style="flex:1;padding:0 16px;${i ? 'border-left:1px solid var(--border)' : ''}">
          <div class="num" style="font-size:24px;line-height:28px;font-weight:700;letter-spacing:-.5px">${s[0]}<span style="font-size:14px;font-weight:600;color:var(--textMuted);letter-spacing:0;margin-left:3px">${s[1]}</span></div>
          <div style="font-size:12px;line-height:16px;color:var(--textSubtle);margin-top:2px">${s[2]}</div></div>`).join('')}</div>`;

  const codeCard = `<div style="display:flex;align-items:center;gap:14px;background:var(--surfaceRaised);border-radius:16px;box-shadow:var(--e1);padding:0 12px 0 16px;height:72px">
      <div style="width:40px;height:40px;border-radius:12px;background:var(--brandTint);display:flex;align-items:center;justify-content:center"><span class="ms" style="font-size:22px;color:var(--brandOnBg)">dialpad</span></div>
      <div style="flex:1"><div style="font-size:16px;font-weight:600">Join with a code</div><div style="font-size:14px;color:var(--textMuted)">6 digits from the leader</div></div>
      <span class="ms" style="font-size:22px;color:var(--textSubtle)">chevron_right</span></div>`;

  const section = (t, action) => `<div style="display:flex;justify-content:space-between;align-items:baseline;margin:24px 4px 8px">
      <span style="font-size:20px;line-height:26px;font-weight:600;letter-spacing:-.2px">${t}</span>${action ? `<span style="font-size:14px;font-weight:600;color:var(--brandOnBg)">${action}</span>` : ''}</div>`;

  const startBtn = `<div style="flex:none;padding:12px 16px 8px;background:linear-gradient(to bottom,transparent,var(--bg) 16px)">
      <div class="btn primary" style="height:60px;font-size:17px;gap:10px;box-shadow:var(--startGlow)">${UI.isMaps() ? '<span class="ms f" style="font-size:22px">navigation</span>' : UI.mark(24, '#0B0F14', '#0B0F14')}Start a ride</div></div>`;

  let body = '';
  if (variant === 'active') {
    const riders = [{ init: 'KA', color: '#0E7490', off: 500 }, { init: 'AR', color: '#6D28D9', off: 40 },
      { init: 'ME', color: '#4338CA', off: -850 }, { init: 'PR', color: '#BE185D', off: -1300, status: 'offline' }];
    body = `<div style="padding:4px 16px 0">
      <div style="font-size:28px;line-height:34px;font-weight:700;letter-spacing:-.5px;margin:4px 4px 16px">Good morning, Raghu</div>
      <div class="dark" style="background:var(--surfaceRaised);border-radius:20px;padding:16px;color:var(--text);box-shadow:0 8px 24px rgba(11,15,20,.22);${dark ? 'box-shadow:0 0 0 1px rgba(255,255,255,.08)' : ''}">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <span style="display:flex;align-items:center;gap:8px;font-size:12px;font-weight:600;letter-spacing:.6px;color:#86EFAC">
            <span style="width:8px;height:8px;border-radius:4px;background:#22C55E;box-shadow:0 0 0 4px rgba(34,197,94,.25)"></span>RIDE IN PROGRESS</span>
          <span class="num" style="font-size:14px;color:var(--textMuted)">1 h 12 min</span></div>
        <div style="font-size:22px;line-height:28px;font-weight:700;letter-spacing:-.4px;margin:8px 0 2px">Breakfast run</div>
        <div style="font-size:14px;color:var(--textMuted);margin-bottom:14px">You're the leader · 5 riders</div>
        ${UI.convoy(riders, { width: 326, height: 78 })}
        <div style="display:flex;align-items:center;gap:8px;margin:6px 0 14px;font-size:14px;line-height:20px;color:var(--textMuted)">
          <span class="ms f" style="font-size:16px;color:var(--offline)">signal_disconnected</span><span>Priya · no signal 1 min</span></div>
        <div class="btn primary" style="height:56px">Back to ride<span class="ms" style="font-size:20px">arrow_forward</span></div>
      </div>
      ${section('Recent rides', 'See all')}
      <div style="background:var(--surfaceRaised);border-radius:16px;box-shadow:var(--e1);overflow:hidden">
        ${rideRow(sketch(0, 61000, 0), 'Nandi Hills sunrise', '61 km · 2 h 14 min · 5 riders', 'Sun')}
        ${rideRow(sketch(26000, 52000, 140), 'Kanakapura loop', '86 km · 3 h 05 min · 4 riders', 'Oct 4', true)}
      </div></div>`;
  } else if (variant === 'recent') {
    body = `<div style="padding:4px 16px 0">
      <div style="margin:4px 4px 16px"><div style="font-size:28px;line-height:34px;font-weight:700;letter-spacing:-.5px">Good evening, Raghu</div>
        <div style="font-size:16px;line-height:24px;color:var(--textMuted)">Ready to ride?</div></div>
      ${statStrip}
      <div style="height:12px"></div>${codeCard}
      ${section('Recent rides', 'See all')}
      <div style="background:var(--surfaceRaised);border-radius:16px;box-shadow:var(--e1);overflow:hidden">
        ${rideRow(sketch(0, 61000, 0), 'Nandi Hills sunrise', '61 km · 2 h 14 min · 5 riders', 'Sun')}
        ${rideRow(sketch(26000, 52000, 140), 'Kanakapura loop', '86 km · 3 h 05 min · 4 riders', 'Oct 4')}
        ${rideRow(sketch(30000, 61000, 200), 'Breakfast run', '38 km · 1 h 20 min · 6 riders', 'Sep 28', true)}
      </div></div>`;
  } else {
    const step = (n, t, d, last) => `<div style="display:flex;gap:14px;position:relative">
        <div style="display:flex;flex-direction:column;align-items:center">
          <div class="num" style="width:32px;height:32px;border-radius:16px;background:${n === 1 ? 'var(--brand)' : 'var(--surface)'};color:${n === 1 ? '#111827' : 'var(--text)'};display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700">${n}</div>
          ${last ? '' : '<div style="width:2px;flex:1;background:var(--border);margin:4px 0"></div>'}</div>
        <div style="padding:5px 0 ${last ? 0 : 18}px"><div style="font-size:16px;line-height:22px;font-weight:600">${t}</div><div style="font-size:14px;line-height:20px;color:var(--textMuted)">${d}</div></div></div>`;
    body = `<div style="padding:4px 16px 0">
      <div style="margin:4px 4px 20px"><div style="font-size:28px;line-height:34px;font-weight:700;letter-spacing:-.5px">Welcome, Raghu</div>
        <div style="font-size:16px;line-height:24px;color:var(--textMuted)">Your first group ride is three steps away.</div></div>
      <div style="background:var(--surfaceRaised);border-radius:16px;box-shadow:var(--e1);padding:20px 16px">
        ${step(1, 'Start a ride', 'Name it and pick when to flag a stop.')}
        ${step(2, 'Share the 6-digit code', 'Riders join from WhatsApp or the code. No sign-up.')}
        ${step(3, 'Ride. Nobody gets lost.', 'Everyone sees who is ahead, behind or stopped.', true)}
      </div>
      <div style="height:12px"></div>${codeCard}
      <div style="height:12px"></div>
      <div style="display:flex;gap:14px;align-items:center;background:var(--surfaceRaised);border-radius:16px;box-shadow:var(--e1);padding:14px 12px 14px 16px">
        <div style="width:40px;height:40px;border-radius:12px;background:var(--brandTint);display:flex;align-items:center;justify-content:center;flex:none"><span class="ms" style="font-size:22px;color:var(--brandOnBg)">shield_person</span></div>
        <div style="flex:1"><div style="font-size:16px;font-weight:600">Add an emergency contact</div><div style="font-size:14px;line-height:20px;color:var(--textMuted)">One tap to call them if you send SOS.</div></div>
        <span style="font-size:15px;font-weight:600;color:var(--brandOnBg);padding:0 4px">Add</span></div>
    </div>`;
  }
  document.body.innerHTML = `<div class="phone">${UI.statusBar(variant === 'active' ? '7:52' : '6:41')}${topBar}
    <div style="flex:1;overflow:hidden">${body}</div>${variant === 'active' ? '' : startBtn}${UI.gest()}</div>`;
};
