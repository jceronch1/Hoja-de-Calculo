/* Edición de celdas: editor sobre la cuadrícula, barra de fórmulas, selección de referencias
   con ratón o flechas, autocompletado de funciones y ayuda de argumentos. */
(function () {
  'use strict';
  const HC = window.HC, ui = HC.ui, h = ui.h, app = HC.app;
  const MAXR = HC.MAX_ROWS, MAXC = HC.MAX_COLS;

  // Lista de funciones para autocompletar y para el asistente (en el idioma actual).
  let fnCache = null, fnCacheLang = null;
  HC.fnList = function () {
    if (fnCache && fnCacheLang === HC.locale.lang) return fnCache;
    fnCache = [];
    for (const k in HC.fns) {
      const d = HC.fns[k];
      if (d.hidden) continue;
      fnCache.push({ canon: k, name: HC.fnToLocal(k), desc: d.desc, help: d.help, cat: d.cat });
    }
    fnCache.sort((a, b) => a.name.localeCompare(b.name));
    fnCacheLang = HC.locale.lang;
    return fnCache;
  };
  HC.fnSignature = function (canon) {
    const d = HC.fns[canon];
    if (!d) return '';
    const sep = HC.listSep() + ' ';
    return HC.fnToLocal(canon) + '(' + (d.help || '').split(';').map((s) => s.trim()).filter(Boolean).join(sep) + ')';
  };

  const baseFocus = app.focusGrid;
  Object.assign(app, {
    focusGrid() { if (this.edit) this.focusEditor(); else baseFocus.call(this); },
    editorEl() {
      if (this._ed) return this._ed;
      const ed = (this._ed = h('textarea.cell-editor', { spellcheck: false, autocomplete: 'off', autocapitalize: 'off', rows: 1, wrap: 'off', 'aria-label': 'Editor de celda' }));
      ed.hidden = true;
      this.grid.host.appendChild(ed);
      this.bindInput(ed, 'cell');
      return ed;
    },
    bindInput(el, src) {
      el.addEventListener('input', () => this.onEditInput(src));
      el.addEventListener('keydown', (e) => this.onEditKey(e, src));
      el.addEventListener('keyup', (e) => { if (this.edit && /^(Arrow|Home|End)/.test(e.key)) this.updateHints(); });
      el.addEventListener('click', () => { if (this.edit) { this.edit.where = src; this.edit.point = null; if (src === 'cell') this.edit.mode = 'edit'; this.updateHints(); } });
      if (src === 'bar') el.addEventListener('focus', () => { if (!this.edit) this.startEdit(null, { mode: 'edit', where: 'bar', keepCaret: true }); else this.edit.where = 'bar'; });
    },
    activeInput() { return this.edit && this.edit.where === 'bar' ? HC.chrome.fx : this.editorEl(); },
    focusEditor() {
      if (!this.edit) return;
      const el = this.activeInput();
      if (document.activeElement !== el) el.focus({ preventScroll: true });
    },

    // ------------------------------------------------------------ inicio y fin de la edición
    startEdit(text, opts) {
      opts = opts || {};
      if (this.edit) return;
      const sh = this.sheet, s = this.sel;
      const original = this.wb.editText(sh, s.r, s.c);
      const init = text == null ? original : text;
      this.edit = { sheet: sh, r: s.r, c: s.c, text: init, original, mode: opts.mode || 'enter', where: opts.where || 'cell', point: null, refs: null, pointCell: null, pointAnchor: null };
      this.grid.ensureVisible(s.r, s.c);
      const ed = this.editorEl(), fx = HC.chrome.fx;
      ed.value = init; ed.hidden = false;
      if (fx.value !== init) fx.value = init;
      this.styleEditor();
      this.positionEditor(); // lo hace visible antes de darle el foco
      if (ed.style.display === 'none') this.edit.where = 'bar';
      HC.chrome.setEditing(true);
      const el = this.activeInput();
      if (document.activeElement !== el) el.focus({ preventScroll: true });
      if (!opts.keepCaret) { const pos = opts.caret != null ? opts.caret : init.length; el.setSelectionRange(pos, pos); }
      this.afterEditChange();
    },
    styleEditor() {
      const ed = this.editorEl(), e = this.edit, z = this.grid.zoom;
      const st = e.sheet.styleAt(e.r, e.c) || {};
      const px = (((st.fs || 11) * 4) / 3) * z;
      Object.assign(ed.style, {
        fontFamily: st.ff ? '"' + st.ff + '", ' + HC.FONT_STACK : HC.FONT_STACK, fontSize: px.toFixed(2) + 'px', lineHeight: Math.round(px * 1.22) + 'px',
        fontWeight: st.b ? '700' : '400', fontStyle: st.i ? 'italic' : 'normal', color: st.fc || '', background: st.bg || '',
      });
    },
    positionEditor() {
      const ed = this._ed, e = this.edit;
      if (!ed) return;
      if (!e || e.sheet !== this.sheet) { ed.style.display = 'none'; return; }
      const g = this.grid, z = g.zoom, rc = g.cellRect(e.r, e.c), sh = this.sheet;
      const minX = g.hdrW + (e.c < sh.frozenCols ? 0 : sh.colW.pos(sh.frozenCols)), minY = g.hdrH + (e.r < sh.frozenRows ? 0 : sh.rowH.pos(sh.frozenRows));
      if (rc.x < minX - 1 || rc.y < minY - 1 || rc.x > g.vw - 8 || rc.y > g.vh - 8) { ed.style.display = 'none'; return; }
      ed.style.display = 'block';
      const font = (ed.style.fontStyle === 'italic' ? 'italic ' : '') + ed.style.fontWeight + ' ' + ed.style.fontSize + ' ' + ed.style.fontFamily;
      const lines = e.text.split('\n');
      let tw = 0;
      for (const l of lines) tw = Math.max(tw, g.textWidth(font, l));
      const left = rc.x * z, top = rc.y * z, maxW = Math.max(60, g.vw * z - left - 4);
      const lh = parseFloat(ed.style.lineHeight) || 18;
      const w = Math.min(maxW, Math.max(rc.w * z, tw + 14)), hh = Math.min(Math.max(rc.h * z, lines.length * lh + 5), Math.max(rc.h * z, g.vh * z - top - 4));
      Object.assign(ed.style, { left: left - 1 + 'px', top: top - 1 + 'px', width: w + 1 + 'px', height: hh + 1 + 'px', paddingTop: Math.max(0, Math.min(rc.h * z, hh) - lines.length * lh - 4) + 'px' });
    },
    endEdit() {
      this.edit = null;
      if (this._ed) { this._ed.hidden = true; this._ed.style.display = 'none'; this._ed.value = ''; }
      this.closeHints();
      HC.chrome.setEditing(false);
      HC.chrome.updateFormulaBar();
      this.grid.invalidate();
    },
    cancelEdit() {
      const e = this.edit;
      if (!e) return;
      this.endEdit();
      this.backToEditSheet(e);
      this.focusGrid();
    },
    backToEditSheet(e) {
      if (this.sheet === e.sheet) return;
      const i = this.wb.sheets.indexOf(e.sheet);
      if (i < 0) return;
      this.wb.active = i;
      this.sel = { r: e.r, c: e.c, ranges: [{ r1: e.r, c1: e.c, r2: e.r, c2: e.c }], anchor: { r: e.r, c: e.c } };
      this.refreshAll();
    },
    editError(msg) {
      ui.dialog({ title: 'Revisa lo que has escrito', body: h('p.dlg-msg', msg), buttons: [{ label: 'Seguir editando', primary: true }], onClose: () => this.focusEditor() });
    },
    // dir: 'down' | 'up' | 'left' | 'right' | null. fillAll: escribe lo mismo en toda la selección (Ctrl+Intro).
    commitEdit(dir, fillAll) {
      const e = this.edit;
      if (!e) return true;
      const wb = this.wb, sh = e.sheet, text = e.text;
      const changed = text !== e.original || fillAll;
      let f0 = null;
      if (changed) {
        if (text.length > 1 && text[0] === '=') {
          f0 = HC.canonicalizeFormula(text.slice(1));
          const p = HC.parseFormula(f0);
          if (p.err) { this.editError('La fórmula no se puede interpretar: ' + p.err.message + '.'); return false; }
        }
        const msg = wb.checkValidation(sh, e.r, e.c, text);
        if (msg) { this.editError(msg); return false; }
      }
      this.endEdit();
      this.backToEditSheet(e);
      if (changed) {
        wb.begin('Editar celda');
        if (fillAll) {
          let n = 0;
          for (const g of this.sel.ranges) {
            const u = { r1: g.r1, c1: g.c1, r2: Math.min(g.r2, g.r1 + 4999), c2: Math.min(g.c2, g.c1 + 499) };
            for (let r = u.r1; r <= u.r2 && n < 300000; r++) for (let c = u.c1; c <= u.c2; c++, n++) {
              if (f0 != null) wb._put(sh, r, c, HC.shiftFormula(f0, r - e.r, c - e.c), null); else wb.setCellInput(sh, r, c, text);
            }
          }
          if (f0 != null) wb.setCellInput(sh, e.r, e.c, text);
        } else wb.setCellInput(sh, e.r, e.c, text);
        if (text.indexOf('\n') >= 0 && text[0] !== '=') wb.formatRange(sh, [{ r1: e.r, c1: e.c, r2: e.r, c2: e.c }], { wrap: true });
        const st = sh.styleAt(e.r, e.c);
        if (st && (st.wrap || (st.fs && st.fs > 11))) { const need = this.grid.neededRowHeight(e.r); if (need > sh.rowH.raw(e.r)) wb.setSize(sh, 'row', e.r, Math.min(need, 400)); }
        wb.commit();
      }
      if (dir === 'down') this.advance(1, 0); else if (dir === 'up') this.advance(-1, 0); else if (dir === 'right') this.advance(0, 1); else if (dir === 'left') this.advance(0, -1);
      this.focusGrid();
      return true;
    },

    // ------------------------------------------------------------ escritura
    setEditText(text, caret, keepPoint) {
      const e = this.edit;
      e.text = text;
      if (!keepPoint) e.point = null;
      const ed = this.editorEl(), fx = HC.chrome.fx;
      if (ed.value !== text) ed.value = text;
      if (fx.value !== text) fx.value = text;
      if (caret != null) { const el = this.activeInput(); el.setSelectionRange(caret, caret); }
      this.afterEditChange();
    },
    onEditInput(src) {
      const e = this.edit;
      if (!e) return;
      const el = src === 'bar' ? HC.chrome.fx : this.editorEl(), other = src === 'bar' ? this.editorEl() : HC.chrome.fx;
      e.where = src; e.text = el.value; e.point = null; e.pointCell = null;
      if (other.value !== e.text) other.value = e.text;
      this.afterEditChange();
    },
    afterEditChange() {
      const e = this.edit;
      if (!e) return;
      e.refs = e.text.length > 0 && e.text[0] === '=' ? this.parseRefs(e.text) : null;
      this.positionEditor();
      this.updateHints();
      HC.chrome.autoGrowFx();
      this.grid.invalidate();
    },
    // referencias de la fórmula en edición, con un color por referencia distinta
    parseRefs(text) {
      const e = this.edit, wb = this.wb, out = [], colors = new Map();
      let toks;
      try { toks = HC.tokenize(text.slice(1), HC.synLocal()); } catch (err) { return out; }
      for (const t of toks) {
        if (t.t !== 'ref' || t.kind === 'err') continue;
        const sh = t.sheet != null ? wb.sheetByName(t.sheet) : e.sheet;
        if (!sh) continue;
        const a = t.p1, b = t.p2 || t.p1;
        const g = { sheet: sh, r1: 0, r2: MAXR - 1, c1: 0, c2: MAXC - 1, s: t.s + 1, e: t.e + 1 };
        if (t.kind !== 'cols') { g.r1 = Math.min(a.r, b.r); g.r2 = Math.max(a.r, b.r); }
        if (t.kind !== 'rows') { g.c1 = Math.min(a.c, b.c); g.c2 = Math.max(a.c, b.c); }
        if (t.kind === 'cell') { const m = sh.mergeAt(g.r1, g.c1); if (m) { g.r2 = m.r2; g.c2 = m.c2; } }
        const key = sh.id + ':' + g.r1 + ',' + g.c1 + ',' + g.r2 + ',' + g.c2;
        if (!colors.has(key)) colors.set(key, HC.REF_COLORS[colors.size % HC.REF_COLORS.length]);
        g.color = colors.get(key);
        g.pointing = !!(e.point && e.point.start === g.s);
        out.push(g);
      }
      return out;
    },
    // ¿Un clic en la cuadrícula debe insertar una referencia en la fórmula?
    canPoint() {
      const e = this.edit;
      if (!e || e.text[0] !== '=') return false;
      if (e.point) return true;
      const el = this.activeInput(), pos = el.selectionStart;
      if (pos !== el.selectionEnd) return false;
      let i = pos - 1;
      while (i >= 0 && e.text[i] === ' ') i--;
      if (i < 0 || '=+-*/^&(,;<>:\\{'.indexOf(e.text[i]) < 0) return false;
      return ((e.text.slice(0, pos).match(/"/g) || []).length % 2) === 0;
    },
    pointAt(r, c, extend, line) {
      const e = this.edit, sh = this.sheet;
      r = HC.clamp(r, 0, MAXR - 1); c = HC.clamp(c, 0, MAXC - 1);
      if (!extend || !e.pointAnchor) e.pointAnchor = { r, c };
      const a = e.pointAnchor;
      let g = { r1: Math.min(a.r, r), c1: Math.min(a.c, c), r2: Math.max(a.r, r), c2: Math.max(a.c, c) };
      if (line === 'col') { g.r1 = 0; g.r2 = MAXR - 1; } else if (line === 'row') { g.c1 = 0; g.c2 = MAXC - 1; }
      else if (g.r1 === g.r2 && g.c1 === g.c2) { const m = sh.mergeAt(r, c); if (m) g = { r1: m.r1, c1: m.c1, r2: m.r1, c2: m.c1 }; }
      else g = this.withMerges(g);
      let ref = HC.rangeAddr(g);
      if (sh !== e.sheet) ref = HC.quoteSheet(sh.name) + '!' + ref;
      const el = this.activeInput();
      const start = e.point ? e.point.start : el.selectionStart, end = e.point ? e.point.end : el.selectionEnd;
      const text = e.text.slice(0, start) + ref + e.text.slice(end);
      e.point = { start, end: start + ref.length };
      e.pointCell = { r, c };
      this.setEditText(text, e.point.end, true);
    },
    onEditKey(e, src) {
      const ed = this.edit;
      if (!ed || e.isComposing) return;
      const key = e.key, ctrl = e.ctrlKey || e.metaKey;
      if (this.ac) {
        if (key === 'ArrowDown' || key === 'ArrowUp') { this.acMove(key === 'ArrowDown' ? 1 : -1); e.preventDefault(); return; }
        if (key === 'Tab' || (key === 'Enter' && this.ac.touched)) { this.acAccept(); e.preventDefault(); return; }
        if (key === 'Escape') { this.closeHints(); e.preventDefault(); e.stopPropagation(); return; }
      }
      switch (key) {
        case 'Enter':
          e.preventDefault();
          if (e.altKey) { const el = this.activeInput(), p = el.selectionStart; this.setEditText(ed.text.slice(0, p) + '\n' + ed.text.slice(el.selectionEnd), p + 1); return; }
          if (ctrl) this.commitEdit(null, true); else this.commitEdit(e.shiftKey ? 'up' : 'down');
          return;
        case 'Tab': e.preventDefault(); this.commitEdit(e.shiftKey ? 'left' : 'right'); return;
        case 'Escape': e.preventDefault(); e.stopPropagation(); this.cancelEdit(); return;
        case 'F2': e.preventDefault(); ed.mode = ed.mode === 'enter' ? 'edit' : 'enter'; return;
        case 'F4': {
          e.preventDefault();
          const el = this.activeInput(), res = ed.text[0] === '=' ? HC.toggleAbsAt(ed.text.slice(1), Math.max(0, el.selectionStart - 1)) : null;
          if (res) { const keep = ed.point && ed.point.start === res.start + 1; if (keep) ed.point.end = res.end + 1; this.setEditText('=' + res.text, res.end + 1, keep); }
          return;
        }
        case 'ArrowUp': case 'ArrowDown': case 'ArrowLeft': case 'ArrowRight': {
          if (ed.mode !== 'enter' || src === 'bar') return;
          e.preventDefault();
          const dr = key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : 0, dc = key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0;
          if (this.canPoint()) {
            const sh = this.sheet, base = e.shiftKey && ed.pointCell ? ed.pointCell : ed.pointCell || (sh === ed.sheet ? { r: ed.r, c: ed.c } : { r: this.sel.r, c: this.sel.c });
            let r = base.r, c = base.c;
            if (ctrl) { const j = this.jump(r, c, dr, dc); r = j.r; c = j.c; } else { r = this.stepAxis(sh.rowH, r, dr, MAXR); c = this.stepAxis(sh.colW, c, dc, MAXC); }
            this.pointAt(r, c, e.shiftKey);
            this.grid.ensureVisible(r, c);
            return;
          }
          this.commitEdit(dr > 0 ? 'down' : dr < 0 ? 'up' : dc > 0 ? 'right' : 'left');
          return;
        }
      }
    },

    // ------------------------------------------------------------ autocompletado y ayuda de argumentos
    hintBox() {
      if (!this._hint) {
        this._hint = document.body.appendChild(h('div#fn-pop'));
        this._hint.addEventListener('pointerdown', (e) => e.preventDefault());
      }
      return this._hint;
    },
    closeHints() { this.ac = null; if (this._hint) this._hint.style.display = 'none'; },
    placeHint() {
      const box = this.hintBox(), el = this.activeInput(), b = el.getBoundingClientRect();
      box.style.display = 'block';
      const w = box.offsetWidth, hh = box.offsetHeight;
      let x = b.left, y = b.bottom + 3;
      if (y + hh > window.innerHeight - 4) y = Math.max(4, b.top - hh - 3);
      if (x + w > window.innerWidth - 4) x = Math.max(4, window.innerWidth - w - 4);
      box.style.left = x + 'px'; box.style.top = y + 'px';
    },
    updateHints() {
      const e = this.edit;
      if (!e || e.text[0] !== '=' || e.point) { this.closeHints(); return; }
      const el = this.activeInput(), pos = el.selectionStart, before = e.text.slice(0, pos);
      if (pos !== el.selectionEnd || ((before.match(/"/g) || []).length % 2) === 1) { this.closeHints(); return; }
      const m = /(^|[^\p{L}\p{N}_.$!'"])([\p{L}_][\p{L}\p{N}_.]*)$/u.exec(before);
      const after = e.text[pos] || '';
      if (m && !/[\p{L}\p{N}_(]/u.test(after)) {
        const word = HC.fold(m[2]).toUpperCase();
        const items = [];
        for (const f of HC.fnList()) if (f.name.startsWith(word)) { items.push(f); if (items.length >= 60) break; }
        for (const nm of this.wb.names.values()) if (nm.name.toUpperCase().startsWith(word)) items.push({ name: nm.name, desc: 'Nombre definido: ' + nm.f, isName: true });
        if (items.length && !(items.length === 1 && items[0].isName && items[0].name.toUpperCase() === word)) { this.showAc(items, pos - m[2].length, pos, word.length); return; }
      }
      this.ac = null;
      const call = this.currentCall(before);
      if (!call) { this.closeHints(); return; }
      const d = HC.fns[call.name], box = this.hintBox();
      const args = (d.help || '').split(';').map((s) => s.trim()).filter(Boolean);
      const cur = args.length ? Math.min(call.arg, args.length - 1) : -1;
      const sig = h('div.hint-sig', h('b', HC.fnToLocal(call.name)), '(');
      args.forEach((a, i) => { if (i) sig.append(HC.listSep() + ' '); sig.append(i === cur ? h('span.hint-cur', a) : a); });
      sig.append(')');
      box.replaceChildren(sig, h('div.hint-desc', d.desc || ''));
      box.className = 'hint';
      this.placeHint();
    },
    // función cuyos paréntesis contienen el cursor: {name, arg}
    currentCall(before) {
      let toks;
      try { toks = HC.tokenize(before.slice(1), HC.synLocal()); } catch (err) { return null; }
      const stack = [];
      for (let i = 0; i < toks.length; i++) {
        const t = toks[i];
        if (t.t === 'fn') { stack.push({ name: t.v, arg: 0 }); i++; }
        else if (t.t === 'lp') stack.push({ name: null, arg: 0 });
        else if (t.t === 'rp') stack.pop();
        else if (t.t === 'sep' && stack.length) stack[stack.length - 1].arg++;
      }
      for (let i = stack.length - 1; i >= 0; i--) if (stack[i].name) return HC.fns[stack[i].name] ? stack[i] : null;
      return null;
    },
    showAc(items, start, end, typed) {
      const box = this.hintBox(), prev = this.ac;
      const keep = prev && prev.items[prev.index] ? prev.items[prev.index].name : null;
      let index = keep ? Math.max(0, items.findIndex((x) => x.name === keep)) : 0;
      if (!prev || !prev.touched) index = 0;
      this.ac = { items, start, end, index, touched: !!(prev && prev.touched) };
      box.className = 'ac';
      box.replaceChildren(...items.map((it, i) => {
        const row = h('div.ac-item' + (i === index ? '.on' : ''), h('span.ac-name', h('b', it.name.slice(0, typed)), it.name.slice(typed)), h('span.ac-desc', it.desc || ''));
        row.addEventListener('click', () => { this.ac.index = i; this.acAccept(); });
        return row;
      }));
      this.placeHint();
    },
    acMove(d) {
      const ac = this.ac, box = this.hintBox();
      box.children[ac.index].classList.remove('on');
      ac.index = (ac.index + d + ac.items.length) % ac.items.length; ac.touched = true;
      box.children[ac.index].classList.add('on');
      box.children[ac.index].scrollIntoView({ block: 'nearest' });
    },
    acAccept() {
      const ac = this.ac, e = this.edit;
      if (!ac || !e) return;
      const it = ac.items[ac.index], ins = it.isName ? it.name : it.name + '(';
      const text = e.text.slice(0, ac.start) + ins + e.text.slice(ac.end);
      this.ac = null;
      this.focusEditor();
      this.setEditText(text, ac.start + ins.length);
    },
  });
})();
