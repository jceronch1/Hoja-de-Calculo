/* Sintaxis de fórmulas: tokens, traducción entre la forma local (español, ; o ,) y la canónica
   (nombres en inglés, punto decimal, coma como separador), reescritura de referencias y analizador. */
(function (root) {
  'use strict';
  const HC = root.HC;
  const E = HC.E;
  const MAXR = HC.MAX_ROWS, MAXC = HC.MAX_COLS;

  // ---------------------------------------------------------------- perfiles de sintaxis
  const CANON = HC.SYN_CANON = { dec: '.', seps: ',', arrCol: ',', arrRow: ';', local: false };
  HC.synLocal = function () {
    return HC.locale.dec === ','
      ? { dec: ',', seps: ';', arrCol: '\\', arrRow: ';', local: true }
      : { dec: '.', seps: ',;', arrCol: ',', arrRow: ';', local: true };
  };

  // ---------------------------------------------------------------- nombres de función (los llena el registro)
  HC.fnEs = Object.create(null);     // canónico -> español
  HC.fnFromEs = Object.create(null); // español -> canónico
  HC.fns = Object.create(null);      // canónico -> definición
  HC.fnToCanon = function (name) {
    const n = HC.fold(name).toUpperCase();
    if (HC.locale.lang === 'es') return HC.fnFromEs[n] || n;
    return HC.fns[n] ? n : (HC.fnFromEs[n] || n);
  };
  HC.fnToLocal = (canon) => (HC.locale.lang === 'es' ? HC.fnEs[canon] || canon : canon);

  // ---------------------------------------------------------------- tokens
  const RE_WS = /\s+/y;
  const RE_STR = /"((?:[^"]|"")*)("?)/y;
  const RE_ROWS = /(\$?)(\d{1,7}):(\$?)(\d{1,7})(?!\d)/y;
  const RE_CELL = /(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})/y;
  const RE_COLS = /(\$?)([A-Za-z]{1,3}):(\$?)([A-Za-z]{1,3})(?![\p{L}\p{N}_.(!])/yu;
  const RE_IDENT = /[\p{L}_][\p{L}\p{N}_.?]*/yu;
  const RE_SHEET_U = /([\p{L}_][\p{L}\p{N}_.]*)!/yu;
  const RE_SHEET_Q = /'((?:[^']|'')+)'!/y;
  const RE_NUM_DOT = /\d+(?:\.\d*)?(?:[eE][+-]?\d+)?/y;
  const RE_NUM_COMMA = /\d+(?:,\d+)?(?:[eE][+-]?\d+)?/y;
  const RE_FRAC_DOT = /\.\d+(?:[eE][+-]?\d+)?/y;
  const RE_FRAC_COMMA = /,\d+(?:[eE][+-]?\d+)?/y;
  const RE_IDCH = /[\p{L}\p{N}_.(]/u;
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
  const ERR_NAMES = Object.keys(HC.ERR_ES).concat(Object.values(HC.ERR_ES)).sort((a, b) => b.length - a.length);
  const RE_ERR = new RegExp('(?:' + ERR_NAMES.map(esc).join('|') + ')', 'yi');
  const BOOLS = { TRUE: true, FALSE: false, VERDADERO: true, FALSO: false };

  function matchAt(re, text, i) { re.lastIndex = i; return re.exec(text); }

  function cellPoint(m) {
    const c = HC.colIndex(m[2]), r = +m[4] - 1;
    if (c >= MAXC || r < 0 || r >= MAXR) return null;
    return { r, c, ar: m[3] === '$', ac: m[1] === '$' };
  }

  // Lee una referencia (celda, rango, columnas o filas) que empieza en i. Devuelve {tok, end} o null.
  function readRef(text, i, sheet) {
    let m = matchAt(RE_CELL, text, i);
    if (m) {
      const p1 = cellPoint(m);
      if (p1) {
        let end = i + m[0].length, p2 = null;
        if (text[end] === ':') {
          const m2 = matchAt(RE_CELL, text, end + 1);
          const q = m2 && cellPoint(m2);
          if (q && !RE_IDCH.test(text[end + 1 + m2[0].length] || '')) { p2 = q; end = end + 1 + m2[0].length; }
        }
        const next = text[end] || '';
        if (!RE_IDCH.test(next) && next !== '!') {
          return { tok: { t: 'ref', kind: p2 ? 'range' : 'cell', sheet, p1, p2 }, end };
        }
      }
    }
    m = matchAt(RE_COLS, text, i);
    if (m) {
      const c1 = HC.colIndex(m[2]), c2 = HC.colIndex(m[4]);
      if (c1 < MAXC && c2 < MAXC) {
        return { tok: { t: 'ref', kind: 'cols', sheet, p1: { c: c1, ac: m[1] === '$' }, p2: { c: c2, ac: m[3] === '$' } }, end: i + m[0].length };
      }
    }
    m = matchAt(RE_ROWS, text, i);
    if (m) {
      const r1 = +m[2] - 1, r2 = +m[4] - 1;
      if (r1 >= 0 && r2 >= 0 && r1 < MAXR && r2 < MAXR) {
        return { tok: { t: 'ref', kind: 'rows', sheet, p1: { r: r1, ar: m[1] === '$' }, p2: { r: r2, ar: m[3] === '$' } }, end: i + m[0].length };
      }
    }
    if (sheet != null && text.substr(i, 5).toUpperCase() === '#REF!') {
      return { tok: { t: 'ref', kind: 'err', sheet }, end: i + 5 };
    }
    return null;
  }

  HC.tokenize = function (text, syn) {
    syn = syn || CANON;
    const toks = [];
    const n = text.length;
    let i = 0, depth = 0;
    const lastSig = () => { for (let k = toks.length - 1; k >= 0; k--) if (toks[k].t !== 'ws') return toks[k]; return null; };
    const isOperand = (t) => t && (t.t === 'num' || t.t === 'str' || t.t === 'ref' || t.t === 'name' || t.t === 'bool' || t.t === 'rp' || t.t === 'rb' || t.t === 'err' || (t.t === 'op' && t.v === '%'));
    const push = (tok, s, e) => { tok.s = s; tok.e = e; toks.push(tok); i = e; };
    while (i < n) {
      const ch = text[i];
      let m;
      if ((m = matchAt(RE_WS, text, i))) { push({ t: 'ws' }, i, i + m[0].length); continue; }
      if (ch === '"') {
        m = matchAt(RE_STR, text, i);
        push({ t: 'str', v: m[1].replace(/""/g, '"'), open: m[2] !== '"' }, i, i + m[0].length);
        continue;
      }
      if (depth > 0 && (ch === syn.arrCol || ch === syn.arrRow)) {
        push({ t: ch === syn.arrCol ? 'acol' : 'arow' }, i, i + 1); continue;
      }
      if (ch === '#') {
        m = matchAt(RE_ERR, text, i);
        if (m) { push({ t: 'err', v: HC.errFromText(m[0]) }, i, i + m[0].length); continue; }
        const prev = toks[toks.length - 1];
        if (prev && prev.t === 'ref' && prev.e === i) { prev.spill = true; prev.e = i + 1; i++; continue; }
        push({ t: 'bad' }, i, i + 1); continue;
      }
      if (ch === "'") {
        m = matchAt(RE_SHEET_Q, text, i);
        if (m) {
          const r = readRef(text, i + m[0].length, m[1].replace(/''/g, "'"));
          if (r) { push(r.tok, i, r.end); continue; }
        }
        push({ t: 'bad' }, i, i + 1); continue;
      }
      // números (y rangos de filas como 2:5)
      if (ch >= '0' && ch <= '9') {
        const r = readRef(text, i, undefined);
        if (r && r.tok.kind === 'rows') { push(r.tok, i, r.end); continue; }
        m = matchAt(syn.dec === ',' ? RE_NUM_COMMA : RE_NUM_DOT, text, i);
        const canon = syn.dec === ',' ? m[0].replace(',', '.') : m[0];
        push({ t: 'num', v: parseFloat(canon), canon }, i, i + m[0].length);
        continue;
      }
      if (ch === syn.dec && !isOperand(lastSig())) {
        m = matchAt(syn.dec === ',' ? RE_FRAC_COMMA : RE_FRAC_DOT, text, i);
        if (m) {
          const canon = '0' + m[0].replace(',', '.');
          push({ t: 'num', v: parseFloat(canon), canon }, i, i + m[0].length);
          continue;
        }
      }
      // identificadores, referencias, funciones
      if (ch === '$' || /[\p{L}_]/u.test(ch)) {
        if (ch !== '$') {
          m = matchAt(RE_SHEET_U, text, i);
          if (m) {
            const r = readRef(text, i + m[0].length, m[1]);
            if (r) { push(r.tok, i, r.end); continue; }
          }
        }
        const r = readRef(text, i, undefined);
        if (r) { push(r.tok, i, r.end); continue; }
        if (ch === '$') { push({ t: 'bad' }, i, i + 1); continue; }
        m = matchAt(RE_IDENT, text, i);
        const id = m[0], end = i + id.length;
        if (text[end] === '(') { push({ t: 'fn', v: syn.local ? HC.fnToCanon(id) : id.toUpperCase(), raw: id }, i, end); continue; }
        const up = id.toUpperCase();
        if (up in BOOLS) { push({ t: 'bool', v: BOOLS[up] }, i, end); continue; }
        push({ t: 'name', v: id }, i, end);
        continue;
      }
      // operadores y signos
      const two = text.substr(i, 2);
      if (two === '<=' || two === '>=' || two === '<>') { push({ t: 'op', v: two }, i, i + 2); continue; }
      if ('+-*/^&=<>%:@'.indexOf(ch) >= 0) { push({ t: 'op', v: ch }, i, i + 1); continue; }
      if (ch === '(') { push({ t: 'lp' }, i, i + 1); continue; }
      if (ch === ')') { push({ t: 'rp' }, i, i + 1); continue; }
      if (ch === '{') { depth++; push({ t: 'lb' }, i, i + 1); continue; }
      if (ch === '}') { depth = Math.max(0, depth - 1); push({ t: 'rb' }, i, i + 1); continue; }
      if (depth === 0 && (syn.seps.indexOf(ch) >= 0 || (ch === ',' && syn.dec === ','))) {
        // con coma decimal, una coma suelta se acepta como separador (tolerancia)
        push({ t: 'sep' }, i, i + 1); continue;
      }
      push({ t: 'bad' }, i, i + 1);
    }
    return toks;
  };

  // ---------------------------------------------------------------- texto de referencias
  function ptText(p, kind) {
    if (kind === 'cols') return (p.ac ? '$' : '') + HC.colName(p.c);
    if (kind === 'rows') return (p.ar ? '$' : '') + (p.r + 1);
    return (p.ac ? '$' : '') + HC.colName(p.c) + (p.ar ? '$' : '') + (p.r + 1);
  }
  HC.refText = function (t) {
    let s = t.sheet != null ? HC.quoteSheet(t.sheet) + '!' : '';
    if (t.kind === 'err') return s + '#REF!';
    s += ptText(t.p1, t.kind);
    if (t.p2) s += ':' + ptText(t.p2, t.kind);
    return s + (t.spill ? '#' : '');
  };

  function emit(tok, src, syn) {
    switch (tok.t) {
      case 'num': return syn.dec === '.' ? tok.canon : tok.canon.replace('.', syn.dec);
      case 'fn': return syn.local ? HC.fnToLocal(tok.v) : tok.v;
      case 'bool': return syn.local ? HC.boolText(tok.v) : (tok.v ? 'TRUE' : 'FALSE');
      case 'err': return syn.local ? HC.errText(tok.v) : tok.v.code;
      case 'sep': return syn.seps[0];
      case 'acol': return syn.arrCol;
      case 'arow': return syn.arrRow;
      case 'ref': return HC.refText(tok);
      default: return src.slice(tok.s, tok.e);
    }
  }
  HC.translate = function (text, from, to) {
    const toks = HC.tokenize(text, from);
    let out = '';
    for (const t of toks) out += emit(t, text, to);
    return out;
  };
  // Fórmula canónica (sin "=") -> texto que ve el usuario, y viceversa.
  HC.localizeFormula = (f) => HC.translate(f, CANON, HC.synLocal());
  HC.canonicalizeFormula = function (text) {
    const syn = HC.synLocal();
    const toks = HC.tokenize(text, syn);
    let out = '', open = 0, openStr = false;
    for (const t of toks) {
      out += emit(t, text, CANON);
      if (t.t === 'lp') open++; else if (t.t === 'rp') open--;
      if (t.t === 'str' && t.open) openStr = true;
    }
    if (openStr) out += '"';
    while (open-- > 0) out += ')'; // como Excel: cierra los paréntesis que falten
    return out;
  };

  // Reescribe cada referencia con cb(tok). cb devuelve undefined (sin cambio), un texto o el token modificado.
  HC.rewriteRefs = function (formula, cb, syn) {
    const toks = HC.tokenize(formula, syn || CANON);
    let out = '', changed = false;
    for (const t of toks) {
      if (t.t === 'ref') {
        const copy = { t: 'ref', kind: t.kind, sheet: t.sheet, spill: t.spill, p1: t.p1 && Object.assign({}, t.p1), p2: t.p2 && Object.assign({}, t.p2) };
        const res = cb(copy);
        if (res !== undefined) { out += typeof res === 'string' ? res : HC.refText(res); changed = true; continue; }
      }
      out += formula.slice(t.s, t.e);
    }
    return changed ? out : formula;
  };
  // Desplaza las partes relativas de las referencias (copiar, pegar, rellenar).
  HC.shiftFormula = function (formula, dr, dc) {
    if (!dr && !dc) return formula;
    return HC.rewriteRefs(formula, (t) => {
      if (t.kind === 'err') return undefined;
      let changed = false;
      for (const p of [t.p1, t.p2]) {
        if (!p) continue;
        if (p.r != null && !p.ar && dr) { p.r += dr; changed = true; if (p.r < 0 || p.r >= MAXR) return '#REF!'; }
        if (p.c != null && !p.ac && dc) { p.c += dc; changed = true; if (p.c < 0 || p.c >= MAXC) return '#REF!'; }
      }
      return changed ? t : undefined;
    });
  };
  // F4: alterna A1 -> $A$1 -> A$1 -> $A1 en la referencia bajo el cursor. Devuelve {text, start, end} o null.
  HC.toggleAbsAt = function (text, pos, syn) {
    const toks = HC.tokenize(text, syn || HC.synLocal());
    for (const t of toks) {
      if (t.t !== 'ref' || t.kind === 'err' || pos < t.s || pos > t.e) continue;
      const cycle = (p) => {
        if (!p) return;
        const hasR = p.r != null, hasC = p.c != null;
        const state = (p.ar ? 2 : 0) + (p.ac ? 1 : 0); // 0 rel, 3 abs
        const next = { 0: 3, 3: 2, 2: 1, 1: 0 }[state];
        if (hasR && hasC) { p.ar = !!(next & 2); p.ac = !!(next & 1); }
        else if (hasR) p.ar = !p.ar; else p.ac = !p.ac;
      };
      const copy = { t: 'ref', kind: t.kind, sheet: t.sheet, spill: t.spill, p1: Object.assign({}, t.p1), p2: t.p2 && Object.assign({}, t.p2) };
      cycle(copy.p1); cycle(copy.p2);
      const rep = HC.refText(copy);
      return { text: text.slice(0, t.s) + rep + text.slice(t.e), start: t.s, end: t.s + rep.length };
    }
    return null;
  };

  // ---------------------------------------------------------------- analizador (solo sintaxis canónica)
  class ParseError extends Error {
    constructor(msg, pos) { super(msg); this.pos = pos; }
  }
  HC.ParseError = ParseError;

  function refNode(t) {
    if (t.kind === 'err') return { t: 'err', v: E.REF };
    const p1 = t.p1, p2 = t.p2 || t.p1;
    let r1 = 0, r2 = MAXR - 1, c1 = 0, c2 = MAXC - 1;
    if (t.kind !== 'cols') { r1 = Math.min(p1.r, p2.r); r2 = Math.max(p1.r, p2.r); }
    if (t.kind !== 'rows') { c1 = Math.min(p1.c, p2.c); c2 = Math.max(p1.c, p2.c); }
    return { t: 'ref', sheet: t.sheet, r1, c1, r2, c2, spill: !!t.spill };
  }

  function parse(text) {
    const toks = HC.tokenize(text, CANON).filter((t) => t.t !== 'ws');
    let i = 0;
    const isOp = (v) => { const t = toks[i]; return !!t && t.t === 'op' && t.v === v; };
    const fail = (msg) => { const t = toks[i]; throw new ParseError(msg, t ? t.s : text.length); };
    const expect = (type, msg) => { if (!toks[i] || toks[i].t !== type) fail(msg); i++; };

    function expr() {
      let l = cat();
      for (;;) {
        const t = toks[i];
        if (t && t.t === 'op' && (t.v === '=' || t.v === '<>' || t.v === '<' || t.v === '>' || t.v === '<=' || t.v === '>=')) {
          i++; l = { t: 'bin', op: t.v, l, r: cat() };
        } else return l;
      }
    }
    function cat() { let l = add(); while (isOp('&')) { i++; l = { t: 'bin', op: '&', l, r: add() }; } return l; }
    function add() {
      let l = mul();
      while (isOp('+') || isOp('-')) { const op = toks[i++].v; l = { t: 'bin', op, l, r: mul() }; }
      return l;
    }
    function mul() {
      let l = pow();
      while (isOp('*') || isOp('/')) { const op = toks[i++].v; l = { t: 'bin', op, l, r: pow() }; }
      return l;
    }
    function pow() { let l = unary(); while (isOp('^')) { i++; l = { t: 'bin', op: '^', l, r: unary() }; } return l; }
    function unary() {
      if (isOp('-')) { i++; const x = unary(); return x.t === 'num' ? { t: 'num', v: -x.v } : { t: 'neg', x }; }
      if (isOp('+') || isOp('@')) { i++; return unary(); }
      let x = range();
      while (isOp('%')) { i++; x = { t: 'pct', x }; }
      return x;
    }
    function range() {
      let x = primary();
      while (isOp(':')) { i++; x = { t: 'rng', l: x, r: primary() }; }
      return x;
    }
    function args() {
      const a = [];
      if (toks[i] && toks[i].t === 'rp') { i++; return a; }
      for (;;) {
        const t = toks[i];
        if (!t) fail('Falta un paréntesis de cierre');
        if (t.t === 'sep') { a.push({ t: 'nil' }); i++; if (toks[i] && toks[i].t === 'rp') { a.push({ t: 'nil' }); i++; return a; } continue; }
        a.push(expr());
        const u = toks[i];
        if (!u) fail('Falta un paréntesis de cierre');
        if (u.t === 'rp') { i++; return a; }
        if (u.t !== 'sep') fail('Se esperaba un separador de argumentos o un paréntesis');
        i++;
        if (toks[i] && toks[i].t === 'rp') { a.push({ t: 'nil' }); i++; return a; }
      }
    }
    function calls(x) {
      while (toks[i] && toks[i].t === 'lp') { i++; x = { t: 'call', f: x, a: args() }; }
      return x;
    }
    function arrayConst() {
      i++; // {
      const rows = [[]];
      for (;;) {
        const t = toks[i];
        if (!t) fail('Falta la llave de cierre de la matriz');
        let sign = 1;
        if (t.t === 'op' && (t.v === '-' || t.v === '+')) { sign = t.v === '-' ? -1 : 1; i++; }
        const u = toks[i];
        if (!u) fail('Falta la llave de cierre de la matriz');
        if (u.t === 'num') rows[rows.length - 1].push(sign * u.v);
        else if (u.t === 'str' || u.t === 'bool' || u.t === 'err') rows[rows.length - 1].push(u.v);
        else fail('Las matrices solo admiten valores constantes');
        i++;
        const s = toks[i];
        if (!s) fail('Falta la llave de cierre de la matriz');
        if (s.t === 'rb') { i++; break; }
        if (s.t === 'acol') i++;
        else if (s.t === 'arow') { rows.push([]); i++; }
        else fail('Separador de matriz no válido');
      }
      const w = rows[0].length;
      if (!w || rows.some((r) => r.length !== w)) fail('Todas las filas de la matriz deben tener el mismo número de elementos');
      return { t: 'arr', v: rows };
    }
    function primary() {
      const t = toks[i];
      if (!t) fail('La fórmula está incompleta');
      switch (t.t) {
        case 'num': i++; return { t: 'num', v: t.v };
        case 'str': i++; return { t: 'str', v: t.v };
        case 'bool': i++; return { t: 'bool', v: t.v };
        case 'err': i++; return { t: 'err', v: t.v };
        case 'ref': i++; return refNode(t);
        case 'name': i++; return { t: 'name', v: t.v };
        case 'fn': { i += 2; return calls({ t: 'fn', n: t.v, a: args() }); }
        case 'lp': { i++; const x = expr(); expect('rp', 'Falta un paréntesis de cierre'); return calls(x); }
        case 'lb': return arrayConst();
      }
      fail('Símbolo inesperado en la fórmula');
    }
    if (!toks.length) fail('La fórmula está vacía');
    const ast = expr();
    if (i < toks.length) fail('Hay texto que no se entiende en la fórmula');
    return ast;
  }

  const cache = new Map();
  // Devuelve {ast} o {err: ParseError}. Las fórmulas se guardan sin el "=" inicial.
  HC.parseFormula = function (text) {
    let hit = cache.get(text);
    if (hit) return hit;
    try { hit = { ast: parse(text) }; } catch (e) {
      if (!(e instanceof ParseError)) throw e;
      hit = { err: e };
    }
    if (cache.size > 50000) cache.clear();
    cache.set(text, hit);
    return hit;
  };

  // Referencias estáticas, nombres usados y volatilidad de un árbol.
  const VOLATILE = { NOW: 1, TODAY: 1, RAND: 1, RANDBETWEEN: 1, RANDARRAY: 1, OFFSET: 1, INDIRECT: 1, CELL: 1 };
  HC.analyze = function (ast) {
    if (ast._info) return ast._info;
    const info = { refs: [], names: [], volatile: false };
    (function walk(n) {
      if (!n) return;
      switch (n.t) {
        case 'ref': info.refs.push(n); break;
        case 'name': info.names.push(n.v.toUpperCase()); break;
        case 'fn': if (VOLATILE[n.n]) info.volatile = true; if (!HC.fns[n.n]) info.names.push(n.n); n.a.forEach(walk); break;
        case 'call': walk(n.f); n.a.forEach(walk); break;
        case 'bin': case 'rng': walk(n.l); walk(n.r); break;
        case 'neg': case 'pct': walk(n.x); break;
      }
    })(ast);
    Object.defineProperty(ast, '_info', { value: info, enumerable: false });
    return info;
  };
})(typeof window !== 'undefined' ? window : globalThis);
