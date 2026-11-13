/* Archivos de Excel (.xlsx): ZIP propio (compresión del navegador), escritura y lectura de celdas, fórmulas,
   estilos, combinaciones, tamaños, paneles, nombres, validación, formato condicional, filtro, notas y gráficas. */
(function () {
  'use strict';
  const HC = window.HC;
  const MAXR = HC.MAX_ROWS, MAXC = HC.MAX_COLS, EMU = 9525;
  const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const NS_PKG = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
  const CT = 'application/vnd.openxmlformats-officedocument.';
  const XHDR = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

  // ---------------------------------------------------------------- ZIP
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  async function pipe(u8, stream) { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(stream)).arrayBuffer()); }
  async function deflate(u8) { try { return typeof CompressionStream === 'undefined' ? null : await pipe(u8, new CompressionStream('deflate-raw')); } catch (e) { return null; } }
  async function inflate(u8) {
    if (typeof DecompressionStream === 'undefined') throw new Error('Este navegador no puede descomprimir archivos .xlsx. Actualízalo a una versión reciente.');
    return pipe(u8, new DecompressionStream('deflate-raw'));
  }
  async function zip(files) {
    const enc = new TextEncoder(), parts = [], central = [];
    const now = new Date();
    const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name), raw = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
      const crc = crc32(raw);
      let comp = raw.length > 100 ? await deflate(raw) : null, method = 8;
      if (!comp || comp.length >= raw.length) { comp = raw; method = 0; }
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, method, true);
      lh.setUint16(10, time, true); lh.setUint16(12, date, true); lh.setUint32(14, crc, true); lh.setUint32(18, comp.length, true);
      lh.setUint32(22, raw.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, comp);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, method, true);
      ch.setUint16(12, time, true); ch.setUint16(14, date, true); ch.setUint32(16, crc, true); ch.setUint32(20, comp.length, true); ch.setUint32(24, raw.length, true);
      ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + comp.length;
    }
    const cdSize = central.reduce((s, p) => s + p.length, 0), end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: CT + 'spreadsheetml.sheet' });
  }
  function unzip(buf) {
    const u8 = new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let e = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error('El archivo no es un libro .xlsx válido.');
    const count = dv.getUint16(e + 10, true), dec = new TextDecoder(), entries = {};
    let p = dv.getUint32(e + 16, true);
    for (let k = 0; k < count && dv.getUint32(p, true) === 0x02014b50; k++) {
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true);
      const xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), loff = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen)).replace(/^\//, '');
      p += 46 + nlen + xlen + clen;
      const start = loff + 30 + dv.getUint16(loff + 26, true) + dv.getUint16(loff + 28, true);
      entries[name] = { method, data: u8.subarray(start, start + csize) };
    }
    const lower = {};
    for (const n in entries) lower[n.toLowerCase()] = n;
    return {
      has: (n) => n.toLowerCase() in lower,
      async text(n) {
        const real = lower[n.toLowerCase()];
        if (!real) return null;
        const en = entries[real];
        const bytes = en.method === 8 ? await inflate(en.data) : en.data;
        return new TextDecoder('utf-8').decode(bytes);
      },
    };
  }

  // ---------------------------------------------------------------- utilidades XML
  const xe = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f￾￿]/g, '');
  const tx = (s) => (/^\s|\s$|\n/.test(s) ? '<t xml:space="preserve">' + xe(s) + '</t>' : '<t>' + xe(s) + '</t>');
  const argb = (hex) => 'FF' + String(hex || '#000000').replace('#', '').toUpperCase();
  const qs = (name) => HC.quoteSheet(name);
  const ref = (sh, g) => qs(sh.name) + '!' + HC.rangeAddr(g, true);
  // Funciones que en el archivo llevan el prefijo _xlfn. (posteriores a Excel 2007)
  const FUTURE = new Set(('AGGREGATE BETA.DIST BETA.INV BINOM.DIST BINOM.INV CEILING.MATH CEILING.PRECISE CHISQ.DIST CHISQ.DIST.RT CHISQ.INV CHISQ.INV.RT CHISQ.TEST CONCAT CONFIDENCE.NORM CONFIDENCE.T COVARIANCE.P COVARIANCE.S DAYS ERF.PRECISE ERFC.PRECISE EXPON.DIST F.DIST F.DIST.RT F.INV F.INV.RT F.TEST FLOOR.MATH FLOOR.PRECISE FORECAST.LINEAR GAMMA GAMMA.DIST GAMMA.INV GAMMALN.PRECISE GAUSS HYPGEOM.DIST IFNA IFS ISOWEEKNUM LOGNORM.DIST LOGNORM.INV MAXIFS MINIFS MODE.MULT MODE.SNGL NEGBINOM.DIST NETWORKDAYS.INTL NORM.DIST NORM.INV NORM.S.DIST NORM.S.INV NUMBERVALUE PERCENTILE.EXC PERCENTILE.INC PERCENTRANK.EXC PERCENTRANK.INC PERMUTATIONA PHI POISSON.DIST QUARTILE.EXC QUARTILE.INC RANK.AVG RANK.EQ RRI PDURATION SHEET SHEETS SKEW.P STDEV.P STDEV.S SWITCH T.DIST T.DIST.2T T.DIST.RT T.INV T.INV.2T T.TEST TEXTJOIN UNICHAR UNICODE VAR.P VAR.S WEIBULL.DIST WORKDAY.INTL XOR Z.TEST ACOT ACOTH ARABIC BASE BITAND BITOR BITXOR BITLSHIFT BITRSHIFT COMBINA COT COTH CSC CSCH DECIMAL ENCODEURL FORMULATEXT ISFORMULA MUNIT SEC SECH XLOOKUP XMATCH LET LAMBDA MAP REDUCE SCAN BYROW BYCOL MAKEARRAY ISOMITTED SEQUENCE RANDARRAY UNIQUE SORTBY TEXTBEFORE TEXTAFTER TEXTSPLIT TOCOL TOROW WRAPROWS WRAPCOLS VSTACK HSTACK TAKE DROP CHOOSEROWS CHOOSECOLS EXPAND VALUETOTEXT ARRAYTOTEXT REGEXTEST REGEXEXTRACT REGEXREPLACE ISOMITTED').split(' '));
  const XLWS = new Set(['FILTER', 'SORT']);
  function exportFormula(f, wb) {
    const toks = HC.tokenize(f, HC.SYN_CANON), params = /\b(LET|LAMBDA)\(/.test(f);
    let out = '';
    for (const t of toks) {
      const src = f.slice(t.s, t.e);
      if (t.t === 'fn') out += (XLWS.has(t.v) ? '_xlfn._xlws.' : FUTURE.has(t.v) ? '_xlfn.' : '') + src;
      else if (t.t === 'ref' && t.spill) out += '_xlfn.ANCHORARRAY(' + src.replace(/#$/, '') + ')';
      else if (t.t === 'name' && params && !wb.names.has(t.v.toUpperCase())) out += '_xlpm.' + src;
      else out += src;
    }
    return out;
  }
  function importFormula(f) {
    return String(f).replace(/_xlfn\._xlws\.|_xlfn\.|_xlpm\.|_xlws\./g, '').replace(/\bANCHORARRAY\(([^()]+)\)/g, '$1#').replace(/\bSINGLE\(/g, '@(');
  }

  // ---------------------------------------------------------------- escritura: estilos
  const BSTYLE = { thin: 'thin', medium: 'medium', thick: 'thick', dashed: 'dashed', dotted: 'dotted', double: 'double' };
  function styleTable() {
    const fonts = ['<font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>'], fontIdx = new Map([['', 0]]);
    const fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'], fillIdx = new Map();
    const borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>'], borderIdx = new Map([['', 0]]);
    const numFmts = [], fmtIdx = new Map([['General', 0], ['@', 49]]);
    const xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'], xfIdx = new Map();
    const dxfs = [];
    function fontId(s) {
      const key = [s.b, s.i, s.u, s.st, s.ff, s.fs, s.fc].map((v) => (v == null || v === false ? '' : v)).join('|');
      if (key === '||||||') return 0;
      let id = fontIdx.get(key);
      if (id == null) {
        id = fonts.length; fontIdx.set(key, id);
        fonts.push('<font>' + (s.b ? '<b/>' : '') + (s.i ? '<i/>' : '') + (s.st ? '<strike/>' : '') + (s.u ? '<u/>' : '') + '<sz val="' + (s.fs || 11) + '"/>' + (s.fc ? '<color rgb="' + argb(s.fc) + '"/>' : '<color theme="1"/>') + '<name val="' + xe(s.ff || 'Calibri') + '"/><family val="2"/>' + (s.ff ? '' : '<scheme val="minor"/>') + '</font>');
      }
      return id;
    }
    function fillId(s) {
      if (!s.bg) return 0;
      let id = fillIdx.get(s.bg);
      if (id == null) { id = fills.length; fillIdx.set(s.bg, id); fills.push('<fill><patternFill patternType="solid"><fgColor rgb="' + argb(s.bg) + '"/><bgColor indexed="64"/></patternFill></fill>'); }
      return id;
    }
    function borderId(s) {
      const key = [s.bl, s.br, s.bt, s.bb].map((v) => v || '').join('|');
      if (key === '|||') return 0;
      let id = borderIdx.get(key);
      if (id == null) {
        id = borders.length; borderIdx.set(key, id);
        const side = (tag, spec) => { if (!spec) return '<' + tag + '/>'; const p = spec.split(' '); return '<' + tag + ' style="' + (BSTYLE[p[0]] || 'thin') + '"><color rgb="' + argb(p[1]) + '"/></' + tag + '>'; };
        borders.push('<border>' + side('left', s.bl) + side('right', s.br) + side('top', s.bt) + side('bottom', s.bb) + '<diagonal/></border>');
      }
      return id;
    }
    function fmtId(code) {
      if (!code || /^general$/i.test(code)) return 0;
      let id = fmtIdx.get(code);
      if (id == null) { id = 164 + numFmts.length; fmtIdx.set(code, id); numFmts.push('<numFmt numFmtId="' + id + '" formatCode="' + xe(code) + '"/>'); }
      return id;
    }
    function xf(s) {
      if (!s) return 0;
      let id = xfIdx.get(s);
      if (id != null) return id;
      const nf = fmtId(s.nf), fo = fontId(s), fi = fillId(s), bo = borderId(s);
      const al = s.ha || s.va || s.wrap || s.ind;
      const H = { l: 'left', c: 'center', r: 'right' }, Vv = { t: 'top', m: 'center', b: 'bottom' };
      const x = '<xf numFmtId="' + nf + '" fontId="' + fo + '" fillId="' + fi + '" borderId="' + bo + '" xfId="0"' + (nf ? ' applyNumberFormat="1"' : '') + (fo ? ' applyFont="1"' : '') + (fi ? ' applyFill="1"' : '') + (bo ? ' applyBorder="1"' : '') + (al ? ' applyAlignment="1"><alignment' + (s.ha ? ' horizontal="' + H[s.ha] + '"' : '') + (s.va ? ' vertical="' + Vv[s.va] + '"' : '') + (s.wrap ? ' wrapText="1"' : '') + (s.ind ? ' indent="' + s.ind + '"' : '') + '/></xf>' : '/>');
      id = xfs.length; xfs.push(x); xfIdx.set(s, id);
      return id;
    }
    function dxf(st) {
      st = st || {};
      dxfs.push('<dxf>' + (st.b || st.fc || st.i ? '<font>' + (st.b ? '<b/>' : '') + (st.i ? '<i/>' : '') + (st.fc ? '<color rgb="' + argb(st.fc) + '"/>' : '') + '</font>' : '') + (st.bg ? '<fill><patternFill><bgColor rgb="' + argb(st.bg) + '"/></patternFill></fill>' : '') + '</dxf>');
      return dxfs.length - 1;
    }
    function xml() {
      return XHDR + '<styleSheet xmlns="' + NS_MAIN + '">'
        + (numFmts.length ? '<numFmts count="' + numFmts.length + '">' + numFmts.join('') + '</numFmts>' : '')
        + '<fonts count="' + fonts.length + '">' + fonts.join('') + '</fonts>'
        + '<fills count="' + fills.length + '">' + fills.join('') + '</fills>'
        + '<borders count="' + borders.length + '">' + borders.join('') + '</borders>'
        + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        + '<cellXfs count="' + xfs.length + '">' + xfs.join('') + '</cellXfs>'
        + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
        + '<dxfs count="' + dxfs.length + '">' + dxfs.join('') + '</dxfs>'
        + '<tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/></styleSheet>';
    }
    return { xf, dxf, xml };
  }

  // ---------------------------------------------------------------- escritura: gráficas
  const AX = '<c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>';
  function refOfCells(cells) {
    const list = (cells || []).filter(Boolean);
    if (!list.length) return null;
    const groups = [];
    for (const x of list) {
      const g = groups[groups.length - 1];
      if (g && g.sh === x.sh && ((g.c1 === x.c && g.c2 === x.c && x.r === g.r2 + 1) || (g.r1 === x.r && g.r2 === x.r && x.c === g.c2 + 1))) { g.r2 = x.r; g.c2 = x.c; }
      else groups.push({ sh: x.sh, r1: x.r, c1: x.c, r2: x.r, c2: x.c });
    }
    const parts = groups.map((g) => ref(g.sh, g));
    return parts.length === 1 ? parts[0] : '(' + parts.join(',') + ')';
  }
  const strCache = (vals) => '<c:strCache><c:ptCount val="' + vals.length + '"/>' + vals.map((v, i) => '<c:pt idx="' + i + '"><c:v>' + xe(v) + '</c:v></c:pt>').join('') + '</c:strCache>';
  const numCache = (vals, nf) => '<c:numCache><c:formatCode>' + xe(nf || 'General') + '</c:formatCode><c:ptCount val="' + vals.length + '"/>' + vals.map((v, i) => (v == null ? '' : '<c:pt idx="' + i + '"><c:v>' + v + '</c:v></c:pt>')).join('') + '</c:numCache>';
  const strData = (cells, texts) => { const f = refOfCells(cells); return f ? '<c:strRef><c:f>' + xe(f) + '</c:f>' + strCache(texts) + '</c:strRef>' : '<c:strLit><c:ptCount val="' + texts.length + '"/>' + texts.map((v, i) => '<c:pt idx="' + i + '"><c:v>' + xe(v) + '</c:v></c:pt>').join('') + '</c:strLit>'; };
  const numData = (cells, vals, nf) => { const f = refOfCells(cells); return f ? '<c:numRef><c:f>' + xe(f) + '</c:f>' + numCache(vals, nf) + '</c:numRef>' : '<c:numLit><c:formatCode>General</c:formatCode><c:ptCount val="' + vals.length + '"/>' + vals.map((v, i) => (v == null ? '' : '<c:pt idx="' + i + '"><c:v>' + v + '</c:v></c:pt>')).join('') + '</c:numLit>'; };
  const richTitle = (t) => '<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>' + xe(t) + '</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>';
  const solid = (c) => '<a:solidFill><a:srgbClr val="' + c.replace('#', '').toUpperCase() + '"/></a:solidFill>';
  const lineSp = (c) => '<c:spPr><a:ln w="28575" cap="rnd">' + solid(c) + '<a:round/></a:ln></c:spPr>';
  const lbls = (val, pct) => '<c:dLbls><c:showLegendKey val="0"/><c:showVal val="' + (val ? 1 : 0) + '"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="' + (pct ? 1 : 0) + '"/><c:showBubbleSize val="0"/></c:dLbls>';
  function chartXml(ch, data) {
    const o = ch.opts || {}, type = ch.type, pal = HC.chartRender.LIGHT.series;
    const color = (k) => ((o.colors && o.colors[k]) || pal[k % pal.length]);
    const S = data.series;
    const tx = (s) => (s.nameCell ? '<c:tx><c:strRef><c:f>' + xe(refOfCells([s.nameCell])) + '</c:f>' + strCache([s.name]) + '</c:strRef></c:tx>' : '<c:tx><c:v>' + xe(s.name) + '</c:v></c:tx>');
    const catXml = data.catCells ? '<c:cat>' + strData(data.catCells, data.cats) + '</c:cat>' : '<c:cat>' + strData(null, data.cats) + '</c:cat>';
    const trend = o.trend ? '<c:trendline><c:trendlineType val="linear"/><c:dispRSqr val="' + (type === 'scatter' ? 1 : 0) + '"/><c:dispEq val="0"/></c:trendline>' : '';
    const stackMode = o.stacked === 'stack' ? 'stacked' : o.stacked === 'percent' ? 'percentStacked' : null;
    const axes = (catPos, valPos, cat) => (cat ? '<c:catAx><c:axId val="500000001"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="' + catPos + '"/>' + (o.xTitle ? richTitle(o.xTitle) : '') + '<c:numFmt formatCode="General" sourceLinked="1"/>' + AX + '<c:crossAx val="500000002"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>'
      : '<c:valAx><c:axId val="500000001"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="' + catPos + '"/>' + (o.grid !== false ? '<c:majorGridlines/>' : '') + (o.xTitle ? richTitle(o.xTitle) : '') + '<c:numFmt formatCode="General" sourceLinked="1"/>' + AX + '<c:crossAx val="500000002"/><c:crosses val="autoZero"/><c:crossBetween val="midCat"/></c:valAx>')
      + '<c:valAx><c:axId val="500000002"/><c:scaling><c:orientation val="minMax"/>' + (o.yMax != null ? '<c:max val="' + o.yMax + '"/>' : '') + (o.yMin != null ? '<c:min val="' + o.yMin + '"/>' : '') + '</c:scaling><c:delete val="0"/><c:axPos val="' + valPos + '"/>' + (o.grid !== false ? '<c:majorGridlines/>' : '') + (o.yTitle ? richTitle(o.yTitle) : '') + '<c:numFmt formatCode="' + (o.stacked === 'percent' ? '0%' : 'General') + '" sourceLinked="' + (o.stacked === 'percent' ? 0 : 1) + '"/>' + AX + '<c:crossAx val="500000001"/><c:crosses val="autoZero"/><c:crossBetween val="' + (cat ? 'between' : 'midCat') + '"/></c:valAx>';
    const ids = '<c:axId val="500000001"/><c:axId val="500000002"/>';
    const barSer = (s, k) => '<c:ser><c:idx val="' + k + '"/><c:order val="' + k + '"/>' + tx(s) + '<c:spPr>' + solid(color(k)) + '</c:spPr><c:invertIfNegative val="0"/>' + (o.labels ? lbls(true) : '') + trend + catXml + '<c:val>' + numData(s.cells, s.values, data.nf) + '</c:val></c:ser>';
    const lineSer = (s, k, area) => '<c:ser><c:idx val="' + k + '"/><c:order val="' + k + '"/>' + tx(s) + (area ? '<c:spPr>' + solid(color(k)) + '</c:spPr>' : lineSp(color(k)) + '<c:marker>' + (o.markers === false ? '<c:symbol val="none"/>' : '<c:symbol val="circle"/><c:size val="5"/><c:spPr>' + solid(color(k)) + '</c:spPr>') + '</c:marker>') + (o.labels ? lbls(true) : '') + (area ? '' : trend) + catXml + '<c:val>' + numData(s.cells, s.values, data.nf) + '</c:val>' + (area ? '' : '<c:smooth val="' + (o.smooth ? 1 : 0) + '"/>') + '</c:ser>';
    let plot = '', axesXml = '';
    if (type === 'column' || type === 'bar' || type === 'histogram') {
      plot = '<c:barChart><c:barDir val="' + (type === 'bar' ? 'bar' : 'col') + '"/><c:grouping val="' + (stackMode || 'clustered') + '"/><c:varyColors val="0"/>' + S.map(barSer).join('') + '<c:gapWidth val="' + (type === 'histogram' ? 0 : 150) + '"/>' + (stackMode ? '<c:overlap val="100"/>' : '') + ids + '</c:barChart>';
      axesXml = axes(type === 'bar' ? 'l' : 'b', type === 'bar' ? 'b' : 'l', true);
    } else if (type === 'line') {
      plot = '<c:lineChart><c:grouping val="' + (stackMode || 'standard') + '"/><c:varyColors val="0"/>' + S.map((s, k) => lineSer(s, k)).join('') + '<c:marker val="1"/>' + ids + '</c:lineChart>';
      axesXml = axes('b', 'l', true);
    } else if (type === 'area') {
      plot = '<c:areaChart><c:grouping val="' + (stackMode || 'standard') + '"/><c:varyColors val="0"/>' + S.map((s, k) => lineSer(s, k, true)).join('') + ids + '</c:areaChart>';
      axesXml = axes('b', 'l', true);
    } else if (type === 'combo') {
      const kinds = S.map((s, k) => (o.kinds && o.kinds[k]) || (S.length > 1 && k === S.length - 1 ? 'line' : 'col'));
      const cols = S.map((s, k) => (kinds[k] === 'col' ? barSer(s, k) : '')).join(''), lines = S.map((s, k) => (kinds[k] === 'line' ? lineSer(s, k) : '')).join('');
      plot = (cols ? '<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>' + cols + '<c:gapWidth val="150"/>' + ids + '</c:barChart>' : '') + (lines ? '<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>' + lines + '<c:marker val="1"/>' + ids + '</c:lineChart>' : '');
      axesXml = axes('b', 'l', true);
    } else if (type === 'pie' || type === 'doughnut') {
      const s = S[0];
      const dpt = data.cats.map((_, i) => '<c:dPt><c:idx val="' + i + '"/><c:bubble3D val="0"/><c:spPr>' + solid(color(i)) + '<a:ln w="19050"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr></c:dPt>').join('');
      const ser = '<c:ser><c:idx val="0"/><c:order val="0"/>' + tx(s) + dpt + (o.labels !== false ? lbls(false, true) : '') + catXml + '<c:val>' + numData(s.cells, s.values, data.nf) + '</c:val></c:ser>';
      plot = type === 'pie' ? '<c:pieChart><c:varyColors val="1"/>' + ser + '<c:firstSliceAng val="0"/></c:pieChart>' : '<c:doughnutChart><c:varyColors val="1"/>' + ser + '<c:firstSliceAng val="0"/><c:holeSize val="58"/></c:doughnutChart>';
    } else if (type === 'scatter') {
      plot = '<c:scatterChart><c:scatterStyle val="lineMarker"/><c:varyColors val="0"/>' + S.map((s, k) => '<c:ser><c:idx val="' + k + '"/><c:order val="' + k + '"/>' + tx(s) + '<c:spPr><a:ln w="' + (o.lines ? 28575 : 19050) + '">' + (o.lines ? solid(color(k)) : '<a:noFill/>') + '</a:ln></c:spPr><c:marker><c:symbol val="' + ['circle', 'square', 'triangle', 'diamond', 'triangle', 'circle'][k % 6] + '"/><c:size val="6"/><c:spPr>' + solid(color(k)) + '</c:spPr></c:marker>' + (o.labels ? lbls(true) : '') + trend + '<c:xVal>' + numData(data.xCells, s.xs, data.xnf) + '</c:xVal><c:yVal>' + numData(s.cells, s.values, data.nf) + '</c:yVal><c:smooth val="0"/></c:ser>').join('') + ids + '</c:scatterChart>';
      axesXml = axes('b', 'l', false);
    } else if (type === 'bubble') {
      plot = '<c:bubbleChart><c:varyColors val="0"/>' + S.map((s, k) => '<c:ser><c:idx val="' + k + '"/><c:order val="' + k + '"/>' + tx(s) + '<c:spPr>' + solid(color(k)) + '</c:spPr><c:invertIfNegative val="0"/><c:xVal>' + numData(data.xCells, s.xs, data.xnf) + '</c:xVal><c:yVal>' + numData(s.cells, s.values, data.nf) + '</c:yVal><c:bubbleSize>' + numData(s.sizeCells, s.sizes) + '</c:bubbleSize><c:bubble3D val="0"/></c:ser>').join('') + '<c:bubbleScale val="100"/><c:showNegBubbles val="0"/>' + ids + '</c:bubbleChart>';
      axesXml = axes('b', 'l', false);
    } else if (type === 'radar') {
      plot = '<c:radarChart><c:radarStyle val="marker"/><c:varyColors val="0"/>' + S.map((s, k) => '<c:ser><c:idx val="' + k + '"/><c:order val="' + k + '"/>' + tx(s) + lineSp(color(k)) + '<c:marker><c:symbol val="circle"/><c:size val="5"/><c:spPr>' + solid(color(k)) + '</c:spPr></c:marker>' + catXml + '<c:val>' + numData(s.cells, s.values, data.nf) + '</c:val></c:ser>').join('') + ids + '</c:radarChart>';
      axesXml = axes('b', 'l', true);
    }
    const legendPos = { bottom: 'b', right: 'r', top: 't' }[o.legend || (type === 'pie' || type === 'doughnut' ? 'right' : 'bottom')];
    const showLegend = legendPos && (S.length > 1 || type === 'pie' || type === 'doughnut');
    return XHDR + '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="' + NS_R + '"><c:roundedCorners val="0"/><c:chart>'
      + (ch.title ? richTitle(ch.title) + '<c:autoTitleDeleted val="0"/>' : '<c:autoTitleDeleted val="1"/>')
      + '<c:plotArea><c:layout/>' + plot + axesXml + '</c:plotArea>'
      + (showLegend ? '<c:legend><c:legendPos val="' + legendPos + '"/><c:overlay val="0"/></c:legend>' : '')
      + '<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>';
  }
  function anchorXml(sh, ch, rid, n) {
    const pos = (ax, px) => { const i = Math.min(ax === sh.colW ? MAXC - 1 : MAXR - 1, ax.indexAt(px)); return [i, Math.max(0, Math.round((px - ax.pos(i)) * EMU))]; };
    const [c1, cx1] = pos(sh.colW, ch.x), [r1, ry1] = pos(sh.rowH, ch.y), [c2, cx2] = pos(sh.colW, ch.x + ch.w), [r2, ry2] = pos(sh.rowH, ch.y + ch.h);
    return '<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>' + c1 + '</xdr:col><xdr:colOff>' + cx1 + '</xdr:colOff><xdr:row>' + r1 + '</xdr:row><xdr:rowOff>' + ry1 + '</xdr:rowOff></xdr:from>'
      + '<xdr:to><xdr:col>' + c2 + '</xdr:col><xdr:colOff>' + cx2 + '</xdr:colOff><xdr:row>' + r2 + '</xdr:row><xdr:rowOff>' + ry2 + '</xdr:rowOff></xdr:to>'
      + '<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="' + (n + 1) + '" name="' + xe(ch.title || 'Gráfico ' + n) + '"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>'
      + '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="' + rid + '"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>';
  }

  // ---------------------------------------------------------------- escritura: libro
  const CF_OPS = { gt: 'greaterThan', gte: 'greaterThanOrEqual', lt: 'lessThan', lte: 'lessThanOrEqual', eq: 'equal', neq: 'notEqual', between: 'between', nbetween: 'notBetween' };
  const FILTER_OPS = { equal: 'eq', notEqual: 'neq', greaterThan: 'gt', greaterThanOrEqual: 'gte', lessThan: 'lt', lessThanOrEqual: 'lte' };
  const escapeWildcard = (text) => text.replace(/[~*?]/g, '~$&');
  const unescapeWildcard = (text) => text.replace(/~([~*?])/g, '$1');
  function readFilterSpec(column) {
    const filters = kid(column, 'filters');
    if (filters) {
      if (kids(filters, 'dateGroupItem').length) return null;
      const values = kids(filters, 'filter').map((el) => attr(el, 'val'));
      if (/^(1|true)$/.test(attr(filters, 'blank'))) values.push('');
      return { values, matchDisplay: true };
    }
    const group = kid(column, 'customFilters');
    const clauses = kids(group, 'customFilter');
    const rawOp = (el) => FILTER_OPS[attr(el, 'operator') || 'equal'];
    const value = (el) => attr(el, 'val') ?? '';
    const number = (text) => /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text) && Number.isFinite(Number(text)) ? Number(text) : null;
    if (clauses.length === 2 && /^(1|true)$/.test(attr(group, 'and'))) {
      const lower = clauses.find((el) => rawOp(el) === 'gte'), upper = clauses.find((el) => rawOp(el) === 'lte');
      if (!lower || !upper) return null;
      const v1 = number(value(lower)), v2 = number(value(upper));
      return v1 != null && v2 != null ? { op: 'between', v1, v2 } : null;
    }
    if (clauses.length !== 1) return null;
    const op = rawOp(clauses[0]), text = value(clauses[0]), n = number(text);
    if (!op) return null;
    if (op === 'neq' && text === ' ') return { op: 'nblank' };
    if (op !== 'eq' && op !== 'neq') return n != null ? { op, v1: n } : null;
    const wildcard = Array.from(text.matchAll(/~[~*?]|[*?]/g)).filter((match) => match[0].length === 1);
    if (!wildcard.length) return { op, v1: n ?? unescapeWildcard(text) };
    const beginsWithStar = wildcard[0].index === 0 && wildcard[0][0] === '*';
    const endsWithStar = wildcard[wildcard.length - 1].index === text.length - 1 && wildcard[wildcard.length - 1][0] === '*';
    if (wildcard.length !== Number(beginsWithStar) + Number(endsWithStar)) return null;
    if (beginsWithStar && endsWithStar) return { op: op === 'eq' ? 'contains' : 'ncontains', v1: unescapeWildcard(text.slice(1, -1)) };
    if (op === 'eq' && beginsWithStar) return { op: 'ends', v1: unescapeWildcard(text.slice(1)) };
    if (op === 'eq' && endsWithStar) return { op: 'begins', v1: unescapeWildcard(text.slice(0, -1)) };
    return null;
  }
  function cfValue(v) {
    const s = String(v == null ? '' : v).trim();
    if (s[0] === '=') return HC.canonicalizeFormula(s.slice(1));
    const n = HC.textToNumber(s);
    return n != null ? String(n) : '"' + s.replace(/"/g, '""') + '"';
  }
  async function write(wb) {
    const files = [], st = styleTable(), ss = [], ssIdx = new Map();
    const sst = (s) => { let i = ssIdx.get(s); if (i == null) { i = ss.length; ss.push(s); ssIdx.set(s, i); } return i; };
    const ctypes = [], wbRels = [];
    let chartN = 0, drawingN = 0, anySpill = false;
    wb.sheets.forEach((sh, si) => {
      const n = si + 1, rels = [];
      const u = sh.usedRange();
      const rowsXml = [], rowSet = new Set();
      sh.rows.forEach((row, r) => { if (row && row.some(Boolean)) rowSet.add(r); });
      for (const r of sh.rowH.sizes.keys()) rowSet.add(r);
      for (const r of sh.rowH.hidden) rowSet.add(r);
      for (const r of sh.rowH.filtered) rowSet.add(r);
      sh.rowStyle.forEach((s, r) => { if (s) rowSet.add(r); });
      for (const r of Array.from(rowSet).sort((a, b) => a - b)) {
        if (r >= MAXR) continue;
        const row = sh.rows[r] || [], cells = [];
        row.forEach((cell, c) => {
          if (!cell) return;
          const s = cell.s ? st.xf(cell.s) : 0, a = HC.addr(r, c), sAttr = s ? ' s="' + s + '"' : '';
          const v = cell.v;
          if (cell.f != null) {
            let f = exportFormula(cell.f, wb), ftag;
            if (cell.sp) { anySpill = true; ftag = '<f t="array" ref="' + HC.rangeAddr({ r1: r, c1: c, r2: r + cell.sp.rows - 1, c2: c + cell.sp.cols - 1 }) + '">' + xe(f) + '</f>'; }
            else ftag = '<f>' + xe(f) + '</f>';
            const cm = cell.sp ? ' cm="1"' : '';
            if (typeof v === 'number') cells.push('<c r="' + a + '"' + sAttr + cm + '>' + ftag + '<v>' + v + '</v></c>');
            else if (typeof v === 'string') cells.push('<c r="' + a + '"' + sAttr + cm + ' t="str">' + ftag + '<v>' + xe(v) + '</v></c>');
            else if (typeof v === 'boolean') cells.push('<c r="' + a + '"' + sAttr + cm + ' t="b">' + ftag + '<v>' + (v ? 1 : 0) + '</v></c>');
            else if (v instanceof HC.FErr) cells.push('<c r="' + a + '"' + sAttr + cm + ' t="e">' + ftag + '<v>' + xe(v.code === '#CIRC!' || v.code === '#ERROR!' ? '#VALUE!' : v.code) + '</v></c>');
            else cells.push('<c r="' + a + '"' + sAttr + cm + '>' + ftag + '</c>');
            return;
          }
          if (typeof v === 'number') cells.push('<c r="' + a + '"' + sAttr + '><v>' + v + '</v></c>');
          else if (typeof v === 'string') cells.push('<c r="' + a + '"' + sAttr + ' t="s"><v>' + sst(v) + '</v></c>');
          else if (typeof v === 'boolean') cells.push('<c r="' + a + '"' + sAttr + ' t="b"><v>' + (v ? 1 : 0) + '</v></c>');
          else if (v instanceof HC.FErr) cells.push('<c r="' + a + '"' + sAttr + ' t="e"><v>' + xe(v.code) + '</v></c>');
          else if (s) cells.push('<c r="' + a + '"' + sAttr + '/>');
        });
        const custom = sh.rowH.sizes.has(r), hidden = sh.rowH.hidden.has(r) || sh.rowH.filtered.has(r), rs = sh.rowStyle[r];
        rowsXml.push('<row r="' + (r + 1) + '"' + (custom ? ' ht="' + +(sh.rowH.raw(r) * 0.75).toFixed(2) + '" customHeight="1"' : '') + (hidden ? ' hidden="1"' : '') + (rs ? ' s="' + st.xf(rs) + '" customFormat="1"' : '') + (cells.length ? '>' + cells.join('') + '</row>' : '/>'));
      }
      // columnas
      const colSet = new Set([...sh.colW.sizes.keys(), ...sh.colW.hidden]);
      sh.colStyle.forEach((s, c) => { if (s) colSet.add(c); });
      const cols = Array.from(colSet).filter((c) => c < MAXC).sort((a, b) => a - b).map((c) => {
        const w = Math.round((sh.colW.raw(c) / 7) * 256) / 256, s = sh.colStyle[c];
        return '<col min="' + (c + 1) + '" max="' + (c + 1) + '" width="' + w + '" customWidth="1"' + (sh.colW.hidden.has(c) ? ' hidden="1"' : '') + (s ? ' style="' + st.xf(s) + '"' : '') + '/>';
      });
      // vista
      const fr = sh.frozenRows, fc = sh.frozenCols;
      let pane = '';
      if (fr || fc) {
        const ap = fr && fc ? 'bottomRight' : fr ? 'bottomLeft' : 'topRight';
        pane = '<pane' + (fc ? ' xSplit="' + fc + '"' : '') + (fr ? ' ySplit="' + fr + '"' : '') + ' topLeftCell="' + HC.addr(fr, fc) + '" activePane="' + ap + '" state="frozen"/><selection pane="' + ap + '"/>';
      }
      let xml = XHDR + '<worksheet xmlns="' + NS_MAIN + '" xmlns:r="' + NS_R + '">'
        + (sh.tabColor ? '<sheetPr><tabColor rgb="' + argb(sh.tabColor) + '"/></sheetPr>' : '')
        + '<dimension ref="' + (u.r2 >= 0 ? HC.rangeAddr({ r1: 0, c1: 0, r2: u.r2, c2: u.c2 }) : 'A1') + '"/>'
        + '<sheetViews><sheetView' + (si === wb.active ? ' tabSelected="1"' : '') + (sh.showGrid ? '' : ' showGridLines="0"') + ' workbookViewId="0">' + pane + '</sheetView></sheetViews>'
        + '<sheetFormatPr defaultRowHeight="15"' + (HC.DEF_COL_W !== 64 ? ' defaultColWidth="' + Math.round((HC.DEF_COL_W / 7) * 256) / 256 + '"' : '') + '/>'
        + (cols.length ? '<cols>' + cols.join('') + '</cols>' : '')
        + '<sheetData>' + rowsXml.join('') + '</sheetData>';
      // filtro
      if (sh.filter) {
        const g = wb.filterBounds(sh), fcols = [];
        for (const k of Object.keys(sh.filter.cols || {})) {
          const spec = sh.filter.cols[k];
          if (spec.hidden || spec.values) {
            const passes = HC.filterTest(spec);
            const values = wb.filterItems(sh, +k).filter(({ v, text }) => passes(v, () => text)).map(({ key }) => key);
            fcols.push('<filterColumn colId="' + k + '"><filters' + (values.includes('') ? ' blank="1"' : '') + '>'
              + values.filter((value) => value !== '').map((value) => '<filter val="' + xe(value) + '"/>').join('') + '</filters></filterColumn>');
          } else {
            const v1 = String(spec.v1 == null ? '' : spec.v1), v2 = String(spec.v2 == null ? '' : spec.v2);
            const literal = escapeWildcard(v1);
            const one = (op, v) => '<customFilter' + (op ? ' operator="' + op + '"' : '') + ' val="' + xe(v) + '"/>';
            let inner = null;
            switch (spec.op) {
              case 'eq': inner = '<customFilters>' + one(null, literal) + '</customFilters>'; break;
              case 'neq': inner = '<customFilters>' + one('notEqual', literal) + '</customFilters>'; break;
              case 'gt': case 'gte': case 'lt': case 'lte': inner = '<customFilters>' + one({ gt: 'greaterThan', gte: 'greaterThanOrEqual', lt: 'lessThan', lte: 'lessThanOrEqual' }[spec.op], v1) + '</customFilters>'; break;
              case 'between': inner = '<customFilters and="1">' + one('greaterThanOrEqual', v1) + one('lessThanOrEqual', v2) + '</customFilters>'; break;
              case 'contains': inner = '<customFilters>' + one(null, '*' + literal + '*') + '</customFilters>'; break;
              case 'ncontains': inner = '<customFilters>' + one('notEqual', '*' + literal + '*') + '</customFilters>'; break;
              case 'begins': inner = '<customFilters>' + one(null, literal + '*') + '</customFilters>'; break;
              case 'ends': inner = '<customFilters>' + one(null, '*' + literal) + '</customFilters>'; break;
              case 'blank': inner = '<filters blank="1"/>'; break;
              case 'nblank': inner = '<customFilters>' + one('notEqual', ' ') + '</customFilters>'; break;
            }
            if (inner) fcols.push('<filterColumn colId="' + k + '">' + inner + '</filterColumn>');
          }
        }
        xml += '<autoFilter ref="' + HC.rangeAddr(g) + '"' + (fcols.length ? '>' + fcols.join('') + '</autoFilter>' : '/>');
      }
      if (sh.merges.length) xml += '<mergeCells count="' + sh.merges.length + '">' + sh.merges.map((m) => '<mergeCell ref="' + HC.rangeAddr(m) + '"/>').join('') + '</mergeCells>';
      // formato condicional
      let prio = 1;
      for (const rule of sh.condFmts) {
        const sq = rule.ranges.map((g) => HC.rangeAddr(g)).join(' '), tl = HC.addr(rule.ranges[0].r1, rule.ranges[0].c1);
        let cf = null;
        const d = () => ' dxfId="' + st.dxf(rule.style) + '"';
        const p = ' priority="' + prio + '"';
        const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
        switch (rule.type) {
          case 'cell': cf = '<cfRule type="cellIs"' + d() + p + ' operator="' + CF_OPS[rule.op] + '"><formula>' + xe(cfValue(rule.v1)) + '</formula>' + (rule.op === 'between' || rule.op === 'nbetween' ? '<formula>' + xe(cfValue(rule.v2)) + '</formula>' : '') + '</cfRule>'; break;
          case 'text': {
            const t = String(rule.v1 || '');
            const map = { contains: ['containsText', 'containsText', 'NOT(ISERROR(SEARCH(' + q(t) + ',' + tl + ')))'], ncontains: ['notContainsText', 'notContains', 'ISERROR(SEARCH(' + q(t) + ',' + tl + '))'], begins: ['beginsWith', 'beginsWith', 'LEFT(' + tl + ',LEN(' + q(t) + '))=' + q(t)], ends: ['endsWith', 'endsWith', 'RIGHT(' + tl + ',LEN(' + q(t) + '))=' + q(t)] }[rule.op || 'contains'];
            cf = '<cfRule type="' + map[0] + '"' + d() + p + ' operator="' + map[1] + '" text="' + xe(t) + '"><formula>' + xe(map[2]) + '</formula></cfRule>';
            break;
          }
          case 'dup': cf = '<cfRule type="duplicateValues"' + d() + p + '/>'; break;
          case 'unique': cf = '<cfRule type="uniqueValues"' + d() + p + '/>'; break;
          case 'top': case 'bottom': cf = '<cfRule type="top10"' + d() + p + ' rank="' + (rule.n || 10) + '"' + (rule.pct ? ' percent="1"' : '') + (rule.type === 'bottom' ? ' bottom="1"' : '') + '/>'; break;
          case 'above': cf = '<cfRule type="aboveAverage"' + d() + p + '/>'; break;
          case 'below': cf = '<cfRule type="aboveAverage"' + d() + p + ' aboveAverage="0"/>'; break;
          case 'blank': cf = '<cfRule type="containsBlanks"' + d() + p + '><formula>LEN(TRIM(' + tl + '))=0</formula></cfRule>'; break;
          case 'nblank': cf = '<cfRule type="notContainsBlanks"' + d() + p + '><formula>LEN(TRIM(' + tl + '))&gt;0</formula></cfRule>'; break;
          case 'error': cf = '<cfRule type="containsErrors"' + d() + p + '><formula>ISERROR(' + tl + ')</formula></cfRule>'; break;
          case 'formula': cf = '<cfRule type="expression"' + d() + p + '><formula>' + xe(exportFormula(HC.canonicalizeFormula(String(rule.formula || '').replace(/^=/, '')), wb)) + '</formula></cfRule>'; break;
          case 'scale': { const cs = rule.colors || ['#f8696b', '#ffeb84', '#63be7b']; cf = '<cfRule type="colorScale"' + p + '><colorScale><cfvo type="min"/>' + (cs.length === 3 ? '<cfvo type="percentile" val="50"/>' : '') + '<cfvo type="max"/>' + cs.map((c) => '<color rgb="' + argb(c) + '"/>').join('') + '</colorScale></cfRule>'; break; }
          case 'bar': cf = '<cfRule type="dataBar"' + p + '><dataBar><cfvo type="min"/><cfvo type="max"/><color rgb="' + argb(rule.color || '#5b9bd5') + '"/></dataBar></cfRule>'; break;
        }
        if (cf) { xml += '<conditionalFormatting sqref="' + sq + '">' + cf + '</conditionalFormatting>'; prio++; }
      }
      // validación de datos
      if (sh.validations.length) {
        const T = { list: 'list', whole: 'whole', decimal: 'decimal', date: 'date', textlen: 'textLength' };
        xml += '<dataValidations count="' + sh.validations.length + '">' + sh.validations.map((v) => {
          let f1 = '', f2 = '';
          if (v.type === 'list') { const s = String(v.source || ''); f1 = s[0] === '=' ? exportFormula(HC.canonicalizeFormula(s.slice(1)), wb) : '"' + s.split(/[;,]/).map((x) => x.trim()).filter(Boolean).join(',').replace(/"/g, '""') + '"'; }
          else { f1 = String(v.v1 == null ? '' : v.v1); f2 = v.op === 'between' || v.op === 'nbetween' ? String(v.v2 == null ? '' : v.v2) : ''; }
          return '<dataValidation type="' + T[v.type] + '"' + (v.type !== 'list' ? ' operator="' + (CF_OPS[v.op] || 'between') + '"' : '') + ' allowBlank="1" showInputMessage="1" showErrorMessage="1"' + (v.msg ? ' error="' + xe(v.msg) + '"' : '') + ' sqref="' + v.ranges.map((g) => HC.rangeAddr(g)).join(' ') + '"><formula1>' + xe(f1) + '</formula1>' + (f2 ? '<formula2>' + xe(f2) + '</formula2>' : '') + '</dataValidation>';
        }).join('') + '</dataValidations>';
      }
      xml += '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>';
      // gráficas
      const anchors = [], drRels = [];
      for (const ch of sh.charts) {
        const data = HC.charts.extract(wb, sh, ch);
        if (data.error) continue;
        chartN++;
        files.push({ name: 'xl/charts/chart' + chartN + '.xml', data: chartXml(ch, data) });
        ctypes.push('<Override PartName="/xl/charts/chart' + chartN + '.xml" ContentType="' + CT + 'drawingml.chart+xml"/>');
        drRels.push('<Relationship Id="rId' + (drRels.length + 1) + '" Type="' + REL + 'chart" Target="../charts/chart' + chartN + '.xml"/>');
        anchors.push(anchorXml(sh, ch, 'rId' + drRels.length, drRels.length));
      }
      if (anchors.length) {
        drawingN++;
        files.push({ name: 'xl/drawings/drawing' + drawingN + '.xml', data: XHDR + '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="' + NS_R + '">' + anchors.join('') + '</xdr:wsDr>' });
        files.push({ name: 'xl/drawings/_rels/drawing' + drawingN + '.xml.rels', data: XHDR + '<Relationships xmlns="' + NS_PKG + '">' + drRels.join('') + '</Relationships>' });
        ctypes.push('<Override PartName="/xl/drawings/drawing' + drawingN + '.xml" ContentType="' + CT + 'drawing+xml"/>');
        rels.push('<Relationship Id="rId' + (rels.length + 1) + '" Type="' + REL + 'drawing" Target="../drawings/drawing' + drawingN + '.xml"/>');
        xml += '<drawing r:id="rId' + rels.length + '"/>';
      }
      // notas
      const notes = [];
      sh.rows.forEach((row, r) => row && row.forEach((cell, c) => { if (cell && cell.note) notes.push({ r, c, t: cell.note }); }));
      if (notes.length) {
        files.push({ name: 'xl/comments' + n + '.xml', data: XHDR + '<comments xmlns="' + NS_MAIN + '"><authors><author>Autor</author></authors><commentList>' + notes.map((x) => '<comment ref="' + HC.addr(x.r, x.c) + '" authorId="0"><text>' + tx(x.t) + '</text></comment>').join('') + '</commentList></comments>' });
        const shapes = notes.map((x, i) => '<v:shape id="_x0000_s' + (1024 * n + i + 1) + '" type="#_x0000_t202" style="position:absolute;margin-left:80pt;margin-top:2pt;width:120pt;height:60pt;z-index:' + (i + 1) + ';visibility:hidden" fillcolor="#ffffe1" o:insetmode="auto"><v:fill color2="#ffffe1"/><v:shadow on="t" color="black" obscured="t"/><v:path o:connecttype="none"/><v:textbox style="mso-direction-alt:auto"><div style="text-align:left"></div></v:textbox><x:ClientData ObjectType="Note"><x:MoveWithCells/><x:SizeWithCells/><x:AutoFill>False</x:AutoFill><x:Row>' + x.r + '</x:Row><x:Column>' + x.c + '</x:Column></x:ClientData></v:shape>').join('');
        files.push({ name: 'xl/drawings/vmlDrawing' + n + '.vml', data: '<xml xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><o:shapelayout v:ext="edit"><o:idmap v:ext="edit" data="' + n + '"/></o:shapelayout><v:shapetype id="_x0000_t202" coordsize="21600,21600" o:spt="202" path="m,l,21600r21600,l21600,xe"><v:stroke joinstyle="miter"/><v:path gradientshapeok="t" o:connecttype="rect"/></v:shapetype>' + shapes + '</xml>' });
        ctypes.push('<Override PartName="/xl/comments' + n + '.xml" ContentType="' + CT + 'spreadsheetml.comments+xml"/>');
        rels.push('<Relationship Id="rId' + (rels.length + 1) + '" Type="' + REL + 'comments" Target="../comments' + n + '.xml"/>');
        rels.push('<Relationship Id="rId' + (rels.length + 1) + '" Type="' + REL + 'vmlDrawing" Target="../drawings/vmlDrawing' + n + '.vml"/>');
        xml += '<legacyDrawing r:id="rId' + rels.length + '"/>';
      }
      xml += '</worksheet>';
      files.push({ name: 'xl/worksheets/sheet' + n + '.xml', data: xml });
      if (rels.length) files.push({ name: 'xl/worksheets/_rels/sheet' + n + '.xml.rels', data: XHDR + '<Relationships xmlns="' + NS_PKG + '">' + rels.join('') + '</Relationships>' });
      ctypes.push('<Override PartName="/xl/worksheets/sheet' + n + '.xml" ContentType="' + CT + 'spreadsheetml.worksheet+xml"/>');
      wbRels.push('<Relationship Id="rId' + n + '" Type="' + REL + 'worksheet" Target="worksheets/sheet' + n + '.xml"/>');
    });
    const N = wb.sheets.length;
    const names = Array.from(wb.names.values()).map((d) => '<definedName name="' + xe(d.name) + '">' + xe(exportFormula(d.f, wb)) + '</definedName>');
    files.push({ name: 'xl/workbook.xml', data: XHDR + '<workbook xmlns="' + NS_MAIN + '" xmlns:r="' + NS_R + '"><workbookPr/><bookViews><workbookView activeTab="' + wb.active + '"/></bookViews><sheets>' + wb.sheets.map((sh, i) => '<sheet name="' + xe(sh.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets>' + (names.length ? '<definedNames>' + names.join('') + '</definedNames>' : '') + '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>' });
    wbRels.push('<Relationship Id="rId' + (N + 1) + '" Type="' + REL + 'styles" Target="styles.xml"/>');
    wbRels.push('<Relationship Id="rId' + (N + 2) + '" Type="' + REL + 'sharedStrings" Target="sharedStrings.xml"/>');
    if (anySpill) {
      wbRels.push('<Relationship Id="rId' + (N + 3) + '" Type="' + REL + 'sheetMetadata" Target="metadata.xml"/>');
      files.push({ name: 'xl/metadata.xml', data: XHDR + '<metadata xmlns="' + NS_MAIN + '" xmlns:xda="http://schemas.microsoft.com/office/spreadsheetml/2017/dynamicarray"><metadataTypes count="1"><metadataType name="XLDAPR" minSupportedVersion="120000" copy="1" pasteAll="1" pasteValues="1" merge="1" splitFirst="1" rowColShift="1" clearFormats="1" clearComments="1" assign="1" coerce="1" cellMeta="1"/></metadataTypes><futureMetadata name="XLDAPR" count="1"><bk><extLst><ext uri="{bdbb8cdc-fa1e-496e-a857-3c3f30c029c3}"><xda:dynamicArrayProperties fDynamic="1" fCollapsed="0"/></ext></extLst></bk></futureMetadata><cellMetadata count="1"><bk><rc t="1" v="0"/></bk></cellMetadata></metadata>' });
      ctypes.push('<Override PartName="/xl/metadata.xml" ContentType="' + CT + 'spreadsheetml.sheetMetadata+xml"/>');
    }
    files.push({ name: 'xl/_rels/workbook.xml.rels', data: XHDR + '<Relationships xmlns="' + NS_PKG + '">' + wbRels.join('') + '</Relationships>' });
    files.push({ name: 'xl/styles.xml', data: st.xml() });
    files.push({ name: 'xl/sharedStrings.xml', data: XHDR + '<sst xmlns="' + NS_MAIN + '" count="' + ss.length + '" uniqueCount="' + ss.length + '">' + ss.map((s) => '<si>' + tx(s) + '</si>').join('') + '</sst>' });
    const iso = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    files.push({ name: 'docProps/core.xml', data: XHDR + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>' + xe(wb.title) + '</dc:title><dcterms:created xsi:type="dcterms:W3CDTF">' + iso + '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' + iso + '</dcterms:modified></cp:coreProperties>' });
    files.push({ name: 'docProps/app.xml', data: XHDR + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Microsoft Excel</Application></Properties>' });
    files.push({ name: '_rels/.rels', data: XHDR + '<Relationships xmlns="' + NS_PKG + '"><Relationship Id="rId1" Type="' + REL + 'officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="' + REL + 'extended-properties" Target="docProps/app.xml"/></Relationships>' });
    files.unshift({ name: '[Content_Types].xml', data: XHDR + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="vml" ContentType="' + CT + 'vmlDrawing"/><Override PartName="/xl/workbook.xml" ContentType="' + CT + 'spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="' + CT + 'spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="' + CT + 'spreadsheetml.sharedStrings+xml"/>' + ctypes.join('') + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="' + CT + 'extended-properties+xml"/></Types>' });
    return zip(files);
  }

  // ---------------------------------------------------------------- lectura: utilidades
  const parseXml = (s) => {
    const d = new DOMParser().parseFromString(s, 'application/xml');
    if (d.getElementsByTagName('parsererror').length) throw new Error('El archivo tiene una parte XML dañada.');
    return d;
  };
  const kids = (el, name) => (el ? Array.from(el.children).filter((c) => c.localName === name) : []);
  const kid = (el, name) => (el ? Array.from(el.children).find((c) => c.localName === name) || null : null);
  const all = (el, name) => (el ? Array.from(el.getElementsByTagNameNS('*', name)) : []);
  const one = (el, name) => (el ? el.getElementsByTagNameNS('*', name)[0] || null : null);
  const attr = (el, name) => (el ? el.getAttribute(name) : null);
  const rid = (el) => (el ? el.getAttributeNS(NS_R, 'id') || el.getAttribute('r:id') : null);
  function resolvePath(base, target) {
    if (!target) return null;
    if (target[0] === '/') return target.slice(1);
    const parts = base.split('/');
    parts.pop();
    for (const seg of target.split('/')) { if (seg === '..') parts.pop(); else if (seg !== '.') parts.push(seg); }
    return parts.join('/');
  }
  async function relsOf(z, part) {
    const p = part.split('/'), file = p.pop(), path = p.concat(['_rels', file + '.rels']).join('/');
    const t = await z.text(path), map = {};
    if (!t) return map;
    for (const r of all(parseXml(t), 'Relationship')) map[attr(r, 'Id')] = { type: (attr(r, 'Type') || '').split('/').pop(), target: attr(r, 'TargetMode') === 'External' ? attr(r, 'Target') : resolvePath(part, attr(r, 'Target')), external: attr(r, 'TargetMode') === 'External' };
    return map;
  }
  const BUILTIN_FMT = { 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 5: '"$"#,##0_);("$"#,##0)', 6: '"$"#,##0_);[Red]("$"#,##0)', 7: '"$"#,##0.00_);("$"#,##0.00)', 8: '"$"#,##0.00_);[Red]("$"#,##0.00)', 9: '0%', 10: '0.00%', 11: '0.00E+00', 12: '# ?/?', 13: '# ??/??', 14: 'dd/mm/yyyy', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy', 18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM', 20: 'h:mm', 21: 'h:mm:ss', 22: 'dd/mm/yyyy h:mm', 37: '#,##0 ;(#,##0)', 38: '#,##0 ;[Red](#,##0)', 39: '#,##0.00;(#,##0.00)', 40: '#,##0.00;[Red](#,##0.00)', 45: 'mm:ss', 46: '[h]:mm:ss', 47: 'mm:ss.0', 48: '##0.0E+0', 49: '@' };
  const INDEXED = ['000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF', '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF', '800000', '008000', '000080', '808000', '800080', '008080', 'C0C0C0', '808080', '9999FF', '993366', 'FFFFCC', 'CCFFFF', '660066', 'FF8080', '0066CC', 'CCCCFF', '000080', 'FF00FF', 'FFFF00', '00FFFF', '800080', '800000', '008080', '0000FF', '00CCFF', 'CCFFFF', 'CCFFCC', 'FFFF99', '99CCFF', 'FF99CC', 'CC99FF', 'FFCC99', '3366FF', '33CCCC', '99CC00', 'FFCC00', 'FF9900', 'FF6600', '666699', '969696', '003366', '339966', '003300', '333300', '993300', '993366', '333399', '333333'];
  const DEF_THEME = ['FFFFFF', '000000', 'E7E6E6', '44546A', '4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47', '0563C1', '954F72'];
  function applyTint(hex, tint) {
    if (!tint) return hex;
    let [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.substr(i, 2), 16) / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    let hh = 0, s = 0, l = (mx + mn) / 2;
    if (mx !== mn) {
      const d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      hh /= 6;
    }
    l = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint;
    const f = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    if (s === 0) r = g = b = l; else { const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; r = f(p, q, hh + 1 / 3); g = f(p, q, hh); b = f(p, q, hh - 1 / 3); }
    return [r, g, b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
  }

  // ---------------------------------------------------------------- lectura: libro
  async function read(buf) {
    const z = unzip(buf);
    const wbPath = 'xl/workbook.xml';
    const wbText = await z.text(wbPath);
    if (!wbText) throw new Error('No se encontró el libro dentro del archivo.');
    const wdoc = parseXml(wbText), wrels = await relsOf(z, wbPath);
    // tema
    let theme = DEF_THEME.slice();
    const themeRel = Object.values(wrels).find((r) => r.type === 'theme');
    if (themeRel) {
      const tt = await z.text(themeRel.target);
      if (tt) {
        const scheme = one(parseXml(tt), 'clrScheme');
        const pick = (n) => { const el = kid(scheme, n), c = el && el.firstElementChild; return c ? attr(c, 'val') && c.localName === 'srgbClr' ? attr(c, 'val') : attr(c, 'lastClr') || null : null; };
        if (scheme) { const order = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink']; theme = order.map((n, i) => pick(n) || DEF_THEME[i]); }
      }
    }
    const colorOf = (el) => {
      if (!el || attr(el, 'auto') === '1') return null;
      let hex = null;
      if (attr(el, 'rgb')) hex = attr(el, 'rgb').slice(-6);
      else if (attr(el, 'theme') != null) hex = theme[+attr(el, 'theme')] || null;
      else if (attr(el, 'indexed') != null) { const i = +attr(el, 'indexed'); hex = i < INDEXED.length ? INDEXED[i] : null; }
      if (!hex) return null;
      return '#' + applyTint(hex.toUpperCase(), parseFloat(attr(el, 'tint') || 0)).toLowerCase();
    };
    // cadenas compartidas
    const strings = [];
    const ssRel = Object.values(wrels).find((r) => r.type === 'sharedStrings');
    const ssText = ssRel ? await z.text(ssRel.target) : await z.text('xl/sharedStrings.xml');
    if (ssText) for (const si of kids(parseXml(ssText).documentElement, 'si')) strings.push(all(si, 't').filter((t) => t.parentNode.localName !== 'rPh').map((t) => t.textContent).join(''));
    // estilos
    const styles = [], xfStyle = [], dxfs = [];
    const stRel = Object.values(wrels).find((r) => r.type === 'styles');
    const stText = stRel ? await z.text(stRel.target) : await z.text('xl/styles.xml');
    const BMAP = { thin: 'thin', hair: 'thin', medium: 'medium', thick: 'thick', dashed: 'dashed', mediumDashed: 'dashed', dashDot: 'dashed', mediumDashDot: 'dashed', dashDotDot: 'dotted', mediumDashDotDot: 'dashed', slantDashDot: 'dashed', dotted: 'dotted', double: 'double' };
    const fontOf = (f) => {
      if (!f) return {};
      const o = {}, flag = (n) => { const e = kid(f, n); return !!e && attr(e, 'val') !== '0' && attr(e, 'val') !== 'false' && attr(e, 'val') !== 'none'; };
      if (flag('b')) o.b = true; if (flag('i')) o.i = true; if (flag('u')) o.u = true; if (flag('strike')) o.st = true;
      const sz = kid(f, 'sz'), nm = kid(f, 'name'), co = colorOf(kid(f, 'color'));
      if (sz && +attr(sz, 'val') && +attr(sz, 'val') !== 11) o.fs = +attr(sz, 'val');
      if (nm && attr(nm, 'val') && attr(nm, 'val') !== 'Calibri') o.ff = attr(nm, 'val');
      if (co && co !== '#000000') o.fc = co;
      return o;
    };
    if (stText) {
      const sdoc = parseXml(stText).documentElement;
      const fmts = Object.assign({}, BUILTIN_FMT);
      for (const nf of all(sdoc, 'numFmt')) fmts[attr(nf, 'numFmtId')] = attr(nf, 'formatCode');
      const fonts = kids(kid(sdoc, 'fonts'), 'font').map(fontOf);
      const fills = kids(kid(sdoc, 'fills'), 'fill').map((f) => { const p = kid(f, 'patternFill'); return p && attr(p, 'patternType') === 'solid' ? colorOf(kid(p, 'fgColor')) || colorOf(kid(p, 'bgColor')) : null; });
      const borders = kids(kid(sdoc, 'borders'), 'border').map((b) => {
        const o = {};
        for (const [tag, key] of [['left', 'bl'], ['right', 'br'], ['top', 'bt'], ['bottom', 'bb']]) { const e = kid(b, tag), s = e && attr(e, 'style'); if (s && BMAP[s]) o[key] = BMAP[s] + ' ' + (colorOf(kid(e, 'color')) || '#000000'); }
        return o;
      });
      const H = { left: 'l', center: 'c', right: 'r', centerContinuous: 'c', justify: 'l', distributed: 'c', fill: 'l' }, Vv = { top: 't', center: 'm', distributed: 'm', justify: 'm' };
      for (const x of kids(kid(sdoc, 'cellXfs'), 'xf')) {
        const s = Object.assign({}, fonts[+attr(x, 'fontId') || 0] || {}, borders[+attr(x, 'borderId') || 0] || {});
        const bg = fills[+attr(x, 'fillId') || 0]; if (bg) s.bg = bg;
        const code = fmts[attr(x, 'numFmtId') || 0]; if (code && !/^general$/i.test(code)) s.nf = code;
        const al = kid(x, 'alignment');
        if (al) { if (H[attr(al, 'horizontal')]) s.ha = H[attr(al, 'horizontal')]; if (Vv[attr(al, 'vertical')]) s.va = Vv[attr(al, 'vertical')]; if (attr(al, 'wrapText') === '1' || attr(al, 'wrapText') === 'true') s.wrap = true; if (+attr(al, 'indent')) s.ind = +attr(al, 'indent'); }
        if (Object.keys(s).length) { styles.push(s); xfStyle.push(styles.length); } else xfStyle.push(0);
      }
      for (const d of kids(kid(sdoc, 'dxfs'), 'dxf')) {
        const s = fontOf(kid(d, 'font')), p = kid(kid(d, 'fill'), 'patternFill');
        if (p) { const c = colorOf(kid(p, 'bgColor')) || colorOf(kid(p, 'fgColor')); if (c) s.bg = c; }
        dxfs.push(s);
      }
    }
    // nombres
    const nameSet = new Set();
    const definedNames = [];
    for (const dn of all(wdoc, 'definedName')) {
      const nm = attr(dn, 'name');
      if (!nm || /^_xlnm\./i.test(nm) || attr(dn, 'hidden') === '1') continue;
      definedNames.push({ name: nm, f: importFormula(dn.textContent) });
      nameSet.add(nm.toUpperCase());
    }
    const sheetEls = all(wdoc, 'sheet');
    const sheetNames = sheetEls.map((s) => attr(s, 'name'));
    const out = { title: '', sheets: [], styles, names: [], active: 0 };
    const view = one(wdoc, 'workbookView');
    out.active = view ? +attr(view, 'activeTab') || 0 : 0;
    let skippedCharts = 0, lostFormulas = 0;
    const okFormula = (f) => {
      const p = HC.parseFormula(f);
      if (p.err) return false;
      return HC.analyze(p.ast).names.every((n) => nameSet.has(n.toUpperCase()));
    };
    for (let si = 0; si < sheetEls.length; si++) {
      const sEl = sheetEls[si], rel = wrels[rid(sEl)];
      const path = rel ? rel.target : 'xl/worksheets/sheet' + (si + 1) + '.xml';
      const text = await z.text(path);
      const S = { name: attr(sEl, 'name') || 'Hoja' + (si + 1), cells: [], rowH: { sizes: [], hidden: [] }, colW: { sizes: [], hidden: [] }, rowStyle: [], colStyle: [], merges: [], frozenRows: 0, frozenCols: 0, showGrid: true, tabColor: null, filter: null, condFmts: [], validations: [], charts: [] };
      out.sheets.push(S);
      if (!text) continue;
      const doc = parseXml(text).documentElement, srels = await relsOf(z, path);
      // vista y propiedades
      const tab = one(kid(doc, 'sheetPr'), 'tabColor'); if (tab) S.tabColor = colorOf(tab);
      const sv = one(doc, 'sheetView');
      if (sv && attr(sv, 'showGridLines') === '0') S.showGrid = false;
      const pane = sv && kid(sv, 'pane');
      if (pane && (attr(pane, 'state') === 'frozen' || attr(pane, 'state') === 'frozenSplit')) { S.frozenRows = Math.min(200, Math.round(+attr(pane, 'ySplit') || 0)); S.frozenCols = Math.min(50, Math.round(+attr(pane, 'xSplit') || 0)); }
      const fmtPr = kid(doc, 'sheetFormatPr');
      const defColPx = fmtPr && attr(fmtPr, 'defaultColWidth') ? Math.trunc(((256 * +attr(fmtPr, 'defaultColWidth') + 18) / 256) * 7) : fmtPr && attr(fmtPr, 'baseColWidth') ? (+attr(fmtPr, 'baseColWidth')) * 7 + 5 + 4 : 64;
      const defRowPx = fmtPr && attr(fmtPr, 'defaultRowHeight') ? Math.round(+attr(fmtPr, 'defaultRowHeight') * 4 / 3) : HC.DEF_ROW_H;
      // columnas
      const colSizes = new Map();
      for (const col of all(kid(doc, 'cols'), 'col')) {
        const a = +attr(col, 'min') - 1, b = Math.min(+attr(col, 'max') - 1, MAXC - 1), w = attr(col, 'width');
        const px = w != null ? Math.trunc(((256 * +w + 18) / 256) * 7) : defColPx, hidden = attr(col, 'hidden') === '1', s = +attr(col, 'style') || 0;
        if (a === 0 && b >= MAXC - 1 && xfStyle[s]) S.defStyle = xfStyle[s];
        for (let c = a; c <= Math.min(b, a + 1023); c++) { colSizes.set(c, px); if (hidden) S.colW.hidden.push(c); if (xfStyle[s] && !(a === 0 && b >= MAXC - 1)) S.colStyle.push([c, xfStyle[s]]); }
      }
      // celdas
      const shared = {}, arrays = [], maxCol = { v: 0 };
      let lastR = -1;
      for (const row of kids(kid(doc, 'sheetData'), 'row')) {
        const r = attr(row, 'r') ? +attr(row, 'r') - 1 : lastR + 1;
        lastR = r;
        if (r >= MAXR) continue;
        if (attr(row, 'ht') && attr(row, 'customHeight') === '1') S.rowH.sizes.push([r, Math.round(+attr(row, 'ht') * 4 / 3)]);
        else if (attr(row, 'ht') && Math.abs(+attr(row, 'ht') * 4 / 3 - defRowPx) > 1) S.rowH.sizes.push([r, Math.round(+attr(row, 'ht') * 4 / 3)]);
        if (attr(row, 'hidden') === '1') S.rowH.hidden.push(r);
        if (attr(row, 'customFormat') === '1' && xfStyle[+attr(row, 's') || 0]) S.rowStyle.push([r, xfStyle[+attr(row, 's')]]);
        let lastC = -1;
        for (const c of kids(row, 'c')) {
          let rr = r, cc = lastC + 1;
          const a1 = attr(c, 'r');
          if (a1) { const g = HC.parseA1(a1); if (g) { rr = g.r1; cc = g.c1; } }
          lastC = cc;
          if (cc >= MAXC) continue;
          if (cc > maxCol.v) maxCol.v = cc;
          const t = attr(c, 't') || 'n', s = xfStyle[+attr(c, 's') || 0] || 0, vEl = kid(c, 'v'), fEl = kid(c, 'f');
          let v = null;
          const raw = vEl ? vEl.textContent : null;
          if (t === 's') v = raw != null ? strings[+raw] : null;
          else if (t === 'inlineStr') v = all(kid(c, 'is'), 't').map((x) => x.textContent).join('');
          else if (t === 'str') v = raw;
          else if (t === 'b') v = raw === '1' || raw === 'true';
          else if (t === 'e') v = raw ? { e: (HC.errByCode(raw) || HC.E.VALUE).code } : null;
          else if (t === 'd') { const d = raw ? new Date(raw) : null; v = d && !isNaN(d) ? HC.date.fromYMD(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()) + (d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds()) / 86400 : raw; }
          else if (raw != null && raw !== '') v = +raw;
          let f = null;
          if (fEl) {
            const ft = attr(fEl, 't'), body = fEl.textContent;
            if (ft === 'shared') {
              const k = attr(fEl, 'si');
              if (body) shared[k] = { f: importFormula(body), r: rr, c: cc };
              f = shared[k] ? (body ? shared[k].f : HC.shiftFormula(shared[k].f, rr - shared[k].r, cc - shared[k].c)) : null;
            } else if (body) f = importFormula(body);
            if (ft === 'array' && attr(fEl, 'ref')) { const g = HC.parseA1(attr(fEl, 'ref')); if (g) arrays.push(g); }
            if (f != null && !okFormula(f)) { f = null; lostFormulas++; }
          }
          if (f != null) S.cells.push([rr, cc, null, f, s]);
          else if (v != null || s) S.cells.push([rr, cc, v, 0, s]);
        }
      }
      // las celdas que ocupa una matriz se rellenan al recalcular: se quitan sus valores guardados
      if (arrays.length) S.cells = S.cells.filter((x) => !arrays.some((g) => HC.inRange(g, x[0], x[1]) && !(x[0] === g.r1 && x[1] === g.c1) && !x[3]) || x[4]);
      for (const x of S.cells) if (x[3] === 0 && x[4] && arrays.some((g) => HC.inRange(g, x[0], x[1]) && !(x[0] === g.r1 && x[1] === g.c1))) x[2] = null;
      // anchos: los predeterminados del archivo se aplican de forma explícita
      if (defColPx !== HC.DEF_COL_W) for (let c = 0; c <= Math.max(maxCol.v, 25); c++) if (!colSizes.has(c)) colSizes.set(c, defColPx);
      S.colW.sizes = Array.from(colSizes);
      if (defRowPx !== HC.DEF_ROW_H) { const have = new Set(S.rowH.sizes.map((x) => x[0])); for (let r = 0; r <= lastR; r++) if (!have.has(r)) S.rowH.sizes.push([r, defRowPx]); }
      // combinaciones
      for (const m of all(kid(doc, 'mergeCells'), 'mergeCell')) { const g = HC.parseA1(attr(m, 'ref')); if (g) S.merges.push(g); }
      // filtro
      const af = kid(doc, 'autoFilter');
      const filterRange = af && HC.parseA1(attr(af, 'ref') || '');
      if (filterRange) {
        const cols = {};
        for (const column of kids(af, 'filterColumn')) {
          const offset = Number(attr(column, 'colId')), spec = readFilterSpec(column);
          if (spec && Number.isInteger(offset) && offset >= 0 && filterRange.c1 + offset <= filterRange.c2) cols[offset] = spec;
        }
        S.filter = { range: filterRange, cols, autoExpand: false };
        S.restoreFilterRows = Object.keys(cols).length > 0;
      }
      // validación de datos
      const VT = { list: 'list', whole: 'whole', decimal: 'decimal', date: 'date', textLength: 'textlen' }, VO = { between: 'between', notBetween: 'nbetween', equal: 'eq', notEqual: 'neq', greaterThan: 'gt', greaterThanOrEqual: 'gte', lessThan: 'lt', lessThanOrEqual: 'lte' };
      for (const dv of all(doc, 'dataValidation')) {
        const type = VT[attr(dv, 'type')];
        if (!type) continue;
        const ranges = (attr(dv, 'sqref') || '').split(/\s+/).map((x) => HC.parseA1(x)).filter(Boolean);
        if (!ranges.length) continue;
        // Excel 365 envuelve la lista en mc:AlternateContent (x12ac:list con formula1 de respaldo)
        const f1 = (one(dv, 'formula1') || one(dv, 'list') || {}).textContent || '', f2 = (one(dv, 'formula2') || {}).textContent || '';
        const rule = { ranges, type };
        if (attr(dv, 'error')) rule.msg = attr(dv, 'error');
        if (type === 'list') rule.source = /^".*"$/.test(f1) ? f1.slice(1, -1).replace(/""/g, '"') : '=' + importFormula(f1);
        else { rule.op = VO[attr(dv, 'operator') || 'between'] || 'between'; rule.v1 = HC.textToNumber(f1); rule.v2 = HC.textToNumber(f2); if (rule.v1 == null) continue; }
        S.validations.push(rule);
      }
      // formato condicional
      const cfs = [];
      for (const cf of all(doc, 'conditionalFormatting')) {
        const ranges = (attr(cf, 'sqref') || '').split(/\s+/).map((x) => HC.parseA1(x)).filter(Boolean);
        if (!ranges.length) continue;
        for (const rl of kids(cf, 'cfRule')) {
          const type = attr(rl, 'type'), style = dxfs[+attr(rl, 'dxfId')] || {}, fs = kids(rl, 'formula').map((x) => x.textContent);
          const r = { ranges, style };
          const valOf = (f) => (f == null ? '' : /^-?[\d.]+(E[+-]?\d+)?$/i.test(f) ? f : /^".*"$/.test(f) ? f.slice(1, -1).replace(/""/g, '"') : '=' + importFormula(f));
          if (type === 'cellIs') { const op = { greaterThan: 'gt', greaterThanOrEqual: 'gte', lessThan: 'lt', lessThanOrEqual: 'lte', equal: 'eq', notEqual: 'neq', between: 'between', notBetween: 'nbetween' }[attr(rl, 'operator')]; if (!op) continue; Object.assign(r, { type: 'cell', op, v1: valOf(fs[0]), v2: valOf(fs[1]) }); }
          else if (type === 'containsText' || type === 'notContainsText' || type === 'beginsWith' || type === 'endsWith') Object.assign(r, { type: 'text', op: { containsText: 'contains', notContainsText: 'ncontains', beginsWith: 'begins', endsWith: 'ends' }[type], v1: attr(rl, 'text') || '' });
          else if (type === 'duplicateValues') r.type = 'dup';
          else if (type === 'uniqueValues') r.type = 'unique';
          else if (type === 'top10') Object.assign(r, { type: attr(rl, 'bottom') === '1' ? 'bottom' : 'top', n: +attr(rl, 'rank') || 10, pct: attr(rl, 'percent') === '1' });
          else if (type === 'aboveAverage') r.type = attr(rl, 'aboveAverage') === '0' ? 'below' : 'above';
          else if (type === 'containsBlanks') r.type = 'blank';
          else if (type === 'notContainsBlanks') r.type = 'nblank';
          else if (type === 'containsErrors') r.type = 'error';
          else if (type === 'expression') { const f = importFormula(fs[0] || ''); if (!okFormula(f)) continue; Object.assign(r, { type: 'formula', formula: '=' + HC.localizeFormula(f) }); }
          else if (type === 'colorScale') { const cs = all(rl, 'color').map(colorOf).filter(Boolean); if (cs.length < 2) continue; Object.assign(r, { type: 'scale', colors: cs.slice(0, 3) }); delete r.style; }
          else if (type === 'dataBar') { Object.assign(r, { type: 'bar', color: colorOf(one(rl, 'color')) || '#5b9bd5' }); delete r.style; }
          else continue;
          cfs.push([+attr(rl, 'priority') || 999, r]);
        }
      }
      S.condFmts = cfs.sort((a, b) => a[0] - b[0]).map((x) => x[1]);
      // vínculos
      for (const hl of all(kid(doc, 'hyperlinks'), 'hyperlink')) {
        const g = HC.parseA1(attr(hl, 'ref') || '');
        if (!g) continue;
        const rr = srels[rid(hl)], url = rr && rr.external ? rr.target : attr(hl, 'location') ? '#' + attr(hl, 'location') : null;
        if (!url) continue;
        const cell = S.cells.find((x) => x[0] === g.r1 && x[1] === g.c1);
        const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
        if (cell && !cell[3]) { const label = cell[2] == null ? url : typeof cell[2] === 'object' ? url : String(cell[2]); cell[3] = 'HYPERLINK(' + q(url) + ',' + q(label) + ')'; cell[2] = null; }
        else if (!cell) S.cells.push([g.r1, g.c1, null, 'HYPERLINK(' + q(url) + ')', 0]);
      }
      // notas
      const cRel = Object.values(srels).find((r) => r.type === 'comments');
      if (cRel) {
        const ct = await z.text(cRel.target);
        if (ct) for (const cm of all(parseXml(ct), 'comment')) {
          const g = HC.parseA1(attr(cm, 'ref') || '');
          if (!g) continue;
          const note = all(cm, 't').map((x) => x.textContent).join('').trim();
          const cell = S.cells.find((x) => x[0] === g.r1 && x[1] === g.c1);
          if (cell) cell[5] = note; else S.cells.push([g.r1, g.c1, null, 0, 0, note]);
        }
      }
      // gráficas
      const dRel = Object.values(srels).find((r) => r.type === 'drawing');
      if (dRel) {
        const dt = await z.text(dRel.target);
        if (dt) {
          const ddoc = parseXml(dt), drels = await relsOf(z, dRel.target);
          const cw = new HC.Axis(HC.DEF_COL_W), rh = new HC.Axis(HC.DEF_ROW_H);
          for (const [c, px] of S.colW.sizes) cw.set(c, px);
          for (const [r, px] of S.rowH.sizes) rh.set(r, px);
          for (const anc of Array.from(ddoc.documentElement.children)) {
            const cRef = one(anc, 'chart');
            if (!cRef) continue;
            const crel = drels[rid(cRef)];
            const ctext = crel ? await z.text(crel.target) : null;
            const pt = (el, ax, isCol) => (el ? ax.pos(+(kid(el, isCol ? 'col' : 'row') || {}).textContent || 0) + (+(kid(el, isCol ? 'colOff' : 'rowOff') || {}).textContent || 0) / EMU : 0);
            const from = kid(anc, 'from'), to = kid(anc, 'to'), ext = kid(anc, 'ext');
            let x = pt(from, cw, true), y = pt(from, rh, false), w = 480, hgt = 300;
            if (to) { w = pt(to, cw, true) - x; hgt = pt(to, rh, false) - y; }
            else if (ext) { w = +attr(ext, 'cx') / EMU; hgt = +attr(ext, 'cy') / EMU; }
            const spec = ctext ? readChart(parseXml(ctext), sheetNames[si]) : null;
            if (!spec) { skippedCharts++; continue; }
            S.charts.push(Object.assign(spec, { id: HC.uid('g'), x: Math.round(x), y: Math.round(y), w: Math.max(180, Math.round(w)), h: Math.max(130, Math.round(hgt)) }));
          }
        }
      }
    }
    out.names = definedNames.filter((d) => !HC.parseFormula(d.f).err);
    out.lostFormulas = lostFormulas;
    out.skippedCharts = skippedCharts;
    return out;
  }

  // Convierte una gráfica de Excel a la descripción propia (tipo, rango y opciones).
  function readChart(doc, homeSheet) {
    const plot = one(doc, 'plotArea');
    if (!plot) return null;
    const groups = Array.from(plot.children).filter((e) => /Chart$/.test(e.localName));
    if (!groups.length) return null;
    const g0 = groups[0], kind = g0.localName;
    let type = null;
    const o = {};
    const grouping = attr(one(g0, 'grouping'), 'val');
    if (grouping === 'stacked') o.stacked = 'stack'; else if (grouping === 'percentStacked') o.stacked = 'percent';
    if (/^bar(3D)?Chart$/.test(kind)) type = attr(one(g0, 'barDir'), 'val') === 'bar' ? 'bar' : 'column';
    else if (/^line(3D)?Chart$/.test(kind) || kind === 'stockChart') type = 'line';
    else if (/^area(3D)?Chart$/.test(kind)) type = 'area';
    else if (/^(pie|pie3D|ofPie)Chart$/.test(kind)) type = 'pie';
    else if (kind === 'doughnutChart') type = 'doughnut';
    else if (kind === 'scatterChart') type = 'scatter';
    else if (kind === 'bubbleChart') type = 'bubble';
    else if (kind === 'radarChart') type = 'radar';
    if (!type) return null;
    const kindsSeen = groups.map((g) => g.localName);
    const isCombo = kindsSeen.some((k) => /^bar/.test(k)) && kindsSeen.some((k) => /^line/.test(k));
    if (isCombo) { type = 'combo'; delete o.stacked; }
    if (!/^(column|bar|line|area)$/.test(type)) delete o.stacked;
    const fOf = (el) => { const f = one(el, 'f'); return f ? f.textContent.trim() : null; };
    const sers = [];
    groups.forEach((g) => kids(g, 'ser').forEach((s) => sers.push({ el: s, line: /^line/.test(g.localName) })));
    if (!sers.length) return null;
    const parse = (f) => { if (!f) return null; const p = HC.parseSheetRange(f.replace(/^\(|\)$/g, '').split(',')[0]); if (!p) return null; if (p.sheet == null) p.sheet = homeSheet; return p; };
    const list = sers.map((s) => ({
      name: parse(fOf(kid(s.el, 'tx'))), val: parse(fOf(kid(s.el, 'val')) || fOf(kid(s.el, 'yVal'))), cat: parse(fOf(kid(s.el, 'cat')) || fOf(kid(s.el, 'xVal'))), size: parse(fOf(kid(s.el, 'bubbleSize'))), line: s.line,
    }));
    if (list.some((s) => !s.val)) return null;
    const v0 = list[0].val, sheet = v0.sheet;
    if (list.some((s) => s.val.sheet !== sheet)) return null;
    const vertical = list.every((s) => s.val.c1 === s.val.c2 && s.val.r1 === v0.r1 && s.val.r2 === v0.r2);
    const horizontal = !vertical && list.every((s) => s.val.r1 === s.val.r2 && s.val.c1 === v0.c1 && s.val.c2 === v0.c2);
    if (!vertical && !horizontal) return null;
    const hasHeader = list.every((s) => s.name && s.name.sheet === sheet && (vertical ? s.name.r1 === v0.r1 - 1 && s.name.c1 === s.val.c1 : s.name.c1 === v0.c1 - 1 && s.name.r1 === s.val.r1));
    const cat = list[0].cat && list[0].cat.sheet === sheet && (vertical ? list[0].cat.c1 === list[0].cat.c2 && list[0].cat.r1 === v0.r1 && list[0].cat.r2 === v0.r2 : list[0].cat.r1 === list[0].cat.r2 && list[0].cat.c1 === v0.c1 && list[0].cat.c2 === v0.c2) ? list[0].cat : null;
    const areas = [];
    const pushArea = (g) => areas.push(HC.quoteSheet(sheet) + '!' + HC.rangeAddr(g, true));
    const ext = (g) => (hasHeader ? (vertical ? { r1: g.r1 - 1, c1: g.c1, r2: g.r2, c2: g.c2 } : { r1: g.r1, c1: g.c1 - 1, r2: g.r2, c2: g.c2 }) : g);
    if (cat) pushArea(ext(cat));
    list.forEach((s) => { pushArea(ext(s.val)); if (type === 'bubble' && s.size) pushArea(ext(s.size)); });
    o.byRow = horizontal;
    o.header = hasHeader;
    o.catCol = !!cat;
    if (type === 'combo') o.kinds = list.map((s) => (s.line ? 'line' : 'col'));
    const leg = one(doc, 'legendPos');
    if (!one(doc, 'legend')) o.legend = 'none'; else if (leg) o.legend = { b: 'bottom', r: 'right', t: 'top', l: 'right', tr: 'right' }[attr(leg, 'val')] || 'bottom';
    const dl = one(g0, 'dLbls');
    if (dl && (attr(one(dl, 'showVal'), 'val') === '1' || attr(one(dl, 'showPercent'), 'val') === '1')) o.labels = true;
    if (type === 'pie' || type === 'doughnut') { if (!dl || attr(one(dl, 'showPercent'), 'val') !== '1') o.labels = false; }
    if (one(g0, 'trendline')) o.trend = true;
    const sm = one(g0, 'smooth');
    if (sm && attr(sm, 'val') === '1') o.smooth = true;
    const chartEl = one(doc, 'chart');
    const titleEl = chartEl ? kid(chartEl, 'title') : null;
    const title = titleEl ? all(titleEl, 't').map((t) => t.textContent).join('') || (one(titleEl, 'v') || {}).textContent || '' : '';
    const axTitle = (tag) => { const ax = one(plot, tag); const t = ax && kid(ax, 'title'); return t ? all(t, 't').map((x) => x.textContent).join('') : null; };
    const xt = axTitle(type === 'scatter' || type === 'bubble' ? 'valAx' : 'catAx'), yt = axTitle('valAx');
    if (xt && type !== 'scatter' && type !== 'bubble') o.xTitle = xt;
    if (yt) o.yTitle = yt;
    return { type, range: areas.join(','), title, opts: o };
  }

  HC.xlsx = { write, read, zip, unzip, exportFormula, importFormula };
})();
