/* Marco de la aplicación: barra de título, menús, barra de herramientas, barra de fórmulas,
   pestañas de hojas, barra de estado y menús contextuales. */
(function () {
  'use strict';
  const HC = window.HC, ui = HC.ui, h = ui.h;
  const MAXR = HC.MAX_ROWS, MAXC = HC.MAX_COLS;
  const app = () => HC.app;
  const run = (name, arg) => () => HC.app.run(name, arg);
  const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];
  const ZOOMS = [50, 75, 90, 100, 110, 125, 150, 200];
  const CHARTS = [['column', 'Columnas'], ['bar', 'Barras'], ['line', 'Líneas'], ['area', 'Áreas'], ['pie', 'Circular'], ['doughnut', 'Anillo'], ['scatter', 'Dispersión'], ['bubble', 'Burbujas'], ['radar', 'Radial'], ['combo', 'Combinada'], ['histogram', 'Histograma']];
  HC.CHART_TYPES = CHARTS;

  const chrome = (HC.chrome = {
    fx: null, nameBox: null, btn: {},

    build() {
      const root = document.getElementById('app');
      this.title = h('input#doc-title', { type: 'text', 'aria-label': 'Nombre del libro', spellcheck: false, maxlength: 80 });
      this.title.addEventListener('change', () => { const a = app(); a.wb.title = this.title.value.trim() || 'Libro sin título'; a.wb.modified = true; this.updateTitle(); a.scheduleSave(); a.focusGrid(); });
      this.title.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'Escape') { this.title.blur(); app().focusGrid(); } e.stopPropagation(); });
      this.saveState = h('span#save-state', { 'aria-live': 'polite' });
      this.menubar = h('nav#menubar', { role: 'menubar', 'aria-label': 'Menú principal' });
      this.toolbar = h('div#toolbar', { role: 'toolbar', 'aria-label': 'Barra de herramientas' });
      this.nameBox = h('input#namebox', { type: 'text', 'aria-label': 'Cuadro de nombres: celda activa', spellcheck: false, autocomplete: 'off' });
      this.fx = h('textarea#fx-input', { rows: 1, spellcheck: false, autocomplete: 'off', autocapitalize: 'off', 'aria-label': 'Barra de fórmulas' });
      this.cancelBtn = this.tbButton('close', 'Cancelar (Esc)', () => app().cancelEdit());
      this.okBtn = this.tbButton('check', 'Aceptar (Intro)', () => app().commitEdit());
      const fxBtn = this.tbButton('fx', 'Insertar función', run('insertFunction'));
      this.tabs = h('div#sheet-tabs', { role: 'tablist', 'aria-label': 'Hojas' });
      this.status = h('div#status');
      this.modeLbl = h('span#mode', 'Listo');
      this.stats = h('span#stats');
      this.zoomLbl = h('button#zoom-lbl', { type: 'button', title: 'Zoom' });
      this.zoomRange = h('input#zoom-range', { type: 'range', min: 25, max: 200, step: 5, 'aria-label': 'Zoom' });
      this.zoomRange.addEventListener('input', () => app().setZoom(this.zoomRange.value / 100));
      this.zoomRange.addEventListener('change', () => app().focusGrid());
      this.zoomLbl.addEventListener('click', () => ui.menu(ZOOMS.map((z) => ({ label: z + ' %', checked: Math.round(app().grid.zoom * 100) === z, action: run('zoom', z / 100) })), this.zoomLbl));
      const zoomBox = h('div#zoom', this.tbButton('minus', 'Alejar', () => app().setZoom(app().grid.zoom - 0.1)), this.zoomRange, this.tbButton('plus', 'Acercar', () => app().setZoom(app().grid.zoom + 0.1)), this.zoomLbl);
      root.append(
        h('header#titlebar', h('span.app-ico', ui.icon('logo', 22)), this.title, this.saveState),
        this.menubar, this.toolbar,
        h('div#formulabar', this.nameBox, h('div.fx-buttons', this.cancelBtn, this.okBtn, fxBtn), this.fx),
        h('div#main', h('div#grid'), h('aside#sidepanel', { hidden: true })),
        h('footer#bottombar', h('div#tabs-wrap', this.tbButton('plus', 'Hoja nueva', run('insertSheet')), this.tbButton('menu', 'Todas las hojas', (e) => this.sheetList(e.currentTarget)), this.tabs), h('div#status-wrap', this.modeLbl, this.stats, zoomBox)));
      this.buildMenubar();
      this.buildToolbar();
      this.setEditing(false);
      this.nameBox.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); this.nameBoxEnter(); }
        else if (e.key === 'Escape') { this.updateSelection(); app().focusGrid(); }
      });
      this.nameBox.addEventListener('focus', () => this.nameBox.select());
      this.nameBox.addEventListener('blur', () => this.updateSelection());
      app().bindInput(this.fx, 'bar');
    },
    nameBoxEnter() {
      const a = app(), t = this.nameBox.value.trim();
      if (!t) return;
      if (a.edit && !a.commitEdit()) return;
      if (a.goTo(t)) { a.focusGrid(); return; }
      if (HC.Workbook.validName(t) && !HC.fns[HC.fnToCanon(t)]) {
        const g = a.range;
        a.wb.setName(t, HC.quoteSheet(a.sheet.name) + '!' + HC.rangeAddr(g, true));
        ui.toast('Nombre «' + t + '» definido para ' + HC.rangeAddr(g) + '.');
        a.focusGrid();
      } else ui.toast('«' + t + '» no es una referencia ni un nombre válido.');
    },
    tbButton(icon, label, action, opts) {
      opts = opts || {};
      const b = h('button.tb-btn' + (opts.cls ? '.' + opts.cls : ''), { type: 'button', title: label, 'aria-label': label }, typeof icon === 'string' ? ui.icon(icon) : icon, opts.text ? h('span.tb-text', opts.text) : null, opts.caret ? h('span.tb-caret', ui.icon('down', 10)) : null);
      b.addEventListener('pointerdown', (e) => e.preventDefault()); // no quita el foco a la celda
      b.addEventListener('click', (e) => { action(e); });
      return b;
    },

    // ------------------------------------------------------------ menús
    menus() {
      const a = app(), sh = a.sheet, s = a.span ? a.span(false) : { n: 1 }, sc = a.span(true);
      const rowsN = s.n > 1 ? s.n + ' filas' : '1 fila', colsN = sc.n > 1 ? sc.n + ' columnas' : '1 columna';
      return [
        ['Archivo', [
          { label: 'Nuevo', icon: 'file', action: run('newBook') },
          { label: 'Abrir…', icon: 'upload', key: 'Ctrl+O', action: run('open') },
          { label: 'Abrir libro de ejemplo', icon: 'table', action: run('example') },
          '-',
          { label: 'Descargar como Excel (.xlsx)', icon: 'download', key: 'Ctrl+S', action: run('saveXlsx') },
          { label: 'Descargar hoja como CSV', action: run('exportCsv') },
          { label: 'Descargar copia completa (.json)', action: run('saveJson') },
          '-',
          { label: 'Imprimir…', icon: 'print', key: 'Ctrl+P', action: run('print') },
          '-',
          { label: 'Configuración…', icon: 'gear', action: run('settings') },
        ]],
        ['Editar', [
          { label: 'Deshacer', icon: 'undo', key: 'Ctrl+Z', disabled: !a.wb.undoStack.length, action: run('undo') },
          { label: 'Rehacer', icon: 'redo', key: 'Ctrl+Y', disabled: !a.wb.redoStack.length, action: run('redo') },
          '-',
          { label: 'Cortar', icon: 'cut', key: 'Ctrl+X', action: run('cut') },
          { label: 'Copiar', icon: 'copy', key: 'Ctrl+C', action: run('copy') },
          { label: 'Pegar', icon: 'paste', key: 'Ctrl+V', action: run('paste') },
          { label: 'Pegado especial', sub: this.pasteSpecial() },
          '-',
          { label: 'Rellenar', sub: [{ label: 'Hacia abajo', key: 'Ctrl+D', action: run('fillDown') }, { label: 'Hacia la derecha', key: 'Ctrl+R', action: run('fillRight') }] },
          { label: 'Borrar', icon: 'clear', sub: [{ label: 'Contenido', key: 'Supr', action: run('clearContents') }, { label: 'Formatos', action: run('clearFormats') }, { label: 'Todo', action: run('clearAll') }] },
          '-',
          { label: 'Buscar…', icon: 'search', key: 'Ctrl+F', action: run('find') },
          { label: 'Reemplazar…', key: 'Ctrl+H', action: run('replace') },
        ]],
        ['Ver', [
          { label: 'Líneas de cuadrícula', checked: sh.showGrid, action: run('toggleGrid') },
          { label: 'Mostrar fórmulas', checked: a.showFormulas, key: 'Ctrl+`', action: run('toggleFormulas') },
          '-',
          { label: 'Inmovilizar', icon: 'freeze', sub: [
            { label: 'Fila superior', checked: sh.frozenRows === 1 && !sh.frozenCols, action: run('freeze', 'row1') },
            { label: 'Primera columna', checked: sh.frozenCols === 1 && !sh.frozenRows, action: run('freeze', 'col1') },
            { label: 'Hasta la celda seleccionada (' + HC.addr(a.sel.r, a.sel.c) + ')', action: run('freeze', 'sel') },
            { label: 'Sin inmovilizar', disabled: !sh.frozenRows && !sh.frozenCols, action: run('freeze', 'none') },
          ] },
          { label: 'Zoom', sub: ZOOMS.map((z) => ({ label: z + ' %', checked: Math.round(a.grid.zoom * 100) === z, action: run('zoom', z / 100) })) },
          { label: 'Tema oscuro', icon: 'moon', checked: a.settings.dark, action: run('darkMode') },
          '-',
          { label: 'Mostrar filas y columnas ocultas', disabled: !sh.rowH.hidden.size && !sh.colW.hidden.size, action: run('showAllHidden') },
        ]],
        ['Insertar', [
          { label: 'Insertar ' + rowsN + ' encima', icon: 'rows', action: run('insertRowsAbove') },
          { label: 'Insertar ' + rowsN + ' debajo', action: run('insertRowsBelow') },
          { label: 'Insertar ' + colsN + ' a la izquierda', icon: 'cols', action: run('insertColsLeft') },
          { label: 'Insertar ' + colsN + ' a la derecha', action: run('insertColsRight') },
          '-',
          { label: 'Hoja nueva', icon: 'plus', action: run('insertSheet') },
          { label: 'Gráfica', icon: 'chart', sub: CHARTS.map(([t, n]) => ({ label: n, action: run('insertChart', t) })) },
          { label: 'Tabla dinámica…', icon: 'table', action: run('pivot') },
          { label: 'Función…', icon: 'fx', action: run('insertFunction') },
          '-',
          { label: 'Nota', icon: 'note', action: run('insertNote') },
          { label: 'Vínculo…', icon: 'link', action: run('insertLink') },
          { label: 'Fecha de hoy', key: 'Ctrl+;', action: run('today') },
        ]],
        ['Formato', [
          { label: 'Celdas…', key: 'Ctrl+1', action: run('formatCells') },
          { label: 'Número', icon: 'num123', sub: this.numberFormats() },
          '-',
          { label: 'Negrita', icon: 'bold', key: 'Ctrl+B', action: run('bold') },
          { label: 'Cursiva', icon: 'italic', key: 'Ctrl+I', action: run('italic') },
          { label: 'Subrayado', icon: 'underline', key: 'Ctrl+U', action: run('underline') },
          { label: 'Tachado', icon: 'strike', key: 'Ctrl+5', action: run('strike') },
          '-',
          { label: 'Alineación', icon: 'alignL', sub: [
            { label: 'Izquierda', icon: 'alignL', action: run('align', 'l') }, { label: 'Centro', icon: 'alignC', action: run('align', 'c') }, { label: 'Derecha', icon: 'alignR', action: run('align', 'r') }, '-',
            { label: 'Arriba', icon: 'valignT', action: run('valign', 't') }, { label: 'En medio', icon: 'valignM', action: run('valign', 'm') }, { label: 'Abajo', icon: 'valignB', action: run('valign', 'b') },
          ] },
          { label: 'Ajustar texto', icon: 'wrap', checked: !!a.styleAt().wrap, action: run('wrap') },
          { label: 'Combinar celdas', icon: 'merge', checked: !!sh.mergeAt(a.sel.r, a.sel.c), action: run('merge') },
          '-',
          { label: 'Formato condicional…', icon: 'cond', action: run('condFormat') },
          '-',
          { label: 'Filas', sub: [{ label: 'Alto de fila…', action: run('rowHeight') }, { label: 'Ajustar alto al contenido', action: run('autoFitRows') }, { label: 'Ocultar', action: run('hideRows') }, { label: 'Mostrar', action: run('showRows') }] },
          { label: 'Columnas', sub: [{ label: 'Ancho de columna…', action: run('colWidth') }, { label: 'Ajustar ancho al contenido', action: run('autoFitCols') }, { label: 'Ocultar', action: run('hideCols') }, { label: 'Mostrar', action: run('showCols') }] },
          '-',
          { label: 'Borrar formato', icon: 'clear', action: run('clearFormats') },
        ]],
        ['Datos', [
          { label: 'Ordenar de A a Z', icon: 'sortAsc', action: run('sortAsc') },
          { label: 'Ordenar de Z a A', icon: 'sortDesc', action: run('sortDesc') },
          { label: 'Ordenar rango…', action: run('sortDialog') },
          '-',
          { label: 'Filtro', icon: 'filter', checked: !!sh.filter, key: 'Ctrl+Mayús+L', action: run('toggleFilter') },
          '-',
          { label: 'Validación de datos…', icon: 'valid', action: run('validation') },
          { label: 'Tabla dinámica…', icon: 'table', action: run('pivot') },
          { label: 'Quitar duplicados…', action: run('removeDuplicates') },
          { label: 'Texto en columnas…', action: run('textToColumns') },
          '-',
          { label: 'Nombres definidos…', action: run('names') },
          { label: 'Buscar objetivo…', icon: 'target', action: run('goalSeek') },
          { label: 'Recalcular todo', key: 'F9', action: () => { app().wb.recalcAll(); app().focusGrid(); } },
        ]],
        ['Ayuda', [
          { label: 'Lista de funciones', icon: 'fx', action: run('insertFunction') },
          { label: 'Atajos de teclado', icon: 'help', action: run('shortcuts') },
        ]],
      ];
    },
    pasteSpecial() {
      return [
        { label: 'Solo valores', action: run('pasteValues') }, { label: 'Solo fórmulas', action: run('pasteFormulas') },
        { label: 'Solo formato', action: run('pasteFormats') }, { label: 'Transponer filas y columnas', action: run('pasteTranspose') },
      ];
    },
    numberFormats() {
      const cur = app().styleAt().nf || 'General', sample = { general: '1234.5', number: 1234.5, integer: 1235, currency: 1234.5, accounting: 1234.5, percent: 0.1234, date: 45351, longdate: 45351, time: 0.5625, datetime: 45351.5625, fraction: 0.5, scientific: 12345.678, text: 'abc' };
      const items = HC.fmt.presets.map((p) => ({ label: p.name, hint: p.code, key: p.id === 'general' ? '' : HC.fmt.format(sample[p.id], p.code).text.trim(), checked: cur === p.code, action: run('numFmt', p.code) }));
      items.push('-', { label: 'Más formatos…', action: run('formatCells', 0) });
      return items;
    },
    buildMenubar() {
      const names = ['Archivo', 'Editar', 'Ver', 'Insertar', 'Formato', 'Datos', 'Ayuda'];
      const buttons = [];
      const open = (i) => {
        const b = buttons[i];
        buttons.forEach((x) => x.classList.remove('open'));
        b.classList.add('open');
        this._menuOpen = i;
        ui.menu(this.menus()[i][1], b, {
          onClose: () => { b.classList.remove('open'); if (this._menuOpen === i) this._menuOpen = -1; },
          onSide: (d) => open((i + d + buttons.length) % buttons.length),
        });
      };
      names.forEach((n, i) => {
        const b = h('button.menu-btn', { type: 'button', role: 'menuitem', 'aria-haspopup': 'true' }, n);
        b.addEventListener('pointerdown', (e) => { e.preventDefault(); if (this._menuOpen === i) { ui.closePopups(); return; } const a = app(); if (a.edit && !a.commitEdit()) return; open(i); });
        b.addEventListener('pointerenter', () => { if (this._menuOpen >= 0 && this._menuOpen !== i) open(i); });
        b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); open(i); } });
        buttons.push(b); this.menubar.appendChild(b);
      });
      this._menuOpen = -1;
    },

    // ------------------------------------------------------------ barra de herramientas
    buildToolbar() {
      const B = this.btn, tb = this.toolbar, sep = () => h('span.tb-sep', { role: 'separator' });
      const add = (id, icon, label, action, opts) => (B[id] = this.tbButton(icon, label, action, opts));
      const sel = (id, label, options, onchange, cls) => {
        const s = h('select.tb-select' + (cls ? '.' + cls : ''), { title: label, 'aria-label': label });
        for (const o of options) { const [v, t] = Array.isArray(o) ? o : [o, o]; s.appendChild(h('option', { value: v }, t)); }
        s.addEventListener('change', () => { onchange(s.value); app().focusGrid(); });
        s.addEventListener('keydown', (e) => e.stopPropagation());
        return (B[id] = s);
      };
      const split = (id, icon, label, apply, openPicker) => {
        const main = this.tbButton(icon, label, apply, { cls: 'split-main' });
        const arrow = this.tbButton(ui.icon('down', 10), label + ': elegir color', (e) => openPicker(e.currentTarget.parentNode), { cls: 'split-arrow' });
        B[id] = main;
        return h('span.tb-split', main, arrow);
      };
      const a = app;
      tb.append(
        add('undo', 'undo', 'Deshacer (Ctrl+Z)', run('undo')), add('redo', 'redo', 'Rehacer (Ctrl+Y)', run('redo')), add('print', 'print', 'Imprimir (Ctrl+P)', run('print')),
        sep(),
        sel('zoom', 'Zoom', ZOOMS.map((z) => [z, z + ' %']), (v) => a().setZoom(v / 100), 'narrow'),
        sep(),
        add('currency', 'currency', 'Formato de moneda', () => a().run('numFmt', '"' + HC.locale.currency + '"#,##0.00')),
        add('percent', 'percent', 'Formato de porcentaje', run('numFmt', '0%')),
        add('decLess', 'decLess', 'Quitar decimales', run('decimals', -1)), add('decMore', 'decMore', 'Añadir decimales', run('decimals', 1)),
        add('numfmt', 'num123', 'Formato de número', (e) => ui.menu(this.numberFormats(), e.currentTarget), { caret: true }),
        sep(),
        sel('font', 'Fuente', [['', 'Calibri (predet.)']].concat(HC.FONTS.filter((f) => f !== 'Calibri').map((f) => [f, f])), (v) => a().run('font', v), 'font'),
        sel('size', 'Tamaño de fuente', SIZES, (v) => a().run('fontSize', v), 'narrow'),
        sep(),
        add('bold', 'bold', 'Negrita (Ctrl+B)', run('bold')), add('italic', 'italic', 'Cursiva (Ctrl+I)', run('italic')), add('underline', 'underline', 'Subrayado (Ctrl+U)', run('underline')), add('strike', 'strike', 'Tachado (Ctrl+5)', run('strike')),
        split('fontColor', 'fontColor', 'Color de texto', () => a().run('fontColor', a().lastFontColor === undefined ? '#d0021b' : a().lastFontColor), (at) => ui.colorPicker(at, { value: a().styleAt().fc, autoLabel: 'Automático', onPick: (c) => { a().run('fontColor', c); this.updateSwatches(); } })),
        split('fillColor', 'fillColor', 'Color de relleno', () => a().run('fillColor', a().lastFillColor === undefined ? '#ffff00' : a().lastFillColor), (at) => ui.colorPicker(at, { value: a().styleAt().bg, autoLabel: 'Sin relleno', onPick: (c) => { a().run('fillColor', c); this.updateSwatches(); } })),
        sep(),
        add('borders', 'borders', 'Bordes', (e) => this.bordersMenu(e.currentTarget), { caret: true }),
        add('merge', 'merge', 'Combinar y centrar', run('merge')),
        sep(),
        add('alignL', 'alignL', 'Alinear a la izquierda', run('align', 'l')), add('alignC', 'alignC', 'Centrar', run('align', 'c')), add('alignR', 'alignR', 'Alinear a la derecha', run('align', 'r')),
        add('valign', 'valignM', 'Alineación vertical', (e) => ui.menu([{ label: 'Arriba', icon: 'valignT', action: run('valign', 't') }, { label: 'En medio', icon: 'valignM', action: run('valign', 'm') }, { label: 'Abajo', icon: 'valignB', action: run('valign', 'b') }], e.currentTarget), { caret: true }),
        add('wrap', 'wrap', 'Ajustar texto', run('wrap')),
        sep(),
        add('sum', 'sum', 'Autosuma (Alt+=)', (e) => ui.menu([['SUM', 'Suma'], ['AVERAGE', 'Promedio'], ['COUNT', 'Contar números'], ['MAX', 'Máximo'], ['MIN', 'Mínimo']].map(([f, n]) => ({ label: n, key: HC.fnToLocal(f), action: run('autoSum', f) })).concat(['-', { label: 'Más funciones…', icon: 'fx', action: run('insertFunction') }]), e.currentTarget), { caret: true }),
        add('chart', 'chart', 'Insertar gráfica', (e) => ui.menu(CHARTS.map(([t, n]) => ({ label: n, action: run('insertChart', t) })), e.currentTarget), { caret: true }),
        sep(),
        add('sortAsc', 'sortAsc', 'Ordenar de A a Z', run('sortAsc')), add('sortDesc', 'sortDesc', 'Ordenar de Z a A', run('sortDesc')),
        add('filter', 'filter', 'Filtro (Ctrl+Mayús+L)', run('toggleFilter')),
        sep(),
        add('cond', 'cond', 'Formato condicional', run('condFormat')), add('valid', 'valid', 'Validación de datos', run('validation')), add('find', 'search', 'Buscar y reemplazar (Ctrl+F)', run('find')),
      );
      this.updateSwatches();
    },
    updateSwatches() {
      const a = app(), set = (b, c) => { const s = b && b.querySelector('.swatch'); if (s) s.setAttribute('fill', c || 'transparent'); };
      set(this.btn.fontColor, a.lastFontColor === undefined ? '#d0021b' : a.lastFontColor || 'currentColor');
      set(this.btn.fillColor, a.lastFillColor === undefined ? '#ffff00' : a.lastFillColor);
    },
    bordersMenu(at) {
      const a = app();
      this._bStyle = this._bStyle || 'thin'; this._bColor = this._bColor || '#000000';
      const el = h('div.borders-pop');
      const modes = [['all', 'Todos'], ['inner', 'Interiores'], ['outer', 'Exteriores'], ['horizontal', 'Horizontales'], ['vertical', 'Verticales'], ['top', 'Superior'], ['bottom', 'Inferior'], ['left', 'Izquierdo'], ['right', 'Derecho'], ['none', 'Sin bordes']];
      const gridEl = h('div.borders-grid');
      const picto = (m) => {
        const on = (k) => m === 'all' || (m === 'outer' && 'tblr'.includes(k)) || (m === 'inner' && 'hv'.includes(k)) || (m === 'horizontal' && k === 'h') || (m === 'vertical' && k === 'v') || m[0] === k && ['top', 'bottom', 'left', 'right'].includes(m);
        const ln = (k, d) => '<path d="' + d + '" stroke="' + (on(k) ? 'currentColor' : 'var(--border)') + '" stroke-width="' + (on(k) ? 1.6 : 1) + '"' + (on(k) ? '' : ' stroke-dasharray="1.5 1.5"') + '/>';
        return h('span.ico', { html: '<svg viewBox="0 0 18 18" width="18" height="18" fill="none">' + ln('t', 'M2 2h14') + ln('b', 'M2 16h14') + ln('l', 'M2 2v14') + ln('r', 'M16 2v14') + ln('h', 'M2 9h14') + ln('v', 'M9 2v14') + '</svg>' });
      };
      for (const [m, label] of modes) gridEl.appendChild(this.tbButton(picto(m), label, () => { ui.closePopups(); a.run('borders', { mode: m, style: this._bStyle, color: this._bColor }); }));
      const styleSel = ui.select([['thin', 'Fina'], ['medium', 'Media'], ['thick', 'Gruesa'], ['dashed', 'Discontinua'], ['dotted', 'Punteada'], ['double', 'Doble']], this._bStyle, (v) => { this._bStyle = v; });
      const color = h('input', { type: 'color', value: this._bColor, 'aria-label': 'Color del borde' });
      color.addEventListener('input', () => { this._bColor = color.value; });
      el.append(gridEl, h('div.borders-opts', h('label', 'Línea ', styleSel), h('label', 'Color ', color)));
      ui.popup(el, at);
    },

    // ------------------------------------------------------------ menús contextuales
    cellMenu(at) {
      const a = app(), sh = a.sheet, s = a.span(false), sc = a.span(true), cell = sh.get(a.sel.r, a.sel.c);
      const rowsN = s.n > 1 ? s.n + ' filas' : 'fila', colsN = sc.n > 1 ? sc.n + ' columnas' : 'columna';
      ui.menu([
        { label: 'Cortar', icon: 'cut', key: 'Ctrl+X', action: run('cut') }, { label: 'Copiar', icon: 'copy', key: 'Ctrl+C', action: run('copy') }, { label: 'Pegar', icon: 'paste', key: 'Ctrl+V', action: run('paste') },
        { label: 'Pegado especial', sub: this.pasteSpecial() },
        '-',
        { label: 'Insertar ' + rowsN + ' encima', icon: 'rows', action: run('insertRowsAbove') }, { label: 'Insertar ' + colsN + ' a la izquierda', icon: 'cols', action: run('insertColsLeft') },
        { label: 'Eliminar ' + rowsN, action: run('deleteRows') }, { label: 'Eliminar ' + colsN, action: run('deleteCols') },
        { label: 'Borrar contenido', icon: 'clear', key: 'Supr', action: run('clearContents') },
        '-',
        { label: 'Ordenar', sub: [{ label: 'De A a Z', icon: 'sortAsc', action: run('sortAsc') }, { label: 'De Z a A', icon: 'sortDesc', action: run('sortDesc') }, { label: 'Ordenar rango…', action: run('sortDialog') }] },
        { label: sh.filter ? 'Quitar filtro' : 'Filtro', icon: 'filter', action: run('toggleFilter') },
        '-',
        { label: cell && cell.note ? 'Editar nota' : 'Insertar nota', icon: 'note', action: run('insertNote') },
        cell && cell.note ? { label: 'Eliminar nota', action: () => { a.wb.setNote(sh, a.sel.r, a.sel.c, null); a.focusGrid(); } } : null,
        { label: 'Vínculo…', icon: 'link', action: run('insertLink') },
        { label: 'Insertar gráfica', icon: 'chart', sub: CHARTS.map(([t, n]) => ({ label: n, action: run('insertChart', t) })) },
        '-',
        { label: 'Validación de datos…', icon: 'valid', action: run('validation') },
        { label: 'Formato condicional…', icon: 'cond', action: run('condFormat') },
        { label: 'Formato de celdas…', key: 'Ctrl+1', action: run('formatCells') },
      ], at);
    },
    headerMenu(at, isCol) {
      const a = app(), n = a.span(isCol).n, what = isCol ? (n > 1 ? n + ' columnas' : 'columna') : n > 1 ? n + ' filas' : 'fila';
      ui.menu([
        { label: 'Cortar', icon: 'cut', action: run('cut') }, { label: 'Copiar', icon: 'copy', action: run('copy') }, { label: 'Pegar', icon: 'paste', action: run('paste') },
        '-',
        { label: 'Insertar ' + what + (isCol ? ' a la izquierda' : ' encima'), action: run(isCol ? 'insertColsLeft' : 'insertRowsAbove') },
        { label: 'Insertar ' + what + (isCol ? ' a la derecha' : ' debajo'), action: run(isCol ? 'insertColsRight' : 'insertRowsBelow') },
        { label: 'Eliminar ' + what, icon: 'trash', action: run(isCol ? 'deleteCols' : 'deleteRows') },
        { label: 'Borrar contenido', icon: 'clear', action: run('clearContents') },
        '-',
        { label: 'Ocultar ' + what, action: run(isCol ? 'hideCols' : 'hideRows') },
        { label: 'Mostrar ocultas', action: run(isCol ? 'showCols' : 'showRows') },
        { label: isCol ? 'Ancho de columna…' : 'Alto de fila…', action: run(isCol ? 'colWidth' : 'rowHeight') },
        { label: 'Ajustar al contenido', action: run(isCol ? 'autoFitCols' : 'autoFitRows') },
        isCol ? '-' : null,
        isCol ? { label: 'Ordenar de A a Z', icon: 'sortAsc', action: run('sortAsc') } : null,
        isCol ? { label: 'Ordenar de Z a A', icon: 'sortDesc', action: run('sortDesc') } : null,
        '-',
        { label: 'Formato de celdas…', action: run('formatCells') },
      ], at);
    },

    // ------------------------------------------------------------ pestañas de hojas
    updateTabs() {
      const a = app(), wb = a.wb;
      this.tabs.replaceChildren(...wb.sheets.map((sh, i) => {
        const tab = h('div.sheet-tab' + (i === wb.active ? '.on' : ''), { role: 'tab', 'aria-selected': i === wb.active ? 'true' : 'false', title: sh.name }, h('span.tab-name', sh.name));
        if (sh.tabColor) tab.style.setProperty('--tab-color', sh.tabColor);
        tab.addEventListener('pointerdown', (e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          if (i !== wb.active) {
            const keep = !!(a.edit && a.edit.text[0] === '=');
            const pos = keep ? a.activeInput().selectionStart : 0;
            a.activateSheet(i, keep);
            if (keep) { a.edit.point = null; a.edit.where = 'bar'; a.focusEditor(); this.fx.setSelectionRange(pos, pos); } else a.focusGrid();
            return;
          }
          // arrastrar para reordenar
          const x0 = e.clientX; let moved = false;
          const move = (ev) => { if (Math.abs(ev.clientX - x0) > 6) { moved = true; tab.classList.add('dragging'); tab.style.transform = 'translateX(' + (ev.clientX - x0) + 'px)'; } };
          const up = (ev) => {
            document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up);
            tab.classList.remove('dragging'); tab.style.transform = '';
            if (!moved) return;
            const tabsEl = Array.from(this.tabs.children); let to = wb.sheets.length - 1;
            for (let k = 0; k < tabsEl.length; k++) { const b = tabsEl[k].getBoundingClientRect(); if (ev.clientX < b.left + b.width / 2) { to = k > i ? k - 1 : k; break; } }
            wb.moveSheet(sh, to);
            this.updateTabs();
          };
          document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
        });
        tab.addEventListener('dblclick', () => this.renameTab(sh, tab));
        tab.addEventListener('contextmenu', (e) => { e.preventDefault(); if (a.edit && !a.commitEdit()) return; a.activateSheet(i); this.tabMenu(sh, { x: e.clientX, y: e.clientY }); });
        return tab;
      }));
      const on = this.tabs.querySelector('.on');
      if (on) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    },
    renameTab(sh, tab) {
      const a = app();
      if (a.edit && !a.commitEdit()) return;
      tab = tab || this.tabs.children[a.wb.sheets.indexOf(sh)];
      const inp = h('input.tab-rename', { type: 'text', value: sh.name, maxlength: 31, 'aria-label': 'Nombre de la hoja' });
      let done = false;
      const finish = (ok) => {
        if (done) return; done = true;
        const err = ok ? a.wb.renameSheet(sh, inp.value) : null;
        if (err) ui.toast(err);
        this.updateTabs(); a.focusGrid();
      };
      inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false); });
      inp.addEventListener('blur', () => finish(true));
      inp.addEventListener('pointerdown', (e) => e.stopPropagation());
      tab.replaceChildren(inp);
      inp.focus(); inp.select();
    },
    tabMenu(sh, at) {
      const a = app(), wb = a.wb, i = wb.sheets.indexOf(sh);
      const colors = [null, '#d93025', '#e37400', '#f2c200', '#188038', '#12a4af', '#1a73e8', '#9334e6', '#5f6368'];
      ui.menu([
        { label: 'Insertar hoja', icon: 'plus', action: run('insertSheet') },
        { label: 'Duplicar', icon: 'copy', action: () => { const c = wb.duplicateSheet(sh); a.activateSheet(wb.sheets.indexOf(c)); } },
        { label: 'Cambiar nombre', action: () => this.renameTab(sh) },
        { label: 'Eliminar', icon: 'trash', disabled: wb.sheets.length < 2, action: async () => { if (await ui.confirm('¿Eliminar la hoja «' + sh.name + '»? Puedes recuperarla con Deshacer.', { ok: 'Eliminar', danger: true })) { wb.removeSheet(sh); a.sel = { r: 0, c: 0, ranges: [{ r1: 0, c1: 0, r2: 0, c2: 0 }], anchor: { r: 0, c: 0 } }; a.refreshAll(); } } },
        '-',
        { label: 'Mover a la izquierda', disabled: i === 0, action: () => { wb.moveSheet(sh, i - 1); this.updateTabs(); } },
        { label: 'Mover a la derecha', disabled: i === wb.sheets.length - 1, action: () => { wb.moveSheet(sh, i + 1); this.updateTabs(); } },
        { label: 'Color de la pestaña', sub: colors.map((c) => ({ label: c ? c : 'Sin color', swatch: c || 'transparent', checked: (sh.tabColor || null) === c, action: () => { wb.setProp(sh, 'tabColor', c); this.updateTabs(); } })) },
      ], at);
    },
    sheetList(at) { const a = app(); ui.menu(a.wb.sheets.map((sh, i) => ({ label: sh.name, checked: i === a.wb.active, action: () => { a.activateSheet(i); a.focusGrid(); } })), at); },

    // ------------------------------------------------------------ actualización del estado
    updateAll() {
      const a = app();
      if (!a.wb) return;
      this.updateTitle(); this.updateTabs(); this.updateSelection(); this.updateZoom();
      this.btn.undo.disabled = !a.wb.undoStack.length; this.btn.redo.disabled = !a.wb.redoStack.length;
      this.btn.filter.classList.toggle('on', !!a.sheet.filter);
    },
    updateTitle() { const a = app(); if (document.activeElement !== this.title) this.title.value = a.wb.title; document.title = a.wb.title + ' · Hoja de cálculo'; },
    setSaveState(t) { if (this.saveState) this.saveState.textContent = t; },
    updateZoom() {
      const z = Math.round(app().grid.zoom * 100);
      this.zoomLbl.textContent = z + ' %'; this.zoomRange.value = z;
      const s = this.btn.zoom;
      if (!Array.from(s.options).some((o) => +o.value === z)) { let o = s.querySelector('option[data-x]'); if (!o) { o = h('option', { 'data-x': '1' }); s.appendChild(o); } o.value = z; o.textContent = z + ' %'; }
      s.value = z;
    },
    updateSelection() {
      const a = app();
      if (!a.wb || !a.grid) return;
      const s = a.sel, sh = a.sheet, g = a.range, B = this.btn;
      if (document.activeElement !== this.nameBox) {
        const rows = g.r2 - g.r1 + 1, cols = g.c2 - g.c1 + 1, m = sh.mergeAt(s.r, s.c);
        this.nameBox.value = a.drag && a.drag.type === 'select' && (rows > 1 || cols > 1) && !(m && HC.sameRange(m, g)) ? (rows >= MAXR ? cols + 'C' : cols >= MAXC ? rows + 'F' : rows + 'F x ' + cols + 'C') : HC.addr(s.r, s.c);
      }
      this.updateFormulaBar();
      const st = sh.styleAt(s.r, s.c) || {};
      B.bold.classList.toggle('on', !!st.b); B.italic.classList.toggle('on', !!st.i); B.underline.classList.toggle('on', !!st.u); B.strike.classList.toggle('on', !!st.st);
      B.wrap.classList.toggle('on', !!st.wrap); B.merge.classList.toggle('on', !!sh.mergeAt(s.r, s.c));
      B.alignL.classList.toggle('on', st.ha === 'l'); B.alignC.classList.toggle('on', st.ha === 'c'); B.alignR.classList.toggle('on', st.ha === 'r');
      const ff = st.ff || '';
      if (ff && !Array.from(B.font.options).some((o) => o.value === ff)) B.font.appendChild(h('option', { value: ff }, ff));
      B.font.value = ff;
      const fs = st.fs || 11;
      if (!SIZES.includes(fs)) { let o = B.size.querySelector('option[data-x]'); if (!o) { o = h('option', { 'data-x': '1' }); B.size.appendChild(o); } o.value = fs; o.textContent = fs; }
      B.size.value = fs;
      cancelAnimationFrame(this._statRaf);
      this._statRaf = requestAnimationFrame(() => this.updateStats());
    },
    updateStats() {
      const a = app(), st = a.selStats(), f = (v) => HC.fmt.general(parseFloat(v.toPrecision(12)), 14);
      const parts = [];
      if (st.n > 1) parts.push('Promedio: ' + f(st.avg), 'Recuento: ' + st.cnt, 'Mín.: ' + f(st.min), 'Máx.: ' + f(st.max), 'Suma: ' + f(st.sum));
      else if (st.cnt > 1) parts.push('Recuento: ' + st.cnt);
      this.stats.replaceChildren(...parts.map((p) => h('span.stat', p)));
    },
    updateFormulaBar() {
      const a = app();
      if (!a.wb || a.edit) return;
      const s = a.sel, sh = a.sheet, cell = sh.get(s.r, s.c);
      let text = a.wb.editText(sh, s.r, s.c), ghost = false;
      if (cell && cell.g && cell.f == null) { text = '=' + HC.localizeFormula(cell.g.f); ghost = true; }
      if (this.fx.value !== text) this.fx.value = text;
      this.fx.classList.toggle('ghost', ghost);
      this.autoGrowFx();
    },
    autoGrowFx() {
      const fx = this.fx;
      fx.style.height = 'auto';
      const hh = Math.min(120, Math.max(24, fx.scrollHeight));
      if (fx._h !== hh) { fx._h = hh; fx.style.height = hh + 'px'; } else fx.style.height = hh + 'px';
    },
    setEditing(on) {
      this.cancelBtn.disabled = !on; this.okBtn.disabled = !on;
      this.modeLbl.textContent = on ? 'Modificar' : 'Listo';
      document.body.classList.toggle('editing', on);
      if (on) this.fx.classList.remove('ghost');
    },
  });
})();
