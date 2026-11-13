/* Modelo del libro: hojas, celdas, estilos, dependencias entre fórmulas, recálculo,
   desbordamiento de matrices, deshacer/rehacer y cambios de estructura (filas y columnas). */
(function (root) {
  'use strict';
  const HC = root.HC, E = HC.E;
  const MAXR = HC.MAX_ROWS, MAXC = HC.MAX_COLS, KEY = 16384;
  const DEFER = { defer: true };
  HC.DEF_ROW_H = 20;
  HC.DEF_COL_W = 80;
  const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));

  // ---------------------------------------------------------------- tamaños de filas o columnas
  class Axis {
    constructor(def) { this.def = def; this.sizes = new Map(); this.hidden = new Set(); this.filtered = new Set(); this._k = null; }
    size(i) { if (this.hidden.has(i) || this.filtered.has(i)) return 0; const s = this.sizes.get(i); return s === undefined ? this.def : s; }
    raw(i) { const s = this.sizes.get(i); return s === undefined ? this.def : s; }
    set(i, s) { if (s == null || s === this.def) this.sizes.delete(i); else this.sizes.set(i, Math.max(0, s)); this._k = null; }
    setHidden(i, on) { if (on) this.hidden.add(i); else this.hidden.delete(i); this._k = null; }
    touch() { this._k = null; }
    _build() {
      const keys = new Set(this.sizes.keys());
      for (const i of this.hidden) keys.add(i);
      for (const i of this.filtered) keys.add(i);
      const k = Array.from(keys).sort((a, b) => a - b), cum = new Array(k.length + 1);
      cum[0] = 0;
      for (let j = 0; j < k.length; j++) cum[j + 1] = cum[j] + this.size(k[j]) - this.def;
      this._k = k; this._cum = cum;
    }
    // posición en píxeles donde empieza el índice i
    pos(i) {
      if (!this._k) this._build();
      const k = this._k;
      let lo = 0, hi = k.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (k[m] < i) lo = m + 1; else hi = m; }
      return i * this.def + this._cum[lo];
    }
    indexAt(px) {
      if (px <= 0) return 0;
      if (!this._k) this._build();
      const k = this._k, cum = this._cum, def = this.def;
      let lo = 0, hi = k.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (k[m] * def + cum[m] <= px) lo = m + 1; else hi = m; }
      if (lo === 0) return Math.floor(px / def);
      const j = lo - 1, within = px - (k[j] * def + cum[j]), sz = this.size(k[j]);
      return within < sz ? k[j] : k[j] + 1 + Math.floor((within - sz) / def);
    }
    shift(at, n) { // n > 0 inserta; n < 0 elimina |n| a partir de at
      const mv = (i) => (n > 0 ? (i >= at ? i + n : i) : i >= at - n ? i + n : i >= at ? -1 : i);
      const sizes = new Map();
      for (const [i, s] of this.sizes) { const j = mv(i); if (j >= 0) sizes.set(j, s); }
      const hid = new Set(), fil = new Set();
      for (const i of this.hidden) { const j = mv(i); if (j >= 0) hid.add(j); }
      for (const i of this.filtered) { const j = mv(i); if (j >= 0) fil.add(j); }
      this.sizes = sizes; this.hidden = hid; this.filtered = fil; this._k = null;
    }
    export() { return { sizes: Array.from(this.sizes), hidden: Array.from(this.hidden), filtered: Array.from(this.filtered) }; }
    import(o) { this.sizes = new Map(o.sizes || []); this.hidden = new Set(o.hidden || []); this.filtered = new Set(o.filtered || []); this._k = null; }
  }
  HC.Axis = Axis;

  // ---------------------------------------------------------------- hoja
  class Sheet {
    constructor(wb, name) {
      this.wb = wb; this.id = HC.uid('h'); this.name = name;
      this.rows = []; this.maxR = -1; this.maxC = -1;
      this.colW = new Axis(HC.DEF_COL_W); this.rowH = new Axis(HC.DEF_ROW_H);
      this.colStyle = []; this.rowStyle = []; this.defStyle = null;
      this.merges = []; this.frozenRows = 0; this.frozenCols = 0; this.showGrid = true; this.tabColor = null;
      this.filter = null; this.condFmts = []; this.validations = []; this.charts = [];
      this.depCells = new Map(); this.depRanges = new Map();
      this.view = { r: 0, c: 0, ranges: null, scrollX: 0, scrollY: 0 };
    }
    get(r, c) { const row = this.rows[r]; return row ? row[c] : undefined; }
    cell(r, c) {
      let row = this.rows[r];
      if (!row) row = this.rows[r] = [];
      let cell = row[c];
      if (!cell) {
        cell = row[c] = { r, c, sh: this, v: null };
        if (r > this.maxR) this.maxR = r;
        if (c > this.maxC) this.maxC = c;
      }
      return cell;
    }
    value(r, c) { const cell = this.get(r, c); return cell ? cell.v : null; }
    styleAt(r, c) { const cell = this.get(r, c); return (cell && cell.s) || this.rowStyle[r] || this.colStyle[c] || this.defStyle || null; }
    isRowHidden(r) { return this.rowH.hidden.has(r); }
    isRowFiltered(r) { return this.rowH.filtered.has(r); }
    mergeAt(r, c) {
      const m = this.merges;
      for (let i = 0; i < m.length; i++) { const g = m[i]; if (r >= g.r1 && r <= g.r2 && c >= g.c1 && c <= g.c2) return g; }
      return null;
    }
    // rectángulo que realmente contiene datos o fórmulas
    usedRange() {
      let r2 = -1, c2 = -1;
      this.rows.forEach((row, r) => {
        if (!row) return;
        row.forEach((cell, c) => { if (cell && (cell.f != null || cell.v != null)) { if (r > r2) r2 = r; if (c > c2) c2 = c; } });
      });
      return { r1: 0, c1: 0, r2, c2 };
    }
  }
  HC.Sheet = Sheet;

  // ---------------------------------------------------------------- libro
  class Workbook {
    constructor() {
      this.sheets = []; this.names = new Map(); this.active = 0; this.title = 'Libro sin título';
      this._styles = new Map(); this._byName = null;
      this.dirty = new Set(); this.volatile = new Set(); this.blocked = new Set();
      this.pass = 0; this.gen = 0; this._depth = 0; this._inRecalc = false;
      this.undoStack = []; this.redoStack = []; this._tx = null; this._replay = false;
      this._ev = {}; this.modified = false;
    }
    on(evt, fn) { (this._ev[evt] || (this._ev[evt] = [])).push(fn); }
    emit(evt, data) { const l = this._ev[evt]; if (l) for (const fn of l) fn(data); }
    get sheet() { return this.sheets[this.active]; }

    // ------------------------------------------------------------ estilos (objetos inmutables compartidos)
    style(obj) {
      if (!obj) return null;
      const keys = Object.keys(obj).filter((k) => obj[k] != null && obj[k] !== false).sort();
      if (!keys.length) return null;
      const clean = {};
      for (const k of keys) clean[k] = obj[k];
      const id = JSON.stringify(clean);
      let s = this._styles.get(id);
      if (!s) { s = Object.freeze(clean); this._styles.set(id, s); }
      return s;
    }
    styleWith(base, patch) { return this.style(Object.assign({}, base || {}, patch)); }

    // ------------------------------------------------------------ hojas
    sheetByName(name) {
      if (!this._byName) { this._byName = new Map(); for (const s of this.sheets) this._byName.set(s.name.toLowerCase(), s); }
      return this._byName.get(String(name).toLowerCase()) || null;
    }
    sheetById(id) { return this.sheets.find((s) => s.id === id) || null; }
    uniqueSheetName(base) {
      base = base || 'Hoja';
      for (let i = 1; ; i++) { const n = base + i; if (!this.sheetByName(n)) return n; }
    }
    addSheet(name, index) {
      this.begin('Insertar hoja');
      const sh = new Sheet(this, name && !this.sheetByName(name) ? name : this.uniqueSheetName(name ? name + ' ' : 'Hoja'));
      const at = index == null ? this.sheets.length : index;
      const doIt = () => { this.sheets.splice(at, 0, sh); this._byName = null; };
      doIt();
      this._tx.structural = true;
      this._log(() => { this.sheets.splice(this.sheets.indexOf(sh), 1); this._byName = null; this.active = Math.min(this.active, this.sheets.length - 1); }, doIt);
      this.commit();
      return sh;
    }
    removeSheet(sh) {
      if (this.sheets.length < 2) return false;
      this.begin('Eliminar hoja');
      const at = this.sheets.indexOf(sh);
      const doIt = () => { this.sheets.splice(this.sheets.indexOf(sh), 1); this._byName = null; this.active = Math.min(this.active, this.sheets.length - 1); };
      doIt();
      this._tx.structural = true;
      this._log(() => { this.sheets.splice(at, 0, sh); this._byName = null; }, doIt);
      this._rebuildAll();
      this.commit();
      return true;
    }
    moveSheet(sh, to) {
      const from = this.sheets.indexOf(sh);
      to = HC.clamp(to, 0, this.sheets.length - 1);
      if (from === to) return;
      this.begin('Mover hoja');
      const cur = this.sheet;
      const mv = (a, b) => { const s = this.sheets.splice(a, 1)[0]; this.sheets.splice(b, 0, s); this.active = this.sheets.indexOf(cur); };
      mv(from, to);
      this._log(() => mv(to, from), () => mv(from, to));
      this.commit();
    }
    renameSheet(sh, name) {
      name = String(name).trim().slice(0, 31);
      if (!name || /[\\/?*\[\]:]/.test(name)) return 'El nombre no puede estar vacío ni contener \\ / ? * [ ] :';
      const other = this.sheetByName(name);
      if (other && other !== sh) return 'Ya existe una hoja con ese nombre.';
      if (name === sh.name) return null;
      this.begin('Cambiar nombre de hoja');
      const old = sh.name, before = this._metaSnap();
      const lowOld = old.toLowerCase();
      const changes = this._rewriteAll((t) => { if (t.sheet != null && t.sheet.toLowerCase() === lowOld) { t.sheet = name; return t; } return undefined; });
      sh.name = name; this._byName = null;
      const after = this._metaSnap();
      this._tx.structural = true;
      this._log(
        () => { sh.name = old; this._byName = null; this._applyChanges(changes, 3); this._metaRestore(before); },
        () => { sh.name = name; this._byName = null; this._applyChanges(changes, 4); this._metaRestore(after); });
      this._rebuildAll();
      this.commit();
      return null;
    }
    duplicateSheet(sh) {
      this.begin('Duplicar hoja');
      const data = this._sheetToJSON(sh, (s) => s);
      const copy = this.addSheet(this.uniqueSheetName(sh.name + ' copia '), this.sheets.indexOf(sh) + 1);
      this._sheetFromJSON(copy, data, (s) => s);
      const low = sh.name.toLowerCase();
      copy.charts = copy.charts.map((c) => Object.assign({}, c, {
        id: HC.uid('g'),
        range: c.range ? HC.rewriteRefs(c.range, (t) => { if (t.sheet != null && t.sheet.toLowerCase() === low) { t.sheet = copy.name; return t; } return undefined; }) : c.range,
      }));
      this._tx.structural = true;
      this._rebuildAll();
      this.commit();
      return copy;
    }

    // ------------------------------------------------------------ transacciones y deshacer
    begin(label) {
      if (this._tx) { this._tx.depth++; return; }
      this._tx = { label: label || '', ops: [], depth: 1, structural: false, sel: this.selSnapshot ? this.selSnapshot() : null };
    }
    commit() {
      const tx = this._tx;
      if (!tx || --tx.depth > 0) return;
      this._tx = null;
      this.recalc();
      if (tx.ops.length) {
        tx.selAfter = this.selSnapshot ? this.selSnapshot() : null;
        this.undoStack.push(tx);
        if (this.undoStack.length > 200) this.undoStack.shift();
        this.redoStack.length = 0;
        this.modified = true;
        this.emit('change', tx);
      } else this.emit('recalc');
    }
    _log(undo, redo) { if (this._tx && !this._replay) this._tx.ops.push({ undo, redo }); }
    _applyOp(op, undo) {
      if (Array.isArray(op)) {
        if (op[0] === 'c') { if (undo) this._setContent(op[1], op[2], op[3], op[4], op[5]); else this._setContent(op[1], op[2], op[3], op[6], op[7]); }
        else this._setStyleRaw(op[1], op[2], op[3], undo ? op[4] : op[5]);
      } else if (undo) op.undo(); else op.redo();
    }
    undo() {
      const tx = this.undoStack.pop();
      if (!tx) return null;
      this._replay = true;
      try { for (let i = tx.ops.length - 1; i >= 0; i--) this._applyOp(tx.ops[i], true); } finally { this._replay = false; }
      this.redoStack.push(tx);
      if (tx.structural) this._rebuildAll();
      this.recalc(); this.modified = true;
      this.emit('change', tx);
      return tx;
    }
    redo() {
      const tx = this.redoStack.pop();
      if (!tx) return null;
      this._replay = true;
      try { for (const op of tx.ops) this._applyOp(op, false); } finally { this._replay = false; }
      this.undoStack.push(tx);
      if (tx.structural) this._rebuildAll();
      this.recalc(); this.modified = true;
      this.emit('change', tx);
      return tx;
    }

    // ------------------------------------------------------------ contenido de celdas
    _gc(sh, r, c) {
      const row = sh.rows[r]; if (!row) return;
      const cell = row[c];
      if (cell && cell.f == null && cell.v == null && !cell.s && !cell.note && !cell.g) delete row[c];
    }
    _setContent(sh, r, c, f, v) {
      let cell = sh.get(r, c);
      const empty = f == null && v == null;
      if (!cell) { if (empty) return; cell = sh.cell(r, c); }
      if (cell.g) {
        if (empty) return;
        const anchor = cell.g;
        cell.g = null; cell.v = null;
        this._markDirty(anchor);
      }
      if (cell.f != null) this._unregister(cell);
      if (cell.sp) { const o = cell.sp; this._clearSpill(cell); this._markRect(sh, r, c, r + o.rows - 1, c + o.cols - 1); }
      this.blocked.delete(cell);
      cell.ast = undefined;
      if (f != null) {
        cell.f = f; cell.d = false;
        this._register(cell);
        this._markDirty(cell);
      } else {
        cell.f = undefined; cell.v = v; cell.d = false;
        this.dirty.delete(cell);
        this._markDeps(sh, r, c);
        if (empty) {
          if (this.blocked.size) for (const b of Array.from(this.blocked)) this._markDirty(b);
          this._gc(sh, r, c);
        }
      }
    }
    _put(sh, r, c, f, v) {
      const cell = sh.get(r, c);
      let of, ov = null;
      if (cell && !cell.g) { of = cell.f == null ? undefined : cell.f; if (of === undefined) ov = cell.v; }
      if (f == null) f = undefined; else v = null;
      if (v === undefined) v = null;
      if (f === of && (f !== undefined || v === ov)) return false;
      this._setContent(sh, r, c, f, v);
      if (this._tx && !this._replay) this._tx.ops.push(['c', sh, r, c, of, ov, f, v]);
      return true;
    }
    _setStyleRaw(sh, r, c, s) {
      if (s) sh.cell(r, c).s = s;
      else { const cell = sh.get(r, c); if (cell) { cell.s = undefined; this._gc(sh, r, c); } }
    }
    _putStyle(sh, r, c, s) {
      const cell = sh.get(r, c), old = (cell && cell.s) || null;
      s = s || null;
      if (old === s) return;
      this._setStyleRaw(sh, r, c, s);
      if (this._tx && !this._replay) this._tx.ops.push(['s', sh, r, c, old, s]);
    }
    setCellValue(sh, r, c, v) { this.begin('Editar celda'); this._put(sh, r, c, undefined, v); this.commit(); }
    setCellFormula(sh, r, c, f) { this.begin('Editar celda'); this._put(sh, r, c, f, null); this.commit(); }
    setNote(sh, r, c, text) {
      const cell = sh.get(r, c), old = (cell && cell.note) || null;
      text = text || null;
      if (old === text) return;
      this.begin('Nota');
      const set = (t) => { if (t) sh.cell(r, c).note = t; else { const x = sh.get(r, c); if (x) { x.note = undefined; this._gc(sh, r, c); } } };
      set(text);
      this._log(() => set(old), () => set(text));
      this.commit();
    }
    // Lo que el usuario escribe en una celda (texto local): fórmula, número, fecha, texto…
    setCellInput(sh, r, c, text) {
      this.begin('Editar celda');
      const st = sh.styleAt(r, c), nf = st && st.nf;
      if (text.length > 1 && text[0] === '=') {
        const f = HC.canonicalizeFormula(text.slice(1));
        this._put(sh, r, c, f, null);
        if (!nf || /^general$/i.test(nf)) { const auto = this._inferFormat(sh, f); if (auto) this._putStyle(sh, r, c, this.styleWith(st, { nf: auto })); }
      } else if (nf && HC.fmt.isText(nf)) this._put(sh, r, c, undefined, text === '' ? null : text);
      else {
        const p = HC.parseInput(text);
        let v = p.v;
        if (typeof v === 'number' && nf && HC.fmt.kind(nf) === 'percent' && !p.nf) v = v / 100;
        this._put(sh, r, c, undefined, v);
        if (p.nf && (!nf || /^general$/i.test(nf))) this._putStyle(sh, r, c, this.styleWith(st, { nf: p.nf }));
      }
      this.commit();
    }
    _inferFormat(sh, f) {
      const p = HC.parseFormula(f);
      if (p.err) return null;
      const n = p.ast;
      if (n.t === 'fn') {
        if (/^(TODAY|DATE|EDATE|EOMONTH|WORKDAY|WORKDAY\.INTL|DATEVALUE)$/.test(n.n)) return 'dd/mm/yyyy';
        if (n.n === 'NOW') return 'dd/mm/yyyy hh:mm';
        if (n.n === 'TIME' || n.n === 'TIMEVALUE') return 'hh:mm:ss';
      }
      const carry = n.t === 'ref' || (n.t === 'bin' && '+-*'.indexOf(n.op) >= 0) || (n.t === 'fn' && /^(SUM|AVERAGE|MAX|MIN|MEDIAN|SUBTOTAL|SUMIF|SUMIFS|AVERAGEIF|AVERAGEIFS|MAXIFS|MINIFS|ROUND|ROUNDUP|ROUNDDOWN|ABS|IF|IFERROR|VLOOKUP|XLOOKUP|INDEX)$/.test(n.n));
      if (!carry) return null;
      const ref = HC.analyze(n).refs[0];
      if (!ref) return null;
      const src = ref.sheet != null ? this.sheetByName(ref.sheet) : sh;
      if (!src) return null;
      const st = src.styleAt(ref.r1, ref.c1), k = st && st.nf ? HC.fmt.kind(st.nf) : 'general';
      if (k === 'currency') return st.nf;
      if (n.t === 'bin' && n.op === '*') return null;
      if (k === 'date' || k === 'time') return n.t === 'bin' && n.op === '-' && n.r.t === 'ref' ? null : st.nf;
      if (k === 'percent' && n.t !== 'bin') return st.nf;
      return null;
    }
    // Texto para editar una celda (fórmula localizada o valor)
    editText(sh, r, c) {
      const cell = sh.get(r, c);
      if (!cell) return '';
      if (cell.f != null) return '=' + HC.localizeFormula(cell.f);
      if (cell.g) return '';
      const st = sh.styleAt(r, c);
      if (typeof cell.v === 'string') {
        const p = HC.parseInput(cell.v);
        return (typeof p.v !== 'string' || cell.v[0] === "'" || cell.v[0] === '=') && !(st && st.nf && HC.fmt.isText(st.nf)) ? "'" + cell.v : cell.v;
      }
      return HC.fmt.editText(cell.v, st && st.nf);
    }

    // ------------------------------------------------------------ dependencias
    _nameRefs(names) {
      const refs = [], seen = new Set(); let vol = false;
      const walk = (list) => {
        for (const nm of list) {
          if (seen.has(nm)) continue; seen.add(nm);
          const def = this.names.get(nm); if (!def) continue;
          const p = HC.parseFormula(def.f); if (p.err) continue;
          const info = HC.analyze(p.ast), home = def.sheet ? this.sheetByName(def.sheet) : null;
          for (const n of info.refs) refs.push(home && n.sheet == null ? Object.assign({}, n, { _sh: home }) : n);
          if (info.volatile) vol = true;
          walk(info.names);
        }
      };
      walk(names);
      return { refs, vol };
    }
    _register(cell) {
      const p = HC.parseFormula(cell.f);
      if (p.err) { cell.ast = null; cell.deps = null; return; }
      cell.ast = p.ast;
      const info = HC.analyze(p.ast);
      let refs = info.refs, vol = info.volatile;
      if (info.names.length && this.names.size) { const ex = this._nameRefs(info.names); if (ex.refs.length) refs = refs.concat(ex.refs); vol = vol || ex.vol; }
      const deps = (cell.deps = []);
      for (const n of refs) {
        const sh = n.sheet != null ? this.sheetByName(n.sheet) : n._sh || cell.sh;
        if (!sh) continue;
        const r2 = n.spill ? n.r1 : n.r2, c2 = n.spill ? n.c1 : n.c2;
        if ((r2 - n.r1 + 1) * (c2 - n.c1 + 1) <= 8) {
          for (let r = n.r1; r <= r2; r++) for (let c = n.c1; c <= c2; c++) {
            const k = r * KEY + c;
            let s = sh.depCells.get(k);
            if (!s) sh.depCells.set(k, (s = new Set()));
            s.add(cell); deps.push(sh, k);
          }
        } else {
          const k = n.r1 + ',' + n.c1 + ',' + r2 + ',' + c2;
          let e = sh.depRanges.get(k);
          if (!e) sh.depRanges.set(k, (e = { r1: n.r1, c1: n.c1, r2, c2, cells: new Set() }));
          e.cells.add(cell); deps.push(sh, k);
        }
      }
      if (vol) this.volatile.add(cell);
    }
    _unregister(cell) {
      const d = cell.deps;
      if (d) for (let i = 0; i < d.length; i += 2) {
        const sh = d[i], k = d[i + 1];
        if (typeof k === 'number') { const s = sh.depCells.get(k); if (s) { s.delete(cell); if (!s.size) sh.depCells.delete(k); } }
        else { const e = sh.depRanges.get(k); if (e) { e.cells.delete(cell); if (!e.cells.size) sh.depRanges.delete(k); } }
      }
      cell.deps = null;
      this.volatile.delete(cell);
    }
    _eachDep(sh, r, c, cb) {
      const s = sh.depCells.get(r * KEY + c);
      if (s) for (const x of s) cb(x);
      if (sh.depRanges.size) for (const e of sh.depRanges.values()) if (r >= e.r1 && r <= e.r2 && c >= e.c1 && c <= e.c2) for (const x of e.cells) cb(x);
    }
    _markDirty(cell) {
      const stack = [cell], dirty = this.dirty;
      while (stack.length) {
        const x = stack.pop();
        if (x.d) continue;
        x.d = true; dirty.delete(x); dirty.add(x);
        this._eachDep(x.sh, x.r, x.c, (y) => { if (!y.d) stack.push(y); });
      }
    }
    _markDeps(sh, r, c) { this._eachDep(sh, r, c, (y) => { if (!y.d) this._markDirty(y); }); }
    _markRect(sh, r1, c1, r2, c2) {
      if (!sh.depCells.size && !sh.depRanges.size) return;
      const hit = [];
      if (sh.depCells.size) {
        if ((r2 - r1 + 1) * (c2 - c1 + 1) <= sh.depCells.size * 2) {
          for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) { const s = sh.depCells.get(r * KEY + c); if (s) for (const x of s) hit.push(x); }
        } else for (const [k, s] of sh.depCells) { const r = Math.floor(k / KEY), c = k % KEY; if (r >= r1 && r <= r2 && c >= c1 && c <= c2) for (const x of s) hit.push(x); }
      }
      for (const e of sh.depRanges.values()) if (e.r1 <= r2 && e.r2 >= r1 && e.c1 <= c2 && e.c2 >= c1) for (const x of e.cells) hit.push(x);
      for (const x of hit) if (!x.d) this._markDirty(x);
    }
    markAllDirty() {
      for (const sh of this.sheets) sh.rows.forEach((row) => { if (row) row.forEach((cell) => { if (cell && cell.f != null && !cell.d) { cell.d = true; this.dirty.add(cell); } }); });
    }

    // ------------------------------------------------------------ recálculo
    recalc() {
      if (this._inRecalc) return;
      this._inRecalc = true; this.pass++;
      const evaluateDirty = () => {
        for (const cell of this.dirty) {
          if (cell.d && cell.f != null) this._evalTop(cell); else cell.d = false;
        }
        this.dirty.clear();
      };
      try {
        for (const c of this.volatile) this._markDirty(c);
        evaluateDirty();
        if (this.refreshFilters && this.refreshFilters()) {
          // Las fórmulas de subtotal dependen de la visibilidad además del contenido de las celdas.
          for (const sh of this.sheets) sh.rows.forEach((row) => {
            if (row) row.forEach((cell) => {
              if (cell && cell.f && /\b(SUBTOTAL|AGGREGATE)\s*\(/i.test(cell.f)) this._markDirty(cell);
            });
          });
          evaluateDirty();
        }
      } finally { this.dirty.clear(); this._inRecalc = false; }
      this.gen++;
    }
    _evalTop(cell) {
      const stack = [cell];
      while (stack.length) {
        const c = stack[stack.length - 1];
        if (!c.d) { stack.pop(); continue; }
        this._depth = 0;
        try { this._evalCell(c); stack.pop(); } catch (e) {
          if (e !== DEFER) throw e;
          stack.push(this._deferred);
        }
      }
    }
    _evalCell(cell) {
      if (cell.ep !== this.pass) { cell.ep = this.pass; cell.ec = 0; }
      if (++cell.ec > 50) { cell.d = false; this._store(cell, E.CIRC, true); return; }
      let v;
      if (!cell.ast) v = E.SYNTAX;
      else {
        cell.cp = true; this._depth++;
        try {
          v = HC.evaluate(cell.ast, { wb: this, sheet: cell.sh, r: cell.r, c: cell.c, vars: null });
          v = this._normalize(v);
        } catch (e) {
          if (e === DEFER) throw e;
          if (!(e instanceof RangeError) && typeof console !== 'undefined') console.error('Error al evaluar ' + cell.sh.name + '!' + HC.addr(cell.r, cell.c), e);
          v = e instanceof RangeError ? E.CIRC : E.VALUE;
        } finally { cell.cp = false; this._depth--; }
      }
      cell.d = false;
      this._store(cell, v, false);
    }
    _normalize(v) {
      if (v instanceof HC.Ref) v = v.single ? v.val(0, 0) : v.toArray();
      if (v instanceof HC.Lambda) return E.CALC;
      if (Array.isArray(v)) {
        if (!v.length || !v[0].length) return E.CALC;
        if (v.length === 1 && v[0].length === 1) v = v[0][0]; else return v;
      }
      if (v == null) return 0;
      if (typeof v === 'number' && !isFinite(v)) return E.NUM;
      return v;
    }
    // Valor de una celda durante la evaluación (calcula antes las fórmulas pendientes).
    cellValue(sh, r, c) {
      const row = sh.rows[r];
      if (!row) return null;
      let cell = row[c];
      if (!cell) return null;
      if (cell.g) {
        const a = cell.g;
        if (a.d) {
          if (a.cp) return E.CIRC;
          this._need(a);
          cell = sh.rows[r] && sh.rows[r][c];
          if (!cell) return null;
        }
        return cell.v;
      }
      if (cell.d) { if (cell.cp) return E.CIRC; this._need(cell); }
      return cell.v;
    }
    _need(cell) {
      if (this._depth > 220) { this._deferred = cell; throw DEFER; }
      this._evalCell(cell);
    }
    _clearSpill(cell) {
      const sp = cell.sp, sh = cell.sh;
      if (!sp) return;
      for (let i = 0; i < sp.rows; i++) {
        const row = sh.rows[cell.r + i]; if (!row) continue;
        for (let j = 0; j < sp.cols; j++) {
          const x = row[cell.c + j];
          if (x && x.g === cell) { x.g = null; x.v = null; if (!x.s && !x.note) delete row[cell.c + j]; }
        }
      }
      cell.sp = null;
    }
    _store(cell, v, quiet) {
      const sh = cell.sh, old = cell.sp;
      if (Array.isArray(v)) {
        const R = v.length, C = v[0].length;
        let blocked = cell.r + R > MAXR || cell.c + C > MAXC;
        if (!blocked) {
          scan: for (let i = 0; i < R; i++) {
            const row = sh.rows[cell.r + i]; if (!row) continue;
            for (let j = 0; j < C; j++) {
              if (!i && !j) continue;
              const x = row[cell.c + j];
              if (x && (x.f != null || (x.g ? x.g !== cell : x.v != null))) { blocked = true; break scan; }
            }
          }
          if (!blocked && sh.merges.length) blocked = sh.merges.some((g) => g.r1 <= cell.r + R - 1 && g.r2 >= cell.r && g.c1 <= cell.c + C - 1 && g.c2 >= cell.c);
        }
        if (blocked) {
          this._clearSpill(cell);
          cell.v = E.SPILL; this.blocked.add(cell);
          if (old) this._markRect(sh, cell.r, cell.c, cell.r + old.rows - 1, cell.c + old.cols - 1);
          return;
        }
        this.blocked.delete(cell);
        if (old && (old.rows > R || old.cols > C)) this._clearSpill(cell);
        for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) {
          let x = v[i][j];
          if (x == null) x = 0; else if (typeof x === 'number' && !isFinite(x)) x = E.NUM;
          if (!i && !j) { cell.v = x; continue; }
          const g = sh.cell(cell.r + i, cell.c + j);
          g.g = cell; g.v = x;
        }
        cell.sp = { rows: R, cols: C };
        this._markRect(sh, cell.r, cell.c, cell.r + Math.max(R, old ? old.rows : 0) - 1, cell.c + Math.max(C, old ? old.cols : 0) - 1);
      } else {
        if (old) { this._clearSpill(cell); if (!quiet) this._markRect(sh, cell.r, cell.c, cell.r + old.rows - 1, cell.c + old.cols - 1); }
        this.blocked.delete(cell);
        cell.v = v;
      }
    }
    // Reconstruye posiciones, dependencias y valores de todo el libro (tras cambios de estructura).
    _rebuildAll() {
      this.dirty.clear(); this.volatile.clear(); this.blocked.clear(); this._byName = null;
      const formulas = [];
      for (const sh of this.sheets) {
        sh.depCells.clear(); sh.depRanges.clear();
        let maxR = -1, maxC = -1;
        sh.rows.forEach((row, r) => {
          if (!row) return;
          let any = false;
          row.forEach((cell, c) => {
            if (!cell) return;
            cell.r = r; cell.c = c; cell.sh = sh;
            if (cell.g) { cell.g = null; cell.v = null; }
            cell.sp = null; cell.deps = null; cell.d = false; cell.cp = false;
            if (cell.f == null && cell.v == null && !cell.s && !cell.note) { delete row[c]; return; }
            any = true;
            if (c > maxC) maxC = c;
            if (cell.f != null) formulas.push(cell);
          });
          if (any && r > maxR) maxR = r;
        });
        sh.maxR = maxR; sh.maxC = maxC;
      }
      for (const cell of formulas) { this._register(cell); cell.d = true; this.dirty.add(cell); }
    }
    recalcAll() { this._rebuildAll(); this.recalc(); this.emit('recalc'); }

    // ------------------------------------------------------------ propiedades de hoja y tamaños
    setProp(sh, key, value) {
      const old = sh[key];
      if (old === value) return;
      this.begin('Cambiar hoja');
      sh[key] = value;
      this._log(() => { sh[key] = old; }, () => { sh[key] = value; });
      this.commit();
    }
    setSize(sh, axis, index, size) {
      const ax = axis === 'row' ? sh.rowH : sh.colW, old = ax.sizes.get(index);
      const val = size == null ? undefined : Math.round(size);
      if (old === val) return;
      this.begin('Cambiar tamaño');
      ax.set(index, val);
      this._log(() => ax.set(index, old), () => ax.set(index, val));
      this.commit();
    }
    setHidden(sh, axis, i1, i2, hidden) {
      const ax = axis === 'row' ? sh.rowH : sh.colW;
      this.begin(hidden ? 'Ocultar' : 'Mostrar');
      for (let i = i1; i <= i2; i++) {
        if (ax.hidden.has(i) === hidden) continue;
        ax.setHidden(i, hidden);
        const k = i;
        this._log(() => ax.setHidden(k, !hidden), () => ax.setHidden(k, hidden));
      }
      this.commit();
    }
    setName(name, f, sheetName) {
      const up = name.toUpperCase(), old = this.names.get(up);
      this.begin('Definir nombre');
      const set = (d) => { if (d) this.names.set(up, d); else this.names.delete(up); };
      const def = f == null ? null : { name, f, sheet: sheetName || null };
      set(def);
      this._tx.structural = true;
      this._log(() => set(old), () => set(def));
      this._rebuildAll();
      this.commit();
    }
    static validName(name) {
      if (!/^[\p{L}_][\p{L}\p{N}_.]*$/u.test(name)) return false;
      if (/^[A-Za-z]{1,3}\d{1,7}$/.test(name) || /^(TRUE|FALSE|VERDADERO|FALSO)$/i.test(name)) return false;
      return true;
    }

    // ------------------------------------------------------------ estructura: insertar y eliminar filas/columnas
    _metaSnap() {
      return {
        names: new Map(this.names),
        sheets: this.sheets.map((sh) => ({
          sh, merges: sh.merges, condFmts: sh.condFmts, validations: sh.validations, filter: sh.filter, charts: sh.charts,
          frozenRows: sh.frozenRows, frozenCols: sh.frozenCols, rowH: sh.rowH.export(), colW: sh.colW.export(),
          rowStyle: sh.rowStyle.slice(), colStyle: sh.colStyle.slice(), defStyle: sh.defStyle,
        })),
      };
    }
    _metaRestore(snap) {
      this.names = new Map(snap.names);
      for (const m of snap.sheets) {
        const sh = m.sh;
        sh.merges = m.merges; sh.condFmts = m.condFmts; sh.validations = m.validations; sh.filter = m.filter; sh.charts = m.charts;
        sh.frozenRows = m.frozenRows; sh.frozenCols = m.frozenCols; sh.rowH.import(m.rowH); sh.colW.import(m.colW);
        sh.rowStyle = m.rowStyle.slice(); sh.colStyle = m.colStyle.slice(); sh.defStyle = m.defStyle;
      }
    }
    // Reescribe las referencias de todas las fórmulas, nombres, gráficas y reglas. cb(tok, hojaDeLaFórmula)
    _rewriteAll(cb) {
      const changes = [];
      for (const sh of this.sheets) {
        const fn = (t) => cb(t, sh);
        sh.rows.forEach((row, r) => {
          if (!row) return;
          row.forEach((cell, c) => {
            if (!cell || cell.f == null) return;
            const nf = HC.rewriteRefs(cell.f, fn);
            if (nf !== cell.f) { changes.push([sh, r, c, cell.f, nf]); cell.f = nf; }
          });
        });
        const txt = (s) => (typeof s === 'string' && s ? HC.rewriteRefs(s, fn) : s);
        sh.charts = sh.charts.map((ch) => {
          const range = txt(ch.range);
          return range === ch.range ? ch : Object.assign({}, ch, { range });
        });
        sh.condFmts = sh.condFmts.map((cf) => (cf.formula ? Object.assign({}, cf, { formula: txt(cf.formula) }) : cf));
        sh.validations = sh.validations.map((v) => (v.source && /[!:$]|^[A-Za-z]{1,3}\d/.test(v.source) && v.type === 'list' && v.isRange ? Object.assign({}, v, { source: txt(v.source) }) : v));
      }
      const names = new Map();
      for (const [k, d] of this.names) {
        const home = d.sheet ? this.sheetByName(d.sheet) : null;
        const nf = HC.rewriteRefs(d.f, (t) => cb(t, home));
        names.set(k, nf === d.f ? d : Object.assign({}, d, { f: nf }));
      }
      this.names = names;
      return changes;
    }
    // Aplica (k = 4) o revierte (k = 3) los cambios de texto de fórmula devueltos por _rewriteAll.
    _applyChanges(changes, k) {
      for (const ch of changes) { const cell = ch[0].get(ch[1], ch[2]); if (cell) cell.f = ch[k]; }
    }
    _struct(sh, axis, at, n, insert) {
      const isRow = axis === 'row', max = isRow ? MAXR : MAXC;
      if (n < 1 || at < 0 || at >= max) return;
      this.begin((insert ? 'Insertar ' : 'Eliminar ') + (isRow ? 'filas' : 'columnas'));
      const before = this._metaSnap();
      const b = at + n - 1;
      // 1. celdas (las matrices son dispersas: se conservan los huecos)
      const spliceIn = (arr, k, cnt) => {
        if (arr.length <= k) return;
        const tail = arr.splice(k);
        arr.length = k + cnt + tail.length;
        tail.forEach((x, i) => { arr[k + cnt + i] = x; });
      };
      const moveCells = (ins) => { // ins: abre hueco; si no, quita y devuelve lo quitado
        if (isRow) { if (ins) { spliceIn(sh.rows, at, n); return null; } return sh.rows.length > at ? sh.rows.splice(at, n) : []; }
        const out = [];
        sh.rows.forEach((row, r) => { if (!row) return; if (ins) spliceIn(row, at, n); else if (row.length > at) out[r] = row.splice(at, n); });
        return ins ? null : out;
      };
      const putBack = (saved) => { // tras abrir hueco, recoloca lo que se había eliminado
        if (isRow) saved.forEach((row, i) => { sh.rows[at + i] = row; });
        else saved.forEach((cells, r) => { const row = sh.rows[r] || (sh.rows[r] = []); cells.forEach((cell, i) => { row[at + i] = cell; }); });
      };
      let removed = moveCells(insert);
      // 2. metadatos de la hoja
      const adj = (g) => {
        let a1 = isRow ? g.r1 : g.c1, a2 = isRow ? g.r2 : g.c2;
        if (a1 === 0 && a2 >= max - 1) return g;
        if (insert) { if (a1 >= at) a1 += n; if (a2 >= at) a2 += n; if (a2 >= max) a2 = max - 1; if (a1 >= max) return null; }
        else {
          if (a1 >= at && a2 <= b) return null;
          a1 = a1 < at ? a1 : a1 > b ? a1 - n : at;
          a2 = a2 < at ? a2 : a2 > b ? a2 - n : at - 1;
          if (a1 > a2) return null;
        }
        return isRow ? { r1: a1, c1: g.c1, r2: a2, c2: g.c2 } : { r1: g.r1, c1: a1, r2: g.r2, c2: a2 };
      };
      const adjList = (list) => list.map(adj).filter(Boolean);
      sh.merges = adjList(sh.merges).filter((g) => g.r1 !== g.r2 || g.c1 !== g.c2);
      sh.condFmts = sh.condFmts.map((cf) => Object.assign({}, cf, { ranges: adjList(cf.ranges) })).filter((cf) => cf.ranges.length);
      sh.validations = sh.validations.map((v) => Object.assign({}, v, { ranges: adjList(v.ranges) })).filter((v) => v.ranges.length);
      if (sh.filter) {
        const f = sh.filter, g = adj(f.range);
        if (!g || (!insert && isRow && f.range.r1 >= at && f.range.r1 <= b)) sh.filter = null;
        else if (isRow) sh.filter = { ...f, range: g };
        else {
          const cols = {};
          for (const [offset, spec] of Object.entries(f.cols || {})) {
            const c = f.range.c1 + Number(offset);
            if (!insert && c >= at && c <= b) continue;
            const moved = c < at ? c : c + (insert ? n : -n);
            if (moved >= g.c1 && moved <= g.c2) cols[moved - g.c1] = spec;
          }
          sh.filter = { ...f, range: g, cols };
        }
      }
      const ax = isRow ? sh.rowH : sh.colW;
      ax.shift(at, insert ? n : -n);
      const stKey = isRow ? 'rowStyle' : 'colStyle', styles = sh[stKey].slice();
      if (insert) spliceIn(styles, at, n); else if (styles.length > at) styles.splice(at, n);
      sh[stKey] = styles;
      const fzKey = isRow ? 'frozenRows' : 'frozenCols';
      if (insert) { if (at < sh[fzKey]) sh[fzKey] += n; } else if (at < sh[fzKey]) sh[fzKey] -= Math.min(n, sh[fzKey] - at);
      // 3. referencias en fórmulas
      const low = sh.name.toLowerCase();
      const changes = this._rewriteAll((t, home) => {
        if (t.kind === 'err') return undefined;
        if (t.sheet != null ? t.sheet.toLowerCase() !== low : home !== sh) return undefined;
        if (t.kind === (isRow ? 'cols' : 'rows')) return undefined;
        const k = isRow ? 'r' : 'c', p1 = t.p1, p2 = t.p2;
        if (insert) {
          let ch = false;
          for (const p of [p1, p2]) if (p && p[k] >= at) { p[k] += n; ch = true; if (p[k] >= max) return '#REF!'; }
          return ch ? t : undefined;
        }
        if (!p2) { if (p1[k] >= at && p1[k] <= b) return '#REF!'; if (p1[k] > b) { p1[k] -= n; return t; } return undefined; }
        const lo = p1[k] <= p2[k] ? p1 : p2, hi = lo === p1 ? p2 : p1;
        if (lo[k] >= at && hi[k] <= b) return '#REF!';
        const nlo = lo[k] < at ? lo[k] : lo[k] > b ? lo[k] - n : at, nhi = hi[k] < at ? hi[k] : hi[k] > b ? hi[k] - n : at - 1;
        if (nlo === lo[k] && nhi === hi[k]) return undefined;
        lo[k] = nlo; hi[k] = nhi;
        return t;
      });
      // 4. las filas o columnas nuevas heredan el formato de la anterior
      const styleOps = [];
      if (insert && at > 0) {
        if (sh[stKey][at - 1]) { const st = sh[stKey].slice(); for (let i = 0; i < n; i++) st[at + i] = st[at - 1]; sh[stKey] = st; }
        if (isRow) { const src = sh.rows[at - 1]; if (src) src.forEach((cell, c) => { if (cell && cell.s) for (let i = 0; i < n; i++) styleOps.push([at + i, c, cell.s]); }); }
        else sh.rows.forEach((row, r) => { const cell = row && row[at - 1]; if (cell && cell.s) for (let i = 0; i < n; i++) styleOps.push([r, at + i, cell.s]); });
        for (const [r, c, s] of styleOps) sh.cell(r, c).s = s;
      }
      const after = this._metaSnap();
      this._tx.structural = true;
      this._log(
        () => {
          this._applyChanges(changes, 3); // con las celdas aún en su posición posterior al cambio
          if (insert) moveCells(false); else { moveCells(true); putBack(removed); }
          this._metaRestore(before);
        },
        () => {
          const rm = moveCells(insert);
          if (!insert) removed = rm;
          this._applyChanges(changes, 4);
          this._metaRestore(after);
          for (const [r, c, s] of styleOps) sh.cell(r, c).s = s;
        });
      this._rebuildAll();
      this.commit();
    }
    insertRows(sh, at, n) { this._struct(sh, 'row', at, n, true); }
    deleteRows(sh, at, n) { this._struct(sh, 'row', at, n, false); }
    insertCols(sh, at, n) { this._struct(sh, 'col', at, n, true); }
    deleteCols(sh, at, n) { this._struct(sh, 'col', at, n, false); }

    // ------------------------------------------------------------ guardar y cargar (JSON)
    _sheetToJSON(sh, styleId) {
      const cells = [];
      sh.rows.forEach((row, r) => {
        if (!row) return;
        row.forEach((cell, c) => {
          if (!cell) return;
          const own = cell.f == null && !cell.g ? cell.v : null;
          const v = own instanceof HC.FErr ? { e: own.code } : own;
          const rec = [r, c, v == null ? null : v, cell.f == null ? 0 : cell.f, cell.s ? styleId(cell.s) : 0, cell.note || 0];
          while (rec.length > 3 && rec[rec.length - 1] === 0) rec.pop();
          if (rec.length > 3 || rec[2] !== null) cells.push(rec);
        });
      });
      const sparse = (arr) => { const o = []; arr.forEach((s, i) => { if (s) o.push([i, styleId(s)]); }); return o; };
      return {
        name: sh.name, cells, rowH: sh.rowH.export(), colW: sh.colW.export(), rowStyle: sparse(sh.rowStyle), colStyle: sparse(sh.colStyle), defStyle: sh.defStyle ? styleId(sh.defStyle) : 0,
        merges: sh.merges, frozenRows: sh.frozenRows, frozenCols: sh.frozenCols, showGrid: sh.showGrid, tabColor: sh.tabColor,
        filter: sh.filter, condFmts: sh.condFmts, validations: sh.validations, charts: sh.charts,
      };
    }
    _sheetFromJSON(sh, d, styleOf) {
      sh.rows = []; sh.maxR = -1; sh.maxC = -1;
      for (const rec of d.cells || []) {
        const cell = sh.cell(rec[0], rec[1]);
        const v = rec[2];
        if (rec[3]) cell.f = rec[3]; else cell.v = v && typeof v === 'object' ? HC.errByCode(v.e) || E.VALUE : v == null ? null : v;
        if (rec[4]) cell.s = styleOf(rec[4]);
        if (rec[5]) cell.note = rec[5];
      }
      if (d.rowH) sh.rowH.import(d.rowH);
      if (d.colW) sh.colW.import(d.colW);
      sh.rowStyle = []; sh.colStyle = [];
      for (const [i, s] of d.rowStyle || []) sh.rowStyle[i] = styleOf(s);
      for (const [i, s] of d.colStyle || []) sh.colStyle[i] = styleOf(s);
      sh.defStyle = d.defStyle ? styleOf(d.defStyle) : null;
      sh.merges = clone(d.merges) || []; sh.frozenRows = d.frozenRows || 0; sh.frozenCols = d.frozenCols || 0;
      sh.showGrid = d.showGrid !== false; sh.tabColor = d.tabColor || null;
      sh.filter = clone(d.filter) || null; sh.condFmts = clone(d.condFmts) || []; sh.validations = clone(d.validations) || []; sh.charts = clone(d.charts) || [];
    }
    toJSON() {
      const styles = [], ids = new Map();
      const styleId = (s) => { let i = ids.get(s); if (!i) { styles.push(s); i = styles.length; ids.set(s, i); } return i; };
      const sheets = this.sheets.map((sh) => this._sheetToJSON(sh, styleId));
      return { app: 'hoja-de-calculo', version: 1, title: this.title, active: this.active, sheets, styles, names: Array.from(this.names.values()) };
    }
    static fromJSON(data) {
      const wb = new Workbook();
      if (!data || !Array.isArray(data.sheets) || !data.sheets.length) throw new Error('El archivo no contiene un libro válido.');
      wb.title = data.title || wb.title;
      const styles = (data.styles || []).map((s) => wb.style(s));
      const styleOf = (i) => styles[i - 1] || null;
      for (const d of data.sheets) {
        const sh = new Sheet(wb, String(d.name || wb.uniqueSheetName()));
        wb.sheets.push(sh); wb._byName = null;
        wb._sheetFromJSON(sh, d, styleOf);
      }
      for (const n of data.names || []) if (n && n.name && n.f != null) wb.names.set(n.name.toUpperCase(), { name: n.name, f: n.f, sheet: n.sheet || null });
      wb.active = HC.clamp(data.active || 0, 0, wb.sheets.length - 1);
      wb._rebuildAll(); wb.recalc();
      data.sheets.forEach((d, i) => {
        if (!d.restoreFilterRows) return;
        const axis = wb.sheets[i].rowH;
        // Excel usa el mismo indicador de fila oculta para el autofiltro.
        for (const r of axis.filtered) axis.hidden.delete(r);
        axis.touch();
      });
      return wb;
    }
    static blank() {
      const wb = new Workbook();
      wb.sheets.push(new Sheet(wb, 'Hoja1'));
      return wb;
    }
  }
  HC.Workbook = Workbook;
})(typeof window !== 'undefined' ? window : globalThis);
