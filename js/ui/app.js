/* Controlador de la aplicación: libro activo, selección, ratón, teclado, portapapeles y comandos. */
(function () {
  'use strict';
  const HC = window.HC, ui = HC.ui, h = ui.h;
  const MAXR = HC.MAX_ROWS, MAXC = HC.MAX_COLS;
  const cloneR = (g) => ({ r1: g.r1, c1: g.c1, r2: g.r2, c2: g.c2 });
  const LS = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }, del(k) { try { localStorage.removeItem(k); } catch (e) { /* sin almacenamiento */ } } };
  HC.LS = LS;

  const app = (HC.app = {
    wb: null, grid: null, edit: null, clip: null, fillDrag: null, drag: null, showFormulas: false,
    touchSelection: false, touchFill: null, touches: new Map(),
    sel: { r: 0, c: 0, ranges: [{ r1: 0, c1: 0, r2: 0, c2: 0 }], anchor: { r: 0, c: 0 } },
    settings: { dec: null, lang: 'es', currency: '$', dark: false },

    get sheet() { return this.wb.sheets[this.wb.active]; },
    get range() { return this.sel.ranges[this.sel.ranges.length - 1]; },

    // ------------------------------------------------------------ arranque
    init() {
      try { Object.assign(this.settings, JSON.parse(LS.get('hc.settings') || '{}')); } catch (e) { /* ajustes por defecto */ }
      this.applySettings(false);
      HC.chrome.build();
      this.grid = new HC.Grid(this, document.getElementById('grid'));
      this.bindGrid();
      let wb = null;
      try { const saved = LS.get('hc.book'); if (saved) wb = HC.Workbook.fromJSON(JSON.parse(saved)); } catch (e) { console.warn('No se pudo recuperar el libro guardado', e); }
      this.setWorkbook(wb || HC.Workbook.blank(), !!wb);
      this.grid.resize();
      this.focusGrid();
      window.addEventListener('beforeunload', () => this.saveNow());
      document.addEventListener('visibilitychange', () => { if (document.hidden) this.saveNow(); });
      document.addEventListener('copy', (e) => this.onClipboard(e));
      document.addEventListener('cut', (e) => this.onClipboard(e));
      document.addEventListener('paste', (e) => this.onPasteEvent(e));
      document.addEventListener('keydown', (e) => this.onGlobalKey(e));
    },
    applySettings(refresh) {
      const s = this.settings;
      const loc = s.dec ? { dec: s.dec, grp: s.dec === ',' ? '.' : ',' } : HC.detectLocale();
      HC.setLocale({ dec: loc.dec, grp: loc.grp, lang: s.lang || 'es', currency: s.currency || '$' });
      HC.fmt.clearCache();
      document.documentElement.dataset.theme = s.dark ? 'dark' : 'light';
      if (refresh) { LS.set('hc.settings', JSON.stringify(s)); if (this.grid) { this.grid.widths.clear(); this.grid.loadTheme(); } if (this.wb) this.wb.recalcAll(); this.refreshAll(); }
    },
    setWorkbook(wb, keepClean) {
      this.cancelTouchFill();
      if (this.edit) this.endEdit();
      this.wb = wb; this.clip = null;
      wb.selSnapshot = () => ({ sheet: this.sheet.id, r: this.sel.r, c: this.sel.c, ranges: this.sel.ranges.map(cloneR) });
      wb.on('change', (tx) => this.onModelChange(tx));
      wb.on('recalc', () => { this.grid.invalidate(); HC.chrome.updateFormulaBar(); if (HC.charts) HC.charts.sync(); });
      wb.modified = !keepClean ? false : wb.modified;
      const v = this.sheet.view;
      this.sel = { r: v.r || 0, c: v.c || 0, ranges: v.ranges ? v.ranges.map(cloneR) : [{ r1: v.r || 0, c1: v.c || 0, r2: v.r || 0, c2: v.c || 0 }], anchor: { r: v.r || 0, c: v.c || 0 } };
      wb.refreshFilters();
      this.refreshAll();
    },
    refreshAll() {
      if (!this.grid) return;
      HC.chrome.updateAll();
      if (HC.charts) HC.charts.sync(true);
      this.grid.invalidate();
    },
    onModelChange() {
      this.grid.invalidate();
      HC.chrome.updateAll();
      if (HC.charts) HC.charts.sync();
      this.scheduleSave();
    },
    scheduleSave() { clearTimeout(this._saveT); this._saveT = setTimeout(() => this.saveNow(), 1200); HC.chrome.setSaveState('Guardando…'); },
    saveNow() {
      clearTimeout(this._saveT);
      if (!this.wb) return;
      let ok = false;
      try { ok = LS.set('hc.book', JSON.stringify(this.wb.toJSON())); } catch (e) { ok = false; }
      const saved = window.AndroidSpreadsheet ? 'Guardado en este dispositivo' : 'Guardado en este navegador';
      HC.chrome.setSaveState(ok ? saved : 'Sin guardado automático (libro demasiado grande): descárgalo desde Archivo');
    },
    focusGrid() { if (this.grid && !ui.dialogOpen()) this.grid.sink.focus({ preventScroll: true }); },
    afterRender() { this.positionEditor(); if (HC.charts) HC.charts.layout(); },

    // ------------------------------------------------------------ hojas
    activateSheet(i, keepEdit) {
      if (i < 0 || i >= this.wb.sheets.length || i === this.wb.active) return;
      if (this.edit && !keepEdit && !this.commitEdit()) return;
      this.cancelTouchFill();
      const cur = this.sheet;
      cur.view.r = this.sel.r; cur.view.c = this.sel.c; cur.view.ranges = this.sel.ranges.map(cloneR);
      this.wb.active = i;
      const v = this.sheet.view;
      this.sel = { r: v.r || 0, c: v.c || 0, ranges: v.ranges ? v.ranges.map(cloneR) : [{ r1: v.r || 0, c1: v.c || 0, r2: v.r || 0, c2: v.c || 0 }], anchor: { r: v.r || 0, c: v.c || 0 } };
      this.refreshAll();
      this.scheduleSave();
    },

    // ------------------------------------------------------------ selección
    withMerges(g) {
      const sh = this.sheet;
      if (!sh.merges.length) return g;
      g = cloneR(g);
      for (let again = true; again;) {
        again = false;
        for (const m of sh.merges) if (HC.rangesIntersect(m, g) && (m.r1 < g.r1 || m.r2 > g.r2 || m.c1 < g.c1 || m.c2 > g.c2)) {
          g.r1 = Math.min(g.r1, m.r1); g.r2 = Math.max(g.r2, m.r2); g.c1 = Math.min(g.c1, m.c1); g.c2 = Math.max(g.c2, m.c2); again = true;
        }
      }
      return g;
    },
    // opts: {extend, add, noScroll}
    select(r, c, opts) {
      opts = opts || {};
      this._tabStart = null;
      r = HC.clamp(r, 0, MAXR - 1); c = HC.clamp(c, 0, MAXC - 1);
      const s = this.sel;
      if (opts.extend) {
        const g = this.withMerges(HC.normRange({ r1: s.anchor.r, c1: s.anchor.c, r2: r, c2: c }));
        s.ranges[s.ranges.length - 1] = g;
        this._cursor = { r, c };
      } else {
        const m = this.sheet.mergeAt(r, c);
        const g = m ? cloneR(m) : { r1: r, c1: c, r2: r, c2: c };
        if (m) { r = m.r1; c = m.c1; }
        if (opts.add) s.ranges.push(g); else s.ranges = [g];
        s.r = r; s.c = c; s.anchor = { r, c }; this._cursor = { r, c };
      }
      if (!opts.noScroll) this.grid.ensureVisible(r, c);
      this.onSelChange();
    },
    setRange(g, r, c, add) {
      const s = this.sel;
      g = cloneR(g);
      if (add) s.ranges.push(g); else s.ranges = [g];
      s.r = r == null ? g.r1 : r; s.c = c == null ? g.c1 : c; s.anchor = { r: s.r, c: s.c }; this._cursor = { r: g.r2, c: g.c2 };
      this.onSelChange();
    },
    onSelChange() {
      if (this.clip && !this.clip.data.cut) { /* la marca de copia se mantiene */ }
      if (this.touchFill && !HC.sameRange(this.touchFill.src, this.range)) this.cancelTouchFill();
      this.grid.invalidate();
      HC.chrome.updateSelection();
    },
    // siguiente índice visible en un eje
    stepAxis(ax, i, d, max) { let n = i + d; while (n >= 0 && n < max && ax.size(n) === 0) n += d; return n < 0 || n >= max ? i : n; },
    // salto con Ctrl+flecha: hasta el borde del bloque de datos
    jump(r, c, dr, dc) {
      const sh = this.sheet, has = (rr, cc) => { const x = sh.get(rr, cc); return !!x && x.v != null && x.v !== ''; };
      const lim = (rr, cc) => rr >= 0 && cc >= 0 && rr < MAXR && cc < MAXC;
      let nr = r + dr, nc = c + dc;
      if (!lim(nr, nc)) return { r, c };
      if (has(r, c) && has(nr, nc)) { while (lim(nr + dr, nc + dc) && has(nr + dr, nc + dc)) { nr += dr; nc += dc; } return { r: nr, c: nc }; }
      // busca la siguiente celda con datos
      const edgeR = dr > 0 ? sh.maxR : 0, edgeC = dc > 0 ? sh.maxC : 0;
      while (lim(nr, nc) && !has(nr, nc)) {
        if ((dr > 0 && nr > edgeR) || (dc > 0 && nc > edgeC) || (dr < 0 && nr <= 0) || (dc < 0 && nc <= 0)) break;
        nr += dr; nc += dc;
      }
      if (lim(nr, nc) && has(nr, nc)) return { r: nr, c: nc };
      return { r: dr > 0 ? MAXR - 1 : dr < 0 ? 0 : r, c: dc > 0 ? MAXC - 1 : dc < 0 ? 0 : c };
    },
    moveSel(dr, dc, opts) {
      opts = opts || {};
      const sh = this.sheet, s = this.sel;
      const from = opts.extend ? this._cursor || { r: s.r, c: s.c } : { r: s.r, c: s.c };
      let r = from.r, c = from.c;
      if (!opts.extend) { const m = sh.mergeAt(r, c); if (m) { if (dr > 0) r = m.r2; if (dc > 0) c = m.c2; } }
      if (opts.jump) { const j = this.jump(r, c, dr, dc); r = j.r; c = j.c; }
      else { if (dr) r = this.stepAxis(sh.rowH, r, dr, MAXR); if (dc) c = this.stepAxis(sh.colW, c, dc, MAXC); }
      this.select(r, c, { extend: opts.extend });
    },
    // Tab / Enter: se mueve dentro del rango seleccionado si tiene varias celdas
    advance(dr, dc) {
      const s = this.sel, g = this.range, sh = this.sheet;
      const act = sh.mergeAt(s.r, s.c) || { r1: s.r, c1: s.c, r2: s.r, c2: s.c };
      if (s.ranges.length === 1 && HC.sameRange(g, act)) {
        // Tab seguido de Intro vuelve a la columna donde empezó la fila
        if (dc) { const start = this._tabStart == null ? s.c : this._tabStart; this.moveSel(0, dc); this._tabStart = start; return; }
        if (dr > 0 && this._tabStart != null) { const c0 = this._tabStart; this.select(this.stepAxis(sh.rowH, act.r2, 1, MAXR), c0); return; }
        this.moveSel(dr, dc);
        return;
      }
      let r = s.r, c = s.c;
      const next = () => {
        if (dc) { c += dc; if (c > g.c2) { c = g.c1; r++; } else if (c < g.c1) { c = g.c2; r--; } if (r > g.r2) r = g.r1; else if (r < g.r1) r = g.r2; }
        else { r += dr; if (r > g.r2) { r = g.r1; c++; } else if (r < g.r1) { r = g.r2; c--; } if (c > g.c2) c = g.c1; else if (c < g.c1) c = g.c2; }
      };
      for (let k = 0; k < 10000; k++) { next(); const m = sh.mergeAt(r, c); if ((!m || (m.r1 === r && m.c1 === c)) && sh.rowH.size(r) > 0 && sh.colW.size(c) > 0) break; }
      s.r = r; s.c = c;
      this.grid.ensureVisible(r, c);
      this.onSelChange();
    },
    selectAll() { this.setRange({ r1: 0, c1: 0, r2: MAXR - 1, c2: MAXC - 1 }, this.sel.r, this.sel.c); },
    goTo(text) {
      const t = String(text).trim();
      if (!t) return false;
      const nm = this.wb.names.get(t.toUpperCase());
      let g = HC.parseSheetRange(nm ? nm.f : t);
      if (!g && nm) { const p = HC.parseFormula(nm.f); if (!p.err && p.ast.t === 'ref') g = { sheet: p.ast.sheet, r1: p.ast.r1, c1: p.ast.c1, r2: p.ast.r2, c2: p.ast.c2 }; }
      if (!g) return false;
      if (g.sheet != null) { const sh = this.wb.sheetByName(g.sheet); if (!sh) return false; this.activateSheet(this.wb.sheets.indexOf(sh)); }
      this.setRange(g, g.r1, g.c1);
      this.grid.ensureVisible(g.r1, g.c1);
      return true;
    },
    restoreSel(snap) {
      if (!snap) return;
      const i = this.wb.sheets.findIndex((s) => s.id === snap.sheet);
      if (i >= 0 && i !== this.wb.active) this.wb.active = i;
      this.sel = { r: snap.r, c: snap.c, ranges: snap.ranges.map(cloneR), anchor: { r: snap.r, c: snap.c } };
      this.grid.ensureVisible(snap.r, snap.c);
    },
    // Resumen numérico de la selección para la barra de estado.
    selStats() {
      const sh = this.sheet;
      let n = 0, cnt = 0, sum = 0, min = Infinity, max = -Infinity;
      for (const g of this.sel.ranges) HC.eachCell(sh, g, (cell, r) => {
        if (cell.v == null || cell.v === '' || sh.rowH.size(r) === 0) return;
        cnt++;
        if (typeof cell.v === 'number') { n++; sum += cell.v; if (cell.v < min) min = cell.v; if (cell.v > max) max = cell.v; }
      });
      return { n, cnt, sum, min, max, avg: n ? sum / n : 0 };
    },

    // ------------------------------------------------------------ ratón
    pt(e) { const b = this.grid.canvas.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; },
    bindGrid() {
      const g = this.grid, cv = g.canvas;
      cv.addEventListener('pointerdown', (e) => this.onPointerDown(e));
      cv.addEventListener('pointermove', (e) => this.onPointerMove(e));
      cv.addEventListener('pointerup', (e) => this.onPointerUp(e));
      cv.addEventListener('pointercancel', (e) => this.onPointerUp(e));
      cv.addEventListener('lostpointercapture', (e) => {
        if (this.touches.has(e.pointerId)) this.onTouchEnd(e, true);
      });
      cv.addEventListener('pointerleave', () => { if (!this.drag) this.hideTip(); });
      cv.addEventListener('dblclick', (e) => { if (!e.sourceCapabilities?.firesTouchEvents) this.onDblClick(e); });
      cv.addEventListener('contextmenu', (e) => { e.preventDefault(); if (e.pointerType !== 'touch' && !e.sourceCapabilities?.firesTouchEvents) this.onContextMenu(e); });
      document.addEventListener('pointerdown', () => { this._holdClick = false; }, true);
      document.addEventListener('click', (e) => {
        // La pulsación larga abre el menú antes de que el navegador genere el clic al levantar el dedo.
        if (!this._holdClick || !(e.pointerType === 'touch' || e.sourceCapabilities?.firesTouchEvents)) return;
        this._holdClick = false;
        e.preventDefault();
        e.stopImmediatePropagation();
      }, true);
      g.host.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
      g.sink.addEventListener('keydown', (e) => this.onKeyDown(e));
      g.sink.addEventListener('input', () => {
        if (this._composing) return;
        if (ui.dialogOpen()) { g.sink.value = ''; return; }
        const t = g.sink.value.replace(/\n/g, ''); g.sink.value = '';
        if (!t) return;
        if (!this.edit) this.startEdit(t, { mode: 'enter' });
        else { const el = this.activeInput(), p = el.selectionStart; this.focusEditor(); this.setEditText(this.edit.text.slice(0, p) + t + this.edit.text.slice(el.selectionEnd), p + t.length); }
      });
      g.sink.addEventListener('compositionstart', () => { this._composing = true; });
      g.sink.addEventListener('compositionend', () => { this._composing = false; const t = g.sink.value; g.sink.value = ''; if (t && !this.edit) this.startEdit(t, { mode: 'enter' }); });
      g.host.addEventListener('pointerdown', (e) => { if (e.target === g.host || e.target === g.layer) this.focusGrid(); });
    },
    onWheel(e) {
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); this.setZoom(this.grid.zoom + (e.deltaY < 0 ? 0.1 : -0.1)); return; }
      const k = e.deltaMode === 1 ? 20 : e.deltaMode === 2 ? this.grid.viewSize().h : 1;
      let dx = e.deltaX * k, dy = e.deltaY * k;
      if (e.shiftKey && !dx) { dx = dy; dy = 0; }
      if (this.grid.scrollBy(dx / this.grid.zoom, dy / this.grid.zoom)) e.preventDefault();
      this.hideTip();
    },
    setZoom(z, point) {
      this.grid.setZoom(z, point);
      HC.chrome.updateZoom();
    },
    pinchGeometry() {
      const [a, b] = this.touches.values(), g = this.grid;
      const p = this.pt({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
      return { x: p.x, y: p.y, span: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), zoom: g.zoom };
    },
    startPinch() {
      const p = this.pinchGeometry();
      this.drag = { type: 'pinch', start: p, anchor: this.grid.zoomAnchor(p.x, p.y) };
    },
    resizeDrag(isCol, idx, start) {
      const sheet = this.sheet, axis = isCol ? sheet.colW : sheet.rowH;
      return { type: 'resize', isCol, idx, start, sheet, axis, size0: axis.size(idx), raw0: axis.sizes.get(idx) };
    },
    moveResize(d, e) {
      const axisPoint = d.isCol ? e.clientX : e.clientY;
      d.size = Math.max(d.isCol ? 4 : 2, Math.round(d.size0 + (axisPoint - d.start) / this.grid.zoom));
      if (!d.touch) d.axis.set(d.idx, d.size);
      this.showTip((d.isCol ? 'Ancho: ' : 'Alto: ') + d.size + ' px', e.clientX + 12, e.clientY + 14);
      this.grid.invalidate();
    },
    finishResize(d, canceled) {
      this.hideTip();
      if (!d.touch) d.axis.set(d.idx, d.raw0);
      this.grid.invalidate();
      if (canceled || d.sheet !== this.sheet || d.size == null || d.size === d.size0) return;
      // Se aplica a todos los encabezados seleccionados cuando el separador pertenece a ese rango.
      const targets = new Set([d.idx]);
      for (const r of this.sel.ranges) {
        const full = d.isCol ? r.r1 === 0 && r.r2 >= MAXR - 1 : r.c1 === 0 && r.c2 >= MAXC - 1;
        const a = d.isCol ? r.c1 : r.r1, b = d.isCol ? r.c2 : r.r2;
        if (full && d.idx >= a && d.idx <= b && b - a < 5000) for (let i = a; i <= b; i++) targets.add(i);
      }
      this.wb.begin('Cambiar tamaño');
      for (const i of targets) this.wb.setSize(d.sheet, d.isCol ? 'col' : 'row', i, d.size);
      this.wb.commit();
    },
    canArmTouchFill() {
      const g = this.range;
      return this.sel.ranges.length === 1 && g.r2 - g.r1 < MAXR - 1 && g.c2 - g.c1 < MAXC - 1;
    },
    armTouchFill(series) {
      if (!this.canArmTouchFill() || (this.edit && !this.commitEdit())) return;
      const src = cloneR(this.range);
      this.touchFill = { src, sheet: this.sheet, mode: series ? 'series' : 'copy' };
      this.touchSelection = true;
      this._lastTap = null;
      this.grid.ensureVisible(src.r2, src.c2);
      this.grid.invalidate();
      ui.toast('Arrastra el cuadrado verde para ' + (series ? 'continuar la serie.' : 'copiar las celdas.'), 4000);
    },
    cancelTouchFill() {
      if (!this.touchFill) return false;
      this.touchFill = null;
      if (this.drag?.type === 'fill' && this.drag.touch) {
        this.drag = this.fillDrag = this._lastMove = null;
        clearInterval(this._auto);
      }
      this.grid.invalidate();
      return true;
    },
    finishFill(d, options, canceled) {
      const dest = this.fillDrag?.dest;
      this.fillDrag = null;
      if (d.touch) this.cancelTouchFill();
      if (!canceled && dest && d.sheet === this.sheet && !HC.sameRange(dest, d.src)) {
        this.wb.fillRange(this.sheet, d.src, dest, options);
        this.setRange(dest, this.sel.r, this.sel.c);
      }
      this.grid.invalidate();
    },
    onTouchStart(e, hit, point) {
      if (!this.touches.size && this.drag) return;
      const g = this.grid, id = e.pointerId, x = e.clientX, y = e.clientY;
      this.touches.set(id, { x, y });
      g.canvas.setPointerCapture(id);
      if (this.touches.size === 2) {
        clearTimeout(this.drag?.hold);
        clearInterval(this._auto);
        this._lastMove = this._lastTap = null;
        if (this.drag?.type === 'resize') this.finishResize(this.drag, true);
        this.cancelTouchFill();
        ui.closePopups();
        this.startPinch();
      }
      if (this.touches.size > 1 || this.drag?.type === 'pinch') return;
      const handle = g.hitHandle(point.x, point.y);
      if (this.touchFill && handle?.fill) {
        this.drag = { type: 'fill', touch: true, id, x, y, ...this.touchFill };
        this.fillDrag = { dest: this.touchFill.src };
        return;
      }
      const rangeHandle = !this.cancelTouchFill() && !['filter', 'vlist'].includes(hit.t) ? handle : null;
      this.touchSelection = true;
      g.invalidate();
      const d = this.drag = { type: rangeHandle ? 'touch-range' : 'touch', id, x, y, hit, handle: rangeHandle, moved: false };
      if (!(this.edit && this.canPoint()) && ['cell', 'rowhdr', 'colhdr'].includes(hit.t)) {
        d.hold = setTimeout(() => {
          d.held = true;
          this._lastTap = null;
          this.onContextMenu(e);
        }, 550);
      }
    },
    onTouchMove(e) {
      const id = e.pointerId, d = this.drag, g = this.grid;
      if (!d || !this.touches.has(id)) return;
      const x = e.clientX, y = e.clientY;
      this.touches.set(id, { x, y });
      if (d.type === 'pinch') {
        if (this.touches.size < 2) return;
        const p = this.pinchGeometry();
        this.setZoom(d.start.zoom * p.span / d.start.span, { x: p.x, y: p.y, anchor: d.anchor });
        return;
      }
      if (d.id !== id || d.held) return;
      if (d.type === 'resize') { this.moveResize(d, e); return; }
      const dx = x - d.x, dy = y - d.y;
      if (d.type === 'fill') {
        if (d.moved || Math.abs(dx) + Math.abs(dy) >= 5) {
          d.moved = true;
          this._lastMove = { x, y };
          this.dragTo(x, y);
          this.autoScroll();
        }
        return;
      }
      const isCol = d.hit.t === 'colhdr';
      const along = Math.abs(isCol ? dx : dy), across = Math.abs(isCol ? dy : dx);
      const resize = !d.moved && d.hit.resize != null && along >= 5 && along >= across && !this.canPoint();
      if (!resize && !d.moved && Math.abs(dx) + Math.abs(dy) < (d.handle ? 5 : 8)) return;
      clearTimeout(d.hold);
      this._lastTap = null;
      d.moved = true;
      if (resize) {
        if (this.edit && !this.commitEdit()) return;
        this.drag = { ...this.resizeDrag(isCol, d.hit.resize, isCol ? d.x : d.y), touch: true, id };
        this.moveResize(this.drag, e);
      } else if (d.handle) {
        this._lastMove = { x, y };
        this.dragTo(x, y);
        this.autoScroll();
      } else {
        g.scrollBy(-dx / g.zoom, -dy / g.zoom);
        d.x = x;
        d.y = y;
      }
    },
    onTouchEnd(e, canceled) {
      const id = e.pointerId, d = this.drag;
      if (!this.touches.delete(id)) return;
      if (d?.type === 'pinch') {
        if (this.touches.size >= 2) this.startPinch();
        else if (!this.touches.size) this.drag = null;
        return;
      }
      if (!d || d.id !== id) return;
      clearTimeout(d.hold);
      clearInterval(this._auto);
      this.drag = this._lastMove = null;
      if (d.type === 'resize') { this.finishResize(d, canceled); return; }
      if (d.type === 'fill') {
        if (canceled || d.moved) this.finishFill(d, { mode: d.mode }, canceled);
        else { this.fillDrag = null; this.grid.invalidate(); }
        return;
      }
      if (!canceled && d.held) this._holdClick = true;
      else if (!canceled && !d.moved) this.onTouchTap(d.hit, e);
      if (d.handle && d.moved) HC.chrome.updateSelection();
    },
    onPointerDown(e) {
      if (e.button === 2) return;
      const g = this.grid, pt = this.pt(e), hit = g.hit(pt.x, pt.y, e.pointerType === 'touch'), sh = this.sheet;
      ui.closePopups(); this.hideTip();
      if (HC.charts) HC.charts.select(null);
      e.preventDefault();
      if (e.pointerType === 'touch') { this.onTouchStart(e, hit, pt); return; }
      if (this.touches.size) return;
      this.cancelTouchFill();
      if (this.touchSelection) { this.touchSelection = false; g.invalidate(); }
      const pointing = this.edit && this.canPoint();
      if (!pointing) this.focusGrid();
      const cap = () => g.canvas.setPointerCapture(e.pointerId);
      switch (hit.t) {
        case 'corner': if (this.edit && !this.commitEdit()) return; this.selectAll(); break;
        case 'colhdr': case 'rowhdr': {
          const isCol = hit.t === 'colhdr', idx = isCol ? hit.c : hit.r;
          if (hit.resize != null && !pointing) {
            if (this.edit && !this.commitEdit()) return;
            this.drag = this.resizeDrag(isCol, hit.resize, isCol ? e.clientX : e.clientY);
            cap(); return;
          }
          if (pointing) { this.pointAt(isCol ? 0 : idx, isCol ? idx : 0, false, isCol ? 'col' : 'row'); this.drag = { type: 'point', line: isCol ? 'col' : 'row' }; cap(); return; }
          if (this.edit && !this.commitEdit()) return;
          const s = this.sel;
          if (e.shiftKey) {
            const a = isCol ? s.anchor.c : s.anchor.r;
            s.ranges[s.ranges.length - 1] = isCol ? { r1: 0, r2: MAXR - 1, c1: Math.min(a, idx), c2: Math.max(a, idx) } : { c1: 0, c2: MAXC - 1, r1: Math.min(a, idx), r2: Math.max(a, idx) };
            this.onSelChange();
          } else {
            const first = isCol ? g.rowAt(g.hdrH + 1) : g.colAt(g.hdrW + 1);
            this.setRange(isCol ? { r1: 0, r2: MAXR - 1, c1: idx, c2: idx } : { c1: 0, c2: MAXC - 1, r1: idx, r2: idx }, isCol ? first : idx, isCol ? idx : first, e.ctrlKey || e.metaKey);
          }
          this.drag = { type: 'hdr', isCol, from: e.shiftKey ? (isCol ? this.sel.anchor.c : this.sel.anchor.r) : idx };
          cap(); break;
        }
        case 'fill': if (this.edit) return; this.drag = { type: 'fill', sheet: sh, src: cloneR(this.range) }; this.fillDrag = { dest: this.drag.src }; cap(); break;
        case 'filter': if (this.edit && !this.commitEdit()) return; HC.dlg.filterMenu(hit, e); break;
        case 'vlist': HC.dlg.validationList(hit); break;
        case 'cell': {
          if (pointing) { this.pointAt(hit.r, hit.c, e.shiftKey); this.drag = { type: 'point' }; cap(); return; }
          if (this.edit && !this.commitEdit()) return;
          if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
            const cell = sh.get(hit.r, hit.c);
            if (cell && cell.f != null && /^HYPERLINK\(/.test(cell.f)) { this.openLink(hit.r, hit.c); return; }
          }
          this.select(hit.r, hit.c, { extend: e.shiftKey, add: (e.ctrlKey || e.metaKey) && !e.shiftKey, noScroll: true });
          this.drag = { type: 'select' };
          cap(); break;
        }
      }
    },
    onPointerMove(e) {
      if (e.pointerType === 'touch') { this.onTouchMove(e); return; }
      if (this.touches.size) return;
      const d = this.drag;
      if (!d) { this.hover(e); return; }
      if (d.type === 'resize') {
        this.moveResize(d, e);
        return;
      }
      this._lastMove = { x: e.clientX, y: e.clientY };
      this.dragTo(e.clientX, e.clientY);
      this.autoScroll();
    },
    dragTo(cx, cy) {
      const g = this.grid, d = this.drag, b = g.canvas.getBoundingClientRect();
      if (d.type === 'touch-range') {
        cx += d.handle.dx;
        cy += d.handle.dy;
      }
      const x = HC.clamp(cx - b.left, g.hdrW * g.zoom + 1, b.width - 2), y = HC.clamp(cy - b.top, g.hdrH * g.zoom + 1, b.height - 2);
      const r = g.rowAt(y / g.zoom), c = g.colAt(x / g.zoom);
      if (d.type === 'select') this.select(r, c, { extend: true, noScroll: true });
      else if (d.type === 'touch-range') {
        const anchor = d.handle;
        const range = this.withMerges(HC.normRange({ r1: anchor.r, c1: anchor.c, r2: r, c2: c }));
        if (!HC.sameRange(range, this.range)) this.setRange(range);
      }
      else if (d.type === 'point') this.pointAt(r, c, true, d.line);
      else if (d.type === 'hdr') {
        const s = this.sel, a = d.from, i = d.isCol ? c : r;
        s.ranges[s.ranges.length - 1] = d.isCol ? { r1: 0, r2: MAXR - 1, c1: Math.min(a, i), c2: Math.max(a, i) } : { c1: 0, c2: MAXC - 1, r1: Math.min(a, i), r2: Math.max(a, i) };
        this.onSelChange();
      } else if (d.type === 'fill') {
        const s = d.src, dest = cloneR(s);
        const dv = r > s.r2 ? r - s.r2 : r < s.r1 ? s.r1 - r : 0, dh = c > s.c2 ? c - s.c2 : c < s.c1 ? s.c1 - c : 0;
        if (dv >= dh && dv > 0) { if (r > s.r2) dest.r2 = r; else dest.r1 = r; } else if (dh > 0) { if (c > s.c2) dest.c2 = c; else dest.c1 = c; }
        this.fillDrag = { dest }; g.invalidate();
      }
    },
    autoScroll() {
      clearInterval(this._auto);
      const g = this.grid, d = this.drag;
      if (!d || d.type === 'resize' || d.type === 'touch') return;
      this._auto = setInterval(() => {
        if (!this.drag || !this._lastMove) { clearInterval(this._auto); return; }
        const b = g.canvas.getBoundingClientRect(), m = this._lastMove;
        let dx = 0, dy = 0;
        const edge = d.type === 'touch-range' || d.touch ? 18 : 6;
        if (m.x > b.right - edge) dx = 40; else if (m.x < b.left + g.hdrW * g.zoom) dx = -40;
        if (m.y > b.bottom - edge) dy = 24; else if (m.y < b.top + g.hdrH * g.zoom) dy = -24;
        if (this.drag.type === 'hdr') { if (this.drag.isCol) dy = 0; else dx = 0; }
        if ((dx || dy) && g.scrollBy(dx, dy)) this.dragTo(m.x, m.y); else if (!dx && !dy) clearInterval(this._auto);
      }, 50);
    },
    onPointerUp(e) {
      if (e.pointerType === 'touch') { this.onTouchEnd(e, e.type === 'pointercancel'); return; }
      if (this.touches.size) return;
      const d = this.drag;
      if (!d) return;
      clearInterval(this._auto);
      this.drag = null; this._lastMove = null;
      const g = this.grid;
      try { g.canvas.releasePointerCapture(e.pointerId); } catch (err) { /* ya liberado */ }
      if (d.type === 'resize') {
        this.finishResize(d, e.type === 'pointercancel');
        return;
      }
      if (d.type === 'fill') {
        this.finishFill(d, { series: e.ctrlKey }, e.type === 'pointercancel');
      }
      if (d.type === 'point') this.focusEditor();
    },
    onTouchTap(hit, e) {
      const g = this.grid;
      const last = this._lastTap;
      this._lastTap = null;
      const line = hit.t === 'colhdr' ? 'col' : hit.t === 'rowhdr' ? 'row' : null;
      if ((line || hit.t === 'cell') && this.canPoint()) {
        this.pointAt(hit.r ?? 0, hit.c ?? 0, false, line);
        this.focusEditor();
        return;
      }
      if (this.edit && !this.commitEdit()) return;
      if (hit.t === 'cell') {
        this.select(hit.r, hit.c, { noScroll: true });
        if (last && last.r === hit.r && last.c === hit.c && e.timeStamp - last.time < 400) {
          this.startEdit(null, { mode: 'edit', where: window.AndroidSpreadsheet ? 'cell' : 'bar' });
        } else {
          this._lastTap = { r: hit.r, c: hit.c, time: e.timeStamp };
          this.focusGrid();
        }
      } else if (line === 'col') {
        this.setRange({ r1: 0, r2: MAXR - 1, c1: hit.c, c2: hit.c }, g.rowAt(g.hdrH + 1), hit.c);
      } else if (line === 'row') {
        this.setRange({ c1: 0, c2: MAXC - 1, r1: hit.r, r2: hit.r }, hit.r, g.colAt(g.hdrW + 1));
      } else if (hit.t === 'corner') this.selectAll();
      else if (hit.t === 'filter') HC.dlg.filterMenu(hit);
      else if (hit.t === 'vlist') HC.dlg.validationList(hit);
    },
    onDblClick(e) {
      const g = this.grid, pt = this.pt(e), hit = g.hit(pt.x, pt.y), sh = this.sheet;
      if (hit.t === 'cell') { if (!this.edit) { this.select(hit.r, hit.c); this.startEdit(null, { mode: 'edit' }); } }
      else if (hit.t === 'colhdr' && hit.resize != null) this.run('autoFitCols', hit.resize);
      else if (hit.t === 'rowhdr' && hit.resize != null) this.run('autoFitRows', hit.resize);
      else if (hit.t === 'fill') {
        const s = this.range;
        const has = (r, c) => c >= 0 && c < MAXC && sh.value(r, c) != null;
        const side = has(s.r2 + 1, s.c1 - 1) ? s.c1 - 1 : has(s.r2 + 1, s.c2 + 1) ? s.c2 + 1 : -1;
        if (side < 0) return;
        let r = s.r2; while (r + 1 < MAXR && has(r + 1, side)) r++;
        if (r > s.r2) { const dest = { r1: s.r1, c1: s.c1, r2: r, c2: s.c2 }; this.wb.fillRange(sh, cloneR(s), dest); this.setRange(dest, this.sel.r, this.sel.c); }
      }
    },
    hover(e) {
      const g = this.grid, pt = this.pt(e), hit = g.hit(pt.x, pt.y), sh = this.sheet;
      let cur = 'cell';
      if (hit.t === 'colhdr') cur = hit.resize != null ? 'col-resize' : 'default';
      else if (hit.t === 'rowhdr') cur = hit.resize != null ? 'row-resize' : 'default';
      else if (hit.t === 'fill') cur = 'crosshair';
      else if (hit.t === 'filter' || hit.t === 'vlist' || hit.t === 'corner') cur = 'pointer';
      if (g.canvas.style.cursor !== cur) g.canvas.style.cursor = cur;
      if (hit.t === 'cell') {
        const key = hit.r + ':' + hit.c;
        if (this._tipKey === key) return;
        const cell = sh.get(hit.r, hit.c);
        let msg = null;
        if (cell && cell.note) msg = cell.note;
        else if (cell && cell.v instanceof HC.FErr) msg = HC.errText(cell.v) + ' · ' + HC.errExplain(cell.v);
        else if (cell && cell.f != null && /^HYPERLINK\(/.test(cell.f)) msg = 'Ctrl + clic para abrir el vínculo';
        this._tipKey = key;
        if (msg) { const b = g.canvas.getBoundingClientRect(), rc = g.cellRect(hit.r, hit.c); this.showTip(msg, b.left + (rc.x + rc.w) * g.zoom + 6, b.top + rc.y * g.zoom, !!(cell && cell.note)); } else this.hideTip(true);
      } else this.hideTip();
    },
    showTip(msg, x, y, note) {
      let t = document.getElementById('tip');
      if (!t) t = document.body.appendChild(h('div#tip', { role: 'tooltip' }));
      t.textContent = msg; t.className = note ? 'note' : '';
      t.style.display = 'block';
      const w = t.offsetWidth, hh = t.offsetHeight;
      t.style.left = Math.max(4, Math.min(x, window.innerWidth - w - 6)) + 'px'; t.style.top = Math.max(4, Math.min(y, window.innerHeight - hh - 6)) + 'px';
    },
    hideTip(keepKey) { const t = document.getElementById('tip'); if (t) t.style.display = 'none'; if (!keepKey) this._tipKey = null; },
    openLink(r, c) {
      const cell = this.sheet.get(r, c);
      const p = cell && cell.f != null ? HC.parseFormula(cell.f) : null;
      if (!p || p.err || p.ast.t !== 'fn' || !p.ast.a.length) return;
      let url = HC.fx.scalar(HC.evaluate(p.ast.a[0], { wb: this.wb, sheet: this.sheet, r, c, vars: null }));
      if (typeof url !== 'string' || !url) return;
      if (url[0] === '#') { this.goTo(url.slice(1)); return; }
      if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) url = 'https://' + url;
      if (!/^(https?|mailto|tel):/i.test(url)) return;
      if (window.AndroidSpreadsheet) window.AndroidSpreadsheet.openLink(url);
      else window.open(url, '_blank', 'noopener');
    },
    onContextMenu(e) {
      const g = this.grid, pt = this.pt(e), hit = g.hit(pt.x, pt.y);
      if (this.edit && !this.commitEdit()) return;
      const inSel = (r, c) => this.sel.ranges.some((x) => HC.inRange(x, r, c));
      if (hit.t === 'cell' || hit.t === 'filter' || hit.t === 'vlist' || hit.t === 'fill') { const r = hit.r != null ? hit.r : this.sel.r, c = hit.c != null ? hit.c : this.sel.c; if (!inSel(r, c)) this.select(r, c, { noScroll: true }); HC.chrome.cellMenu({ x: e.clientX, y: e.clientY }); }
      else if (hit.t === 'colhdr') { if (!this.sel.ranges.some((x) => x.r1 === 0 && x.r2 >= MAXR - 1 && hit.c >= x.c1 && hit.c <= x.c2)) this.setRange({ r1: 0, r2: MAXR - 1, c1: hit.c, c2: hit.c }, g.rowAt(g.hdrH + 1), hit.c); HC.chrome.headerMenu({ x: e.clientX, y: e.clientY }, true); }
      else if (hit.t === 'rowhdr') { if (!this.sel.ranges.some((x) => x.c1 === 0 && x.c2 >= MAXC - 1 && hit.r >= x.r1 && hit.r <= x.r2)) this.setRange({ c1: 0, c2: MAXC - 1, r1: hit.r, r2: hit.r }, hit.r, g.colAt(g.hdrW + 1)); HC.chrome.headerMenu({ x: e.clientX, y: e.clientY }, false); }
      else { this.selectAll(); HC.chrome.cellMenu({ x: e.clientX, y: e.clientY }); }
    },

    // ------------------------------------------------------------ teclado
    onGlobalKey(e) {
      if (ui.dialogOpen() || ui.popupOpen()) return;
      const ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
      const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && e.target !== this.grid.sink;
      if (ctrl && k === 's') { e.preventDefault(); this.run('saveXlsx'); }
      else if (ctrl && k === 'o') { e.preventDefault(); this.run('open'); }
      else if (ctrl && k === 'p') { e.preventDefault(); this.run('print'); }
      else if (ctrl && (k === 'f' || k === 'h') && !inField) { e.preventDefault(); this.run(k === 'f' ? 'find' : 'replace'); }
      else if (!inField && e.target === document.body && !ctrl && !e.altKey && e.key.length === 1) this.focusGrid();
    },
    onKeyDown(e) {
      if (this._composing || e.isComposing) return;
      if (ui.dialogOpen()) { e.preventDefault(); return; }
      if (this.edit) { this.onEditKey(e, this.edit.where); return; }
      const ctrl = e.ctrlKey || e.metaKey, shift = e.shiftKey, alt = e.altKey, key = e.key, g = this.grid, sh = this.sheet;
      let done = true;
      if (HC.charts && HC.charts.selected && (key === 'Delete' || key === 'Backspace')) { HC.charts.remove(HC.charts.selected); e.preventDefault(); return; }
      switch (key) {
        case 'ArrowUp': this.moveSel(-1, 0, { extend: shift, jump: ctrl }); break;
        case 'ArrowDown': if (alt) { const rule = sh.wb.validationAt(sh, this.sel.r, this.sel.c); if (rule && rule.type === 'list') HC.dlg.validationList({ r: this.sel.r, c: this.sel.c }); break; } this.moveSel(1, 0, { extend: shift, jump: ctrl }); break;
        case 'ArrowLeft': this.moveSel(0, -1, { extend: shift, jump: ctrl }); break;
        case 'ArrowRight': this.moveSel(0, 1, { extend: shift, jump: ctrl }); break;
        case 'Tab': this.advance(0, shift ? -1 : 1); break;
        case 'Enter': if (alt) { done = false; break; } this.advance(shift ? -1 : 1, 0); break;
        case 'Home': if (ctrl) this.select(sh.frozenRows, sh.frozenCols, { extend: shift }); else this.select((shift ? this._cursor || this.sel : this.sel).r, sh.frozenCols, { extend: shift }); if (!shift) g.scrollTo(ctrl ? 0 : 0, ctrl ? 0 : sh.view.scrollY); break;
        case 'End': if (ctrl) { const u = sh.usedRange(); this.select(Math.max(0, u.r2), Math.max(0, u.c2), { extend: shift }); } else this.moveSel(0, 1, { extend: shift, jump: true }); break;
        case 'PageDown': case 'PageUp': {
          const n = g.visibleRowCount() * (key === 'PageDown' ? 1 : -1);
          if (ctrl) { this.activateSheet(this.wb.active + (key === 'PageDown' ? 1 : -1)); break; }
          const from = shift ? this._cursor || this.sel : this.sel;
          if (alt) this.select(from.r, from.c + (key === 'PageDown' ? 8 : -8), { extend: shift });
          else { g.scrollBy(0, n * sh.rowH.def); this.select(from.r + n, from.c, { extend: shift }); }
          break;
        }
        case 'F2': this.startEdit(null, { mode: 'edit' }); break;
        case 'F9': this.wb.recalcAll(); break;
        case 'Delete': this.run('clearContents'); break;
        case 'Backspace': this.startEdit('', { mode: 'enter' }); break;
        case 'Escape': if (HC.charts && HC.charts.selected) HC.charts.select(null); else if (this.clip) { this.clip.show = false; if (this.clip.data.cut) this.clip = null; g.invalidate(); } else done = false; break;
        case ' ': if (ctrl) this.setRange({ r1: 0, r2: MAXR - 1, c1: this.range.c1, c2: this.range.c2 }, this.sel.r, this.sel.c); else if (shift) this.setRange({ c1: 0, c2: MAXC - 1, r1: this.range.r1, r2: this.range.r2 }, this.sel.r, this.sel.c); else done = false; break;
        default: done = false;
      }
      if (!done && ctrl && !alt) {
        done = true;
        switch (key.toLowerCase()) {
          case 'z': this.run(shift ? 'redo' : 'undo'); break;
          case 'y': this.run('redo'); break;
          case 'a': this.selectAll(); break;
          case 'b': case 'n': this.run('bold'); break;
          case 'i': case 'k': this.run(key.toLowerCase() === 'k' && !shift ? 'italic' : 'italic'); break;
          case 'u': this.run('underline'); break;
          case 'd': this.run('fillDown'); break;
          case 'r': this.run('fillRight'); break;
          case '1': this.run('formatCells'); break;
          case '5': this.run('strike'); break;
          case ';': case ',': this.startEdit(HC.fmt.format(HC.date.today(), 'dd/mm/yyyy').text, { mode: 'enter' }); break;
          case ':': case '.': this.startEdit(HC.fmt.format(HC.date.now() % 1, 'hh:mm').text, { mode: 'enter' }); break;
          case '`': case 'º': this.run('toggleFormulas'); break;
          case '+': this.run('insertCells'); break;
          case '-': this.run('deleteCells'); break;
          case 'l': if (shift) this.run('toggleFilter'); else done = false; break;
          case 'enter': this.run('fillDown'); break;
          default: done = false;
        }
      }
      if (!done && alt && (key === '=' || key === '0' && shift)) { this.run('autoSum', 'SUM'); done = true; }
      if (done) { e.preventDefault(); this.hideTip(); }
    },

    // ------------------------------------------------------------ portapapeles
    isGridFocus(e) { const t = e.target; return !this.edit && !ui.dialogOpen() && (t === this.grid.sink || t === document.body || this.grid.host.contains(t)) && !(t.tagName === 'INPUT' || (t.tagName === 'TEXTAREA' && t !== this.grid.sink)); },
    copySelection(cut) {
      if (this.sel.ranges.length > 1) { ui.toast('Copiar no funciona con varias selecciones a la vez.'); return null; }
      const sh = this.sheet, g = this.range;
      const data = this.wb.copyData(sh, g);
      if (data.h * data.w > 2e6) { ui.toast('La selección es demasiado grande para copiarla.'); return null; }
      data.cut = !!cut;
      const matrix = this.wb.rangeToMatrix(sh, g);
      const text = HC.csv.stringify(matrix, '\t').replace(/\r\n/g, '\n');
      this.clip = { data, text, show: true };
      this.grid.invalidate();
      return { text, html: this.rangeHtml(data, matrix) };
    },
    rangeHtml(data, matrix) {
      const esc = ui.esc;
      let out = '<table style="border-collapse:collapse">';
      for (let i = 0; i < data.h; i++) {
        out += '<tr>';
        for (let j = 0; j < data.w; j++) {
          const x = data.cells[i][j], st = (x && x.s) || {};
          const css = [];
          if (st.b) css.push('font-weight:bold'); if (st.i) css.push('font-style:italic'); if (st.u) css.push('text-decoration:underline');
          if (st.fc) css.push('color:' + st.fc); if (st.bg) css.push('background:' + st.bg);
          const al = st.ha || (x && typeof x.v === 'number' ? 'r' : null);
          if (al) css.push('text-align:' + (al === 'r' ? 'right' : al === 'c' ? 'center' : 'left'));
          for (const [k, side] of [['bt', 'top'], ['bb', 'bottom'], ['bl', 'left'], ['br', 'right']]) if (st[k]) css.push('border-' + side + ':1px solid ' + (st[k].split(' ')[1] || '#000'));
          out += '<td' + (css.length ? ' style="' + esc(css.join(';')) + '"' : '') + '>' + esc(matrix[i][j]).replace(/\n/g, '<br>') + '</td>';
        }
        out += '</tr>';
      }
      return out + '</table>';
    },
    onClipboard(e) {
      if (!this.isGridFocus(e)) return;
      const c = this.copySelection(e.type === 'cut');
      if (!c) return;
      e.preventDefault();
      e.clipboardData.setData('text/plain', c.text);
      e.clipboardData.setData('text/html', c.html);
    },
    onPasteEvent(e) {
      if (!this.isGridFocus(e)) return;
      e.preventDefault();
      const cd = e.clipboardData;
      this.pasteFrom(cd.getData('text/plain'), cd.getData('text/html'), {});
    },
    pasteFrom(text, html, opts) {
      const sh = this.sheet, g = this.range, norm = (s) => String(s || '').replace(/\r\n?/g, '\n').replace(/\n$/, '');
      let res = null;
      if (this.clip && (opts.internal || norm(text) === norm(this.clip.text) || (!text && !html))) {
        if (!this.wb.sheets.includes(this.clip.data.sheet)) this.clip.data.cut = false;
        const wasCut = this.clip.data.cut;
        res = this.wb.pasteData(sh, g.r1, g.c1, this.clip.data, { mode: opts.mode, transpose: opts.transpose, target: g });
        if (wasCut) this.clip = null;
        else if (res && window.AndroidSpreadsheet) this.clip.show = false;
      } else {
        let matrix = null;
        if (text) matrix = HC.csv.parse(norm(text), '\t');
        else if (html && /<table/i.test(html)) {
          const doc = new DOMParser().parseFromString(html, 'text/html'), table = doc.querySelector('table');
          if (table) matrix = Array.from(table.rows).map((tr) => Array.from(tr.cells).map((td) => td.textContent.replace(/ /g, ' ').trim()));
        }
        if (!matrix || !matrix.length) return;
        res = this.wb.pasteMatrix(sh, g.r1, g.c1, matrix, g);
      }
      if (!res) { ui.toast('No se puede pegar aquí: el contenido no cabe en la hoja.'); return; }
      this.setRange(res, res.r1, res.c1);
      this.grid.ensureVisible(res.r1, res.c1);
    },
    async pasteMenu(opts) {
      opts = opts || {};
      if (opts.mode || opts.transpose) { if (!this.clip) { ui.toast('Primero copia las celdas que quieres pegar.'); return; } this.pasteFrom('', '', Object.assign({ internal: true }, opts)); return; }
      let text = null;
      try {
        text = window.AndroidSpreadsheet ? window.AndroidSpreadsheet.pasteText() : await navigator.clipboard.readText();
      } catch (e) { text = null; }
      if (text != null && text !== '') this.pasteFrom(text, '', {});
      else if (this.clip) this.pasteFrom('', '', { internal: true });
      else ui.toast('El navegador no permite leer el portapapeles desde el menú. Usa Ctrl + V.');
    },
    async copyMenu(cut) {
      const c = this.copySelection(cut);
      if (!c) return;
      try {
        if (window.AndroidSpreadsheet) window.AndroidSpreadsheet.copyText(c.text);
        else await navigator.clipboard.writeText(c.text);
      } catch (e) { /* queda disponible para pegar dentro de la app */ }
    },

    // ------------------------------------------------------------ comandos
    run(name, arg) {
      const fn = this.cmd[name];
      if (!fn) { console.warn('Comando desconocido: ' + name); return; }
      if (this.edit && !this.noCommit[name] && !this.commitEdit()) return;
      try { fn.call(this, arg); } catch (e) { console.error(e); ui.toast('No se pudo completar la acción: ' + e.message); }
      // vuelve a la cuadrícula salvo que la orden haya abierto algo que necesita el foco (diálogo, menú, panel)
      const ae = document.activeElement;
      if (!ui.dialogOpen() && !ui.popupOpen() && (!ae || ae === document.body || this.grid.host.contains(ae) || ae.closest('#toolbar, #menubar, #bottombar'))) this.focusGrid();
    },
    noCommit: {},
    styleAt() { return this.sheet.styleAt(this.sel.r, this.sel.c) || {}; },
    fmt(patch) { this.wb.formatRange(this.sheet, this.sel.ranges, patch); },
    toggle(key) { this.fmt({ [key]: this.styleAt()[key] ? null : true }); },
    // filas o columnas completas afectadas por la selección
    span(isCol) { const g = this.range; return isCol ? { at: g.c1, n: Math.min(g.c2, MAXC - 1) - g.c1 + 1 } : { at: g.r1, n: Math.min(g.r2, MAXR - 1) - g.r1 + 1 }; },
    cmd: {
      undo() { const tx = this.wb.undo(); if (tx) { this.restoreSel(tx.sel); this.refreshAll(); } },
      redo() { const tx = this.wb.redo(); if (tx) { this.restoreSel(tx.selAfter || tx.sel); this.refreshAll(); } },
      copy() { this.copyMenu(false); },
      cut() { this.copyMenu(true); },
      paste() { this.pasteMenu(); },
      pasteValues() { this.pasteMenu({ mode: 'values' }); },
      pasteFormulas() { this.pasteMenu({ mode: 'formulas' }); },
      pasteFormats() { this.pasteMenu({ mode: 'formats' }); },
      pasteTranspose() { this.pasteMenu({ mode: 'all', transpose: true }); },
      clearContents() { this.wb.clearRange(this.sheet, this.sel.ranges, 'contents'); },
      clearFormats() { this.wb.clearRange(this.sheet, this.sel.ranges, 'formats'); },
      clearAll() { this.wb.clearRange(this.sheet, this.sel.ranges, 'all'); },
      selectAll() { this.selectAll(); },
      bold() { this.toggle('b'); }, italic() { this.toggle('i'); }, underline() { this.toggle('u'); }, strike() { this.toggle('st'); },
      wrap() { this.toggle('wrap'); this.fitRows(); },
      font(v) { this.fmt({ ff: v || null }); }, fontSize(v) { this.fmt({ fs: v && +v !== 11 ? +v : null }); this.fitRows(); },
      fontColor(v) { this.lastFontColor = v; this.fmt({ fc: v || null }); }, fillColor(v) { this.lastFillColor = v; this.fmt({ bg: v || null }); },
      align(v) { this.fmt({ ha: this.styleAt().ha === v ? null : v }); }, valign(v) { this.fmt({ va: v === 'b' ? null : v }); },
      numFmt(code) { this.fmt({ nf: !code || /^general$/i.test(code) ? null : code }); },
      decimals(d) { const st = this.styleAt(); this.fmt({ nf: HC.fmt.changeDecimals(st.nf, d, this.sheet.value(this.sel.r, this.sel.c)) }); },
      borders(arg) { this.wb.begin('Bordes'); for (const g of this.sel.ranges) this.wb.setBorders(this.sheet, g, arg.mode, arg.mode === 'none' ? null : (arg.style || 'thin') + ' ' + (arg.color || '#000000')); this.wb.commit(); },
      merge() {
        const g = this.range, sh = this.sheet;
        if (sh.merges.some((m) => HC.sameRange(m, g))) { this.wb.unmergeRange(sh, g); return; }
        if (g.r1 === g.r2 && g.c1 === g.c2) return;
        const u = HC.clipBig(sh, g);
        this.wb.begin('Combinar celdas');
        this.wb.mergeRange(sh, u); this.wb.formatRange(sh, [{ r1: u.r1, c1: u.c1, r2: u.r1, c2: u.c1 }], { ha: 'c' });
        this.wb.commit();
        this.setRange(u, u.r1, u.c1);
      },
      unmerge() { this.wb.unmergeRange(this.sheet, this.range); },
      insertRowsAbove() { const s = this.span(false); this.wb.insertRows(this.sheet, s.at, s.n); },
      insertRowsBelow() { const s = this.span(false); this.wb.insertRows(this.sheet, s.at + s.n, s.n); this.setRange({ r1: s.at + s.n, r2: s.at + 2 * s.n - 1, c1: this.range.c1, c2: this.range.c2 }); },
      insertColsLeft() { const s = this.span(true); this.wb.insertCols(this.sheet, s.at, s.n); },
      insertColsRight() { const s = this.span(true); this.wb.insertCols(this.sheet, s.at + s.n, s.n); this.setRange({ c1: s.at + s.n, c2: s.at + 2 * s.n - 1, r1: this.range.r1, r2: this.range.r2 }); },
      deleteRows() { const s = this.span(false); if (s.n >= MAXR) return; this.wb.deleteRows(this.sheet, s.at, s.n); this.select(Math.min(s.at, MAXR - 1), this.sel.c); },
      deleteCols() { const s = this.span(true); if (s.n >= MAXC) return; this.wb.deleteCols(this.sheet, s.at, s.n); this.select(this.sel.r, Math.min(s.at, MAXC - 1)); },
      insertCells() { const g = this.range; if (g.r1 === 0 && g.r2 >= MAXR - 1) this.run('insertColsLeft'); else this.run('insertRowsAbove'); },
      deleteCells() { const g = this.range; if (g.r1 === 0 && g.r2 >= MAXR - 1) this.run('deleteCols'); else this.run('deleteRows'); },
      hideRows() { const s = this.span(false); this.wb.setHidden(this.sheet, 'row', s.at, s.at + s.n - 1, true); },
      showRows() { const s = this.span(false); this.wb.setHidden(this.sheet, 'row', Math.max(0, s.at - 1), Math.min(MAXR - 1, s.at + s.n), false); },
      hideCols() { const s = this.span(true); this.wb.setHidden(this.sheet, 'col', s.at, s.at + s.n - 1, true); },
      showCols() { const s = this.span(true); this.wb.setHidden(this.sheet, 'col', Math.max(0, s.at - 1), Math.min(MAXC - 1, s.at + s.n), false); },
      showAllHidden() {
        const sh = this.sheet; this.wb.begin('Mostrar todo');
        for (const i of Array.from(sh.rowH.hidden)) this.wb.setHidden(sh, 'row', i, i, false);
        for (const i of Array.from(sh.colW.hidden)) this.wb.setHidden(sh, 'col', i, i, false);
        this.wb.commit();
      },
      autoFitCols(col) {
        const sh = this.sheet, g = this.range, list = col != null && !(g.r1 === 0 && g.r2 >= MAXR - 1 && col >= g.c1 && col <= g.c2) ? [col] : [];
        if (!list.length) for (let c = g.c1; c <= Math.min(g.c2, sh.maxC); c++) list.push(c);
        this.wb.begin('Ajustar ancho');
        for (const c of list) { const w = this.grid.neededColWidth(c); if (w) this.wb.setSize(sh, 'col', c, HC.clamp(w, 24, 600)); }
        this.wb.commit();
      },
      autoFitRows(row) {
        const sh = this.sheet, g = this.range, list = row != null && !(g.c1 === 0 && g.c2 >= MAXC - 1 && row >= g.r1 && row <= g.r2) ? [row] : [];
        if (!list.length) for (let r = g.r1; r <= Math.min(g.r2, sh.maxR); r++) list.push(r);
        this.wb.begin('Ajustar alto');
        for (const r of list) { const hh = this.grid.neededRowHeight(r); this.wb.setSize(sh, 'row', r, hh > sh.rowH.def ? Math.min(hh, 400) : null); }
        this.wb.commit();
      },
      fillDown() { const g = this.range; if (g.r2 > g.r1) this.wb.fillRange(this.sheet, { r1: g.r1, c1: g.c1, r2: g.r1, c2: g.c2 }, HC.clipRange(g)); else if (g.r1 > 0) { const src = this.wb.copyData(this.sheet, { r1: g.r1 - 1, c1: g.c1, r2: g.r1 - 1, c2: g.c2 }); this.wb.pasteData(this.sheet, g.r1, g.c1, src); } },
      fillRight() { const g = this.range; if (g.c2 > g.c1) this.wb.fillRange(this.sheet, { r1: g.r1, c1: g.c1, r2: g.r2, c2: g.c1 }, HC.clipRange(g)); else if (g.c1 > 0) { const src = this.wb.copyData(this.sheet, { r1: g.r1, c1: g.c1 - 1, r2: g.r2, c2: g.c1 - 1 }); this.wb.pasteData(this.sheet, g.r1, g.c1, src); } },
      toggleGrid() { this.wb.setProp(this.sheet, 'showGrid', !this.sheet.showGrid); },
      toggleFormulas() { this.showFormulas = !this.showFormulas; this.grid.invalidate(); HC.chrome.updateAll(); },
      freeze(mode) {
        const sh = this.sheet, s = this.sel;
        this.wb.begin('Inmovilizar paneles');
        const fr = mode === 'row1' ? 1 : mode === 'sel' ? s.r : mode === 'none' || mode === 'col1' ? 0 : sh.frozenRows;
        const fc = mode === 'col1' ? 1 : mode === 'sel' ? s.c : mode === 'none' || mode === 'row1' ? 0 : sh.frozenCols;
        this.wb.setProp(sh, 'frozenRows', Math.min(fr, 200)); this.wb.setProp(sh, 'frozenCols', Math.min(fc, 50));
        this.wb.commit();
        sh.view.scrollX = 0; sh.view.scrollY = 0;
      },
      zoom(z) { this.setZoom(z); },
      darkMode() { this.settings.dark = !this.settings.dark; this.applySettings(true); },
      sortAsc() { this.quickSort(false); }, sortDesc() { this.quickSort(true); },
      toggleFilter() {
        const sh = this.sheet;
        if (sh.filter) { this.wb.setFilter(sh, null); ui.toast('Filtro desactivado.'); return; }
        const selection = this.range;
        const inferred = selection.r1 === selection.r2 && selection.c1 === selection.c2;
        const g = inferred ? this.dataRegion() : HC.clipBig(sh, selection);
        if (!g || g.r1 >= Math.min(g.r2, sh.maxR)) { ui.toast('Selecciona un rango con encabezados y al menos una fila de datos.'); return; }
        this.wb.setFilter(sh, { range: g, cols: {}, autoExpand: inferred });
        this.grid.ensureVisible(g.r1, HC.clamp(this.sel.c, g.c1, g.c2));
        ui.toast('Toca o haz clic en la flecha de un encabezado para filtrar.');
      },
      autoSum(fn) {
        const sh = this.sheet, s = this.sel, g = this.range, name = HC.fnToLocal(fn || 'SUM');
        const num = (r, c) => typeof sh.value(r, c) === 'number';
        if (g.r1 !== g.r2 || g.c1 !== g.c2) {
          // rango seleccionado: total debajo de cada columna
          const u = HC.clipUsed(sh, g);
          this.wb.begin('Autosuma');
          for (let c = u.c1; c <= u.c2; c++) this.wb.setCellFormula(sh, u.r2 + 1, c, fn + '(' + HC.rangeAddr({ r1: u.r1, c1: c, r2: u.r2, c2: c }) + ')');
          this.wb.commit();
          return;
        }
        let ref = null;
        if (s.r > 0 && num(s.r - 1, s.c)) { let r = s.r - 1; while (r > 0 && num(r - 1, s.c)) r--; ref = { r1: r, c1: s.c, r2: s.r - 1, c2: s.c }; }
        else if (s.c > 0 && num(s.r, s.c - 1)) { let c = s.c - 1; while (c > 0 && num(s.r, c - 1)) c--; ref = { r1: s.r, c1: c, r2: s.r, c2: s.c - 1 }; }
        const text = '=' + name + '(' + (ref ? HC.rangeAddr(ref) : '') + ')';
        this.startEdit(text, { mode: 'edit', caret: ref ? text.length : text.length - 1 });
      },
      insertFunction() { HC.dlg.functions(); },
      insertNote() { HC.dlg.note(); },
      insertLink() { HC.dlg.link(); },
      insertChart(type) { HC.charts.insert(type); },
      insertSheet() { const sh = this.wb.addSheet(null, this.wb.active + 1); this.activateSheet(this.wb.sheets.indexOf(sh)); },
      today() { this.startEdit(HC.fmt.format(HC.date.today(), 'dd/mm/yyyy').text, { mode: 'enter' }); this.commitEdit(); },
      formatCells(tab) { HC.dlg.formatCells(tab); },
      condFormat() { HC.dlg.condFormat(); },
      validation() { HC.dlg.validation(); },
      names() { HC.dlg.names(); },
      find() { HC.dlg.find(false); }, replace() { HC.dlg.find(true); },
      sortDialog() { HC.dlg.sort(); },
      removeDuplicates() { HC.dlg.removeDuplicates(); },
      pivot() { HC.dlg.pivot(); },
      textToColumns() { HC.dlg.textToColumns(); },
      goalSeek() { HC.dlg.goalSeek(); },
      settings() { HC.dlg.settings(); },
      shortcuts() { HC.dlg.shortcuts(); },
      touchHelp() { HC.dlg.touchHelp(); },
      about() { HC.dlg.about(); },
      rowHeight() { HC.dlg.size(false); }, colWidth() { HC.dlg.size(true); },
      newBook() { HC.files.newBook(); }, open() { HC.files.open(); }, saveXlsx() { HC.files.saveXlsx(); }, saveJson() { HC.files.saveJson(); },
      exportCsv() { HC.files.exportCsv(); }, savePdf() { HC.files.savePdf(); }, print() { HC.files.print(); }, example() { HC.files.example(); },
    },
    fitRows() {
      const sh = this.sheet;
      for (const g of this.sel.ranges) {
        const u = HC.clipUsed(sh, g);
        if (u.r2 - u.r1 > 2000) continue;
        for (let r = u.r1; r <= u.r2; r++) { const need = this.grid.neededRowHeight(r), cur = sh.rowH.raw(r); if (need > cur || (sh.rowH.sizes.has(r) && need < cur && need >= sh.rowH.def)) this.wb.setSize(sh, 'row', r, need > sh.rowH.def ? Math.min(need, 400) : null); }
      }
    },
    // bloque de datos contiguo alrededor de la selección (o la propia selección si abarca varias celdas)
    dataRegion() {
      const sh = this.sheet, g = this.range;
      if (g.r1 !== g.r2 || g.c1 !== g.c2) return HC.clipUsed(sh, g);
      const has = (r, c) => r >= 0 && c >= 0 && sh.value(r, c) != null;
      let { r1, c1, r2, c2 } = g;
      if (!has(r1, c1)) return null;
      for (let grew = true; grew;) {
        grew = false;
        const rowHas = (r) => { for (let c = c1; c <= c2; c++) if (has(r, c)) return true; return false; };
        const colHas = (c) => { for (let r = r1; r <= r2; r++) if (has(r, c)) return true; return false; };
        if (r1 > 0 && rowHas(r1 - 1)) { r1--; grew = true; }
        if (r2 < MAXR - 1 && rowHas(r2 + 1)) { r2++; grew = true; }
        if (c1 > 0 && colHas(c1 - 1)) { c1--; grew = true; }
        if (c2 < MAXC - 1 && colHas(c2 + 1)) { c2++; grew = true; }
      }
      return { r1, c1, r2, c2 };
    },
    quickSort(desc) {
      const sh = this.sheet, g = this.dataRegion();
      if (!g || g.r1 === g.r2) { ui.toast('No hay datos que ordenar.'); return; }
      const col = HC.clamp(this.sel.c, g.c1, g.c2);
      // la primera fila se trata como encabezado si es texto y debajo hay números o es el filtro
      const top = sh.value(g.r1, col), below = sh.value(g.r1 + 1, col);
      const header = (sh.filter && sh.filter.range.r1 === g.r1) || (typeof top === 'string' && typeof below !== 'string') || this.headerLooks(g);
      if (!this.wb.sortRange(sh, g, [{ col, desc }], header)) ui.toast('No se puede ordenar un rango con celdas combinadas.');
    },
    headerLooks(g) {
      const sh = this.sheet;
      let textTop = 0, numBelow = 0;
      for (let c = g.c1; c <= g.c2; c++) { if (typeof sh.value(g.r1, c) === 'string') textTop++; if (typeof sh.value(g.r1 + 1, c) === 'number') numBelow++; }
      return textTop === g.c2 - g.c1 + 1 && numBelow > 0;
    },
  });
  HC.clipRange = (g) => HC.clipBig(app.sheet, g);
  for (const k of ['toggleFormulas', 'zoom', 'darkMode', 'settings', 'shortcuts']) app.noCommit[k] = true;
  window.addEventListener('DOMContentLoaded', () => app.init());
})();
