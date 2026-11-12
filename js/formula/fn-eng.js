/* Funciones de ingeniería (bases, bits, conversión de unidades) y de base de datos. */
(function (root) {
  'use strict';
  const HC = root.HC, E = HC.E, FErr = HC.FErr, X = HC.fx;
  const { def, toStr, toNum, scalar, toArr, criteria } = X;
  const G = 'G', Z = 'Z';

  // ---------------------------------------------------------------- bases numéricas (complemento a dos de 10 dígitos)
  const BASES = { BIN: [2, 10, 'binario'], OCT: [8, 10, 'octal'], HEX: [16, 10, 'hexadecimal'] };
  function toDec(text, base, digits) {
    const s = String(text).trim().toUpperCase();
    if (s === '') return 0;
    if (s.length > digits || !new RegExp('^[' + '0123456789ABCDEF'.slice(0, base) + ']+$').test(s)) return E.NUM;
    let v = 0; for (const ch of s) v = v * base + parseInt(ch, 16);
    const half = Math.pow(base, digits) / 2;
    return s.length === digits && v >= half ? v - half * 2 : v;
  }
  function fromDec(n, base, digits, places) {
    n = Math.trunc(n);
    const half = Math.pow(base, digits) / 2;
    if (n < -half || n >= half) return E.NUM;
    let s = (n < 0 ? n + half * 2 : n).toString(base).toUpperCase();
    if (places !== undefined && n >= 0) { places = Math.floor(places); if (places < s.length || places > digits) return E.NUM; s = s.padStart(places, '0'); }
    return s;
  }
  const names = Object.keys(BASES);
  for (const a of names) {
    const [ba, da, na] = BASES[a];
    def(a + '2DEC', a + '.A.DEC', G, 'número', 'Convierte un número ' + na + ' en decimal.', 'v', (t) => toDec(typeof t === 'number' ? String(t) : t == null ? '' : t, ba, da));
    def('DEC2' + a, 'DEC.A.' + a, G, 'número; [caracteres]', 'Convierte un número decimal en ' + na + '.', 'n n?', (n, p) => fromDec(n, ba, da, p));
    for (const b of names) {
      if (a === b) continue;
      const [bb, db, nb] = BASES[b];
      def(a + '2' + b, a + '.A.' + b, G, 'número; [caracteres]', 'Convierte un número ' + na + ' en ' + nb + '.', 'v n?', (t, p) => {
        const d = toDec(typeof t === 'number' ? String(t) : t == null ? '' : t, ba, da);
        return d instanceof FErr ? d : fromDec(d, bb, db, p);
      });
    }
  }
  const bitOk = (x) => x >= 0 && x < 281474976710656 && Number.isInteger(x);
  function bitFn(name, es, desc, op) {
    def(name, es, G, 'número1; número2', desc, 'n n', (a, b) => (bitOk(a) && bitOk(b) ? Number(op(BigInt(a), BigInt(b))) : E.NUM));
  }
  bitFn('BITAND', 'BIT.Y', 'Y bit a bit de dos números.', (a, b) => a & b);
  bitFn('BITOR', 'BIT.O', 'O bit a bit de dos números.', (a, b) => a | b);
  bitFn('BITXOR', 'BIT.XO', 'O exclusivo bit a bit de dos números.', (a, b) => a ^ b);
  def('BITLSHIFT', 'BIT.DESPLIZQDA', G, 'número; desplazamiento', 'Desplaza los bits de un número a la izquierda.', 'n n', (a, s) => {
    if (!bitOk(a) || Math.abs(s) > 53) return E.NUM;
    const r = s >= 0 ? a * Math.pow(2, Math.floor(s)) : Math.floor(a / Math.pow(2, -Math.floor(s)));
    return r >= 281474976710656 ? E.NUM : r;
  });
  def('BITRSHIFT', 'BIT.DESPLDCHA', G, 'número; desplazamiento', 'Desplaza los bits de un número a la derecha.', 'n n', (a, s) => {
    if (!bitOk(a) || Math.abs(s) > 53) return E.NUM;
    const r = s >= 0 ? Math.floor(a / Math.pow(2, Math.floor(s))) : a * Math.pow(2, -Math.floor(s));
    return r >= 281474976710656 ? E.NUM : r;
  });
  def('DELTA', 'DELTA', G, 'número1; [número2]', 'Devuelve 1 si dos números son iguales y 0 si no.', 'n n?', (a, b = 0) => (a === b ? 1 : 0));
  def('GESTEP', 'MAYOR.O.IGUAL', G, 'número; [paso]', 'Devuelve 1 si el número es mayor o igual que el paso.', 'n n?', (a, s = 0) => (a >= s ? 1 : 0));

  // ---------------------------------------------------------------- CONVERT
  // unidad -> [magnitud, factor respecto a la unidad base, admite prefijos métricos]
  const U = {};
  const add = (kind, list) => { for (const k in list) U[k] = [kind, list[k][0], !!list[k][1]]; };
  add('masa', { g: [1, 1], sg: [14593.9029372064], lbm: [453.59237], u: [1.66053906660e-24, 1], ozm: [28.349523125], grain: [0.06479891], stone: [6350.29318], ton: [907184.74], uk_ton: [1016046.9088] });
  add('longitud', { m: [1, 1], mi: [1609.344], Nmi: [1852], in: [0.0254], ft: [0.3048], yd: [0.9144], ang: [1e-10, 1], ell: [1.143], ly: [9.4607304725808e15, 1], parsec: [3.08567758128155e16, 1], pc: [3.08567758128155e16, 1], Pica: [0.0254 / 72], pica: [0.0254 / 6], survey_mi: [1609.3472186944] });
  add('tiempo', { yr: [31557600], day: [86400], d: [86400], hr: [3600], mn: [60], min: [60], sec: [1, 1], s: [1, 1] });
  add('presion', { Pa: [1, 1], p: [1, 1], atm: [101325, 1], at: [101325, 1], mmHg: [133.322, 1], psi: [6894.75729316836], Torr: [133.322368421053] });
  add('fuerza', { N: [1, 1], dyn: [1e-5, 1], dy: [1e-5, 1], lbf: [4.4482216152605], pond: [9.80665e-3, 1] });
  add('energia', { J: [1, 1], e: [1e-7, 1], c: [4.184, 1], cal: [4.1868, 1], eV: [1.602176634e-19, 1], ev: [1.602176634e-19, 1], HPh: [2684519.53769617], hh: [2684519.53769617], Wh: [3600, 1], wh: [3600, 1], flb: [1.3558179483314], BTU: [1055.05585262], btu: [1055.05585262] });
  add('potencia', { HP: [745.69987158227], h: [745.69987158227], PS: [735.49875], W: [1, 1], w: [1, 1] });
  add('volumen', { tsp: [4.92892159375e-3], tspm: [5e-3], tbs: [1.478676478125e-2], oz: [2.95735295625e-2], cup: [0.2365882365], pt: [0.473176473], us_pt: [0.473176473], uk_pt: [0.56826125], qt: [0.946352946], uk_qt: [1.1365225], gal: [3.785411784], uk_gal: [4.54609], l: [1, 1], L: [1, 1], lt: [1, 1], m3: [1000], 'm^3': [1000], ft3: [28.316846592], 'ft^3': [28.316846592], in3: [0.016387064], 'in^3': [0.016387064], yd3: [764.554857984], barrel: [158.987294928] });
  add('area', { m2: [1], 'm^2': [1], ha: [10000], ar: [100, 1], ft2: [0.09290304], 'ft^2': [0.09290304], in2: [0.00064516], 'in^2': [0.00064516], yd2: [0.83612736], 'yd^2': [0.83612736], mi2: [2589988.110336], 'mi^2': [2589988.110336], uk_acre: [4046.8564224], us_acre: [4046.87260987425], Morgen: [2500] });
  add('informacion', { bit: [1, 1], byte: [8, 1] });
  add('velocidad', { 'm/s': [1, 1], 'm/sec': [1, 1], 'm/h': [1 / 3600, 1], 'm/hr': [1 / 3600, 1], mph: [0.44704], kn: [1852 / 3600], admkn: [0.514773333333333] });
  const PREFIX = { Y: 1e24, Z: 1e21, E: 1e18, P: 1e15, T: 1e12, G: 1e9, M: 1e6, k: 1e3, h: 1e2, da: 10, e: 10, d: 1e-1, c: 1e-2, m: 1e-3, u: 1e-6, n: 1e-9, p: 1e-12, f: 1e-15, a: 1e-18, z: 1e-21, y: 1e-24 };
  const BIN = { ki: 1024, Mi: Math.pow(2, 20), Gi: Math.pow(2, 30), Ti: Math.pow(2, 40) };
  function unit(name) {
    if (U[name]) return { kind: U[name][0], f: U[name][1] };
    for (const p of Object.keys(BIN).concat(Object.keys(PREFIX).sort((a, b) => b.length - a.length))) {
      if (name.startsWith(p)) {
        const base = U[name.slice(p.length)];
        if (base && base[2] && (PREFIX[p] || base[0] === 'informacion')) return { kind: base[0], f: base[1] * (BIN[p] || PREFIX[p]) };
      }
    }
    return null;
  }
  const TEMP = { C: 1, cel: 1, F: 1, fah: 1, K: 1, kel: 1, Rank: 1, Reau: 1 };
  function toKelvin(v, u) { return u === 'C' || u === 'cel' ? v + 273.15 : u === 'F' || u === 'fah' ? ((v - 32) * 5) / 9 + 273.15 : u === 'Rank' ? (v * 5) / 9 : u === 'Reau' ? v * 1.25 + 273.15 : v; }
  function fromKelvin(k, u) { return u === 'C' || u === 'cel' ? k - 273.15 : u === 'F' || u === 'fah' ? ((k - 273.15) * 9) / 5 + 32 : u === 'Rank' ? (k * 9) / 5 : u === 'Reau' ? (k - 273.15) / 1.25 : k; }
  def('CONVERT', 'CONVERTIR', G, 'número; de_unidad; a_unidad', 'Convierte un número de una unidad a otra, por ejemplo de "km" a "mi" o de "C" a "F".', 'n s s', (x, from, to) => {
    if (TEMP[from] && TEMP[to]) return parseFloat(fromKelvin(toKelvin(x, from), to).toPrecision(14));
    const a = unit(from), b = unit(to);
    if (!a || !b || a.kind !== b.kind) return E.NA;
    return parseFloat(((x * a.f) / b.f).toPrecision(15));
  });

  // ---------------------------------------------------------------- funciones de base de datos
  // Devuelve los valores del campo en las filas de la base de datos que cumplen los criterios.
  function dbValues(db, field, crit) {
    const heads = db[0].map((h) => String(toStr(h)).toLowerCase());
    let col;
    if (typeof field === 'number') col = Math.floor(field) - 1;
    else if (field == null) col = -2;
    else col = heads.indexOf(String(field).toLowerCase());
    if (col === -1 || col >= heads.length || (col < 0 && col !== -2)) return E.VALUE;
    const cHeads = crit[0].map((h) => heads.indexOf(String(toStr(h)).toLowerCase()));
    const rules = crit.slice(1).map((row) => row.map((v, j) => (v == null || v === '' ? null : { col: cHeads[j], test: criteria(v) })).filter(Boolean));
    const out = [];
    for (let i = 1; i < db.length; i++) {
      const row = db[i];
      const okRow = !rules.length || rules.some((conds) => conds.every((c) => c.col >= 0 && c.test(row[c.col])));
      if (okRow) out.push(col === -2 ? row[0] : row[col]);
    }
    return out;
  }
  function dbFn(name, es, desc, fn) {
    def(name, es, Z, 'base_de_datos; nombre_de_campo; criterios', desc, 'a v a', (db, field, crit) => {
      const v = dbValues(db, field, crit);
      if (v instanceof FErr) return v;
      return fn(v);
    });
  }
  const numsOf = (v) => v.filter((x) => typeof x === 'number');
  const firstErr = (v) => v.find((x) => x instanceof FErr);
  dbFn('DSUM', 'BDSUMA', 'Suma los valores de un campo en los registros que cumplen los criterios.', (v) => firstErr(v) || X.sum(numsOf(v)));
  dbFn('DAVERAGE', 'BDPROMEDIO', 'Promedio de un campo en los registros que cumplen los criterios.', (v) => { const n = numsOf(v); return firstErr(v) || (n.length ? X.sum(n) / n.length : E.DIV0); });
  dbFn('DCOUNT', 'BDCONTAR', 'Cuenta los números de un campo en los registros que cumplen los criterios.', (v) => numsOf(v).length);
  dbFn('DCOUNTA', 'BDCONTARA', 'Cuenta las celdas no vacías de un campo en los registros que cumplen los criterios.', (v) => v.filter((x) => x != null && x !== '').length);
  dbFn('DMAX', 'BDMAX', 'Valor máximo de un campo en los registros que cumplen los criterios.', (v) => { const n = numsOf(v); return firstErr(v) || (n.length ? Math.max.apply(null, n) : 0); });
  dbFn('DMIN', 'BDMIN', 'Valor mínimo de un campo en los registros que cumplen los criterios.', (v) => { const n = numsOf(v); return firstErr(v) || (n.length ? Math.min.apply(null, n) : 0); });
  dbFn('DPRODUCT', 'BDPRODUCTO', 'Producto de un campo en los registros que cumplen los criterios.', (v) => firstErr(v) || numsOf(v).reduce((p, x) => p * x, 1));
  dbFn('DGET', 'BDEXTRAER', 'Extrae el único valor de un campo que cumple los criterios.', (v) => (v.length === 0 ? E.VALUE : v.length > 1 ? E.NUM : v[0]));
})(typeof window !== 'undefined' ? window : globalThis);
