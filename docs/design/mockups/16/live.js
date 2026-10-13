/* Live ride mockup (16 §2). renderLive({dark, variant}) variant: 'map' (split) | 'states' (list mode, exception states). */
window.renderLive = function ({ dark = false, variant = 'map' } = {}) {
  if (dark) document.documentElement.classList.add('dark');
  const ME = 31000;
  const C = { KA: '#0E7490', AR: '#6D28D9', ME: '#4338CA', PR: '#BE185D', VI: '#0F766E' };

  const dirIcon = d => d === 'ahead' ? 'north' : d === 'behind' ? 'south' : '';
  function row(r) {
    const s = r.status || 'moving';
    const sos = s === 'sos';
    const bar = s === 'stopped' ? 'var(--stopped)' : s === 'offline' ? 'var(--offline)' : null;
    const bg = sos ? '#B91C1C' : 'var(--surfaceRaised)';
    const fg = sos ? '#fff' : s === 'offline' ? 'var(--textMuted)' : 'var(--text)';
    const mfg = sos ? 'rgba(255,255,255,.9)' : 'var(--textMuted)';
    const distBlock = r.level
      ? `<div style="font-size:20px;line-height:32px;font-weight:600;letter-spacing:-.2px;color:${fg};display:flex;align-items:center;gap:6px">
           <span class="ms" style="font-size:20px;color:${mfg}">drag_handle</span>With you</div>`
      : `<div class="num" style="display:flex;align-items:baseline;gap:6px;color:${fg};white-space:nowrap">
           <span style="font-size:28px;line-height:32px;font-weight:600;letter-spacing:-.6px">${r.approx ? '≈' : ''}${r.dist}<span style="font-size:18px;letter-spacing:-.2px;margin-left:2px">${r.unit}</span></span>
           <span style="font-size:15px;font-weight:400;color:${mfg};display:flex;align-items:center;gap:1px;align-self:center;margin-top:4px"><span class="ms" style="font-size:16px">${dirIcon(r.dir)}</span>${r.dir}</span></div>`;
    let right = '';
    if (s === 'moving') right = `<div class="num" style="font-size:14px;line-height:20px;color:var(--textSubtle);text-align:right">${r.speed}<span style="font-size:12px"> km/h</span></div>`;
    if (s === 'stopped') right = `<span class="pill num" style="background:var(--stopped);color:#111827;height:36px;font-size:15px"><span class="ms f" style="font-size:18px">pause</span>Stopped ${r.age}</span>`;
    if (s === 'offline') right = `<span class="pill num" style="background:var(--surface);color:var(--onOfflineTint);height:36px;font-size:15px;box-shadow:inset 0 0 0 1.5px var(--offline)"><span class="ms f" style="font-size:17px">signal_disconnected</span>No signal</span>`;
    if (sos) right = `<span class="pill num" style="background:#fff;color:#B91C1C;height:36px;font-size:15px"><span class="ms f" style="font-size:18px">warning</span>SOS ${r.age}</span>`;
    const avRing = s === 'stopped' ? 'box-shadow:0 0 0 2px var(--surfaceRaised),0 0 0 4px var(--stopped);'
      : s === 'offline' ? 'opacity:.55;outline:2px dashed var(--offline);outline-offset:2px;'
      : sos ? 'box-shadow:0 0 0 2px #B91C1C,0 0 0 4px #fff;' : '';
    const sub = [
      `<span style="font-weight:600;color:${sos ? '#fff' : 'var(--text)'}">${r.name}</span>`,
      r.leader ? `<span style="display:inline-flex;align-items:center;gap:2px;font-size:12px;font-weight:600;color:${mfg}"><span class="ms f" style="font-size:13px">star</span>Leader</span>` : '',
      r.note ? `<span style="color:${sos ? 'rgba(255,255,255,.9)' : 'var(--textSubtle)'}">${r.note}</span>` : '',
    ].filter(Boolean).join(`<span style="color:${mfg}">·</span>`);
    return `<div style="position:relative;height:72px;display:flex;align-items:center;gap:12px;padding:0 16px;background:${bg};${r.pulse ? 'box-shadow:inset 0 0 0 2px #fff;' : ''}">
      ${bar ? `<div style="position:absolute;left:0;top:0;bottom:0;width:4px;background:${bar}"></div>` : ''}
      <div class="av" style="background:${r.color};${avRing}">${r.init}</div>
      <div style="flex:1;min-width:0">${distBlock}
        <div style="display:flex;align-items:center;gap:6px;font-size:15px;line-height:20px;margin-top:1px;white-space:nowrap">${sub}</div></div>
      ${right}
      ${sos || r.last ? '' : '<div style="position:absolute;left:68px;right:0;bottom:0;height:1px;background:var(--border)"></div>'}</div>`;
  }
  const meRow = (speed) => `<div style="position:relative;height:56px;display:flex;align-items:center;gap:12px;padding:0 16px 0 20px;background:var(--meRowBg)">
      <div style="position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--brand)"></div>
      <div style="width:40px;display:flex;justify-content:center">${UI.meArrow(26, 0, false)}</div>
      <div style="font-size:16px;font-weight:600">You</div>
      <div class="num muted" style="font-size:16px">${speed}<span style="font-size:13px"> km/h</span></div>
      <div style="flex:1"></div>
      <div style="display:flex;align-items:center;gap:4px;font-size:14px;font-weight:600;color:var(--onMovingTint)"><span class="ms f" style="font-size:16px">check_circle</span>Sharing</div></div>`;

  const header = (sub, mode) => `<div style="height:60px;flex:none;display:flex;align-items:center;gap:4px;padding:0 4px 0 4px;background:var(--surfaceRaised)">
      <div style="width:48px;height:56px;display:flex;align-items:center;justify-content:center"><span class="ms" style="font-size:24px">arrow_back</span></div>
      <div style="flex:1;min-width:0"><div style="font-size:18px;line-height:24px;font-weight:600;letter-spacing:-.2px">Breakfast run</div>
        <div class="num muted" style="font-size:13px;line-height:18px">${sub}</div></div>
      <div style="display:flex;background:var(--surface);border-radius:12px;padding:3px;height:44px">
        <div style="width:48px;border-radius:9px;display:flex;align-items:center;justify-content:center;${mode === 'map' ? 'background:var(--segThumb);box-shadow:var(--e1);color:var(--text)' : 'color:var(--textMuted)'}"><span class="ms${mode === 'map' ? ' f' : ''}" style="font-size:22px">map</span></div>
        <div style="width:48px;border-radius:9px;display:flex;align-items:center;justify-content:center;${mode === 'list' ? 'background:var(--segThumb);box-shadow:var(--e1);color:var(--text)' : 'color:var(--textMuted)'}"><span class="ms" style="font-size:22px">view_agenda</span></div></div>
      <div style="width:48px;height:56px;display:flex;align-items:center;justify-content:center"><span class="ms" style="font-size:24px">more_vert</span></div></div>`;

  const convoyWrap = (riders, o) => `<div style="flex:none;background:var(--surfaceRaised);padding:6px 16px 4px;border-top:1px solid var(--border);border-bottom:1px solid var(--border)">${UI.convoy(riders, o)}</div>`;

  const actionBar = (sosOn) => `<div style="flex:none;display:flex;gap:12px;padding:12px 16px 8px;background:var(--surfaceRaised);box-shadow:var(--e2);position:relative;z-index:4">
      <div style="width:96px;height:64px;border-radius:16px;background:var(--surface);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px">
        <span class="ms" style="font-size:24px">chat_bubble</span><span style="font-size:12px;font-weight:600">Message</span></div>
      <div style="flex:1;height:64px;border-radius:16px;background:#B91C1C;color:#fff;display:flex;align-items:center;justify-content:center;gap:10px;position:relative;overflow:hidden">
        <span class="ms f" style="font-size:24px">warning</span><span style="font-size:19px;font-weight:700;letter-spacing:-.2px">Hold for SOS</span></div></div>`;

  let html = '';
  if (variant === 'map') {
    const riders = [
      { init: 'KA', color: C.KA, off: 500 }, { init: 'AR', color: C.AR, off: 40 },
      { init: 'ME', color: C.ME, off: -850 }, { init: 'PR', color: C.PR, off: -1300, status: 'offline' },
    ];
    html = UI.statusBar('8:34') + header('1 h 12 min · 5 riders', 'map') + convoyWrap(riders, {}) +
      `<div id="map" style="flex:1;position:relative;background:var(--surface) url(maps/live-${dark ? 'dark' : 'light'}.png) left bottom / 500px auto no-repeat">
         <div style="position:absolute;right:12px;bottom:12px;display:flex;flex-direction:column;gap:12px;z-index:3">
           <div style="width:52px;height:52px;border-radius:26px;background:var(--surfaceRaised);box-shadow:var(--e2);display:flex;align-items:center;justify-content:center"><span class="ms" style="font-size:22px">near_me</span></div>
           <div style="width:52px;height:52px;border-radius:26px;background:var(--surfaceRaised);box-shadow:var(--e2);display:flex;align-items:center;justify-content:center"><span class="ms" style="font-size:22px">fit_screen</span></div></div>
         <div style="position:absolute;left:8px;bottom:6px;z-index:3;font-size:10px;color:var(--textSubtle);background:color-mix(in srgb,var(--surfaceRaised) 85%,transparent);padding:2px 6px;border-radius:6px">© OpenFreeMap © OpenStreetMap</div></div>` +
      `<div style="flex:none;background:var(--surfaceRaised)">` +
      row({ init: 'KA', color: C.KA, dist: '500', unit: 'm', dir: 'ahead', name: 'Karthik', speed: 64 }) +
      row({ init: 'AR', color: C.AR, level: true, name: 'Arun', speed: 61 }) +
      meRow(61) +
      row({ init: 'ME', color: C.ME, dist: '850', unit: 'm', dir: 'behind', name: 'Meena', speed: 57 }) +
      row({ init: 'PR', color: C.PR, dist: '1.3', unit: 'km', dir: 'behind', approx: true, name: 'Priya', status: 'offline', age: '1 min', note: 'seen 1 min ago', last: true }) +
      `</div>` + actionBar() + UI.gest();
    document.body.innerHTML = `<div class="phone">${html}</div>`;
  } else {
    // List mode, exception states: SOS, stopped, offline, moving, me.
    const riders = [
      { init: 'KA', color: C.KA, off: 2100 }, { init: 'AR', color: C.AR, off: 400, status: 'sos' },
      { init: 'VI', color: C.VI, off: 30 },
      { init: 'ME', color: C.ME, off: -900, status: 'stopped' }, { init: 'PR', color: C.PR, off: -1600, status: 'offline' },
    ];
    html = UI.statusBar('9:02') + header('1 h 40 min · 6 riders', 'list') +
      `<div style="flex:none;height:56px;background:#B91C1C;color:#fff;display:flex;align-items:center;gap:10px;padding:0 16px">
         <span class="ms f" style="font-size:22px">warning</span><div style="flex:1;font-size:16px;font-weight:600">Arun sent SOS · 400 m ahead</div>
         <span style="font-size:15px;font-weight:600;text-decoration:underline;text-underline-offset:3px">Open</span></div>` +
      convoyWrap(riders, { gap: [-900, -50] }) +
      `<div style="flex:1;background:var(--surfaceRaised);overflow:hidden">` +
      row({ init: 'KA', color: C.KA, dist: '2.1', unit: 'km', dir: 'ahead', name: 'Karthik', speed: 66 }) +
      row({ init: 'AR', color: C.AR, dist: '400', unit: 'm', dir: 'ahead', name: 'Arun', status: 'sos', age: '2 min', note: 'sent 9:00' }) +
      row({ init: 'VI', color: C.VI, level: true, name: 'Vikram', speed: 48 }) +
      meRow(48) +
      row({ init: 'ME', color: C.ME, dist: '900', unit: 'm', dir: 'behind', name: 'Meena', status: 'stopped', age: '6 min' }) +
      row({ init: 'PR', color: C.PR, dist: '1.6', unit: 'km', dir: 'behind', approx: true, name: 'Priya', status: 'offline', age: '4 min', note: 'seen 4 min ago', last: true }) +
`</div>` + actionBar() + UI.gest();
    document.body.innerHTML = `<div class="phone">${html}</div>`;
  }
};
