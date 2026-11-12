/* Funciones de búsqueda y referencia, y matrices dinámicas (FILTRAR, ORDENAR, UNICOS…). */
(function (root) {
  'use strict';
  const HC = root.HC, E = HC.E, FErr = HC.FErr, X = HC.fx;
  const { def, aliasEs, ev, toNum, toStr, toBool, scalar, toArr, flatten, Ref, mkArr, cmpVals } = X;
  const isArr = Array.isArray;
  const B = 'B', A = 'A';

  // ---------------------------------------------------------------- vectores de búsqueda
  // {n: longitud recortada, full: longitud real, get(i), vertical} o null si no es una fila o columna
  function vec(src) {
    if (src instanceof Ref) {
      const b = src.bounds();
      if (src.cols === 1) return { n: b.r2 - src.r1 + 1, full: src.rows, get: (i) => src.val(i, 0), vertical: true };
      if (src.rows === 1) return { n: b.c2 - src.c1 + 1, full: src.cols, get: (i) => src.val(0, i), vertical: false };
      return null;
    }
    const a = toArr(src);
    if (a[0].length === 1) return { n: a.length, full: a.length, get: (i) => a[i][0], vertical: true };
    if (a.length === 1) return { n: a[0].length, full: a[0].length, get: (i) => a[0][i], vertical: false };
    return null;
  }
  function eqMatcher(x, wild) {
    if (typeof x === 'string') {
      if (wild && /[*?~]/.test(x)) { const re = X.wildcardRe(x); return (v) => typeof v === 'string' && re.test(v); }
      const low = x.toLowerCase();
      return (v) => typeof v === 'string' && v.toLowerCase() === low;
    }
    if (typeof x === 'number') return (v) => typeof v === 'number' && cmpVals(v, x) === 0;
    if (typeof x === 'boolean') return (v) => v === x;
    return (v) => v === 0;
  }
  function findExact(v, x, wild, reverse) {
    const m = eqMatcher(x, wild);
    if (reverse) { for (let i = v.n - 1; i >= 0; i--) if (m(v.get(i))) return i; } else for (let i = 0; i < v.n; i++) if (m(v.get(i))) return i;
    return -1;
  }
  const sameKind = (a, b) => a != null && typeof a === typeof b && !(a instanceof FErr);
  // último valor <= x (datos ascendentes) o >= x (descendentes)
  function findOrdered(v, x, dir) {
    if (x == null) x = 0;
    let best = -1;
    for (let i = 0; i < v.n; i++) {
      const y = v.get(i);
      if (!sameKind(y, x)) continue;
      const c = cmpVals(y, x);
      if (dir > 0 ? c <= 0 : c >= 0) best = i;
    }
    return best;
  }
  // coincidencia exacta o el siguiente menor (dir -1) / mayor (dir 1), sin exigir orden
  function findNearest(v, x, dir, reverse) {
    let best = -1, bestVal;
    const from = reverse ? v.n - 1 : 0, to = reverse ? -1 : v.n, step = reverse ? -1 : 1;
    for (let i = from; i !== to; i += step) {
      const y = v.get(i);
      if (!sameKind(y, x)) continue;
      const c = cmpVals(y, x);
      if (c === 0) return i;
      if (dir < 0 ? c < 0 : c > 0) {
        if (best < 0 || (dir < 0 ? cmpVals(y, bestVal) > 0 : cmpVals(y, bestVal) < 0)) { best = i; bestVal = y; }
      }
    }
    return best;
  }
  function xfind(v, x, mode, search) {
    const rev = search === -1 || search === -2;
    if (mode === -1) return findNearest(v, x, -1, rev);
    if (mode === 1) return findNearest(v, x, 1, rev);
    return findExact(v, x, mode === 2, rev);
  }

  def('VLOOKUP', 'BUSCARV', B, 'valor_buscado; tabla; núm_columna; [coincidencia_aproximada]', 'Busca un valor en la primera columna de una tabla y devuelve el de otra columna de la misma fila. Usa FALSO como último argumento para una coincidencia exacta.', 'v r n b?', (x, table, col, approx = true) => {
    if (table instanceof FErr) return table;
    col = Math.floor(col); if (col < 1) return E.VALUE;
    let first, res, ncols;
    if (table instanceof Ref) { ncols = table.cols; first = vec(new Ref(table.sheet, table.r1, table.c1, table.r2, table.c1)); res = (i) => table.val(i, col - 1); }
    else { const a = toArr(table); ncols = a[0].length; first = { n: a.length, get: (i) => a[i][0] }; res = (i) => a[i][col - 1]; }
    if (col > ncols) return E.REF;
    const i = approx ? findOrdered(first, x, 1) : findExact(first, x, true);
    return i < 0 ? E.NA : res(i);
  });
  aliasEs('VLOOKUP', 'CONSULTAV');
  def('HLOOKUP', 'BUSCARH', B, 'valor_buscado; tabla; núm_fila; [coincidencia_aproximada]', 'Busca un valor en la primera fila de una tabla y devuelve el de otra fila de la misma columna.', 'v r n b?', (x, table, row, approx = true) => {
    if (table instanceof FErr) return table;
    row = Math.floor(row); if (row < 1) return E.VALUE;
    let first, res, nrows;
    if (table instanceof Ref) { nrows = table.rows; first = vec(new Ref(table.sheet, table.r1, table.c1, table.r1, table.c2)); res = (j) => table.val(row - 1, j); }
    else { const a = toArr(table); nrows = a.length; first = { n: a[0].length, get: (j) => a[0][j] }; res = (j) => a[row - 1][j]; }
    if (row > nrows) return E.REF;
    const j = approx ? findOrdered(first, x, 1) : findExact(first, x, true);
    return j < 0 ? E.NA : res(j);
  });
  aliasEs('HLOOKUP', 'CONSULTAH');
  def('MATCH', 'COINCIDIR', B, 'valor_buscado; rango; [tipo_coincidencia]', 'Posición de un valor dentro de una fila o columna. Tipo 0 = coincidencia exacta.', 'v r n?', (x, arr, type = 1) => {
    if (arr instanceof FErr) return arr;
    const v = vec(arr); if (!v) return E.NA;
    const i = type === 0 ? findExact(v, x, true) : findOrdered(v, x, type > 0 ? 1 : -1);
    return i < 0 ? E.NA : i + 1;
  });
  def('XMATCH', 'COINCIDIRX', B, 'valor_buscado; rango; [modo_coincidencia]; [modo_búsqueda]', 'Posición de un valor dentro de una fila o columna (coincidencia exacta por defecto).', 'v r n? n?', (x, arr, mode = 0, search = 1) => {
    if (arr instanceof FErr) return arr;
    const v = vec(arr); if (!v) return E.VALUE;
    const i = xfind(v, x, mode, search);
    return i < 0 ? E.NA : i + 1;
  });
  def('XLOOKUP', 'BUSCARX', B, 'valor_buscado; rango_búsqueda; rango_devuelto; [si_no_se_encuentra]; [modo_coincidencia]; [modo_búsqueda]', 'Busca un valor en un rango y devuelve el elemento correspondiente de otro rango.', 'raw', (args) => {
    const lookArr = args[1], ret = args[2];
    if (lookArr instanceof FErr) return lookArr; if (ret instanceof FErr) return ret;
    const v = vec(lookArr); if (!v) return E.VALUE;
    const mode = args[4] === undefined ? 0 : toNum(scalar(args[4])), search = args[5] === undefined ? 1 : toNum(scalar(args[5]));
    if (mode instanceof FErr) return mode; if (search instanceof FErr) return search;
    const rR = ret instanceof Ref ? ret.rows : isArr(ret) ? ret.length : 1, rC = ret instanceof Ref ? ret.cols : isArr(ret) ? ret[0].length : 1;
    if ((v.vertical ? rR : rC) !== v.full && !(v.full === 1 && (rR === 1 || rC === 1))) return E.VALUE;
    const one = (x) => {
      if (x instanceof FErr) return x;
      const i = xfind(v, x, mode, search);
      if (i < 0) return args[3] === undefined ? E.NA : args[3];
      if (ret instanceof Ref) return v.vertical ? new Ref(ret.sheet, ret.r1 + i, ret.c1, ret.r1 + i, ret.c2) : new Ref(ret.sheet, ret.r1, ret.c1 + i, ret.r2, ret.c1 + i);
      const a = toArr(ret);
      if (v.vertical) return a[i].length === 1 ? a[i][0] : [a[i]];
      return a.length === 1 ? a[0][i] : a.map((r) => [r[i]]);
    };
    const xs = X.deref(args[0]);
    if (isArr(xs) && !(xs.length === 1 && xs[0].length === 1)) return X.mapArr(xs, (x) => { const r = scalar(one(x)); return r === undefined ? null : r; });
    return one(isArr(xs) ? xs[0][0] : xs);
  }, { min: 3, max: 6 });
  def('LOOKUP', 'BUSCAR', B, 'valor_buscado; vector_de_comparación; [vector_resultado]', 'Busca un valor en una fila o columna ordenada y devuelve el valor de la misma posición en otra.', 'v r r?', (x, look, res) => {
    if (look instanceof FErr) return look;
    let lv = vec(look), rv;
    if (res !== undefined) { rv = vec(res); if (!lv || !rv) return E.NA; } else if (!lv) {
      const R = look instanceof Ref ? look.rows : look.length, C = look instanceof Ref ? look.cols : look[0].length;
      const a = look instanceof Ref ? null : look;
      const cell = (i, j) => (a ? a[i][j] : look.val(i, j));
      if (C > R) { lv = { n: look instanceof Ref ? look.bounds().c2 - look.c1 + 1 : C, get: (j) => cell(0, j) }; rv = { get: (j) => cell(R - 1, j) }; }
      else { lv = { n: look instanceof Ref ? look.bounds().r2 - look.r1 + 1 : R, get: (i) => cell(i, 0) }; rv = { get: (i) => cell(i, C - 1) }; }
    } else rv = lv;
    const i = findOrdered(lv, x, 1);
    return i < 0 ? E.NA : rv.get(i);
  });

  // ---------------------------------------------------------------- referencias
  def('INDEX', 'INDICE', B, 'matriz; núm_fila; [núm_columna]', 'Valor o referencia de la celda en la fila y columna indicadas de un rango.', 'raw', (args) => {
    const src = args[0];
    if (src instanceof FErr) return src;
    let r = args[1] === undefined ? 0 : toNum(scalar(args[1])), c = args[2] === undefined ? undefined : toNum(scalar(args[2]));
    if (r instanceof FErr) return r; if (c instanceof FErr) return c;
    const isRef = src instanceof Ref, a = isRef ? null : toArr(src);
    const R = isRef ? src.rows : a.length, C = isRef ? src.cols : a[0].length;
    r = Math.floor(r);
    if (c === undefined) { if (R === 1 && C > 1) { c = r; r = 1; } else c = C === 1 ? 1 : 0; } else c = Math.floor(c);
    if (r < 0 || c < 0 || r > R || c > C) return E.REF;
    if (isRef) return new Ref(src.sheet, r ? src.r1 + r - 1 : src.r1, c ? src.c1 + c - 1 : src.c1, r ? src.r1 + r - 1 : src.r2, c ? src.c1 + c - 1 : src.c2);
    if (r && c) return a[r - 1][c - 1];
    if (r) return [a[r - 1]];
    if (c) return a.map((row) => [row[c - 1]]);
    return a;
  }, { min: 2, max: 3 });
  def('OFFSET', 'DESREF', B, 'referencia; filas; columnas; [alto]; [ancho]', 'Referencia desplazada un número de filas y columnas desde otra.', 'raw', (args) => {
    const ref = args[0];
    if (!(ref instanceof Ref)) return ref instanceof FErr ? ref : E.VALUE;
    const n = (k, d) => (args[k] === undefined ? d : toNum(scalar(args[k])));
    const dr = n(1, 0), dc = n(2, 0); let h = n(3, ref.rows), w = n(4, ref.cols);
    for (const v of [dr, dc, h, w]) if (v instanceof FErr) return v;
    h = Math.trunc(h); w = Math.trunc(w);
    if (!h || !w) return E.REF;
    let r1 = ref.r1 + Math.trunc(dr), c1 = ref.c1 + Math.trunc(dc);
    let r2 = r1 + h + (h > 0 ? -1 : 1), c2 = c1 + w + (w > 0 ? -1 : 1);
    if (r1 > r2) [r1, r2] = [r2, r1];
    if (c1 > c2) [c1, c2] = [c2, c1];
    if (r1 < 0 || c1 < 0 || r2 >= HC.MAX_ROWS || c2 >= HC.MAX_COLS) return E.REF;
    return new Ref(ref.sheet, r1, c1, r2, c2);
  }, { min: 3, max: 5 });
  def('INDIRECT', 'INDIRECTO', B, 'texto_referencia', 'Referencia indicada por un texto, por ejemplo "B2" o "Hoja2!A1:A10".', 'raw', function (args, ctx) {
    const t = toStr(scalar(args[0]));
    if (t instanceof FErr) return t;
    const g = HC.parseSheetRange(t);
    if (g) {
      const sheet = g.sheet != null ? ctx.wb.sheetByName(g.sheet) : ctx.sheet;
      return sheet ? new Ref(sheet, g.r1, g.c1, g.r2, g.c2) : E.REF;
    }
    if (ctx.wb.names && ctx.wb.names.has(t.trim().toUpperCase())) return ev({ t: 'name', v: t.trim() }, ctx);
    return E.REF;
  }, { min: 1, max: 2 });
  def('ROW', 'FILA', B, '[referencia]', 'Número de fila de una referencia (o de la celda actual).', 'raw', function (args, ctx) {
    const v = args[0];
    if (v === undefined) return ctx.r + 1;
    if (!(v instanceof Ref)) return v instanceof FErr ? v : E.VALUE;
    return v.rows === 1 ? v.r1 + 1 : mkArr(Math.min(v.rows, v.bounds().r2 - v.r1 + 1), 1, (i) => v.r1 + i + 1);
  }, { max: 1 });
  def('COLUMN', 'COLUMNA', B, '[referencia]', 'Número de columna de una referencia (o de la celda actual).', 'raw', function (args, ctx) {
    const v = args[0];
    if (v === undefined) return ctx.c + 1;
    if (!(v instanceof Ref)) return v instanceof FErr ? v : E.VALUE;
    return v.cols === 1 ? v.c1 + 1 : mkArr(1, Math.min(v.cols, v.bounds().c2 - v.c1 + 1), (i, j) => v.c1 + j + 1);
  }, { max: 1 });
  def('ROWS', 'FILAS', B, 'matriz', 'Número de filas de un rango o matriz.', 'r', (v) => (v instanceof Ref ? v.rows : isArr(v) ? v.length : v instanceof FErr ? v : 1));
  def('COLUMNS', 'COLUMNAS', B, 'matriz', 'Número de columnas de un rango o matriz.', 'r', (v) => (v instanceof Ref ? v.cols : isArr(v) ? v[0].length : v instanceof FErr ? v : 1));
  def('AREAS', 'AREAS', B, 'referencia', 'Número de áreas de una referencia.', 'r', () => 1);
  def('CHOOSE', 'ELEGIR', B, 'núm_índice; valor1; [valor2]; …', 'Elige un valor de una lista según su posición.', null, function (a, ctx) {
    let i = toNum(scalar(ev(a[0], ctx)));
    if (i instanceof FErr) return i;
    i = Math.floor(i);
    return i < 1 || i >= a.length ? E.VALUE : ev(a[i], ctx);
  }, { lazy: true, min: 2 });
  def('ADDRESS', 'DIRECCION', B, 'fila; columna; [abs]; [a1]; [hoja]', 'Texto con la dirección de una celda, por ejemplo $B$3.', 'n n n? b? s?', (r, c, abs = 1, a1 = true, sheet) => {
    r = Math.floor(r); c = Math.floor(c);
    if (r < 1 || c < 1 || r > HC.MAX_ROWS || c > HC.MAX_COLS) return E.VALUE;
    const s = HC.addr(r - 1, c - 1, abs === 1 || abs === 2, abs === 1 || abs === 3);
    return (sheet !== undefined ? HC.quoteSheet(sheet) + '!' : '') + s;
  });
  def('TRANSPOSE', 'TRANSPONER', A, 'matriz', 'Intercambia filas por columnas.', 'a', (a) => mkArr(a[0].length, a.length, (i, j) => a[j][i]));
  def('FORMULATEXT', 'FORMULATEXTO', B, 'referencia', 'Texto de la fórmula que contiene una celda.', 'r', (v) => {
    if (!(v instanceof Ref)) return E.VALUE;
    const c = v.sheet.get(v.r1, v.c1);
    return c && c.f != null ? '=' + HC.localizeFormula(c.f) : E.NA;
  });
  def('HYPERLINK', 'HIPERVINCULO', B, 'dirección; [nombre]', 'Crea un vínculo que abre una dirección web al hacer clic.', 's e?', (url, name) => (name === undefined || name === null ? url : name));

  // ---------------------------------------------------------------- matrices dinámicas
  const kind = (v) => (v == null ? 5 : typeof v === 'number' ? 1 : typeof v === 'string' ? 2 : typeof v === 'boolean' ? 3 : 4);
  function sortCmp(a, b) {
    const ka = kind(a), kb = kind(b);
    if (ka !== kb) return ka - kb;
    if (ka === 1) return a - b;
    if (ka === 2) return a.localeCompare(b, HC.locale.lang, { sensitivity: 'base', numeric: false });
    if (ka === 3) return a === b ? 0 : a ? 1 : -1;
    return 0;
  }
  X.sortCmp = sortCmp;
  // compara respetando que los vacíos queden al final en ambos sentidos
  const ordCmp = (a, b, dir) => (a == null || b == null ? (a == null ? (b == null ? 0 : 1) : -1) : dir * sortCmp(a, b));
  def('FILTER', 'FILTRAR', A, 'matriz; incluir; [si_vacía]', 'Filtra un rango dejando solo las filas (o columnas) que cumplen una condición.', 'a a r?', (a, inc, empty) => {
    const R = a.length, C = a[0].length;
    const flags = flatten(inc);
    for (const f of flags) if (f instanceof FErr) return f;
    const keep = flags.map((f) => toBool(f) === true);
    let out;
    if (inc[0].length === 1 && inc.length === R) out = a.filter((_, i) => keep[i]);
    else if (inc.length === 1 && inc[0].length === C) { out = a.map((row) => row.filter((_, j) => keep[j])); if (!out[0].length) out = []; }
    else return E.VALUE;
    if (!out.length) return empty === undefined ? E.CALC : empty;
    return out;
  });
  def('SORT', 'ORDENAR', A, 'matriz; [índice_orden]; [criterio_orden]; [por_columnas]', 'Ordena un rango. Criterio 1 = ascendente, -1 = descendente.', 'a r? r? b?', (a, idx, ord, byCol = false) => {
    const keys = idx === undefined ? [1] : flatten(idx).map((v) => toNum(v));
    const dirs = ord === undefined ? [1] : flatten(ord).map((v) => toNum(v));
    for (const k of keys.concat(dirs)) if (k instanceof FErr) return k;
    const src = byCol ? mkArr(a[0].length, a.length, (i, j) => a[j][i]) : a;
    for (const k of keys) if (k < 1 || k > src[0].length) return E.VALUE;
    const rows = src.map((r, i) => [r, i]);
    rows.sort((p, q) => {
      for (let n = 0; n < keys.length; n++) {
        const d = (dirs[n < dirs.length ? n : dirs.length - 1] || 1) < 0 ? -1 : 1;
        const c = ordCmp(p[0][keys[n] - 1], q[0][keys[n] - 1], d);
        if (c) return c;
      }
      return p[1] - q[1];
    });
    const out = rows.map((p) => p[0]);
    return byCol ? mkArr(out[0].length, out.length, (i, j) => out[j][i]) : out;
  });
  def('SORTBY', 'ORDENARPOR', A, 'matriz; por_matriz1; [criterio_orden1]; …', 'Ordena un rango según los valores de otro rango.', 'raw', (args) => {
    if (args[0] instanceof FErr) return args[0];
    const a = toArr(args[0]), keys = [];
    for (let k = 1; k < args.length; k += 2) {
      if (args[k] instanceof FErr) return args[k];
      const by = flatten(args[k]);
      const d = args[k + 1] === undefined ? 1 : toNum(scalar(args[k + 1]));
      if (d instanceof FErr) return d;
      keys.push({ by, d: d < 0 ? -1 : 1 });
    }
    const byCol = keys.length && keys[0].by.length === a[0].length && keys[0].by.length !== a.length;
    const n = byCol ? a[0].length : a.length;
    for (const k of keys) if (k.by.length !== n) return E.VALUE;
    const order = Array.from({ length: n }, (_, i) => i);
    order.sort((p, q) => { for (const k of keys) { const c = ordCmp(k.by[p], k.by[q], k.d); if (c) return c; } return p - q; });
    return byCol ? a.map((row) => order.map((j) => row[j])) : order.map((i) => a[i]);
  }, { min: 2 });
  const keyOf = (v) => (v == null ? 'n' : typeof v === 'string' ? 's' + v.toLowerCase() : typeof v === 'number' ? 'd' + v : typeof v === 'boolean' ? 'b' + v : 'e' + v.code);
  def('UNIQUE', 'UNICOS', A, 'matriz; [por_columnas]; [solo_una_vez]', 'Lista de valores sin repetidos.', 'a b? b?', (a, byCol = false, once = false) => {
    const src = byCol ? mkArr(a[0].length, a.length, (i, j) => a[j][i]) : a;
    const seen = new Map();
    src.forEach((row, i) => { const k = row.map(keyOf).join('\u0001'); const e = seen.get(k); if (e) e.n++; else seen.set(k, { n: 1, i }); });
    const out = [];
    for (const e of seen.values()) if (!once || e.n === 1) out.push(src[e.i]);
    if (!out.length) return E.CALC;
    return byCol ? mkArr(out[0].length, out.length, (i, j) => out[j][i]) : out;
  });
  aliasEs('UNIQUE', 'UNICO');
  function takeDrop(drop) {
    return (a, r, c) => {
      const R = a.length, C = a[0].length;
      const span = (n, len) => {
        if (n === undefined) return [0, len];
        n = Math.trunc(n);
        if (drop) return n >= 0 ? [Math.min(n, len), len] : [0, Math.max(0, len + n)];
        if (n === 0) return [0, 0];
        return n > 0 ? [0, Math.min(n, len)] : [Math.max(0, len + n), len];
      };
      const [r1, r2] = span(r, R), [c1, c2] = span(c, C);
      if (r1 >= r2 || c1 >= c2) return E.CALC;
      return a.slice(r1, r2).map((row) => row.slice(c1, c2));
    };
  }
  def('TAKE', 'TOMAR', A, 'matriz; filas; [columnas]', 'Toma las primeras (o últimas, si es negativo) filas o columnas de una matriz.', 'a n? n?', takeDrop(false));
  def('DROP', 'EXCLUIR', A, 'matriz; filas; [columnas]', 'Quita las primeras (o últimas, si es negativo) filas o columnas de una matriz.', 'a n? n?', takeDrop(true));
  function choose(byCol) {
    return (args) => {
      if (args[0] instanceof FErr) return args[0];
      const a = toArr(args[0]), len = byCol ? a[0].length : a.length, idx = [];
      for (let k = 1; k < args.length; k++) for (const v of flatten(args[k])) {
        let n = toNum(v); if (n instanceof FErr) return n;
        n = Math.trunc(n); if (n === 0 || Math.abs(n) > len) return E.VALUE;
        idx.push(n > 0 ? n - 1 : len + n);
      }
      return byCol ? a.map((row) => idx.map((j) => row[j])) : idx.map((i) => a[i]);
    };
  }
  def('CHOOSECOLS', 'ELEGIRCOLS', A, 'matriz; núm_columna1; [núm_columna2]; …', 'Devuelve las columnas indicadas de una matriz.', 'raw', choose(true), { min: 2 });
  def('CHOOSEROWS', 'ELEGIRFILAS', A, 'matriz; núm_fila1; [núm_fila2]; …', 'Devuelve las filas indicadas de una matriz.', 'raw', choose(false), { min: 2 });
  def('HSTACK', 'APILARH', A, 'matriz1; [matriz2]; …', 'Une matrices una al lado de otra.', 'raw', (args) => {
    const arrs = []; for (const x of args) { if (x instanceof FErr) return x; arrs.push(toArr(x)); }
    const R = Math.max(...arrs.map((a) => a.length));
    return mkArr(R, arrs.reduce((s, a) => s + a[0].length, 0), (i, j) => {
      for (const a of arrs) { if (j < a[0].length) return i < a.length ? a[i][j] : E.NA; j -= a[0].length; }
      return null;
    });
  }, { min: 1 });
  def('VSTACK', 'APILARV', A, 'matriz1; [matriz2]; …', 'Une matrices una debajo de otra.', 'raw', (args) => {
    const arrs = []; for (const x of args) { if (x instanceof FErr) return x; arrs.push(toArr(x)); }
    const C = Math.max(...arrs.map((a) => a[0].length)), out = [];
    for (const a of arrs) for (const row of a) { const r = row.slice(); while (r.length < C) r.push(E.NA); out.push(r); }
    return out;
  }, { min: 1 });
  function toVec(asRow) {
    return (a, ignore = 0, byCol = false) => {
      const vals = [];
      if (byCol) { for (let j = 0; j < a[0].length; j++) for (let i = 0; i < a.length; i++) vals.push(a[i][j]); } else for (const row of a) for (const v of row) vals.push(v);
      const out = vals.filter((v) => !((ignore === 1 || ignore === 3) && v == null) && !((ignore === 2 || ignore === 3) && v instanceof FErr));
      if (!out.length) return E.CALC;
      return asRow ? [out] : out.map((v) => [v]);
    };
  }
  def('TOCOL', 'ENCOL', A, 'matriz; [ignorar]; [por_columnas]', 'Convierte una matriz en una sola columna.', 'a n? b?', toVec(false));
  def('TOROW', 'ENFILA', A, 'matriz; [ignorar]; [por_columnas]', 'Convierte una matriz en una sola fila.', 'a n? b?', toVec(true));
  function wrap(byRows) {
    return (a, n, pad) => {
      if (a.length > 1 && a[0].length > 1) return E.VALUE;
      n = Math.floor(n); if (n < 1) return E.NUM;
      const v = flatten(a), m = Math.ceil(v.length / n), p = pad === undefined || pad === null ? E.NA : pad;
      const at = (k) => (k < v.length ? v[k] : p);
      return byRows ? mkArr(m, n, (i, j) => at(i * n + j)) : mkArr(n, m, (i, j) => at(j * n + i));
    };
  }
  def('WRAPROWS', 'AJUSTARFILAS', A, 'vector; núm_por_fila; [relleno]', 'Reparte una fila o columna en filas de la longitud indicada.', 'a n e?', wrap(true));
  def('WRAPCOLS', 'AJUSTARCOLS', A, 'vector; núm_por_columna; [relleno]', 'Reparte una fila o columna en columnas de la longitud indicada.', 'a n e?', wrap(false));
  def('EXPAND', 'EXPANDIR', A, 'matriz; filas; [columnas]; [relleno]', 'Amplía una matriz hasta las dimensiones indicadas.', 'a n? n? e?', (a, r, c, pad) => {
    const R = r === undefined ? a.length : Math.floor(r), C = c === undefined ? a[0].length : Math.floor(c);
    if (R < a.length || C < a[0].length) return E.VALUE;
    const p = pad === undefined || pad === null ? E.NA : pad;
    return mkArr(R, C, (i, j) => (i < a.length && j < a[0].length ? a[i][j] : p));
  });
})(typeof window !== 'undefined' ? window : globalThis);
