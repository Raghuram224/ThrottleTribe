/* Profile > Appearance with the Style picker (17 §4). Thumbnails are drawn from each style's tokens. Mockup only. */
const T17 = {
  tribe: {
    light: { bg: '#F5F6F8', raised: '#FFFFFF', surface: '#EEF0F3', text: '#111827', muted: '#4B5563', border: '#E3E6EA', accent: '#F97316', onAccent: '#111827', track: '#D5D9DF', band: 'transparent', route: '#F97316', casing: '#9A3412',
      land: '#F2F3F0', park: '#E6E9E5', water: '#C2C8CA', road: '#FFFFFF', major: '#FFFFFF', me: 'arrow', meColor: '#F97316', btnR: 4 },
    dark: { bg: '#0B0F14', raised: '#161B22', surface: '#1F2630', text: '#F9FAFB', muted: '#C2C8D0', border: '#262D36', accent: '#F97316', onAccent: '#111827', track: '#3A424D', band: 'transparent', route: '#FB923C', casing: '#0B0F14',
      land: '#0C0C0C', park: '#202020', water: '#1B1B1D', road: '#2A2A2A', major: '#3C3C3C', me: 'arrow', meColor: '#F97316', btnR: 4 },
  },
  maps: {
    light: { bg: '#F8F9FA', raised: '#FFFFFF', surface: '#F1F3F4', text: '#202124', muted: '#5F6368', border: '#E8EAED', accent: '#1A73E8', onAccent: '#FFFFFF', track: '#DADCE0', band: '#A8C7FA', route: '#1A73E8', casing: '#185ABC',
      land: '#F8F4F0', park: '#D8E8C8', water: '#9EBDFF', road: '#FFFFFF', major: '#FFEEAA', me: 'dot', meColor: '#1A73E8', btnR: 99 },
    dark: { bg: '#1B1C1E', raised: '#232427', surface: '#2F3135', text: '#E8EAED', muted: '#BDC1C6', border: '#34363A', accent: '#8AB4F8', onAccent: '#202124', track: '#44474C', band: '#4A6FA8', route: '#8AB4F8', casing: '#1B3A6B',
      land: '#45516E', park: '#4A5D6B', water: '#38435C', road: '#5A6A8C', major: '#3C4357', me: 'dot', meColor: '#8AB4F8', btnR: 99 },
  },
};

function thumb(t, w = 157, h = 212) {
  const route = 'M -4 92 C 30 84, 46 70, 70 58 S 118 30, 162 14';
  const me = t.me === 'arrow'
    ? `<g transform="translate(70 58) rotate(62)"><circle r="7" fill="#fff"/><path d="M0 -4.6 L3.6 4 L0 2 L-3.6 4 Z" fill="${t.meColor}"/></g>`
    : `<circle cx="70" cy="58" r="11" fill="${t.meColor}" opacity=".18"/><circle cx="70" cy="58" r="4.6" fill="${t.meColor}" stroke="#fff" stroke-width="1.8"/>`;
  const av = (x, y, c, extra = '') => `<circle cx="${x}" cy="${y}" r="6" fill="${c}" stroke="#fff" stroke-width="1.4" ${extra}/>`;
  const bar = (x, y, wd, c, hh = 4) => `<rect x="${x}" y="${y}" width="${wd}" height="${hh}" rx="${hh / 2}" fill="${c}"/>`;
  return `<svg viewBox="0 0 157 212" style="display:block;width:100%;height:auto;border-radius:12px;background:${t.bg}">
    <rect width="157" height="24" fill="${t.raised}"/>${bar(10, 8, 52, t.text, 5)}${bar(10, 16, 32, t.muted, 3)}
    <rect x="112" y="6" width="36" height="12" rx="${Math.min(6, t.btnR + 2)}" fill="${t.surface}"/><rect x="114" y="8" width="16" height="8" rx="${Math.min(4, t.btnR)}" fill="${t.me === 'dot' ? (t.accent === '#1A73E8' ? '#D2E3FC' : '#2D4A77') : t.raised}"/>
    <rect y="24" width="157" height="22" fill="${t.raised}"/><rect x="10" y="34" width="137" height="2.4" rx="1.2" fill="${t.track}"/><rect x="14" y="34" width="129" height="2.4" rx="1.2" fill="${t.band}"/>
    ${av(16, 35, '#BE185D', 'opacity=".55"')}${av(44, 35, '#4338CA')}${t.me === 'arrow' ? `<g transform="translate(98 35) rotate(90)"><circle r="6.5" fill="#fff"/><path d="M0 -4.2 L3.3 3.6 L0 1.8 L-3.3 3.6 Z" fill="${t.meColor}"/></g>` : `<circle cx="98" cy="35" r="4.4" fill="${t.meColor}" stroke="#fff" stroke-width="1.8"/>`}${av(141, 35, '#0E7490')}
    <svg x="0" y="46" width="157" height="96" viewBox="0 0 157 96">
      <rect width="157" height="96" fill="${t.land}"/>
      <path d="M 104 60 q 26 -8 56 6 v 32 h -60 z" fill="${t.park}"/><path d="M -2 10 q 24 -6 40 6 q -6 14 -42 12 z" fill="${t.water}"/>
      <path d="M 0 40 L 157 52 M 30 0 L 44 96 M 0 74 L 157 70 M 120 0 L 108 96" stroke="${t.road}" stroke-width="3" fill="none"/>
      <path d="M 0 22 C 40 30 90 40 157 34" stroke="${t.major}" stroke-width="4.5" fill="none"/>
      <path d="${route}" stroke="${t.casing}" stroke-width="7" fill="none" stroke-linecap="round"/><path d="${route}" stroke="${t.route}" stroke-width="4.6" fill="none" stroke-linecap="round"/>
      ${av(36, 79, '#4338CA')}${av(118, 26, '#0E7490')}${me}
    </svg>
    <rect y="142" width="157" height="44" fill="${t.raised}"/>
    ${av(14, 153, '#0E7490')}${bar(26, 149, 34, t.text, 6)}${bar(26, 158, 22, t.muted, 3)}
    <line x1="26" y1="164.5" x2="157" y2="164.5" stroke="${t.border}"/>
    ${av(14, 175, '#4338CA')}${bar(26, 171, 30, t.text, 6)}${bar(26, 180, 20, t.muted, 3)}<rect x="116" y="169" width="34" height="11" rx="5.5" fill="#F59E0B"/>
    <rect y="186" width="157" height="26" fill="${t.raised}"/><rect x="8" y="190" width="30" height="18" rx="5" fill="${t.surface}"/><rect x="42" y="190" width="107" height="18" rx="5" fill="#B91C1C"/>
    ${bar(74, 197, 44, '#FFFFFF', 4)}
  </svg>`;
}

window.renderAppearance = function ({ dark = false, selected = 'maps' } = {}) {
  if (dark) document.documentElement.classList.add('dark');
  if (selected === 'maps') document.documentElement.classList.add('maps');
  const scheme = dark ? 'dark' : 'light';
  const card = (id, name, sub) => {
    const on = id === selected;
    return `<div style="flex:1;min-width:0;border-radius:16px;padding:8px 8px 12px;background:var(--surfaceRaised);box-shadow:${on ? '0 0 0 2px var(--brand)' : '0 0 0 1px var(--borderStrong)'};position:relative">
      ${thumb(T17[id][scheme])}
      <div style="display:flex;align-items:center;gap:8px;margin-top:10px;padding:0 4px">
        <span style="width:22px;height:22px;border-radius:11px;flex:none;box-sizing:border-box;${on ? 'background:var(--brand);display:flex;align-items:center;justify-content:center' : 'border:2px solid var(--borderStrong)'}">${on ? '<span class="ms f" style="font-size:16px;color:var(--onBrand)">check</span>' : ''}</span>
        <div style="min-width:0"><div style="font-size:16px;line-height:22px;font-weight:600">${name}</div>
          <div style="font-size:13px;line-height:18px;color:var(--textMuted)">${sub}</div></div></div></div>`;
  };
  const seg = (opts, val) => `<div style="display:flex;background:var(--surface);border-radius:var(--segR);padding:4px;height:56px;gap:4px">
    ${opts.map(o => `<div style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;border-radius:var(--segThumbR);font-size:15px;font-weight:600;${o === val ? 'background:var(--segThumb);color:var(--segIcon);' + (selected === 'maps' ? '' : 'box-shadow:var(--e1);') : 'color:var(--textMuted)'}">${o === val ? '<span class="ms" style="font-size:18px">check</span>' : ''}${o}</div>`).join('')}</div>`;
  const label = t => `<div class="t-label" style="color:var(--textSubtle);margin:24px 4px 8px">${t}</div>`;
  const row = (icon, title, value, last) => `<div style="height:64px;display:flex;align-items:center;gap:14px;padding:0 16px;position:relative">
      <span class="ms" style="font-size:24px;color:var(--textMuted)">${icon}</span><div style="flex:1;font-size:16px;font-weight:600">${title}</div>
      <span style="font-size:15px;color:var(--textMuted)">${value}</span><span class="ms" style="font-size:22px;color:var(--textSubtle)">chevron_right</span>
      ${last ? '' : '<div style="position:absolute;left:54px;right:0;bottom:0;height:1px;background:var(--border)"></div>'}</div>`;
  document.body.innerHTML = `<div class="phone">${UI.statusBar('6:44')}
    <div style="height:56px;flex:none;display:flex;align-items:center;gap:4px;padding:0 4px">
      <div style="width:48px;height:56px;display:flex;align-items:center;justify-content:center"><span class="ms" style="font-size:24px">arrow_back</span></div>
      <div style="font-size:20px;font-weight:600;letter-spacing:-.2px">Profile</div></div>
    <div style="flex:1;overflow:hidden;padding:0 16px">
      <div style="margin-top:-12px">${label('Safety')}</div>
      <div style="background:var(--surfaceRaised);border-radius:16px;box-shadow:var(--e1)">${row('shield', 'Emergency contacts', '2', true)}</div>
      ${label('Appearance')}
      <div style="background:var(--surfaceRaised);border-radius:16px;box-shadow:var(--e1);padding:16px">
        <div style="font-size:16px;line-height:22px;font-weight:600">Style</div>
        <div style="font-size:14px;line-height:20px;color:var(--textMuted);margin:2px 0 12px">Changes the colours and the map. Alert colours never change.</div>
        <div style="display:flex;gap:12px">${card('tribe', 'Tribe', 'Bold orange')}${card('maps', 'Maps', 'Familiar blue')}</div>
        <div style="height:1px;background:var(--border);margin:16px -16px"></div>
        <div style="font-size:16px;line-height:22px;font-weight:600;margin-bottom:8px">Light or dark</div>
        ${seg(['Auto', 'Light', 'Dark'], 'Auto')}
        <div style="font-size:14px;line-height:20px;color:var(--textMuted);margin-top:8px">Pick Light for bright sun.</div>
      </div>
    </div>${UI.gest()}</div>`;
};
