/* Funciones financieras. */
(function (root) {
  'use strict';
  const HC = root.HC, E = HC.E, FErr = HC.FErr, X = HC.fx;
  const { def, aliasEs, nums, flatten } = X;
  const F = 'F';

  function pmt(r, n, pv, fv, type) {
    if (n === 0) return E.NUM;
    if (r === 0) return -(pv + fv) / n;
    const p = Math.pow(1 + r, n);
    return (-r * (pv * p + fv)) / ((1 + r * type) * (p - 1));
  }
  function fv(r, n, pm, pv, type) {
    if (r === 0) return -(pv + pm * n);
    const p = Math.pow(1 + r, n);
    return -(pv * p + (pm * (1 + r * type) * (p - 1)) / r);
  }
  function pvf(r, n, pm, fvv, type) {
    if (r === 0) return -(fvv + pm * n);
    const p = Math.pow(1 + r, n);
    return -(fvv + (pm * (1 + r * type) * (p - 1)) / r) / p;
  }
  function ipmt(r, per, n, pv, fvv, type) {
    const pm = pmt(r, n, pv, fvv, type);
    if (pm instanceof FErr) return pm;
    if (per === 1 && type === 1) return 0;
    let i = fv(r, per - 1, pm, pv, type) * r;
    if (type === 1) i /= 1 + r;
    return i;
  }
  const T = (t) => (t ? 1 : 0);
  def('PMT', 'PAGO', F, 'tasa; nper; va; [vf]; [tipo]', 'Pago periódico de un préstamo con cuotas e interés constantes.', 'n n n n? n?', (r, n, pv, f = 0, t = 0) => pmt(r, n, pv, f, T(t)));
  def('FV', 'VF', F, 'tasa; nper; pago; [va]; [tipo]', 'Valor futuro de una inversión con pagos periódicos constantes.', 'n n n n? n?', (r, n, pm, pv = 0, t = 0) => fv(r, n, pm, pv, T(t)));
  def('PV', 'VA', F, 'tasa; nper; pago; [vf]; [tipo]', 'Valor actual de una inversión o préstamo.', 'n n n n? n?', (r, n, pm, f = 0, t = 0) => pvf(r, n, pm, f, T(t)));
  def('NPER', 'NPER', F, 'tasa; pago; va; [vf]; [tipo]', 'Número de períodos de una inversión.', 'n n n n? n?', (r, pm, pv, f = 0, t = 0) => {
    t = T(t);
    if (r === 0) return pm === 0 ? E.NUM : -(pv + f) / pm;
    const num = pm * (1 + r * t) - f * r, den = pv * r + pm * (1 + r * t);
    if (den === 0 || num / den <= 0) return E.NUM;
    return Math.log(num / den) / Math.log(1 + r);
  });
  def('RATE', 'TASA', F, 'nper; pago; va; [vf]; [tipo]; [estimar]', 'Tasa de interés por período de un préstamo o inversión.', 'n n n n? n? n?', (n, pm, pv, f = 0, t = 0, guess = 0.1) => {
    t = T(t);
    const fn = (r) => (Math.abs(r) < 1e-10 ? pv + pm * n + f : pv * Math.pow(1 + r, n) + (pm * (1 + r * t) * (Math.pow(1 + r, n) - 1)) / r + f);
    let r0 = guess, r1 = guess + 0.01, f0 = fn(r0), f1 = fn(r1);
    for (let i = 0; i < 200; i++) {
      if (Math.abs(f1) < 1e-11) return r1;
      if (f1 === f0) break;
      let r2 = r1 - (f1 * (r1 - r0)) / (f1 - f0);
      if (r2 <= -1) r2 = (r1 - 1) / 2;
      r0 = r1; f0 = f1; r1 = r2; f1 = fn(r1);
      if (!isFinite(f1)) break;
      if (Math.abs(r1 - r0) < 1e-13) return r1;
    }
    return Math.abs(f1) < 1e-7 ? r1 : E.NUM;
  });
  def('IPMT', 'PAGOINT', F, 'tasa; período; nper; va; [vf]; [tipo]', 'Interés pagado en un período concreto de un préstamo.', 'n n n n n? n?', (r, per, n, pv, f = 0, t = 0) => (per < 1 || per > n ? E.NUM : ipmt(r, per, n, pv, f, T(t))));
  def('PPMT', 'PAGOPRIN', F, 'tasa; período; nper; va; [vf]; [tipo]', 'Capital amortizado en un período concreto de un préstamo.', 'n n n n n? n?', (r, per, n, pv, f = 0, t = 0) => {
    if (per < 1 || per > n) return E.NUM;
    const p = pmt(r, n, pv, f, T(t)), i = ipmt(r, per, n, pv, f, T(t));
    return p instanceof FErr ? p : i instanceof FErr ? i : p - i;
  });
  function cum(principal) {
    return (r, n, pv, s, e, t) => {
      s = Math.ceil(s); e = Math.floor(e); t = T(t);
      if (r <= 0 || n <= 0 || pv <= 0 || s < 1 || e < s || e > n) return E.NUM;
      const p = pmt(r, n, pv, 0, t); let total = 0;
      for (let per = s; per <= e; per++) { const i = ipmt(r, per, n, pv, 0, t); total += principal ? p - i : i; }
      return total;
    };
  }
  def('CUMIPMT', 'PAGO.INT.ENTRE', F, 'tasa; nper; va; período_inicial; período_final; tipo', 'Interés acumulado pagado entre dos períodos.', 'n n n n n n', cum(false));
  def('CUMPRINC', 'PAGO.PRINC.ENTRE', F, 'tasa; nper; va; período_inicial; período_final; tipo', 'Capital acumulado pagado entre dos períodos.', 'n n n n n n', cum(true));
  def('ISPMT', 'INT.PAGO.DIR', F, 'tasa; período; nper; va', 'Interés de un préstamo de amortización lineal en un período.', 'n n n n', (r, per, n, pv) => (n === 0 ? E.DIV0 : pv * r * (per / n - 1)));
  def('NPV', 'VNA', F, 'tasa; valor1; [valor2]; …', 'Valor neto actual de una serie de flujos de caja periódicos.', 'raw', (args) => {
    const r = X.toNum(X.scalar(args[0])); if (r instanceof FErr) return r;
    const v = nums(args.slice(1)); if (v instanceof FErr) return v;
    if (r === -1) return E.DIV0;
    let s = 0; v.forEach((x, i) => { s += x / Math.pow(1 + r, i + 1); }); return s;
  }, { min: 2 });
  // raíz de una función por Newton con respaldo de bisección
  function solve(fn, guess) {
    let r = guess;
    for (let i = 0; i < 100; i++) {
      const f = fn(r), h = 1e-6 * Math.max(1, Math.abs(r)), d = (fn(r + h) - f) / h;
      if (!isFinite(f) || !isFinite(d) || d === 0) break;
      const nr = r - f / d;
      if (Math.abs(nr - r) < 1e-12) return nr;
      r = nr <= -1 ? (r - 1) / 2 : nr;
    }
    if (isFinite(r) && Math.abs(fn(r)) < 1e-7) return r;
    let lo = -0.999999, hi = 10, flo = fn(lo), fhi = fn(hi);
    for (let k = 0; k < 60 && flo * fhi > 0; k++) { hi *= 2; fhi = fn(hi); }
    if (!(flo * fhi <= 0)) return E.NUM;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2, fm = fn(mid);
      if (flo * fm <= 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
      if (hi - lo < 1e-13) break;
    }
    return (lo + hi) / 2;
  }
  def('IRR', 'TIR', F, 'valores; [estimar]', 'Tasa interna de retorno de una serie de flujos de caja.', 'r n?', (vals, guess = 0.1) => {
    const v = nums([vals]); if (v instanceof FErr) return v;
    if (!v.some((x) => x > 0) || !v.some((x) => x < 0)) return E.NUM;
    return solve((r) => v.reduce((s, x, i) => s + x / Math.pow(1 + r, i), 0), guess);
  });
  def('MIRR', 'TIRM', F, 'valores; tasa_financiamiento; tasa_reinversión', 'Tasa interna de retorno modificada.', 'r n n', (vals, fr, rr) => {
    const v = nums([vals]); if (v instanceof FErr) return v;
    const n = v.length; let pos = 0, neg = 0;
    v.forEach((x, i) => { if (x > 0) pos += x * Math.pow(1 + rr, n - 1 - i); else neg += x / Math.pow(1 + fr, i); });
    if (!pos || !neg) return E.DIV0;
    return Math.pow(-pos / neg, 1 / (n - 1)) - 1;
  });
  function xArgs(vals, dates) {
    const v = flatten(vals), d = flatten(dates);
    if (v.length !== d.length) return E.NUM;
    for (const x of v.concat(d)) { if (x instanceof FErr) return x; if (typeof x !== 'number') return E.VALUE; }
    return { v, d: d.map(Math.floor) };
  }
  def('XNPV', 'VNA.NO.PER', F, 'tasa; valores; fechas', 'Valor neto actual de flujos de caja en fechas no periódicas.', 'n r r', (r, vals, dates) => {
    const a = xArgs(vals, dates); if (a instanceof FErr) return a;
    return a.v.reduce((s, x, i) => s + x / Math.pow(1 + r, (a.d[i] - a.d[0]) / 365), 0);
  });
  def('XIRR', 'TIR.NO.PER', F, 'valores; fechas; [estimar]', 'Tasa interna de retorno de flujos de caja en fechas no periódicas.', 'r r n?', (vals, dates, guess = 0.1) => {
    const a = xArgs(vals, dates); if (a instanceof FErr) return a;
    if (!a.v.some((x) => x > 0) || !a.v.some((x) => x < 0)) return E.NUM;
    return solve((r) => a.v.reduce((s, x, i) => s + x / Math.pow(1 + r, (a.d[i] - a.d[0]) / 365), 0), guess);
  });
  def('SLN', 'SLN', F, 'costo; valor_residual; vida', 'Depreciación lineal de un bien en un período.', 'n n n', (c, s, l) => (l === 0 ? E.DIV0 : (c - s) / l));
  def('SYD', 'SYD', F, 'costo; valor_residual; vida; período', 'Depreciación por suma de dígitos de los años.', 'n n n n', (c, s, l, p) => (l <= 0 || p < 1 || p > l ? E.NUM : ((c - s) * (l - p + 1) * 2) / (l * (l + 1))));
  def('DB', 'DB', F, 'costo; valor_residual; vida; período; [mes]', 'Depreciación por saldo fijo decreciente.', 'n n n n n?', (c, s, l, p, m = 12) => {
    if (c < 0 || s < 0 || l <= 0 || p < 1 || m < 1 || m > 12 || p > l + 1) return E.NUM;
    if (c === 0) return 0;
    const rate = Math.round((1 - Math.pow(s / c, 1 / l)) * 1000) / 1000;
    let total = 0, dep = 0;
    for (let k = 1; k <= Math.floor(p); k++) {
      dep = k === 1 ? (c * rate * m) / 12 : k === Math.floor(l) + 1 ? ((c - total) * rate * (12 - m)) / 12 : (c - total) * rate;
      total += dep;
    }
    return dep;
  });
  def('DDB', 'DDB', F, 'costo; valor_residual; vida; período; [factor]', 'Depreciación por doble disminución de saldo.', 'n n n n n?', (c, s, l, p, f = 2) => {
    if (c < 0 || s < 0 || l <= 0 || p < 1 || p > l || f <= 0) return E.NUM;
    let total = 0, dep = 0;
    for (let k = 1; k <= Math.ceil(p); k++) { dep = Math.min((c - total) * (f / l), Math.max(0, c - s - total)); total += dep; }
    return dep;
  });
  def('EFFECT', 'INT.EFECTIVO', F, 'tasa_nominal; períodos_por_año', 'Tasa de interés anual efectiva.', 'n n', (r, n) => { n = Math.floor(n); return r <= 0 || n < 1 ? E.NUM : Math.pow(1 + r / n, n) - 1; });
  def('NOMINAL', 'TASA.NOMINAL', F, 'tasa_efectiva; períodos_por_año', 'Tasa de interés nominal anual.', 'n n', (r, n) => { n = Math.floor(n); return r <= 0 || n < 1 ? E.NUM : n * (Math.pow(1 + r, 1 / n) - 1); });
  def('FVSCHEDULE', 'VF.PLAN', F, 'capital; tasas', 'Valor futuro de un capital con una serie de tasas de interés.', 'n r', (p, rates) => { const v = nums([rates]); if (v instanceof FErr) return v; for (const r of v) p *= 1 + r; return p; });
  def('PDURATION', 'P.DURACION', F, 'tasa; va; vf', 'Períodos necesarios para que una inversión alcance un valor.', 'n n n', (r, pv, f) => (r <= 0 || pv <= 0 || f <= 0 ? E.NUM : (Math.log(f) - Math.log(pv)) / Math.log(1 + r)));
  def('RRI', 'RRI', F, 'nper; va; vf', 'Tasa de interés equivalente para el crecimiento de una inversión.', 'n n n', (n, pv, f) => (n <= 0 || pv === 0 ? E.NUM : Math.pow(f / pv, 1 / n) - 1));
  def('DOLLARDE', 'MONEDA.DEC', F, 'moneda_fraccionaria; fracción', 'Convierte un precio en fracción a decimal.', 'n n', (x, fr) => {
    fr = Math.floor(fr); if (fr < 0) return E.NUM; if (fr === 0) return E.DIV0;
    const i = Math.trunc(x), digits = Math.ceil(Math.log10(fr)) || 1;
    return i + ((x - i) * Math.pow(10, digits)) / fr;
  });
  def('DOLLARFR', 'MONEDA.FRAC', F, 'moneda_decimal; fracción', 'Convierte un precio decimal en fracción.', 'n n', (x, fr) => {
    fr = Math.floor(fr); if (fr < 0) return E.NUM; if (fr === 0) return E.DIV0;
    const i = Math.trunc(x), digits = Math.ceil(Math.log10(fr)) || 1;
    return i + ((x - i) * fr) / Math.pow(10, digits);
  });
})(typeof window !== 'undefined' ? window : globalThis);
