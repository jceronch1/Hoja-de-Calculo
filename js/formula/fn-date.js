/* Funciones de fecha y hora. Las fechas son números de serie (1 = 1 de enero de 1900). */
(function (root) {
  'use strict';
  const HC = root.HC, E = HC.E, FErr = HC.FErr, X = HC.fx;
  const { def, aliasEs, nums } = X;
  const D = HC.date;
  const Dt = 'D';
  const MAXD = 2958465;
  const ok = (s) => s >= 0 && s <= MAXD + 1;
  const parts = (s) => D.toParts(Math.round(s * 86400) / 86400);
  const dow = (s) => ((Math.floor(s) % 7) + 13) % 7; // 0 = domingo

  def('DATE', 'FECHA', Dt, 'año; mes; día', 'Crea una fecha a partir del año, el mes y el día.', 'n n n', (y, m, d) => {
    y = Math.floor(y); m = Math.floor(m); d = Math.floor(d);
    if (y < 0 || y > 9999) return E.NUM;
    if (y < 1900) y += 1900;
    if (y === 1900 && m === 2 && d === 29) return 60;
    const s = D.fromYMD(y, m, d);
    return s < 0 || s > MAXD ? E.NUM : s;
  });
  def('DATEVALUE', 'FECHANUMERO', Dt, 'texto_de_fecha', 'Convierte una fecha escrita como texto en su número de serie.', 's', (t) => {
    const r = HC.parseInput(t);
    return typeof r.v === 'number' && r.nf && HC.fmt.isDate(r.nf) ? Math.floor(r.v) : E.VALUE;
  });
  aliasEs('DATEVALUE', 'VALFECHA');
  def('TIMEVALUE', 'HORANUMERO', Dt, 'texto_de_hora', 'Convierte una hora escrita como texto en una fracción de día.', 's', (t) => {
    const r = HC.parseInput(t);
    return typeof r.v === 'number' && r.nf && HC.fmt.isDate(r.nf) ? r.v - Math.floor(r.v) : E.VALUE;
  });
  aliasEs('TIMEVALUE', 'VALHORA');
  def('TIME', 'NSHORA', Dt, 'hora; minuto; segundo', 'Crea una hora a partir de horas, minutos y segundos.', 'n n n', (h, m, s) => {
    const t = Math.floor(h) * 3600 + Math.floor(m) * 60 + Math.floor(s);
    return t < 0 ? E.NUM : (t % 86400) / 86400;
  });
  aliasEs('TIME', 'TIEMPO');
  def('NOW', 'AHORA', Dt, '', 'Fecha y hora actuales. Se actualiza en cada recálculo.', '', () => D.now());
  def('TODAY', 'HOY', Dt, '', 'Fecha de hoy. Se actualiza en cada recálculo.', '', () => D.today());
  def('YEAR', 'AÑO', Dt, 'fecha', 'Año de una fecha.', 'n', (s) => (ok(s) ? parts(s).y : E.NUM));
  aliasEs('YEAR', 'ANO', 'ANIO');
  def('MONTH', 'MES', Dt, 'fecha', 'Mes de una fecha (1 a 12).', 'n', (s) => (ok(s) ? parts(s).m : E.NUM));
  def('DAY', 'DIA', Dt, 'fecha', 'Día del mes de una fecha (1 a 31).', 'n', (s) => (ok(s) ? parts(s).d : E.NUM));
  def('HOUR', 'HORA', Dt, 'hora', 'Hora de un valor de tiempo (0 a 23).', 'n', (s) => (s < 0 ? E.NUM : parts(s).hh));
  def('MINUTE', 'MINUTO', Dt, 'hora', 'Minutos de un valor de tiempo (0 a 59).', 'n', (s) => (s < 0 ? E.NUM : parts(s).mi));
  def('SECOND', 'SEGUNDO', Dt, 'hora', 'Segundos de un valor de tiempo (0 a 59).', 'n', (s) => (s < 0 ? E.NUM : parts(s).ss));
  // día de inicio de semana según el código de tipo (0 = domingo … 6 = sábado)
  const weekStart = (type) => ({ 1: 0, 2: 1, 11: 1, 12: 2, 13: 3, 14: 4, 15: 5, 16: 6, 17: 0 })[type];
  def('WEEKDAY', 'DIASEM', Dt, 'fecha; [tipo]', 'Día de la semana como número. Tipo 1: domingo = 1; tipo 2: lunes = 1.', 'n n?', (s, type = 1) => {
    if (!ok(s)) return E.NUM;
    type = Math.floor(type);
    if (type === 3) return (dow(s) + 6) % 7;
    const st = weekStart(type);
    return st === undefined ? E.NUM : ((dow(s) - st + 7) % 7) + 1;
  });
  function isoWeek(s) {
    const d = Math.floor(s), th = d - ((dow(d) + 6) % 7) + 3; // jueves de esa semana
    const jan1 = D.fromYMD(D.toParts(th).y, 1, 1);
    return Math.floor((th - jan1) / 7) + 1;
  }
  def('WEEKNUM', 'NUM.DE.SEMANA', Dt, 'fecha; [tipo]', 'Número de la semana del año.', 'n n?', (s, type = 1) => {
    if (!ok(s)) return E.NUM;
    type = Math.floor(type);
    if (type === 21) return isoWeek(s);
    const st = weekStart(type); if (st === undefined) return E.NUM;
    const d = Math.floor(s), jan1 = D.fromYMD(D.toParts(d).y, 1, 1);
    return Math.floor((d - jan1 + ((dow(jan1) - st + 7) % 7)) / 7) + 1;
  });
  def('ISOWEEKNUM', 'ISO.NUM.DE.SEMANA', Dt, 'fecha', 'Número de semana ISO del año.', 'n', (s) => (ok(s) ? isoWeek(s) : E.NUM));
  function addMonths(s, n, eom) {
    const p = D.toParts(Math.floor(s));
    const total = p.y * 12 + (p.m - 1) + Math.trunc(n);
    const y = Math.floor(total / 12), m = (total % 12) + 1;
    const last = D.daysInMonth(y, m);
    return D.fromYMD(y, m, eom ? last : Math.min(p.d, last));
  }
  def('EDATE', 'FECHA.MES', Dt, 'fecha_inicial; meses', 'Fecha situada un número de meses antes o después de otra.', 'n n', (s, n) => { if (!ok(s)) return E.NUM; const r = addMonths(s, n, false); return r < 0 || r > MAXD ? E.NUM : r; });
  def('EOMONTH', 'FIN.MES', Dt, 'fecha_inicial; meses', 'Último día del mes situado un número de meses antes o después.', 'n n', (s, n) => { if (!ok(s)) return E.NUM; const r = addMonths(s, n, true); return r < 0 || r > MAXD ? E.NUM : r; });
  def('DAYS', 'DIAS', Dt, 'fecha_final; fecha_inicial', 'Días entre dos fechas.', 'n n', (e, s) => Math.floor(e) - Math.floor(s));
  function days360(s, e, eu) {
    const a = D.toParts(Math.floor(s)), b = D.toParts(Math.floor(e));
    let d1 = a.d, d2 = b.d, m2 = b.m, y2 = b.y;
    if (eu) { if (d1 === 31) d1 = 30; if (d2 === 31) d2 = 30; } else {
      if (d1 === 31) d1 = 30;
      if (d2 === 31) { if (d1 >= 30) d2 = 30; else { d2 = 1; m2++; if (m2 > 12) { m2 = 1; y2++; } } }
    }
    return (y2 - a.y) * 360 + (m2 - a.m) * 30 + (d2 - d1);
  }
  def('DAYS360', 'DIAS360', Dt, 'fecha_inicial; fecha_final; [método]', 'Días entre dos fechas con un año de 360 días.', 'n n b?', (s, e, eu = false) => days360(s, e, eu));
  def('DATEDIF', 'SIFECHA', Dt, 'fecha_inicial; fecha_final; unidad', 'Diferencia entre dos fechas en "Y" años, "M" meses o "D" días (también "MD", "YM", "YD").', 'n n s', (s, e, u) => {
    s = Math.floor(s); e = Math.floor(e);
    if (s > e || s < 0) return E.NUM;
    const a = D.toParts(s), b = D.toParts(e);
    const months = (b.y - a.y) * 12 + (b.m - a.m) - (b.d < a.d ? 1 : 0);
    switch (u.toUpperCase()) {
      case 'Y': return Math.floor(months / 12);
      case 'M': return months;
      case 'D': return e - s;
      case 'YM': return months % 12;
      case 'MD': { if (b.d >= a.d) return b.d - a.d; let pm = b.m - 1, py = b.y; if (pm < 1) { pm = 12; py--; } return D.daysInMonth(py, pm) - a.d + b.d; }
      case 'YD': { let anchor = D.fromYMD(b.y, a.m, a.d); if (anchor > e) anchor = D.fromYMD(b.y - 1, a.m, a.d); return e - anchor; }
    }
    return E.NUM;
  });
  const leap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  def('YEARFRAC', 'FRAC.AÑO', Dt, 'fecha_inicial; fecha_final; [base]', 'Fracción de año entre dos fechas.', 'n n n?', (s, e, basis = 0) => {
    s = Math.floor(s); e = Math.floor(e);
    if (s > e) [s, e] = [e, s];
    basis = Math.floor(basis);
    switch (basis) {
      case 0: return days360(s, e, false) / 360;
      case 2: return (e - s) / 360;
      case 3: return (e - s) / 365;
      case 4: return days360(s, e, true) / 360;
      case 1: {
        const a = D.toParts(s), b = D.toParts(e);
        if (a.y === b.y) return (e - s) / (leap(a.y) ? 366 : 365);
        let days = 0; for (let y = a.y; y <= b.y; y++) days += leap(y) ? 366 : 365;
        return (e - s) / (days / (b.y - a.y + 1));
      }
    }
    return E.NUM;
  });
  aliasEs('YEARFRAC', 'FRAC.ANO');

  // ---------------------------------------------------------------- días laborables
  function weekendMask(w) {
    const m = [false, false, false, false, false, false, false]; // índice: 0 = domingo
    if (w === undefined || w === null) { m[0] = m[6] = true; return m; }
    if (typeof w === 'string' && /^[01]{7}$/.test(w)) { for (let i = 0; i < 7; i++) if (w[i] === '1') m[(i + 1) % 7] = true; return w === '1111111' ? null : m; }
    const n = typeof w === 'number' ? Math.floor(w) : NaN;
    if (n >= 1 && n <= 7) { m[(n + 5) % 7] = true; m[(n + 6) % 7] = true; return m; }
    if (n >= 11 && n <= 17) { m[(n - 11) % 7] = true; return m; }
    return null;
  }
  function holidaySet(h) {
    if (h === undefined) return new Set();
    const v = nums([h]); if (v instanceof FErr) return v;
    return new Set(v.map(Math.floor));
  }
  function netDays(s, e, mask, hol) {
    s = Math.floor(s); e = Math.floor(e);
    const sign = s > e ? -1 : 1; if (sign < 0) [s, e] = [e, s];
    let n = 0;
    for (let d = s; d <= e; d++) if (!mask[dow(d)] && !hol.has(d)) n++;
    return sign * n;
  }
  function workDay(s, n, mask, hol) {
    let d = Math.floor(s); n = Math.trunc(n);
    const step = n < 0 ? -1 : 1; let left = Math.abs(n), guard = 0;
    while (left > 0 && guard++ < 4000000) { d += step; if (!mask[dow(d)] && !hol.has(d)) left--; }
    return d < 0 || d > MAXD ? E.NUM : d;
  }
  def('NETWORKDAYS', 'DIAS.LAB', Dt, 'fecha_inicial; fecha_final; [festivos]', 'Días laborables (lunes a viernes) entre dos fechas.', 'n n r?', (s, e, h) => { const hol = holidaySet(h); return hol instanceof FErr ? hol : netDays(s, e, weekendMask(), hol); });
  def('NETWORKDAYS.INTL', 'DIAS.LAB.INTL', Dt, 'fecha_inicial; fecha_final; [fin_de_semana]; [festivos]', 'Días laborables entre dos fechas con el fin de semana que se indique.', 'n n v? r?', (s, e, w, h) => {
    const mask = weekendMask(w), hol = holidaySet(h);
    if (!mask) return E.VALUE; return hol instanceof FErr ? hol : netDays(s, e, mask, hol);
  });
  def('WORKDAY', 'DIA.LAB', Dt, 'fecha_inicial; días; [festivos]', 'Fecha situada un número de días laborables antes o después de otra.', 'n n r?', (s, n, h) => { const hol = holidaySet(h); return hol instanceof FErr ? hol : workDay(s, n, weekendMask(), hol); });
  def('WORKDAY.INTL', 'DIA.LAB.INTL', Dt, 'fecha_inicial; días; [fin_de_semana]; [festivos]', 'Fecha tras un número de días laborables, con el fin de semana que se indique.', 'n n v? r?', (s, n, w, h) => {
    const mask = weekendMask(w), hol = holidaySet(h);
    if (!mask) return E.VALUE; return hol instanceof FErr ? hol : workDay(s, n, mask, hol);
  });
})(typeof window !== 'undefined' ? window : globalThis);
