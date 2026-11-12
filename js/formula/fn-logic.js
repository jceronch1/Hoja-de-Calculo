/* Funciones lógicas, de información y LAMBDA. */
(function (root) {
  'use strict';
  const HC = root.HC, E = HC.E, FErr = HC.FErr, X = HC.fx;
  const { def, aliasEs, ev, toNum, toStr, toBool, deref, scalar, toArr, liftN, Ref, Lambda, flatten, eachArg, mkArr } = X;
  const isArr = Array.isArray;
  const L = 'L', I = 'I';
  const multi = (v) => isArr(v) && !(v.length === 1 && v[0].length === 1);
  const one = (v) => (isArr(v) ? v[0][0] : v);

  def('IF', 'SI', L, 'prueba_lógica; [valor_si_verdadero]; [valor_si_falso]', 'Devuelve un valor si la condición es verdadera y otro si es falsa.', null, function (a, ctx) {
    let c = deref(ev(a[0], ctx));
    if (multi(c)) {
      const t = a.length > 1 ? deref(ev(a[1], ctx)) : true, f = a.length > 2 ? deref(ev(a[2], ctx)) : false;
      return liftN([c, t, f], (x) => { const b = toBool(x[0]); return b instanceof FErr ? b : b ? x[1] : x[2]; });
    }
    const b = toBool(one(c));
    if (b instanceof FErr) return b;
    if (b) return a.length > 1 ? ev(a[1], ctx) : true;
    return a.length > 2 ? ev(a[2], ctx) : false;
  }, { lazy: true, min: 2, max: 3 });
  function ifErr(test) {
    return function (a, ctx) {
      const v = deref(ev(a[0], ctx));
      if (multi(v)) {
        if (!flatten(v).some(test)) return v;
        const alt = a.length > 1 ? deref(ev(a[1], ctx)) : '';
        return liftN([v, alt], (x) => (test(x[0]) ? x[1] : x[0]));
      }
      const s = one(v);
      return test(s) ? (a.length > 1 ? ev(a[1], ctx) : '') : (v === undefined ? null : v);
    };
  }
  def('IFERROR', 'SI.ERROR', L, 'valor; valor_si_error', 'Devuelve otro valor cuando la fórmula da error.', null, ifErr((v) => v instanceof FErr), { lazy: true, min: 1, max: 2 });
  def('IFNA', 'SI.ND', L, 'valor; valor_si_nd', 'Devuelve otro valor cuando la fórmula da #N/D.', null, ifErr((v) => v instanceof FErr && v.code === '#N/A'), { lazy: true, min: 1, max: 2 });
  def('IFS', 'SI.CONJUNTO', L, 'prueba1; valor1; [prueba2; valor2]; …', 'Comprueba varias condiciones y devuelve el valor de la primera que se cumple.', null, function (a, ctx) {
    if (a.length % 2) return E.VALUE;
    for (let i = 0; i < a.length; i += 2) {
      const b = toBool(scalar(ev(a[i], ctx)));
      if (b instanceof FErr) return b;
      if (b) return ev(a[i + 1], ctx);
    }
    return E.NA;
  }, { lazy: true, min: 2 });
  def('SWITCH', 'CAMBIAR', L, 'expresión; valor1; resultado1; [valor2; resultado2]; …; [predeterminado]', 'Compara una expresión con una lista de valores y devuelve el resultado del primero que coincide.', null, function (a, ctx) {
    const x = scalar(ev(a[0], ctx));
    if (x instanceof FErr) return x;
    let i = 1;
    for (; i + 1 < a.length; i += 2) {
      const v = scalar(ev(a[i], ctx));
      if (v instanceof FErr) return v;
      if (X.cmpVals(x, v) === 0 && typeof x === typeof v) return ev(a[i + 1], ctx);
    }
    return i < a.length ? ev(a[i], ctx) : E.NA;
  }, { lazy: true, min: 3 });
  function logical(init, comb) {
    return (args) => {
      let acc = init, seen = false, err = null;
      eachArg(args, (v, fromRange) => {
        if (v instanceof FErr) { err = v; return false; }
        let b;
        if (typeof v === 'boolean') b = v;
        else if (typeof v === 'number') b = v !== 0;
        else if (fromRange) return undefined;
        else { b = toBool(v); if (b instanceof FErr) { err = b; return false; } }
        seen = true; acc = comb(acc, b);
        return undefined;
      });
      return err || (seen ? acc : E.VALUE);
    };
  }
  def('AND', 'Y', L, 'valor_lógico1; [valor_lógico2]; …', 'VERDADERO si todas las condiciones se cumplen.', 'raw', logical(true, (a, b) => a && b), { min: 1 });
  def('OR', 'O', L, 'valor_lógico1; [valor_lógico2]; …', 'VERDADERO si alguna condición se cumple.', 'raw', logical(false, (a, b) => a || b), { min: 1 });
  def('XOR', 'XO', L, 'valor_lógico1; [valor_lógico2]; …', 'VERDADERO si el número de condiciones verdaderas es impar.', 'raw', logical(false, (a, b) => a !== b), { min: 1 });
  def('NOT', 'NO', L, 'valor_lógico', 'Invierte un valor lógico.', 'b', (b) => !b);
  def('TRUE', 'VERDADERO', L, '', 'Valor lógico VERDADERO.', '', () => true);
  def('FALSE', 'FALSO', L, '', 'Valor lógico FALSO.', '', () => false);

  // ---------------------------------------------------------------- LET y LAMBDA
  const scope = (ctx, name, value) => Object.assign({}, ctx, { vars: { parent: ctx.vars, map: { [name.toUpperCase()]: value } } });
  def('LET', 'LET', L, 'nombre1; valor1; [nombre2; valor2]; …; cálculo', 'Asigna nombres a resultados intermedios para usarlos en un cálculo.', null, function (a, ctx) {
    if (a.length % 2 === 0) return E.VALUE;
    let sc = ctx;
    for (let i = 0; i + 1 < a.length; i += 2) {
      if (a[i].t !== 'name') return E.VALUE;
      sc = scope(sc, a[i].v, ev(a[i + 1], sc));
    }
    return ev(a[a.length - 1], sc);
  }, { lazy: true, min: 3 });
  def('LAMBDA', 'LAMBDA', L, '[parámetro1]; …; cálculo', 'Crea una función propia que puede llamarse con argumentos.', null, function (a, ctx) {
    const params = [];
    for (let i = 0; i < a.length - 1; i++) { if (a[i].t !== 'name') return E.VALUE; params.push(a[i].v.toUpperCase()); }
    return new Lambda(params, a[a.length - 1], ctx);
  }, { lazy: true, min: 1 });
  def('ISOMITTED', 'ISOMITTED', L, 'argumento', 'Indica si falta un argumento en una LAMBDA.', null, function (a, ctx) { return ev(a[0], ctx) === undefined; }, { lazy: true, min: 1, max: 1 });
  const lam = (v) => (v instanceof Lambda ? v : null);
  def('MAP', 'MAP', 'A', 'matriz1; [matriz2]; …; lambda', 'Aplica una LAMBDA a cada valor de una o varias matrices.', 'raw', (args) => {
    const f = lam(args[args.length - 1]); if (!f) return E.VALUE;
    const arrs = args.slice(0, -1).map(toArr);
    const R = arrs[0].length, C = arrs[0][0].length;
    return mkArr(R, C, (i, j) => { const r = scalar(f.invoke(arrs.map((a) => (a[i] && j < a[i].length ? a[i][j] : E.NA)))); return r === undefined ? null : r; });
  }, { min: 2 });
  def('REDUCE', 'REDUCE', 'A', '[valor_inicial]; matriz; lambda', 'Reduce una matriz a un valor acumulando con una LAMBDA.', 'raw', (args) => {
    const f = lam(args[2]); if (!f) return E.VALUE;
    let acc = args[0];
    for (const v of flatten(args[1])) acc = f.invoke([acc, v]);
    return acc;
  }, { min: 3, max: 3 });
  def('SCAN', 'SCAN', 'A', '[valor_inicial]; matriz; lambda', 'Recorre una matriz devolviendo cada valor acumulado.', 'raw', (args) => {
    const f = lam(args[2]); if (!f) return E.VALUE;
    let acc = args[0];
    return X.mapArr(toArr(args[1]), (v) => { acc = scalar(f.invoke([acc, v])); return acc === undefined ? null : acc; });
  }, { min: 3, max: 3 });
  def('BYROW', 'BYROW', 'A', 'matriz; lambda', 'Aplica una LAMBDA a cada fila y devuelve una columna de resultados.', 'raw', (args) => {
    const f = lam(args[1]); if (!f) return E.VALUE;
    return toArr(args[0]).map((row) => [scalar(f.invoke([[row]]))]);
  }, { min: 2, max: 2 });
  def('BYCOL', 'BYCOL', 'A', 'matriz; lambda', 'Aplica una LAMBDA a cada columna y devuelve una fila de resultados.', 'raw', (args) => {
    const f = lam(args[1]); if (!f) return E.VALUE;
    const a = toArr(args[0]);
    return [a[0].map((_, j) => scalar(f.invoke([a.map((r) => [r[j]])])))];
  }, { min: 2, max: 2 });
  def('MAKEARRAY', 'MAKEARRAY', 'A', 'filas; columnas; lambda', 'Crea una matriz calculando cada celda con una LAMBDA(fila; columna).', 'raw', (args) => {
    const r = toNum(scalar(args[0])), c = toNum(scalar(args[1])), f = lam(args[2]);
    if (r instanceof FErr) return r; if (c instanceof FErr) return c;
    if (!f || r < 1 || c < 1) return E.VALUE;
    if (r * c > 1e6) return E.NUM;
    return mkArr(Math.floor(r), Math.floor(c), (i, j) => { const v = scalar(f.invoke([i + 1, j + 1])); return v === undefined ? null : v; });
  }, { min: 3, max: 3 });

  // ---------------------------------------------------------------- información
  def('ISBLANK', 'ESBLANCO', I, 'valor', 'VERDADERO si la celda está vacía.', 'e', (v) => v == null);
  def('ISERROR', 'ESERROR', I, 'valor', 'VERDADERO si el valor es cualquier error.', 'e', (v) => v instanceof FErr);
  def('ISERR', 'ESERR', I, 'valor', 'VERDADERO si el valor es un error distinto de #N/D.', 'e', (v) => v instanceof FErr && v.code !== '#N/A');
  def('ISNA', 'ESNOD', I, 'valor', 'VERDADERO si el valor es el error #N/D.', 'e', (v) => v instanceof FErr && v.code === '#N/A');
  def('ISNUMBER', 'ESNUMERO', I, 'valor', 'VERDADERO si el valor es un número.', 'e', (v) => typeof v === 'number');
  def('ISTEXT', 'ESTEXTO', I, 'valor', 'VERDADERO si el valor es texto.', 'e', (v) => typeof v === 'string');
  def('ISNONTEXT', 'ESNOTEXTO', I, 'valor', 'VERDADERO si el valor no es texto.', 'e', (v) => typeof v !== 'string');
  def('ISLOGICAL', 'ESLOGICO', I, 'valor', 'VERDADERO si el valor es lógico.', 'e', (v) => typeof v === 'boolean');
  def('ISEVEN', 'ES.PAR', I, 'número', 'VERDADERO si el número es par.', 'n', (x) => Math.floor(Math.abs(x)) % 2 === 0);
  def('ISODD', 'ES.IMPAR', I, 'número', 'VERDADERO si el número es impar.', 'n', (x) => Math.floor(Math.abs(x)) % 2 === 1);
  def('ISREF', 'ESREF', I, 'valor', 'VERDADERO si el valor es una referencia.', 'r', (v) => v instanceof Ref);
  def('ISFORMULA', 'ESFORMULA', I, 'referencia', 'VERDADERO si la celda contiene una fórmula.', 'r', (v) => {
    if (!(v instanceof Ref)) return E.VALUE;
    const c = v.sheet.get(v.r1, v.c1); return !!(c && (c.f != null || c.g));
  });
  def('NA', 'NOD', I, '', 'Devuelve el error #N/D (valor no disponible).', '', () => E.NA);
  def('N', 'N', I, 'valor', 'Convierte un valor en número (texto = 0, VERDADERO = 1).', 'e', (v) => (typeof v === 'number' ? v : v === true ? 1 : v instanceof FErr ? v : 0));
  def('TYPE', 'TIPO', I, 'valor', 'Tipo de un valor: 1 número, 2 texto, 4 lógico, 16 error, 64 matriz.', 'r', (v) => {
    if (v instanceof Ref) { if (!v.single) return 64; v = v.val(0, 0); }
    if (isArr(v)) return 64;
    return typeof v === 'string' ? 2 : typeof v === 'boolean' ? 4 : v instanceof FErr ? 16 : 1;
  });
  const ERRNUM = { '#NULL!': 1, '#DIV/0!': 2, '#VALUE!': 3, '#REF!': 4, '#NAME?': 5, '#NUM!': 6, '#N/A': 7, '#SPILL!': 9, '#CALC!': 14 };
  def('ERROR.TYPE', 'TIPO.DE.ERROR', I, 'valor_de_error', 'Número que identifica el tipo de error.', 'e', (v) => (v instanceof FErr ? ERRNUM[v.code] || 8 : E.NA));
  def('SHEET', 'HOJA', I, '[valor]', 'Número de la hoja de la referencia.', 'raw', function (args, ctx) {
    const v = args[0];
    if (v === undefined) return ctx.wb.sheets.indexOf(ctx.sheet) + 1;
    if (v instanceof Ref) return ctx.wb.sheets.indexOf(v.sheet) + 1;
    const s = ctx.wb.sheetByName(toStr(scalar(v)));
    return s ? ctx.wb.sheets.indexOf(s) + 1 : E.NA;
  }, { max: 1 });
  def('SHEETS', 'HOJAS', I, '', 'Número de hojas del libro.', 'raw', function (args, ctx) { return ctx.wb.sheets.length; }, { max: 1 });
  def('CELL', 'CELDA', I, 'tipo_de_info; [referencia]', 'Información de una celda: "direccion", "fila", "columna", "contenido", "tipo".', 'raw', function (args, ctx) {
    const kind = HC.fold(String(toStr(scalar(args[0])))).toLowerCase();
    const ref = args[1] instanceof Ref ? args[1] : new Ref(ctx.sheet, ctx.r, ctx.c, ctx.r, ctx.c);
    switch (kind) {
      case 'address': case 'direccion': return HC.addr(ref.r1, ref.c1, true, true);
      case 'row': case 'fila': return ref.r1 + 1;
      case 'col': case 'columna': return ref.c1 + 1;
      case 'contents': case 'contenido': { const v = ref.val(0, 0); return v == null ? 0 : v; }
      case 'type': case 'tipo': { const v = ref.val(0, 0); return v == null ? 'b' : typeof v === 'string' ? 'l' : 'v'; }
      case 'filename': case 'nombrearchivo': return ref.sheet.name;
      case 'width': case 'ancho': return Math.round(ref.sheet.colW.size(ref.c1) / 7);
    }
    return E.VALUE;
  }, { min: 1, max: 2 });
})(typeof window !== 'undefined' ? window : globalThis);
