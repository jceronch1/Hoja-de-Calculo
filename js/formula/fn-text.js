/* Funciones de texto. */
(function (root) {
  'use strict';
  const HC = root.HC, E = HC.E, FErr = HC.FErr, X = HC.fx;
  const { def, aliasEs, alias, toNum, toStr, toBool, scalar, toArr, flatten, eachArg, Ref } = X;
  const isArr = Array.isArray;
  const T = 'T';

  def('LEN', 'LARGO', T, 'texto', 'Número de caracteres de un texto.', 's', (s) => s.length);
  def('LOWER', 'MINUSC', T, 'texto', 'Convierte el texto a minúsculas.', 's', (s) => s.toLowerCase());
  def('UPPER', 'MAYUSC', T, 'texto', 'Convierte el texto a mayúsculas.', 's', (s) => s.toUpperCase());
  def('PROPER', 'NOMPROPIO', T, 'texto', 'Pone en mayúscula la primera letra de cada palabra.', 's', (s) => s.toLowerCase().replace(/(^|[^\p{L}])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()));
  def('TRIM', 'ESPACIOS', T, 'texto', 'Quita los espacios sobrantes (deja uno entre palabras).', 's', (s) => s.replace(/ +/g, ' ').replace(/^ | $/g, ''));
  aliasEs('TRIM', 'RECORTAR');
  def('CLEAN', 'LIMPIAR', T, 'texto', 'Quita los caracteres no imprimibles.', 's', (s) => s.replace(/[\x00-\x1f]/g, ''));
  def('LEFT', 'IZQUIERDA', T, 'texto; [núm_caracteres]', 'Primeros caracteres de un texto.', 's n?', (s, n = 1) => (n < 0 ? E.VALUE : s.slice(0, Math.floor(n))));
  def('RIGHT', 'DERECHA', T, 'texto; [núm_caracteres]', 'Últimos caracteres de un texto.', 's n?', (s, n = 1) => { n = Math.floor(n); return n < 0 ? E.VALUE : n === 0 ? '' : s.slice(-n); });
  def('MID', 'EXTRAE', T, 'texto; posición_inicial; núm_caracteres', 'Caracteres del medio de un texto.', 's n n', (s, a, n) => { a = Math.floor(a); n = Math.floor(n); return a < 1 || n < 0 ? E.VALUE : s.substr(a - 1, n); });
  aliasEs('MID', 'MED');
  def('REPT', 'REPETIR', T, 'texto; núm_veces', 'Repite un texto el número de veces indicado.', 's n', (s, n) => { n = Math.floor(n); if (n < 0 || s.length * n > 32767) return E.VALUE; return s.repeat(n); });
  def('EXACT', 'IGUAL', T, 'texto1; texto2', 'Comprueba si dos textos son idénticos (distingue mayúsculas).', 's s', (a, b) => a === b);
  def('CHAR', 'CARACTER', T, 'número', 'Carácter correspondiente a un código.', 'n', (n) => { n = Math.floor(n); return n < 1 || n > 255 ? E.VALUE : String.fromCharCode(n); });
  aliasEs('CHAR', 'CAR');
  def('UNICHAR', 'UNICAR', T, 'número', 'Carácter Unicode correspondiente a un número.', 'n', (n) => { n = Math.floor(n); if (n < 1 || n > 0x10ffff) return E.VALUE; return String.fromCodePoint(n); });
  def('CODE', 'CODIGO', T, 'texto', 'Código numérico del primer carácter de un texto.', 's', (s) => (s ? s.charCodeAt(0) : E.VALUE));
  def('UNICODE', 'UNICODE', T, 'texto', 'Número Unicode del primer carácter de un texto.', 's', (s) => (s ? s.codePointAt(0) : E.VALUE));
  def('FIND', 'ENCONTRAR', T, 'texto_buscado; dentro_del_texto; [núm_inicial]', 'Posición de un texto dentro de otro (distingue mayúsculas).', 's s n?', (f, s, start = 1) => {
    start = Math.floor(start); if (start < 1 || start > s.length + 1) return E.VALUE;
    const i = s.indexOf(f, start - 1); return i < 0 ? E.VALUE : i + 1;
  });
  def('SEARCH', 'HALLAR', T, 'texto_buscado; dentro_del_texto; [núm_inicial]', 'Posición de un texto dentro de otro (sin distinguir mayúsculas; admite comodines).', 's s n?', (f, s, start = 1) => {
    start = Math.floor(start); if (start < 1 || start > s.length + 1) return E.VALUE;
    if (!/[*?~]/.test(f)) { const i = s.toLowerCase().indexOf(f.toLowerCase(), start - 1); return i < 0 ? E.VALUE : i + 1; }
    const src = X.wildcardRe(f).source.slice(1, -1); // sin ^ ni $
    const m = new RegExp(src, 'i').exec(s.slice(start - 1));
    return m ? m.index + start : E.VALUE;
  });
  def('REPLACE', 'REEMPLAZAR', T, 'texto_original; núm_inicial; núm_caracteres; texto_nuevo', 'Sustituye parte de un texto según su posición.', 's n n s', (s, a, n, t) => { a = Math.floor(a); n = Math.floor(n); return a < 1 || n < 0 ? E.VALUE : s.slice(0, a - 1) + t + s.slice(a - 1 + n); });
  def('SUBSTITUTE', 'SUSTITUIR', T, 'texto; texto_original; texto_nuevo; [núm_instancia]', 'Sustituye un texto por otro dentro de una cadena.', 's s s n?', (s, o, t, inst) => {
    if (!o) return s;
    if (inst === undefined) return s.split(o).join(t);
    inst = Math.floor(inst); if (inst < 1) return E.VALUE;
    let i = -1, k = 0;
    while ((i = s.indexOf(o, i + 1)) >= 0) { if (++k === inst) return s.slice(0, i) + t + s.slice(i + o.length); i += o.length - 1; }
    return s;
  });
  def('CONCATENATE', 'CONCATENAR', T, 'texto1; [texto2]; …', 'Une varios textos en uno solo.', 's+', (...a) => a.join(''));
  def('CONCAT', 'CONCAT', T, 'texto1; [texto2]; …', 'Une textos o rangos enteros en un solo texto.', 'raw', (args) => {
    let out = '';
    for (const a of args) for (const v of flatten(a)) { if (v instanceof FErr) return v; out += toStr(v); }
    return out;
  }, { min: 1 });
  def('TEXTJOIN', 'UNIRCADENAS', T, 'delimitador; ignorar_vacías; texto1; [texto2]; …', 'Une textos o rangos con un delimitador entre ellos.', 'raw', (args) => {
    const delims = flatten(args[0]).map((d) => toStr(d));
    const skip = toBool(scalar(args[1])); if (skip instanceof FErr) return skip;
    const parts = [];
    for (let k = 2; k < args.length; k++) for (const v of flatten(args[k])) {
      if (v instanceof FErr) return v;
      const s = toStr(v); if (skip && s === '') continue; parts.push(s);
    }
    let out = '';
    parts.forEach((p, i) => { out += (i ? delims[(i - 1) % delims.length] : '') + p; });
    return out;
  }, { min: 3 });
  aliasEs('TEXTJOIN', 'UNIRCADENA');
  def('T', 'T', T, 'valor', 'Devuelve el valor si es texto; si no, texto vacío.', 'v', (v) => (typeof v === 'string' ? v : ''));
  def('TEXT', 'TEXTO', T, 'valor; formato', 'Convierte un valor en texto con el formato indicado, por ejemplo "0,00" o "dd/mm/aaaa".', 'v s', (v, f) => {
    if (typeof v === 'string') { const n = HC.textToNumber(v); if (n == null) return v; v = n; }
    if (typeof v === 'boolean') return HC.boolText(v);
    if (v == null) v = 0;
    // en configuración con coma decimal el usuario escribe "0,00": se pasa a la forma canónica
    if (HC.locale.dec === ',') f = f.replace(/"[^"]*"|[.,]/g, (m) => (m === ',' ? '.' : m === '.' ? ',' : m));
    return HC.fmt.format(v, f || 'General').text;
  });
  def('VALUE', 'VALOR', T, 'texto', 'Convierte un texto que representa un número en número.', 'v', (v) => {
    if (typeof v === 'number') return v;
    if (v == null) return 0;
    if (typeof v !== 'string') return E.VALUE;
    const n = HC.textToNumber(v); return n == null ? E.VALUE : n;
  });
  def('NUMBERVALUE', 'VALOR.NUMERO', T, 'texto; [separador_decimal]; [separador_grupo]', 'Convierte texto en número indicando los separadores.', 's s? s?', (s, d, g) => {
    d = d === undefined ? HC.locale.dec : d[0]; g = g === undefined ? HC.locale.grp : g[0];
    let t = s.replace(/\s/g, ''); if (t === '') return 0;
    let pct = 0; while (t.endsWith('%')) { pct++; t = t.slice(0, -1); }
    if (g) t = t.split(g).join('');
    if (d && d !== '.') { if (t.indexOf('.') >= 0) return E.VALUE; t = t.replace(d, '.'); }
    if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return E.VALUE;
    return parseFloat(t) / Math.pow(100, pct);
  });
  def('FIXED', 'DECIMAL', T, 'número; [decimales]; [no_separar_millares]', 'Da formato de texto a un número con decimales fijos.', 'n n? b?', (x, d = 2, noSep = false) => {
    d = Math.floor(d);
    const v = X.rnd(x, d, 0);
    return HC.fmt.format(v, (noSep ? '0' : '#,##0') + (d > 0 ? '.' + '0'.repeat(Math.min(d, 30)) : '')).text;
  });
  def('DOLLAR', 'MONEDA', T, 'número; [decimales]', 'Convierte un número en texto con formato de moneda.', 'n n?', (x, d = 2) => {
    d = Math.floor(d);
    const v = X.rnd(x, d, 0), code = '#,##0' + (d > 0 ? '.' + '0'.repeat(Math.min(d, 30)) : '');
    return (v < 0 ? '-' : '') + HC.locale.currency + HC.fmt.format(Math.abs(v), code).text;
  });

  // ---------------------------------------------------------------- texto antes/después/dividir
  function findDelims(s, delims, ci) {
    // posiciones [inicio, longitud] de cada aparición de cualquiera de los delimitadores
    const hay = ci ? s.toLowerCase() : s, out = [];
    const ds = delims.filter((d) => d !== '').map((d) => (ci ? d.toLowerCase() : d));
    let i = 0;
    while (i < hay.length) {
      let hit = null;
      for (const d of ds) if (hay.startsWith(d, i) && (!hit || d.length > hit.length)) hit = d;
      if (hit) { out.push([i, hit.length]); i += hit.length; } else i++;
    }
    return out;
  }
  function beforeAfter(after) {
    return (args) => {
      const s = toStr(scalar(args[0])); if (s instanceof FErr) return s;
      const delims = flatten(args[1]).map((d) => toStr(d));
      let inst = args[2] === undefined ? 1 : toNum(scalar(args[2])); if (inst instanceof FErr) return inst;
      const ci = args[3] !== undefined && toNum(scalar(args[3])) === 1;
      const matchEnd = args[4] !== undefined && toBool(scalar(args[4])) === true;
      const nf = args[5];
      inst = Math.trunc(inst); if (inst === 0) return E.VALUE;
      const hits = findDelims(s, delims, ci);
      let k = inst > 0 ? inst - 1 : hits.length + inst;
      if (k < 0 || k >= hits.length) {
        if (matchEnd && (k === hits.length || k === -1)) return after ? (inst > 0 ? '' : s) : (inst > 0 ? s : '');
        return nf === undefined ? E.NA : scalar(nf);
      }
      return after ? s.slice(hits[k][0] + hits[k][1]) : s.slice(0, hits[k][0]);
    };
  }
  def('TEXTBEFORE', 'TEXTOANTES', T, 'texto; delimitador; [núm_instancia]; [modo]; [coincidir_final]; [si_no_se_encuentra]', 'Texto que aparece antes de un delimitador.', 'raw', beforeAfter(false), { min: 2, max: 6 });
  def('TEXTAFTER', 'TEXTODESPUES', T, 'texto; delimitador; [núm_instancia]; [modo]; [coincidir_final]; [si_no_se_encuentra]', 'Texto que aparece después de un delimitador.', 'raw', beforeAfter(true), { min: 2, max: 6 });
  def('TEXTSPLIT', 'DIVIDIRTEXTO', 'A', 'texto; delimitador_columna; [delimitador_fila]; [ignorar_vacías]; [modo]; [relleno]', 'Divide un texto en columnas y filas según los delimitadores.', 'raw', (args) => {
    const s = toStr(scalar(args[0])); if (s instanceof FErr) return s;
    const cd = args[1] === undefined ? [] : flatten(args[1]).map((d) => toStr(d));
    const rd = args[2] === undefined ? [] : flatten(args[2]).map((d) => toStr(d));
    const skip = args[3] !== undefined && toBool(scalar(args[3])) === true;
    const ci = args[4] !== undefined && toNum(scalar(args[4])) === 1;
    const pad = args[5] === undefined ? E.NA : scalar(args[5]);
    const split = (text, ds) => {
      if (!ds.length || ds.every((d) => d === '')) return [text];
      const hits = findDelims(text, ds, ci), out = []; let p = 0;
      for (const [i, len] of hits) { out.push(text.slice(p, i)); p = i + len; }
      out.push(text.slice(p));
      return skip ? out.filter((x) => x !== '') : out;
    };
    const rows = split(s, rd).map((r) => split(r, cd));
    const w = Math.max(1, ...rows.map((r) => r.length));
    if (!rows.length) return E.CALC;
    return rows.map((r) => { const o = r.slice(); while (o.length < w) o.push(pad); return o; });
  }, { min: 2, max: 6 });

  function valToText(v, strict) {
    if (v == null) return '';
    if (v instanceof FErr) return HC.errText(v);
    if (typeof v === 'string') return strict ? '"' + v.replace(/"/g, '""') + '"' : v;
    return toStr(v);
  }
  def('VALUETOTEXT', 'VALORATEXTO', T, 'valor; [formato]', 'Devuelve el texto de un valor.', 'e n?', (v, f = 0) => valToText(v, f === 1));
  def('ARRAYTOTEXT', 'MATRIZATEXTO', T, 'matriz; [formato]', 'Devuelve el texto de una matriz de valores.', 'a n?', (a, f = 0) => {
    if (f === 1) return '{' + a.map((r) => r.map((v) => valToText(v, true)).join(HC.locale.dec === ',' ? '\\' : ',')).join(';') + '}';
    return flatten(a).map((v) => valToText(v, false)).join(HC.listSep() + ' ');
  });
  def('ENCODEURL', 'URLCODIF', T, 'texto', 'Codifica un texto para usarlo en una dirección URL.', 's', (s) => encodeURIComponent(s));

  // ---------------------------------------------------------------- expresiones regulares
  function mkRe(p, ci, g) { try { return new RegExp(p, (ci ? 'i' : '') + (g ? 'g' : '') + 'u'); } catch (e) { return null; } }
  def('REGEXTEST', 'REGEXTEST', T, 'texto; patrón; [sin_distinguir_mayúsculas]', 'Comprueba si un texto coincide con una expresión regular.', 's s n?', (s, p, ci = 0) => { const re = mkRe(p, ci); return re ? re.test(s) : E.VALUE; });
  alias('REGEXMATCH', 'REGEXTEST');
  def('REGEXEXTRACT', 'REGEXEXTRACT', T, 'texto; patrón; [modo]; [sin_distinguir_mayúsculas]', 'Extrae el texto que coincide con una expresión regular (modo 1 = todas las coincidencias, 2 = grupos).', 's s n? n?', (s, p, mode = 0, ci = 0) => {
    const re = mkRe(p, ci, mode === 1); if (!re) return E.VALUE;
    if (mode === 1) { const all = s.match(re); return all ? [all] : E.NA; }
    const m = re.exec(s); if (!m) return E.NA;
    if (mode === 2) return m.length > 1 ? [m.slice(1).map((x) => (x == null ? '' : x))] : m[0];
    return m[0];
  });
  def('REGEXREPLACE', 'REGEXREPLACE', T, 'texto; patrón; reemplazo; [núm_coincidencia]; [sin_distinguir_mayúsculas]', 'Reemplaza el texto que coincide con una expresión regular.', 's s s n? n?', (s, p, rep, occ = 0, ci = 0) => {
    const re = mkRe(p, ci, true); if (!re) return E.VALUE;
    occ = Math.trunc(occ);
    if (occ === 0) return s.replace(re, rep);
    const all = Array.from(s.matchAll(re)); const k = occ > 0 ? occ - 1 : all.length + occ;
    if (k < 0 || k >= all.length) return s;
    const m = all[k];
    return s.slice(0, m.index) + m[0].replace(mkRe(p, ci), rep) + s.slice(m.index + m[0].length);
  });
})(typeof window !== 'undefined' ? window : globalThis);
