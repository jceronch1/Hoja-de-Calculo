/* Cuadrícula dibujada en canvas: celdas, encabezados, selección, paneles inmovilizados y barras de desplazamiento. */
(function () {
  'use strict';
  const HC = window.HC, ui = HC.ui, h = ui.h;
  const MAXR = HC.MAX_ROWS, MAXC = HC.MAX_COLS, K = 16384;
  const PAD = 3, SB = 14;
  const EMPTY = Object.freeze({});
  HC.FONT_STACK = 'Calibri, Carlito, "Segoe UI", Arial, sans-serif';
  HC.FONTS = ['Arial', 'Calibri', 'Cambria', 'Comic Sans MS', 'Consolas', 'Courier New', 'Georgia', 'Segoe UI', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana'];
  HC.REF_COLORS = ['#1a73e8', '#d93025', '#9334e6', '#188038', '#e37400', '#12a4af', '#c2185b'];
  const family = (ff) => (ff ? '"' + ff + '", ' + HC.FONT_STACK : HC.FONT_STACK);
  const BW = { thin: 1, medium: 2, thick: 3, dashed: 1, dotted: 1, double: 3 };

  class Grid {
    constructor(app, host) {
      this.app = app; this.host = host;
      this.canvas = h('canvas.grid-canvas');
      this.ctx = this.canvas.getContext('2d');
      this.layer = h('div.grid-layer');
      this.vthumb = h('div.sb-thumb'); this.hthumb = h('div.sb-thumb');
      this.vbar = h('div.sb.sb-v', this.vthumb); this.hbar = h('div.sb.sb-h', this.hthumb);
      this.sink = h('textarea.focus-sink', { 'aria-label': 'Hoja de cálculo. Usa las flechas para moverte entre celdas.', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, tabindex: '0' });
      host.append(this.canvas, this.layer, this.vbar, this.hbar, h('div.sb-corner'), this.sink);
      this.hdrW = 46; this.hdrH = 22; this.zoom = 1; this.dpr = 1;
      this.vw = 100; this.vh = 100;
      this.widths = new Map(); this.wraps = new Map();
      this.hits = []; this.geo = null; this._raf = 0; this._font = '';
      this.loadTheme();
      this._bindScrollbars();
      if (window.ResizeObserver) new ResizeObserver(() => this.resize()).observe(host);
      window.addEventListener('resize', () => this.resize());
    }
    get sheet() { return this.app.sheet; }
    loadTheme() {
      const cs = getComputedStyle(document.documentElement), v = (n) => cs.getPropertyValue(n).trim();
      this.theme = {
        cellBg: v('--cell-bg') || '#fff', grid: v('--grid-line') || '#e1e1e1', text: v('--cell-text') || '#000',
        hdrBg: v('--hdr-bg'), hdrText: v('--hdr-text'), hdrSel: v('--hdr-sel'), hdrFull: v('--accent'), hdrFullText: '#fff', hdrLine: v('--hdr-line'),
        accent: v('--accent'), selFill: v('--sel-fill'), link: v('--link') || '#0b57d0', frozen: v('--frozen-line') || '#9aa0a6', muted: v('--text-3'),
      };
      this.uiFont = '12px ' + (getComputedStyle(document.body).fontFamily || 'sans-serif');
      this.invalidate();
    }
    resize() {
      const cw = Math.max(60, this.host.clientWidth - SB), ch = Math.max(60, this.host.clientHeight - SB);
      this.dpr = window.devicePixelRatio || 1;
      this.canvas.style.width = cw + 'px'; this.canvas.style.height = ch + 'px';
      this.canvas.width = Math.round(cw * this.dpr); this.canvas.height = Math.round(ch * this.dpr);
      this.vw = cw / this.zoom; this.vh = ch / this.zoom;
      this.layoutLayer();
      this.render();
    }
    setZoom(z) {
      this.zoom = HC.clamp(Math.round(z * 100) / 100, 0.25, 4);
      this.widths.clear(); this.wraps.clear();
      this.resize();
    }
    layoutLayer() {
      const z = this.zoom;
      Object.assign(this.layer.style, { left: this.hdrW * z + 'px', top: this.hdrH * z + 'px', width: Math.max(0, (this.vw - this.hdrW) * z) + 'px', height: Math.max(0, (this.vh - this.hdrH) * z) + 'px' });
    }
    invalidate() { if (!this._raf) this._raf = requestAnimationFrame(() => this.render()); }

    // ------------------------------------------------------------ geometría
    paneX(p, c) { return this.hdrW + this.sheet.colW.pos(c) - (p.fcol ? 0 : this.sheet.view.scrollX); }
    paneY(p, r) { return this.hdrH + this.sheet.rowH.pos(r) - (p.frow ? 0 : this.sheet.view.scrollY); }
    colX(c) { const sh = this.sheet; return this.hdrW + sh.colW.pos(c) - (c < sh.frozenCols ? 0 : sh.view.scrollX); }
    rowY(r) { const sh = this.sheet; return this.hdrH + sh.rowH.pos(r) - (r < sh.frozenRows ? 0 : sh.view.scrollY); }
    // rectángulo lógico de una celda (toda la combinación si está combinada)
    cellRect(r, c) {
      const sh = this.sheet, m = sh.mergeAt(r, c);
      if (m) return { x: this.colX(m.c1), y: this.rowY(m.r1), w: sh.colW.pos(m.c2 + 1) - sh.colW.pos(m.c1), h: sh.rowH.pos(m.r2 + 1) - sh.rowH.pos(m.r1) };
      return { x: this.colX(c), y: this.rowY(r), w: sh.colW.size(c), h: sh.rowH.size(r) };
    }
    colAt(lx) { const sh = this.sheet, fx = sh.colW.pos(sh.frozenCols), x = lx - this.hdrW; return HC.clamp(sh.colW.indexAt(x < fx ? x : x + sh.view.scrollX), 0, MAXC - 1); }
    rowAt(ly) { const sh = this.sheet, fy = sh.rowH.pos(sh.frozenRows), y = ly - this.hdrH; return HC.clamp(sh.rowH.indexAt(y < fy ? y : y + sh.view.scrollY), 0, MAXR - 1); }
    // Qué hay bajo un punto (coordenadas CSS relativas al lienzo).
    hit(px, py) {
      if (this._raf) this.render(); // las zonas activas (controlador de relleno, filtros) dependen del último dibujo
      const lx = px / this.zoom, ly = py / this.zoom, sh = this.sheet;
      if (lx < this.hdrW && ly < this.hdrH) return { t: 'corner' };
      if (ly < this.hdrH) {
        const c = this.colAt(lx), x1 = this.colX(c), x2 = x1 + sh.colW.size(c);
        let resize = null;
        if (x2 - lx <= 4) resize = c; else if (lx - x1 <= 4 && c > 0) { resize = c - 1; while (resize > 0 && sh.colW.size(resize) === 0 && sh.colW.hidden.has(resize)) resize--; }
        return { t: 'colhdr', c, resize };
      }
      if (lx < this.hdrW) {
        const r = this.rowAt(ly), y1 = this.rowY(r), y2 = y1 + sh.rowH.size(r);
        let resize = null;
        if (y2 - ly <= 3) resize = r; else if (ly - y1 <= 3 && r > 0) resize = r - 1;
        return { t: 'rowhdr', r, resize };
      }
      for (let i = this.hits.length - 1; i >= 0; i--) { const q = this.hits[i]; if (lx >= q.x && lx <= q.x + q.w && ly >= q.y && ly <= q.y + q.h) return q; }
      let r = this.rowAt(ly), c = this.colAt(lx);
      const m = sh.mergeAt(r, c);
      if (m) { r = m.r1; c = m.c1; }
      return { t: 'cell', r, c };
    }
    viewSize() { const sh = this.sheet; return { w: this.vw - this.hdrW - sh.colW.pos(sh.frozenCols), h: this.vh - this.hdrH - sh.rowH.pos(sh.frozenRows) }; }
    scrollTo(sx, sy) {
      const sh = this.sheet, v = sh.view, vs = this.viewSize();
      const maxX = Math.max(0, sh.colW.pos(MAXC) - sh.colW.pos(sh.frozenCols) - vs.w), maxY = Math.max(0, sh.rowH.pos(MAXR) - sh.rowH.pos(sh.frozenRows) - vs.h);
      sx = HC.clamp(sx, 0, maxX); sy = HC.clamp(sy, 0, maxY);
      if (sx === v.scrollX && sy === v.scrollY) return false;
      v.scrollX = sx; v.scrollY = sy;
      this.invalidate();
      return true;
    }
    scrollBy(dx, dy) { const v = this.sheet.view; return this.scrollTo(v.scrollX + dx, v.scrollY + dy); }
    ensureVisible(r, c) {
      const sh = this.sheet, v = sh.view, vs = this.viewSize();
      let sx = v.scrollX, sy = v.scrollY;
      if (c >= sh.frozenCols) {
        const x = sh.colW.pos(c) - sh.colW.pos(sh.frozenCols), w = Math.min(sh.colW.size(c), vs.w);
        if (x < sx) sx = x; else if (x + w > sx + vs.w) sx = x + w - vs.w;
      }
      if (r >= sh.frozenRows) {
        const y = sh.rowH.pos(r) - sh.rowH.pos(sh.frozenRows), hh = Math.min(sh.rowH.size(r), vs.h);
        if (y < sy) sy = y; else if (y + hh > sy + vs.h) sy = y + hh - vs.h;
      }
      this.scrollTo(sx, sy);
    }
    visibleRowCount() { return Math.max(1, Math.floor(this.viewSize().h / this.sheet.rowH.def) - 1); }

    // ------------------------------------------------------------ medidas de texto
    setFont(f) { if (this._font !== f) { this.ctx.font = f; this._font = f; } }
    textWidth(font, text) {
      const key = font + '\u0001' + text;
      let w = this.widths.get(key);
      if (w === undefined) {
        this.setFont(font);
        w = this.ctx.measureText(text).width;
        if (this.widths.size > 20000) this.widths.clear();
        this.widths.set(key, w);
      }
      return w;
    }
    fontOf(st, cf) {
      st = st || EMPTY;
      const b = cf && cf.b != null ? cf.b : st.b, i = cf && cf.i != null ? cf.i : st.i;
      const px = ((st.fs || 11) * 4) / 3;
      return (i ? 'italic ' : '') + (b ? '700 ' : '') + px.toFixed(2) + 'px ' + family(st.ff);
    }
    wrapLines(font, text, maxW) {
      const key = font + '\u0001' + maxW + '\u0001' + text;
      let lines = this.wraps.get(key);
      if (lines) return lines;
      lines = [];
      for (const para of text.split('\n')) {
        const words = para.split(/(\s+)/);
        let cur = '';
        for (const wd of words) {
          if (wd === '') continue;
          if (this.textWidth(font, cur + wd) <= maxW || cur === '') {
            if (cur === '' && this.textWidth(font, wd) > maxW) {
              let part = '';
              for (const ch of wd) { if (part !== '' && this.textWidth(font, part + ch) > maxW) { lines.push(part); part = ch; } else part += ch; }
              cur = part;
            } else cur += wd;
          } else { lines.push(cur.replace(/\s+$/, '')); cur = /^\s+$/.test(wd) ? '' : wd; }
        }
        lines.push(cur.replace(/\s+$/, ''));
      }
      if (this.wraps.size > 5000) this.wraps.clear();
      this.wraps.set(key, lines);
      return lines;
    }
    // Texto que se muestra en una celda y cómo se alinea.
    display(cell, st) {
      if (this.app.showFormulas && cell.f != null) return { text: '=' + HC.localizeFormula(cell.f), align: 'l', str: true };
      const v = cell.v;
      if (v == null || v === '') return null;
      const f = HC.fmt.format(v, st && st.nf);
      const num = typeof v === 'number';
      return {
        text: f.text, color: f.color, num, str: typeof v === 'string',
        align: (st && st.ha) || (num ? 'r' : typeof v === 'string' ? 'l' : 'c'),
        general: num && (!st || !st.nf || /^general$/i.test(st.nf)),
        link: cell.f != null && /^HYPERLINK\(/.test(cell.f),
      };
    }
    // Alto necesario para mostrar una fila con el texto ajustado.
    neededRowHeight(r) {
      const sh = this.sheet, row = sh.rows[r];
      let need = 0;
      if (row) row.forEach((cell, c) => {
        if (!cell || cell.v == null) return;
        const st = sh.styleAt(r, c) || EMPTY, px = ((st.fs || 11) * 4) / 3;
        let lines = 1;
        if (st.wrap && typeof cell.v === 'string') {
          const m = sh.mergeAt(r, c);
          if (m && m.r1 !== m.r2) return;
          const w = (m ? sh.colW.pos(m.c2 + 1) - sh.colW.pos(m.c1) : sh.colW.size(c)) - 2 * PAD - 1;
          lines = this.wrapLines(this.fontOf(st), cell.v, Math.max(8, w)).length;
        }
        need = Math.max(need, Math.ceil(lines * Math.round(px * 1.22) + 5));
      });
      return need;
    }
    neededColWidth(c) {
      const sh = this.sheet;
      let need = 0;
      sh.rows.forEach((row, r) => {
        const cell = row && row[c];
        if (!cell || cell.v == null || sh.mergeAt(r, c)) return;
        const st = sh.styleAt(r, c), d = this.display(cell, st);
        if (!d) return;
        const font = this.fontOf(st);
        for (const line of d.text.split('\n')) need = Math.max(need, this.textWidth(font, line));
      });
      return need ? Math.ceil(need + 2 * PAD + 6) : 0;
    }

    // ------------------------------------------------------------ dibujo
    computePanes() {
      const sh = this.sheet, v = sh.view, fr = sh.frozenRows, fc = sh.frozenCols;
      const fy = sh.rowH.pos(fr), fx = sh.colW.pos(fc), X0 = this.hdrW, Y0 = this.hdrH;
      const run = (ax, from, to, off, start, end, base) => {
        const out = [];
        let i = from, p = base + ax.pos(i) - off;
        while (i <= to && p < end) { const s = ax.size(i); if (s > 0 && p + s > start) out.push(ax === sh.colW ? { i, x: p, w: s } : { i, y: p, h: s }); p += s; i++; }
        return out;
      };
      const scCols = run(sh.colW, Math.max(fc, sh.colW.indexAt(fx + v.scrollX)), MAXC - 1, v.scrollX, X0 + fx, this.vw, X0);
      const frCols = fc ? run(sh.colW, 0, fc - 1, 0, X0, X0 + fx, X0) : [];
      const scRows = run(sh.rowH, Math.max(fr, sh.rowH.indexAt(fy + v.scrollY)), MAXR - 1, v.scrollY, Y0 + fy, this.vh, Y0);
      const frRows = fr ? run(sh.rowH, 0, fr - 1, 0, Y0, Y0 + fy, Y0) : [];
      this.geo = { fr, fc, fx, fy, scCols, frCols, scRows, frRows };
      const panes = [{ x: X0 + fx, y: Y0 + fy, w: this.vw - X0 - fx, h: this.vh - Y0 - fy, cols: scCols, rows: scRows, fcol: false, frow: false }];
      if (fr) panes.push({ x: X0 + fx, y: Y0, w: this.vw - X0 - fx, h: fy, cols: scCols, rows: frRows, fcol: false, frow: true });
      if (fc) panes.push({ x: X0, y: Y0 + fy, w: fx, h: this.vh - Y0 - fy, cols: frCols, rows: scRows, fcol: true, frow: false });
      if (fr && fc) panes.push({ x: X0, y: Y0, w: fx, h: fy, cols: frCols, rows: frRows, fcol: true, frow: true });
      return panes;
    }
    render() {
      if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; }
      const sh = this.sheet;
      if (!sh) return;
      const ctx = this.ctx, s = this.dpr * this.zoom, T = this.theme;
      const lastRow = sh.rowH.indexAt(sh.rowH.pos(sh.frozenRows) + sh.view.scrollY + this.vh);
      const hw = Math.max(40, 16 + String(lastRow + 1).length * 8);
      if (hw !== this.hdrW) { this.hdrW = hw; this.layoutLayer(); }
      ctx.setTransform(s, 0, 0, s, 0, 0);
      this._font = '';
      this.one = 1 / s;
      ctx.fillStyle = T.cellBg; ctx.fillRect(0, 0, this.vw, this.vh);
      const panes = this.computePanes();
      this.hits = [];
      for (const p of panes) this.drawPane(p);
      for (const p of panes) this.drawOverlays(p);
      this.drawHeaders();
      this.updateScrollbars();
      this.app.afterRender();
    }
    snap(v) { return Math.round(v / this.one) * this.one; }

    drawPane(p) {
      if (p.w <= 0 || p.h <= 0 || !p.cols.length || !p.rows.length) return;
      const ctx = this.ctx, sh = this.sheet, wb = sh.wb, T = this.theme, one = this.one;
      ctx.save(); ctx.beginPath(); ctx.rect(p.x, p.y, p.w, p.h); ctx.clip();
      if (sh.showGrid) {
        ctx.fillStyle = T.grid;
        for (const c of p.cols) ctx.fillRect(this.snap(c.x + c.w) - one, p.y, one, p.h);
        for (const r of p.rows) ctx.fillRect(p.x, this.snap(r.y + r.h) - one, p.w, one);
      }
      const c0 = p.cols[0].i, c1 = p.cols[p.cols.length - 1].i, r0 = p.rows[0].i, r1 = p.rows[p.rows.length - 1].i;
      const merged = new Map(), mlist = [];
      for (const m of sh.merges) {
        if (m.r2 < r0 || m.r1 > r1 || m.c2 < c0 || m.c1 > c1) continue;
        mlist.push(m);
        for (let r = Math.max(m.r1, r0); r <= Math.min(m.r2, r1); r++) for (let c = Math.max(m.c1, c0); c <= Math.min(m.c2, c1); c++) merged.set(r * K + c, m);
      }
      const hasCF = sh.condFmts.length > 0, items = [];
      for (const row of p.rows) {
        const data = sh.rows[row.i], rs = sh.rowStyle[row.i];
        for (let ci = 0; ci < p.cols.length; ci++) {
          const col = p.cols[ci];
          if (merged.size && merged.has(row.i * K + col.i)) continue;
          const cell = data ? data[col.i] : undefined;
          const st = (cell && cell.s) || rs || sh.colStyle[col.i] || sh.defStyle || null;
          const cf = hasCF ? wb.condStyle(sh, row.i, col.i) : null;
          if (!cell && !st && !cf) continue;
          items.push({ r: row.i, c: col.i, ci, x: col.x, y: row.y, w: col.w, h: row.h, cell, st, cf });
        }
      }
      for (const m of mlist) {
        const x = this.paneX(p, m.c1), y = this.paneY(p, m.r1);
        items.push({ r: m.r1, c: m.c1, ci: -1, x, y, w: this.paneX(p, m.c2 + 1) - x, h: this.paneY(p, m.r2 + 1) - y, cell: sh.get(m.r1, m.c1), st: sh.styleAt(m.r1, m.c1), cf: hasCF ? wb.condStyle(sh, m.r1, m.c1) : null, merge: m });
      }
      // rellenos
      for (const it of items) {
        const fill = (it.cf && it.cf.bg) || (it.st && it.st.bg);
        if (fill) { ctx.fillStyle = fill; const x = this.snap(it.x) - one, y = this.snap(it.y) - one; ctx.fillRect(x, y, this.snap(it.x + it.w) - x, this.snap(it.y + it.h) - y); }
        else if (it.merge) { ctx.fillStyle = T.cellBg; const x = this.snap(it.x), y = this.snap(it.y); ctx.fillRect(x, y, this.snap(it.x + it.w) - one - x, this.snap(it.y + it.h) - one - y); }
        if (it.cf && it.cf.bar) {
          ctx.globalAlpha = 0.45; ctx.fillStyle = it.cf.bar.color;
          ctx.fillRect(it.x + 2, it.y + 2, Math.max(0, (it.w - 5) * it.cf.bar.frac), it.h - 5);
          ctx.globalAlpha = 1;
        }
      }
      // texto
      for (const it of items) if (it.cell) this.drawText(p, it, merged);
      // bordes y marcas
      const flt = sh.filter ? sh.filter.range : null;
      for (const it of items) {
        const st = it.st;
        if (st && (st.bt || st.bb || st.bl || st.br)) this.drawBorders(it, st);
        if (it.cell && it.cell.note) { ctx.fillStyle = '#d93025'; ctx.beginPath(); const x = it.x + it.w - 1, y = it.y; ctx.moveTo(x - 7, y); ctx.lineTo(x, y); ctx.lineTo(x, y + 7); ctx.closePath(); ctx.fill(); }
      }
      if (flt && flt.r1 >= r0 && flt.r1 <= r1) {
        const row = p.rows.find((r) => r.i === flt.r1);
        if (row) for (const col of p.cols) {
          if (col.i < flt.c1 || col.i > flt.c2 || col.w < 20) continue;
          const on = !!(sh.filter.cols && sh.filter.cols[col.i - flt.c1]);
          const bx = col.x + col.w - 17, by = row.y + Math.max(1, row.h - 18);
          ctx.fillStyle = on ? T.accent : T.hdrBg; ctx.strokeStyle = on ? T.accent : T.hdrLine; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.roundRect(bx + 0.5, by + 0.5, 14, 14, 2); ctx.fill(); ctx.stroke();
          ctx.fillStyle = on ? '#fff' : T.hdrText;
          ctx.beginPath(); ctx.moveTo(bx + 4, by + 6); ctx.lineTo(bx + 11, by + 6); ctx.lineTo(bx + 7.5, by + 10.5); ctx.closePath(); ctx.fill();
          this.hits.push({ t: 'filter', x: bx, y: by, w: 15, h: 15, r: flt.r1, c: col.i, off: col.i - flt.c1 });
        }
      }
      ctx.restore();
    }

    drawText(p, it, merged) {
      const cell = it.cell, st = it.st || EMPTY, cf = it.cf;
      const d = this.display(cell, st);
      if (!d) return;
      const ctx = this.ctx, sh = this.sheet, T = this.theme, one = this.one;
      const px = ((st.fs || 11) * 4) / 3, font = this.fontOf(st, cf);
      const color = (cf && cf.fc) || st.fc || d.color || (d.link ? T.link : T.text);
      const under = (cf && cf.u != null ? cf.u : st.u) || d.link, strike = cf && cf.st != null ? cf.st : st.st;
      const avail = it.w - 2 * PAD - 1, va = st.va || 'b';
      const indent = st.ind ? st.ind * 8 : 0;
      let text = d.text;
      // texto ajustado en varias líneas
      if (st.wrap && d.str && !this.app.showFormulas) {
        const lines = this.wrapLines(font, text, Math.max(4, avail - indent));
        const lh = Math.round(px * 1.22), total = lines.length * lh;
        let y = va === 't' ? it.y + 2 : va === 'm' ? it.y + (it.h - total) / 2 : it.y + it.h - 3 - total;
        if (total > it.h - 3) y = it.y + 2;
        ctx.save(); ctx.beginPath(); ctx.rect(it.x, it.y, it.w - one, it.h - one); ctx.clip();
        this.setFont(font); ctx.fillStyle = color; ctx.textBaseline = 'top';
        for (const line of lines) {
          const tw = this.textWidth(font, line);
          const x = d.align === 'r' ? it.x + it.w - PAD - 1 - tw : d.align === 'c' ? it.x + (it.w - tw) / 2 : it.x + PAD + indent;
          ctx.textAlign = 'left'; ctx.fillText(line, x, y);
          if (under) ctx.fillRect(x, y + px * 1.02, tw, Math.max(one, px / 14));
          if (strike) ctx.fillRect(x, y + px * 0.56, tw, Math.max(one, px / 14));
          y += lh;
        }
        ctx.restore();
        return;
      }
      if (text.indexOf('\n') >= 0) text = text.replace(/\n/g, ' ');
      let tw = this.textWidth(font, text), clipX = it.x, clipW = it.w - one, clip = false;
      if (tw > avail - indent) {
        if (d.num) {
          const hash = () => '#'.repeat(Math.max(1, Math.floor(avail / this.textWidth(font, '#'))));
          if (d.general) {
            const n = Math.floor(avail / this.textWidth(font, '0'));
            text = n >= 1 ? HC.fmt.general(cell.v, n) : '';
            if (text === '' || this.textWidth(font, text) > avail) text = hash();
          } else text = hash();
          tw = this.textWidth(font, text);
          clip = tw > avail;
        } else if (d.str && it.ci >= 0) {
          // el texto largo invade las celdas vacías contiguas
          const free = (col) => { const k = it.r * K + col.i; if (merged.has(k)) return false; const n = sh.get(it.r, col.i); return !n || ((n.v == null || n.v === '') && !(this.app.showFormulas && n.f != null)); };
          const erase = (col, x) => { const s = sh.styleAt(it.r, col.i); ctx.fillStyle = (s && s.bg) || T.cellBg; ctx.fillRect(this.snap(x) - one, this.snap(it.y), one, this.snap(it.y + it.h) - one - this.snap(it.y)); };
          let needR = d.align === 'l' ? tw - avail + indent : d.align === 'c' ? (tw - avail) / 2 : 0, needL = d.align === 'r' ? tw - avail : d.align === 'c' ? (tw - avail) / 2 : 0;
          for (let k = it.ci + 1; needR > 0 && k < p.cols.length; k++) { const col = p.cols[k]; if (col.i !== p.cols[k - 1].i + 1 || !free(col)) break; erase(col, col.x); clipW += col.w; needR -= col.w; }
          for (let k = it.ci - 1; needL > 0 && k >= 0; k--) { const col = p.cols[k]; if (col.i !== p.cols[k + 1].i - 1 || !free(col)) break; erase(col, col.x + col.w); clipX -= col.w; clipW += col.w; needL -= col.w; }
          clip = true;
        } else clip = true;
      }
      if (clip) { ctx.save(); ctx.beginPath(); ctx.rect(clipX, it.y, clipW, it.h); ctx.clip(); }
      this.setFont(font); ctx.fillStyle = color; ctx.textAlign = 'left';
      const x = d.align === 'r' ? it.x + it.w - PAD - 1 - tw : d.align === 'c' ? it.x + (it.w - tw) / 2 : it.x + PAD + indent;
      let y, uy, sy;
      if (va === 't') { ctx.textBaseline = 'top'; y = it.y + 3; uy = y + px * 1.02; sy = y + px * 0.56; }
      else if (va === 'm') { ctx.textBaseline = 'middle'; y = it.y + it.h / 2 + 0.5; uy = y + px * 0.5; sy = y; }
      else { ctx.textBaseline = 'alphabetic'; y = it.y + it.h - Math.max(4, Math.round(px * 0.3)); uy = y + Math.max(1.5, px * 0.1); sy = y - px * 0.28; }
      ctx.fillText(text, x, y);
      if (under) ctx.fillRect(x, uy, tw, Math.max(one, px / 14));
      if (strike) ctx.fillRect(x, sy, tw, Math.max(one, px / 14));
      if (clip) ctx.restore();
    }

    drawBorders(it, st) {
      const ctx = this.ctx, one = this.one;
      const xa = this.snap(it.x) - one, xb = this.snap(it.x + it.w) - one, ya = this.snap(it.y) - one, yb = this.snap(it.y + it.h) - one;
      const line = (spec, x1, y1, x2, y2) => {
        const sp = spec.split(' '), kind = sp[0], w = BW[kind] || 1;
        ctx.fillStyle = ctx.strokeStyle = sp[1] || '#000000';
        const horiz = y1 === y2;
        if (kind === 'dashed' || kind === 'dotted') {
          ctx.save(); ctx.lineWidth = Math.max(one, 1); ctx.setLineDash(kind === 'dashed' ? [4, 2] : [1, 2]);
          ctx.beginPath(); ctx.moveTo(x1 + (horiz ? 0 : one / 2), y1 + (horiz ? one / 2 : 0)); ctx.lineTo(x2 + (horiz ? one : one / 2), y2 + (horiz ? one / 2 : one)); ctx.stroke(); ctx.restore();
          return;
        }
        const t = w === 1 ? one : w;
        const off = w === 1 ? 0 : Math.floor((w - 1) / 2);
        if (kind === 'double') {
          if (horiz) { ctx.fillRect(x1 - 1, y1 - 1, x2 - x1 + 2 + one, one); ctx.fillRect(x1 - 1, y1 + 1, x2 - x1 + 2 + one, one); }
          else { ctx.fillRect(x1 - 1, y1 - 1, one, y2 - y1 + 2 + one); ctx.fillRect(x1 + 1, y1 - 1, one, y2 - y1 + 2 + one); }
          return;
        }
        if (horiz) ctx.fillRect(x1 - off, y1 - off, x2 - x1 + one + 2 * off, t); else ctx.fillRect(x1 - off, y1 - off, t, y2 - y1 + one + 2 * off);
      };
      if (st.bt) line(st.bt, xa, ya, xb, ya);
      if (st.bb) line(st.bb, xa, yb, xb, yb);
      if (st.bl) line(st.bl, xa, ya, xa, yb);
      if (st.br) line(st.br, xb, ya, xb, yb);
    }

    // rectángulo de un rango dentro de un panel (o null), con qué bordes le pertenecen
    paneRect(p, g) {
      const sh = this.sheet;
      const cLo = p.fcol ? 0 : sh.frozenCols, cHi = p.fcol ? sh.frozenCols - 1 : MAXC - 1;
      const rLo = p.frow ? 0 : sh.frozenRows, rHi = p.frow ? sh.frozenRows - 1 : MAXR - 1;
      const c1 = Math.max(g.c1, cLo), c2 = Math.min(g.c2, cHi), r1 = Math.max(g.r1, rLo), r2 = Math.min(g.r2, rHi);
      if (c1 > c2 || r1 > r2) return null;
      const x = this.paneX(p, c1), y = this.paneY(p, r1), x2 = this.paneX(p, c2 + 1), y2 = this.paneY(p, r2 + 1);
      if (x2 < p.x - 4 || y2 < p.y - 4 || x > p.x + p.w + 4 || y > p.y + p.h + 4) return null;
      const X = Math.max(x, p.x - 8), Y = Math.max(y, p.y - 8);
      return { x: X, y: Y, w: Math.min(x2, p.x + p.w + 8) - X, h: Math.min(y2, p.y + p.h + 8) - Y, left: c1 === g.c1, right: c2 === g.c2, top: r1 === g.r1, bottom: r2 === g.r2 };
    }
    strokeBox(b, color, w, dash) {
      const ctx = this.ctx;
      ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = w; ctx.setLineDash(dash || []);
      const o = w % 2 ? 0.5 : 0, x1 = b.x - 1 + o, y1 = b.y - 1 + o, x2 = b.x + b.w - 1 + o, y2 = b.y + b.h - 1 + o;
      ctx.beginPath();
      if (b.top) { ctx.moveTo(x1 - w / 2 + o, y1); ctx.lineTo(x2 + w / 2 - o, y1); }
      if (b.bottom) { ctx.moveTo(x1 - w / 2 + o, y2); ctx.lineTo(x2 + w / 2 - o, y2); }
      if (b.left) { ctx.moveTo(x1, y1); ctx.lineTo(x1, y2); }
      if (b.right) { ctx.moveTo(x2, y1); ctx.lineTo(x2, y2); }
      ctx.stroke(); ctx.restore();
    }
    drawOverlays(p) {
      if (p.w <= 0 || p.h <= 0) return;
      const ctx = this.ctx, app = this.app, sh = this.sheet, T = this.theme, sel = app.sel;
      ctx.save(); ctx.beginPath(); ctx.rect(p.x, p.y, p.w, p.h); ctx.clip();
      const editing = app.edit && app.edit.sheet === sh;
      // referencias de la fórmula que se está escribiendo
      if (app.edit && app.edit.refs) for (const ref of app.edit.refs) {
        if (ref.sheet !== sh) continue;
        const b = this.paneRect(p, ref); if (!b) continue;
        ctx.globalAlpha = 0.09; ctx.fillStyle = ref.color; ctx.fillRect(b.x, b.y, b.w - 1, b.h - 1); ctx.globalAlpha = 1;
        this.strokeBox(b, ref.color, 2, ref.pointing ? [5, 3] : null);
      }
      if (!app.edit || !app.edit.refs) {
        const act = this.paneRect(p, this.activeRect());
        sel.ranges.forEach((g, i) => {
          const b = this.paneRect(p, g); if (!b) return;
          const last = i === sel.ranges.length - 1;
          const single = g.r1 === g.r2 && g.c1 === g.c2 || HC.sameRange(g, this.activeRect());
          if (!single || !last) {
            ctx.fillStyle = T.selFill;
            if (last && act) { // sin relleno sobre la celda activa
              ctx.beginPath(); ctx.rect(b.x, b.y, b.w - 1, b.h - 1); ctx.rect(act.x, act.y, act.w - 1, act.h - 1); ctx.fill('evenodd');
            } else ctx.fillRect(b.x, b.y, b.w - 1, b.h - 1);
          }
          this.strokeBox(b, T.accent, last ? 2 : 1);
          if (last && b.right && b.bottom && !editing && !app.readOnlyDrag) {
            const hx = b.x + b.w - 5, hy = b.y + b.h - 5;
            ctx.fillStyle = T.cellBg; ctx.fillRect(hx - 1, hy - 1, 8, 8);
            ctx.fillStyle = T.accent; ctx.fillRect(hx, hy, 6, 6);
            this.hits.push({ t: 'fill', x: hx - 3, y: hy - 3, w: 11, h: 11 });
          }
        });
      }
      // rango copiado o cortado
      if (app.clip && app.clip.data.sheet === sh && app.clip.show) { const b = this.paneRect(p, app.clip.data.range); if (b) { this.strokeBox(b, T.cellBg, 2); this.strokeBox(b, T.accent, 2, [5, 4]); } }
      if (app.fillDrag) { const b = this.paneRect(p, app.fillDrag.dest); if (b) this.strokeBox(b, T.muted, 1, [3, 3]); }
      // botón de lista desplegable de la validación
      if (!editing) {
        const rule = sh.validations.length ? sh.wb.validationAt(sh, sel.r, sel.c) : null;
        if (rule && rule.type === 'list') {
          const g = this.activeRect(), b = this.paneRect(p, g);
          if (b && b.right && b.w > 22) {
            const bx = b.x + b.w - 18, by = b.y + Math.max(0, b.h - 19);
            ctx.fillStyle = T.hdrBg; ctx.fillRect(bx, by, 16, Math.min(17, b.h - 2));
            ctx.fillStyle = T.hdrText; ctx.beginPath(); ctx.moveTo(bx + 4, by + 6); ctx.lineTo(bx + 12, by + 6); ctx.lineTo(bx + 8, by + 11); ctx.closePath(); ctx.fill();
            this.hits.push({ t: 'vlist', x: bx, y: by, w: 16, h: 17, r: sel.r, c: sel.c });
          }
        }
      }
      ctx.restore();
    }
    activeRect() { const s = this.app.sel, m = this.sheet.mergeAt(s.r, s.c); return m || { r1: s.r, c1: s.c, r2: s.r, c2: s.c }; }

    drawHeaders() {
      const ctx = this.ctx, T = this.theme, sh = this.sheet, g = this.geo, one = this.one, sel = this.app.sel;
      const W = this.hdrW, H = this.hdrH;
      const state = (i, isCol) => {
        let st = 0;
        for (const r of sel.ranges) {
          const a = isCol ? r.c1 : r.r1, b = isCol ? r.c2 : r.r2;
          if (i < a || i > b) continue;
          const full = isCol ? r.r1 === 0 && r.r2 >= MAXR - 1 : r.c1 === 0 && r.c2 >= MAXC - 1;
          st = Math.max(st, full ? 2 : 1);
        }
        return st;
      };
      ctx.fillStyle = T.hdrBg; ctx.fillRect(0, 0, this.vw, H); ctx.fillRect(0, 0, W, this.vh);
      this.setFont(this.uiFont);
      ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
      const drawCols = (cols, x1, x2) => {
        if (x2 <= x1) return;
        ctx.save(); ctx.beginPath(); ctx.rect(x1, 0, x2 - x1, H); ctx.clip();
        for (const c of cols) {
          const s = state(c.i, true);
          if (s) { ctx.fillStyle = s === 2 ? T.hdrFull : T.hdrSel; ctx.fillRect(c.x, 0, c.w, H); }
          ctx.fillStyle = s === 2 ? T.hdrFullText : T.hdrText;
          if (c.w > 14) ctx.fillText(HC.colName(c.i), c.x + c.w / 2, H / 2 + 0.5);
          ctx.fillStyle = T.hdrLine; ctx.fillRect(this.snap(c.x + c.w) - one, 0, one, H);
          if (s === 1) { ctx.fillStyle = T.accent; ctx.fillRect(c.x, H - 2, c.w, 2); }
        }
        ctx.restore();
      };
      const drawRows = (rows, y1, y2) => {
        if (y2 <= y1) return;
        ctx.save(); ctx.beginPath(); ctx.rect(0, y1, W, y2 - y1); ctx.clip();
        for (const r of rows) {
          const s = state(r.i, false);
          if (s) { ctx.fillStyle = s === 2 ? T.hdrFull : T.hdrSel; ctx.fillRect(0, r.y, W, r.h); }
          ctx.fillStyle = s === 2 ? T.hdrFullText : sh.rowH.filtered.size ? T.accent : T.hdrText;
          if (r.h > 9) ctx.fillText(String(r.i + 1), W / 2, r.y + r.h / 2 + 0.5);
          ctx.fillStyle = T.hdrLine; ctx.fillRect(0, this.snap(r.y + r.h) - one, W, one);
          if (s === 1) { ctx.fillStyle = T.accent; ctx.fillRect(W - 2, r.y, 2, r.h); }
        }
        ctx.restore();
      };
      drawCols(g.frCols, W, W + g.fx); drawCols(g.scCols, W + g.fx, this.vw);
      drawRows(g.frRows, H, H + g.fy); drawRows(g.scRows, H + g.fy, this.vh);
      // esquina
      ctx.fillStyle = T.hdrBg; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = T.hdrLine; ctx.beginPath(); ctx.moveTo(W - 4, H - 4); ctx.lineTo(W - 13, H - 4); ctx.lineTo(W - 4, H - 13); ctx.closePath(); ctx.fill();
      ctx.fillRect(W - one, 0, one, this.vh); ctx.fillRect(0, H - one, this.vw, one);
      // líneas de paneles inmovilizados
      ctx.fillStyle = T.frozen;
      if (g.fc) ctx.fillRect(this.snap(W + g.fx) - one, 0, one, this.vh);
      if (g.fr) ctx.fillRect(0, this.snap(H + g.fy) - one, this.vw, one);
    }

    // ------------------------------------------------------------ barras de desplazamiento
    updateScrollbars() {
      if (this._drag) return;
      const sh = this.sheet, v = sh.view, g = this.geo, vs = this.viewSize();
      const lastC = g.scCols.length ? g.scCols[g.scCols.length - 1].i : 0, lastR = g.scRows.length ? g.scRows[g.scRows.length - 1].i : 0;
      const extC = Math.min(MAXC, Math.max(sh.maxC + 1, lastC + 1, 26) + 6), extR = Math.min(MAXR, Math.max(sh.maxR + 1, lastR + 1, 60) + 25);
      this.contentW = Math.max(vs.w, sh.colW.pos(extC) - g.fx); this.contentH = Math.max(vs.h, sh.rowH.pos(extR) - g.fy);
      const place = (thumb, track, view, content, pos, vertical) => {
        const size = Math.max(30, Math.round((track * view) / content)), free = track - size;
        const at = content > view ? Math.round((free * pos) / (content - view)) : 0;
        if (vertical) { thumb.style.height = size + 'px'; thumb.style.transform = 'translateY(' + HC.clamp(at, 0, free) + 'px)'; }
        else { thumb.style.width = size + 'px'; thumb.style.transform = 'translateX(' + HC.clamp(at, 0, free) + 'px)'; }
        thumb.hidden = content <= view + 1;
      };
      place(this.vthumb, this.vbar.clientHeight, vs.h, this.contentH, v.scrollY, true);
      place(this.hthumb, this.hbar.clientWidth, vs.w, this.contentW, v.scrollX, false);
    }
    _bindScrollbars() {
      const bind = (bar, thumb, vertical) => {
        thumb.addEventListener('pointerdown', (e) => {
          e.preventDefault(); e.stopPropagation();
          thumb.setPointerCapture(e.pointerId);
          const vs = this.viewSize(), track = vertical ? bar.clientHeight : bar.clientWidth, size = vertical ? thumb.offsetHeight : thumb.offsetWidth;
          const content = vertical ? this.contentH : this.contentW, view = vertical ? vs.h : vs.w;
          const start = vertical ? e.clientY : e.clientX, v = this.sheet.view, pos0 = vertical ? v.scrollY : v.scrollX;
          this._drag = true; thumb.classList.add('drag');
          const move = (ev) => {
            const d = (vertical ? ev.clientY : ev.clientX) - start, free = Math.max(1, track - size);
            const pos = pos0 + (d / free) * (content - view);
            if (vertical) this.scrollTo(v.scrollX, pos); else this.scrollTo(pos, v.scrollY);
            const at = HC.clamp(((vertical ? v.scrollY : v.scrollX) / Math.max(1, content - view)) * free, 0, free);
            thumb.style.transform = (vertical ? 'translateY(' : 'translateX(') + at + 'px)';
          };
          const up = () => { this._drag = false; thumb.classList.remove('drag'); thumb.removeEventListener('pointermove', move); thumb.removeEventListener('pointerup', up); thumb.removeEventListener('pointercancel', up); this.invalidate(); };
          thumb.addEventListener('pointermove', move); thumb.addEventListener('pointerup', up); thumb.addEventListener('pointercancel', up);
        });
        bar.addEventListener('pointerdown', (e) => {
          if (e.target !== bar) return;
          const r = thumb.getBoundingClientRect(), vs = this.viewSize();
          const before = vertical ? e.clientY < r.top : e.clientX < r.left;
          if (vertical) this.scrollBy(0, (before ? -1 : 1) * vs.h * 0.9); else this.scrollBy((before ? -1 : 1) * vs.w * 0.9, 0);
        });
      };
      bind(this.vbar, this.vthumb, true); bind(this.hbar, this.hthumb, false);
    }
  }
  HC.Grid = Grid;
})();
