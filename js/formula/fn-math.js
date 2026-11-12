/* Funciones matemáticas y trigonométricas, y agregados condicionales. */
(function (root) {
  'use strict';
  const HC = root.HC, E = HC.E, FErr = HC.FErr, X = HC.fx;
  const { def, aliasEs, toNum, scalar, toArr, nums, criteria, Ref, mkArr } = X;
  const isArr = Array.isArray;
  const M = 'M';

  // ---------------------------------------------------------------- redondeo
  function rnd(x, d, mode) { // mode 0: al más cercano · 1: alejándose de cero · -1: hacia cero
    if (!isFinite(x) || x === 0) return x;
    d = Math.trunc(d);
    if (d > 15) return x;
    const s = x < 0 ? -1 : 1, a = Math.abs(x);
    let y = d >= 0 ? a * Math.pow(10, d) : a / Math.pow(10, -d);
    y = parseFloat(y.toPrecision(15));
    y = mode === 0 ? Math.round(y) : mode > 0 ? Math.ceil(y) : Math.floor(y);
    return s * (d >= 0 ? y / Math.pow(10, d) : y * Math.pow(10, -d));
  }
  X.rnd = rnd;
  const q15 = (x) => parseFloat(x.toPrecision(15));

  def('ROUND', 'REDONDEAR', M, 'número; decimales', 'Redondea un número al número de decimales indicado.', 'n n', (x, d) => rnd(x, d, 0));
  def('ROUNDUP', 'REDONDEAR.MAS', M, 'número; decimales', 'Redondea un número hacia arriba, alejándolo de cero.', 'n n', (x, d) => rnd(x, d, 1));
  def('ROUNDDOWN', 'REDONDEAR.MENOS', M, 'número; decimales', 'Redondea un número hacia abajo, hacia cero.', 'n n', (x, d) => rnd(x, d, -1));
  def('TRUNC', 'TRUNCAR', M, 'número; [decimales]', 'Quita los decimales de un número sin redondear.', 'n n?', (x, d = 0) => rnd(x, d, -1));
  def('INT', 'ENTERO', M, 'número', 'Redondea un número hasta el entero inferior más próximo.', 'n', (x) => Math.floor(x));
  def('MROUND', 'REDOND.MULT', M, 'número; múltiplo', 'Redondea un número al múltiplo indicado.', 'n n', (x, m) => {
    if (m === 0) return 0;
    if (x * m < 0) return E.NUM;
    return q15(Math.round(q15(Math.abs(x / m))) * Math.abs(m)) * (x < 0 ? -1 : 1);
  });
  def('CEILING', 'MULTIPLO.SUPERIOR', M, 'número; cifra_significativa', 'Redondea un número hacia arriba al múltiplo significativo más próximo.', 'n n?', (x, s = 1) => {
    if (s === 0 || x === 0) return 0;
    if (x > 0 && s < 0) return E.NUM;
    return q15(Math.ceil(q15(x / s)) * s);
  });
  def('FLOOR', 'MULTIPLO.INFERIOR', M, 'número; cifra_significativa', 'Redondea un número hacia abajo al múltiplo significativo más próximo.', 'n n?', (x, s = 1) => {
    if (x === 0) return 0;
    if (s === 0) return E.DIV0;
    if (x > 0 && s < 0) return E.NUM;
    return q15(Math.floor(q15(x / s)) * s);
  });
  const ceilMath = (x, s, mode) => { s = Math.abs(s); if (!s) return 0; return q15((x < 0 && mode ? Math.floor(q15(x / s)) : Math.ceil(q15(x / s))) * s); };
  const floorMath = (x, s, mode) => { s = Math.abs(s); if (!s) return 0; return q15((x < 0 && mode ? Math.ceil(q15(x / s)) : Math.floor(q15(x / s))) * s); };
  def('CEILING.MATH', 'MULTIPLO.SUPERIOR.MAT', M, 'número; [cifra_significativa]; [modo]', 'Redondea hacia arriba al entero o múltiplo más próximo.', 'n n? n?', (x, s = 1, m = 0) => ceilMath(x, s, m));
  def('FLOOR.MATH', 'MULTIPLO.INFERIOR.MAT', M, 'número; [cifra_significativa]; [modo]', 'Redondea hacia abajo al entero o múltiplo más próximo.', 'n n? n?', (x, s = 1, m = 0) => floorMath(x, s, m));
  def('CEILING.PRECISE', 'MULTIPLO.SUPERIOR.EXACTO', M, 'número; [cifra_significativa]', 'Redondea hacia arriba sin importar el signo.', 'n n?', (x, s = 1) => ceilMath(x, s, 0));
  def('ISO.CEILING', 'MULTIPLO.SUPERIOR.ISO', M, 'número; [cifra_significativa]', 'Redondea hacia arriba sin importar el signo (norma ISO).', 'n n?', (x, s = 1) => ceilMath(x, s, 0));
  def('FLOOR.PRECISE', 'MULTIPLO.INFERIOR.EXACTO', M, 'número; [cifra_significativa]', 'Redondea hacia abajo sin importar el signo.', 'n n?', (x, s = 1) => floorMath(x, s, 0));
  def('EVEN', 'REDONDEA.PAR', M, 'número', 'Redondea al entero par más próximo alejándose de cero.', 'n', (x) => { const a = Math.ceil(Math.abs(x) - 1e-12); return (a % 2 ? a + 1 : a) * (x < 0 ? -1 : 1); });
  def('ODD', 'REDONDEA.IMPAR', M, 'número', 'Redondea al entero impar más próximo alejándose de cero.', 'n', (x) => { const a = Math.ceil(Math.abs(x) - 1e-12); return (a % 2 ? a : a + 1) * (x < 0 ? -1 : 1); });

  // ---------------------------------------------------------------- aritmética básica
  def('ABS', 'ABS', M, 'número', 'Valor absoluto de un número.', 'n', Math.abs);
  def('SIGN', 'SIGNO', M, 'número', 'Signo de un número: 1, 0 o -1.', 'n', (x) => (x > 0 ? 1 : x < 0 ? -1 : 0));
  def('SQRT', 'RAIZ', M, 'número', 'Raíz cuadrada de un número.', 'n', (x) => (x < 0 ? E.NUM : Math.sqrt(x)));
  aliasEs('SQRT', 'RCUAD');
  def('SQRTPI', 'RAIZ2PI', M, 'número', 'Raíz cuadrada de un número multiplicado por pi.', 'n', (x) => (x < 0 ? E.NUM : Math.sqrt(x * Math.PI)));
  def('POWER', 'POTENCIA', M, 'número; potencia', 'Eleva un número a una potencia.', 'n n', (x, y) => X.power(x, y));
  def('EXP', 'EXP', M, 'número', 'Devuelve e elevado a la potencia indicada.', 'n', Math.exp);
  def('LN', 'LN', M, 'número', 'Logaritmo natural de un número.', 'n', (x) => (x <= 0 ? E.NUM : Math.log(x)));
  def('LOG10', 'LOG10', M, 'número', 'Logaritmo en base 10.', 'n', (x) => (x <= 0 ? E.NUM : Math.log10(x)));
  def('LOG', 'LOG', M, 'número; [base]', 'Logaritmo de un número en la base indicada (10 si se omite).', 'n n?', (x, b = 10) => {
    if (x <= 0 || b <= 0) return E.NUM;
    if (b === 1) return E.DIV0;
    return b === 10 ? Math.log10(x) : q15(Math.log(x) / Math.log(b));
  });
  def('MOD', 'RESIDUO', M, 'número; divisor', 'Resto de una división (con el signo del divisor).', 'n n', (n, d) => {
    if (d === 0) return E.DIV0;
    const r = n - d * Math.floor(n / d);
    return Math.abs(r) < 1e-12 * Math.max(1, Math.abs(d)) || Math.abs(r - d) < 1e-12 * Math.abs(d) ? 0 : q15(r);
  });
  aliasEs('MOD', 'RESTO');
  def('QUOTIENT', 'COCIENTE', M, 'numerador; denominador', 'Parte entera de una división.', 'n n', (n, d) => (d === 0 ? E.DIV0 : Math.trunc(n / d)));
  def('PI', 'PI', M, '', 'El número pi (3,14159…).', '', () => Math.PI);
  const gcd2 = (a, b) => { while (b) { [a, b] = [b, a % b]; } return a; };
  def('GCD', 'M.C.D', M, 'número1; [número2]; …', 'Máximo común divisor.', 'raw', (args) => {
    const v = nums(args); if (v instanceof FErr) return v;
    let g = 0;
    for (const x of v) { if (x < 0) return E.NUM; g = gcd2(g, Math.floor(x)); }
    return g;
  }, { min: 1 });
  def('LCM', 'M.C.M', M, 'número1; [número2]; …', 'Mínimo común múltiplo.', 'raw', (args) => {
    const v = nums(args); if (v instanceof FErr) return v;
    let l = 1;
    for (let x of v) { if (x < 0) return E.NUM; x = Math.floor(x); if (x === 0) return 0; l = (l / gcd2(l, x)) * x; }
    return l;
  }, { min: 1 });
  const FACTS = [1];
  for (let i = 1; i <= 170; i++) FACTS[i] = FACTS[i - 1] * i;
  const fact = (n) => { n = Math.floor(n); return n < 0 || n > 170 ? E.NUM : FACTS[n]; };
  X.fact = fact;
  def('FACT', 'FACT', M, 'número', 'Factorial de un número.', 'n', fact);
  def('FACTDOUBLE', 'FACT.DOBLE', M, 'número', 'Factorial doble de un número.', 'n', (n) => {
    n = Math.floor(n); if (n < -1) return E.NUM;
    let r = 1; for (let k = n; k > 1; k -= 2) r *= k; return r;
  });
  function combin(n, k) {
    n = Math.floor(n); k = Math.floor(k);
    if (n < 0 || k < 0 || k > n) return E.NUM;
    k = Math.min(k, n - k);
    let r = 1;
    for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
    return Math.round(r);
  }
  X.combin = combin;
  def('COMBIN', 'COMBINAT', M, 'número; tamaño', 'Número de combinaciones sin repetición.', 'n n', combin);
  def('COMBINA', 'COMBINA', M, 'número; tamaño', 'Número de combinaciones con repetición.', 'n n', (n, k) => { n = Math.floor(n); k = Math.floor(k); if (n < 0 || k < 0) return E.NUM; return n === 0 && k === 0 ? 1 : combin(n + k - 1, k); });
  def('MULTINOMIAL', 'MULTINOMIAL', M, 'número1; [número2]; …', 'Coeficiente multinomial de un conjunto de números.', 'raw', (args) => {
    const v = nums(args); if (v instanceof FErr) return v;
    let sum = 0, den = 1;
    for (const x of v) { if (x < 0) return E.NUM; sum += Math.floor(x); den *= FACTS[Math.floor(x)] || Infinity; }
    const f = fact(sum); return f instanceof FErr ? f : f / den;
  }, { min: 1 });

  // ---------------------------------------------------------------- trigonometría
  def('SIN', 'SENO', M, 'ángulo', 'Seno de un ángulo en radianes.', 'n', Math.sin);
  aliasEs('SIN', 'SEN');
  def('COS', 'COS', M, 'ángulo', 'Coseno de un ángulo en radianes.', 'n', Math.cos);
  def('TAN', 'TAN', M, 'ángulo', 'Tangente de un ángulo en radianes.', 'n', Math.tan);
  def('ASIN', 'ASENO', M, 'número', 'Arcoseno, en radianes.', 'n', (x) => (x < -1 || x > 1 ? E.NUM : Math.asin(x)));
  def('ACOS', 'ACOS', M, 'número', 'Arcocoseno, en radianes.', 'n', (x) => (x < -1 || x > 1 ? E.NUM : Math.acos(x)));
  def('ATAN', 'ATAN', M, 'número', 'Arcotangente, en radianes.', 'n', Math.atan);
  def('ATAN2', 'ATAN2', M, 'coord_x; coord_y', 'Arcotangente de las coordenadas x e y.', 'n n', (x, y) => (x === 0 && y === 0 ? E.DIV0 : Math.atan2(y, x)));
  def('SINH', 'SENOH', M, 'número', 'Seno hiperbólico.', 'n', Math.sinh);
  def('COSH', 'COSH', M, 'número', 'Coseno hiperbólico.', 'n', Math.cosh);
  def('TANH', 'TANH', M, 'número', 'Tangente hiperbólica.', 'n', Math.tanh);
  def('ASINH', 'ASENOH', M, 'número', 'Seno hiperbólico inverso.', 'n', Math.asinh);
  def('ACOSH', 'ACOSH', M, 'número', 'Coseno hiperbólico inverso.', 'n', (x) => (x < 1 ? E.NUM : Math.acosh(x)));
  def('ATANH', 'ATANH', M, 'número', 'Tangente hiperbólica inversa.', 'n', (x) => (x <= -1 || x >= 1 ? E.NUM : Math.atanh(x)));
  def('COT', 'COT', M, 'ángulo', 'Cotangente de un ángulo.', 'n', (x) => (x === 0 ? E.DIV0 : 1 / Math.tan(x)));
  def('COTH', 'COTH', M, 'número', 'Cotangente hiperbólica.', 'n', (x) => (x === 0 ? E.DIV0 : 1 / Math.tanh(x)));
  def('CSC', 'CSC', M, 'ángulo', 'Cosecante de un ángulo.', 'n', (x) => (x === 0 ? E.DIV0 : 1 / Math.sin(x)));
  def('CSCH', 'CSCH', M, 'número', 'Cosecante hiperbólica.', 'n', (x) => (x === 0 ? E.DIV0 : 1 / Math.sinh(x)));
  def('SEC', 'SEC', M, 'ángulo', 'Secante de un ángulo.', 'n', (x) => 1 / Math.cos(x));
  def('SECH', 'SECH', M, 'número', 'Secante hiperbólica.', 'n', (x) => 1 / Math.cosh(x));
  def('ACOT', 'ACOT', M, 'número', 'Arcocotangente, en radianes.', 'n', (x) => Math.PI / 2 - Math.atan(x));
  def('ACOTH', 'ACOTH', M, 'número', 'Cotangente hiperbólica inversa.', 'n', (x) => (Math.abs(x) <= 1 ? E.NUM : 0.5 * Math.log((x + 1) / (x - 1))));
  def('DEGREES', 'GRADOS', M, 'ángulo', 'Convierte radianes en grados.', 'n', (x) => (x * 180) / Math.PI);
  def('RADIANS', 'RADIANES', M, 'ángulo', 'Convierte grados en radianes.', 'n', (x) => (x * Math.PI) / 180);

  // ---------------------------------------------------------------- aleatorios y secuencias
  def('RAND', 'ALEATORIO', M, '', 'Número aleatorio entre 0 y 1. Cambia en cada recálculo.', '', () => Math.random());
  def('RANDBETWEEN', 'ALEATORIO.ENTRE', M, 'inferior; superior', 'Entero aleatorio entre dos números.', 'n n', (a, b) => {
    a = Math.ceil(a); b = Math.floor(b);
    return a > b ? E.NUM : a + Math.floor(Math.random() * (b - a + 1));
  });
  def('RANDARRAY', 'MATRIZALEAT', 'A', '[filas]; [columnas]; [mín]; [máx]; [entero]', 'Matriz de números aleatorios.', 'n? n? n? n? b?', (r = 1, c = 1, lo = 0, hi = 1, int = false) => {
    r = Math.floor(r); c = Math.floor(c);
    if (r < 1 || c < 1 || lo > hi) return E.VALUE;
    if (r * c > 1e6) return E.NUM;
    return mkArr(r, c, () => (int ? Math.ceil(lo) + Math.floor(Math.random() * (Math.floor(hi) - Math.ceil(lo) + 1)) : lo + Math.random() * (hi - lo)));
  });
  def('SEQUENCE', 'SECUENCIA', 'A', 'filas; [columnas]; [inicio]; [paso]', 'Genera una lista de números consecutivos.', 'n n? n? n?', (r, c = 1, start = 1, step = 1) => {
    r = Math.floor(r); c = Math.floor(c);
    if (r < 1 || c < 1) return E.VALUE;
    if (r * c > 1e6) return E.NUM;
    return mkArr(r, c, (i, j) => start + (i * c + j) * step);
  });

  // ---------------------------------------------------------------- sumas y productos
  function kahanSum(v) { // suma compensada: evita residuos como 0.1+0.2+…
    let s = 0, c = 0;
    for (let i = 0; i < v.length; i++) { const y = v[i] - c, t = s + y; c = t - s - y; s = t; }
    return s;
  }
  X.sum = kahanSum;
  def('SUM', 'SUMA', M, 'número1; [número2]; …', 'Suma todos los números de los rangos o valores indicados.', 'raw', (args) => {
    const v = nums(args); return v instanceof FErr ? v : kahanSum(v);
  }, { min: 1 });
  def('PRODUCT', 'PRODUCTO', M, 'número1; [número2]; …', 'Multiplica todos los números indicados.', 'raw', (args) => {
    const v = nums(args); if (v instanceof FErr) return v;
    let p = 1; for (const x of v) p *= x; return v.length ? p : 0;
  }, { min: 1 });
  def('SUMSQ', 'SUMA.CUADRADOS', M, 'número1; [número2]; …', 'Suma de los cuadrados de los números.', 'raw', (args) => {
    const v = nums(args); if (v instanceof FErr) return v;
    let s = 0; for (const x of v) s += x * x; return s;
  }, { min: 1 });
  def('SUMPRODUCT', 'SUMAPRODUCTO', M, 'matriz1; [matriz2]; …', 'Multiplica los elementos correspondientes de las matrices y suma los productos.', 'raw', (args) => {
    const arrs = [];
    for (const a of args) { if (a instanceof FErr) return a; arrs.push(toArr(a)); }
    const R = arrs[0].length, C = arrs[0][0].length;
    for (const a of arrs) if (a.length !== R || a[0].length !== C) return E.VALUE;
    const terms = [];
    for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) {
      let p = 1;
      for (const a of arrs) { const v = a[i][j]; if (v instanceof FErr) return v; p *= typeof v === 'number' ? v : typeof v === 'boolean' && arrs.length === 1 ? (v ? 1 : 0) : 0; }
      terms.push(p);
    }
    return kahanSum(terms);
  }, { min: 1 });
  function pairXY(ax, ay, fn) {
    const x = X.flatten(ax), y = X.flatten(ay);
    if (x.length !== y.length) return E.NA;
    let s = 0;
    for (let i = 0; i < x.length; i++) {
      if (x[i] instanceof FErr) return x[i]; if (y[i] instanceof FErr) return y[i];
      if (typeof x[i] === 'number' && typeof y[i] === 'number') s += fn(x[i], y[i]);
    }
    return s;
  }
  def('SUMX2MY2', 'SUMAX2MENOSY2', M, 'matriz_x; matriz_y', 'Suma de la diferencia de cuadrados de dos matrices.', 'r r', (a, b) => pairXY(a, b, (x, y) => x * x - y * y));
  def('SUMX2PY2', 'SUMAX2MASY2', M, 'matriz_x; matriz_y', 'Suma de la suma de cuadrados de dos matrices.', 'r r', (a, b) => pairXY(a, b, (x, y) => x * x + y * y));
  def('SUMXMY2', 'SUMAXMENOSY2', M, 'matriz_x; matriz_y', 'Suma de los cuadrados de las diferencias.', 'r r', (a, b) => pairXY(a, b, (x, y) => (x - y) * (x - y)));
  def('SERIESSUM', 'SUMA.SERIES', M, 'x; n; m; coeficientes', 'Suma de una serie de potencias.', 'n n n r', (x, n, m, co) => {
    const c = nums([co]); if (c instanceof FErr) return c;
    let s = 0; c.forEach((a, i) => { s += a * Math.pow(x, n + i * m); }); return s;
  });

  // ---------------------------------------------------------------- agregados condicionales
  const dimsOf = (v) => (v instanceof Ref ? [v.rows, v.cols] : isArr(v) ? [v.length, v[0].length] : [1, 1]);
  // pares [rango, criterio, rango, criterio…] -> {pos: [[i, j]…], blankAll, total} o error
  function condMatch(pairs) {
    const arrs = [], preds = [];
    let dims = null, R = 0, C = 0, blankAll = true;
    for (let k = 0; k + 1 < pairs.length; k += 2) {
      const rg = pairs[k];
      if (rg instanceof FErr) return rg;
      const d = dimsOf(rg);
      if (!dims) dims = d; else if (dims[0] !== d[0] || dims[1] !== d[1]) return E.VALUE;
      const a = toArr(rg), p = criteria(scalar(pairs[k + 1]));
      arrs.push(a); preds.push(p);
      if (!p(null)) blankAll = false;
      if (a.length > R) R = a.length;
      if (a[0].length > C) C = a[0].length;
    }
    const pos = [];
    for (let i = 0; i < R; i++) {
      next: for (let j = 0; j < C; j++) {
        for (let k = 0; k < arrs.length; k++) {
          const row = arrs[k][i];
          const v = row && j < row.length ? row[j] : null;
          if (!preds[k](v == null ? null : v)) continue next;
        }
        pos.push([i, j]);
      }
    }
    return { pos, blankAll, clipped: R * C, total: dims[0] * dims[1] };
  }
  // valores de un rango de resultados en las posiciones dadas (el rango puede estar en otra hoja)
  function valuesAt(target, pos) {
    const out = [];
    if (target instanceof Ref) {
      const s = target.sheet, wb = s.wb;
      for (const [i, j] of pos) out.push(wb.cellValue(s, target.r1 + i, target.c1 + j));
    } else {
      const a = toArr(target);
      for (const [i, j] of pos) out.push(a[i] && j < a[i].length ? a[i][j] : null);
    }
    return out;
  }
  function condNums(target, pairs) {
    const m = condMatch(pairs);
    if (m instanceof FErr) return m;
    const out = [];
    for (const v of valuesAt(target, m.pos)) {
      if (v instanceof FErr) return v;
      if (typeof v === 'number') out.push(v);
    }
    return out;
  }
  X.condMatch = condMatch; X.condNums = condNums;

  def('SUMIF', 'SUMAR.SI', M, 'rango; criterio; [rango_suma]', 'Suma las celdas que cumplen una condición.', 'r e r?', (rg, crit, sum) => {
    const v = condNums(sum === undefined ? rg : sum, [rg, crit]);
    return v instanceof FErr ? v : kahanSum(v);
  });
  def('SUMIFS', 'SUMAR.SI.CONJUNTO', M, 'rango_suma; rango_criterios1; criterio1; …', 'Suma las celdas que cumplen varias condiciones.', 'raw', (args) => {
    if (args.length % 2 !== 1) return E.VALUE;
    const v = condNums(args[0], args.slice(1));
    return v instanceof FErr ? v : kahanSum(v);
  }, { min: 3 });

  // ---------------------------------------------------------------- subtotales
  // Valores visibles de los rangos, sin contar otras celdas de subtotales.
  function visibleValues(refs, skipHidden, skipErrors) {
    const out = [];
    for (const ref of refs) {
      if (ref instanceof FErr) return ref;
      if (!(ref instanceof Ref)) { X.flatten(ref, out); continue; }
      const s = ref.sheet, wb = s.wb, b = ref.bounds();
      for (let r = ref.r1; r <= b.r2; r++) {
        const row = s.rows[r];
        if (!row) continue;
        if (s.isRowFiltered(r) || (skipHidden && s.isRowHidden(r))) continue;
        for (let c = ref.c1; c <= Math.min(b.c2, row.length - 1); c++) {
          const cell = row[c];
          if (!cell) continue;
          if (cell.f && /\b(SUBTOTAL|AGGREGATE)\(/.test(cell.f)) continue;
          const v = wb.cellValue(s, r, c);
          if (v instanceof FErr && skipErrors) continue;
          if (v != null) out.push(v);
        }
      }
    }
    return out;
  }
  const SUBFN = { 1: 'AVERAGE', 2: 'COUNT', 3: 'COUNTA', 4: 'MAX', 5: 'MIN', 6: 'PRODUCT', 7: 'STDEV.S', 8: 'STDEV.P', 9: 'SUM', 10: 'VAR.S', 11: 'VAR.P', 12: 'MEDIAN', 13: 'MODE.SNGL', 14: 'LARGE', 15: 'SMALL', 16: 'PERCENTILE.INC', 17: 'QUARTILE.INC', 18: 'PERCENTILE.EXC', 19: 'QUARTILE.EXC' };
  def('SUBTOTAL', 'SUBTOTALES', M, 'núm_función; ref1; [ref2]; …', 'Subtotal de una lista que ignora las filas ocultas por un filtro. 9 = suma, 1 = promedio, 2 = contar, 4 = máx, 5 = mín.', 'raw', function (args, ctx) {
    let code = toNum(scalar(args[0])); if (code instanceof FErr) return code;
    code = Math.floor(code);
    const skipHidden = code > 100; if (skipHidden) code -= 100;
    if (code < 1 || code > 11) return E.VALUE;
    const vals = visibleValues(args.slice(1), skipHidden, false);
    if (vals instanceof FErr) return vals;
    return X.apply(HC.fns[SUBFN[code]], [(vals.length ? vals : [null]).map((v) => [v])], ctx);
  }, { min: 2 });
  def('AGGREGATE', 'AGREGAR', M, 'núm_función; opciones; ref1; [k]', 'Agregado que puede ignorar filas ocultas y errores (opción 6 = ignorar errores).', 'raw', function (args, ctx) {
    let code = toNum(scalar(args[0])), opt = toNum(scalar(args[1]));
    if (code instanceof FErr) return code; if (opt instanceof FErr) return opt;
    code = Math.floor(code); opt = Math.floor(opt);
    if (!SUBFN[code] || opt < 0 || opt > 7) return E.VALUE;
    const skipHidden = opt === 1 || opt === 3 || opt === 5 || opt === 7, skipErr = opt === 2 || opt === 3 || opt === 6 || opt === 7;
    const hasK = code >= 14;
    const vals = visibleValues(hasK ? [args[2]] : args.slice(2), skipHidden, skipErr);
    if (vals instanceof FErr) return vals;
    const col = (vals.length ? vals : [null]).map((v) => [v]);
    return X.apply(HC.fns[SUBFN[code]], hasK ? [col, args[3]] : [col], ctx);
  }, { min: 3 });

  // ---------------------------------------------------------------- números romanos y bases
  const ROM = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  def('ROMAN', 'NUMERO.ROMANO', M, 'número', 'Convierte un número arábigo en romano.', 'n n?', (n) => {
    n = Math.floor(n); if (n < 0 || n > 3999) return E.VALUE;
    let s = ''; for (const [v, r] of ROM) while (n >= v) { s += r; n -= v; } return s;
  });
  def('ARABIC', 'NUMERO.ARABE', M, 'texto', 'Convierte un número romano en arábigo.', 's', (t) => {
    const vals = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
    let s = t.trim().toUpperCase(), sign = 1, total = 0;
    if (s[0] === '-') { sign = -1; s = s.slice(1); }
    for (let i = 0; i < s.length; i++) {
      const a = vals[s[i]], b = vals[s[i + 1]];
      if (!a) return E.VALUE;
      total += b && b > a ? -a : a;
    }
    return sign * total;
  });
  def('BASE', 'BASE', M, 'número; base; [longitud_mín]', 'Convierte un número a texto en la base indicada.', 'n n n?', (n, b, len = 0) => {
    n = Math.floor(n); b = Math.floor(b);
    if (n < 0 || b < 2 || b > 36 || len < 0) return E.NUM;
    return n.toString(b).toUpperCase().padStart(Math.floor(len), '0');
  });
  def('DECIMAL', 'CONV.DECIMAL', M, 'texto; base', 'Convierte el texto de un número en una base dada a decimal.', 's n', (t, b) => {
    b = Math.floor(b); if (b < 2 || b > 36) return E.NUM;
    const s = t.trim().toLowerCase(); if (!s) return 0;
    const digits = '0123456789abcdefghijklmnopqrstuvwxyz'.slice(0, b);
    let v = 0; for (const ch of s) { const k = digits.indexOf(ch); if (k < 0) return E.NUM; v = v * b + k; } return v;
  });

  // ---------------------------------------------------------------- matrices
  function numMatrix(a) {
    for (const row of a) for (const v of row) { if (v instanceof FErr) return v; if (typeof v !== 'number') return E.VALUE; }
    return a;
  }
  function luDet(a) {
    const n = a.length; const m = a.map((r) => r.slice()); let det = 1;
    for (let i = 0; i < n; i++) {
      let p = i; for (let k = i + 1; k < n; k++) if (Math.abs(m[k][i]) > Math.abs(m[p][i])) p = k;
      if (Math.abs(m[p][i]) < 1e-14) return 0;
      if (p !== i) { [m[p], m[i]] = [m[i], m[p]]; det = -det; }
      det *= m[i][i];
      for (let k = i + 1; k < n; k++) { const f = m[k][i] / m[i][i]; for (let j = i; j < n; j++) m[k][j] -= f * m[i][j]; }
    }
    return det;
  }
  def('MDETERM', 'MDETERM', M, 'matriz', 'Determinante de una matriz cuadrada.', 'a', (a) => {
    const m = numMatrix(a); if (m instanceof FErr) return m;
    return m.length !== m[0].length ? E.VALUE : q15(luDet(m));
  });
  def('MINVERSE', 'MINVERSA', M, 'matriz', 'Matriz inversa de una matriz cuadrada.', 'a', (a) => {
    const src = numMatrix(a); if (src instanceof FErr) return src;
    const n = src.length; if (n !== src[0].length) return E.VALUE;
    const m = src.map((r, i) => r.concat(mkArr(1, n, (_, j) => (i === j ? 1 : 0))[0]));
    for (let i = 0; i < n; i++) {
      let p = i; for (let k = i + 1; k < n; k++) if (Math.abs(m[k][i]) > Math.abs(m[p][i])) p = k;
      if (Math.abs(m[p][i]) < 1e-14) return E.NUM;
      [m[p], m[i]] = [m[i], m[p]];
      const d = m[i][i]; for (let j = 0; j < 2 * n; j++) m[i][j] /= d;
      for (let k = 0; k < n; k++) if (k !== i) { const f = m[k][i]; if (f) for (let j = 0; j < 2 * n; j++) m[k][j] -= f * m[i][j]; }
    }
    return m.map((r) => r.slice(n));
  });
  def('MMULT', 'MMULT', M, 'matriz1; matriz2', 'Producto matricial de dos matrices.', 'a a', (a, b) => {
    const A = numMatrix(a), B = numMatrix(b);
    if (A instanceof FErr) return A; if (B instanceof FErr) return B;
    if (A[0].length !== B.length) return E.VALUE;
    return mkArr(A.length, B[0].length, (i, j) => { let s = 0; for (let k = 0; k < B.length; k++) s += A[i][k] * B[k][j]; return s; });
  });
  def('MUNIT', 'M.UNIDAD', M, 'dimensión', 'Matriz identidad de la dimensión indicada.', 'n', (n) => { n = Math.floor(n); return n < 1 ? E.VALUE : mkArr(n, n, (i, j) => (i === j ? 1 : 0)); });
})(typeof window !== 'undefined' ? window : globalThis);
