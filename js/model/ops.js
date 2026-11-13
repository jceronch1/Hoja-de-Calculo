/* Operaciones sobre el libro: formato de rangos, bordes, combinar, portapapeles, relleno de series,
   ordenar, filtrar, duplicados, formato condicional, validación de datos, buscar y buscar objetivo. */
(function (root) {
  'use strict';
  const HC = root.HC, E = HC.E, FErr = HC.FErr;
  const MAXR = HC.MAX_ROWS, MAXC = HC.MAX_COLS;
  const W = HC.Workbook.prototype;
  const rows = (g) => g.r2 - g.r1 + 1, cols = (g) => g.c2 - g.c1 + 1;
  // Recorta filas/columnas completas al área que tiene celdas.
  const clipUsed = (sh, g) => ({ r1: g.r1, c1: g.c1, r2: Math.min(g.r2, Math.max(sh.maxR, g.r1)), c2: Math.min(g.c2, Math.max(sh.maxC, g.c1)) });
  HC.clipUsed = clipUsed;
  // Recorta solo las filas o columnas completas (A:A, 3:3) al área con datos; un rango normal se respeta.
  const clipBig = (sh, g) => ({ r1: g.r1, c1: g.c1, r2: g.r2 >= MAXR - 1 ? Math.max(sh.maxR, g.r1) : g.r2, c2: g.c2 >= MAXC - 1 ? Math.max(sh.maxC, g.c1) : g.c2 });
  HC.clipBig = clipBig;

  W.displayText = function (sh, r, c) {
    const cell = sh.get(r, c);
    if (!cell || cell.v == null) return '';
    const st = sh.styleAt(r, c);
    return HC.fmt.format(cell.v, st && st.nf).text;
  };
  // Recorre las celdas existentes de un rango: cb(celda, r, c)
  function eachCell(sh, g, cb) {
    const u = clipUsed(sh, g);
    for (let r = u.r1; r <= u.r2; r++) {
      const row = sh.rows[r];
      if (!row) continue;
      for (let c = u.c1, end = Math.min(u.c2, row.length - 1); c <= end; c++) { const cell = row[c]; if (cell) cb(cell, r, c); }
    }
  }
  HC.eachCell = eachCell;

  // ---------------------------------------------------------------- formato
  W.formatRange = function (sh, ranges, patch) {
    this.begin('Formato');
    for (const g of ranges) {
      const allR = g.r1 === 0 && g.r2 >= MAXR - 1, allC = g.c1 === 0 && g.c2 >= MAXC - 1;
      if (!allR && !allC) {
        for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) this._putStyle(sh, r, c, this.styleWith(sh.styleAt(r, c), patch));
        continue;
      }
      const before = { col: sh.colStyle, row: sh.rowStyle, def: sh.defStyle };
      eachCell(sh, g, (cell, r, c) => { if (cell.s) this._putStyle(sh, r, c, this.styleWith(cell.s, patch)); });
      let col = sh.colStyle.slice(), row = sh.rowStyle.slice(), def = sh.defStyle;
      if (allR && allC) {
        def = this.styleWith(def, patch);
        col.forEach((s, i) => { col[i] = this.styleWith(s, patch); });
        row.forEach((s, i) => { row[i] = this.styleWith(s, patch); });
      } else if (allR) {
        sh.rowStyle.forEach((s, r) => { if (s) for (let c = g.c1; c <= g.c2; c++) { const cell = sh.get(r, c); if (!(cell && cell.s)) this._putStyle(sh, r, c, this.styleWith(s, patch)); } });
        for (let c = g.c1; c <= g.c2; c++) col[c] = this.styleWith(col[c] || sh.defStyle, patch);
      } else {
        sh.colStyle.forEach((s, c) => { if (s) for (let r = g.r1; r <= g.r2; r++) { const cell = sh.get(r, c); if (!(cell && cell.s)) this._putStyle(sh, r, c, this.styleWith(s, patch)); } });
        for (let r = g.r1; r <= g.r2; r++) row[r] = this.styleWith(row[r] || sh.defStyle, patch);
      }
      const after = { col, row, def };
      const apply = (o) => { sh.colStyle = o.col; sh.rowStyle = o.row; sh.defStyle = o.def; };
      apply(after);
      this._log(() => apply(before), () => apply(after));
    }
    this.commit();
  };
  W.clearRange = function (sh, ranges, what) {
    this.begin('Borrar');
    for (const g of ranges) {
      if (what !== 'formats') eachCell(sh, g, (cell, r, c) => { if (!cell.g && (cell.f != null || cell.v != null)) this._put(sh, r, c, undefined, null); });
      if (what !== 'contents') {
        eachCell(sh, g, (cell, r, c) => { if (cell.s) this._putStyle(sh, r, c, null); });
        const allR = g.r1 === 0 && g.r2 >= MAXR - 1, allC = g.c1 === 0 && g.c2 >= MAXC - 1;
        if (allR || allC) {
          const before = { col: sh.colStyle, row: sh.rowStyle, def: sh.defStyle };
          const col = sh.colStyle.slice(), row = sh.rowStyle.slice();
          if (allR) for (let c = g.c1; c <= Math.min(g.c2, col.length - 1); c++) delete col[c];
          if (allC) for (let r = g.r1; r <= Math.min(g.r2, row.length - 1); r++) delete row[r];
          const after = { col, row, def: allR && allC ? null : sh.defStyle };
          const apply = (o) => { sh.colStyle = o.col; sh.rowStyle = o.row; sh.defStyle = o.def; };
          apply(after);
          this._log(() => apply(before), () => apply(after));
        }
        const keep = sh.merges.filter((m) => !(m.r1 >= g.r1 && m.r2 <= g.r2 && m.c1 >= g.c1 && m.c2 <= g.c2));
        if (keep.length !== sh.merges.length) this.setProp(sh, 'merges', keep);
      }
      if (what === 'all') eachCell(sh, g, (cell, r, c) => { if (cell.note) this.setNote(sh, r, c, null); });
    }
    this.commit();
  };
  // Bordes. modo: all, outer, inner, top, bottom, left, right, horizontal, vertical, none. border: "estilo color" o null.
  W.setBorders = function (sh, g0, mode, border) {
    const g = { r1: g0.r1, c1: g0.c1, r2: Math.min(g0.r2, Math.max(sh.maxR, g0.r1, 199)), c2: Math.min(g0.c2, Math.max(sh.maxC, g0.c1, 51)) };
    this.begin('Bordes');
    const B = border || null;
    const set = (r, c, patch) => { if (r < 0 || c < 0 || r >= MAXR || c >= MAXC) return; const st = sh.styleAt(r, c); if (!st && !Object.values(patch).some(Boolean)) return; this._putStyle(sh, r, c, this.styleWith(st, patch)); };
    for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) {
      const top = r === g.r1, bottom = r === g.r2, left = c === g.c1, right = c === g.c2, p = {};
      switch (mode) {
        case 'all': p.bt = p.bb = p.bl = p.br = B; break;
        case 'none': p.bt = p.bb = p.bl = p.br = null; break;
        case 'outer': if (top) p.bt = B; if (bottom) p.bb = B; if (left) p.bl = B; if (right) p.br = B; break;
        case 'inner': if (!top) p.bt = B; if (!bottom) p.bb = B; if (!left) p.bl = B; if (!right) p.br = B; break;
        case 'horizontal': if (!top) p.bt = B; if (!bottom) p.bb = B; break;
        case 'vertical': if (!left) p.bl = B; if (!right) p.br = B; break;
        case 'top': if (top) p.bt = B; break;
        case 'bottom': if (bottom) p.bb = B; break;
        case 'left': if (left) p.bl = B; break;
        case 'right': if (right) p.br = B; break;
      }
      if (Object.keys(p).length) set(r, c, p);
    }
    // el borde compartido con las celdas vecinas se quita también en ellas
    if (mode === 'none' || mode === 'all' || mode === 'outer') {
      const nb = mode === 'none' ? null : undefined;
      if (nb === null) {
        for (let c = g.c1; c <= g.c2; c++) { set(g.r1 - 1, c, { bb: null }); set(g.r2 + 1, c, { bt: null }); }
        for (let r = g.r1; r <= g.r2; r++) { set(r, g.c1 - 1, { br: null }); set(r, g.c2 + 1, { bl: null }); }
      }
    }
    this.commit();
  };
  W.mergeRange = function (sh, g) {
    if (g.r1 === g.r2 && g.c1 === g.c2) return;
    this.begin('Combinar celdas');
    let first = null;
    eachCell(sh, g, (cell, r, c) => { if (!first && !cell.g && (cell.f != null || cell.v != null)) first = { f: cell.f, v: cell.v, r, c }; });
    eachCell(sh, g, (cell, r, c) => { if ((r !== g.r1 || c !== g.c1) && !cell.g && (cell.f != null || cell.v != null)) this._put(sh, r, c, undefined, null); });
    if (first && (first.r !== g.r1 || first.c !== g.c1)) this._put(sh, g.r1, g.c1, first.f != null ? HC.shiftFormula(first.f, g.r1 - first.r, g.c1 - first.c) : undefined, first.v);
    this.setProp(sh, 'merges', sh.merges.filter((m) => !HC.rangesIntersect(m, g)).concat([{ r1: g.r1, c1: g.c1, r2: g.r2, c2: g.c2 }]));
    this.commit();
  };
  W.unmergeRange = function (sh, g) {
    const keep = sh.merges.filter((m) => !HC.rangesIntersect(m, g));
    if (keep.length !== sh.merges.length) this.setProp(sh, 'merges', keep);
  };

  // ---------------------------------------------------------------- portapapeles
  W.copyData = function (sh, g) {
    const u = clipBig(sh, g), h = rows(u), w = cols(u), cells = [];
    for (let i = 0; i < h; i++) {
      const row = [];
      for (let j = 0; j < w; j++) {
        const r = u.r1 + i, c = u.c1 + j, cell = sh.get(r, c), st = sh.styleAt(r, c);
        row.push(cell || st ? { f: cell && cell.f != null ? cell.f : undefined, v: cell ? cell.v : null, s: st, note: (cell && cell.note) || null } : null);
      }
      cells.push(row);
    }
    const merges = sh.merges.filter((m) => m.r1 >= u.r1 && m.r2 <= u.r2 && m.c1 >= u.c1 && m.c2 <= u.c2).map((m) => ({ r1: m.r1 - u.r1, c1: m.c1 - u.c1, r2: m.r2 - u.r1, c2: m.c2 - u.c1 }));
    return { sheet: sh, r1: u.r1, c1: u.c1, h, w, cells, merges, range: { r1: u.r1, c1: u.c1, r2: u.r2, c2: u.c2 }, cut: false };
  };
  // Pega datos copiados. opts: {mode: all|values|formulas|formats, transpose, target}. Devuelve el rango pegado.
  W.pasteData = function (sh, r0, c0, data, opts) {
    opts = opts || {};
    const mode = opts.mode || 'all', tr = !!opts.transpose;
    const h = tr ? data.w : data.h, w = tr ? data.h : data.w;
    const src = (i, j) => (tr ? data.cells[j % w][i % h] : data.cells[i % h][j % w]);
    let RH = h, RW = w;
    const t = opts.target;
    if (t) { const th = rows(t), tw = cols(t); if (th % h === 0 && tw % w === 0 && th * tw <= 4e6) { RH = th; RW = tw; } }
    if (r0 + RH > MAXR || c0 + RW > MAXC) return null;
    const dest = { r1: r0, c1: c0, r2: r0 + RH - 1, c2: c0 + RW - 1 };
    const cut = data.cut && !tr && mode === 'all' && this.sheets.indexOf(data.sheet) >= 0;
    this.begin(cut ? 'Mover celdas' : 'Pegar');
    if (mode === 'all') {
      let merges = sh.merges.filter((m) => !HC.rangesIntersect(m, dest));
      let changed = merges.length !== sh.merges.length;
      if (!tr) for (let ti = 0; ti < RH; ti += h) for (let tj = 0; tj < RW; tj += w) for (const m of data.merges) { merges.push({ r1: r0 + ti + m.r1, c1: c0 + tj + m.c1, r2: r0 + ti + m.r2, c2: c0 + tj + m.c2 }); changed = true; }
      if (changed) this.setProp(sh, 'merges', merges);
    }
    for (let i = 0; i < RH; i++) for (let j = 0; j < RW; j++) {
      const s = src(i, j), r = r0 + i, c = c0 + j;
      if (mode !== 'formats') {
        if (s && s.f != null && mode !== 'values') {
          const si = tr ? j % w : i % h, sj = tr ? i % h : j % w;
          this._put(sh, r, c, cut ? s.f : HC.shiftFormula(s.f, r - (data.r1 + si), c - (data.c1 + sj)), null);
        } else this._put(sh, r, c, undefined, s ? s.v : null);
      }
      if (mode === 'all' || mode === 'formats') this._putStyle(sh, r, c, s ? s.s : null);
      if (mode === 'all') { const cur = sh.get(r, c); if (((cur && cur.note) || null) !== ((s && s.note) || null)) this.setNote(sh, r, c, s ? s.note : null); }
    }
    if (cut) {
      const S = data.sheet, dr = r0 - data.r1, dc = c0 - data.c1;
      for (let i = 0; i < data.h; i++) for (let j = 0; j < data.w; j++) {
        const r = data.r1 + i, c = data.c1 + j;
        if (S === sh && HC.inRange(dest, r, c)) continue;
        this._put(S, r, c, undefined, null); this._putStyle(S, r, c, null);
        const cur = S.get(r, c); if (cur && cur.note) this.setNote(S, r, c, null);
      }
      const from = data.range, low = S.name.toLowerCase(), before = this._metaSnap();
      const changes = this._rewriteAll((tk, home) => {
        if (tk.kind !== 'cell' && tk.kind !== 'range') return undefined;
        if (tk.sheet != null ? tk.sheet.toLowerCase() !== low : home !== S) return undefined;
        const a = tk.p1, b = tk.p2 || tk.p1;
        if (Math.min(a.r, b.r) < from.r1 || Math.max(a.r, b.r) > from.r2 || Math.min(a.c, b.c) < from.c1 || Math.max(a.c, b.c) > from.c2) return undefined;
        a.r += dr; a.c += dc;
        if (tk.p2) { b.r += dr; b.c += dc; }
        if (sh !== S) tk.sheet = home === sh ? undefined : sh.name;
        return tk;
      });
      const after = this._metaSnap();
      this._tx.structural = true;
      this._log(() => { this._applyChanges(changes, 3); this._metaRestore(before); }, () => { this._applyChanges(changes, 4); this._metaRestore(after); });
      this._rebuildAll();
      data.cut = false;
    }
    this.commit();
    return dest;
  };
  // Pega texto tabulado (de otra aplicación). Devuelve el rango pegado.
  W.pasteMatrix = function (sh, r0, c0, matrix, target) {
    const h = matrix.length, w = Math.max(1, ...matrix.map((r) => r.length));
    if (!h) return null;
    let RH = h, RW = w;
    if (target) { const th = rows(target), tw = cols(target); if (th % h === 0 && tw % w === 0 && th * tw <= 4e6) { RH = th; RW = tw; } }
    if (r0 + RH > MAXR || c0 + RW > MAXC) return null;
    this.begin('Pegar');
    for (let i = 0; i < RH; i++) for (let j = 0; j < RW; j++) {
      const v = matrix[i % h][j % w];
      if (v == null || v === '') { const cur = sh.get(r0 + i, c0 + j); if (cur && !cur.g && (cur.f != null || cur.v != null)) this._put(sh, r0 + i, c0 + j, undefined, null); }
      else if (typeof v === 'string') this.setCellInput(sh, r0 + i, c0 + j, v);
      else this._put(sh, r0 + i, c0 + j, undefined, v);
    }
    this.commit();
    return { r1: r0, c1: c0, r2: r0 + RH - 1, c2: c0 + RW - 1 };
  };
  W.rangeToMatrix = function (sh, g, raw) {
    const u = clipBig(sh, g), out = [];
    for (let r = u.r1; r <= u.r2; r++) { const row = []; for (let c = u.c1; c <= u.c2; c++) row.push(raw ? sh.value(r, c) : this.displayText(sh, r, c)); out.push(row); }
    return out;
  };

  // ---------------------------------------------------------------- texto delimitado (TSV / CSV)
  HC.csv = {
    parse(text, delim) {
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
      if (!delim) delim = HC.csv.detect(text);
      const out = []; let row = [], cur = '', q = false, i = 0, any = false;
      const n = text.length;
      while (i < n) {
        const ch = text[i];
        if (q) {
          if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i += 2; continue; } q = false; i++; continue; }
          cur += ch; i++; continue;
        }
        if (ch === '"' && cur === '') { q = true; any = true; i++; continue; }
        if (ch === delim) { row.push(cur); cur = ''; any = true; i++; continue; }
        if (ch === '\r' || ch === '\n') {
          if (ch === '\r' && text[i + 1] === '\n') i++;
          row.push(cur); out.push(row); row = []; cur = ''; any = false; i++; continue;
        }
        cur += ch; any = true; i++;
      }
      if (any || cur !== '' || row.length) { row.push(cur); out.push(row); }
      return out;
    },
    detect(text) {
      const head = text.slice(0, 4000); let best = ',', score = -1;
      for (const d of ['\t', ';', ',', '|']) {
        let n = 0, q = false;
        for (const ch of head) { if (ch === '"') q = !q; else if (!q && ch === d) n++; }
        if (n > score) { score = n; best = d; }
      }
      return best;
    },
    stringify(matrix, delim) {
      delim = delim || ',';
      const esc = (v) => { const s = v == null ? '' : String(v); return s.indexOf(delim) >= 0 || /["\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
      return matrix.map((r) => r.map(esc).join(delim)).join('\r\n');
    },
  };

  // ---------------------------------------------------------------- relleno automático de series
  let nameLists = null;
  function lists() {
    if (!nameLists) {
      nameLists = [];
      for (const lang of ['es', 'en']) {
        nameLists.push(HC.dayNames(lang), HC.monthNames(lang));
        const save = HC.locale.lang; HC.locale.lang = lang;
        nameLists.push(HC.date.day3().slice(), HC.date.mon3().slice());
        HC.locale.lang = save;
      }
      nameLists = nameLists.map((l) => l.map((x) => x.toLowerCase()));
    }
    return nameLists;
  }
  const r12 = (x) => parseFloat(x.toPrecision(12));
  function linear(vals) { // devuelve f(k) para una serie numérica
    const n = vals.length;
    if (n === 1) return null;
    const step = vals[1] - vals[0];
    let arith = true;
    for (let i = 2; i < n; i++) if (Math.abs(vals[i] - vals[i - 1] - step) > 1e-9 * Math.max(1, Math.abs(step))) { arith = false; break; }
    if (arith) return (k) => r12(vals[0] + step * k);
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    vals.forEach((y, x) => { sx += x; sy += y; sxx += x * x; sxy += x * y; });
    const m = (n * sxy - sx * sy) / (n * sxx - sx * sx), b = (sy - m * sx) / n;
    return (k) => r12(b + m * k);
  }
  // items: [{f, v, s, nf}] de la serie origen. Devuelve gen(k) -> {f, v, s} para cualquier índice k.
  function seriesGen(items, lineShift, opts) {
    const n = items.length;
    const idx = (k) => ((k % n) + n) % n;
    const pattern = (k) => { const it = items[idx(k)]; return { v: it.v, s: it.s }; };
    const withStyle = (fn) => (k) => ({ v: fn(k), s: items[idx(k)].s });
    if (items.some((it) => it.f != null)) {
      return (k) => { const it = items[idx(k)]; return it.f != null ? { f: lineShift(it.f, k - idx(k)), s: it.s } : { v: it.v, s: it.s }; };
    }
    if (opts.mode === 'copy') return pattern;
    if (items.every((it) => typeof it.v === 'number')) {
      const vals = items.map((it) => it.v);
      if (n === 1) {
        const isDate = !!items[0].nf && HC.fmt.kind(items[0].nf) === 'date';
        const increment = opts.mode === 'series' || isDate !== !!opts.series;
        return increment ? withStyle((k) => vals[0] + k) : pattern;
      }
      return withStyle(linear(vals));
    }
    if (items.every((it) => typeof it.v === 'string')) {
      // nombres de días o meses
      const low = items.map((it) => it.v.toLowerCase());
      for (const list of lists()) {
        const pos = low.map((x) => list.indexOf(x));
        if (pos.some((p) => p < 0)) continue;
        const step = n === 1 ? 1 : ((pos[1] - pos[0]) % list.length + list.length) % list.length || list.length;
        if (n > 2 && !pos.every((p, i) => i === 0 || ((p - pos[i - 1]) % list.length + list.length) % list.length === step % list.length)) continue;
        const first = items[0].v;
        const style = first === first.toUpperCase() ? (x) => x.toUpperCase() : first[0] === first[0].toUpperCase() ? (x) => x[0].toUpperCase() + x.slice(1) : (x) => x;
        return withStyle((k) => style(list[(((pos[0] + step * k) % list.length) + list.length) % list.length]));
      }
      // texto terminado en número: "Semana 1", "Art-007"
      const parts = items.map((it) => /^(.*?)(\d+)$/.exec(it.v));
      if (parts.every(Boolean) && parts.every((p) => p[1] === parts[0][1])) {
        const numsv = parts.map((p) => parseInt(p[2], 10)), width = parts[0][2][0] === '0' ? parts[0][2].length : 0;
        const fn = n === 1 ? (k) => numsv[0] + k : linear(numsv);
        return withStyle((k) => { const v = Math.round(fn(k)); return v < 0 ? items[idx(k)].v : parts[0][1] + String(v).padStart(width, '0'); });
      }
    }
    return pattern;
  }
  // Rellena dest, que contiene a src y se extiende en un sentido.
  // mode elige copiar o continuar una serie. series conserva el comportamiento del arrastre con Ctrl.
  W.fillRange = function (sh, src, dest, opts = {}) {
    const vertical = dest.r1 < src.r1 || dest.r2 > src.r2;
    if (!vertical && !(dest.c1 < src.c1 || dest.c2 > src.c2)) return;
    this.begin('Rellenar');
    const lines = vertical ? cols(src) : rows(src), n = vertical ? rows(src) : cols(src);
    for (let L = 0; L < lines; L++) {
      const items = [];
      for (let i = 0; i < n; i++) {
        const r = vertical ? src.r1 + i : src.r1 + L, c = vertical ? src.c1 + L : src.c1 + i;
        const cell = sh.get(r, c), st = sh.styleAt(r, c);
        items.push({ f: cell && cell.f != null ? cell.f : undefined, v: cell && !cell.g ? cell.v : cell ? cell.v : null, s: st, nf: st && st.nf });
      }
      const gen = seriesGen(items, (f, d) => (vertical ? HC.shiftFormula(f, d, 0) : HC.shiftFormula(f, 0, d)), opts || {});
      const from = vertical ? dest.r1 - src.r1 : dest.c1 - src.c1, to = vertical ? dest.r2 - src.r1 : dest.c2 - src.c1;
      for (let k = from; k <= to; k++) {
        if (k >= 0 && k < n) continue;
        const r = vertical ? src.r1 + k : src.r1 + L, c = vertical ? src.c1 + L : src.c1 + k;
        const out = gen(k);
        if (out.f != null) this._put(sh, r, c, out.f, null); else this._put(sh, r, c, undefined, out.v == null ? null : out.v);
        this._putStyle(sh, r, c, out.s || null);
      }
    }
    this.commit();
  };

  // ---------------------------------------------------------------- ordenar y duplicados
  function readRows(sh, r1, r2, c1, c2) {
    const out = [];
    for (let r = r1; r <= r2; r++) {
      const cells = [];
      for (let c = c1; c <= c2; c++) { const cell = sh.get(r, c); cells.push(cell ? { f: cell.f, v: cell.g ? null : cell.v, s: cell.s || null, note: cell.note || null } : null); }
      out.push({ r, cells });
    }
    return out;
  }
  function writeRows(wb, sh, list, r1, c1, width) {
    list.forEach((rec, i) => {
      const r = r1 + i;
      for (let j = 0; j < width; j++) {
        const x = rec ? rec.cells[j] : null, c = c1 + j;
        if (x && x.f != null) wb._put(sh, r, c, HC.shiftFormula(x.f, r - rec.r, 0), null); else wb._put(sh, r, c, undefined, x ? x.v : null);
        wb._putStyle(sh, r, c, x ? x.s : null);
        const cur = sh.get(r, c);
        if (((cur && cur.note) || null) !== ((x && x.note) || null)) wb.setNote(sh, r, c, x ? x.note : null);
      }
    });
  }
  // keys: [{col (índice absoluto), desc}]
  W.sortRange = function (sh, g, keys, hasHeader) {
    const u = clipUsed(sh, g), r1 = g.r1 + (hasHeader ? 1 : 0), r2 = u.r2;
    if (r2 <= r1 || !keys.length) return false;
    for (const m of sh.merges) if (HC.rangesIntersect(m, { r1, c1: u.c1, r2, c2: u.c2 })) return false;
    const list = readRows(sh, r1, r2, u.c1, u.c2), cmp = HC.fx.sortCmp;
    const keyVal = (rec, k) => { const x = rec.cells[k.col - u.c1]; return x ? (x.f != null ? sh.value(rec.r, k.col) : x.v) : null; };
    const pre = list.map((rec, i) => ({ rec, i, k: keys.map((k) => keyVal(rec, k)) }));
    pre.sort((a, b) => {
      for (let n = 0; n < keys.length; n++) {
        const x = a.k[n], y = b.k[n];
        if (x == null || y == null) { if (x == null && y == null) continue; return x == null ? 1 : -1; }
        const d = cmp(x, y);
        if (d) return keys[n].desc ? -d : d;
      }
      return a.i - b.i;
    });
    this.begin('Ordenar');
    writeRows(this, sh, pre.map((p) => p.rec), r1, u.c1, cols(u));
    this.commit();
    return true;
  };
  W.removeDuplicates = function (sh, g, colList, hasHeader) {
    const u = clipUsed(sh, g), r1 = g.r1 + (hasHeader ? 1 : 0), r2 = u.r2;
    if (r2 < r1) return 0;
    const list = readRows(sh, r1, r2, u.c1, u.c2), seen = new Set(), keep = [];
    const use = colList && colList.length ? colList : Array.from({ length: cols(u) }, (_, i) => u.c1 + i);
    for (const rec of list) {
      const key = use.map((c) => this.displayText(sh, rec.r, c).toLowerCase()).join('\u0001');
      if (seen.has(key)) continue;
      seen.add(key); keep.push(rec);
    }
    const removed = list.length - keep.length;
    if (!removed) return 0;
    this.begin('Quitar duplicados');
    while (keep.length < list.length) keep.push(null);
    writeRows(this, sh, keep, r1, u.c1, cols(u));
    this.commit();
    return removed;
  };
  W.textToColumns = function (sh, g, delim) {
    const u = clipUsed(sh, g);
    this.begin('Texto en columnas');
    for (let r = u.r1; r <= u.r2; r++) {
      const cell = sh.get(r, g.c1);
      if (!cell || typeof cell.v !== 'string' || cell.f != null) continue;
      const parts = delim === ' ' ? cell.v.trim().split(/\s+/) : cell.v.split(delim);
      parts.forEach((p, j) => this.setCellInput(sh, r, g.c1 + j, p.trim()));
    }
    this.commit();
  };

  // ---------------------------------------------------------------- filtro automático
  // sh.filter.cols guarda valores permitidos, textos excluidos de libros antiguos o una condición.
  W.filterBounds = function (sh) {
    const f = sh.filter;
    if (!f) return null;
    const g = f.range;
    if (f.autoExpand === false) return g;
    let r2 = g.r2;
    // se extiende hacia abajo mientras haya datos
    for (let r = r2 + 1; r <= sh.maxR; r++) {
      let any = false;
      for (let c = g.c1; c <= g.c2 && !any; c++) { const cell = sh.get(r, c); if (cell && cell.v != null) any = true; }
      if (!any) break;
      r2 = r;
    }
    return { r1: g.r1, c1: g.c1, r2, c2: g.c2 };
  };
  const filterValue = (v) => v == null ? '' : String(v);
  function conditionTest(spec) {
    const num = (x) => typeof x === 'number' ? x : HC.textToNumber(x ?? '');
    const a = num(spec.v1), b = num(spec.v2), term = String(spec.v1 ?? '').toLowerCase();
    const cmp = (f) => (v) => typeof v === 'number' && a != null && f(v, a);
    const equals = (v, text) => a != null && typeof v === 'number' ? v === a : text.toLowerCase() === term;
    switch (spec.op) {
      case 'eq': return equals;
      case 'neq': return (v, text) => !equals(v, text);
      case 'gt': return cmp((x, y) => x > y);
      case 'gte': return cmp((x, y) => x >= y);
      case 'lt': return cmp((x, y) => x < y);
      case 'lte': return cmp((x, y) => x <= y);
      case 'between': return (v) => typeof v === 'number' && a != null && b != null && v >= Math.min(a, b) && v <= Math.max(a, b);
      case 'contains': return (_, text) => text.toLowerCase().includes(term);
      case 'ncontains': return (_, text) => !text.toLowerCase().includes(term);
      case 'begins': return (_, text) => text.toLowerCase().startsWith(term);
      case 'ends': return (_, text) => text.toLowerCase().endsWith(term);
      case 'blank': return (v) => filterValue(v) === '';
      case 'nblank': return (v) => filterValue(v) !== '';
      default: return () => true;
    }
  }
  HC.condTest = (spec, v, text) => conditionTest(spec)(v, text);
  HC.filterTest = function (spec) {
    if (Array.isArray(spec.values)) {
      const values = new Set(spec.values.map((v) => filterValue(v).toLowerCase()));
      return (v, display) => values.has(filterValue(v).toLowerCase())
        || (spec.matchDisplay && values.has(display().toLowerCase()));
    }
    if (Array.isArray(spec.hidden)) {
      const hidden = new Set(spec.hidden);
      return (_, display) => !hidden.has(display());
    }
    const test = conditionTest(spec);
    const needsText = !['gt', 'gte', 'lt', 'lte', 'between', 'blank', 'nblank'].includes(spec.op);
    return needsText ? (v, display) => test(v, display()) : (v) => test(v);
  };
  W.applyFilter = function (sh) {
    const set = new Set(), f = sh.filter;
    if (f && f.cols) {
      const g = this.filterBounds(sh);
      const specs = Object.entries(f.cols).map(([k, spec]) => ({ c: g.c1 + +k, test: HC.filterTest(spec) }));
      if (specs.length) for (let r = g.r1 + 1; r <= g.r2; r++) {
        for (const s of specs) {
          if (!s.test(sh.value(r, s.c), () => this.displayText(sh, r, s.c))) { set.add(r); break; }
        }
      }
    }
    const previous = sh.rowH.filtered;
    if (set.size === previous.size) {
      let same = true;
      for (const r of set) if (!previous.has(r)) { same = false; break; }
      if (same) return false;
    }
    sh.rowH.filtered = set; sh.rowH.touch();
    return true;
  };
  W.refreshFilters = function () {
    let changed = false;
    for (const sh of this.sheets) {
      if ((sh.filter || sh.rowH.filtered.size) && this.applyFilter(sh)) changed = true;
    }
    return changed;
  };
  W.setFilter = function (sh, filter) {
    this.begin('Filtro');
    this.setProp(sh, 'filter', filter);
    this.commit();
  };
  W.setFilterCol = function (sh, offset, spec) {
    if (!sh.filter) return;
    const colsMap = Object.assign({}, sh.filter.cols || {});
    if (spec) colsMap[offset] = spec; else delete colsMap[offset];
    this.setFilter(sh, { ...sh.filter, cols: colsMap });
  };
  // valores distintos de una columna del filtro (para la lista desplegable)
  W.filterItems = function (sh, offset) {
    const g = this.filterBounds(sh), c = g.c1 + offset, map = new Map();
    for (let r = g.r1 + 1; r <= g.r2; r++) {
      const v = sh.value(r, c), key = filterValue(v), text = this.displayText(sh, r, c);
      if (!map.has(key.toLowerCase())) map.set(key.toLowerCase(), { text, v, key });
    }
    const cmp = HC.fx.sortCmp;
    return Array.from(map.values()).sort((a, b) => (a.key === '' ? 1 : b.key === '' ? -1 : cmp(a.v, b.v)));
  };

  // ---------------------------------------------------------------- formato condicional
  const cfCache = new WeakMap();
  function cfStats(wb, sh, rule) {
    let st = cfCache.get(rule);
    if (st && st.gen === wb.gen) return st;
    st = { gen: wb.gen, nums: [], counts: new Map(), cells: new Map(), args: {} };
    for (const g of rule.ranges) eachCell(sh, g, (cell) => {
      const v = cell.v;
      if (typeof v === 'number') st.nums.push(v);
      if (v != null && v !== '') { const k = typeof v === 'string' ? 's' + v.toLowerCase() : typeof v + v; st.counts.set(k, (st.counts.get(k) || 0) + 1); }
    });
    st.nums.sort((a, b) => a - b);
    const n = st.nums.length;
    st.min = n ? st.nums[0] : 0; st.max = n ? st.nums[n - 1] : 0;
    st.mean = n ? st.nums.reduce((s, x) => s + x, 0) / n : 0;
    cfCache.set(rule, st);
    return st;
  }
  function cfArg(wb, sh, rule, st, key) {
    if (key in st.args) return st.args[key];
    let v = rule[key];
    if (typeof v === 'string') {
      if (v[0] === '=') {
        const p = HC.parseFormula(HC.canonicalizeFormula(v.slice(1)));
        const g = rule.ranges[0];
        v = p.err ? E.VALUE : HC.fx.scalar(HC.evaluate(p.ast, { wb, sheet: sh, r: g.r1, c: g.c1, vars: null }));
      } else { const q = HC.parseInput(v); v = q.v; }
    }
    return (st.args[key] = v == null ? null : v);
  }
  const hex = (c) => { const m = /^#?([0-9a-f]{6})$/i.exec(c || ''); const n = m ? parseInt(m[1], 16) : 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  HC.mixColor = function (a, b, t) {
    const x = hex(a), y = hex(b);
    return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
  };
  function cfTest(wb, sh, rule, r, c) {
    const cell = sh.get(r, c), v = cell ? cell.v : null;
    const st = cfStats(wb, sh, rule), cmp = HC.fx.cmpVals;
    switch (rule.type) {
      case 'cell': {
        if (v == null || v instanceof FErr) return false;
        const a = cfArg(wb, sh, rule, st, 'v1'), b = cfArg(wb, sh, rule, st, 'v2');
        if (a instanceof FErr || a == null) return false;
        const same = typeof v === typeof a;
        switch (rule.op) {
          case 'gt': return same && cmp(v, a) > 0;
          case 'gte': return same && cmp(v, a) >= 0;
          case 'lt': return same && cmp(v, a) < 0;
          case 'lte': return same && cmp(v, a) <= 0;
          case 'eq': return same && cmp(v, a) === 0;
          case 'neq': return !same || cmp(v, a) !== 0;
          case 'between': return same && b != null && cmp(v, a) >= 0 && cmp(v, b) <= 0;
          case 'nbetween': return same && b != null && (cmp(v, a) < 0 || cmp(v, b) > 0);
        }
        return false;
      }
      case 'text': {
        const t = wb.displayText(sh, r, c).toLowerCase(), q = String(rule.v1 == null ? '' : rule.v1).toLowerCase();
        if (!q) return false;
        return rule.op === 'ncontains' ? t.indexOf(q) < 0 : rule.op === 'begins' ? t.startsWith(q) : rule.op === 'ends' ? t.endsWith(q) : t.indexOf(q) >= 0;
      }
      case 'blank': return v == null || v === '';
      case 'nblank': return !(v == null || v === '');
      case 'error': return v instanceof FErr;
      case 'dup': case 'unique': {
        if (v == null || v === '') return false;
        const n = st.counts.get(typeof v === 'string' ? 's' + v.toLowerCase() : typeof v + v) || 0;
        return rule.type === 'dup' ? n > 1 : n === 1;
      }
      case 'top': case 'bottom': {
        if (typeof v !== 'number' || !st.nums.length) return false;
        let k = Math.max(1, Math.floor(rule.n || 10));
        if (rule.pct) k = Math.max(1, Math.floor((st.nums.length * k) / 100));
        k = Math.min(k, st.nums.length);
        return rule.type === 'top' ? v >= st.nums[st.nums.length - k] : v <= st.nums[k - 1];
      }
      case 'above': return typeof v === 'number' && v > st.mean;
      case 'below': return typeof v === 'number' && v < st.mean;
      case 'formula': {
        const key = r * 16384 + c;
        if (st.cells.has(key)) return st.cells.get(key);
        let res = false;
        try {
          const g = rule.ranges[0];
          const f = HC.shiftFormula(HC.canonicalizeFormula(String(rule.formula || '').replace(/^=/, '')), r - g.r1, c - g.c1);
          const p = HC.parseFormula(f);
          if (!p.err) { const out = HC.fx.scalar(HC.evaluate(p.ast, { wb, sheet: sh, r, c, vars: null })); res = out === true || (typeof out === 'number' && out !== 0); }
        } catch (e) { res = false; }
        st.cells.set(key, res);
        return res;
      }
      case 'scale': {
        if (typeof v !== 'number' || st.max === st.min) return false;
        const t = (v - st.min) / (st.max - st.min), cs = rule.colors || ['#f8696b', '#ffeb84', '#63be7b'];
        const bg = cs.length === 3 ? (t < 0.5 ? HC.mixColor(cs[0], cs[1], t * 2) : HC.mixColor(cs[1], cs[2], (t - 0.5) * 2)) : HC.mixColor(cs[0], cs[1], t);
        return { bg };
      }
      case 'bar': {
        if (typeof v !== 'number' || st.max === st.min) return false;
        const lo = Math.min(0, st.min);
        return { bar: { frac: HC.clamp((v - lo) / (st.max - lo), 0, 1), color: rule.color || '#5b9bd5' } };
      }
    }
    return false;
  }
  // Estilo añadido por el formato condicional en una celda (o null).
  W.condStyle = function (sh, r, c) {
    const rules = sh.condFmts;
    let out = null;
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      let inside = false;
      for (const g of rule.ranges) if (r >= g.r1 && r <= g.r2 && c >= g.c1 && c <= g.c2) { inside = true; break; }
      if (!inside) continue;
      const res = cfTest(this, sh, rule, r, c);
      if (!res) continue;
      const add = res === true ? rule.style || {} : res;
      out = out || {};
      for (const k in add) if (!(k in out) && add[k] != null) out[k] = add[k];
    }
    return out;
  };

  // ---------------------------------------------------------------- validación de datos
  W.validationAt = function (sh, r, c) {
    for (const v of sh.validations) for (const g of v.ranges) if (r >= g.r1 && r <= g.r2 && c >= g.c1 && c <= g.c2) return v;
    return null;
  };
  W.validationItems = function (sh, rule) {
    const src = String(rule.source || '');
    if (src[0] === '=') {
      const p = HC.parseFormula(HC.canonicalizeFormula(src.slice(1)));
      if (p.err) return [];
      const g = rule.ranges[0];
      const v = HC.evaluate(p.ast, { wb: this, sheet: sh, r: g.r1, c: g.c1, vars: null });
      if (v instanceof HC.Ref) {
        const out = [], b = v.bounds(), st = v.sheet;
        for (let r = v.r1; r <= b.r2; r++) for (let c = v.c1; c <= b.c2; c++) { const t = this.displayText(st, r, c); if (t !== '') out.push(t); }
        return out;
      }
      return HC.fx.flatten(v).filter((x) => x != null && x !== '' && !(x instanceof FErr)).map((x) => HC.fx.toStr(x));
    }
    return src.split(/[;,]/).map((s) => s.trim()).filter((s) => s !== '');
  };
  // Devuelve null si el texto es válido para la celda, o un mensaje de error.
  W.checkValidation = function (sh, r, c, text) {
    const rule = this.validationAt(sh, r, c);
    if (!rule || text === '' || (text.length > 1 && text[0] === '=')) return null;
    const p = HC.parseInput(text), v = p.v;
    const num = (x) => { if (typeof x === 'number') return x; const q = HC.parseInput(String(x == null ? '' : x)); return typeof q.v === 'number' ? q.v : null; };
    const a = num(rule.v1), b = num(rule.v2);
    const test = (x) => {
      switch (rule.op) {
        case 'between': return a != null && b != null && x >= a && x <= b;
        case 'nbetween': return a != null && b != null && (x < a || x > b);
        case 'eq': return x === a; case 'neq': return x !== a;
        case 'gt': return x > a; case 'gte': return x >= a; case 'lt': return x < a; case 'lte': return x <= a;
      }
      return true;
    };
    let ok = true;
    switch (rule.type) {
      case 'list': { const t = String(text).trim().toLowerCase(); ok = this.validationItems(sh, rule).some((it) => it.toLowerCase() === t); break; }
      case 'whole': ok = typeof v === 'number' && Number.isInteger(v) && test(v); break;
      case 'decimal': ok = typeof v === 'number' && test(v); break;
      case 'date': ok = typeof v === 'number' && !!p.nf && HC.fmt.isDate(p.nf) && test(v); break;
      case 'textlen': ok = test(String(text).length); break;
    }
    return ok ? null : rule.msg || 'El valor no cumple la validación de datos definida para esta celda.';
  };

  // ---------------------------------------------------------------- buscar y reemplazar
  // opts: {matchCase, whole, formulas}. Devuelve la lista de [r, c] que coinciden, en orden de lectura.
  W.findAll = function (sh, query, opts) {
    opts = opts || {};
    const out = [];
    if (query === '') return out;
    const q = opts.matchCase ? query : query.toLowerCase();
    sh.rows.forEach((row, r) => {
      if (!row) return;
      row.forEach((cell, c) => {
        if (!cell || (cell.v == null && cell.f == null)) return;
        let t = opts.formulas && cell.f != null ? '=' + HC.localizeFormula(cell.f) : this.displayText(sh, r, c);
        if (!opts.matchCase) t = t.toLowerCase();
        if (opts.whole ? t === q : t.indexOf(q) >= 0) out.push([r, c]);
      });
    });
    return out;
  };
  W.replaceIn = function (sh, r, c, query, repl, opts) {
    const cell = sh.get(r, c);
    if (!cell || cell.g) return false;
    const src = this.editText(sh, r, c);
    const re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), opts && opts.matchCase ? 'g' : 'gi');
    const out = opts && opts.whole ? repl : src.replace(re, () => repl);
    if (out === src) return false;
    this.setCellInput(sh, r, c, out);
    return true;
  };

  // ---------------------------------------------------------------- buscar objetivo
  W.goalSeek = function (sh, target, goal, changing) {
    const tCell = sh.get(target.r, target.c);
    if (!tCell || tCell.f == null) return { ok: false, msg: 'La celda objetivo debe contener una fórmula.' };
    const cCell = sh.get(changing.r, changing.c);
    if (cCell && cCell.f != null) return { ok: false, msg: 'La celda que cambia debe contener un valor, no una fórmula.' };
    const orig = cCell ? cCell.v : null;
    const f = (x) => { this._setContent(sh, changing.r, changing.c, undefined, x); this.recalc(); const v = sh.value(target.r, target.c); return typeof v === 'number' ? v - goal : NaN; };
    let x0 = typeof orig === 'number' ? orig : 0, x1 = x0 === 0 ? 1 : x0 * 1.1, f0 = f(x0), f1 = f(x1), found = null;
    for (let i = 0; i < 200 && found == null; i++) {
      if (isNaN(f1) || isNaN(f0)) break;
      if (Math.abs(f1) < 1e-9 * Math.max(1, Math.abs(goal))) { found = x1; break; }
      if (f1 === f0) { x1 = x1 * 2 + 1; f1 = f(x1); continue; }
      const x2 = x1 - (f1 * (x1 - x0)) / (f1 - f0);
      x0 = x1; f0 = f1; x1 = x2; f1 = f(x1);
    }
    this._setContent(sh, changing.r, changing.c, undefined, orig); this.recalc();
    if (found == null) return { ok: false, msg: 'No se encontró una solución.' };
    this.begin('Buscar objetivo');
    this._put(sh, changing.r, changing.c, undefined, parseFloat(found.toPrecision(12)));
    this.commit();
    return { ok: true, value: found };
  };
})(typeof window !== 'undefined' ? window : globalThis);
