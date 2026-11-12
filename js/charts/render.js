/* Dibujo de gráficas en SVG, sin dependencias: columnas, barras, líneas, áreas, circular, anillo, dispersión,
   burbujas, radial, combinada e histograma. Devuelve el SVG y la geometría que usa la capa de interacción. */
(function () {
  'use strict';
  const HC = window.HC;
  const R = (HC.chartRender = {});
  const FONT = '"Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';
  const FONT_ATTR = 'Segoe UI, system-ui, -apple-system, Helvetica Neue, Arial, sans-serif';
  R.FONT = FONT;
  // Paleta categórica validada (orden fijo) y tintas, en claro. El tema oscuro sale de las variables CSS.
  R.LIGHT = { surface: '#ffffff', text: '#0b0b0b', text2: '#52514e', muted: '#7d7b75', grid: '#e1e0d9', axis: '#c3c2b7', series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'] };
  R.theme = function () {
    const cs = getComputedStyle(document.documentElement), L = R.LIGHT;
    const v = (n, d) => cs.getPropertyValue(n).trim() || d;
    return { surface: v('--chart-surface', L.surface), text: v('--chart-text', L.text), text2: v('--chart-text-2', L.text2), muted: v('--chart-muted', L.muted), grid: v('--chart-grid', L.grid), axis: v('--chart-axis', L.axis), series: L.series.map((c, i) => v('--s' + (i + 1), c)) };
  };

  // ---------------------------------------------------------------- utilidades
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const n1 = (v) => Math.round(v * 10) / 10;
  const pt = (p) => n1(p[0]) + ',' + n1(p[1]);
  const num = (v) => (v === '' || v == null ? null : typeof v === 'number' ? v : HC.textToNumber(String(v)));
  let mctx = null;
  const measure = (t, size, weight) => {
    if (!mctx) mctx = document.createElement('canvas').getContext('2d');
    mctx.font = (weight || 400) + ' ' + size + 'px ' + FONT;
    return mctx.measureText(String(t)).width;
  };
  R.measure = measure;
  function clip(t, maxW, size, weight) {
    t = String(t);
    if (maxW <= 0) return '';
    if (measure(t, size, weight) <= maxW) return t;
    let lo = 0, hi = t.length;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (measure(t.slice(0, mid) + '…', size, weight) <= maxW) lo = mid; else hi = mid - 1; }
    return lo ? t.slice(0, lo) + '…' : '';
  }
  const text = (x, y, s, size, fill, anchor, extra) => '<text x="' + n1(x) + '" y="' + n1(y) + '" dy="0.35em" font-size="' + size + '"' + (anchor ? ' text-anchor="' + anchor + '"' : '') + ' fill="' + fill + '"' + (extra || '') + '>' + esc(s) + '</text>';
  const hline = (x, y, w, fill) => '<rect x="' + n1(x) + '" y="' + Math.round(y) + '" width="' + n1(w) + '" height="1" fill="' + fill + '"/>';
  const vline = (x, y, hh, fill) => '<rect x="' + Math.round(x) + '" y="' + n1(y) + '" width="1" height="' + n1(hh) + '" fill="' + fill + '"/>';
  function rgb(hex) { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); const v = m ? parseInt(m[1], 16) : 0; return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
  function lum(hex) { const c = rgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
  // Texto dentro de un relleno de color: blanco o casi negro, el que más contraste.
  const inkOn = (hex) => { const L = lum(hex); return 1.05 / (L + 0.05) >= (L + 0.05) / 0.0537 ? '#ffffff' : '#0b0b0b'; };
  R.inkOn = inkOn;

  // ---------------------------------------------------------------- escalas
  function niceStep(raw) {
    if (!(raw > 0) || !isFinite(raw)) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }
  R.niceStep = niceStep;
  function niceScale(lo, hi, count, o) {
    o = o || {};
    if (o.min != null) lo = o.min;
    if (o.max != null) hi = o.max;
    if (!isFinite(lo) || !isFinite(hi)) { lo = 0; hi = 1; }
    if (lo > hi) { const t = lo; lo = hi; hi = t; }
    if (lo === hi) {
      if (lo === 0) hi = 1;
      else if (lo > 0) { if (o.min == null) lo = o.zero ? 0 : lo * 0.9; if (o.max == null) hi = hi * 1.1; }
      else { if (o.max == null) hi = o.zero ? 0 : hi * 0.9; if (o.min == null) lo = lo * 1.1; }
    }
    const step = niceStep((hi - lo) / Math.max(1, count));
    const min = o.min != null ? lo : Math.floor(lo / step + 1e-9) * step;
    let max = o.max != null ? hi : Math.ceil(hi / step - 1e-9) * step;
    if (max <= min) max = min + step;
    const ticks = [];
    const first = o.min != null ? Math.ceil(min / step - 1e-9) * step : min;
    if (o.min != null && Math.abs(first - min) > step * 1e-6) ticks.push(min);
    for (let k = 0; k < 200; k++) { const v = first + step * k; if (v > max + step * 1e-6) break; ticks.push(parseFloat(v.toPrecision(12))); }
    if (o.max != null && Math.abs(ticks[ticks.length - 1] - max) > step * 1e-6) ticks.push(max);
    return { min, max, step, ticks };
  }
  R.niceScale = niceScale;
  // Etiquetas del eje de valores: respetan moneda, porcentaje y fechas; compactas (K, M) desde 10 000.
  function tickFormatter(nf, step, maxAbs, percent) {
    const kind = nf ? HC.fmt.kind(nf) : 'general';
    const dec = (d) => (d > 0 ? '.' + '0'.repeat(d) : '');
    if (percent || kind === 'percent') {
      const d = HC.clamp(-Math.floor(Math.log10(step * 100) + 1e-9), 0, 4);
      return (v) => HC.fmt.format(v, '0' + dec(d) + '%').text;
    }
    if (kind === 'date' || kind === 'time') return (v) => HC.fmt.format(v, nf).text;
    let pre = '', post = '';
    if (kind === 'currency' || /^_\(/.test(nf || '')) {
      const m = /"([^"]+)"|\[\$([^\]-]+)/.exec(nf || '');
      const sym = m ? m[1] || m[2] : HC.locale.currency;
      if ((nf || '').indexOf(sym) > (nf || '').search(/[0#]/)) post = ' ' + sym; else pre = sym;
    }
    if (maxAbs >= 10000) {
      const u = maxAbs >= 1e9 ? [1e9, ' mil M'] : maxAbs >= 1e6 ? [1e6, ' M'] : [1e3, 'K'];
      const d = HC.clamp(-Math.floor(Math.log10(step / u[0]) + 1e-9), 0, 3);
      return (v) => (v < 0 ? '-' : '') + pre + HC.fmt.format(Math.abs(v) / u[0], '#,##0' + dec(d)).text + u[1] + post;
    }
    const d = HC.clamp(-Math.floor(Math.log10(step) + 1e-9), 0, 6);
    return (v) => (v < 0 ? '-' : '') + pre + HC.fmt.format(Math.abs(v), '#,##0' + dec(d)).text + post;
  }
  R.tickFormatter = tickFormatter;

  // ---------------------------------------------------------------- trazos
  // Curva monótona (Fritsch–Carlson): suaviza sin pasarse de los valores reales.
  function monoSegs(P) {
    const n = P.length, dx = [], m = [], t = new Array(n);
    for (let i = 0; i < n - 1; i++) { dx[i] = P[i + 1][0] - P[i][0] || 1e-6; m[i] = (P[i + 1][1] - P[i][1]) / dx[i]; }
    t[0] = m[0]; t[n - 1] = m[n - 2];
    for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
      const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
      if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
    }
    const out = [];
    for (let i = 0; i < n - 1; i++) { const hh = dx[i] / 3; out.push([P[i], [P[i][0] + hh, P[i][1] + t[i] * hh], [P[i + 1][0] - hh, P[i + 1][1] - t[i + 1] * hh], P[i + 1]]); }
    return out;
  }
  function pathOf(P, smooth) {
    if (!smooth || P.length < 3) return 'M' + P.map(pt).join('L');
    return 'M' + pt(P[0]) + monoSegs(P).map((s) => 'C' + pt(s[1]) + ' ' + pt(s[2]) + ' ' + pt(s[3])).join('');
  }
  function pathBack(P, smooth) { // continúa el trazo recorriendo P desde el final hasta el principio
    const Q = P.slice().reverse();
    if (!smooth || P.length < 3) return 'L' + Q.map(pt).join('L');
    return 'L' + pt(Q[0]) + monoSegs(P).reverse().map((s) => 'C' + pt(s[2]) + ' ' + pt(s[1]) + ' ' + pt(s[0])).join('');
  }
  // Barra vertical de x a x+w, desde la base y0 hasta el valor y1, con el extremo de datos redondeado.
  function vbar(x, y0, w, y1, rad) {
    const hh = Math.abs(y1 - y0), r = Math.min(rad, w / 2, hh);
    x = n1(x); y0 = n1(y0); y1 = n1(y1); w = n1(w);
    if (r < 0.6) return 'M' + x + ',' + y0 + 'H' + n1(x + w) + 'V' + y1 + 'H' + x + 'Z';
    const rr = n1(r);
    if (y1 < y0) return 'M' + x + ',' + y0 + 'V' + n1(y1 + r) + 'A' + rr + ',' + rr + ' 0 0 1 ' + n1(x + r) + ',' + y1 + 'H' + n1(x + w - r) + 'A' + rr + ',' + rr + ' 0 0 1 ' + n1(x + w) + ',' + n1(y1 + r) + 'V' + y0 + 'Z';
    return 'M' + x + ',' + y0 + 'V' + n1(y1 - r) + 'A' + rr + ',' + rr + ' 0 0 0 ' + n1(x + r) + ',' + y1 + 'H' + n1(x + w - r) + 'A' + rr + ',' + rr + ' 0 0 0 ' + n1(x + w) + ',' + n1(y1 - r) + 'V' + y0 + 'Z';
  }
  // Barra horizontal de grosor hh en y, desde x0 hasta x1.
  function hbar(y, x0, hh, x1, rad) {
    const w = Math.abs(x1 - x0), r = Math.min(rad, hh / 2, w);
    y = n1(y); x0 = n1(x0); x1 = n1(x1); hh = n1(hh);
    if (r < 0.6) return 'M' + x0 + ',' + y + 'V' + n1(y + hh) + 'H' + x1 + 'V' + y + 'Z';
    const rr = n1(r);
    if (x1 > x0) return 'M' + x0 + ',' + y + 'H' + n1(x1 - r) + 'A' + rr + ',' + rr + ' 0 0 1 ' + x1 + ',' + n1(y + r) + 'V' + n1(y + hh - r) + 'A' + rr + ',' + rr + ' 0 0 1 ' + n1(x1 - r) + ',' + n1(y + hh) + 'H' + x0 + 'Z';
    return 'M' + x0 + ',' + y + 'H' + n1(x1 + r) + 'A' + rr + ',' + rr + ' 0 0 0 ' + x1 + ',' + n1(y + r) + 'V' + n1(y + hh - r) + 'A' + rr + ',' + rr + ' 0 0 0 ' + n1(x1 + r) + ',' + n1(y + hh) + 'H' + x0 + 'Z';
  }
  // Formas de marcador: la serie de dispersión k usa la forma k (codificación secundaria además del color).
  function shapeD(k, x, y, r) {
    switch (k % 6) {
      case 1: { const a = r * 0.9; return 'M' + n1(x - a) + ',' + n1(y - a) + 'h' + n1(2 * a) + 'v' + n1(2 * a) + 'h' + n1(-2 * a) + 'Z'; }
      case 2: return 'M' + n1(x) + ',' + n1(y - r * 1.2) + 'L' + n1(x + r * 1.1) + ',' + n1(y + r * 0.8) + 'L' + n1(x - r * 1.1) + ',' + n1(y + r * 0.8) + 'Z';
      case 3: return 'M' + n1(x) + ',' + n1(y - r * 1.25) + 'L' + n1(x + r * 1.25) + ',' + n1(y) + 'L' + n1(x) + ',' + n1(y + r * 1.25) + 'L' + n1(x - r * 1.25) + ',' + n1(y) + 'Z';
      case 4: return 'M' + n1(x) + ',' + n1(y + r * 1.2) + 'L' + n1(x + r * 1.1) + ',' + n1(y - r * 0.8) + 'L' + n1(x - r * 1.1) + ',' + n1(y - r * 0.8) + 'Z';
      case 5: { let d = ''; for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i; d += (i ? 'L' : 'M') + n1(x + r * 1.1 * Math.cos(a)) + ',' + n1(y + r * 1.1 * Math.sin(a)); } return d + 'Z'; }
      default: return 'M' + n1(x - r) + ',' + n1(y) + 'a' + r + ',' + r + ' 0 1,0 ' + 2 * r + ',0a' + r + ',' + r + ' 0 1,0 ' + -2 * r + ',0Z';
    }
  }
  R.shapeD = shapeD;
  // Marcador con anillo de 2 px del color del fondo, para que se lea donde cruza una línea.
  const marker = (k, x, y, r, color, surface) => '<path d="' + shapeD(k, x, y, r + 2) + '" fill="' + surface + '"/><path d="' + shapeD(k, x, y, r) + '" fill="' + color + '"/>';
  function arcPath(cx, cy, r, r0, a0, a1) {
    if (a1 - a0 >= Math.PI * 2 - 1e-9) {
      const ring = (rr, sweep) => 'M' + n1(cx - rr) + ',' + n1(cy) + 'a' + n1(rr) + ',' + n1(rr) + ' 0 1,' + sweep + ' ' + n1(2 * rr) + ',0a' + n1(rr) + ',' + n1(rr) + ' 0 1,' + sweep + ' ' + n1(-2 * rr) + ',0Z';
      return ring(r, 0) + (r0 ? ring(r0, 1) : '');
    }
    const large = a1 - a0 > Math.PI ? 1 : 0, p = (rr, a) => n1(cx + rr * Math.cos(a)) + ',' + n1(cy + rr * Math.sin(a));
    if (!r0) return 'M' + n1(cx) + ',' + n1(cy) + 'L' + p(r, a0) + 'A' + n1(r) + ',' + n1(r) + ' 0 ' + large + ' 1 ' + p(r, a1) + 'Z';
    return 'M' + p(r0, a0) + 'L' + p(r, a0) + 'A' + n1(r) + ',' + n1(r) + ' 0 ' + large + ' 1 ' + p(r, a1) + 'L' + p(r0, a1) + 'A' + n1(r0) + ',' + n1(r0) + ' 0 ' + large + ' 0 ' + p(r0, a0) + 'Z';
  }
  R.arcPath = arcPath;
  function regression(xs, ys) {
    let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
    for (let i = 0; i < xs.length; i++) { const x = xs[i], y = ys[i]; if (x == null || y == null) continue; n++; sx += x; sy += y; sxx += x * x; sxy += x * y; syy += y * y; }
    if (n < 2) return null;
    const d = n * sxx - sx * sx;
    if (!d) return null;
    const m = (n * sxy - sx * sy) / d, b = (sy - m * sx) / n;
    const ss = syy - (sy * sy) / n, r2 = ss ? Math.pow(n * sxy - sx * sy, 2) / (d * (n * syy - sy * sy)) : 1;
    return { m, b, r2 };
  }

  // ---------------------------------------------------------------- leyenda
  function legend(items, pos, W, area, T) {
    const FS = 11.5, SW = 12, GAP = 6, IG = 16, RH = 18, parts = [];
    const sw = (it, x, cy) => {
      if (it.mark === 'line') return '<rect x="' + n1(x) + '" y="' + n1(cy - 1.25) + '" width="' + SW + '" height="2.5" rx="1.25" fill="' + it.color + '"/>';
      if (it.mark === 'shape') return '<path d="' + shapeD(it.shape, x + SW / 2, cy, 4.2) + '" fill="' + it.color + '"/>';
      return '<rect x="' + n1(x + 1) + '" y="' + n1(cy - 5) + '" width="10" height="10" rx="2" fill="' + it.color + '"/>';
    };
    if (pos === 'right') {
      const maxText = Math.min(W * 0.3, Math.max.apply(null, items.map((it) => measure(it.name, FS))));
      const x0 = area.right - (SW + GAP + maxText);
      const list = items.slice(0, Math.max(1, Math.floor((area.bottom - area.top) / RH)));
      let y = area.top + Math.max(0, (area.bottom - area.top - list.length * RH) / 2) + RH / 2;
      for (const it of list) { parts.push(sw(it, x0, y), text(x0 + SW + GAP, y, clip(it.name, maxText + 0.5, FS), FS, T.text2)); y += RH; }
      area.right = x0 - 16;
    } else {
      const avail = area.right - area.left, rows = [[]];
      let used = 0;
      for (const it of items) {
        const tw = Math.min(measure(it.name, FS), Math.max(40, Math.min(180, avail - SW - GAP))), iw = SW + GAP + tw;
        if (rows[rows.length - 1].length && used + IG + iw > avail) { rows.push([]); used = 0; }
        const row = rows[rows.length - 1];
        used += (row.length ? IG : 0) + iw;
        row.push({ it, tw, iw });
      }
      const shown = rows.slice(0, 3), totalH = shown.length * RH;
      let y = (pos === 'top' ? area.top : area.bottom - totalH) + RH / 2;
      for (const row of shown) {
        const rw = row.reduce((s, x) => s + x.iw, 0) + IG * (row.length - 1);
        let x = area.left + Math.max(0, (avail - rw) / 2);
        for (const { it, tw, iw } of row) { parts.push(sw(it, x, y), text(x + SW + GAP, y, clip(it.name, tw + 0.5, FS), FS, T.text2)); x += iw + IG; }
        y += RH;
      }
      if (pos === 'top') area.top += totalH + 8; else area.bottom -= totalH + 8;
    }
    return parts.join('');
  }

  // ---------------------------------------------------------------- columnas, barras, líneas, áreas, combinada, histograma
  function bandChart(c) {
    const { spec, data, W, T, o, area, out, colorOf, id } = c;
    const type = spec.type, horiz = type === 'bar', isHist = type === 'histogram';
    const S = data.series, n = data.cats.length, FS = 11;
    const kinds = S.map((s, i) => (type === 'combo' ? (o.kinds && o.kinds[i]) || (S.length > 1 && i === S.length - 1 ? 'line' : 'col') : type === 'line' ? 'line' : type === 'area' ? 'area' : 'col'));
    const mode = /^(column|bar|line|area)$/.test(type) ? o.stacked || 'none' : 'none';
    const stacked = mode !== 'none', pct = mode === 'percent';
    const base = S.map(() => new Array(n).fill(0)), top = S.map(() => new Array(n).fill(null));
    const outerPos = new Array(n).fill(-1), outerNeg = new Array(n).fill(-1);
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < n; i++) {
      if (stacked) {
        let tot = 0, pos = 0, neg = 0;
        if (pct) for (const s of S) { const v = s.values[i]; if (v != null) tot += Math.abs(v); }
        S.forEach((s, k) => {
          let v = s.values[i];
          if (v == null) { if (kinds[k] === 'col') return; v = 0; }
          if (pct) v = tot ? v / tot : 0;
          if (v >= 0) { base[k][i] = pos; pos += v; top[k][i] = pos; if (v > 0) outerPos[i] = k; }
          else { base[k][i] = neg; neg += v; top[k][i] = neg; outerNeg[i] = k; }
        });
        lo = Math.min(lo, neg); hi = Math.max(hi, pos);
      } else S.forEach((s, k) => { const v = s.values[i]; if (v != null) { top[k][i] = v; if (v < lo) lo = v; if (v > hi) hi = v; } });
    }
    if (!isFinite(lo)) { lo = 0; hi = 1; }
    const needZero = stacked || kinds.some((k) => k !== 'line');
    if (needZero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    else if (lo > 0 && lo < (hi * 5) / 6) lo = 0;
    else if (hi < 0 && hi > (lo * 5) / 6) hi = 0;
    const valLen = horiz ? area.right - area.left : area.bottom - area.top;
    const sc = niceScale(lo, hi, HC.clamp(Math.round(valLen / (horiz ? 90 : 48)), 2, 8), { zero: needZero, min: num(o.yMin), max: num(o.yMax) });
    const fmt = tickFormatter(pct ? '0%' : data.nf, sc.step, Math.max(Math.abs(sc.min), Math.abs(sc.max)), pct);
    const tl = sc.ticks.map(fmt);
    const catTitle = o.xTitle, valTitle = o.yTitle;
    const midY = (area.top + area.bottom) / 2;
    let cw = 0;
    if (!horiz) {
      if (valTitle) { out.push(text(area.left + 6, midY, clip(valTitle, area.bottom - area.top, 12), 12, T.text2, 'middle', ' transform="rotate(-90 ' + n1(area.left + 6) + ' ' + n1(midY) + ')"')); area.left += 20; }
      if (catTitle) { out.push(text((area.left + area.right) / 2, area.bottom - 6, clip(catTitle, area.right - area.left, 12), 12, T.text2, 'middle')); area.bottom -= 20; }
      area.left += Math.max.apply(null, tl.map((t) => measure(t, FS))) + 8;
      area.bottom -= 20;
    } else {
      if (catTitle) { out.push(text(area.left + 6, midY, clip(catTitle, area.bottom - area.top, 12), 12, T.text2, 'middle', ' transform="rotate(-90 ' + n1(area.left + 6) + ' ' + n1(midY) + ')"')); area.left += 20; }
      if (valTitle) { out.push(text((area.left + area.right) / 2, area.bottom - 6, clip(valTitle, area.right - area.left, 12), 12, T.text2, 'middle')); area.bottom -= 20; }
      cw = Math.min((area.right - area.left) * 0.34, Math.max.apply(null, data.cats.map((t) => measure(t, FS))));
      area.left += cw + 10;
      area.bottom -= 20;
      area.right -= measure(tl[tl.length - 1], FS) / 2;
    }
    // etiquetas al final de cada línea (2 a 4 series), además de la leyenda
    let endW = null;
    if (!horiz && type === 'line' && S.length >= 2 && S.length <= 4 && W >= 360 && o.endLabels !== false) {
      const ws = S.map((s) => Math.min(110, measure(s.name, FS)));
      const need = Math.max.apply(null, ws) + 12;
      if (area.right - area.left - need > 140) { endW = ws; area.right -= need; }
    }
    const P = { x: area.left, y: area.top, w: area.right - area.left, h: area.bottom - area.top };
    if (P.w < 30 || P.h < 30) { out.push(text(W / 2, (area.top + area.bottom) / 2, 'Amplía la gráfica para verla', 12, T.muted, 'middle')); return null; }
    const span = sc.max - sc.min || 1;
    const V = horiz ? (v) => P.x + ((v - sc.min) / span) * P.w : (v) => P.y + P.h - ((v - sc.min) / span) * P.h;
    const band = (horiz ? P.h : P.w) / n, C0 = horiz ? P.y : P.x, center = (i) => C0 + band * (i + 0.5);
    const zero = V(HC.clamp(0, sc.min, sc.max));
    // cuadrícula y escala
    sc.ticks.forEach((t, k) => {
      const p = V(t);
      if (o.grid !== false && Math.abs(p - zero) > 0.6) out.push(horiz ? vline(p, P.y, P.h, T.grid) : hline(P.x, p, P.w, T.grid));
      out.push(horiz ? text(p, P.y + P.h + 12, tl[k], FS, T.muted, 'middle') : text(P.x - 8, p, tl[k], FS, T.muted, 'end'));
    });
    out.push(horiz ? vline(zero, P.y, P.h, T.axis) : hline(P.x, zero, P.w, T.axis));
    // categorías: se omiten las que no caben, nunca se solapan
    if (!horiz) {
      const maxLW = Math.max(1, Math.max.apply(null, data.cats.map((t) => measure(t, FS))));
      const every = Math.max(1, Math.ceil((maxLW + 8) / band));
      for (let i = 0; i < n; i += every) out.push(text(center(i), P.y + P.h + 12, clip(data.cats[i], band * every - 6, FS), FS, T.muted, 'middle'));
    } else {
      const every = Math.max(1, Math.ceil(15 / band));
      for (let i = 0; i < n; i += every) out.push(text(P.x - 8, center(i), clip(data.cats[i], cw, FS), FS, T.muted, 'end'));
    }
    out.push('<g class="hl-back"></g>');
    out.push('<clipPath id="pc-' + id + '"><rect x="' + n1(P.x - 8) + '" y="' + n1(P.y - 8) + '" width="' + n1(P.w + 16) + '" height="' + n1(P.h + 16) + '"/></clipPath><g clip-path="url(#pc-' + id + ')">');
    // áreas (debajo de todo)
    const linePts = S.map(() => null), smooth = !!o.smooth;
    kinds.forEach((kd, k) => {
      if (kd === 'col') return;
      const pts = [];
      for (let i = 0; i < n; i++) { const t = top[k][i]; pts.push(t == null ? null : [center(i), V(HC.clamp(t, sc.min - span, sc.max + span))]); }
      linePts[k] = pts;
      if (kd !== 'area') return;
      for (const ix of runs(pts)) {
        const tp = ix.map((i) => pts[i]), bp = ix.map((i) => [center(i), stacked ? V(base[k][i]) : zero]);
        out.push('<path d="' + pathOf(tp, smooth) + pathBack(bp, smooth && stacked) + 'Z" fill="' + colorOf(k) + '" fill-opacity="' + (stacked ? 0.28 : 0.12) + '"/>');
      }
    });
    // barras: grosor máximo de 24 px, 2 px de separación entre barras vecinas y segmentos apilados
    const colK = kinds.map((kd, i) => (kd === 'col' ? i : -1)).filter((i) => i >= 0), nc = colK.length, bars = [];
    let bw = 0, offs = () => 0;
    if (nc) {
      if (isHist) { bw = Math.max(1, band - 2); offs = () => 1; }
      else if (stacked) { bw = HC.clamp(band * 0.72, 1, 24); offs = () => (band - bw) / 2; }
      else { bw = HC.clamp((band * 0.72 - 2 * (nc - 1)) / nc, 1, 24); const tot = nc * bw + 2 * (nc - 1); offs = (j) => (band - tot) / 2 + j * (bw + 2); }
    }
    colK.forEach((k, j) => {
      let d = '';
      for (let i = 0; i < n; i++) {
        const t = top[k][i];
        if (t == null) continue;
        const b = stacked ? base[k][i] : HC.clamp(0, sc.min, sc.max);
        let p0 = V(HC.clamp(b, sc.min, sc.max));
        const p1 = V(HC.clamp(t, sc.min, sc.max));
        if (stacked && b !== 0) { const dir = p1 > p0 ? 1 : -1; p0 += 2 * dir; if ((p1 - p0) * dir <= 0) continue; }
        const outer = !stacked || (t >= 0 ? outerPos[i] === k : outerNeg[i] === k);
        const s0 = C0 + band * i + offs(j);
        d += horiz ? hbar(s0, p0, bw, p1, outer ? 4 : 0) : vbar(s0, p0, bw, p1, outer ? 4 : 0);
        bars.push({ k, i, s0, p0, p1 });
      }
      if (d) out.push('<path d="' + d + '" fill="' + colorOf(k) + '"/>');
    });
    // líneas de tendencia
    if (o.trend && !stacked) S.forEach((s, k) => {
      const xs = s.values.map((v, i) => (v == null ? null : i)), g = regression(xs, s.values);
      if (!g) return;
      const a = [center(0), V(g.b)], b = [center(n - 1), V(g.b + g.m * (n - 1))];
      out.push('<path d="M' + pt(a) + 'L' + pt(b) + '" stroke="' + colorOf(k) + '" stroke-width="1.5" stroke-dasharray="5 4" fill="none" opacity="0.9"/>');
    });
    // líneas y marcadores
    const showMarkers = o.markers === true || (o.markers !== false && n <= 24);
    const marks = [];
    kinds.forEach((kd, k) => {
      if (kd === 'col') return;
      const pts = linePts[k], color = colorOf(k);
      for (const ix of runs(pts)) {
        if (ix.length === 1) { marks.push(marker(0, pts[ix[0]][0], pts[ix[0]][1], 3.5, color, T.surface)); continue; }
        out.push('<path d="' + pathOf(ix.map((i) => pts[i]), smooth) + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>');
      }
      if (showMarkers && kd === 'line') pts.forEach((p) => { if (p) marks.push(marker(0, p[0], p[1], 4, color, T.surface)); });
    });
    out.push(marks.join(''), '</g>');
    // etiquetas de datos
    if (o.labels) {
      for (const g of bars) {
        const s = S[g.k], share = top[g.k][g.i] - (stacked ? base[g.k][g.i] : 0);
        const txt = pct ? HC.fmt.format(share, '0%').text : s.texts[g.i] || fmt(s.values[g.i]);
        if (stacked) {
          const len = Math.abs(g.p1 - g.p0), tw = measure(txt, 10.5);
          if (horiz ? len < tw + 6 || bw < 13 : len < 14 || bw < tw + 4) continue;
          out.push(text(horiz ? (g.p0 + g.p1) / 2 : g.s0 + bw / 2, horiz ? g.s0 + bw / 2 : (g.p0 + g.p1) / 2, txt, 10.5, inkOn(colorOf(g.k)), 'middle'));
        } else {
          const neg = s.values[g.i] < 0;
          out.push(horiz ? text(g.p1 + (neg ? -5 : 5), g.s0 + bw / 2, txt, 10.5, T.text2, neg ? 'end' : 'start') : text(g.s0 + bw / 2, g.p1 + (neg ? 9 : -9), txt, 10.5, T.text2, 'middle'));
        }
      }
      kinds.forEach((kd, k) => {
        if (kd === 'col') return;
        linePts[k].forEach((p, i) => { if (p) out.push(text(p[0], p[1] - 11, pct ? HC.fmt.format(top[k][i] - base[k][i], '0%').text : S[k].texts[i] || fmt(S[k].values[i]), 10.5, T.text2, 'middle')); });
      });
    }
    if (endW) {
      const ends = [];
      S.forEach((s, k) => { const pts = linePts[k]; if (!pts) return; for (let i = n - 1; i >= 0; i--) if (pts[i]) { ends.push({ k, y: pts[i][1] }); break; } });
      ends.sort((a, b) => a.y - b.y);
      if (ends.every((e, j) => j === 0 || e.y - ends[j - 1].y >= 13)) for (const e of ends) out.push(text(P.x + P.w + 8, e.y, clip(S[e.k].name, endW[e.k] + 1, FS), FS, T.text2, 'start'));
    }
    out.push('<g class="hl-front"></g>');
    return { kind: 'band', horiz, P, n, band, C0, cats: data.cats, pct, pts: linePts, tops: top, bases: base, series: S.map((s, k) => ({ name: s.name, color: colorOf(k), texts: s.texts, values: s.values, kind: kinds[k] })) };
  }
  function runs(pts) { // índices de los tramos consecutivos sin huecos
    const out = [];
    let cur = null;
    pts.forEach((p, i) => { if (p) { if (!cur) out.push((cur = [])); cur.push(i); } else cur = null; });
    return out;
  }

  // ---------------------------------------------------------------- circular y anillo
  function pieItems(data) {
    const s = data.series[0];
    if (!s) return [];
    let items = [];
    s.values.forEach((v, i) => { if (v != null && v > 0) items.push({ name: data.cats[i] || 'Elemento ' + (i + 1), v, text: s.texts[i], i }); });
    if (items.length > 8) { // más de 8 porciones: las menores se agrupan en «Otros»
      const keep = new Set(items.slice().sort((a, b) => b.v - a.v).slice(0, 7));
      const rest = items.filter((x) => !keep.has(x)), sum = rest.reduce((a, x) => a + x.v, 0);
      items = items.filter((x) => keep.has(x));
      items.push({ name: 'Otros (' + rest.length + ')', v: sum, text: HC.fmt.format(sum, data.nf || 'General').text, other: true });
    }
    return items;
  }
  R.pieItems = pieItems;
  function pieChart(c, items) {
    const { spec, data, T, o, area, out, colorOf } = c;
    const tot = items.reduce((a, x) => a + x.v, 0);
    const P = { x: area.left, y: area.top, w: area.right - area.left, h: area.bottom - area.top };
    const r = Math.max(12, Math.min(P.w, P.h) / 2 - 6), cx = P.x + P.w / 2, cy = P.y + P.h / 2;
    const dough = spec.type === 'doughnut', r0 = dough ? r * 0.58 : 0;
    out.push('<g class="hl-back"></g>');
    let a = -Math.PI / 2;
    const slices = items.map((it, k) => {
      const a1 = a + (it.v / tot) * Math.PI * 2, s = { a0: a, a1, it, color: colorOf(k), share: it.v / tot };
      out.push('<path d="' + arcPath(cx, cy, r, r0, a, a1) + '" fill="' + s.color + '" fill-rule="evenodd" stroke="' + T.surface + '" stroke-width="2" stroke-linejoin="round"/>');
      a = a1;
      return s;
    });
    if (o.labels !== false && r >= 36) for (const s of slices) {
      const ang = (s.a0 + s.a1) / 2, rm = dough ? (r + r0) / 2 : r * 0.64;
      const txt = HC.fmt.format(s.share, s.share < 0.1 ? '0.0%' : '0%').text, tw = measure(txt, 11, 600);
      if ((s.a1 - s.a0) * rm < tw + 8 || (dough && r - r0 < 16)) continue;
      out.push(text(cx + rm * Math.cos(ang), cy + rm * Math.sin(ang), txt, 11, inkOn(s.color), 'middle', ' font-weight="600"'));
    }
    if (dough && r0 > 30) {
      const totText = HC.fmt.format(tot, data.nf && !/^general$/i.test(data.nf) ? data.nf : '#,##0.##').text;
      const fs = HC.clamp(Math.floor(r0 / 2.8), 11, 22);
      out.push(text(cx, cy - fs * 0.35, clip(totText, r0 * 1.7, fs, 600), fs, T.text, 'middle', ' font-weight="600"'), text(cx, cy + fs * 0.75, 'Total', 11, T.muted, 'middle'));
    }
    out.push('<g class="hl-front"></g>');
    return { kind: 'pie', cx, cy, r, r0, slices: slices.map((s) => ({ a0: s.a0, a1: s.a1, name: s.it.name, text: s.it.text, share: s.share, color: s.color })) };
  }

  // ---------------------------------------------------------------- dispersión y burbujas
  function xyChart(c) {
    const { spec, data, T, o, area, out, colorOf, id } = c;
    const bubble = spec.type === 'bubble', S = data.series, FS = 11;
    const pts = [];
    let xlo = Infinity, xhi = -Infinity, ylo = Infinity, yhi = -Infinity, smax = 0;
    S.forEach((s, k) => s.values.forEach((y, i) => {
      const x = s.xs ? s.xs[i] : i + 1, sz = bubble ? s.sizes && s.sizes[i] : null;
      if (y == null || x == null || (bubble && !(sz > 0))) return;
      pts.push({ k, i, x, y, sz });
      if (x < xlo) xlo = x; if (x > xhi) xhi = x; if (y < ylo) ylo = y; if (y > yhi) yhi = y; if (sz > smax) smax = sz;
    }));
    if (!pts.length) { out.push(text((area.left + area.right) / 2, (area.top + area.bottom) / 2, 'No hay pares de valores X e Y', 12, T.muted, 'middle')); return null; }
    const zeroRule = (lo, hi) => (lo > 0 && lo < (hi * 5) / 6) || (hi < 0 && hi > (lo * 5) / 6);
    if (zeroRule(xlo, xhi)) { xlo = Math.min(xlo, 0); xhi = Math.max(xhi, 0); }
    if (zeroRule(ylo, yhi)) { ylo = Math.min(ylo, 0); yhi = Math.max(yhi, 0); }
    if (bubble) { const px = (xhi - xlo || 1) * 0.08, py = (yhi - ylo || 1) * 0.1; xlo -= px; xhi += px; ylo -= py; yhi += py; }
    const ys = niceScale(ylo, yhi, HC.clamp(Math.round((area.bottom - area.top) / 48), 2, 8), { min: num(o.yMin), max: num(o.yMax) });
    const yf = tickFormatter(data.nf, ys.step, Math.max(Math.abs(ys.min), Math.abs(ys.max))), ytl = ys.ticks.map(yf);
    const midY = (area.top + area.bottom) / 2;
    if (o.yTitle) { out.push(text(area.left + 6, midY, clip(o.yTitle, area.bottom - area.top, 12), 12, T.text2, 'middle', ' transform="rotate(-90 ' + n1(area.left + 6) + ' ' + n1(midY) + ')"')); area.left += 20; }
    if (o.xTitle) { out.push(text((area.left + area.right) / 2, area.bottom - 6, clip(o.xTitle, area.right - area.left, 12), 12, T.text2, 'middle')); area.bottom -= 20; }
    area.left += Math.max.apply(null, ytl.map((t) => measure(t, FS))) + 8;
    area.bottom -= 20;
    const xs = niceScale(xlo, xhi, HC.clamp(Math.round((area.right - area.left) / 90), 2, 10), { min: num(o.xMin), max: num(o.xMax) });
    const xf = tickFormatter(data.xnf, xs.step, Math.max(Math.abs(xs.min), Math.abs(xs.max))), xtl = xs.ticks.map(xf);
    area.right -= measure(xtl[xtl.length - 1], FS) / 2;
    const P = { x: area.left, y: area.top, w: area.right - area.left, h: area.bottom - area.top };
    if (P.w < 30 || P.h < 30) return null;
    const X = (v) => P.x + ((v - xs.min) / (xs.max - xs.min)) * P.w, Y = (v) => P.y + P.h - ((v - ys.min) / (ys.max - ys.min)) * P.h;
    ys.ticks.forEach((t, k) => { if (o.grid !== false) out.push(hline(P.x, Y(t), P.w, T.grid)); out.push(text(P.x - 8, Y(t), ytl[k], FS, T.muted, 'end')); });
    xs.ticks.forEach((t, k) => { if (o.grid !== false) out.push(vline(X(t), P.y, P.h, T.grid)); out.push(text(X(t), P.y + P.h + 12, xtl[k], FS, T.muted, 'middle')); });
    out.push(hline(P.x, Y(HC.clamp(0, ys.min, ys.max)), P.w, T.axis), vline(X(HC.clamp(0, xs.min, xs.max)), P.y, P.h, T.axis));
    out.push('<g class="hl-back"></g>');
    out.push('<clipPath id="pc-' + id + '"><rect x="' + n1(P.x - 30) + '" y="' + n1(P.y - 30) + '" width="' + n1(P.w + 60) + '" height="' + n1(P.h + 60) + '"/></clipPath><g clip-path="url(#pc-' + id + ')">');
    const maxR = Math.max(6, Math.min(28, Math.min(P.w, P.h) / 8));
    const geo = [];
    if (o.lines) S.forEach((s, k) => {
      const line = pts.filter((p) => p.k === k).map((p) => [X(p.x), Y(p.y)]);
      if (line.length > 1) out.push('<path d="' + pathOf(line, !!o.smooth) + '" fill="none" stroke="' + colorOf(k) + '" stroke-width="2" stroke-linejoin="round"/>');
    });
    const marks = [];
    for (const p of pts) {
      const x = X(p.x), y = Y(p.y), color = colorOf(p.k);
      if (bubble) { const r = Math.max(3, Math.sqrt(p.sz / smax) * maxR); marks.push('<circle cx="' + n1(x) + '" cy="' + n1(y) + '" r="' + n1(r) + '" fill="' + color + '" fill-opacity="0.6" stroke="' + T.surface + '" stroke-width="1.5"/>'); geo.push({ x, y, r, k: p.k, i: p.i }); }
      else { marks.push(marker(p.k, x, y, 4, color, T.surface)); geo.push({ x, y, r: 5, k: p.k, i: p.i }); }
    }
    out.push(marks.join(''));
    if (o.trend) S.forEach((s, k) => {
      const g = regression(s.xs || s.values.map((_, i) => i + 1), s.values);
      if (!g) return;
      const a = [X(xs.min), Y(g.b + g.m * xs.min)], b = [X(xs.max), Y(g.b + g.m * xs.max)];
      out.push('<path d="M' + pt(a) + 'L' + pt(b) + '" stroke="' + colorOf(k) + '" stroke-width="1.5" stroke-dasharray="5 4" fill="none"/>');
      out.push(text(P.x + P.w - 4, Math.max(P.y + 8, Math.min(P.y + P.h - 8, b[1] - 10 - 13 * k)), 'R² = ' + HC.fmt.format(g.r2, '0.000').text, 10.5, T.text2, 'end'));
    });
    out.push('</g>');
    if (o.labels) for (const g of geo) out.push(text(g.x, g.y - g.r - 8, S[g.k].texts[g.i], 10.5, T.text2, 'middle'));
    out.push('<g class="hl-front"></g>');
    return { kind: 'xy', P, pts: geo, series: S.map((s, k) => ({ name: s.name, color: colorOf(k), texts: s.texts, xTexts: s.xTexts, sizeTexts: s.sizeTexts, shape: k })) };
  }

  // ---------------------------------------------------------------- radial
  function radarChart(c) {
    const { data, T, o, area, out, colorOf } = c;
    const S = data.series, n = data.cats.length, FS = 11;
    if (n < 3) { out.push(text((area.left + area.right) / 2, (area.top + area.bottom) / 2, 'La gráfica radial necesita al menos 3 categorías', 12, T.muted, 'middle')); return null; }
    let lo = 0, hi = -Infinity;
    for (const s of S) for (const v of s.values) if (v != null) { if (v > hi) hi = v; if (v < lo) lo = v; }
    if (!isFinite(hi)) hi = 1;
    const sc = niceScale(lo, hi, 4, { zero: true, min: num(o.yMin), max: num(o.yMax) });
    const fmt = tickFormatter(data.nf, sc.step, Math.max(Math.abs(sc.min), Math.abs(sc.max)));
    const labW = Math.min(90, Math.max.apply(null, data.cats.map((t) => measure(t, FS))));
    const cx = (area.left + area.right) / 2, cy = (area.top + area.bottom) / 2 + 4;
    const r = Math.max(20, Math.min((area.right - area.left) / 2 - labW - 12, (area.bottom - area.top) / 2 - 20));
    const ang = (i) => -Math.PI / 2 + (2 * Math.PI * i) / n;
    const at = (rr, i) => [cx + rr * Math.cos(ang(i)), cy + rr * Math.sin(ang(i))];
    const R0 = (v) => ((HC.clamp(v, sc.min, sc.max) - sc.min) / (sc.max - sc.min)) * r;
    for (const t of sc.ticks) {
      const rr = R0(t);
      if (rr <= 0.5) continue;
      if (o.grid !== false || t === sc.max) out.push('<path d="M' + Array.from({ length: n }, (_, i) => pt(at(rr, i))).join('L') + 'Z" fill="none" stroke="' + (t === sc.max ? T.axis : T.grid) + '" stroke-width="1"/>');
      out.push(text(cx + 4, cy - rr, fmt(t), 10, T.muted, 'start'));
    }
    for (let i = 0; i < n; i++) {
      const p = at(r, i), q = at(r + 12, i), cs = Math.cos(ang(i));
      out.push('<path d="M' + pt([cx, cy]) + 'L' + pt(p) + '" stroke="' + T.grid + '" stroke-width="1"/>');
      out.push(text(q[0], q[1], clip(data.cats[i], labW, FS), FS, T.muted, cs > 0.3 ? 'start' : cs < -0.3 ? 'end' : 'middle'));
    }
    out.push('<g class="hl-back"></g>');
    const ptsAll = S.map((s, k) => {
      const pts = s.values.map((v, i) => at(R0(v == null ? sc.min : v), i));
      out.push('<path d="M' + pts.map(pt).join('L') + 'Z" fill="' + colorOf(k) + '" fill-opacity="0.1" stroke="' + colorOf(k) + '" stroke-width="2" stroke-linejoin="round"/>');
      return pts;
    });
    if (n <= 16) S.forEach((s, k) => ptsAll[k].forEach((p, i) => { if (s.values[i] != null) out.push(marker(0, p[0], p[1], 3.5, colorOf(k), T.surface)); }));
    out.push('<g class="hl-front"></g>');
    return { kind: 'radar', cx, cy, r, n, ang, cats: data.cats, pts: ptsAll, series: S.map((s, k) => ({ name: s.name, color: colorOf(k), texts: s.texts, values: s.values })) };
  }

  // ---------------------------------------------------------------- entrada principal
  const NAMES = { column: 'Gráfica de columnas', bar: 'Gráfica de barras', line: 'Gráfica de líneas', area: 'Gráfica de áreas', pie: 'Gráfica circular', doughnut: 'Gráfica de anillo', scatter: 'Gráfica de dispersión', bubble: 'Gráfica de burbujas', radar: 'Gráfica radial', combo: 'Gráfica combinada', histogram: 'Histograma' };
  R.render = function (spec, data, W, H, T) {
    T = T || R.theme();
    const o = spec.opts || {}, type = spec.type, id = String(spec.id || 'g').replace(/[^\w-]/g, '');
    const out = [], area = { left: 14, right: W - 14, top: 12, bottom: H - 12 };
    const colorOf = (k) => (o.colors && o.colors[k]) || T.series[k % T.series.length];
    if (spec.title) { out.push(text(W / 2, area.top + 9, clip(spec.title, W - 28, 15, 600), 15, T.text, 'middle', ' font-weight="600"')); area.top += 28; }
    if (data.note) { out.push(text(W - 12, H - 9, data.note, 10.5, T.muted, 'end')); area.bottom -= 14; }
    const isPie = type === 'pie' || type === 'doughnut', xy = type === 'scatter' || type === 'bubble';
    const pItems = isPie ? pieItems(data) : null;
    let items = null;
    if (isPie) items = pItems.map((it, k) => ({ name: it.name, color: colorOf(k), mark: 'box' }));
    else if (data.series.length > 1) items = data.series.map((s, k) => {
      const kd = type === 'combo' ? (o.kinds && o.kinds[k]) || (k === data.series.length - 1 ? 'line' : 'col') : type;
      return { name: s.name, color: colorOf(k), mark: xy && !o.lines ? 'shape' : kd === 'line' || (xy && o.lines) ? 'line' : 'box', shape: k };
    });
    const pos = o.legend || (isPie ? 'right' : 'bottom');
    const legendSvg = items && items.length && pos !== 'none' ? legend(items, pos, W, area, T) : '';
    const c = { spec, data, W, H, T, o, area, out, colorOf, id };
    let layout = null;
    if (isPie) layout = pItems.length ? pieChart(c, pItems) : (out.push(text(W / 2, H / 2, 'No hay valores positivos para representar', 12, T.muted, 'middle')), null);
    else if (xy) layout = xyChart(c);
    else if (type === 'radar') layout = radarChart(c);
    else layout = bandChart(c);
    const S = data.series || [];
    const aria = (NAMES[type] || 'Gráfica') + (spec.title ? ': ' + spec.title : '') + '. ' + (isPie ? pItems.length + ' porciones' : S.length + (S.length === 1 ? ' serie' : ' series') + ', ' + (data.cats ? data.cats.length : 0) + ' puntos') + '.';
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" font-family="' + FONT_ATTR + '" role="img" aria-label="' + esc(aria) + '">'
      + '<rect width="' + W + '" height="' + H + '" fill="' + T.surface + '"/>' + out.join('') + legendSvg + '</svg>';
    return { svg, layout, aria };
  };
})();
