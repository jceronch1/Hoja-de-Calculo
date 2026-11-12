/* Formatos de número (códigos al estilo de Excel), fechas en número de serie e interpretación de lo que se escribe. */
(function (root) {
  'use strict';
  const HC = root.HC;
  const FErr = HC.FErr;
  const DAY_MS = 86400000;
  const BASE = Date.UTC(1899, 11, 30);

  // ---------------------------------------------------------------- fechas (sistema 1900, con el 29-feb-1900 ficticio)
  const D = HC.date = {};
  D.fromYMD = function (y, m, d) {
    const dt = new Date(Date.UTC(2000, 0, 1));
    dt.setUTCFullYear(y, m - 1, d);
    let s = Math.round((dt.getTime() - BASE) / DAY_MS);
    if (s < 61) s -= 1;
    return s;
  };
  D.toParts = function (serial) {
    let days = Math.floor(serial);
    let ms = Math.round((serial - days) * DAY_MS);
    if (ms >= DAY_MS) { days += 1; ms = 0; }
    let y, m, d;
    if (days === 60) { y = 1900; m = 2; d = 29; } else {
      const dt = new Date(BASE + (days < 60 ? days + 1 : days) * DAY_MS);
      y = dt.getUTCFullYear(); m = dt.getUTCMonth() + 1; d = dt.getUTCDate();
    }
    const secs = Math.floor(ms / 1000);
    return { y, m, d, hh: Math.floor(secs / 3600), mi: Math.floor(secs / 60) % 60, ss: secs % 60, ms: ms % 1000, dow: ((days % 7) + 13) % 7, days };
  };
  D.now = function () {
    const n = new Date();
    return D.fromYMD(n.getFullYear(), n.getMonth() + 1, n.getDate()) + (n.getHours() * 3600 + n.getMinutes() * 60 + n.getSeconds()) / 86400;
  };
  D.today = () => Math.floor(D.now());
  D.daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  D.valid = (serial) => typeof serial === 'number' && serial >= 0 && serial < 2958466;
  const MON3 = { es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'], en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] };
  const DAY3 = { es: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'], en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] };
  D.mon3 = () => MON3[HC.locale.lang] || MON3.es;
  D.day3 = () => DAY3[HC.locale.lang] || DAY3.es;

  // ---------------------------------------------------------------- compilación de códigos de formato
  const COLORS = {
    black: '#000000', negro: '#000000', white: '#ffffff', blanco: '#ffffff', red: '#d0021b', rojo: '#d0021b',
    green: '#0a7d28', verde: '#0a7d28', blue: '#1257c9', azul: '#1257c9', yellow: '#b58a00', amarillo: '#b58a00',
    magenta: '#c2189b', fucsia: '#c2189b', cyan: '#0a8f9c', aguamarina: '#0a8f9c',
  };
  const fmtCache = new Map();

  function splitSections(code) {
    const out = []; let cur = '', q = false, br = false;
    for (let i = 0; i < code.length; i++) {
      const ch = code[i];
      if (q) { cur += ch; if (ch === '"') q = false; continue; }
      if (br) { cur += ch; if (ch === ']') br = false; continue; }
      if (ch === '"') { q = true; cur += ch; continue; }
      if (ch === '[') { br = true; cur += ch; continue; }
      if (ch === '\\' || ch === '_' || ch === '*') { cur += ch + (code[i + 1] || ''); i++; continue; }
      if (ch === ';') { out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur);
    return out;
  }

  function compileSection(src) {
    const sec = { toks: [], kind: 'number', color: null, cond: null, src };
    const toks = sec.toks;
    const lit = (v) => { const l = toks[toks.length - 1]; if (l && l.t === 'lit') l.v += v; else toks.push({ t: 'lit', v }); };
    let i = 0, hasDate = false, hasDigit = false, hasText = false, hasAmPm = false;
    if (/^\s*general\s*$/i.test(src.replace(/\[[^\]]*\]/g, ''))) sec.kind = 'general';
    while (i < src.length) {
      const ch = src[i];
      if (ch === '"') { const j = src.indexOf('"', i + 1); const e = j < 0 ? src.length : j; lit(src.slice(i + 1, e)); i = e + 1; continue; }
      if (ch === '\\') { lit(src[i + 1] || ''); i += 2; continue; }
      if (ch === '_') { lit(' '); i += 2; continue; }
      if (ch === '*') { i += 2; continue; }
      if (ch === '[') {
        const j = src.indexOf(']', i); const e = j < 0 ? src.length : j;
        const inner = src.slice(i + 1, e); const low = inner.toLowerCase();
        i = e + 1;
        if (COLORS[low]) { sec.color = COLORS[low]; continue; }
        if (/^colou?r\s*\d+$/.test(low)) continue;
        let m = /^(<=|>=|<>|<|>|=)\s*(-?[\d.]+)$/.exec(inner);
        if (m) { sec.cond = { op: m[1], v: parseFloat(m[2]) }; continue; }
        if (/^(h+|m+|s+)$/.test(low)) { toks.push({ t: 'el', u: low[0], n: low.length }); hasDate = true; continue; }
        m = /^\$([^-\]]*)(-[0-9a-f]+)?$/i.exec(inner);
        if (m) { if (m[1]) lit(m[1]); continue; }
        continue;
      }
      if (sec.kind === 'general') { i++; continue; }
      if (ch === '@') { toks.push({ t: 'text' }); hasText = true; i++; continue; }
      if (ch === '0' || ch === '#' || ch === '?') { toks.push({ t: 'dig', v: ch }); hasDigit = true; i++; continue; }
      if (ch === '.') { toks.push({ t: 'dec' }); i++; continue; }
      if (ch === ',') { toks.push({ t: 'grp' }); i++; continue; }
      if (ch === '%') { toks.push({ t: 'pct' }); i++; continue; }
      if (ch === '/') { toks.push({ t: 'slash' }); i++; continue; }
      if ((ch === 'E' || ch === 'e') && (src[i + 1] === '+' || src[i + 1] === '-') && hasDigit) { toks.push({ t: 'exp', plus: src[i + 1] === '+' }); i += 2; continue; }
      const rest = src.slice(i);
      let m = /^(am\/pm|a\/p)/i.exec(rest);
      if (m) { toks.push({ t: 'ampm', v: m[1] }); hasDate = hasAmPm = true; i += m[1].length; continue; }
      m = /^(d+|m+|y+|h+|s+)/i.exec(rest);
      if (m && !hasDigit) {
        toks.push({ t: m[1][0].toLowerCase(), n: m[1].length }); hasDate = true; i += m[1].length; continue;
      }
      m = /^a{2,4}/i.exec(rest); // "aaaa" (año en formatos en español)
      if (m && !hasDigit) { toks.push({ t: 'y', n: m[0].length }); hasDate = true; i += m[0].length; continue; }
      lit(ch); i++;
    }
    if (sec.kind !== 'general') {
      const LITS = { dec: '.', grp: ',', slash: '/', pct: '%' };
      const toLit = (t) => { if (LITS[t.t]) { t.v = LITS[t.t]; t.t = 'lit'; } };
      if (hasDate) {
        sec.kind = 'date'; sec.h12 = hasAmPm;
        // segundos fraccionarios: s.000
        for (let k = 0; k < toks.length; k++) {
          if (toks[k].t === 'dec' && toks[k + 1] && toks[k + 1].t === 'dig') {
            let n = 0; while (toks[k + 1] && toks[k + 1].t === 'dig') { toks.splice(k + 1, 1); n++; }
            toks[k] = { t: 'fs', n };
          }
        }
        toks.forEach(toLit);
        // "m" son minutos si va tras horas o antes de segundos
        const dt = toks.filter((t) => t.t !== 'lit');
        dt.forEach((t, k) => {
          if (t.t === 'm' && t.n <= 2) {
            const prev = dt[k - 1], next = dt[k + 1];
            if ((prev && (prev.t === 'h' || (prev.t === 'el' && prev.u === 'h'))) || (next && next.t === 's')) t.t = 'mi';
          }
        });
      } else if (hasText && !hasDigit) { sec.kind = 'text'; toks.forEach(toLit); }
      else if (!hasDigit && !hasText) { sec.kind = 'literal'; toks.forEach(toLit); }
      else prepareNumber(sec);
    }
    return sec;
  }

  function prepareNumber(sec) {
    const toks = sec.toks;
    let decAt = -1, expAt = -1, slashAt = -1;
    toks.forEach((t, k) => {
      if (t.t === 'dec' && decAt < 0 && expAt < 0) decAt = k;
      if (t.t === 'exp' && expAt < 0) expAt = k;
      if (t.t === 'slash' && slashAt < 0) slashAt = k;
    });
    sec.pct = toks.filter((t) => t.t === 'pct').length;
    const isFrac = slashAt >= 0 && decAt < 0 && expAt < 0 && toks.slice(slashAt + 1).some((t) => t.t === 'dig' || (t.t === 'lit' && /\d/.test(t.v)));
    if (isFrac) {
      sec.frac = true;
      const digIdx = toks.map((t, k) => (t.t === 'dig' ? k : -1)).filter((k) => k >= 0);
      const numIdx = digIdx.filter((k) => k < slashAt), denIdx = digIdx.filter((k) => k > slashAt);
      // dígitos del entero: los que están antes de un espacio literal previo al numerador
      let split = -1;
      for (let k = slashAt - 1; k >= 0; k--) if (toks[k].t === 'lit' && /\s/.test(toks[k].v)) { split = k; break; }
      sec.fInt = numIdx.filter((k) => k < split); sec.fNum = numIdx.filter((k) => k > split); sec.fDen = denIdx;
      const fixed = toks.slice(slashAt + 1).find((t) => t.t === 'lit' && /^\d+/.test(t.v));
      sec.fFixed = !denIdx.length && fixed ? parseInt(fixed.v, 10) : 0;
      sec.fSplit = split;
      return;
    }
    toks.forEach((t) => { if (t.t === 'slash') { t.t = 'lit'; t.v = '/'; } });
    const intEnd = decAt >= 0 ? decAt : expAt >= 0 ? expAt : toks.length;
    let lastIntDig = -1, firstIntDig = -1;
    for (let k = 0; k < intEnd; k++) if (toks[k].t === 'dig') { if (firstIntDig < 0) firstIntDig = k; lastIntDig = k; }
    sec.scale = 0; sec.group = false;
    let lastDig = -1;
    toks.forEach((t, k) => { if (t.t === 'dig' && (expAt < 0 || k < expAt)) lastDig = k; });
    toks.forEach((t, k) => {
      if (t.t !== 'grp') return;
      if (k > firstIntDig && k < lastIntDig && firstIntDig >= 0) sec.group = true;
      // comas tras el último dígito (o justo antes del punto decimal): cada una divide entre mil
      else if (lastDig >= 0 && (k > lastDig || (k > lastIntDig && k < intEnd))) sec.scale++;
    });
    sec.intIdx = []; sec.decIdx = []; sec.expIdx = [];
    toks.forEach((t, k) => {
      if (t.t !== 'dig') return;
      if (expAt >= 0 && k > expAt) sec.expIdx.push(k);
      else if (decAt >= 0 && k > decAt) sec.decIdx.push(k);
      else sec.intIdx.push(k);
    });
    sec.decAt = decAt; sec.expAt = expAt;
  }

  function compile(code) {
    let f = fmtCache.get(code);
    if (f) return f;
    const parts = splitSections(code);
    f = { sections: parts.map(compileSection), code };
    f.isDate = f.sections[0].kind === 'date';
    f.isText = f.sections.length === 1 && f.sections[0].kind === 'text';
    f.isGeneral = f.sections.length === 1 && f.sections[0].kind === 'general';
    fmtCache.set(code, f);
    return f;
  }
  HC.fmt = { compile, clearCache: () => fmtCache.clear() };
  const fmt = HC.fmt;

  // ---------------------------------------------------------------- formato General
  function stripZeros(s) { return s.indexOf('.') < 0 ? s : s.replace(/0+$/, '').replace(/\.$/, ''); }
  function sci(n, digits) {
    let s = n.toExponential(digits);
    const m = /^(-?[\d.]+)e([+-])(\d+)$/.exec(s);
    return stripZeros(m[1]) + 'E' + m[2] + (m[3].length < 2 ? '0' + m[3] : m[3]);
  }
  // Texto "General" con como mucho maxLen caracteres significativos (11 por defecto, como Excel).
  fmt.general = function (n, maxLen) {
    if (!isFinite(n)) return '';
    if (n === 0) return '0';
    maxLen = maxLen || 11;
    const a = Math.abs(n);
    let s;
    if (a >= 1e11 || a < 1e-9) s = sci(n, Math.max(0, Math.min(5, maxLen - 6)));
    else {
      const intDigits = a < 1 ? 1 : Math.floor(Math.log10(a)) + 1;
      const dec = Math.max(0, Math.min(9, maxLen - 1 - intDigits));
      s = stripZeros(n.toFixed(dec));
      if (s === '0' || s === '-0') s = sci(n, Math.max(0, Math.min(5, maxLen - 6)));
    }
    return HC.locale.dec === '.' ? s : s.replace('.', HC.locale.dec);
  };
  // Número -> texto con toda la precisión útil (15 cifras), para concatenar o editar.
  fmt.numToText = function (n) {
    if (!isFinite(n)) return '';
    let s;
    if (Number.isInteger(n) && Math.abs(n) < 1e15) s = String(n);
    else {
      s = String(parseFloat(n.toPrecision(15)));
      const m = /^(-?[\d.]+)e([+-])(\d+)$/.exec(s);
      if (m) s = m[1] + 'E' + m[2] + (m[3].length < 2 ? '0' + m[3] : m[3]);
    }
    return HC.locale.dec === '.' ? s : s.replace('.', HC.locale.dec);
  };

  // ---------------------------------------------------------------- aplicación de un formato
  function roundTo(a, dec) {
    if (dec > 15) dec = 15;
    const s = a.toFixed(dec);
    // toFixed redondea en binario; corrige casos como 1.005 -> 1.01
    const alt = (Math.round((a + Number.EPSILON * Math.max(1, a)) * Math.pow(10, dec)) / Math.pow(10, dec)).toFixed(dec);
    return a < 1e15 ? alt : s;
  }
  function groupDigits(s) {
    let out = '';
    for (let k = 0; k < s.length; k++) {
      out += s[k];
      const fromRight = s.length - 1 - k;
      if (fromRight > 0 && fromRight % 3 === 0) out += HC.locale.grp;
    }
    return out;
  }

  function fillInt(sec, intStr) {
    // reparte los dígitos entre los marcadores, alineados a la derecha
    const res = {}; const idx = sec.intIdx; const n = idx.length; const L = intStr.length;
    for (let k = 0; k < n; k++) {
      const tok = sec.toks[idx[k]]; const pos = L - n + k; let out = '';
      const put = (ch, fromRight) => { out += ch; if (sec.group && fromRight > 0 && fromRight % 3 === 0) out += HC.locale.grp; };
      if (k === 0 && pos > 0) for (let j = 0; j <= pos; j++) put(intStr[j], L - 1 - j);
      else if (pos >= 0) put(intStr[pos], L - 1 - pos);
      else if (tok.v === '0') put('0', n - 1 - k);
      else if (tok.v === '?') out = ' ';
      res[idx[k]] = out;
    }
    return res;
  }

  function formatNumber(sec, value, autoMinus) {
    let a = Math.abs(value);
    const toks = sec.toks;
    if (sec.frac) return (autoMinus && value < 0 ? '-' : '') + formatFraction(sec, a);
    for (let k = 0; k < sec.pct; k++) a *= 100;
    for (let k = 0; k < sec.scale; k++) a /= 1000;
    const decN = sec.decIdx.length;
    let exp = 0, out = '';
    if (sec.expAt >= 0) {
      const ip = Math.max(1, sec.intIdx.length);
      if (a !== 0) {
        exp = Math.floor(Math.log10(a));
        if (ip > 1) exp = Math.floor(exp / ip) * ip;
        let mant = a / Math.pow(10, exp);
        if (parseFloat(roundTo(mant, decN)) >= Math.pow(10, ip > 1 ? ip : 1)) { exp += ip > 1 ? ip : 1; mant = a / Math.pow(10, exp); }
        a = mant;
      }
    }
    const fixed = roundTo(a, decN);
    const dot = fixed.indexOf('.');
    let intStr = dot < 0 ? fixed : fixed.slice(0, dot);
    const decStr = dot < 0 ? '' : fixed.slice(dot + 1);
    if (intStr === '0') intStr = '';
    const ints = sec.intIdx.length ? fillInt(sec, intStr) : null;
    // decimales: se muestran los obligatorios (0) y los significativos de los opcionales (#)
    let lastDec = -1;
    for (let k = decN - 1; k >= 0; k--) {
      const tk = toks[sec.decIdx[k]];
      if (tk.v === '0' || tk.v === '?' || decStr[k] !== '0') { lastDec = k; break; }
    }
    const expStr = String(Math.abs(exp));
    let nonZero = false;
    for (let k = 0; k < toks.length; k++) {
      const t = toks[k];
      switch (t.t) {
        case 'lit': out += t.v; break;
        case 'pct': out += '%'; break;
        case 'text': break;
        case 'grp': break;
        case 'dec': if (lastDec >= 0 || (toks[k + 1] && toks[k + 1].t !== 'dig')) out += HC.locale.dec; break;
        case 'exp': out += 'E' + (exp < 0 ? '-' : t.plus ? '+' : ''); break;
        case 'dig': {
          if (ints && k in ints) { out += ints[k]; break; }
          let di = sec.decIdx.indexOf(k);
          if (di >= 0) { if (di <= lastDec) out += decStr[di]; else if (t.v === '?') out += ' '; break; }
          di = sec.expIdx.indexOf(k);
          if (di >= 0) {
            const n = sec.expIdx.length, pos = expStr.length - n + di;
            if (di === 0 && pos > 0) out += expStr.slice(0, pos + 1);
            else if (pos >= 0) out += expStr[pos];
            else if (t.v === '0') out += '0';
          }
          break;
        }
      }
    }
    if (!sec.intIdx.length && intStr && sec.expAt < 0) { // formato sin parte entera (".00")
      out = intStr + out;
    }
    nonZero = /[1-9]/.test(fixed);
    return (autoMinus && value < 0 && nonZero ? '-' : '') + out;
  }

  function formatFraction(sec, a) {
    const toks = sec.toks;
    const hasInt = sec.fInt.length > 0;
    let whole = hasInt ? Math.floor(a) : 0;
    let frac = a - whole, num = 0, den = 1;
    if (sec.fFixed) { den = sec.fFixed; num = Math.round(frac * den); } else {
      const maxDen = Math.pow(10, Math.max(1, sec.fDen.length)) - 1;
      let best = Infinity;
      for (let d = 1; d <= maxDen; d++) {
        const nn = Math.round(frac * d), err = Math.abs(frac - nn / d);
        if (err < best - 1e-12) { best = err; num = nn; den = d; if (err < 1e-12) break; }
      }
    }
    if (hasInt && num === den) { whole += 1; num = 0; }
    let out = '';
    const wholeStr = String(whole);
    for (let k = 0; k < toks.length; k++) {
      const t = toks[k];
      if (t.t === 'lit') {
        if (num === 0 && hasInt && k >= sec.fSplit) continue; // sin fracción: solo el entero
        out += sec.fFixed && /^\d+/.test(t.v) && k > toks.findIndex((x) => x.t === 'slash') ? t.v : t.v;
      } else if (t.t === 'slash') { if (!(num === 0 && hasInt)) out += '/'; }
      else if (t.t === 'dig') {
        if (sec.fInt.indexOf(k) >= 0) { if (k === sec.fInt[0]) out += (whole === 0 && num !== 0 && t.v === '#') ? '' : wholeStr; }
        else if (num === 0 && hasInt) continue;
        else if (k === sec.fNum[0]) out += String(num);
        else if (k === sec.fDen[0]) out += String(den);
      } else if (t.t === 'pct') out += '%';
    }
    return out.trim() || '0';
  }

  const pad2 = (n) => (n < 10 ? '0' + n : '' + n);
  function formatDate(sec, serial) {
    if (!D.valid(serial)) return null;
    const hasFs = sec.toks.some((t) => t.t === 'fs');
    let p = D.toParts(hasFs ? serial : Math.round(serial * 86400) / 86400);
    const lang = HC.locale.lang;
    let out = '';
    for (const t of sec.toks) {
      switch (t.t) {
        case 'lit': out += t.v; break;
        case 'd': out += t.n === 1 ? p.d : t.n === 2 ? pad2(p.d) : t.n === 3 ? D.day3()[p.dow] : HC.dayNames(lang)[p.dow]; break;
        case 'm': out += t.n === 1 ? p.m : t.n === 2 ? pad2(p.m) : t.n === 3 ? D.mon3()[p.m - 1] : t.n === 4 ? HC.monthNames(lang)[p.m - 1] : HC.monthNames(lang)[p.m - 1][0].toUpperCase(); break;
        case 'y': out += t.n <= 2 ? pad2(p.y % 100) : p.y; break;
        case 'h': { let h = p.hh; if (sec.h12) { h = h % 12; if (h === 0) h = 12; } out += t.n === 1 ? h : pad2(h); break; }
        case 'mi': out += t.n === 1 ? p.mi : pad2(p.mi); break;
        case 's': out += t.n === 1 ? p.ss : pad2(p.ss); break;
        case 'fs': out += HC.locale.dec + String(Math.floor(p.ms / Math.pow(10, 3 - Math.min(3, t.n))) + 1000).slice(-Math.min(3, t.n)); break;
        case 'ampm': { const pm = p.hh >= 12; const v = t.v.length === 3 ? (pm ? 'P' : 'A') : (pm ? 'PM' : 'AM'); out += t.v === t.v.toLowerCase() ? v.toLowerCase() : v; break; }
        case 'el': {
          const total = t.u === 'h' ? Math.floor(serial * 24 + 1e-9) : t.u === 'm' ? Math.floor(serial * 1440 + 1e-9) : Math.round(serial * 86400);
          let s = String(total); while (s.length < t.n) s = '0' + s; out += s; break;
        }
        case 'dig': case 'dec': case 'grp': break;
        default: break;
      }
    }
    return out;
  }

  function testCond(c, v) {
    switch (c.op) { case '<': return v < c.v; case '<=': return v <= c.v; case '>': return v > c.v; case '>=': return v >= c.v; case '=': return v === c.v; default: return v !== c.v; }
  }
  function pickSection(f, v) {
    const S = f.sections;
    if (S.some((s) => s.cond)) {
      for (let k = 0; k < S.length && k < 3; k++) { if (S[k].kind === 'text' && k === 3) continue; if (!S[k].cond || testCond(S[k].cond, v)) return { sec: S[k], auto: !S[k].cond || k === 0 }; }
      return { sec: S[0], auto: true };
    }
    const n = S.length >= 4 ? 3 : S.length; // la cuarta sección es para texto
    if (n === 1) return { sec: S[0], auto: true };
    if (v > 0) return { sec: S[0], auto: false };
    if (v < 0) return { sec: S[1], auto: false };
    return { sec: n >= 3 ? S[2] : S[0], auto: false };
  }

  // Devuelve {text, color}. v puede ser número, texto, booleano, error o vacío.
  fmt.format = function (v, code) {
    if (v == null) return { text: '' };
    if (v instanceof FErr) return { text: HC.errText(v) };
    if (typeof v === 'boolean') return { text: HC.boolText(v) };
    const f = compile(code || 'General');
    if (typeof v === 'string') {
      const sec = f.sections.length >= 4 ? f.sections[3] : f.sections.find((s) => s.kind === 'text');
      if (!sec || sec.kind !== 'text') return { text: v };
      let out = '';
      for (const t of sec.toks) out += t.t === 'text' ? v : t.t === 'lit' ? t.v : '';
      return { text: out, color: sec.color };
    }
    if (typeof v !== 'number') return { text: String(v) };
    const { sec, auto } = pickSection(f, v);
    switch (sec.kind) {
      case 'general': return { text: fmt.general(v), color: sec.color };
      case 'text': return { text: fmt.general(v), color: sec.color };
      case 'literal': { let out = ''; for (const t of sec.toks) if (t.t === 'lit') out += t.v; return { text: out, color: sec.color }; }
      case 'date': { const s = formatDate(sec, v); return s == null ? { text: '########', overflow: true } : { text: s, color: sec.color }; }
      default: return { text: formatNumber(sec, v, auto), color: sec.color };
    }
  };
  fmt.isDate = (code) => !!code && compile(code).isDate;
  fmt.isText = (code) => !!code && compile(code).isText;
  fmt.kind = function (code) {
    if (!code || /^general$/i.test(code)) return 'general';
    const f = compile(code);
    if (f.isDate) return /[hs]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]/g, '')) && !/[dy]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]/g, '')) ? 'time' : 'date';
    if (f.isText) return 'text';
    if (code.indexOf('%') >= 0) return 'percent';
    if (/E[+-]/i.test(code)) return 'scientific';
    if (/[$€£¥]|\[\$/.test(code)) return 'currency';
    return 'number';
  };
  // Cuántos decimales muestra un formato y cómo cambiarlos (botones "más/menos decimales").
  fmt.changeDecimals = function (code, delta, sample) {
    if (!code || /^general$/i.test(code)) {
      let d = 0;
      if (typeof sample === 'number') { const s = fmt.general(sample).split(HC.locale.dec)[1]; d = s ? s.replace(/E.*$/, '').length : 0; }
      d = Math.max(0, Math.min(15, d + delta));
      return d ? '0.' + '0'.repeat(d) : '0';
    }
    return splitSections(code).map((sec) => {
      const m = /^((?:[^."]|"[^"]*")*?[0#?])(?:\.([0#?]+))?/.exec(sec);
      if (!m) return sec;
      const cur = m[2] ? m[2].length : 0, next = Math.max(0, Math.min(15, cur + delta));
      return m[1] + (next ? '.' + '0'.repeat(next) : '') + sec.slice(m[0].length);
    }).join(';');
  };

  // Texto con el que se edita un valor (fechas como fecha, porcentajes con %, números con toda su precisión).
  fmt.editText = function (v, code) {
    if (v == null) return '';
    if (v instanceof FErr) return HC.errText(v);
    if (typeof v === 'boolean') return HC.boolText(v);
    if (typeof v === 'string') return v;
    const kind = fmt.kind(code);
    if (kind === 'date' && D.valid(v)) {
      const hasTime = Math.abs(v - Math.round(v)) > 1e-9;
      return fmt.format(v, hasTime ? 'dd/mm/yyyy hh:mm:ss' : 'dd/mm/yyyy').text;
    }
    if (kind === 'time' && D.valid(v)) return fmt.format(v, v >= 1 ? '[h]:mm:ss' : 'hh:mm:ss').text;
    if (kind === 'percent') return fmt.numToText(parseFloat((v * 100).toPrecision(15))) + '%';
    return fmt.numToText(v);
  };

  // Formatos predefinidos para la interfaz.
  fmt.presets = [
    { id: 'general', name: 'General', code: 'General' },
    { id: 'number', name: 'Número', code: '#,##0.00' },
    { id: 'integer', name: 'Entero', code: '#,##0' },
    { id: 'currency', name: 'Moneda', code: '"$"#,##0.00' },
    { id: 'accounting', name: 'Contabilidad', code: '_("$"* #,##0.00_);_("$"* (#,##0.00);_("$"* "-"??_);_(@_)' },
    { id: 'percent', name: 'Porcentaje', code: '0.00%' },
    { id: 'date', name: 'Fecha corta', code: 'dd/mm/yyyy' },
    { id: 'longdate', name: 'Fecha larga', code: 'dddd, d "de" mmmm "de" yyyy' },
    { id: 'time', name: 'Hora', code: 'hh:mm:ss' },
    { id: 'datetime', name: 'Fecha y hora', code: 'dd/mm/yyyy hh:mm' },
    { id: 'fraction', name: 'Fracción', code: '# ?/?' },
    { id: 'scientific', name: 'Científica', code: '0.00E+00' },
    { id: 'text', name: 'Texto', code: '@' },
  ];

  // ---------------------------------------------------------------- interpretación de la entrada
  function parseNumber(t) {
    const d = HC.locale.dec, g = HC.locale.grp;
    let s = t, neg = false, pct = false, cur = null, curSuffix = false;
    if (s[0] === '(' && s[s.length - 1] === ')') { neg = true; s = s.slice(1, -1).trim(); }
    if (s[0] === '-') { neg = !neg; s = s.slice(1).trim(); } else if (s[0] === '+') s = s.slice(1).trim();
    if ('$€£¥'.indexOf(s[0]) >= 0 && s.length > 1) { cur = s[0]; s = s.slice(1).trim(); }
    else if ('$€£¥'.indexOf(s[s.length - 1]) >= 0 && s.length > 1) { cur = s[s.length - 1]; curSuffix = true; s = s.slice(0, -1).trim(); }
    if (s[0] === '-') { neg = !neg; s = s.slice(1).trim(); }
    if (s[s.length - 1] === '%') { pct = true; s = s.slice(0, -1).trim(); }
    if (!s || !/^[\d.,]/.test(s)) return null;
    const G = g === '.' ? '\\.' : g === ',' ? ',' : '\\s';
    const Dd = d === '.' ? '\\.' : ',';
    let m = new RegExp('^(\\d{1,3}(?:' + G + '\\d{3})+|\\d*)(?:' + Dd + '(\\d*))?(?:[eE]([+-]?\\d+))?$').exec(s);
    let intPart, decPart, expPart, grouped = false;
    if (m && (m[1] || m[2])) {
      grouped = m[1].indexOf(g) >= 0;
      intPart = m[1].split(g).join(''); decPart = m[2] || ''; expPart = m[3];
    } else {
      // tolerancia: el otro signo usado como decimal ("3.5" con coma decimal, "1,5" con punto decimal)
      m = /^(\d+)[.,](\d+)(?:[eE]([+-]?\d+))?$/.exec(s);
      if (!m) return null;
      intPart = m[1]; decPart = m[2]; expPart = m[3];
    }
    let v = parseFloat((intPart || '0') + '.' + (decPart || '0') + (expPart ? 'e' + expPart : ''));
    if (!isFinite(v)) return null;
    if (pct) v /= 100;
    if (neg) v = -v;
    let nf;
    const decs = decPart.length ? '.' + '0'.repeat(Math.min(decPart.length, 10)) : '';
    if (cur) nf = curSuffix ? '#,##0.00 "' + cur + '"' : '"' + cur + '"#,##0.00';
    else if (pct) nf = '0' + decs + '%';
    else if (expPart) nf = '0.00E+00';
    else if (grouped) nf = '#,##0' + decs;
    return { v, nf };
  }

  let monthLookup = null;
  function monthIndex(name) {
    if (!monthLookup) {
      monthLookup = {};
      for (const lang of ['es', 'en']) {
        HC.monthNames(lang).forEach((n, i) => { monthLookup[HC.fold(n).toLowerCase()] = i + 1; });
        MON3[lang].forEach((n, i) => { monthLookup[n.toLowerCase()] = i + 1; });
      }
      monthLookup.sept = 9; monthLookup.set = 9;
    }
    return monthLookup[HC.fold(name).toLowerCase().replace(/\.$/, '')] || 0;
  }
  function parseTime(t) {
    const m = /^(\d{1,4}):(\d{1,2})(?::(\d{1,2})(?:[.,](\d{1,3}))?)?\s*(a\.?\s?m\.?|p\.?\s?m\.?)?$/i.exec(t);
    if (!m) return null;
    let h = +m[1]; const mi = +m[2], s = m[3] ? +m[3] : 0, ms = m[4] ? +(m[4] + '00').slice(0, 3) : 0;
    if (mi > 59 || s > 59) return null;
    let nf = m[3] ? 'h:mm:ss' : 'h:mm';
    if (m[5]) {
      if (h < 1 || h > 12) return null;
      const pm = /^p/i.test(m[5]);
      h = (h % 12) + (pm ? 12 : 0);
      nf += ' AM/PM';
    } else if (h >= 24) nf = '[h]:mm:ss';
    return { v: (h * 3600 + mi * 60 + s + ms / 1000) / 86400, nf };
  }
  const fullYear = (y, len) => (len <= 2 ? (y < 30 ? 2000 + y : 1900 + y) : y);
  function mkDate(y, m, d) {
    if (m < 1 || m > 12 || d < 1 || y < 1900 || y > 9999) return null;
    if (d > D.daysInMonth(y, m) && !(y === 1900 && m === 2 && d === 29)) return null;
    return D.fromYMD(y, m, d);
  }
  function parseDate(t) {
    const thisYear = new Date().getFullYear();
    let m, v;
    if ((m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(t))) { v = mkDate(+m[1], +m[2], +m[3]); return v == null ? null : { v, nf: 'dd/mm/yyyy' }; }
    if ((m = /^(\d{1,2})([/\-.])(\d{1,2})\2(\d{2}|\d{4})$/.exec(t))) { v = mkDate(fullYear(+m[4], m[4].length), +m[3], +m[1]); return v == null ? null : { v, nf: 'dd/mm/yyyy' }; }
    if ((m = /^(\d{1,2})[/\-](\d{1,2})$/.exec(t))) { v = mkDate(thisYear, +m[2], +m[1]); return v == null ? null : { v, nf: 'd-mmm' }; }
    if ((m = /^(\d{1,2})(?:\s+de\s+|[\s\-/.]+)([a-zñáéíóú]{3,})\.?(?:\s+de\s+|[\s\-/.,]+)(\d{2}|\d{4})$/i.exec(t))) {
      const mo = monthIndex(m[2]); if (!mo) return null;
      v = mkDate(fullYear(+m[3], m[3].length), mo, +m[1]); return v == null ? null : { v, nf: 'd-mmm-yy' };
    }
    if ((m = /^(\d{1,2})(?:\s+de\s+|[\s\-/]+)([a-zñáéíóú]{3,})\.?$/i.exec(t))) {
      const mo = monthIndex(m[2]); if (!mo) return null;
      v = mkDate(thisYear, mo, +m[1]); return v == null ? null : { v, nf: 'd-mmm' };
    }
    if ((m = /^([a-zñáéíóú]{3,})\.?(?:\s+de\s+|[\s\-/]+)(\d{4})$/i.exec(t))) {
      const mo = monthIndex(m[1]); if (!mo) return null;
      v = mkDate(+m[2], mo, 1); return v == null ? null : { v, nf: 'mmm-yy' };
    }
    if ((m = /^([a-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})$/i.exec(t))) {
      const mo = monthIndex(m[1]); if (!mo) return null;
      v = mkDate(+m[3], mo, +m[2]); return v == null ? null : { v, nf: 'dd/mm/yyyy' };
    }
    return null;
  }
  function parseDateTime(t) {
    let r = parseTime(t);
    if (r) return r;
    r = parseDate(t);
    if (r) return r;
    const m = /^(.+?)[\sT]+(\d{1,2}:\d{1,2}(?::\d{1,2}(?:[.,]\d+)?)?\s*(?:[ap]\.?\s?m\.?)?)$/i.exec(t);
    if (m) {
      const d = parseDate(m[1].trim()), tm = parseTime(m[2].trim());
      if (d && tm && tm.v < 1) return { v: d.v + tm.v, nf: 'dd/mm/yyyy ' + (/ss/.test(tm.nf) ? 'hh:mm:ss' : 'hh:mm') };
    }
    return null;
  }

  // Lo que se escribe en una celda -> {v, nf?, isText?}
  HC.parseInput = function (text) {
    if (text == null || text === '') return { v: null };
    if (text[0] === "'") return { v: text.slice(1), isText: true };
    const t = text.trim();
    if (t === '') return { v: text };
    const up = t.toUpperCase();
    if (up === 'TRUE' || up === 'VERDADERO') return { v: true };
    if (up === 'FALSE' || up === 'FALSO') return { v: false };
    if (/^[\d.,+\-($€£¥]/.test(t) || /%$/.test(t)) {
      const r = parseNumber(t);
      if (r) return r;
    }
    if (/\d/.test(t)) {
      const r = parseDateTime(t);
      if (r) return r;
    }
    if (t[0] === '#') { const e = HC.errFromText(t); if (e) return { v: e }; }
    return { v: text };
  };
  // Texto -> número (o null). Lo usan VALOR() y las operaciones aritméticas con texto.
  HC.textToNumber = function (text) {
    const t = String(text).trim();
    if (t === '') return null;
    let r = /^[\d.,+\-($€£¥]/.test(t) || /%$/.test(t) ? parseNumber(t) : null;
    if (!r && /\d/.test(t)) r = parseDateTime(t);
    return r ? r.v : null;
  };
})(typeof window !== 'undefined' ? window : globalThis);
