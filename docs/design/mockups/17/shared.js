/* Shared mockup helpers: real OpenFreeMap tiles via maplibre-gl, route geometry from route.js
   (OSRM route Bengaluru -> Nandi Hills, 61 km). Mockup-only code; not app code. */
(function () {
  const R = 6371000;
  function pointAtM(m) {
    const C = window.CUM, P = window.ROUTE;
    if (m <= 0) return P[0];
    for (let i = 1; i < C.length; i++) {
      if (C[i] >= m) {
        const f = (m - C[i - 1]) / (C[i] - C[i - 1] || 1);
        return [P[i - 1][0] + f * (P[i][0] - P[i - 1][0]), P[i - 1][1] + f * (P[i][1] - P[i - 1][1])];
      }
    }
    return P[P.length - 1];
  }
  function slice(fromM, toM) {
    const C = window.CUM, P = window.ROUTE, out = [pointAtM(fromM)];
    for (let i = 0; i < C.length; i++) if (C[i] > fromM && C[i] < toM) out.push(P[i]);
    out.push(pointAtM(toM));
    return out;
  }
  function bearingAt(m) {
    const a = pointAtM(m - 30), b = pointAtM(m + 30);
    const y = Math.sin((b[0] - a[0]) * Math.PI / 180) * Math.cos(b[1] * Math.PI / 180);
    const x = Math.cos(a[1] * Math.PI / 180) * Math.sin(b[1] * Math.PI / 180) -
      Math.sin(a[1] * Math.PI / 180) * Math.cos(b[1] * Math.PI / 180) * Math.cos((b[0] - a[0]) * Math.PI / 180);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }
  window.TT = { pointAtM, slice, bearingAt };

  /**
   * opts: { el, style: 'liberty'|'positron'|'dark'|'fiord', fit: [fromM,toM] | center/zoom, padding,
   *   trails: [{fromM,toM,color,width,casing,opacity}], markers: [{m, html, anchor}], bearing }
   */
  window.makeMap = function (opts) {
    const style = 'https://tiles.openfreemap.org/styles/' + (opts.style || 'liberty');
    const map = new maplibregl.Map({
      container: opts.el, style, interactive: false, attributionControl: false,
      center: opts.center || pointAtM(((opts.fit || [0, 0])[0] + (opts.fit || [0, 0])[1]) / 2),
      zoom: opts.zoom || 12, bearing: opts.bearing || 0, fadeDuration: 0,
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });
    if (opts.fit) {
      const pts = slice(opts.fit[0], opts.fit[1]);
      const b = pts.reduce((bb, p) => bb.extend(p), new maplibregl.LngLatBounds(pts[0], pts[0]));
      map.fitBounds(b, { padding: opts.padding || 40, duration: 0, bearing: opts.bearing || 0 });
    }
    map.on('load', () => {
      (opts.trails || []).forEach((t, i) => {
        const id = 'trail' + i;
        map.addSource(id, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: slice(t.fromM, t.toM) } } });
        // Route goes above roads/buildings, below labels (Google-style): first symbol layer after the last road/building layer.
        const L = map.getStyle().layers;
        const lastRoad = L.reduce((k, l, idx) => (['transportation', 'building'].includes(l['source-layer']) && ['line', 'fill'].includes(l.type) ? idx : k), -1);
        const before = (L.find((l, idx) => idx > lastRoad && l.type === 'symbol') || {}).id;
        if (t.casing) map.addLayer({ id: id + 'c', type: 'line', source: id, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': t.casing, 'line-width': t.casingWidth || (t.width || 5) + 4, 'line-opacity': t.casingOpacity == null ? 1 : t.casingOpacity } }, before);
        map.addLayer({ id, type: 'line', source: id, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': t.color, 'line-width': t.width || 5, 'line-opacity': t.opacity == null ? 1 : t.opacity, ...(t.dash ? { 'line-dasharray': t.dash } : {}) } }, before);
        if (t.chevrons) map.addLayer({ id: id + 'ch', type: 'symbol', source: id, minzoom: 13,
          layout: { 'symbol-placement': 'line', 'symbol-spacing': 64, 'text-field': '›', 'text-font': ['Noto Sans Bold'], 'text-size': ['interpolate',['linear'],['zoom'],13,14,17,20], 'text-keep-upright': false, 'text-allow-overlap': true, 'text-offset': [0, -0.08] },
          paint: { 'text-color': t.chevrons, 'text-opacity': 0.9 } });
      });
      (opts.markers || []).forEach((mk) => {
        const d = document.createElement('div');
        d.innerHTML = mk.html;
        new maplibregl.Marker({ element: d.firstElementChild, anchor: mk.anchor || 'center' }).setLngLat(mk.at || pointAtM(mk.m)).addTo(map);
      });
      map.once('idle', () => { document.body.dataset.mapReady = '1'; });
    });
    return map;
  };
})();
