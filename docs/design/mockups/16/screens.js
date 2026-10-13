/* Welcome + Summary mockups (16 §1, §4). */
window.renderWelcome = function () {
  document.documentElement.classList.add('dark');
  document.body.innerHTML = `<div class="phone" style="background:#0B0F14">
    <div style="position:absolute;inset:0 0 auto 0;height:520px;background:url(maps/welcome.png) left top / 500px auto no-repeat"></div>
    <div style="position:absolute;left:0;right:0;top:230px;height:300px;background:linear-gradient(to bottom,rgba(11,15,20,0),rgba(11,15,20,.85) 45%,#0B0F14 62%)"></div>
    <div style="position:absolute;left:0;right:0;top:0;height:120px;background:linear-gradient(to bottom,rgba(11,15,20,.85),rgba(11,15,20,0))"></div>
    <div style="position:relative;z-index:2">${UI.statusBar('6:40', true)}</div>
    <div style="position:absolute;left:16px;right:16px;top:64px;z-index:3;display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:16px;
         background:rgba(22,27,34,.92);box-shadow:0 0 0 1px rgba(255,255,255,.08),0 12px 32px rgba(0,0,0,.5);backdrop-filter:blur(8px)">
      <div style="width:36px;height:36px;border-radius:10px;background:#F59E0B;display:flex;align-items:center;justify-content:center"><span class="ms f" style="font-size:20px;color:#111827">pause</span></div>
      <div style="flex:1"><div style="font-size:15px;font-weight:600;color:#F9FAFB">Priya stopped · 2 min</div>
        <div class="num" style="font-size:13px;color:#C2C8D0">1.7 km behind you</div></div>
      <span style="font-size:12px;color:#8B95A1">now</span></div>
    <div style="flex:1"></div>
    <div style="position:relative;z-index:2;padding:0 24px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px">${UI.mark(32, '#F9FAFB')}
        <span style="font-size:18px;font-weight:700;letter-spacing:-.3px;color:#F9FAFB">Throttle <span style="color:#FB923C">Tribe</span></span></div>
      <div style="font-size:38px;line-height:42px;font-weight:700;letter-spacing:-1.2px;color:#F9FAFB">Ride together.<br>Nobody gets<br>left behind.</div>
      <div style="font-size:16px;line-height:24px;color:#C2C8D0;margin-top:14px">See who's ahead, who's behind and who stopped. One glance, gloves on.</div>
    </div>
    <div style="position:relative;z-index:2;padding:28px 16px 4px;display:flex;flex-direction:column;gap:8px">
      <div class="btn primary" style="height:60px;font-size:17px">Get started</div>
      <div class="btn" style="background:transparent;color:#F9FAFB;height:52px">I have an account</div>
      <div style="text-align:center;font-size:13px;color:#8B95A1;margin-top:-2px">No sign-up. Just your name.</div>
    </div>${UI.gest(true)}</div>`;
};

window.renderSummary = function ({ dark = false } = {}) {
  if (dark) document.documentElement.classList.add('dark');
  const stat = (v, u, l, first) => `<div style="flex:1;padding:0 16px;${first ? '' : 'border-left:1px solid var(--border)'}">
      <div class="num" style="font-size:${first ? 28 : 22}px;line-height:32px;font-weight:700;letter-spacing:-.6px">${v}<span style="font-size:14px;font-weight:600;color:var(--textMuted);letter-spacing:0;margin-left:3px">${u}</span></div>
      <div style="font-size:12px;line-height:16px;color:var(--textSubtle);margin-top:2px">${l}</div></div>`;
  const ev = (time, dot, title, meta, last) => `<div style="display:flex;gap:12px">
      <div class="num" style="width:44px;font-size:13px;line-height:22px;color:var(--textSubtle);text-align:right;flex:none">${time}</div>
      <div style="display:flex;flex-direction:column;align-items:center;flex:none;padding-top:5px">${dot}${last ? '' : '<div style="width:2px;flex:1;background:var(--border);margin-top:4px"></div>'}</div>
      <div style="padding-bottom:${last ? 0 : 14}px;min-width:0"><div style="font-size:15px;line-height:22px;font-weight:600">${title}</div>${meta ? `<div class="num" style="font-size:13px;line-height:18px;color:var(--textMuted)">${meta}</div>` : ''}</div></div>`;
  const dot = (bg, glyph, fg = '#fff') => `<div style="width:14px;height:14px;border-radius:7px;background:${bg};box-shadow:0 0 0 3px var(--surfaceRaised);display:flex;align-items:center;justify-content:center">${glyph ? `<span class="ms f" style="font-size:10px;color:${fg}">${glyph}</span>` : ''}</div>`;
  const avs = [['RA', '#F97316', '#111827'], ['KA', '#0E7490'], ['AR', '#6D28D9'], ['ME', '#4338CA'], ['PR', '#BE185D']]
    .map((a, i) => `<div class="av" style="width:32px;height:32px;font-size:11px;background:${a[1]};color:${a[2] || '#fff'};margin-left:${i ? -8 : 0}px;box-shadow:0 0 0 2px var(--surfaceRaised)">${a[0]}</div>`).join('');
  const circ = g => `<div style="width:44px;height:44px;border-radius:22px;background:var(--surfaceRaised);box-shadow:var(--e2);display:flex;align-items:center;justify-content:center"><span class="ms" style="font-size:22px">${g}</span></div>`;
  document.body.innerHTML = `<div class="phone">
    <div style="position:absolute;inset:0 0 auto 0;height:330px;background:var(--surface) url(maps/summary${dark ? '-dark' : ''}.png) left top / 500px auto no-repeat"></div>
    <div style="position:absolute;inset:0 0 auto 0;height:80px;background:linear-gradient(to bottom,${dark ? 'rgba(11,15,20,.8)' : 'rgba(245,246,248,.9)'},transparent)"></div>
    <div style="position:relative;z-index:2">${UI.statusBar('8:21')}</div>
    <div style="position:absolute;top:40px;left:16px;right:16px;z-index:3;display:flex;justify-content:space-between">${circ('close')}${circ('fit_screen')}</div>
    <div style="position:absolute;left:8px;top:282px;z-index:3;font-size:10px;color:var(--textSubtle)">© OpenFreeMap © OpenStreetMap</div>
    <div style="position:absolute;left:0;right:0;top:300px;bottom:0;background:var(--bg);border-radius:24px 24px 0 0;box-shadow:var(--e3);display:flex;flex-direction:column;z-index:4">
      <div style="flex:1;overflow:hidden;padding:20px 16px 0">
        <div style="display:flex;align-items:center;gap:6px;font-size:12px;line-height:16px;font-weight:600;letter-spacing:.6px;color:var(--brandOnBg)"><span class="ms f" style="font-size:16px">sports_score</span>RIDE COMPLETE</div>
        <div style="font-size:28px;line-height:34px;font-weight:700;letter-spacing:-.5px;margin-top:6px">Nandi Hills sunrise</div>
        <div class="num" style="font-size:14px;line-height:20px;color:var(--textMuted);margin-top:2px">Sun, Oct 12 · 6:04 – 8:18 AM</div>
        <div style="display:flex;background:var(--surfaceRaised);border-radius:16px;box-shadow:var(--e1);padding:14px 0;margin-top:16px">
          ${stat('61.0', 'km', 'You rode', true)}${stat('2 h 14', '', 'Time')}${stat('27', 'km/h', 'Average')}</div>
        <div style="background:var(--surfaceRaised);border-radius:16px;box-shadow:var(--e1);padding:16px 16px 16px 8px;margin-top:12px">
          ${ev('6:04', dot('var(--text)'), 'Started · 5 riders', '')}
          ${ev('6:52', dot('#F59E0B'), 'Arun stopped', '4 min · km 18')}
          ${ev('7:31', dot('#B91C1C'), 'Karthik sent SOS', 'Cleared 7:33 · km 34')}
          ${ev('8:18', dot('#F97316'), 'Ride ended', 'Location sharing stopped for everyone', true)}
        </div>
        <div style="display:flex;align-items:center;gap:12px;background:var(--surfaceRaised);border-radius:16px;box-shadow:var(--e1);padding:12px 12px 12px 16px;margin-top:12px">
          <div style="display:flex">${avs}</div>
          <div style="flex:1"><div style="font-size:15px;font-weight:600">5 riders</div><div style="font-size:13px;color:var(--textMuted)">All finished together</div></div>
          <span class="ms" style="font-size:22px;color:var(--textSubtle)">chevron_right</span></div>
      </div>
      <div style="flex:none;padding:12px 16px 8px;background:linear-gradient(to bottom,transparent,var(--bg) 14px)"><div class="btn primary">Back to home</div></div>
      ${UI.gest()}</div></div>`;
};
