/* Gráficas: datos desde el rango, cuadros sobre la cuadrícula (mover, redimensionar), información al pasar
   el ratón, panel de edición, exportación a PNG o SVG y menú contextual. */
(function () {
  'use strict';
  const HC = window.HC, ui = HC.ui, h = ui.h, R = HC.chartRender;
  const MINW = 180, MINH = 130;
  const NAMES = { column: 'Columnas', bar: 'Barras', line: 'Líneas', area: 'Áreas', pie: 'Circular', doughnut: 'Anillo', scatter: 'Dispersión', bubble: 'Burbujas', radar: 'Radial', combo: 'Combinada', histogram: 'Histograma' };
  const ICONS = {
    column: '<path d="M3 15V9M7.5 15V4M12 15V7M16.5 15V11" stroke-width="2.6"/>',
    bar: '<path d="M2 3.5h9M2 8h14M2 12.5h6" stroke-width="2.6"/>',
    line: '<path d="M2 13l4.5-5 4 3L17 4"/>',
    area: '<path d="M2 15V10l4.5-4 4 3L17 4v11z" fill="currentColor" fill-opacity=".25"/><path d="M2 10l4.5-4 4 3L17 4"/>',
    pie: '<circle cx="9.5" cy="9" r="6.5"/><path d="M9.5 2.5V9l5.6 3.2"/>',
    doughnut: '<circle cx="9.5" cy="9" r="6.5"/><circle cx="9.5" cy="9" r="2.8"/><path d="M9.5 2.5v3.7"/>',
    scatter: '<circle cx="4" cy="13" r="1.3" fill="currentColor"/><circle cx="8" cy="9" r="1.3" fill="currentColor"/><circle cx="12" cy="11" r="1.3" fill="currentColor"/><circle cx="15" cy="5" r="1.3" fill="currentColor"/><circle cx="6" cy="6" r="1.3" fill="currentColor"/>',
    bubble: '<circle cx="5" cy="12" r="2.5"/><circle cx="12" cy="7" r="4"/><circle cx="15.5" cy="14" r="1.5"/>',
    radar: '<path d="M9.5 2l6.6 4.8-2.5 7.8H5.4L2.9 6.8z"/><path d="M9.5 6l3 2.6-1.3 3.6H7.8L6.5 8.6z" fill="currentColor" fill-opacity=".3"/>',
    combo: '<path d="M4 15V9M9 15V6M14 15V10" stroke-width="2.6"/><path d="M2 7l5-3 5 4 5-5"/>',
    histogram: '<path d="M2.5 15V10h3V6h3v-3h3v5h3v7z" fill="currentColor" fill-opacity=".25"/><path d="M2.5 15V10h3V6h3V3h3v5h3v7"/>',
  };
  const typeIcon = (t) => h('span.ico', { html: '<svg viewBox="0 0 19 18" width="22" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[t] || '') + '</svg>' });

  // ---------------------------------------------------------------- datos de la gráfica
  function splitRanges(t) {
    const out = [];
    let cur = '', q = false;
    for (const ch of String(t || '')) { if (ch === "'") q = !q; if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; }
    out.push(cur);
    return out.map((s) => s.trim()).filter(Boolean);
  }
  function areasOf(wb, sh, t) {
    const list = [];
    for (const part of splitRanges(t)) {
      const g = HC.parseSheetRange(part);
      if (!g) return null;
      const s = g.sheet != null ? wb.sheetByName(g.sheet) : sh;
      if (!s) return null;
      const u = HC.clipBig(s, g);
      list.push({ sh: s, r1: u.r1, c1: u.c1, r2: Math.min(u.r2, u.r1 + 9999), c2: Math.min(u.c2, u.c1 + 199) });
    }
    return list.length ? list : null;
  }
  function cellAt(wb, s, r, c) {
    let v = s.value(r, c);
    if (v instanceof HC.FErr) v = null;
    const st = s.styleAt(r, c);
    return { v, t: v == null ? '' : wb.displayText(s, r, c), sh: s, r, c, nf: st && st.nf };
  }
  function matrixOf(wb, list) {
    const block = (A) => { const m = []; for (let r = A.r1; r <= A.r2; r++) { const row = []; for (let c = A.c1; c <= A.c2; c++) row.push(cellAt(wb, A.sh, r, c)); m.push(row); } return m; };
    if (list.length === 1) return block(list[0]);
    const H0 = list[0].r2 - list[0].r1, W0 = list[0].c2 - list[0].c1;
    if (list.every((A) => A.r2 - A.r1 === H0)) { const bl = list.map(block); return bl[0].map((row, i) => [].concat(...bl.map((b) => b[i]))); }
    if (list.every((A) => A.c2 - A.c1 === W0)) return [].concat(...list.map(block));
    return block(list[0]);
  }
  const isNum = (x) => !!x && typeof x.v === 'number';
  const isTxt = (x) => !!x && typeof x.v === 'string' && x.v.trim() !== '';
  const isEmpty = (x) => !x || x.v == null || x.v === '';
  const isDateCell = (x) => isNum(x) && x.nf && /^(date|time)$/.test(HC.fmt.kind(x.nf));
  function binning(vals, bins, nf) {
    if (!vals.length) return null;
    let lo = Infinity, hi = -Infinity;
    for (const v of vals) { if (v < lo) lo = v; if (v > hi) hi = v; }
    if (lo === hi) { lo -= 0.5; hi += 0.5; }
    let k, w, start;
    if (bins > 0) { k = Math.min(200, Math.round(bins)); w = (hi - lo) / k; start = lo; }
    else {
      k = HC.clamp(Math.ceil(Math.log2(vals.length) + 1), 1, 50);
      w = R.niceStep((hi - lo) / k);
      start = Math.floor(lo / w + 1e-9) * w;
      k = Math.max(1, Math.ceil((hi - start) / w - 1e-9));
    }
    const counts = new Array(k).fill(0);
    for (const v of vals) counts[HC.clamp(Math.floor((v - start) / w + 1e-9), 0, k - 1)]++;
    const code = nf && !/^general$/i.test(nf) ? nf : 'General';
    const f = (x) => HC.fmt.format(parseFloat(x.toPrecision(10)), code).text;
    return { counts, labels: counts.map((_, i) => f(start + i * w) + '–' + f(start + (i + 1) * w)), start, w };
  }
  // Interpreta el rango: series por columnas o filas, encabezados y categorías (automático o según las opciones).
  function extract(wb, sh, ch) {
    const type = ch.type, o = ch.opts || {};
    const list = areasOf(wb, sh, ch.range);
    if (!list) return { error: 'El rango de datos no es válido. Edita la gráfica para corregirlo.' };
    let M = matrixOf(wb, list);
    if (!M.length || !M[0].length) return { error: 'El rango está vacío.' };
    const xy = type === 'scatter' || type === 'bubble';
    const byRow = o.byRow === true || o.byRow === false ? o.byRow : !xy && M[0].length > M.length;
    if (byRow) M = M[0].map((_, j) => M.map((row) => row[j]));
    const R0 = M.length, C0 = M[0].length;
    let catCol;
    if (o.catCol === true || o.catCol === false) catCol = o.catCol && C0 > 1;
    else if (C0 < 2) catCol = false;
    else if (xy) catCol = true;
    else {
      const col = M.slice(1).map((r) => r[0]);
      catCol = col.some(isTxt) || col.some(isDateCell) || (isEmpty(M[0][0]) && M[0].slice(1).some((x) => isTxt(x) || isNum(x)) && col.some(isNum));
    }
    const first = catCol ? 1 : 0;
    let header;
    if (o.header === true || o.header === false) header = o.header && R0 > 1;
    else header = R0 > 1 && (M[0].slice(first).some(isTxt) || (catCol && isEmpty(M[0][0]) && M[0].slice(first).some(isNum))) && M.slice(1).some((r) => r.slice(first).some(isNum));
    const rows = M.slice(header ? 1 : 0);
    if (!rows.length) return { error: 'No hay datos debajo de los encabezados.' };
    const catCells = catCol ? rows.map((r) => r[0]) : null;
    const cats = rows.map((r, i) => (catCol ? (r[0] && r[0].t) || '' : String(i + 1)));
    let series = [];
    for (let j = first; j < C0; j++) {
      const cells = rows.map((r) => r[j]);
      const k = series.length + 1;
      series.push({ name: header ? (M[0][j] && M[0][j].t) || 'Serie ' + k : 'Serie ' + k, nameCell: header ? M[0][j] : null, cells, values: cells.map((x) => (isNum(x) ? x.v : null)), texts: cells.map((x) => (x ? x.t : '')) });
    }
    series = series.filter((s) => s.values.some((v) => v != null));
    let nf = null;
    for (const s of series) { const x = s.cells.find(isNum); if (x) { nf = x.nf || null; break; } }
    const out = { cats, catCells, series, nf, byRow, header, catCol, note: null };
    if (type === 'histogram') {
      const vals = [];
      for (const s of series) for (const v of s.values) if (v != null) vals.push(v);
      const hb = binning(vals, num(o.bins), nf);
      if (!hb) return { error: 'No hay números para el histograma.' };
      return { cats: hb.labels, series: [{ name: 'Frecuencia', values: hb.counts, texts: hb.counts.map(String) }], nf: '0', hist: hb, byRow, header, catCol, note: null, values: vals };
    }
    if (xy) {
      const xs = catCells ? catCells.map((x) => (isNum(x) ? x.v : null)) : rows.map((_, i) => i + 1);
      const numericX = !catCells || xs.some((v) => v != null);
      const X = numericX ? xs : rows.map((_, i) => i + 1);
      out.xnf = numericX && catCells && catCells.find(isNum) ? catCells.find(isNum).nf : null;
      out.xCells = numericX ? catCells : null;
      const xTexts = numericX && catCells ? catCells.map((x) => (x ? x.t : '')) : X.map(String);
      if (type === 'bubble') {
        const pairs = [];
        for (let k = 0; k + 1 < series.length; k += 2) pairs.push(Object.assign({}, series[k], { sizes: series[k + 1].values, sizeTexts: series[k + 1].texts, sizeCells: series[k + 1].cells }));
        if (!pairs.length) return { error: 'La gráfica de burbujas necesita columnas de X, Y y tamaño.' };
        series = pairs;
      }
      series.forEach((s) => { s.xs = X; s.xTexts = xTexts; });
      out.series = series;
    }
    if (series.length > 8 && type !== 'pie' && type !== 'doughnut') { out.note = 'Se muestran 8 de ' + series.length + ' series'; out.series = series.slice(0, 8); }
    if (!out.series.length) return { error: 'El rango no contiene números para representar.' };
    return out;
  }
  const num = (v) => (v === '' || v == null ? null : typeof v === 'number' ? v : HC.textToNumber(String(v)));

  // ---------------------------------------------------------------- información al pasar el ratón
  let tipEl = null;
  function showTip(head, rows, x, y) {
    if (!tipEl) tipEl = document.body.appendChild(h('div#ch-tip.ch-tip', { role: 'tooltip' }));
    tipEl.replaceChildren(head ? h('div.tip-head', head) : null, ...rows.map((r) => h('div.tip-row', r.color ? h('span.tip-key', { style: { background: r.color } }) : null, h('span', r.name), h('b.tip-val', r.value))));
    tipEl.style.display = 'block';
    const w = tipEl.offsetWidth, hh = tipEl.offsetHeight;
    let left = x + 14, top = y + 14;
    if (left + w > window.innerWidth - 6) left = x - w - 14;
    if (top + hh > window.innerHeight - 6) top = y - hh - 14;
    tipEl.style.left = Math.max(4, left) + 'px'; tipEl.style.top = Math.max(4, top) + 'px';
  }
  const hideTipEl = () => { if (tipEl) tipEl.style.display = 'none'; };

  // ---------------------------------------------------------------- módulo
  const charts = (HC.charts = {
    boxes: new Map(), selected: null, sheetId: null, editorId: null, extract, names: NAMES,
    find(id) { const sh = HC.app && HC.app.sheet; return (sh && sh.charts.find((c) => c.id === id)) || null; },
    rangeLabel(t) { try { return HC.localizeFormula(t || ''); } catch (e) { return t || ''; } },
    selectionRange() {
      const a = HC.app, sh = a.sheet;
      return a.sel.ranges.map((g) => HC.quoteSheet(sh.name) + '!' + HC.rangeAddr(HC.clipBig(sh, g), true)).join(',');
    },

    // ------------------------------------------------------------ sincronizar con el modelo
    sync(force) {
      const a = HC.app;
      if (!a || !a.wb || !a.grid) return;
      const sh = a.sheet, layer = a.grid.layer;
      if (force || this.sheetId !== sh.id) {
        for (const b of this.boxes.values()) b.el.remove();
        this.boxes.clear(); this.sheetId = sh.id;
      }
      const T = R.theme(), seen = new Set();
      for (const ch of sh.charts) {
        seen.add(ch.id);
        let box = this.boxes.get(ch.id);
        if (!box) { box = this.makeBox(ch.id); this.boxes.set(ch.id, box); layer.appendChild(box.el); }
        this.paint(box, ch, a.wb, sh, T);
      }
      for (const [id, box] of this.boxes) if (!seen.has(id)) { box.el.remove(); this.boxes.delete(id); }
      if (this.selected && !seen.has(this.selected)) this.selected = null;
      if (this.editorId && !seen.has(this.editorId)) this.closeEditor(true);
      else if (this.editorId && !this._fromEditor) this.refreshEditor();
      this._fromEditor = false;
      this.layout();
    },
    paint(box, ch, wb, sh, T) {
      const data = extract(wb, sh, ch);
      const sig = JSON.stringify([ch, T, data.error || [data.cats, data.series.map((s) => [s.name, s.values, s.texts, s.xs, s.sizes]), data.nf, data.xnf, data.note]]);
      box.chart = ch;
      if (sig === box.sig) return;
      box.sig = sig; box.data = data;
      let res = null;
      if (!data.error) { try { res = R.render(ch, data, ch.w, ch.h, T); } catch (e) { console.error(e); data.error = 'No se pudo dibujar la gráfica.'; } }
      if (res) { box.svgHost.innerHTML = res.svg; box.layout = res.layout; box.el.setAttribute('aria-label', res.aria); }
      else { box.svgHost.replaceChildren(h('div.chart-empty', h('div', ch.title ? h('b', ch.title) : null, h('div', data.error)))); box.layout = null; box.el.setAttribute('aria-label', 'Gráfica sin datos'); }
    },
    layout() {
      const a = HC.app;
      if (!a || !a.grid) return;
      const v = a.sheet.view, z = a.grid.zoom;
      for (const box of this.boxes.values()) {
        const g = box.live || box.chart;
        if (!g) continue;
        const st = box.el.style;
        st.left = Math.round((g.x - v.scrollX) * z) + 'px'; st.top = Math.round((g.y - v.scrollY) * z) + 'px';
        st.width = Math.round(g.w * z) + 'px'; st.height = Math.round(g.h * z) + 'px';
        box.el.classList.toggle('sel', this.selected === box.id);
      }
    },
    makeBox(id) {
      const el = h('div.chart-box', { role: 'img', 'data-id': id });
      const svgHost = h('div.ch-svg');
      el.appendChild(svgHost);
      for (const d of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) el.appendChild(h('div.ch-handle', { 'data-h': d }));
      const box = { id, el, svgHost, sig: null, chart: null, data: null, layout: null, live: null };
      el.addEventListener('pointerdown', (e) => this.onDown(e, box));
      el.addEventListener('pointermove', (e) => this.onHover(e, box));
      el.addEventListener('pointerleave', () => this.clearHover(box));
      el.addEventListener('dblclick', (e) => { e.preventDefault(); this.openEditor(box.id); });
      el.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); this.select(box.id); this.menu(box.id, { x: e.clientX, y: e.clientY }); });
      return box;
    },

    // ------------------------------------------------------------ selección, mover y redimensionar
    select(id) {
      if (this.selected === id) return;
      this.selected = id;
      this.layout();
      if (id && this.editorId && id !== this.editorId) this.openEditor(id);
    },
    onDown(e, box) {
      if (e.button === 2) return;
      e.preventDefault(); e.stopPropagation();
      const a = HC.app;
      if (a.edit && !a.commitEdit()) return;
      ui.closePopups();
      this.clearHover(box);
      this.select(box.id);
      a.focusGrid();
      const ch = box.chart, z = a.grid.zoom, hd = e.target.dataset ? e.target.dataset.h : null;
      const s0 = { x: e.clientX, y: e.clientY, g: { x: ch.x, y: ch.y, w: ch.w, h: ch.h } };
      let moved = false;
      this._dragging = true;
      box.el.setPointerCapture(e.pointerId);
      const move = (ev) => {
        const dx = (ev.clientX - s0.x) / z, dy = (ev.clientY - s0.y) / z, g0 = s0.g;
        if (!moved && Math.abs(dx) + Math.abs(dy) < 3) return;
        moved = true;
        const g = Object.assign({}, g0);
        if (!hd) { g.x = Math.max(0, Math.round(g0.x + dx)); g.y = Math.max(0, Math.round(g0.y + dy)); }
        else {
          if (hd.indexOf('e') >= 0) g.w = Math.max(MINW, Math.round(g0.w + dx));
          if (hd.indexOf('s') >= 0) g.h = Math.max(MINH, Math.round(g0.h + dy));
          if (hd.indexOf('w') >= 0) { g.x = Math.max(0, Math.min(g0.x + g0.w - MINW, Math.round(g0.x + dx))); g.w = g0.x + g0.w - g.x; }
          if (hd.indexOf('n') >= 0) { g.y = Math.max(0, Math.min(g0.y + g0.h - MINH, Math.round(g0.y + dy))); g.h = g0.y + g0.h - g.y; }
        }
        box.live = g;
        this.layout();
      };
      const up = () => {
        box.el.removeEventListener('pointermove', move); box.el.removeEventListener('pointerup', up); box.el.removeEventListener('pointercancel', up);
        this._dragging = false;
        const g = box.live;
        box.live = null;
        if (moved && g) this.update(box.id, { x: g.x, y: g.y, w: g.w, h: g.h }); else this.layout();
      };
      box.el.addEventListener('pointermove', move); box.el.addEventListener('pointerup', up); box.el.addEventListener('pointercancel', up);
    },

    // ------------------------------------------------------------ información al pasar el ratón
    clearHover(box) {
      hideTipEl();
      for (const g of box.svgHost.querySelectorAll('.hl-back, .hl-front')) g.innerHTML = '';
    },
    onHover(e, box) {
      const L = box.layout, ch = box.chart;
      if (this._dragging || !L || e.buttons) return;
      const rect = box.svgHost.getBoundingClientRect(), k = rect.width / ch.w;
      const x = (e.clientX - rect.left) / k, y = (e.clientY - rect.top) / k, T = R.theme();
      let back = '', front = '', head = null, rows = null;
      if (L.kind === 'band') {
        const P = L.P;
        if (x >= P.x - 2 && x <= P.x + P.w + 2 && y >= P.y - 2 && y <= P.y + P.h + 2) {
          const i = HC.clamp(Math.floor(((L.horiz ? y : x) - L.C0) / L.band), 0, L.n - 1), s0 = L.C0 + i * L.band;
          const lines = L.series.some((s) => s.kind !== 'col');
          if (lines && !L.horiz) {
            const cx = s0 + L.band / 2;
            back = '<rect x="' + (Math.round(cx) - 0.5) + '" y="' + P.y + '" width="1" height="' + P.h + '" fill="' + T.axis + '"/>';
            L.series.forEach((s, k2) => { const p = L.pts[k2] && L.pts[k2][i]; if (p) front += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="7" fill="' + T.surface + '"/><circle cx="' + p[0] + '" cy="' + p[1] + '" r="5" fill="' + s.color + '"/>'; });
          } else back = L.horiz ? '<rect x="' + P.x + '" y="' + s0 + '" width="' + P.w + '" height="' + L.band + '" fill="' + T.grid + '" fill-opacity="0.6"/>' : '<rect x="' + s0 + '" y="' + P.y + '" width="' + L.band + '" height="' + P.h + '" fill="' + T.grid + '" fill-opacity="0.6"/>';
          head = L.cats[i];
          rows = [];
          L.series.forEach((s, k2) => {
            if (s.values[i] == null) return;
            const share = L.pct ? HC.fmt.format(L.tops[k2][i] - L.bases[k2][i], '0.0%').text + ' · ' : '';
            rows.push({ color: s.color, name: s.name, value: share + (s.texts[i] || HC.fmt.general(s.values[i])) });
          });
        }
      } else if (L.kind === 'pie') {
        const dx = x - L.cx, dy = y - L.cy, d = Math.hypot(dx, dy);
        if (d <= L.r + 2 && d >= L.r0 - 2) {
          let ang = Math.atan2(dy, dx);
          if (ang < -Math.PI / 2) ang += Math.PI * 2;
          const s = L.slices.find((q) => ang >= q.a0 && ang < q.a1) || L.slices[L.slices.length - 1];
          front = '<path d="' + R.arcPath(L.cx, L.cy, L.r + 6, L.r + 2, s.a0, s.a1) + '" fill="' + s.color + '"/>';
          head = s.name;
          rows = [{ color: s.color, name: s.text, value: HC.fmt.format(s.share, '0.0%').text }];
        }
      } else if (L.kind === 'xy') {
        let best = null, bd = Infinity;
        for (const p of L.pts) { const d = Math.hypot(p.x - x, p.y - y) - p.r; if (d < bd) { bd = d; best = p; } }
        if (best && bd < 14) {
          const s = L.series[best.k];
          front = '<circle cx="' + best.x + '" cy="' + best.y + '" r="' + (best.r + 3) + '" fill="none" stroke="' + s.color + '" stroke-width="2"/>';
          head = s.name;
          rows = [{ name: 'X', value: s.xTexts ? s.xTexts[best.i] : '' }, { name: 'Y', value: s.texts[best.i] }];
          if (s.sizeTexts) rows.push({ name: 'Tamaño', value: s.sizeTexts[best.i] });
        }
      } else if (L.kind === 'radar') {
        const d = Math.hypot(x - L.cx, y - L.cy);
        if (d <= L.r + 14) {
          let ang = Math.atan2(y - L.cy, x - L.cx) + Math.PI / 2;
          if (ang < 0) ang += Math.PI * 2;
          const i = Math.round((ang / (Math.PI * 2)) * L.n) % L.n, a2 = L.ang(i);
          back = '<path d="M' + L.cx + ',' + L.cy + 'L' + (L.cx + L.r * Math.cos(a2)) + ',' + (L.cy + L.r * Math.sin(a2)) + '" stroke="' + T.axis + '" stroke-width="1.5"/>';
          L.series.forEach((s, k2) => { const p = L.pts[k2][i]; if (s.values[i] != null) front += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="7" fill="' + T.surface + '"/><circle cx="' + p[0] + '" cy="' + p[1] + '" r="5" fill="' + s.color + '"/>'; });
          head = L.cats[i];
          rows = L.series.filter((s) => s.values[i] != null).map((s) => ({ color: s.color, name: s.name, value: s.texts[i] }));
        }
      }
      const gb = box.svgHost.querySelector('.hl-back'), gf = box.svgHost.querySelector('.hl-front');
      if (gb) gb.innerHTML = back;
      if (gf) gf.innerHTML = front;
      if (rows && rows.length) showTip(head, rows, e.clientX, e.clientY); else hideTipEl();
    },

    // ------------------------------------------------------------ cambios (con deshacer)
    update(id, patch, fromEditor) {
      const a = HC.app, sh = a.sheet;
      const list = sh.charts.map((c) => (c.id === id ? Object.assign({}, c, patch, patch.opts ? { opts: Object.assign({}, c.opts, patch.opts) } : {}) : c));
      this._fromEditor = !!fromEditor;
      a.wb.setProp(sh, 'charts', list);
      this._fromEditor = false;
    },
    remove(id) {
      const a = HC.app, sh = a.sheet;
      if (this.editorId === id) this.closeEditor(true);
      if (this.selected === id) this.selected = null;
      a.wb.setProp(sh, 'charts', sh.charts.filter((c) => c.id !== id));
      a.focusGrid();
    },
    duplicate(id) {
      const a = HC.app, sh = a.sheet, ch = this.find(id);
      if (!ch) return;
      const copy = Object.assign({}, ch, { id: HC.uid('g'), x: ch.x + 24, y: ch.y + 24, opts: Object.assign({}, ch.opts) });
      a.wb.setProp(sh, 'charts', sh.charts.concat([copy]));
      this.select(copy.id);
    },
    create(wb, sh, spec) {
      const ch = Object.assign({ id: HC.uid('g'), type: 'column', range: '', title: '', x: 40, y: 40, w: 480, h: 300 }, spec);
      ch.opts = Object.assign({}, spec.opts);
      wb.setProp(sh, 'charts', sh.charts.concat([ch]));
      return ch;
    },
    // Inserta una gráfica con la selección (o el bloque de datos alrededor de la celda activa).
    insert(type) {
      const a = HC.app, sh = a.sheet;
      let ranges = a.sel.ranges.map((g) => HC.clipBig(sh, g));
      if (ranges.length === 1 && ranges[0].r1 === ranges[0].r2 && ranges[0].c1 === ranges[0].c2) {
        const reg = a.dataRegion();
        if (!reg) { ui.toast('Selecciona primero los datos que quieres representar (con sus encabezados).'); return; }
        ranges = [reg];
      }
      const range = ranges.map((g) => HC.quoteSheet(sh.name) + '!' + HC.rangeAddr(g, true)).join(',');
      const r1 = Math.min(...ranges.map((g) => g.r1)), c2 = Math.max(...ranges.map((g) => g.c2));
      const W = 480, H = 300, vs = a.grid.viewSize(), v = sh.view;
      const vx = v.scrollX + sh.colW.pos(sh.frozenCols), vy = v.scrollY + sh.rowH.pos(sh.frozenRows);
      let x = sh.colW.pos(c2 + 1) + 24, y = sh.rowH.pos(r1);
      if (x + W > vx + vs.w) x = Math.max(vx + 16, vx + vs.w - W - 24);
      if (x < vx) x = vx + 16;
      if (y < vy || y + H > vy + vs.h) y = vy + 16;
      const spec = { type: type || 'column', range, x: Math.round(x), y: Math.round(y), w: W, h: H, opts: {} };
      const data = extract(a.wb, sh, spec);
      if (data.error) { ui.toast(data.error); return; }
      if (type === 'pie' || type === 'doughnut' || data.series.length === 1) spec.title = data.series[0].name !== 'Serie 1' ? data.series[0].name : '';
      if (type === 'histogram') spec.title = 'Histograma';
      const ch = this.create(a.wb, sh, spec);
      this.openEditor(ch.id);
    },
    selectData(id) {
      const a = HC.app, ch = this.find(id);
      if (!ch) return;
      const list = areasOf(a.wb, a.sheet, ch.range);
      if (!list) { ui.toast('El rango de la gráfica no es válido.'); return; }
      const sh = list[0].sh;
      if (sh !== a.sheet) a.activateSheet(a.wb.sheets.indexOf(sh));
      const own = list.filter((g) => g.sh === sh);
      a.setRange(own[0], own[0].r1, own[0].c1);
      for (const g of own.slice(1)) a.sel.ranges.push({ r1: g.r1, c1: g.c1, r2: g.r2, c2: g.c2 });
      a.grid.ensureVisible(own[0].r1, own[0].c1);
      a.onSelChange();
      a.focusGrid();
    },
    menu(id, at) {
      const ch = this.find(id);
      if (!ch) return;
      ui.menu([
        { label: 'Editar gráfica…', icon: 'chart', action: () => this.openEditor(id) },
        { label: 'Cambiar tipo', sub: HC.CHART_TYPES.map(([t, n]) => ({ label: n, checked: ch.type === t, action: () => this.update(id, { type: t }) })) },
        { label: 'Seleccionar los datos de origen', icon: 'table', action: () => this.selectData(id) },
        '-',
        { label: 'Descargar como imagen PNG', icon: 'image', action: () => this.downloadPng(id) },
        { label: 'Descargar como SVG', icon: 'download', action: () => this.downloadSvg(id) },
        { label: 'Duplicar', icon: 'copy', action: () => this.duplicate(id) },
        '-',
        { label: 'Eliminar gráfica', icon: 'trash', key: 'Supr', action: () => this.remove(id) },
      ], at);
    },

    // ------------------------------------------------------------ exportar
    svgFor(ch, sh, wb) {
      const data = extract(wb, sh, ch);
      if (data.error) return null;
      return R.render(Object.assign({}, ch, { id: ch.id + 'x' }), data, ch.w, ch.h, R.LIGHT).svg;
    },
    svgs(sh) { return sh.charts.map((ch) => this.svgFor(ch, sh, sh.wb)).filter(Boolean); },
    fileName(ch) { return (String(ch.title || 'grafica').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'grafica').slice(0, 60); },
    downloadSvg(id) {
      const a = HC.app, ch = this.find(id), svg = ch && this.svgFor(ch, a.sheet, a.wb);
      if (!svg) { ui.toast('La gráfica no tiene datos que exportar.'); return; }
      ui.download(new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + svg], { type: 'image/svg+xml' }), this.fileName(ch) + '.svg');
    },
    async downloadPng(id) {
      const a = HC.app, ch = this.find(id), svg = ch && this.svgFor(ch, a.sheet, a.wb);
      if (!svg) { ui.toast('La gráfica no tiene datos que exportar.'); return; }
      try {
        const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })), img = new Image();
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
        const k = 2, cv = document.createElement('canvas');
        cv.width = ch.w * k; cv.height = ch.h * k;
        const cx = cv.getContext('2d');
        cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, cv.width, cv.height);
        cx.drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        cv.toBlob((b) => ui.download(b, this.fileName(ch) + '.png'), 'image/png');
      } catch (e) { console.error(e); ui.toast('No se pudo crear la imagen.'); }
    },

    // ------------------------------------------------------------ panel de edición
    openEditor(id) {
      if (!this.find(id)) return;
      this.editorId = id;
      if (this.selected !== id) { this.selected = id; this.layout(); }
      document.getElementById('sidepanel').hidden = false;
      this.refreshEditor();
      if (HC.app.grid) HC.app.grid.resize();
    },
    closeEditor(silent) {
      this.editorId = null;
      const p = document.getElementById('sidepanel');
      if (!p) return;
      p.hidden = true; p.replaceChildren();
      if (HC.app.grid) HC.app.grid.resize();
      if (!silent) HC.app.focusGrid();
    },
    refreshEditor() {
      const ch = this.find(this.editorId);
      const panel = document.getElementById('sidepanel');
      if (!ch || !panel) { this.closeEditor(true); return; }
      const oldBody = panel.querySelector('.side-body'), scroll = oldBody ? oldBody.scrollTop : 0;
      const o = ch.opts || {}, t = ch.type, id = ch.id;
      const set = (patch) => this.update(id, patch, true);
      const setO = (k, v) => { set({ opts: { [k]: v } }); };
      const tri = (v) => (v === true ? 'yes' : v === false ? 'no' : 'auto'), untri = (v) => (v === 'yes' ? true : v === 'no' ? false : null);
      const box = this.boxes.get(id), data = box && box.data && !box.data.error ? box.data : null;
      const band = /^(column|bar|line|area|combo|histogram)$/.test(t), xy = t === 'scatter' || t === 'bubble', pie = t === 'pie' || t === 'doughnut';
      const textInput = (value, onSet, ph) => {
        const inp = h('input.inp', { type: 'text', value: value || '', placeholder: ph || '', spellcheck: false });
        inp.addEventListener('change', () => onSet(inp.value.trim()));
        inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') inp.blur(); });
        return inp;
      };
      const numInput = (value, onSet, ph) => {
        const inp = h('input.inp', { type: 'text', value: value == null ? '' : value, placeholder: ph || 'Automático', inputmode: 'decimal' });
        inp.addEventListener('change', () => { const s = inp.value.trim(); if (s === '') onSet(null); else { const v = num(s); if (v == null) { ui.toast('Escribe un número.'); inp.value = value == null ? '' : value; } else onSet(v); } });
        inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') inp.blur(); });
        return inp;
      };
      // tipo
      const types = h('div.type-grid', HC.CHART_TYPES.map(([k, n]) => h('button.type-btn' + (t === k ? '.on' : ''), { type: 'button', title: n, 'aria-pressed': t === k ? 'true' : 'false', onclick: () => set({ type: k }) }, typeIcon(k), n)));
      // datos
      const rangeInp = textInput(this.rangeLabel(ch.range), (v) => {
        const canon = HC.canonicalizeFormula(v.replace(/^=/, ''));
        const ok = canon && splitRanges(canon).every((p) => { const g = HC.parseSheetRange(p); return g && (g.sheet == null || HC.app.wb.sheetByName(g.sheet)); });
        if (!ok) { ui.toast('El rango no es válido. Ejemplo: A1:C10'); rangeInp.value = this.rangeLabel(ch.range); return; }
        const sh = HC.app.sheet;
        set({ range: splitRanges(canon).map((p) => (/!/.test(p) ? p : HC.quoteSheet(sh.name) + '!' + p)).join(',') });
      }, 'A1:C10');
      const useSel = h('button.btn.small', { type: 'button', title: 'Usa el rango seleccionado ahora en la hoja', onclick: () => set({ range: this.selectionRange() }) }, 'Usar selección');
      const dataSec = [
        h('h4', 'Datos'),
        ui.field('Rango', h('div', { style: { display: 'flex', gap: '6px' } }, rangeInp, useSel)),
        !xy ? ui.field('Series en', ui.select([['auto', 'Automático'], ['cols', 'Columnas'], ['rows', 'Filas']], o.byRow === true ? 'rows' : o.byRow === false ? 'cols' : 'auto', (v) => setO('byRow', v === 'auto' ? null : v === 'rows'))) : null,
        h('div.row', ui.field('Encabezados', ui.select([['auto', 'Automático'], ['yes', 'Sí'], ['no', 'No']], tri(o.header), (v) => setO('header', untri(v)))),
          ui.field(xy ? 'Columna X' : 'Categorías', ui.select([['auto', 'Automático'], ['yes', 'Primera columna'], ['no', 'Ninguna']], tri(o.catCol), (v) => setO('catCol', untri(v))))),
        h('button.btn.small', { type: 'button', onclick: () => this.selectData(id) }, 'Ver los datos en la hoja'),
      ];
      // títulos
      const titleSec = [
        h('h4', 'Títulos'),
        ui.field('Título de la gráfica', textInput(ch.title, (v) => set({ title: v }), 'Sin título')),
        !pie ? h('div.row', ui.field(t === 'bar' ? 'Eje vertical' : 'Eje horizontal', textInput(o.xTitle, (v) => setO('xTitle', v || null))), ui.field(t === 'bar' ? 'Eje horizontal' : 'Eje vertical', textInput(o.yTitle, (v) => setO('yTitle', v || null)))) : null,
      ];
      // opciones
      const chk = (label, key, def) => ui.check(label, o[key] == null ? def : o[key], (v) => setO(key, v));
      const optSec = [
        h('h4', 'Opciones'),
        ui.field('Leyenda', ui.select([['bottom', 'Abajo'], ['right', 'A la derecha'], ['top', 'Arriba'], ['none', 'Sin leyenda']], o.legend || (pie ? 'right' : 'bottom'), (v) => setO('legend', v))),
        /^(column|bar|line|area)$/.test(t) ? ui.field('Apilado', ui.select([['none', 'Sin apilar'], ['stack', 'Apilado'], ['percent', 'Apilado al 100 %']], o.stacked || 'none', (v) => setO('stacked', v === 'none' ? null : v))) : null,
        chk(pie ? 'Porcentajes en las porciones' : 'Etiquetas de datos', 'labels', pie),
        !pie ? chk('Líneas de cuadrícula', 'grid', true) : null,
        /^(line|area|combo)$/.test(t) || (xy && o.lines) ? chk('Líneas suavizadas', 'smooth', false) : null,
        /^(line|combo)$/.test(t) ? ui.check('Marcadores en los puntos', o.markers == null ? !data || data.cats.length <= 24 : o.markers, (v) => setO('markers', v)) : null,
        t === 'scatter' ? chk('Unir los puntos con líneas', 'lines', false) : null,
        /^(column|bar|line|scatter)$/.test(t) ? chk('Línea de tendencia (lineal)', 'trend', false) : null,
        t === 'histogram' ? ui.field('Número de intervalos', numInput(o.bins, (v) => setO('bins', v && v > 0 ? Math.round(v) : null))) : null,
        !pie ? h('div.row', ui.field('Eje: mínimo', numInput(o.yMin, (v) => setO('yMin', v))), ui.field('Eje: máximo', numInput(o.yMax, (v) => setO('yMax', v)))) : null,
      ];
      // series y colores
      const names = data ? (pie ? R.pieItems(data).map((x) => x.name) : data.series.map((s) => s.name)) : [];
      const T = R.theme();
      const seriesSec = names.length ? [h('h4', pie ? 'Colores de las porciones' : 'Series')].concat(names.map((name, k) => {
        const cur = (o.colors || [])[k];
        const sw = h('button.swatch-btn', { type: 'button', title: 'Color de «' + name + '»', style: { background: cur || T.series[k % 8] } });
        sw.addEventListener('click', () => ui.colorPicker(sw, { value: cur || T.series[k % 8], autoLabel: 'Automático (paleta)', onPick: (c) => { const cs = (o.colors || []).slice(); cs[k] = c || null; setO('colors', cs.some(Boolean) ? cs : null); } }));
        const kindSel = t === 'combo' ? ui.select([['col', 'Columnas'], ['line', 'Línea']], (o.kinds && o.kinds[k]) || (k === names.length - 1 && names.length > 1 ? 'line' : 'col'), (v) => { const ks = names.map((_, i) => (o.kinds && o.kinds[i]) || (i === names.length - 1 && names.length > 1 ? 'line' : 'col')); ks[k] = v; setO('kinds', ks); }) : null;
        if (kindSel) kindSel.style.width = '96px';
        return h('div.series-row', sw, h('span', { title: name }, name), kindSel);
      })) : [];
      const actions = [h('h4', 'Exportar'), h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
        h('button.btn.small', { type: 'button', onclick: () => this.downloadPng(id) }, 'PNG'),
        h('button.btn.small', { type: 'button', onclick: () => this.downloadSvg(id) }, 'SVG'),
        h('button.btn.small', { type: 'button', onclick: () => this.duplicate(id) }, 'Duplicar'),
        h('button.btn.small.danger', { type: 'button', onclick: () => this.remove(id) }, 'Eliminar'))];
      const body = h('div.side-body', h('h4', 'Tipo'), types, ...dataSec, ...titleSec, ...optSec, ...seriesSec, ...actions);
      body.addEventListener('keydown', (e) => e.stopPropagation());
      panel.replaceChildren(h('div.side-head', h('span', 'Gráfica: ' + NAMES[t]), h('button.dlg-x', { type: 'button', title: 'Cerrar el panel', onclick: () => this.closeEditor() }, ui.icon('close', 14))), body);
      body.scrollTop = scroll;
    },
  });
})();
