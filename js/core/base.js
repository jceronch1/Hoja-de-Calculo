/* Hoja de Cálculo · base: espacio de nombres, errores, direcciones A1 y configuración regional.
   Todos los módulos son scripts clásicos (sin import/export) para que la app abra con doble clic. */
(function (root) {
  'use strict';
  const HC = root.HC = root.HC || {};

  HC.MAX_ROWS = 1048576;
  HC.MAX_COLS = 16384;

  // ---------------------------------------------------------------- errores
  class FErr {
    constructor(code) { this.code = code; }
    toString() { return this.code; }
  }
  HC.FErr = FErr;
  const E = HC.E = {
    NULL: new FErr('#NULL!'), DIV0: new FErr('#DIV/0!'), VALUE: new FErr('#VALUE!'),
    REF: new FErr('#REF!'), NAME: new FErr('#NAME?'), NUM: new FErr('#NUM!'),
    NA: new FErr('#N/A'), SPILL: new FErr('#SPILL!'), CALC: new FErr('#CALC!'),
    CIRC: new FErr('#CIRC!'), SYNTAX: new FErr('#ERROR!'),
  };
  const ERR_BY_CODE = {};
  for (const k in E) ERR_BY_CODE[E[k].code] = E[k];
  HC.errByCode = (code) => ERR_BY_CODE[code] || null;
  HC.isErr = (v) => v instanceof FErr;

  // Nombres de error en español (como en Excel en español).
  const ERR_ES = {
    '#NULL!': '#¡NULO!', '#DIV/0!': '#¡DIV/0!', '#VALUE!': '#¡VALOR!', '#REF!': '#¡REF!',
    '#NAME?': '#¿NOMBRE?', '#NUM!': '#¡NUM!', '#N/A': '#N/D', '#SPILL!': '#¡DESBORDAMIENTO!',
    '#CALC!': '#¡CALC!', '#CIRC!': '#¡CIRCULAR!', '#ERROR!': '#¡ERROR!',
  };
  const ERR_FROM_ES = {};
  for (const k in ERR_ES) ERR_FROM_ES[ERR_ES[k]] = k;
  HC.ERR_ES = ERR_ES;
  HC.errText = (e) => (HC.locale.lang === 'es' ? ERR_ES[e.code] : null) || e.code;
  HC.errFromText = (t) => {
    const u = String(t).toUpperCase();
    return ERR_BY_CODE[u] || ERR_BY_CODE[ERR_FROM_ES[u]] || null;
  };
  HC.errExplain = (e) => ({
    '#NULL!': 'Los rangos indicados no se cruzan.',
    '#DIV/0!': 'División entre cero o entre una celda vacía.',
    '#VALUE!': 'Un argumento u operando es de un tipo que no corresponde (por ejemplo, texto donde se espera un número).',
    '#REF!': 'La referencia no es válida: la celda u hoja ya no existe.',
    '#NAME?': 'Nombre de función o de rango no reconocido.',
    '#NUM!': 'Número no válido para esta operación o demasiado grande.',
    '#N/A': 'Valor no disponible: la búsqueda no encontró coincidencias.',
    '#SPILL!': 'El resultado ocupa varias celdas y hay datos que lo bloquean.',
    '#CALC!': 'El cálculo no produjo ningún resultado (por ejemplo, una matriz vacía).',
    '#CIRC!': 'Referencia circular: la fórmula depende de su propia celda.',
    '#ERROR!': 'La fórmula tiene un error de sintaxis.',
  })[e.code] || '';

  // ---------------------------------------------------------------- configuración regional
  HC.locale = { dec: '.', grp: ',', lang: 'es', currency: '$' };
  HC.detectLocale = function () {
    try {
      const parts = new Intl.NumberFormat(undefined).formatToParts(1234.5);
      const dec = (parts.find((p) => p.type === 'decimal') || {}).value;
      if (dec === ',') return { dec: ',', grp: '.' };
    } catch (e) { /* sin Intl */ }
    return { dec: '.', grp: ',' };
  };
  HC.setLocale = function (o) {
    Object.assign(HC.locale, o);
    if (o.dec && !o.grp) HC.locale.grp = o.dec === ',' ? '.' : ',';
  };
  HC.listSep = () => (HC.locale.dec === ',' ? ';' : ',');

  const MONTHS = {
    es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
    en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  };
  const DAYS = {
    es: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
    en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  };
  HC.monthNames = (lang) => MONTHS[lang || HC.locale.lang] || MONTHS.es;
  HC.dayNames = (lang) => DAYS[lang || HC.locale.lang] || DAYS.es;
  HC.boolText = (b) => (HC.locale.lang === 'es' ? (b ? 'VERDADERO' : 'FALSO') : (b ? 'TRUE' : 'FALSE'));

  // ---------------------------------------------------------------- direcciones A1 (índices base 0)
  const colCache = [];
  HC.colName = function (c) {
    if (colCache[c]) return colCache[c];
    let s = '', n = c + 1;
    while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; }
    return (colCache[c] = s);
  };
  HC.colIndex = function (s) {
    let n = 0;
    for (let i = 0; i < s.length; i++) {
      const k = s.charCodeAt(i) & ~32; // mayúscula
      n = n * 26 + (k - 64);
    }
    return n - 1;
  };
  HC.addr = (r, c, absR, absC) => (absC ? '$' : '') + HC.colName(c) + (absR ? '$' : '') + (r + 1);
  HC.rangeAddr = function (g, abs) {
    const a = HC.addr(g.r1, g.c1, abs, abs);
    if (g.r1 === g.r2 && g.c1 === g.c2) return a;
    if (g.r1 === 0 && g.r2 >= HC.MAX_ROWS - 1) return (abs ? '$' : '') + HC.colName(g.c1) + ':' + (abs ? '$' : '') + HC.colName(g.c2);
    if (g.c1 === 0 && g.c2 >= HC.MAX_COLS - 1) return (abs ? '$' : '') + (g.r1 + 1) + ':' + (abs ? '$' : '') + (g.r2 + 1);
    return a + ':' + HC.addr(g.r2, g.c2, abs, abs);
  };
  const RE_A1 = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})(?::\$?([A-Za-z]{1,3})\$?(\d{1,7}))?$/;
  const RE_COLS = /^\$?([A-Za-z]{1,3}):\$?([A-Za-z]{1,3})$/;
  const RE_ROWS = /^\$?(\d{1,7}):\$?(\d{1,7})$/;
  // "A1", "A1:B5", "A:C", "2:9" -> {r1,c1,r2,c2} o null
  HC.parseA1 = function (text) {
    const t = String(text).trim();
    let m = RE_A1.exec(t);
    if (m) {
      let c1 = HC.colIndex(m[1]), r1 = +m[2] - 1;
      let c2 = m[3] ? HC.colIndex(m[3]) : c1, r2 = m[4] ? +m[4] - 1 : r1;
      if (c1 > c2) [c1, c2] = [c2, c1];
      if (r1 > r2) [r1, r2] = [r2, r1];
      if (r1 < 0 || r2 >= HC.MAX_ROWS || c2 >= HC.MAX_COLS) return null;
      return { r1, c1, r2, c2 };
    }
    m = RE_COLS.exec(t);
    if (m) {
      let c1 = HC.colIndex(m[1]), c2 = HC.colIndex(m[2]);
      if (c1 > c2) [c1, c2] = [c2, c1];
      if (c2 >= HC.MAX_COLS) return null;
      return { r1: 0, c1, r2: HC.MAX_ROWS - 1, c2 };
    }
    m = RE_ROWS.exec(t);
    if (m) {
      let r1 = +m[1] - 1, r2 = +m[2] - 1;
      if (r1 > r2) [r1, r2] = [r2, r1];
      if (r1 < 0 || r2 >= HC.MAX_ROWS) return null;
      return { r1, c1: 0, r2, c2: HC.MAX_COLS - 1 };
    }
    return null;
  };
  // "Hoja1!A1:B2" o "'Mi hoja'!A1" -> {sheet, r1,c1,r2,c2} (sheet puede faltar)
  HC.parseSheetRange = function (text) {
    const t = String(text).trim();
    const m = /^(?:'((?:[^']|'')+)'|([^'!]+))!(.+)$/.exec(t);
    if (!m) { const g = HC.parseA1(t); return g; }
    const g = HC.parseA1(m[3]);
    if (!g) return null;
    g.sheet = m[1] != null ? m[1].replace(/''/g, "'") : m[2];
    return g;
  };
  HC.quoteSheet = function (name) {
    if (/^[A-Za-z_À-ɏ][\w.À-ɏ]*$/.test(name) && !/^[A-Za-z]{1,3}\d+$/.test(name)) return name;
    return "'" + name.replace(/'/g, "''") + "'";
  };

  // ---------------------------------------------------------------- utilidades varias
  HC.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  HC.normRange = function (g) {
    return { r1: Math.min(g.r1, g.r2), c1: Math.min(g.c1, g.c2), r2: Math.max(g.r1, g.r2), c2: Math.max(g.c1, g.c2) };
  };
  HC.inRange = (g, r, c) => r >= g.r1 && r <= g.r2 && c >= g.c1 && c <= g.c2;
  HC.rangesIntersect = (a, b) => a.r1 <= b.r2 && a.r2 >= b.r1 && a.c1 <= b.c2 && a.c2 >= b.c1;
  HC.sameRange = (a, b) => a.r1 === b.r1 && a.c1 === b.c1 && a.r2 === b.r2 && a.c2 === b.c2;
  // Quita acentos conservando la ñ (para comparar nombres de función y texto).
  HC.fold = function (s) {
    return String(s).replace(/ñ/g, '\u0001').replace(/Ñ/g, '\u0002')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\u0001/g, 'ñ').replace(/\u0002/g, 'Ñ');
  };
  HC.uid = (() => { let n = 0; return (p) => (p || 'id') + (++n).toString(36) + Date.now().toString(36).slice(-4); })();
})(typeof window !== 'undefined' ? window : globalThis);
