/* Funciones estadísticas: conteos, promedios, dispersión, posición, regresión y distribuciones. */
(function (root) {
  'use strict';
  const HC = root.HC, E = HC.E, FErr = HC.FErr, X = HC.fx;
  const { def, aliasEs, alias, toNum, scalar, toArr, nums, criteria, Ref, flatten, eachArg } = X;
  const isArr = Array.isArray;
  const S = 'S';

  // ---------------------------------------------------------------- rutinas numéricas
  const LG = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  function lgamma(x) {
    if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
    x -= 1;
    let a = LG[0];
    const t = x + 7.5;
    for (let i = 1; i < 9; i++) a += LG[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }
  function gammaFn(x) {
    if (x === Math.floor(x)) { if (x <= 0) return NaN; if (x <= 171) { const f = X.fact(x - 1); return f instanceof FErr ? Infinity : f; } }
    if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gammaFn(1 - x));
    return Math.exp(lgamma(x));
  }
  // Gamma incompleta regularizada: devuelve [P, Q]
  function gammaPQ(a, x) {
    if (x <= 0) return [0, 1];
    const lead = Math.exp(-x + a * Math.log(x) - lgamma(a));
    if (x < a + 1) {
      let ap = a, sum = 1 / a, del = sum;
      for (let n = 0; n < 1000; n++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-16) break; }
      const p = sum * lead; return [p, 1 - p];
    }
    const TINY = 1e-300;
    let b = x + 1 - a, c = 1 / TINY, d = 1 / b, h = d;
    for (let i = 1; i < 1000; i++) {
      const an = -i * (i - a); b += 2;
      d = an * d + b; if (Math.abs(d) < TINY) d = TINY;
      c = b + an / c; if (Math.abs(c) < TINY) c = TINY;
      d = 1 / d; const del = d * c; h *= del;
      if (Math.abs(del - 1) < 1e-16) break;
    }
    const q = lead * h; return [1 - q, q];
  }
  function betacf(a, b, x) {
    const TINY = 1e-300, qab = a + b, qap = a + 1, qam = a - 1;
    let c = 1, d = 1 - (qab * x) / qap;
    if (Math.abs(d) < TINY) d = TINY;
    d = 1 / d; let h = d;
    for (let m = 1; m < 1000; m++) {
      const m2 = 2 * m;
      let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
      c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
      d = 1 / d; h *= d * c;
      aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
      c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
      d = 1 / d; const del = d * c; h *= del;
      if (Math.abs(del - 1) < 1e-16) break;
    }
    return h;
  }
  function betai(a, b, x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
  }
  const erf = (x) => (x < 0 ? -gammaPQ(0.5, x * x)[0] : gammaPQ(0.5, x * x)[0]);
  const erfc = (x) => (x < 0 ? 1 + gammaPQ(0.5, x * x)[0] : gammaPQ(0.5, x * x)[1]);
  const normPdf = (z) => Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
  const normCdf = (z) => 0.5 * erfc(-z / Math.SQRT2);
  function normInv(p) {
    const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
    const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    let q, r, x;
    if (p < 0.02425) {
      q = Math.sqrt(-2 * Math.log(p));
      x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    } else if (p <= 1 - 0.02425) {
      q = p - 0.5; r = q * q;
      x = ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
    } else {
      q = Math.sqrt(-2 * Math.log(1 - p));
      x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    const e = normCdf(x) - p, u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
    return x - u / (1 + (x * u) / 2);
  }
  // Inversa de una función de distribución creciente por bisección.
  function invert(cdf, p, lo, hi) {
    let n = 0;
    while (cdf(hi) < p && n++ < 200) { lo = hi; hi = hi * 2 + 1; }
    n = 0;
    while (cdf(lo) > p && n++ < 200) { hi = lo; lo = lo * 2 - 1; }
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      if (cdf(mid) < p) lo = mid; else hi = mid;
      if (Math.abs(hi - lo) <= 1e-13 * Math.max(1, Math.abs(mid))) break;
    }
    return (lo + hi) / 2;
  }
  const tCdf = (t, df) => { const x = df / (df + t * t), i = 0.5 * betai(df / 2, 0.5, x); return t >= 0 ? 1 - i : i; };
  const tPdf = (t, df) => Math.exp(lgamma((df + 1) / 2) - lgamma(df / 2)) / Math.sqrt(df * Math.PI) * Math.pow(1 + (t * t) / df, -(df + 1) / 2);
  const chiCdf = (x, k) => (x <= 0 ? 0 : gammaPQ(k / 2, x / 2)[0]);
  const fCdf = (x, d1, d2) => (x <= 0 ? 0 : betai(d1 / 2, d2 / 2, (d1 * x) / (d1 * x + d2)));
  X.stat = { lgamma, gammaFn, gammaPQ, betai, erf, erfc, normCdf, normInv, normPdf, tCdf, invert };

  // ---------------------------------------------------------------- utilidades
  const mean = (v) => X.sum(v) / v.length;
  function devsq(v) { const m = mean(v); let s = 0; for (const x of v) s += (x - m) * (x - m); return s; }
  const numsOr = (args, opts) => nums(args, opts);
  const sorted = (v) => v.slice().sort((a, b) => a - b);
  // Define una función de agregado sobre números: fn(valores) -> resultado
  function agg(name, es, help, desc, fn, opts) {
    def(name, es, S, help || 'número1; [número2]; …', desc, 'raw', (args) => {
      const v = nums(args, opts); return v instanceof FErr ? v : fn(v);
    }, { min: 1 });
  }

  // ---------------------------------------------------------------- conteos
  def('COUNT', 'CONTAR', S, 'valor1; [valor2]; …', 'Cuenta cuántas celdas contienen números.', 'raw', (args) => {
    let n = 0;
    eachArg(args, (v, fromRange) => { if (typeof v === 'number') n++; else if (!fromRange && (typeof v === 'boolean' || (typeof v === 'string' && HC.textToNumber(v) != null))) n++; });
    return n;
  }, { min: 1 });
  def('COUNTA', 'CONTARA', S, 'valor1; [valor2]; …', 'Cuenta cuántas celdas no están vacías.', 'raw', (args) => { let n = 0; eachArg(args, () => { n++; }); return n; }, { min: 1 });
  def('COUNTBLANK', 'CONTAR.BLANCO', S, 'rango', 'Cuenta las celdas vacías de un rango.', 'r', (rg) => {
    if (!(rg instanceof Ref)) return rg == null || rg === '' ? 1 : 0;
    let filled = 0;
    rg.each((v) => { if (v !== '') filled++; });
    return rg.rows * rg.cols - filled;
  });
  function countIfs(pairs) {
    const m = X.condMatch(pairs);
    if (m instanceof FErr) return m;
    return m.pos.length + (m.blankAll ? m.total - m.clipped : 0);
  }
  def('COUNTIF', 'CONTAR.SI', S, 'rango; criterio', 'Cuenta las celdas de un rango que cumplen una condición.', 'r e', (rg, c) => countIfs([rg, c]));
  def('COUNTIFS', 'CONTAR.SI.CONJUNTO', S, 'rango1; criterio1; [rango2; criterio2]; …', 'Cuenta las celdas que cumplen varias condiciones.', 'raw', (args) => (args.length % 2 ? E.VALUE : countIfs(args)), { min: 2 });

  // ---------------------------------------------------------------- promedios y extremos
  agg('AVERAGE', 'PROMEDIO', null, 'Media aritmética de los números.', (v) => (v.length ? mean(v) : E.DIV0));
  agg('AVERAGEA', 'PROMEDIOA', 'valor1; [valor2]; …', 'Media de los valores, contando texto como 0 y lógicos como 1 o 0.', (v) => (v.length ? mean(v) : E.DIV0), { a: true });
  agg('MAX', 'MAX', null, 'El mayor de los números.', (v) => { let m = -Infinity; for (const x of v) if (x > m) m = x; return v.length ? m : 0; });
  agg('MIN', 'MIN', null, 'El menor de los números.', (v) => { let m = Infinity; for (const x of v) if (x < m) m = x; return v.length ? m : 0; });
  agg('MAXA', 'MAXA', 'valor1; [valor2]; …', 'El mayor valor, contando texto y lógicos.', (v) => (v.length ? Math.max.apply(null, v) : 0), { a: true });
  agg('MINA', 'MINA', 'valor1; [valor2]; …', 'El menor valor, contando texto y lógicos.', (v) => (v.length ? Math.min.apply(null, v) : 0), { a: true });
  def('AVERAGEIF', 'PROMEDIO.SI', S, 'rango; criterio; [rango_promedio]', 'Promedio de las celdas que cumplen una condición.', 'r e r?', (rg, c, avg) => {
    const v = X.condNums(avg === undefined ? rg : avg, [rg, c]);
    return v instanceof FErr ? v : v.length ? mean(v) : E.DIV0;
  });
  function ifsFn(name, es, desc, fn) {
    def(name, es, S, 'rango_valores; rango_criterios1; criterio1; …', desc, 'raw', (args) => {
      if (args.length % 2 !== 1) return E.VALUE;
      const v = X.condNums(args[0], args.slice(1));
      return v instanceof FErr ? v : fn(v);
    }, { min: 3 });
  }
  ifsFn('AVERAGEIFS', 'PROMEDIO.SI.CONJUNTO', 'Promedio de las celdas que cumplen varias condiciones.', (v) => (v.length ? mean(v) : E.DIV0));
  ifsFn('MAXIFS', 'MAX.SI.CONJUNTO', 'Máximo de las celdas que cumplen varias condiciones.', (v) => (v.length ? Math.max.apply(null, v) : 0));
  ifsFn('MINIFS', 'MIN.SI.CONJUNTO', 'Mínimo de las celdas que cumplen varias condiciones.', (v) => (v.length ? Math.min.apply(null, v) : 0));
  agg('MEDIAN', 'MEDIANA', null, 'Mediana: el valor central de los números.', (v) => {
    if (!v.length) return E.NUM;
    const s = sorted(v), h = s.length >> 1;
    return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
  });
  function modes(v) {
    const cnt = new Map(); let best = 1;
    for (const x of v) { const n = (cnt.get(x) || 0) + 1; cnt.set(x, n); if (n > best) best = n; }
    if (best < 2) return [];
    const out = []; for (const [x, n] of cnt) if (n === best) out.push(x);
    return out;
  }
  agg('MODE.SNGL', 'MODA.UNO', null, 'El valor que más se repite.', (v) => { const m = modes(v); return m.length ? m[0] : E.NA; });
  alias('MODE', 'MODE.SNGL'); HC.fnEs.MODE = 'MODA'; HC.fnFromEs.MODA = 'MODE';
  agg('MODE.MULT', 'MODA.VARIOS', null, 'Lista vertical con los valores que más se repiten.', (v) => { const m = modes(v); return m.length ? m.map((x) => [x]) : E.NA; });
  agg('GEOMEAN', 'MEDIA.GEOM', null, 'Media geométrica de números positivos.', (v) => { if (!v.length) return E.NUM; let s = 0; for (const x of v) { if (x <= 0) return E.NUM; s += Math.log(x); } return Math.exp(s / v.length); });
  agg('HARMEAN', 'MEDIA.ARMO', null, 'Media armónica de números positivos.', (v) => { if (!v.length) return E.NUM; let s = 0; for (const x of v) { if (x <= 0) return E.NUM; s += 1 / x; } return v.length / s; });
  def('TRIMMEAN', 'MEDIA.ACOTADA', S, 'matriz; porcentaje', 'Media que excluye un porcentaje de los valores extremos.', 'r n', (a, p) => {
    const v = nums([a]); if (v instanceof FErr) return v;
    if (p < 0 || p >= 1 || !v.length) return E.NUM;
    const s = sorted(v), cut = Math.floor((s.length * p) / 2);
    return mean(s.slice(cut, s.length - cut));
  });

  // ---------------------------------------------------------------- dispersión
  agg('VAR.S', 'VAR.S', null, 'Varianza de una muestra.', (v) => (v.length < 2 ? E.DIV0 : devsq(v) / (v.length - 1)));
  agg('VAR.P', 'VAR.P', null, 'Varianza de toda la población.', (v) => (v.length < 1 ? E.DIV0 : devsq(v) / v.length));
  agg('STDEV.S', 'DESVEST.M', null, 'Desviación estándar de una muestra.', (v) => (v.length < 2 ? E.DIV0 : Math.sqrt(devsq(v) / (v.length - 1))));
  agg('STDEV.P', 'DESVEST.P', null, 'Desviación estándar de toda la población.', (v) => (v.length < 1 ? E.DIV0 : Math.sqrt(devsq(v) / v.length)));
  agg('VARA', 'VARA', 'valor1; [valor2]; …', 'Varianza de una muestra, contando texto y lógicos.', (v) => (v.length < 2 ? E.DIV0 : devsq(v) / (v.length - 1)), { a: true });
  agg('VARPA', 'VARPA', 'valor1; [valor2]; …', 'Varianza de la población, contando texto y lógicos.', (v) => (v.length < 1 ? E.DIV0 : devsq(v) / v.length), { a: true });
  agg('STDEVA', 'DESVESTA', 'valor1; [valor2]; …', 'Desviación estándar de una muestra, contando texto y lógicos.', (v) => (v.length < 2 ? E.DIV0 : Math.sqrt(devsq(v) / (v.length - 1))), { a: true });
  agg('STDEVPA', 'DESVESTPA', 'valor1; [valor2]; …', 'Desviación estándar de la población, contando texto y lógicos.', (v) => (v.length < 1 ? E.DIV0 : Math.sqrt(devsq(v) / v.length)), { a: true });
  alias('VAR', 'VAR.S'); alias('VARP', 'VAR.P'); alias('STDEV', 'STDEV.S'); alias('STDEVP', 'STDEV.P');
  HC.fnEs.STDEV = 'DESVEST'; HC.fnFromEs.DESVEST = 'STDEV'; HC.fnEs.STDEVP = 'DESVESTP'; HC.fnFromEs.DESVESTP = 'STDEVP';
  agg('AVEDEV', 'DESVPROM', null, 'Promedio de las desviaciones absolutas respecto a la media.', (v) => { if (!v.length) return E.NUM; const m = mean(v); let s = 0; for (const x of v) s += Math.abs(x - m); return s / v.length; });
  agg('DEVSQ', 'DESVIA2', null, 'Suma de los cuadrados de las desviaciones.', (v) => (v.length ? devsq(v) : E.NUM));
  agg('SKEW', 'COEFICIENTE.ASIMETRIA', null, 'Asimetría de una distribución (muestra).', (v) => {
    const n = v.length; if (n < 3) return E.DIV0;
    const m = mean(v), sd = Math.sqrt(devsq(v) / (n - 1)); if (!sd) return E.DIV0;
    let s = 0; for (const x of v) s += Math.pow((x - m) / sd, 3);
    return (n / ((n - 1) * (n - 2))) * s;
  });
  agg('SKEW.P', 'COEFICIENTE.ASIMETRIA.P', null, 'Asimetría de una distribución (población).', (v) => {
    const n = v.length; if (n < 3) return E.DIV0;
    const m = mean(v), sd = Math.sqrt(devsq(v) / n); if (!sd) return E.DIV0;
    let s = 0; for (const x of v) s += Math.pow((x - m) / sd, 3);
    return s / n;
  });
  agg('KURT', 'CURTOSIS', null, 'Curtosis de un conjunto de datos.', (v) => {
    const n = v.length; if (n < 4) return E.DIV0;
    const m = mean(v), sd = Math.sqrt(devsq(v) / (n - 1)); if (!sd) return E.DIV0;
    let s = 0; for (const x of v) s += Math.pow((x - m) / sd, 4);
    return ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * s - (3 * (n - 1) * (n - 1)) / ((n - 2) * (n - 3));
  });
  def('STANDARDIZE', 'NORMALIZACION', S, 'x; media; desv_estándar', 'Valor normalizado (puntuación z).', 'n n n', (x, m, sd) => (sd <= 0 ? E.NUM : (x - m) / sd));

  // ---------------------------------------------------------------- posición
  function kth(name, es, desc, big) {
    def(name, es, S, 'matriz; k', desc, 'r n', (a, k) => {
      const v = nums([a]); if (v instanceof FErr) return v;
      k = Math.ceil(k); if (k < 1 || k > v.length) return E.NUM;
      const s = sorted(v); return big ? s[s.length - k] : s[k - 1];
    });
  }
  kth('LARGE', 'K.ESIMO.MAYOR', 'El k-ésimo valor más grande de un conjunto.', true);
  kth('SMALL', 'K.ESIMO.MENOR', 'El k-ésimo valor más pequeño de un conjunto.', false);
  function rankFn(name, es, desc, avg) {
    def(name, es, S, 'número; referencia; [orden]', desc, 'n r n?', (x, ref, order = 0) => {
      const v = nums([ref]); if (v instanceof FErr) return v;
      let better = 0, same = 0;
      for (const y of v) { if (y === x) same++; else if (order ? y < x : y > x) better++; }
      if (!same) return E.NA;
      return avg ? better + (same + 1) / 2 : better + 1;
    });
  }
  rankFn('RANK.EQ', 'JERARQUIA.EQV', 'Posición de un número dentro de una lista (empates con la misma posición).', false);
  rankFn('RANK.AVG', 'JERARQUIA.MEDIA', 'Posición de un número dentro de una lista (empates con la posición media).', true);
  alias('RANK', 'RANK.EQ'); HC.fnEs.RANK = 'JERARQUIA'; HC.fnFromEs.JERARQUIA = 'RANK';
  function pctl(v, k, exc) {
    const s = sorted(v), n = s.length;
    if (!n) return E.NUM;
    let pos;
    if (exc) { if (k <= 0 || k >= 1) return E.NUM; pos = k * (n + 1) - 1; if (pos < 0 || pos > n - 1) return E.NUM; }
    else { if (k < 0 || k > 1) return E.NUM; pos = k * (n - 1); }
    const lo = Math.floor(pos), f = pos - lo;
    return f && lo + 1 < n ? s[lo] + f * (s[lo + 1] - s[lo]) : s[lo];
  }
  function pctlFn(name, es, desc, exc, quart) {
    def(name, es, S, quart ? 'matriz; cuartil' : 'matriz; k', desc, 'r n', (a, k) => {
      const v = nums([a]); if (v instanceof FErr) return v;
      if (quart) { k = Math.floor(k); if (k < 0 || k > 4 || (exc && (k < 1 || k > 3))) return E.NUM; k /= 4; }
      return pctl(v, k, exc);
    });
  }
  pctlFn('PERCENTILE.INC', 'PERCENTIL.INC', 'Percentil k (de 0 a 1, ambos incluidos) de un conjunto de valores.', false, false);
  pctlFn('PERCENTILE.EXC', 'PERCENTIL.EXC', 'Percentil k (entre 0 y 1, excluidos) de un conjunto de valores.', true, false);
  pctlFn('QUARTILE.INC', 'CUARTIL.INC', 'Cuartil de un conjunto de datos (0 a 4).', false, true);
  pctlFn('QUARTILE.EXC', 'CUARTIL.EXC', 'Cuartil de un conjunto de datos (1 a 3), método exclusivo.', true, true);
  alias('PERCENTILE', 'PERCENTILE.INC'); HC.fnEs.PERCENTILE = 'PERCENTIL'; HC.fnFromEs.PERCENTIL = 'PERCENTILE';
  alias('QUARTILE', 'QUARTILE.INC'); HC.fnEs.QUARTILE = 'CUARTIL'; HC.fnFromEs.CUARTIL = 'QUARTILE';
  function prankFn(name, es, exc) {
    def(name, es, S, 'matriz; x; [cifra_significativa]', 'Posición porcentual de un valor dentro de un conjunto de datos.', 'r n n?', (a, x, sig = 3) => {
      const v = nums([a]); if (v instanceof FErr) return v;
      const s = sorted(v), n = s.length;
      if (!n || x < s[0] || x > s[n - 1] || sig < 1) return E.NA;
      let lo = 0; while (lo < n - 1 && s[lo + 1] <= x) lo++;
      let pos = lo; // índice con s[lo] <= x
      if (s[lo] !== x && lo + 1 < n) pos = lo + (x - s[lo]) / (s[lo + 1] - s[lo]);
      else { let first = lo; while (first > 0 && s[first - 1] === x) first--; pos = first; }
      const r = exc ? (pos + 1) / (n + 1) : n === 1 ? 1 : pos / (n - 1);
      const m = Math.pow(10, Math.floor(sig));
      return Math.floor(r * m + 1e-9) / m;
    });
  }
  prankFn('PERCENTRANK.INC', 'RANGO.PERCENTIL.INC', false);
  prankFn('PERCENTRANK.EXC', 'RANGO.PERCENTIL.EXC', true);
  alias('PERCENTRANK', 'PERCENTRANK.INC'); HC.fnEs.PERCENTRANK = 'RANGO.PERCENTIL'; HC.fnFromEs['RANGO.PERCENTIL'] = 'PERCENTRANK';
  def('FREQUENCY', 'FRECUENCIA', S, 'datos; grupos', 'Cuenta cuántos valores caen en cada intervalo. Devuelve una lista vertical.', 'r r', (data, bins) => {
    const v = nums([data]), b = nums([bins]);
    if (v instanceof FErr) return v; if (b instanceof FErr) return b;
    const order = b.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]);
    const out = new Array(b.length + 1).fill(0);
    for (const x of v) {
      let k = 0; while (k < order.length && x > order[k][0]) k++;
      out[k < order.length ? order[k][1] : b.length]++;
    }
    return out.map((n) => [n]);
  });
  def('PERMUT', 'PERMUTACIONES', S, 'número; tamaño', 'Número de permutaciones sin repetición.', 'n n', (n, k) => {
    n = Math.floor(n); k = Math.floor(k); if (n < 0 || k < 0 || k > n) return E.NUM;
    let r = 1; for (let i = 0; i < k; i++) r *= n - i; return r;
  });
  def('PERMUTATIONA', 'PERMUTACIONES.A', S, 'número; tamaño', 'Número de permutaciones con repetición.', 'n n', (n, k) => (n < 0 || k < 0 ? E.NUM : Math.pow(Math.floor(n), Math.floor(k))));

  // ---------------------------------------------------------------- correlación y regresión
  function pairs(ay, ax) {
    const y = flatten(ay), x = flatten(ax);
    if (y.length !== x.length) return E.NA;
    const xs = [], ys = [];
    for (let i = 0; i < y.length; i++) {
      if (y[i] instanceof FErr) return y[i]; if (x[i] instanceof FErr) return x[i];
      if (typeof y[i] === 'number' && typeof x[i] === 'number') { ys.push(y[i]); xs.push(x[i]); }
    }
    return { xs, ys, n: xs.length };
  }
  function sxy(p) {
    const mx = mean(p.xs), my = mean(p.ys); let sxx = 0, syy = 0, s = 0;
    for (let i = 0; i < p.n; i++) { const dx = p.xs[i] - mx, dy = p.ys[i] - my; sxx += dx * dx; syy += dy * dy; s += dx * dy; }
    return { mx, my, sxx, syy, sxy: s };
  }
  function pairFn(name, es, help, desc, fn, minN) {
    def(name, es, S, help, desc, 'r r', (a, b) => {
      const p = pairs(a, b); if (p instanceof FErr) return p;
      if (p.n < (minN || 1)) return E.DIV0;
      return fn(sxy(p), p);
    });
  }
  const corr = (m) => (m.sxx === 0 || m.syy === 0 ? E.DIV0 : m.sxy / Math.sqrt(m.sxx * m.syy));
  pairFn('CORREL', 'COEF.DE.CORREL', 'matriz1; matriz2', 'Coeficiente de correlación entre dos conjuntos de datos.', corr, 2);
  pairFn('PEARSON', 'PEARSON', 'matriz1; matriz2', 'Coeficiente de correlación de Pearson.', corr, 2);
  pairFn('RSQ', 'COEFICIENTE.R2', 'conocido_y; conocido_x', 'Cuadrado del coeficiente de correlación (R²).', (m) => { const r = corr(m); return r instanceof FErr ? r : r * r; }, 2);
  pairFn('COVARIANCE.P', 'COVARIANZA.P', 'matriz1; matriz2', 'Covarianza de la población.', (m, p) => m.sxy / p.n);
  pairFn('COVARIANCE.S', 'COVARIANZA.M', 'matriz1; matriz2', 'Covarianza de una muestra.', (m, p) => (p.n < 2 ? E.DIV0 : m.sxy / (p.n - 1)));
  alias('COVAR', 'COVARIANCE.P');
  pairFn('SLOPE', 'PENDIENTE', 'conocido_y; conocido_x', 'Pendiente de la recta de regresión lineal.', (m) => (m.sxx === 0 ? E.DIV0 : m.sxy / m.sxx), 2);
  pairFn('INTERCEPT', 'INTERSECCION.EJE', 'conocido_y; conocido_x', 'Punto donde la recta de regresión corta el eje Y.', (m) => (m.sxx === 0 ? E.DIV0 : m.my - (m.sxy / m.sxx) * m.mx), 2);
  pairFn('STEYX', 'ERROR.TIPICO.XY', 'conocido_y; conocido_x', 'Error típico del valor de y previsto en la regresión.', (m, p) => (p.n < 3 || m.sxx === 0 ? E.DIV0 : Math.sqrt((m.syy - (m.sxy * m.sxy) / m.sxx) / (p.n - 2))), 3);
  def('FORECAST.LINEAR', 'PRONOSTICO.LINEAL', S, 'x; conocido_y; conocido_x', 'Predice un valor con una regresión lineal.', 'n r r', (x, ay, ax) => {
    const p = pairs(ay, ax); if (p instanceof FErr) return p;
    if (p.n < 2) return E.DIV0;
    const m = sxy(p); if (m.sxx === 0) return E.DIV0;
    const b = m.sxy / m.sxx; return m.my + b * (x - m.mx);
  });
  alias('FORECAST', 'FORECAST.LINEAR'); HC.fnEs.FORECAST = 'PRONOSTICO'; HC.fnFromEs.PRONOSTICO = 'FORECAST';

  // Regresión por mínimos cuadrados con una o varias variables. Devuelve {coef:[b, m1…mk], inv, sse, sst, n, k, hasConst}
  function regress(yArr, xArr, hasConst) {
    const y = flatten(yArr);
    for (const v of y) { if (v instanceof FErr) return v; if (typeof v !== 'number') return E.VALUE; }
    const n = y.length;
    let cols;
    if (xArr == null) cols = [y.map((_, i) => i + 1)];
    else {
      const xa = toArr(xArr);
      for (const row of xa) for (const v of row) { if (v instanceof FErr) return v; if (typeof v !== 'number') return E.VALUE; }
      if (xa.length * xa[0].length === n) cols = [flatten(xa)];
      else if (xa.length === n) cols = xa[0].map((_, j) => xa.map((r) => r[j]));
      else if (xa[0].length === n) cols = xa.map((r) => r.slice());
      else return E.REF;
    }
    const k = cols.length, p = k + (hasConst ? 1 : 0);
    if (n < p) return E.NUM;
    const row = (i) => { const r = hasConst ? [1] : []; for (let j = 0; j < k; j++) r.push(cols[j][i]); return r; };
    const A = X.mkArr(p, p, () => 0), bvec = new Array(p).fill(0);
    for (let i = 0; i < n; i++) { const r = row(i); for (let a = 0; a < p; a++) { bvec[a] += r[a] * y[i]; for (let c = 0; c < p; c++) A[a][c] += r[a] * r[c]; } }
    // inversa por Gauss-Jordan
    const Mx = A.map((r, i) => r.concat(A.map((_, j) => (i === j ? 1 : 0))));
    for (let i = 0; i < p; i++) {
      let piv = i; for (let r = i + 1; r < p; r++) if (Math.abs(Mx[r][i]) > Math.abs(Mx[piv][i])) piv = r;
      if (Math.abs(Mx[piv][i]) < 1e-12) return E.NUM;
      [Mx[piv], Mx[i]] = [Mx[i], Mx[piv]];
      const d = Mx[i][i]; for (let j = 0; j < 2 * p; j++) Mx[i][j] /= d;
      for (let r = 0; r < p; r++) if (r !== i) { const f = Mx[r][i]; if (f) for (let j = 0; j < 2 * p; j++) Mx[r][j] -= f * Mx[i][j]; }
    }
    const inv = Mx.map((r) => r.slice(p));
    const beta = inv.map((r) => r.reduce((s, v, j) => s + v * bvec[j], 0));
    let sse = 0, sst = 0; const my = hasConst ? mean(y) : 0;
    for (let i = 0; i < n; i++) { const r = row(i); let f = 0; for (let a = 0; a < p; a++) f += r[a] * beta[a]; sse += (y[i] - f) * (y[i] - f); sst += (y[i] - my) * (y[i] - my); }
    const coef = hasConst ? beta : [0].concat(beta);
    return { coef, inv, sse, sst, n, k, p, hasConst, predict: (xs) => coef[0] + xs.reduce((s, v, j) => s + v * coef[j + 1], 0), cols };
  }
  function linest(ay, ax, c, stats, logY) {
    const yv = logY ? X.mapArr(toArr(ay), (v) => (typeof v === 'number' && v > 0 ? Math.log(v) : v instanceof FErr ? v : NaN)) : ay;
    if (logY && flatten(yv).some((v) => typeof v === 'number' && isNaN(v))) return E.NUM;
    const g = regress(yv, ax, c !== false);
    if (g instanceof FErr) return g;
    const out = (v) => (logY ? Math.exp(v) : v);
    const first = []; for (let j = g.k; j >= 1; j--) first.push(out(g.coef[j])); first.push(out(g.coef[0]));
    if (!stats) return [first];
    const df = g.n - g.p, mse = df > 0 ? g.sse / df : NaN;
    const se = []; const off = g.hasConst ? 1 : 0;
    for (let j = g.k; j >= 1; j--) se.push(Math.sqrt(mse * g.inv[j - 1 + off][j - 1 + off]));
    se.push(g.hasConst ? Math.sqrt(mse * g.inv[0][0]) : E.NA);
    const ssr = g.sst - g.sse, w = first.length;
    const padRow = (a, b) => { const r = [a, b]; while (r.length < w) r.push(E.NA); return r; };
    const fix = (v) => (typeof v === 'number' && !isFinite(v) ? E.NUM : v);
    return [first, se.map(fix), padRow(fix(g.sst ? 1 - g.sse / g.sst : 1), fix(Math.sqrt(mse))), padRow(fix(ssr / g.k / mse), df), padRow(ssr, g.sse)];
  }
  def('LINEST', 'ESTIMACION.LINEAL', S, 'conocido_y; [conocido_x]; [constante]; [estadística]', 'Coeficientes de la recta que mejor se ajusta a los datos (mínimos cuadrados).', 'r r? b? b?', (ay, ax, c, st) => linest(ay, ax, c, st, false));
  def('LOGEST', 'ESTIMACION.LOGARITMICA', S, 'conocido_y; [conocido_x]; [constante]; [estadística]', 'Coeficientes de la curva exponencial que mejor se ajusta a los datos.', 'r r? b? b?', (ay, ax, c, st) => linest(ay, ax, c, st, true));
  function trend(ay, ax, nx, c, logY) {
    const yv = logY ? X.mapArr(toArr(ay), (v) => (typeof v === 'number' && v > 0 ? Math.log(v) : v instanceof FErr ? v : NaN)) : ay;
    if (logY && flatten(yv).some((v) => typeof v === 'number' && isNaN(v))) return E.NUM;
    const g = regress(yv, ax, c !== false);
    if (g instanceof FErr) return g;
    const src = nx == null ? (ax == null ? toArr(ay).map((r, i) => r.map((_, j) => i * r.length + j + 1)) : toArr(ax)) : toArr(nx);
    const f = (v) => (logY ? Math.exp(v) : v);
    if (g.k === 1) return X.mapArr(src, (v) => (typeof v === 'number' ? f(g.predict([v])) : E.VALUE));
    // varias variables: cada fila (o columna) de new_x es una observación
    if (src[0].length === g.k) return src.map((r) => [f(g.predict(r))]);
    if (src.length === g.k) return [src[0].map((_, j) => f(g.predict(src.map((r) => r[j]))))];
    return E.REF;
  }
  def('TREND', 'TENDENCIA', S, 'conocido_y; [conocido_x]; [nueva_x]; [constante]', 'Valores sobre la recta de tendencia lineal.', 'r r? r? b?', (ay, ax, nx, c) => trend(ay, ax, nx, c, false));
  def('GROWTH', 'CRECIMIENTO', S, 'conocido_y; [conocido_x]; [nueva_x]; [constante]', 'Valores sobre la curva de tendencia exponencial.', 'r r? r? b?', (ay, ax, nx, c) => trend(ay, ax, nx, c, true));
  X.regress = regress;

  // ---------------------------------------------------------------- distribuciones
  def('NORM.S.DIST', 'DISTR.NORM.ESTAND.N', S, 'z; acumulado', 'Distribución normal estándar.', 'n b', (z, cum) => (cum ? normCdf(z) : normPdf(z)));
  def('NORMSDIST', 'DISTR.NORM.ESTAND', S, 'z', 'Distribución normal estándar acumulada.', 'n', normCdf);
  def('NORM.DIST', 'DISTR.NORM.N', S, 'x; media; desv_estándar; acumulado', 'Distribución normal con la media y desviación indicadas.', 'n n n b', (x, m, sd, cum) => (sd <= 0 ? E.NUM : cum ? normCdf((x - m) / sd) : normPdf((x - m) / sd) / sd));
  alias('NORMDIST', 'NORM.DIST'); HC.fnEs.NORMDIST = 'DISTR.NORM'; HC.fnFromEs['DISTR.NORM'] = 'NORMDIST';
  def('NORM.S.INV', 'INV.NORM.ESTAND', S, 'probabilidad', 'Inversa de la distribución normal estándar.', 'n', (p) => (p <= 0 || p >= 1 ? E.NUM : normInv(p)));
  alias('NORMSINV', 'NORM.S.INV'); HC.fnEs.NORMSINV = 'DISTR.NORM.ESTAND.INV'; HC.fnFromEs['DISTR.NORM.ESTAND.INV'] = 'NORMSINV';
  def('NORM.INV', 'INV.NORM', S, 'probabilidad; media; desv_estándar', 'Inversa de la distribución normal.', 'n n n', (p, m, sd) => (p <= 0 || p >= 1 || sd <= 0 ? E.NUM : m + sd * normInv(p)));
  alias('NORMINV', 'NORM.INV'); HC.fnEs.NORMINV = 'DISTR.NORM.INV'; HC.fnFromEs['DISTR.NORM.INV'] = 'NORMINV';
  def('GAUSS', 'GAUSS', S, 'z', 'Probabilidad de que un valor normal estándar esté entre la media y z.', 'n', (z) => normCdf(z) - 0.5);
  def('PHI', 'FI', S, 'x', 'Densidad de la distribución normal estándar.', 'n', normPdf);
  def('LOGNORM.DIST', 'DISTR.LOGNORM', S, 'x; media; desv_estándar; acumulado', 'Distribución logarítmico-normal.', 'n n n b', (x, m, sd, cum) => {
    if (x <= 0 || sd <= 0) return E.NUM;
    const z = (Math.log(x) - m) / sd; return cum ? normCdf(z) : normPdf(z) / (x * sd);
  });
  def('BINOM.DIST', 'DISTR.BINOM.N', S, 'núm_éxito; ensayos; prob_éxito; acumulado', 'Probabilidad de una distribución binomial.', 'n n n b', (k, n, p, cum) => {
    k = Math.floor(k); n = Math.floor(n);
    if (k < 0 || k > n || p < 0 || p > 1) return E.NUM;
    const pmf = (i) => (p === 0 ? (i === 0 ? 1 : 0) : p === 1 ? (i === n ? 1 : 0) : Math.exp(lgamma(n + 1) - lgamma(i + 1) - lgamma(n - i + 1) + i * Math.log(p) + (n - i) * Math.log(1 - p)));
    if (!cum) return pmf(k);
    let s = 0; for (let i = 0; i <= k; i++) s += pmf(i); return Math.min(1, s);
  });
  alias('BINOMDIST', 'BINOM.DIST'); HC.fnEs.BINOMDIST = 'DISTR.BINOM'; HC.fnFromEs['DISTR.BINOM'] = 'BINOMDIST';
  def('POISSON.DIST', 'POISSON.DIST', S, 'x; media; acumulado', 'Distribución de Poisson.', 'n n b', (x, m, cum) => {
    x = Math.floor(x); if (x < 0 || m < 0) return E.NUM;
    if (m === 0) return x === 0 || cum ? 1 : 0;
    return cum ? gammaPQ(x + 1, m)[1] : Math.exp(-m + x * Math.log(m) - lgamma(x + 1));
  });
  alias('POISSON', 'POISSON.DIST');
  def('EXPON.DIST', 'DISTR.EXP.N', S, 'x; lambda; acumulado', 'Distribución exponencial.', 'n n b', (x, l, cum) => (x < 0 || l <= 0 ? E.NUM : cum ? 1 - Math.exp(-l * x) : l * Math.exp(-l * x)));
  alias('EXPONDIST', 'EXPON.DIST'); HC.fnEs.EXPONDIST = 'DISTR.EXP'; HC.fnFromEs['DISTR.EXP'] = 'EXPONDIST';
  def('WEIBULL.DIST', 'DISTR.WEIBULL', S, 'x; alfa; beta; acumulado', 'Distribución de Weibull.', 'n n n b', (x, a, b, cum) => {
    if (x < 0 || a <= 0 || b <= 0) return E.NUM;
    return cum ? 1 - Math.exp(-Math.pow(x / b, a)) : (a / Math.pow(b, a)) * Math.pow(x, a - 1) * Math.exp(-Math.pow(x / b, a));
  });
  def('GAMMA', 'GAMMA', S, 'número', 'Valor de la función gamma.', 'n', (x) => { const g = gammaFn(x); return isNaN(g) ? E.NUM : g; });
  def('GAMMALN', 'GAMMA.LN', S, 'x', 'Logaritmo natural de la función gamma.', 'n', (x) => (x <= 0 ? E.NUM : lgamma(x)));
  def('GAMMA.DIST', 'DISTR.GAMMA.N', S, 'x; alfa; beta; acumulado', 'Distribución gamma.', 'n n n b', (x, a, b, cum) => {
    if (x < 0 || a <= 0 || b <= 0) return E.NUM;
    return cum ? gammaPQ(a, x / b)[0] : Math.exp((a - 1) * Math.log(x) - x / b - a * Math.log(b) - lgamma(a));
  });
  def('BETA.DIST', 'DISTR.BETA.N', S, 'x; alfa; beta; acumulado; [A]; [B]', 'Distribución beta.', 'n n n b n? n?', (x, a, b, cum, lo = 0, hi = 1) => {
    if (a <= 0 || b <= 0 || x < lo || x > hi || lo === hi) return E.NUM;
    const z = (x - lo) / (hi - lo);
    return cum ? betai(a, b, z) : Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + (a - 1) * Math.log(z) + (b - 1) * Math.log(1 - z)) / (hi - lo);
  });
  def('CHISQ.DIST', 'DISTR.CHICUAD', S, 'x; grados_libertad; acumulado', 'Distribución chi cuadrado (cola izquierda).', 'n n b', (x, k, cum) => {
    k = Math.floor(k); if (x < 0 || k < 1) return E.NUM;
    return cum ? chiCdf(x, k) : x === 0 ? (k === 2 ? 0.5 : 0) : Math.exp((k / 2 - 1) * Math.log(x) - x / 2 - (k / 2) * Math.LN2 - lgamma(k / 2));
  });
  def('CHISQ.DIST.RT', 'DISTR.CHICUAD.CD', S, 'x; grados_libertad', 'Distribución chi cuadrado (cola derecha).', 'n n', (x, k) => { k = Math.floor(k); return x < 0 || k < 1 ? E.NUM : 1 - chiCdf(x, k); });
  def('CHISQ.INV', 'INV.CHICUAD', S, 'probabilidad; grados_libertad', 'Inversa de la chi cuadrado (cola izquierda).', 'n n', (p, k) => { k = Math.floor(k); return p < 0 || p >= 1 || k < 1 ? E.NUM : invert((x) => chiCdf(x, k), p, 0, k + 10); });
  def('CHISQ.INV.RT', 'INV.CHICUAD.CD', S, 'probabilidad; grados_libertad', 'Inversa de la chi cuadrado (cola derecha).', 'n n', (p, k) => { k = Math.floor(k); return p <= 0 || p > 1 || k < 1 ? E.NUM : invert((x) => chiCdf(x, k), 1 - p, 0, k + 10); });
  def('T.DIST', 'DISTR.T.N', S, 'x; grados_libertad; acumulado', 'Distribución t de Student (cola izquierda).', 'n n b', (x, df, cum) => { df = Math.floor(df); return df < 1 ? E.NUM : cum ? tCdf(x, df) : tPdf(x, df); });
  def('T.DIST.2T', 'DISTR.T.2C', S, 'x; grados_libertad', 'Distribución t de Student de dos colas.', 'n n', (x, df) => { df = Math.floor(df); return df < 1 || x < 0 ? E.NUM : 2 * (1 - tCdf(x, df)); });
  def('T.DIST.RT', 'DISTR.T.CD', S, 'x; grados_libertad', 'Distribución t de Student (cola derecha).', 'n n', (x, df) => { df = Math.floor(df); return df < 1 ? E.NUM : 1 - tCdf(x, df); });
  def('T.INV', 'INV.T', S, 'probabilidad; grados_libertad', 'Inversa de la t de Student (cola izquierda).', 'n n', (p, df) => { df = Math.floor(df); return p <= 0 || p >= 1 || df < 1 ? E.NUM : invert((x) => tCdf(x, df), p, -10, 10); });
  def('T.INV.2T', 'INV.T.2C', S, 'probabilidad; grados_libertad', 'Inversa de la t de Student de dos colas.', 'n n', (p, df) => { df = Math.floor(df); return p <= 0 || p > 1 || df < 1 ? E.NUM : invert((x) => tCdf(x, df), 1 - p / 2, 0, 10); });
  def('F.DIST', 'DISTR.F.N', S, 'x; grados_libertad1; grados_libertad2; acumulado', 'Distribución F (cola izquierda).', 'n n n b', (x, d1, d2, cum) => {
    d1 = Math.floor(d1); d2 = Math.floor(d2); if (x < 0 || d1 < 1 || d2 < 1) return E.NUM;
    if (cum) return fCdf(x, d1, d2);
    if (x === 0) return d1 === 2 ? 1 : 0;
    return Math.exp(0.5 * (d1 * Math.log(d1 * x) + d2 * Math.log(d2) - (d1 + d2) * Math.log(d1 * x + d2)) - Math.log(x) - (lgamma(d1 / 2) + lgamma(d2 / 2) - lgamma((d1 + d2) / 2)));
  });
  def('F.DIST.RT', 'DISTR.F.CD', S, 'x; grados_libertad1; grados_libertad2', 'Distribución F (cola derecha).', 'n n n', (x, d1, d2) => { d1 = Math.floor(d1); d2 = Math.floor(d2); return x < 0 || d1 < 1 || d2 < 1 ? E.NUM : 1 - fCdf(x, d1, d2); });
  def('F.INV', 'INV.F', S, 'probabilidad; grados_libertad1; grados_libertad2', 'Inversa de la distribución F (cola izquierda).', 'n n n', (p, d1, d2) => { d1 = Math.floor(d1); d2 = Math.floor(d2); return p < 0 || p >= 1 || d1 < 1 || d2 < 1 ? E.NUM : invert((x) => fCdf(x, d1, d2), p, 0, 10); });
  def('CONFIDENCE.NORM', 'INTERVALO.CONFIANZA.NORM', S, 'alfa; desv_estándar; tamaño', 'Intervalo de confianza para la media con distribución normal.', 'n n n', (a, sd, n) => { n = Math.floor(n); return a <= 0 || a >= 1 || sd <= 0 || n < 1 ? E.NUM : (-normInv(a / 2) * sd) / Math.sqrt(n); });
  alias('CONFIDENCE', 'CONFIDENCE.NORM'); HC.fnEs.CONFIDENCE = 'INTERVALO.CONFIANZA'; HC.fnFromEs['INTERVALO.CONFIANZA'] = 'CONFIDENCE';
  def('CONFIDENCE.T', 'INTERVALO.CONFIANZA.T', S, 'alfa; desv_estándar; tamaño', 'Intervalo de confianza para la media con la t de Student.', 'n n n', (a, sd, n) => {
    n = Math.floor(n); if (a <= 0 || a >= 1 || sd <= 0 || n < 1) return E.NUM; if (n === 1) return E.DIV0;
    return (invert((x) => tCdf(x, n - 1), 1 - a / 2, 0, 10) * sd) / Math.sqrt(n);
  });
  def('FISHER', 'FISHER', S, 'x', 'Transformación de Fisher.', 'n', (x) => (x <= -1 || x >= 1 ? E.NUM : Math.atanh(x)));
  def('FISHERINV', 'PRUEBA.FISHER.INV', S, 'y', 'Inversa de la transformación de Fisher.', 'n', Math.tanh);
  def('Z.TEST', 'PRUEBA.Z.N', S, 'matriz; x; [sigma]', 'Valor p de una cola de una prueba z.', 'r n n?', (a, x, sigma) => {
    const v = nums([a]); if (v instanceof FErr) return v;
    if (!v.length) return E.NA;
    const sd = sigma === undefined ? Math.sqrt(devsq(v) / (v.length - 1)) : sigma;
    if (!sd || !isFinite(sd)) return E.DIV0;
    return 1 - normCdf((mean(v) - x) / (sd / Math.sqrt(v.length)));
  });
  def('ERF', 'FUN.ERROR', 'G', 'límite_inf; [límite_sup]', 'Función de error entre dos límites.', 'n n?', (a, b) => (b === undefined ? erf(a) : erf(b) - erf(a)));
  def('ERFC', 'FUN.ERROR.COMPL', 'G', 'x', 'Función de error complementaria.', 'n', erfc);
  aliasEs('COUNT', 'CUENTA'); aliasEs('COUNTA', 'CUENTAA');
})(typeof window !== 'undefined' ? window : globalThis);
