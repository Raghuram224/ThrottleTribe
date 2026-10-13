/* SOS takeover (07 §3, round4b/04): identical in every style. Mockup only. */
window.renderSos = function ({ style = 'maps' } = {}) {
  if (style === 'maps') document.documentElement.classList.add('maps'); // proves nothing below reads style tokens
  const R = '#B91C1C';
  const contact = (name, num, strong) => `<div style="height:56px;border-radius:16px;display:flex;align-items:center;gap:14px;padding:0 18px;
      box-shadow:inset 0 0 0 2px rgba(255,255,255,.6);${strong ? 'background:rgba(255,255,255,.14);' : ''}">
      <span class="ms f" style="font-size:24px">call</span><span style="flex:1;font-size:18px;font-weight:600">${name}</span><span class="num" style="font-size:16px">${num}</span></div>`;
  document.body.innerHTML = `<div class="phone" style="background:${R};color:#fff">${UI.statusBar('8:37', true)}
    <div style="padding:28px 16px 0">
      <div style="display:flex;align-items:center;gap:12px"><span class="ms f" style="font-size:40px">warning</span><span style="font-size:15px;font-weight:600;letter-spacing:.6px">SOS</span></div>
      <div style="font-size:28px;line-height:34px;font-weight:700;letter-spacing:-.5px;margin-top:8px">Karthik needs help</div>
      <div class="num" style="font-size:36px;line-height:42px;font-weight:700;letter-spacing:-.8px;margin-top:4px">400 m ahead of you</div>
      <div class="num" style="font-size:15px;line-height:22px;opacity:.92;margin-top:6px">Last position &lt;1 min ago · Sent 8:37 PM</div>
    </div>
    <div style="flex:1"></div>
    <div style="padding:0 16px;display:flex;flex-direction:column;gap:12px">
      <div style="height:60px;border-radius:16px;background:#fff;color:${R};display:flex;align-items:center;justify-content:center;gap:10px;font-size:19px;font-weight:700"><span class="ms f" style="font-size:24px">near_me</span>Navigate to Karthik</div>
      <div style="height:56px;border-radius:16px;box-shadow:inset 0 0 0 2px #fff;display:flex;align-items:center;justify-content:center;gap:10px;font-size:18px;font-weight:600"><span class="ms" style="font-size:24px">two_wheeler</span>I'm on my way</div>
      <div class="t-label" style="margin:10px 0 0;opacity:.92">Call Karthik's emergency contacts</div>
      ${contact('Mother', '+91 00000 00001')}${contact('Ambulance', '108')}${contact('Emergency', '112', true)}
      <div style="display:flex;align-items:center;gap:8px;font-size:14px;opacity:.92"><span class="ms f" style="font-size:16px">lock</span>Visible only while Karthik's SOS is on.</div>
    </div>
    <div style="height:72px;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:600;margin-top:8px">Dismiss</div>${UI.gest(true)}</div>`;
};
