/* Evaluador de fórmulas: referencias, conversión de tipos, operadores con matrices y registro de funciones. */
(function (root) {
  'use strict';
  const HC = root.HC;
  const E = HC.E, FErr = HC.FErr;
  const isArr = Array.isArray;

  // ---------------------------------------------------------------- referencias a rangos
  class Ref {
    constructor(sheet, r1, c1, r2, c2) { this.sheet = sheet; this.r1 = r1; this.c1 = c1; this.r2 = r2; this.c2 = c2; }
    get rows() { return this.r2 - this.r1 + 1; }
    get cols() { return this.c2 - this.c1 + 1; }
    get single() { return this.r1 === this.r2 && this.c1 === this.c2; }
    val(i, j) { return this.sheet.wb.cellValue(this.sheet, this.r1 + (i || 0), this.c1 + (j || 0)); }
    // Fin del rango recortado al área con datos (así A:A no recorre un millón de filas).
    bounds() {
      const s = this.sheet;
      return { r2: Math.min(this.r2, Math.max(s.maxR, this.r1)), c2: Math.min(this.c2, Math.max(s.maxC, this.c1)) };
    }
    // Recorre solo las celdas con contenido: cb(valor, i, j). Si cb devuelve false, se detiene.
    each(cb) {
      const s = this.sheet, wb = s.wb, b = this.bounds(), rows = s.rows;
      for (let r = this.r1; r <= b.r2; r++) {
        const row = rows[r];
        if (!row) continue;
        const cEnd = Math.min(b.c2, row.length - 1);
        for (let c = this.c1; c <= cEnd; c++) {
          const cell = row[c];
          if (!cell) continue;
          const v = cell.d || (cell.g && cell.g.d) ? wb.cellValue(s, r, c) : cell.v;
          if (v != null && cb(v, r - this.r1, c - this.c1) === false) return;
        }
      }
    }
    toArray() {
      const b = this.bounds();
      const R = b.r2 - this.r1 + 1, C = b.c2 - this.c1 + 1;
      const out = new Array(R);
      for (let i = 0; i < R; i++) { const a = (out[i] = new Array(C)); for (let j = 0; j < C; j++) a[j] = null; }
      this.each((v, i, j) => { out[i][j] = v; });
      return out;
    }
  }

  class Lambda {
    constructor(params, body, ctx) { this.params = params; this.body = body; this.ctx = ctx; }
    invoke(args) {
      if (args.length > this.params.length) return E.VALUE;
      const map = Object.create(null);
      this.params.forEach((p, i) => { map[p] = i < args.length ? args[i] : undefined; });
      return ev(this.body, Object.assign({}, this.ctx, { vars: { parent: this.ctx.vars, map } }));
    }
  }

  // ---------------------------------------------------------------- conversiones
  function toNum(v) {
    if (typeof v === 'number') return v;
    if (v == null) return 0;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'string') { const n = HC.textToNumber(v); return n == null ? E.VALUE : n; }
    if (v instanceof FErr) return v;
    return E.VALUE;
  }
  function toStr(v) {
    if (typeof v === 'string') return v;
    if (v == null) return '';
    if (typeof v === 'number') return HC.fmt.numToText(v);
    if (typeof v === 'boolean') return HC.boolText(v);
    if (v instanceof FErr) return v;
    return E.VALUE;
  }
  function toBool(v) {
    if (typeof v === 'boolean') return v;
    if (v == null) return false;
    if (typeof v === 'number') return v !== 0;
    if (typeof v === 'string') {
      const u = v.toUpperCase();
      if (u === 'TRUE' || u === 'VERDADERO') return true;
      if (u === 'FALSE' || u === 'FALSO') return false;
      return E.VALUE;
    }
    if (v instanceof FErr) return v;
    return E.VALUE;
  }
  function deref(v) {
    if (v instanceof Ref) return v.single ? v.val(0, 0) : v.toArray();
    return v;
  }
  // Valor escalar: de una matriz o rango toma la esquina superior izquierda.
  function scalar(v) {
    if (v instanceof Ref) return v.val(0, 0);
    if (isArr(v)) return v.length && v[0].length ? v[0][0] : null;
    return v === undefined ? null : v;
  }
  function toArr(v) {
    if (v instanceof Ref) return v.toArray();
    if (isArr(v)) return v;
    return [[v === undefined ? null : v]];
  }
  function flatten(v, out) {
    out = out || [];
    if (v instanceof Ref) v = v.toArray();
    if (isArr(v)) { for (const row of v) for (const x of row) out.push(x); } else out.push(v === undefined ? null : v);
    return out;
  }
  const mapArr = (a, fn) => a.map((row) => row.map(fn));
  function mkArr(R, C, fn) {
    const out = new Array(R);
    for (let i = 0; i < R; i++) { const row = (out[i] = new Array(C)); for (let j = 0; j < C; j++) row[j] = fn(i, j); }
    return out;
  }

  // Aplica fn elemento a elemento cuando algún valor es una matriz (difusión de filas/columnas únicas).
  function liftN(vals, fn, mask) {
    let R = 0, C = 0;
    for (let k = 0; k < vals.length; k++) {
      const v = vals[k];
      if (isArr(v) && (!mask || mask[k])) { if (v.length > R) R = v.length; if (v[0].length > C) C = v[0].length; }
    }
    if (!R) return fn(vals);
    const out = new Array(R), args = new Array(vals.length);
    for (let i = 0; i < R; i++) {
      const row = (out[i] = new Array(C));
      for (let j = 0; j < C; j++) {
        for (let k = 0; k < vals.length; k++) {
          const v = vals[k];
          if (isArr(v) && (!mask || mask[k])) {
            const rr = v.length === 1 ? 0 : i, cc = v[0].length === 1 ? 0 : j;
            args[k] = rr < v.length && cc < v[rr].length ? v[rr][cc] : E.NA;
          } else args[k] = v;
        }
        let x = fn(args);
        if (x instanceof Ref || isArr(x)) x = scalar(x);
        row[j] = x === undefined ? null : x;
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- operadores
  const rank = (v) => (typeof v === 'number' ? 1 : typeof v === 'string' ? 2 : typeof v === 'boolean' ? 3 : 0);
  function cmpVals(a, b) {
    if (a == null) { if (b == null) return 0; a = typeof b === 'string' ? '' : typeof b === 'boolean' ? false : 0; }
    if (b == null) b = typeof a === 'string' ? '' : typeof a === 'boolean' ? false : 0;
    const ta = rank(a), tb = rank(b);
    if (ta !== tb) return ta < tb ? -1 : 1;
    if (ta === 1) {
      if (a === b) return 0;
      const d = a - b;
      if (Math.abs(d) <= 1e-15 * Math.max(Math.abs(a), Math.abs(b))) return 0;
      return d < 0 ? -1 : 1;
    }
    if (ta === 2) { const x = a.toLowerCase(), y = b.toLowerCase(); return x < y ? -1 : x > y ? 1 : 0; }
    return a === b ? 0 : a ? 1 : -1;
  }
  function binary(op, a, b) {
    if (a instanceof FErr) return a;
    if (b instanceof FErr) return b;
    switch (op) {
      case '&': { const x = toStr(a), y = toStr(b); return x instanceof FErr ? x : y instanceof FErr ? y : x + y; }
      case '=': return cmpVals(a, b) === 0;
      case '<>': return cmpVals(a, b) !== 0;
      case '<': return cmpVals(a, b) < 0;
      case '>': return cmpVals(a, b) > 0;
      case '<=': return cmpVals(a, b) <= 0;
      case '>=': return cmpVals(a, b) >= 0;
    }
    const x = toNum(a); if (x instanceof FErr) return x;
    const y = toNum(b); if (y instanceof FErr) return y;
    let r;
    switch (op) {
      case '+': r = x + y; if (r !== 0 && Math.abs(r) < 1e-15 * Math.max(Math.abs(x), Math.abs(y))) r = 0; break;
      case '-': r = x - y; if (r !== 0 && Math.abs(r) < 1e-15 * Math.max(Math.abs(x), Math.abs(y))) r = 0; break;
      case '*': r = x * y; break;
      case '/': if (y === 0) return E.DIV0; r = x / y; break;
      case '^': r = power(x, y); if (r instanceof FErr) return r; break;
      default: return E.VALUE;
    }
    return isFinite(r) ? r : E.NUM;
  }
  function power(x, y) {
    if (x === 0 && y === 0) return E.NUM;
    if (x === 0 && y < 0) return E.DIV0;
    let r = Math.pow(x, y);
    if (isNaN(r) && x < 0) {
      const inv = 1 / y; // raíz impar de un negativo: (-8)^(1/3) = -2
      if (Math.abs(inv - Math.round(inv)) < 1e-9 && Math.abs(Math.round(inv)) % 2 === 1) r = -Math.pow(-x, y);
    }
    return isFinite(r) ? r : E.NUM;
  }
  const neg = (v) => { if (v instanceof FErr) return v; const n = toNum(v); return n instanceof FErr ? n : -n; };
  const pct = (v) => { if (v instanceof FErr) return v; const n = toNum(v); return n instanceof FErr ? n : n / 100; };

  // ---------------------------------------------------------------- evaluación del árbol
  function evRef(n, ctx) {
    let sheet = ctx.sheet;
    if (n.sheet != null) { sheet = ctx.wb.sheetByName(n.sheet); if (!sheet) return E.REF; }
    if (n.spill) {
      ctx.wb.cellValue(sheet, n.r1, n.c1);
      const cell = sheet.get(n.r1, n.c1);
      if (cell && cell.sp) return new Ref(sheet, n.r1, n.c1, n.r1 + cell.sp.rows - 1, n.c1 + cell.sp.cols - 1);
      return new Ref(sheet, n.r1, n.c1, n.r1, n.c1);
    }
    return new Ref(sheet, n.r1, n.c1, n.r2, n.c2);
  }
  function evName(name, ctx) {
    const up = name.toUpperCase();
    for (let s = ctx.vars; s; s = s.parent) if (up in s.map) return s.map[up];
    const nm = ctx.wb.names && ctx.wb.names.get(up);
    if (!nm) return E.NAME;
    const p = HC.parseFormula(nm.f);
    if (p.err) return E.NAME;
    if ((ctx.nameDepth || 0) > 40) return E.CIRC;
    const sheet = (nm.sheet && ctx.wb.sheetByName(nm.sheet)) || ctx.sheet;
    return ev(p.ast, { wb: ctx.wb, sheet, r: ctx.r, c: ctx.c, vars: null, nameDepth: (ctx.nameDepth || 0) + 1 });
  }
  function ev(n, ctx) {
    switch (n.t) {
      case 'num': case 'str': case 'bool': case 'err': case 'arr': return n.v;
      case 'ref': return evRef(n, ctx);
      case 'name': return evName(n.v, ctx);
      case 'fn': return callFn(n, ctx);
      case 'bin': {
        const a = deref(ev(n.l, ctx)), b = deref(ev(n.r, ctx));
        if (isArr(a) || isArr(b)) { const op = n.op; return liftN([a, b], (x) => binary(op, x[0], x[1])); }
        return binary(n.op, a, b);
      }
      case 'neg': { const a = deref(ev(n.x, ctx)); return isArr(a) ? mapArr(a, neg) : neg(a); }
      case 'pct': { const a = deref(ev(n.x, ctx)); return isArr(a) ? mapArr(a, pct) : pct(a); }
      case 'rng': {
        const a = ev(n.l, ctx), b = ev(n.r, ctx);
        if (a instanceof Ref && b instanceof Ref && a.sheet === b.sheet) {
          return new Ref(a.sheet, Math.min(a.r1, b.r1), Math.min(a.c1, b.c1), Math.max(a.r2, b.r2), Math.max(a.c2, b.c2));
        }
        return a instanceof FErr ? a : b instanceof FErr ? b : E.REF;
      }
      case 'call': {
        const f = ev(n.f, ctx);
        if (f instanceof Lambda) return f.invoke(n.a.map((a) => ev(a, ctx)));
        return f instanceof FErr ? f : E.VALUE;
      }
      case 'nil': return undefined;
    }
    return E.VALUE;
  }

  function callFn(n, ctx) {
    const d = HC.fns[n.n];
    if (!d) {
      const v = evName(n.n, ctx);
      if (v instanceof Lambda) return v.invoke(n.a.map((a) => ev(a, ctx)));
      return E.NAME;
    }
    if (d.lazy) {
      if (n.a.length < d.min || n.a.length > d.max) return E.VALUE;
      return fin(d.fn.call(ctx, n.a, ctx));
    }
    const args = new Array(n.a.length);
    for (let i = 0; i < args.length; i++) args[i] = ev(n.a[i], ctx);
    return apply(d, args, ctx);
  }
  const fin = (r) => (typeof r === 'number' ? (isFinite(r) ? r : E.NUM) : r === undefined ? null : r);

  function apply(d, args, ctx) {
    if (args.length < d.min || args.length > d.max) return E.VALUE;
    if (d.raw) return fin(d.fn.call(ctx, args, ctx));
    const P = d.params, np = P.length;
    const vals = new Array(args.length);
    let mask = null;
    for (let i = 0; i < args.length; i++) {
      const p = P[i < np ? i : np - 1];
      let v = args[i];
      if (p.k === 'r') { vals[i] = v; continue; }
      if (p.k === 'a') { if (v instanceof FErr) return v; vals[i] = toArr(v); continue; }
      if (v instanceof Ref) v = v.single ? v.val(0, 0) : v.toArray();
      if (isArr(v)) {
        if (v.length === 1 && v[0].length === 1) v = v[0][0];
        else { if (!mask) mask = new Array(args.length).fill(false); mask[i] = true; }
      }
      vals[i] = v;
    }
    if (!mask) return invoke(d, vals, ctx);
    return liftN(vals, (x) => invoke(d, x, ctx), mask);
  }
  function invoke(d, vals, ctx) {
    const P = d.params, np = P.length, n = vals.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      const p = P[i < np ? i : np - 1];
      let v = vals[i];
      if (v === undefined && (p.opt || p.rep)) { out[i] = undefined; continue; }
      switch (p.k) {
        case 'n': v = toNum(v); if (v instanceof FErr) return v; break;
        case 's': v = toStr(v); if (v instanceof FErr) return v; break;
        case 'b': v = toBool(v); if (v instanceof FErr) return v; break;
        case 'v': if (v instanceof FErr) return v; if (v === undefined) v = null; break;
        case 'e': if (v === undefined) v = null; break;
      }
      out[i] = v;
    }
    return fin(d.fn.apply(ctx, out));
  }

  // ---------------------------------------------------------------- registro de funciones
  const CATS = { M: 'Matemáticas', S: 'Estadística', T: 'Texto', L: 'Lógicas', B: 'Búsqueda y referencia', D: 'Fecha y hora', F: 'Financieras', I: 'Información', G: 'Ingeniería', A: 'Matrices dinámicas', Z: 'Base de datos' };
  HC.fnCats = CATS;
  function parseSig(sig) {
    const params = []; let min = 0, max = 0;
    if (sig) {
      for (const tok of sig.split(/\s+/)) {
        const p = { k: tok[0], opt: tok[1] === '?', rep: tok[1] === '*' || tok[1] === '+' };
        params.push(p);
        if (!p.opt && tok[1] !== '*') min++;
        max = p.rep ? Infinity : max + 1;
      }
    }
    return { params, min, max };
  }
  // def(nombre, nombreEs, categoría, ayuda de argumentos, descripción, firma, función, opciones)
  // firma: letras por argumento: n número, s texto, b lógico, v escalar, e escalar (admite errores),
  //        r rango o matriz tal cual, a matriz 2D; "?" opcional, "+" o "*" repetido. 'raw' recibe la lista sin procesar.
  function def(name, es, cat, help, desc, sig, fn, o) {
    o = o || {};
    const d = { name, es: es || name, cat, help, desc, fn, lazy: !!o.lazy, raw: sig === 'raw' || !!o.lazy };
    if (d.raw) { d.min = o.min || 0; d.max = o.max == null ? Infinity : o.max; d.params = []; } else Object.assign(d, parseSig(sig));
    HC.fns[name] = d;
    if (es && es !== name) { HC.fnEs[name] = es; HC.fnFromEs[es] = name; }
    return d;
  }
  // nombres alternativos en español (versiones antiguas o variantes regionales)
  function aliasEs(name, ...alts) { for (const a of alts) HC.fnFromEs[a] = name; }
  function alias(name, target) { const t = HC.fns[target]; HC.fns[name] = Object.assign({}, t, { name, es: name, hidden: true }); }

  // ---------------------------------------------------------------- utilidades para agregados
  // Recorre todos los valores no vacíos: cb(valor, deRango). Devuelve false para detener.
  function eachArg(args, cb) {
    for (const a of args) {
      if (a instanceof Ref) { let stop = false; a.each((v) => { if (cb(v, true) === false) { stop = true; return false; } }); if (stop) return; }
      else if (isArr(a)) { for (const row of a) for (const v of row) if (v != null && cb(v, true) === false) return; }
      else if (a != null && cb(a, false) === false) return;
    }
  }
  // Números de una lista de argumentos con las reglas de Excel: en rangos solo cuentan los números;
  // los argumentos directos convierten lógicos y texto numérico. opts.a: variante "A" (texto=0, lógicos=1/0).
  function nums(args, opts) {
    const out = []; let err = null; const A = opts && opts.a, skipErr = opts && opts.skipErr;
    eachArg(args, (v, fromRange) => {
      if (typeof v === 'number') out.push(v);
      else if (v instanceof FErr) { if (!skipErr) { err = v; return false; } }
      else if (fromRange) { if (A) out.push(typeof v === 'boolean' ? (v ? 1 : 0) : 0); }
      else if (typeof v === 'boolean') out.push(v ? 1 : 0);
      else { const n = HC.textToNumber(v); if (n == null) { err = E.VALUE; return false; } out.push(n); }
    });
    return err || out;
  }

  // Criterios de CONTAR.SI, SUMAR.SI…: devuelve un predicado sobre el valor de la celda.
  function wildcardRe(pat) {
    let re = '';
    for (let i = 0; i < pat.length; i++) {
      const ch = pat[i];
      if (ch === '~' && i + 1 < pat.length) { re += pat[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
      else if (ch === '*') re += '[\\s\\S]*';
      else if (ch === '?') re += '[\\s\\S]';
      else re += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    return new RegExp('^' + re + '$', 'i');
  }
  function criteria(c) {
    if (c instanceof FErr) return (v) => v instanceof FErr && v.code === c.code;
    if (c == null) c = 0;
    let op = '=', val = c;
    if (typeof c === 'string') {
      const m = /^(<=|>=|<>|<|>|=)/.exec(c);
      let rest = c;
      if (m) { op = m[1]; rest = c.slice(op.length); }
      if (rest === '') {
        if (op === '=') return (v) => v == null || v === '';
        if (op === '<>') return (v) => v != null && v !== '';
        return () => false;
      }
      const u = rest.toUpperCase();
      const n = HC.textToNumber(rest);
      if (u === 'TRUE' || u === 'VERDADERO') val = true;
      else if (u === 'FALSE' || u === 'FALSO') val = false;
      else if (n != null) val = n;
      else {
        if (op === '=' || op === '<>') {
          const re = /[*?~]/.test(rest) ? wildcardRe(rest) : null;
          const low = rest.toLowerCase();
          const eq = (v) => typeof v === 'string' && (re ? re.test(v) : v.toLowerCase() === low);
          return op === '=' ? eq : (v) => !eq(v);
        }
        const low = rest.toLowerCase();
        return (v) => {
          if (typeof v !== 'string') return false;
          const x = v.toLowerCase();
          return op === '<' ? x < low : op === '<=' ? x <= low : op === '>' ? x > low : x >= low;
        };
      }
    }
    if (typeof val === 'number') {
      const num = (v) => (typeof v === 'number' ? v : typeof v === 'string' && v !== '' ? HC.textToNumber(v) : null);
      switch (op) {
        case '=': return (v) => { const x = num(v); return x != null && cmpVals(x, val) === 0; };
        case '<>': return (v) => { const x = num(v); return x == null || cmpVals(x, val) !== 0; };
        case '<': return (v) => typeof v === 'number' && v < val;
        case '<=': return (v) => typeof v === 'number' && v <= val;
        case '>': return (v) => typeof v === 'number' && v > val;
        default: return (v) => typeof v === 'number' && v >= val;
      }
    }
    if (typeof val === 'boolean') return op === '<>' ? (v) => v !== val : (v) => v === val;
    return () => false;
  }

  HC.Ref = Ref;
  HC.Lambda = Lambda;
  HC.evaluate = ev;
  HC.fx = { def, aliasEs, alias, ev, apply, toNum, toStr, toBool, deref, scalar, toArr, flatten, mapArr, mkArr, liftN, cmpVals, binary, power, eachArg, nums, criteria, wildcardRe, Ref, Lambda, fin };
})(typeof window !== 'undefined' ? window : globalThis);
