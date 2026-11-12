/* Archivos: libro nuevo, abrir (xlsx, csv, json), descargar, imprimir y libro de ejemplo. */
(function () {
  'use strict';
  const HC = window.HC, ui = HC.ui, h = ui.h;
  const A = () => HC.app;
  const safeName = (s) => (String(s || 'Libro').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Libro').slice(0, 80);

  const files = (HC.files = {
    async newBook() {
      const a = A();
      if (a.wb.modified && !(await ui.confirm('¿Empezar un libro nuevo?\nEl libro actual se quitará de esta pestaña. Si quieres conservarlo, descárgalo antes desde Archivo.', { ok: 'Libro nuevo' }))) return;
      a.setWorkbook(HC.Workbook.blank());
      a.saveNow();
    },
    async open() {
      const file = await ui.pickFile('.xlsx,.xlsm,.csv,.tsv,.txt,.json');
      if (file) await this.openFile(file);
      else A().focusGrid();
    },
    async openFile(file) {
      const a = A(), name = file.name || 'archivo', ext = (/\.([a-z0-9]+)$/i.exec(name) || [])[1] || '';
      try {
        let wb;
        let notes = '';
        if (/^xls[xm]$/i.test(ext)) {
          const data = await HC.xlsx.read(await file.arrayBuffer());
          wb = HC.Workbook.fromJSON(data);
          if (data.lostFormulas) notes += ' ' + data.lostFormulas + ' fórmula(s) usan funciones que esta hoja no tiene: se conservó su último valor.';
          if (data.skippedCharts) notes += ' ' + data.skippedCharts + ' gráfica(s) no se pudieron importar.';
        }
        else if (/^json$/i.test(ext)) wb = HC.Workbook.fromJSON(JSON.parse(await file.text()));
        else if (/^xls$/i.test(ext)) throw new Error('El formato .xls antiguo no es compatible. Guárdalo como .xlsx desde Excel y vuelve a abrirlo.');
        else {
          const buf = await file.arrayBuffer();
          let text = new TextDecoder('utf-8').decode(buf);
          if (text.indexOf('�') >= 0) text = new TextDecoder('windows-1252').decode(buf); // archivos antiguos de Excel
          wb = this.fromMatrix(HC.csv.parse(text, /^tsv$/i.test(ext) ? '\t' : undefined), name.replace(/\.[^.]+$/, ''));
        }
        if (!wb.title || wb.title === 'Libro sin título') wb.title = name.replace(/\.[^.]+$/, '');
        a.setWorkbook(wb);
        a.saveNow();
        ui.toast('Se abrió «' + name + '».' + notes, notes ? 7000 : 3200);
      } catch (e) {
        console.error(e);
        ui.alert('No se pudo abrir «' + name + '».\n' + (e && e.message ? e.message : 'El archivo no tiene un formato reconocido.'), 'Abrir archivo');
      }
    },
    fromMatrix(matrix, sheetName) {
      const wb = HC.Workbook.blank(), sh = wb.sheet;
      if (sheetName) wb.renameSheet(sh, sheetName.slice(0, 31).replace(/[\\/?*\[\]:]/g, ' '));
      wb.begin('Importar');
      matrix.forEach((row, r) => row.forEach((v, c) => {
        if (v === '' || r >= HC.MAX_ROWS || c >= HC.MAX_COLS) return;
        if (v[0] === '=') wb._put(sh, r, c, undefined, v); else wb.setCellInput(sh, r, c, v);
      }));
      wb.commit();
      wb.undoStack.length = 0; wb.redoStack.length = 0; wb.modified = false;
      return wb;
    },
    async saveXlsx() {
      const a = A();
      try { ui.download(await HC.xlsx.write(a.wb), safeName(a.wb.title) + '.xlsx'); a.wb.modified = false; } catch (e) { console.error(e); ui.alert('No se pudo crear el archivo de Excel.\n' + e.message); }
    },
    saveJson() {
      const a = A();
      ui.download(new Blob([JSON.stringify(a.wb.toJSON())], { type: 'application/json' }), safeName(a.wb.title) + '.json');
    },
    exportCsv() {
      const a = A(), sh = a.sheet, u = sh.usedRange();
      if (u.r2 < 0) { ui.toast('La hoja está vacía.'); return; }
      const delim = HC.locale.dec === ',' ? ';' : ',';
      const text = HC.csv.stringify(a.wb.rangeToMatrix(sh, u), delim);
      ui.download(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }), safeName(a.wb.title + ' - ' + sh.name) + '.csv');
    },

    // ------------------------------------------------------------ imprimir
    print() {
      const a = A(), sh = a.sheet, wb = a.wb, u = sh.usedRange(), esc = ui.esc;
      if (u.r2 < 0 && !sh.charts.length) { ui.toast('La hoja está vacía: no hay nada que imprimir.'); return; }
      const r2 = Math.min(u.r2, 4999), c2 = Math.min(u.c2, 199);
      let html = '';
      if (u.r2 >= 0) {
        const covered = new Set(), spans = new Map();
        for (const m of sh.merges) { spans.set(m.r1 + ':' + m.c1, m); for (let r = m.r1; r <= m.r2; r++) for (let c = m.c1; c <= m.c2; c++) if (r !== m.r1 || c !== m.c1) covered.add(r + ':' + c); }
        let tw = 0;
        for (let c = 0; c <= c2; c++) tw += sh.colW.size(c);
        html += '<table style="width:' + tw + 'px"><colgroup>';
        for (let c = 0; c <= c2; c++) html += '<col style="width:' + sh.colW.size(c) + 'px">';
        html += '</colgroup>';
        const bcss = (spec, side) => { const p = spec.split(' '); const w = { thin: '1px solid', medium: '2px solid', thick: '3px solid', dashed: '1px dashed', dotted: '1px dotted', double: '3px double' }[p[0]] || '1px solid'; return 'border-' + side + ':' + w + ' ' + (p[1] || '#000'); };
        for (let r = 0; r <= r2; r++) {
          if (sh.rowH.size(r) === 0) continue;
          html += '<tr style="height:' + sh.rowH.size(r) + 'px">';
          for (let c = 0; c <= c2; c++) {
            if (covered.has(r + ':' + c) || sh.colW.size(c) === 0) continue;
            const cell = sh.get(r, c), st = sh.styleAt(r, c) || {}, cf = sh.condFmts.length ? wb.condStyle(sh, r, c) || {} : {}, m = spans.get(r + ':' + c);
            const v = cell ? cell.v : null, f = v == null ? { text: '' } : HC.fmt.format(v, st.nf);
            const css = [];
            const al = st.ha || (typeof v === 'number' ? 'r' : typeof v === 'string' || v == null ? 'l' : 'c');
            css.push('text-align:' + (al === 'r' ? 'right' : al === 'c' ? 'center' : 'left'), 'vertical-align:' + (st.va === 't' ? 'top' : st.va === 'm' ? 'middle' : 'bottom'));
            if (st.b || cf.b) css.push('font-weight:bold'); if (st.i) css.push('font-style:italic');
            if (st.u || st.st) css.push('text-decoration:' + (st.u ? 'underline ' : '') + (st.st ? 'line-through' : ''));
            if (st.ff) css.push("font-family:'" + st.ff + "'"); if (st.fs) css.push('font-size:' + st.fs + 'pt');
            const color = cf.fc || st.fc || f.color; if (color) css.push('color:' + color);
            const bg = cf.bg || st.bg; if (bg) css.push('background:' + bg);
            css.push(st.wrap ? 'white-space:pre-wrap' : 'white-space:nowrap');
            // como en pantalla: el texto largo invade la celda de la derecha si está vacía
            if (!st.wrap && typeof v === 'string' && c < c2 && !m) { const nx = sh.get(r, c + 1); if (!nx || nx.v == null || nx.v === '') css.push('overflow:visible'); }
            if (st.bt) css.push(bcss(st.bt, 'top')); if (st.bb) css.push(bcss(st.bb, 'bottom')); if (st.bl) css.push(bcss(st.bl, 'left')); if (st.br) css.push(bcss(st.br, 'right'));
            html += '<td' + (m ? ' rowspan="' + (m.r2 - m.r1 + 1) + '" colspan="' + (m.c2 - m.c1 + 1) + '"' : '') + ' style="' + css.join(';') + '">' + esc(f.text) + '</td>';
          }
          html += '</tr>';
        }
        html += '</table>';
      }
      if (HC.charts) for (const svg of HC.charts.svgs(sh)) html += '<div class="chart">' + svg + '</div>';
      const vars = ['--chart-surface:#fff', '--chart-text:#0b0b0b', '--chart-text-2:#52514e', '--chart-muted:#7d7b75', '--chart-grid:#e1e0d9', '--chart-axis:#c3c2b7', '--s1:#2a78d6', '--s2:#eb6834', '--s3:#1baf7a', '--s4:#eda100', '--s5:#e87ba4', '--s6:#008300', '--s7:#6250d6', '--s8:#e34948'].join(';');
      const doc = '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>' + esc(wb.title + ' · ' + sh.name) + '</title><style>:root{' + vars + '}@page{margin:12mm}body{margin:0;font:11pt Calibri,Carlito,Arial,sans-serif;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact}table{border-collapse:collapse;table-layout:fixed}td{padding:1px 3px;overflow:hidden;' + (sh.showGrid ? 'border:1px solid #d4d4d4' : '') + '}.chart{margin:14px 0;break-inside:avoid;font-family:"Segoe UI",Arial,sans-serif}h1{font:600 13pt "Segoe UI",Arial,sans-serif;margin:0 0 8px}</style></head><body><h1>' + esc(wb.title + ' · ' + sh.name) + '</h1>' + html + '</body></html>';
      const frame = h('iframe', { style: { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' }, 'aria-hidden': 'true' });
      document.body.appendChild(frame);
      frame.contentDocument.open(); frame.contentDocument.write(doc); frame.contentDocument.close();
      setTimeout(() => { try { frame.contentWindow.focus(); frame.contentWindow.print(); } finally { setTimeout(() => frame.remove(), 1500); } }, 150);
    },

    // ------------------------------------------------------------ libro de ejemplo
    async example() {
      const a = A();
      if (a.wb.modified && !(await ui.confirm('¿Abrir el libro de ejemplo?\nSustituirá al libro actual en esta pestaña.', { ok: 'Abrir ejemplo' }))) return;
      const wb = HC.Workbook.blank();
      wb.title = 'Libro de ejemplo';
      wb.begin('Ejemplo');
      const cur = '"' + HC.locale.currency + '"#,##0';
      const put = (sh, r, c, v) => { if (typeof v === 'string' && v[0] === '=') wb._put(sh, r, c, v.slice(1), null); else wb._put(sh, r, c, undefined, v); };
      const fill = (sh, rows, r0, c0) => rows.forEach((row, i) => row.forEach((v, j) => { if (v != null) put(sh, (r0 || 0) + i, (c0 || 0) + j, v); }));
      const rg = (t) => HC.parseA1(t);
      const head = { b: true, bg: '#1a7f4b', fc: '#ffffff', ha: 'c' };
      // --- hoja 1: ventas
      const s1 = wb.sheet; wb.renameSheet(s1, 'Ventas');
      const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      const datos = [[12400, 8300, 5100], [13150, 8900, 5600], [14800, 9100, 6050], [14200, 9800, 6400], [15900, 10400, 7150], [17300, 9900, 7700], [16800, 10900, 8200], [15400, 11300, 8050], [18100, 11800, 8900], [19600, 12500, 9400], [21200, 13100, 10300], [24500, 14900, 11800]];
      fill(s1, [['Ventas mensuales (ejemplo)'], [], ['Mes', 'Norte', 'Centro', 'Sur', 'Total', '% del año']]);
      meses.forEach((m, i) => fill(s1, [[m].concat(datos[i], ['=SUM(B' + (4 + i) + ':D' + (4 + i) + ')', '=E' + (4 + i) + '/$E$16'])], 3 + i));
      fill(s1, [['Total', '=SUM(B4:B15)', '=SUM(C4:C15)', '=SUM(D4:D15)', '=SUM(E4:E15)', '=SUM(F4:F15)'], ['Promedio', '=AVERAGE(B4:B15)', '=AVERAGE(C4:C15)', '=AVERAGE(D4:D15)', '=AVERAGE(E4:E15)'], ['Mejor mes', '=INDEX($A$4:$A$15,MATCH(MAX(B4:B15),B4:B15,0))', '=INDEX($A$4:$A$15,MATCH(MAX(C4:C15),C4:C15,0))', '=INDEX($A$4:$A$15,MATCH(MAX(D4:D15),D4:D15,0))', '=INDEX($A$4:$A$15,MATCH(MAX(E4:E15),E4:E15,0))']], 15);
      wb.formatRange(s1, [rg('A1')], { b: true, fs: 16 }); wb.setSize(s1, 'row', 0, 28);
      wb.formatRange(s1, [rg('A3:F3')], head);
      wb.formatRange(s1, [rg('B4:E17')], { nf: cur }); wb.formatRange(s1, [rg('F4:F16')], { nf: '0.0%' });
      wb.formatRange(s1, [rg('A16:F16')], { b: true, bt: 'thin #000000', bb: 'double #000000' });
      wb.formatRange(s1, [rg('A17:F18')], { i: true, fc: '#55585d' });
      wb.formatRange(s1, [rg('B18:E18')], { ha: 'r' });
      wb.setSize(s1, 'col', 0, 96); wb.setSize(s1, 'col', 5, 84);
      wb.setProp(s1, 'frozenRows', 3);
      wb.setProp(s1, 'condFmts', [{ id: 'cf1', ranges: [rg('E4:E15')], type: 'bar', color: '#5b9bd5' }, { id: 'cf2', ranges: [rg('B4:D15')], type: 'top', n: 3, style: { bg: '#c6efce', fc: '#006100' } }]);
      // --- hoja 2: presupuesto
      const s2 = wb.addSheet('Presupuesto');
      fill(s2, [['Presupuesto familiar (ejemplo)'], [], ['Categoría', 'Presupuestado', 'Real', 'Diferencia', 'Estado'], ['Vivienda', 950, 950], ['Alimentación', 480, 512.4], ['Transporte', 160, 138.9], ['Servicios', 210, 226.3], ['Salud', 90, 64], ['Educación', 150, 150], ['Ocio', 120, 171.5], ['Ahorro', 300, 250]]);
      for (let r = 4; r <= 11; r++) fill(s2, [['=B' + r + '-C' + r, '=IF(D' + r + '<0,"Excedido",IF(D' + r + '=0,"Justo","Dentro"))']], r - 1, 3);
      fill(s2, [['Total', '=SUM(B4:B11)', '=SUM(C4:C11)', '=SUM(D4:D11)', '=COUNTIF(E4:E11,"Excedido")&" excedidas"']], 11);
      wb.formatRange(s2, [rg('A1')], { b: true, fs: 16 }); wb.setSize(s2, 'row', 0, 28);
      wb.formatRange(s2, [rg('A3:E3')], head);
      wb.formatRange(s2, [rg('B4:D12')], { nf: '"' + HC.locale.currency + '"#,##0.00;[Red]-"' + HC.locale.currency + '"#,##0.00' });
      wb.formatRange(s2, [rg('A12:E12')], { b: true, bt: 'thin #000000' });
      wb.setSize(s2, 'col', 0, 110); wb.setSize(s2, 'col', 1, 110); wb.setSize(s2, 'col', 4, 110);
      wb.setProp(s2, 'condFmts', [{ id: 'cf3', ranges: [rg('E4:E11')], type: 'text', op: 'contains', v1: 'Excedido', style: { bg: '#ffc7ce', fc: '#9c0006' } }, { id: 'cf4', ranges: [rg('E4:E11')], type: 'text', op: 'contains', v1: 'Dentro', style: { bg: '#c6efce', fc: '#006100' } }]);
      wb.setProp(s2, 'validations', [{ ranges: [rg('A4:A11')], type: 'list', source: 'Vivienda, Alimentación, Transporte, Servicios, Salud, Educación, Ocio, Ahorro, Otros' }]);
      // --- hoja 3: fórmulas
      const s3 = wb.addSheet('Fórmulas');
      const ej = [
        ['Suma de un rango', '=SUM(Ventas!B4:B15)'], ['Promedio', '=AVERAGE(Ventas!E4:E15)'], ['Condición', '=IF(Ventas!E16>400000,"Meta cumplida","Falta para la meta")'], ['Contar con condición', '=COUNTIF(Ventas!E4:E15,">30000")'],
        ['Sumar con condición', '=SUMIF(Presupuesto!E4:E11,"Excedido",Presupuesto!C4:C11)'], ['Buscar un valor', '=VLOOKUP("Julio",Ventas!A4:E15,5,FALSE)'], ['Búsqueda moderna', '=XLOOKUP("Ocio",Presupuesto!A4:A11,Presupuesto!C4:C11,"No está")'],
        ['Texto', '=UPPER(LEFT("hoja de cálculo",4))&" · "&LEN("hoja de cálculo")&" letras"'], ['Unir textos', '=TEXTJOIN(", ",TRUE,Ventas!A4:A6)'], ['Fecha de hoy', '=TODAY()'], ['Días hasta fin de año', '=DATE(YEAR(TODAY()),12,31)-TODAY()'],
        ['Cuota de un préstamo', '=PMT(0.09/12,36,-15000)'], ['Redondear', '=ROUND(PI()*2,3)'], ['Desviación estándar', '=STDEV.S(Ventas!E4:E15)'], ['Tendencia (mes 13)', '=FORECAST(13,Ventas!E4:E15,SEQUENCE(12))'],
        ['Los 3 mejores meses', '=TAKE(SORTBY(Ventas!A4:A15,Ventas!E4:E15,-1),3)'],
      ];
      fill(s3, [['Ejemplos de fórmulas', null, null], [], ['Qué hace', 'Resultado', 'Fórmula escrita en la columna B']]);
      ej.forEach((e, i) => fill(s3, [[e[0], e[1], '=FORMULATEXT(B' + (4 + i) + ')']], 3 + i));
      wb.formatRange(s3, [rg('A1')], { b: true, fs: 16 }); wb.setSize(s3, 'row', 0, 28);
      wb.formatRange(s3, [rg('A3:C3')], head);
      wb.formatRange(s3, [rg('C4:C19')], { ff: 'Consolas', fc: '#55585d', fs: 10 });
      wb.formatRange(s3, [rg('B4:B5'), rg('B8:B10')], { nf: cur }); wb.formatRange(s3, [rg('B13')], { nf: 'dd/mm/yyyy' }); wb.formatRange(s3, [rg('B15')], { nf: '"' + HC.locale.currency + '"#,##0.00' }); wb.formatRange(s3, [rg('B17:B18')], { nf: '#,##0.00' });
      wb.setSize(s3, 'col', 0, 170); wb.setSize(s3, 'col', 1, 170); wb.setSize(s3, 'col', 2, 520);
      wb.commit();
      if (HC.charts) {
        HC.charts.create(wb, s1, { type: 'column', range: 'Ventas!$A$3:$D$15', title: 'Ventas por zona', x: 620, y: 40, w: 520, h: 300, opts: { stacked: 'stack', legend: 'bottom' } });
        HC.charts.create(wb, s1, { type: 'line', range: 'Ventas!$A$3:$A$15,Ventas!$E$3:$E$15', title: 'Total mensual', x: 620, y: 360, w: 520, h: 260, opts: { legend: 'none' } });
        HC.charts.create(wb, s2, { type: 'pie', range: 'Presupuesto!$A$3:$A$11,Presupuesto!$C$3:$C$11', title: 'Gasto real por categoría', x: 560, y: 40, w: 420, h: 300, opts: { legend: 'right' } });
        HC.charts.create(wb, s2, { type: 'bar', range: 'Presupuesto!$A$3:$C$11', title: 'Presupuestado y real', x: 560, y: 360, w: 420, h: 300, opts: { legend: 'bottom' } });
      }
      wb.active = 0; wb.undoStack.length = 0; wb.redoStack.length = 0; wb.modified = false;
      a.setWorkbook(wb);
      a.saveNow();
    },
  });

  // arrastrar un archivo a la ventana lo abre
  window.addEventListener('dragover', (e) => { if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) e.preventDefault(); });
  window.addEventListener('drop', (e) => {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f) return;
    e.preventDefault();
    files.openFile(f);
  });
})();
