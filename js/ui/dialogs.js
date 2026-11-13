/* Diálogos: formato de celdas, formato condicional, validación, ordenar, filtro, buscar, funciones, nombres, ajustes… */
(function () {
  'use strict';
  const HC = window.HC, ui = HC.ui, h = ui.h;
  const MAXR = HC.MAX_ROWS, MAXC = HC.MAX_COLS;
  const A = () => HC.app;
  const addrOf = (g) => HC.rangeAddr(g);
  const parseRanges = (text) => { const out = []; for (const p of String(text).split(/[;,]/)) { const g = HC.parseA1(p.trim()); if (!g) return null; out.push(g); } return out.length ? out : null; };
  const num = (v) => { const p = HC.parseInput(String(v).trim()); return typeof p.v === 'number' ? p.v : null; };
  const colorBtn = (value, onPick, autoLabel) => {
    const b = h('button.swatch-btn', { type: 'button', title: 'Elegir color' });
    const set = (c) => { b.value = c; b.style.background = c || 'repeating-linear-gradient(45deg, var(--panel), var(--panel) 4px, var(--border-soft) 4px, var(--border-soft) 8px)'; };
    set(value || null);
    b.addEventListener('click', () => ui.colorPicker(b, { value: b.value, autoLabel: autoLabel || 'Ninguno', level: 0, onPick: (c) => { set(c); if (onPick) onPick(c); } }));
    return b;
  };
  const OPS = [['gt', 'Mayor que'], ['gte', 'Mayor o igual que'], ['lt', 'Menor que'], ['lte', 'Menor o igual que'], ['eq', 'Igual a'], ['neq', 'Distinto de'], ['between', 'Entre'], ['nbetween', 'No está entre']];

  const dlg = (HC.dlg = {
    // ------------------------------------------------------------ filtro automático
    filterMenu(hit) {
      const a = A(), sh = a.sheet, wb = a.wb, off = hit.off;
      const bounds = wb.filterBounds(sh);
      if (!bounds) return;
      const col = bounds.c1 + off, current = (sh.filter.cols || {})[off];
      const title = wb.displayText(sh, bounds.r1, col) || 'Columna ' + HC.colName(col);
      const items = wb.filterItems(sh, off);
      const passes = current && !current.op ? HC.filterTest(current) : () => true;
      const checked = new Set(items.filter(({ v, text }) => passes(v, () => text)).map(({ key }) => key));
      const fold = (text) => HC.fold(text).toLowerCase();
      for (const item of items) {
        item.label = item.text || (item.key === '' ? '(Vacías)' : item.key);
        item.searchText = fold(item.label + ' ' + item.key);
      }

      const search = h('input.inp', { type: 'search', placeholder: 'Buscar valores…', 'aria-label': 'Buscar valores' });
      const list = h('div.list.filter-values', { role: 'group', 'aria-label': 'Valores de ' + title });
      const rows = h('div');
      const pageSize = 250;
      let matching = items, limit = pageSize, shown = [];
      const all = ui.check('Seleccionar todo', true, (on) => {
        for (const { key } of matching) {
          if (on) checked.add(key); else checked.delete(key);
        }
        for (const [key, input] of shown) input.checked = checked.has(key);
        syncChecks();
      });
      all.classList.add('filter-all');
      list.append(all, rows);

      function syncChecks() {
        const total = matching.length, selected = matching.reduce((n, { key }) => n + Number(checked.has(key)), 0);
        all.input.checked = total > 0 && selected === total;
        all.input.indeterminate = selected > 0 && selected < total;
        all.input.disabled = total === 0;
      }
      function renderValues() {
        const page = matching.slice(0, limit);
        shown = [];
        rows.replaceChildren(...page.map(({ key, label }) => {
          const entry = ui.check(label, checked.has(key), (on) => {
            if (on) checked.add(key); else checked.delete(key);
            syncChecks();
          });
          entry.classList.add('list-item');
          entry.title = label;
          shown.push([key, entry.input]);
          return entry;
        }));
        if (matching.length > limit) {
          rows.append(h('button.btn.small', { type: 'button', onclick: () => { limit += pageSize; renderValues(); } }, 'Mostrar más valores'));
        } else if (!matching.length) rows.append(h('div.list-item.muted', 'No hay coincidencias.'));
        syncChecks();
      }
      search.addEventListener('input', () => {
        const query = fold(search.value.trim());
        matching = query ? items.filter(({ searchText }) => searchText.includes(query)) : items;
        limit = pageSize;
        list.scrollTop = 0;
        renderValues();
      });

      const condOps = [['', 'Usar valores seleccionados'], ...OPS.filter(([op]) => op !== 'nbetween'),
        ['contains', 'Contiene'], ['ncontains', 'No contiene'], ['begins', 'Empieza por'], ['ends', 'Termina en'],
        ['blank', 'Está vacía'], ['nblank', 'No está vacía']];
      const condition = ui.select(condOps, current?.op || '', () => syncCondition());
      condition.setAttribute('aria-label', 'Condición');
      const conditionValue = (v) => typeof v === 'number' && HC.locale.dec === ',' ? String(v).replace('.', ',') : v ?? '';
      const v1 = h('input.inp', { type: 'text', value: conditionValue(current?.v1), placeholder: 'Valor', 'aria-label': 'Valor' });
      const v2 = h('input.inp', { type: 'text', value: conditionValue(current?.v2), placeholder: 'Segundo valor', 'aria-label': 'Segundo valor' });
      const error = h('p.filter-error', { role: 'status', hidden: true });
      const values = h('div.filter-selection', search, list);
      function syncCondition() {
        const op = condition.value;
        v1.hidden = !op || op === 'blank' || op === 'nblank';
        v2.hidden = op !== 'between';
        const keyboard = ['gt', 'gte', 'lt', 'lte', 'between'].includes(op) ? 'decimal' : 'text';
        v1.inputMode = keyboard; v2.inputMode = keyboard;
        values.hidden = !!op;
        error.hidden = true;
      }
      const apply = () => {
        const op = condition.value;
        let spec = null;
        if (op) {
          let first = v1.value, second = v2.value;
          if (['gt', 'gte', 'lt', 'lte', 'between'].includes(op)) {
            first = num(first);
            second = op === 'between' ? num(second) : null;
            if (first == null || (op === 'between' && second == null)) {
              error.textContent = op === 'between' ? 'Escribe dos números válidos.' : 'Escribe un número válido.';
              error.hidden = false;
              return;
            }
            if (op === 'between' && first > second) [first, second] = [second, first];
          } else if ((op === 'eq' || op === 'neq') && items.some(({ v }) => typeof v === 'number')) {
            first = num(first) ?? first;
          }
          spec = { op, v1: first, v2: second };
        } else {
          if (!matching.length && search.value.trim()) return;
          const allowed = matching.filter(({ key }) => checked.has(key)).map(({ key }) => key);
          if (allowed.length !== items.length) spec = { values: allowed };
        }
        ui.closePopups();
        wb.setFilterCol(sh, off, spec);
      };
      const sortBtn = (desc) => h('button.filter-command', { type: 'button', onclick: () => {
        ui.closePopups();
        if (bounds.r2 - bounds.r1 < 2) return;
        if (!wb.sortRange(sh, bounds, [{ col, desc }], true)) ui.toast('No se puede ordenar un rango con celdas combinadas.');
      } }, ui.icon(desc ? 'sortDesc' : 'sortAsc'), desc ? 'Ordenar de mayor a menor' : 'Ordenar de menor a mayor');
      const clear = h('button.filter-command', { type: 'button', disabled: !current, onclick: () => {
        ui.closePopups();
        wb.setFilterCol(sh, off, null);
      } }, ui.icon('filter'), 'Borrar filtro');
      const advanced = h('details.filter-condition', { open: !!current?.op }, h('summary', 'Filtrar por condición'),
        h('div.filter-condition-fields', condition, v1, v2, error));
      const el = h('div.filter-pop', { role: 'dialog', 'aria-label': 'Filtrar ' + title, tabIndex: -1 },
        h('strong.filter-title', title), h('div.filter-commands', sortBtn(false), sortBtn(true), clear), advanced, values,
        h('div.filter-actions', h('button.btn.small', { type: 'button', onclick: () => ui.closePopups() }, 'Cancelar'),
          h('button.btn.small.primary', { type: 'button', onclick: apply }, 'Aceptar')));
      el.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter' && e.target.matches('input:not([type=checkbox])')) { e.preventDefault(); apply(); }
        else if (e.key === 'Escape') { e.preventDefault(); ui.closePopups(); }
      });
      renderValues();
      syncCondition();
      const b = a.grid.canvas.getBoundingClientRect(), z = a.grid.zoom;
      ui.popup(el, { x: b.left + hit.x * z, y: b.top + (hit.y + hit.h) * z + 2 },
        { onClose: () => a.focusGrid(), keepOnResize: true });
      el.focus({ preventScroll: true });
    },
    validationList(hit) {
      const a = A(), sh = a.sheet, rule = a.wb.validationAt(sh, hit.r, hit.c);
      if (!rule) return;
      const items = a.wb.validationItems(sh, rule);
      if (!items.length) { ui.toast('La lista de valores permitidos está vacía.'); return; }
      const rc = a.grid.cellRect(hit.r, hit.c), b = a.grid.canvas.getBoundingClientRect(), z = a.grid.zoom, cur = a.wb.displayText(sh, hit.r, hit.c);
      ui.menu(items.slice(0, 500).map((t) => ({ label: t, checked: t === cur, action: () => { a.wb.setCellInput(sh, hit.r, hit.c, t); a.focusGrid(); } })), { x: b.left + rc.x * z, y: b.top + (rc.y + rc.h) * z + 1 });
    },

    // ------------------------------------------------------------ funciones
    functions() {
      const a = A(), all = HC.fnList(), cats = [['', 'Todas las categorías']].concat(Object.keys(HC.fnCats).map((k) => [k, HC.fnCats[k]]));
      let chosen = null;
      const search = h('input.inp', { type: 'search', placeholder: 'Buscar una función: suma, buscar, fecha…', autofocus: true, 'aria-label': 'Buscar función' });
      const list = h('div.list', { style: { height: '230px' }, role: 'listbox', tabindex: '0', 'aria-label': 'Funciones' });
      const info = h('div', { style: { minHeight: '74px', marginTop: '10px' } });
      const catSel = ui.select(cats, '', () => fill());
      const show = (f) => {
        chosen = f;
        Array.from(list.children).forEach((x) => x.classList.toggle('on', x.dataset.fn === (f && f.canon)));
        info.replaceChildren(f ? h('div', h('div.hint-sig', HC.fnSignature(f.canon)), h('p', { style: { margin: '6px 0 0' } }, f.desc), h('p.muted', { style: { margin: '4px 0 0' } }, HC.fnCats[f.cat] + (f.name !== f.canon ? ' · En inglés: ' + f.canon : ''))) : h('p.muted', 'Ninguna función coincide con la búsqueda.'));
      };
      const fill = () => {
        const q = HC.fold(search.value).toLowerCase().trim(), cat = catSel.value;
        const rows = all.filter((f) => (!cat || f.cat === cat) && (!q || f.name.toLowerCase().indexOf(q) >= 0 || f.canon.toLowerCase().indexOf(q) >= 0 || HC.fold(f.desc).toLowerCase().indexOf(q) >= 0));
        rows.sort((x, y) => (q ? (y.name.toLowerCase().startsWith(q) ? 1 : 0) - (x.name.toLowerCase().startsWith(q) ? 1 : 0) : 0) || x.name.localeCompare(y.name));
        list.replaceChildren(...rows.map((f) => { const r = h('div.list-item', { 'data-fn': f.canon, role: 'option' }, f.name); r.addEventListener('click', () => show(f)); r.addEventListener('dblclick', () => { show(f); insert(); close(); }); return r; }));
        list._rows = rows;
        show(rows[0] || null);
      };
      const insert = () => {
        if (!chosen) return false;
        const ins = chosen.name + '(';
        setTimeout(() => {
          if (a.edit) { const el = a.activeInput(), p = el.selectionStart, t = a.edit.text; const text = (t === '' ? '=' : t.slice(0, p)) + ins + (t === '' ? '' : t.slice(el.selectionEnd)); a.focusEditor(); a.setEditText(text, (t === '' ? 1 : p) + ins.length); }
          else a.startEdit('=' + ins, { mode: 'edit' });
        }, 0);
        return true;
      };
      list.addEventListener('keydown', (e) => {
        const rows = list._rows || [], i = rows.indexOf(chosen);
        if (e.key === 'ArrowDown' && i < rows.length - 1) { show(rows[i + 1]); list.children[i + 1].scrollIntoView({ block: 'nearest' }); e.preventDefault(); }
        else if (e.key === 'ArrowUp' && i > 0) { show(rows[i - 1]); list.children[i - 1].scrollIntoView({ block: 'nearest' }); e.preventDefault(); }
      });
      search.addEventListener('input', fill);
      search.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown') { list.focus(); e.preventDefault(); } });
      const close = ui.dialog({ title: 'Insertar función', width: 520, body: h('div', h('div.row', search, h('div.fixed', catSel)), h('div', { style: { height: '8px' } }), list, info), buttons: [{ label: 'Cancelar' }, { label: 'Insertar', primary: true, action: insert }] });
      fill();
    },
    note() {
      const a = A(), sh = a.sheet, s = a.sel, cell = sh.get(s.r, s.c);
      const ta = h('textarea.inp', { rows: 5, style: { width: '100%' }, autofocus: true, 'aria-label': 'Texto de la nota' });
      ta.value = (cell && cell.note) || '';
      ui.dialog({ title: 'Nota de ' + HC.addr(s.r, s.c), width: 380, body: ta, buttons: [{ label: 'Cancelar' }, { label: 'Guardar', primary: true, action: () => { a.wb.setNote(sh, s.r, s.c, ta.value.trim()); } }] });
    },
    link() {
      const a = A(), sh = a.sheet, s = a.sel, cell = sh.get(s.r, s.c);
      let url = '', text = a.wb.displayText(sh, s.r, s.c);
      if (cell && cell.f != null) { const m = /^HYPERLINK\("((?:[^"]|"")*)"(?:,"((?:[^"]|"")*)")?\)$/.exec(cell.f); if (m) { url = m[1].replace(/""/g, '"'); text = (m[2] || '').replace(/""/g, '"'); } }
      const u = h('input.inp', { type: 'text', value: url, placeholder: 'https://… o #Hoja2!A1', autofocus: true }), t = h('input.inp', { type: 'text', value: text });
      ui.dialog({ title: 'Vínculo', width: 420, body: h('div', ui.field('Dirección web o celda de destino', u, 'Para saltar a otra celda escribe # y la referencia, por ejemplo #Hoja2!A1'), ui.field('Texto que se muestra', t)), buttons: [{ label: 'Cancelar' }, { label: 'Aceptar', primary: true, action: () => {
        if (!u.value.trim()) return false;
        const q = (x) => '"' + x.replace(/"/g, '""') + '"';
        a.wb.setCellFormula(sh, s.r, s.c, 'HYPERLINK(' + q(u.value.trim()) + (t.value ? ',' + q(t.value) : '') + ')');
        return true;
      } }] });
    },
    size(isCol) {
      const a = A(), sh = a.sheet, sp = a.span(isCol), ax = isCol ? sh.colW : sh.rowH;
      const inp = h('input.inp', { type: 'number', min: 0, max: 1000, value: ax.raw(sp.at), autofocus: true });
      ui.dialog({ title: isCol ? 'Ancho de columna' : 'Alto de fila', width: 300, body: ui.field((isCol ? 'Ancho' : 'Alto') + ' en píxeles (predeterminado: ' + ax.def + ')', inp), buttons: [{ label: 'Cancelar' }, { label: 'Aceptar', primary: true, action: () => {
        const v = Math.round(+inp.value);
        if (!(v >= 0 && v <= 1000) || sp.n > 20000) return false;
        a.wb.begin('Cambiar tamaño');
        for (let i = 0; i < sp.n; i++) a.wb.setSize(sh, isCol ? 'col' : 'row', sp.at + i, v);
        a.wb.commit();
        return true;
      } }] });
    },

    // ------------------------------------------------------------ formato de celdas
    formatCells(tab) {
      const a = A(), sh = a.sheet, s = a.sel, st = a.styleAt(), val = sh.value(s.r, s.c);
      const patch = {};
      // --- número
      const sym = HC.locale.currency;
      const cats = [['general', 'General'], ['number', 'Número'], ['currency', 'Moneda'], ['accounting', 'Contabilidad'], ['date', 'Fecha'], ['time', 'Hora'], ['percent', 'Porcentaje'], ['fraction', 'Fracción'], ['scientific', 'Científica'], ['text', 'Texto'], ['custom', 'Personalizada']];
      const DATES = ['dd/mm/yyyy', 'd/m/yy', 'dd-mmm-yy', 'd "de" mmmm "de" yyyy', 'dddd, d "de" mmmm "de" yyyy', 'mmm-yy', 'mmmm yyyy', 'yyyy-mm-dd', 'dd/mm/yyyy hh:mm'];
      const TIMES = ['hh:mm', 'hh:mm:ss', 'h:mm AM/PM', 'h:mm:ss AM/PM', '[h]:mm:ss', 'mm:ss'];
      const FRACS = ['# ?/?', '# ??/??', '# ?/2', '# ?/4', '# ?/8', '# ?/16', '# ?/10', '# ??/100'];
      const cur = st.nf || 'General';
      const kind0 = (() => { const k = HC.fmt.kind(cur); if (k === 'general') return 'general'; if (cur === '@') return 'text'; if (/^_\(/.test(cur)) return 'accounting'; if (FRACS.includes(cur)) return 'fraction'; if (k === 'date' && DATES.includes(cur)) return 'date'; if (k === 'time' && TIMES.includes(cur)) return 'time'; if (k === 'number' && /^(#,##0|0)(\.0+)?(;\[Red\]-(#,##0|0)(\.0+)?)?$/.test(cur)) return 'number'; if (k === 'percent' && /^0(\.0+)?%$/.test(cur)) return 'percent'; if (k === 'scientific' && /^0(\.0+)?E\+00$/.test(cur)) return 'scientific'; if (k === 'currency' && /^"[^"]*"#,##0(\.0+)?(;\[Red\]-"[^"]*"#,##0(\.0+)?)?$/.test(cur)) return 'currency'; return 'custom'; })();
      const dec0 = (() => { const m = /\.(0+)/.exec(cur); return m ? m[1].length : kind0 === 'general' || kind0 === 'custom' ? 2 : 0; })();
      const catList = h('div.list', { style: { width: '130px', height: '214px' }, role: 'listbox' });
      const opts = h('div', { style: { flex: 1, minWidth: 0 } });
      const preview = h('div.preview-box', { 'aria-live': 'polite' });
      const decInp = h('input.inp', { type: 'number', min: 0, max: 15, value: dec0, style: { width: '70px' } });
      const sepChk = ui.check('Usar separador de miles', /#,##0/.test(cur) || kind0 === 'general');
      const redChk = ui.check('Números negativos en rojo', /\[Red\]/.test(cur));
      const symInp = h('input.inp', { type: 'text', value: (/^"([^"]*)"/.exec(cur) || [])[1] || sym, style: { width: '70px' }, maxlength: 5 });
      const listOf = (codes, sample) => { const l = h('div.list', { style: { height: '150px' } }); l._codes = codes; codes.forEach((c, i) => { const r = h('div.list-item' + (c === cur || (!codes.includes(cur) && i === 0) ? '.on' : ''), HC.fmt.format(sample, c).text); r.addEventListener('click', () => { Array.from(l.children).forEach((x) => x.classList.remove('on')); r.classList.add('on'); update(); }); l.appendChild(r); }); l.value = () => codes[Math.max(0, Array.from(l.children).findIndex((x) => x.classList.contains('on')))]; return l; };
      const dateList = listOf(DATES, typeof val === 'number' && HC.date.valid(val) && val > 1 ? val : HC.date.today() + 0.5625), timeList = listOf(TIMES, typeof val === 'number' ? val : 0.5625), fracList = listOf(FRACS, 0.375);
      const custom = h('input.inp', { type: 'text', value: cur, style: { width: '100%', fontFamily: 'Consolas, monospace' }, spellcheck: false });
      let cat = kind0;
      const code = () => {
        const d = HC.clamp(Math.round(+decInp.value) || 0, 0, 15), dz = d ? '.' + '0'.repeat(d) : '', nf = (sepChk.input.checked ? '#,##0' : '0') + dz, neg = (c) => (redChk.input.checked ? c + ';[Red]-' + c : c), sy = '"' + symInp.value.replace(/"/g, '') + '"';
        switch (cat) {
          case 'general': return 'General';
          case 'number': return neg(nf);
          case 'currency': return neg(sy + '#,##0' + dz);
          case 'accounting': return '_(' + sy + '* #,##0' + dz + '_);_(' + sy + '* (#,##0' + dz + ');_(' + sy + '* "-"??_);_(@_)';
          case 'date': return dateList.value();
          case 'time': return timeList.value();
          case 'percent': return '0' + dz + '%';
          case 'fraction': return fracList.value();
          case 'scientific': return '0' + (dz || '.00') + 'E+00';
          case 'text': return '@';
          default: return custom.value.replace(/a{2,4}/gi, (m) => 'y'.repeat(m.length)) || 'General';
        }
      };
      const update = () => {
        const c = code();
        if (cat !== 'custom') custom.value = c;
        patch.nf = /^general$/i.test(c) ? null : c;
        let out;
        try { out = HC.fmt.format(val == null ? 1234.5 : val, c); } catch (e) { out = { text: 'Formato no válido' }; }
        preview.textContent = out.text; preview.style.color = out.color || '';
      };
      const setCat = (c) => {
        cat = c;
        Array.from(catList.children).forEach((x) => x.classList.toggle('on', x.dataset.c === c));
        const decRow = () => ui.field('Posiciones decimales', decInp);
        const make = { general: () => [h('p.muted', 'Sin formato específico: el número se muestra tal como se escribe.')], number: () => [decRow(), sepChk, redChk], currency: () => [h('div.row', decRow(), ui.field('Símbolo', symInp)), redChk], accounting: () => [h('div.row', decRow(), ui.field('Símbolo', symInp)), h('p.muted', 'Alinea los símbolos de moneda y los decimales en la columna.')], date: () => [ui.field('Tipo', dateList)], time: () => [ui.field('Tipo', timeList)], percent: () => [decRow(), h('p.muted', 'Multiplica el valor por 100 y añade el símbolo %.')], fraction: () => [ui.field('Tipo', fracList)], scientific: () => [decRow()], text: () => [h('p.muted', 'El contenido se trata como texto aunque sea un número: útil para códigos, teléfonos o ceros a la izquierda.')], custom: () => [ui.field('Código de formato', custom, 'Ejemplos: #,##0.00 · 0.0% · dd/mm/yyyy · 0 "uds" · [Red]-0.00')] }[c];
        const body = make();
        opts.replaceChildren(...body);
        update();
      };
      cats.forEach(([c, n]) => { const r = h('div.list-item', { 'data-c': c, role: 'option' }, n); r.addEventListener('click', () => setCat(c)); catList.appendChild(r); });
      for (const el of [decInp, symInp, custom]) el.addEventListener('input', update);
      for (const el of [sepChk.input, redChk.input]) el.addEventListener('change', update);
      const numberTab = h('div', h('div', { style: { display: 'flex', gap: '12px' } }, catList, opts), ui.field('Vista previa', preview));
      // --- alineación
      const ha = ui.select([['', 'General'], ['l', 'Izquierda'], ['c', 'Centro'], ['r', 'Derecha']], st.ha || '', (v) => { patch.ha = v || null; });
      const va = ui.select([['t', 'Arriba'], ['m', 'En medio'], ['b', 'Abajo']], st.va || 'b', (v) => { patch.va = v === 'b' ? null : v; });
      const wrap = ui.check('Ajustar texto a la celda', st.wrap, (v) => { patch.wrap = v || null; });
      const ind = h('input.inp', { type: 'number', min: 0, max: 15, value: st.ind || 0, style: { width: '80px' } });
      ind.addEventListener('input', () => { patch.ind = +ind.value > 0 ? HC.clamp(Math.round(+ind.value), 0, 15) : null; });
      const alignTab = h('div', h('div.row', ui.field('Horizontal', ha), ui.field('Vertical', va)), ui.field('Sangría', ind), wrap);
      // --- fuente
      const ff = ui.select([['', 'Calibri (predeterminada)']].concat(HC.FONTS.filter((f) => f !== 'Calibri').map((f) => [f, f])), st.ff || '', (v) => { patch.ff = v || null; });
      const fs = h('input.inp', { type: 'number', min: 6, max: 96, value: st.fs || 11 });
      fs.addEventListener('input', () => { const v = +fs.value; if (v >= 6 && v <= 96) patch.fs = v === 11 ? null : v; });
      const mk = (label, key) => ui.check(label, st[key], (v) => { patch[key] = v || null; });
      const fontTab = h('div', h('div.row', ui.field('Fuente', ff), ui.field('Tamaño', fs)), h('div.row', mk('Negrita', 'b'), mk('Cursiva', 'i')), h('div.row', mk('Subrayado', 'u'), mk('Tachado', 'st')),
        h('div.row', { style: { marginTop: '10px' } }, ui.field('Color del texto', colorBtn(st.fc, (c) => { patch.fc = c || null; }, 'Automático')), ui.field('Color de relleno', colorBtn(st.bg, (c) => { patch.bg = c || null; }, 'Sin relleno'))));
      // --- bordes
      let bMode = '', bStyle = 'thin', bColor = '#000000';
      const bordersTab = h('div', ui.field('Bordes que se aplican', ui.select([['', 'No cambiar'], ['all', 'Todos'], ['outer', 'Solo el contorno'], ['inner', 'Solo los interiores'], ['horizontal', 'Horizontales interiores'], ['vertical', 'Verticales interiores'], ['top', 'Superior'], ['bottom', 'Inferior'], ['left', 'Izquierdo'], ['right', 'Derecho'], ['none', 'Quitar todos']], '', (v) => { bMode = v; })),
        h('div.row', ui.field('Estilo de línea', ui.select([['thin', 'Fina'], ['medium', 'Media'], ['thick', 'Gruesa'], ['dashed', 'Discontinua'], ['dotted', 'Punteada'], ['double', 'Doble']], 'thin', (v) => { bStyle = v; })), ui.field('Color', colorBtn('#000000', (c) => { bColor = c || '#000000'; }, 'Negro'))));
      const tabs = ui.tabs([{ label: 'Número', body: numberTab }, { label: 'Alineación', body: alignTab }, { label: 'Fuente y relleno', body: fontTab }, { label: 'Bordes', body: bordersTab }]);
      setCat(kind0);
      delete patch.nf;
      const touchNf = () => { patch.nf = /^general$/i.test(code()) ? null : code(); };
      numberTab.addEventListener('click', touchNf); numberTab.addEventListener('input', touchNf);
      ui.dialog({ title: 'Formato de celdas', width: 480, body: tabs, buttons: [{ label: 'Cancelar' }, { label: 'Aceptar', primary: true, action: () => {
        a.wb.begin('Formato de celdas');
        if (Object.keys(patch).length) a.wb.formatRange(sh, a.sel.ranges, patch);
        if (bMode) for (const g of a.sel.ranges) a.wb.setBorders(sh, g, bMode, bMode === 'none' ? null : bStyle + ' ' + bColor);
        a.wb.commit();
        a.fitRows();
      } }] });
      if (typeof tab === 'number' && tab > 0) tabs.querySelectorAll('.tab')[tab].click();
    },

    // ------------------------------------------------------------ formato condicional
    condFormat() {
      const a = A(), sh = a.sheet, wb = a.wb;
      let rules = sh.condFmts.slice();
      const TYPES = [['cell', 'El valor de la celda…'], ['text', 'El texto contiene…'], ['dup', 'Valores duplicados'], ['unique', 'Valores únicos'], ['top', 'Los valores más altos'], ['bottom', 'Los valores más bajos'], ['above', 'Por encima del promedio'], ['below', 'Por debajo del promedio'], ['blank', 'Celdas vacías'], ['nblank', 'Celdas no vacías'], ['error', 'Celdas con error'], ['formula', 'Fórmula personalizada'], ['scale', 'Escala de colores'], ['bar', 'Barras de datos']];
      const PRESETS = [['Rojo claro', { bg: '#ffc7ce', fc: '#9c0006' }], ['Amarillo', { bg: '#ffeb9c', fc: '#9c5700' }], ['Verde', { bg: '#c6efce', fc: '#006100' }], ['Azul claro', { bg: '#ddebf7', fc: '#1f4e78' }], ['Texto rojo', { fc: '#c00000' }], ['Negrita', { b: true }]];
      const describe = (r) => {
        const t = (TYPES.find((x) => x[0] === r.type) || [])[1] || r.type;
        let d = t;
        if (r.type === 'cell') d = (OPS.find((o) => o[0] === r.op) || [])[1] + ' ' + r.v1 + (r.op === 'between' || r.op === 'nbetween' ? ' y ' + r.v2 : '');
        else if (r.type === 'text') d = 'Contiene «' + r.v1 + '»';
        else if (r.type === 'top' || r.type === 'bottom') d = (r.type === 'top' ? 'Los ' : 'Los ') + (r.n || 10) + (r.pct ? ' %' : '') + (r.type === 'top' ? ' más altos' : ' más bajos');
        else if (r.type === 'formula') d = 'Fórmula: ' + r.formula;
        return r.ranges.map(addrOf).join('; ') + ' · ' + d;
      };
      const listEl = h('div');
      const renderList = () => {
        listEl.replaceChildren(...(rules.length ? rules.map((r, i) => {
          const sw = h('span.swatch-btn', { style: { background: r.type === 'scale' ? 'linear-gradient(90deg,' + (r.colors || ['#f8696b', '#ffeb84', '#63be7b']).join(',') + ')' : r.type === 'bar' ? r.color || '#5b9bd5' : (r.style && r.style.bg) || 'transparent', color: (r.style && r.style.fc) || 'inherit', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: r.style && r.style.b ? 700 : 400, cursor: 'default' } }, r.type === 'scale' || r.type === 'bar' ? '' : 'Aa');
          return h('div.rule-row', sw, h('span.grow', { title: describe(r) }, describe(r)),
            h('button.tb-btn', { type: 'button', title: 'Subir prioridad', disabled: i === 0, onclick: () => { rules.splice(i - 1, 0, rules.splice(i, 1)[0]); renderList(); } }, '↑'),
            h('button.tb-btn', { type: 'button', title: 'Eliminar regla', onclick: () => { rules.splice(i, 1); renderList(); } }, ui.icon('trash')));
        }) : [h('p.muted', 'Esta hoja todavía no tiene reglas de formato condicional.')]));
      };
      // formulario de nueva regla
      const rangeInp = h('input.inp', { type: 'text', value: a.sel.ranges.map(addrOf).join('; ') });
      const typeSel = ui.select(TYPES, 'cell', () => syncForm());
      const opSel = ui.select(OPS, 'gt', () => syncForm());
      const v1 = h('input.inp', { type: 'text', placeholder: 'Valor o =fórmula' }), v2 = h('input.inp', { type: 'text', placeholder: 'y' });
      const nInp = h('input.inp', { type: 'number', min: 1, value: 10, style: { width: '80px' } }), pctChk = ui.check('% del rango', false);
      const fInp = h('input.inp', { type: 'text', placeholder: '=$B2>100', style: { fontFamily: 'Consolas, monospace' } });
      const presetSel = ui.select(PRESETS.map((p, i) => [i, p[0]]).concat([['x', 'Personalizado…']]), 0, () => syncForm());
      let cBg = '#ffc7ce', cFc = '#9c0006';
      const bgBtn = colorBtn(cBg, (c) => { cBg = c; }, 'Sin relleno'), fcBtn = colorBtn(cFc, (c) => { cFc = c; }, 'Automático'), boldChk = ui.check('Negrita', false);
      let sc = ['#f8696b', '#ffeb84', '#63be7b'], barColor = '#5b9bd5';
      const scBtns = sc.map((c, i) => colorBtn(c, (x) => { sc[i] = x || sc[i]; }));
      const barBtn = colorBtn(barColor, (c) => { barColor = c || barColor; });
      const fOp = ui.field('Condición', opSel), f1 = ui.field('Valor', v1), f2 = ui.field('Valor máximo', v2), fN = h('div.row', ui.field('Cantidad', nInp), pctChk), fF = ui.field('Fórmula (relativa a la primera celda del rango)', fInp);
      const fStyle = h('div.row', ui.field('Formato', presetSel), h('div.fixed', ui.field('Relleno', bgBtn)), h('div.fixed', ui.field('Texto', fcBtn)), h('div.fixed', boldChk));
      const fScale = ui.field('Colores: mínimo, medio y máximo', h('div', { style: { display: 'flex', gap: '6px' } }, scBtns)), fBar = ui.field('Color de las barras', barBtn);
      const syncForm = () => {
        const t = typeSel.value;
        fOp.hidden = t !== 'cell'; f1.hidden = !(t === 'cell' || t === 'text'); f2.hidden = !(t === 'cell' && (opSel.value === 'between' || opSel.value === 'nbetween'));
        fN.hidden = !(t === 'top' || t === 'bottom'); fF.hidden = t !== 'formula'; fScale.hidden = t !== 'scale'; fBar.hidden = t !== 'bar'; fStyle.hidden = t === 'scale' || t === 'bar';
        const custom = presetSel.value === 'x';
        bgBtn.parentNode.parentNode.hidden = !custom; fcBtn.parentNode.parentNode.hidden = !custom; boldChk.parentNode.hidden = !custom;
      };
      const add = () => {
        const ranges = parseRanges(rangeInp.value);
        if (!ranges) { ui.toast('El rango no es válido. Escribe algo como B2:B20.'); return; }
        const t = typeSel.value, r = { id: HC.uid('cf'), ranges, type: t };
        if (t === 'cell') { if (v1.value.trim() === '') { ui.toast('Escribe el valor con el que se compara.'); return; } r.op = opSel.value; r.v1 = v1.value.trim(); r.v2 = v2.value.trim(); }
        else if (t === 'text') { if (!v1.value) { ui.toast('Escribe el texto que debe contener.'); return; } r.op = 'contains'; r.v1 = v1.value; }
        else if (t === 'top' || t === 'bottom') { r.n = Math.max(1, Math.round(+nInp.value) || 10); r.pct = pctChk.input.checked; }
        else if (t === 'formula') { const f = fInp.value.trim(); if (!f) { ui.toast('Escribe la fórmula.'); return; } r.formula = f[0] === '=' ? f : '=' + f; if (HC.parseFormula(HC.canonicalizeFormula(r.formula.slice(1))).err) { ui.toast('La fórmula no se puede interpretar.'); return; } }
        if (t === 'scale') r.colors = sc.slice(); else if (t === 'bar') r.color = barColor;
        else r.style = presetSel.value === 'x' ? Object.assign({}, cBg ? { bg: cBg } : {}, cFc ? { fc: cFc } : {}, boldChk.input.checked ? { b: true } : {}) : Object.assign({}, PRESETS[+presetSel.value][1]);
        rules.push(r); renderList();
      };
      renderList(); syncForm();
      ui.dialog({ title: 'Formato condicional', width: 560, body: h('div', listEl, h('h4', { style: { margin: '14px 0 8px' } }, 'Nueva regla'), h('div.row', ui.field('Aplicar al rango', rangeInp), ui.field('Resaltar', typeSel)), h('div.row', fOp, f1, f2), fN, fF, fStyle, fScale, fBar, h('button.btn', { type: 'button', onclick: add }, 'Añadir regla')),
        buttons: [{ label: 'Cancelar' }, { label: 'Aceptar', primary: true, action: () => { wb.setProp(sh, 'condFmts', rules); a.grid.invalidate(); } }] });
    },

    // ------------------------------------------------------------ validación de datos
    validation() {
      const a = A(), sh = a.sheet, wb = a.wb, cur = wb.validationAt(sh, a.sel.r, a.sel.c) || {};
      const rangeInp = h('input.inp', { type: 'text', value: (cur.ranges || a.sel.ranges).map(addrOf).join('; ') });
      const typeSel = ui.select([['', 'Cualquier valor'], ['list', 'Lista de valores'], ['whole', 'Número entero'], ['decimal', 'Número decimal'], ['date', 'Fecha'], ['textlen', 'Longitud del texto']], cur.type || '', () => sync());
      const src = h('input.inp', { type: 'text', value: cur.source || '', placeholder: 'Sí, No, Tal vez   o   =A1:A10' });
      const opSel = ui.select([['between', 'Entre'], ['nbetween', 'No está entre'], ['eq', 'Igual a'], ['neq', 'Distinto de'], ['gt', 'Mayor que'], ['gte', 'Mayor o igual que'], ['lt', 'Menor que'], ['lte', 'Menor o igual que']], cur.op || 'between', () => sync());
      const v1 = h('input.inp', { type: 'text', value: cur.v1 == null ? '' : cur.v1 }), v2 = h('input.inp', { type: 'text', value: cur.v2 == null ? '' : cur.v2 });
      const msg = h('input.inp', { type: 'text', value: cur.msg || '', placeholder: 'Mensaje si el dato no es válido (opcional)' });
      const fSrc = ui.field('Valores permitidos', src, 'Sepáralos con comas, o escribe = y un rango que los contenga.'), fOp = ui.field('Condición', opSel), f1 = ui.field('Mínimo / valor', v1), f2 = ui.field('Máximo', v2);
      const sync = () => { const t = typeSel.value; fSrc.hidden = t !== 'list'; const cmp = t && t !== 'list'; fOp.hidden = !cmp; f1.hidden = !cmp; f2.hidden = !cmp || !(opSel.value === 'between' || opSel.value === 'nbetween'); };
      sync();
      ui.dialog({ title: 'Validación de datos', width: 440, body: h('div', ui.field('Celdas', rangeInp), ui.field('Permitir', typeSel), fSrc, h('div.row', fOp, f1, f2), ui.field('Mensaje de error', msg)), buttons: [{ label: 'Cancelar' }, { label: 'Aceptar', primary: true, action: () => {
        const ranges = parseRanges(rangeInp.value);
        if (!ranges) { ui.toast('El rango no es válido.'); return false; }
        // quita de las reglas existentes las celdas que ahora se redefinen
        const rest = sh.validations.filter((v) => !v.ranges.some((g) => ranges.some((r) => HC.rangesIntersect(g, r))));
        const t = typeSel.value;
        if (t) {
          const rule = { ranges, type: t, msg: msg.value.trim() || undefined };
          if (t === 'list') { if (!src.value.trim()) { ui.toast('Escribe los valores de la lista.'); return false; } rule.source = src.value.trim(); }
          else { const n1 = num(v1.value), n2 = num(v2.value), two = opSel.value === 'between' || opSel.value === 'nbetween'; if (n1 == null || (two && n2 == null)) { ui.toast('Escribe valores numéricos o fechas válidos.'); return false; } rule.op = opSel.value; rule.v1 = n1; rule.v2 = n2; }
          rest.push(rule);
        }
        wb.setProp(sh, 'validations', rest);
        a.grid.invalidate();
        return true;
      } }] });
    },

    // ------------------------------------------------------------ ordenar, duplicados, texto en columnas
    sort() {
      const a = A(), sh = a.sheet, g = a.dataRegion();
      if (!g || g.r1 === g.r2) { ui.toast('Selecciona la tabla que quieres ordenar.'); return; }
      const header = ui.check('La primera fila tiene encabezados', a.headerLooks(g) || (typeof sh.value(g.r1, g.c1) === 'string' && typeof sh.value(g.r1 + 1, g.c1) !== 'string'), () => build());
      const levels = [{ col: HC.clamp(a.sel.c, g.c1, g.c2), desc: false }];
      const box = h('div');
      const colName = (c) => (header.input.checked && sh.value(g.r1, c) != null ? a.wb.displayText(sh, g.r1, c) + ' (' + HC.colName(c) + ')' : 'Columna ' + HC.colName(c));
      const build = () => {
        const colsOpt = []; for (let c = g.c1; c <= g.c2; c++) colsOpt.push([c, colName(c)]);
        box.replaceChildren(...levels.map((lv, i) => h('div.row', { style: { marginBottom: '6px' } }, ui.field(i ? 'Luego por' : 'Ordenar por', ui.select(colsOpt, lv.col, (v) => { lv.col = +v; })), ui.field('Orden', ui.select([['0', 'Ascendente (A → Z, 0 → 9)'], ['1', 'Descendente (Z → A, 9 → 0)']], lv.desc ? '1' : '0', (v) => { lv.desc = v === '1'; })),
          h('div.fixed', h('button.tb-btn', { type: 'button', title: 'Quitar nivel', disabled: levels.length < 2, onclick: () => { levels.splice(i, 1); build(); } }, ui.icon('trash'))))));
      };
      build();
      ui.dialog({ title: 'Ordenar ' + addrOf(g), width: 500, body: h('div', header, box, h('button.btn.small', { type: 'button', onclick: () => { if (levels.length < 5) { levels.push({ col: g.c1, desc: false }); build(); } } }, 'Añadir nivel')),
        buttons: [{ label: 'Cancelar' }, { label: 'Ordenar', primary: true, action: () => { if (!a.wb.sortRange(sh, g, levels, header.input.checked)) ui.toast('No se puede ordenar un rango con celdas combinadas.'); } }] });
    },
    removeDuplicates() {
      const a = A(), sh = a.sheet, g = a.dataRegion();
      if (!g) { ui.toast('Selecciona la tabla donde quieres quitar duplicados.'); return; }
      const header = ui.check('La primera fila tiene encabezados', a.headerLooks(g), () => build());
      const box = h('div.list', { style: { maxHeight: '200px', padding: '4px 8px' } });
      let checks = [];
      const build = () => { checks = []; box.replaceChildren(); for (let c = g.c1; c <= g.c2; c++) { const ck = ui.check(header.input.checked && sh.value(g.r1, c) != null ? a.wb.displayText(sh, g.r1, c) : 'Columna ' + HC.colName(c), true); ck.col = c; checks.push(ck); box.appendChild(ck); } };
      build();
      ui.dialog({ title: 'Quitar duplicados de ' + addrOf(g), width: 400, body: h('div', header, h('p.muted', 'Se consideran duplicadas las filas que coinciden en todas las columnas marcadas:'), box), buttons: [{ label: 'Cancelar' }, { label: 'Quitar duplicados', primary: true, action: () => {
        const colsSel = checks.filter((c) => c.input.checked).map((c) => c.col);
        if (!colsSel.length) return false;
        const n = a.wb.removeDuplicates(sh, g, colsSel, header.input.checked);
        ui.toast(n ? 'Se quitaron ' + n + ' filas duplicadas.' : 'No se encontraron filas duplicadas.');
        return true;
      } }] });
    },
    textToColumns() {
      const a = A(), g = a.range;
      const sel = ui.select([[',', 'Coma (,)'], [';', 'Punto y coma (;)'], ['\t', 'Tabulación'], [' ', 'Espacio'], ['|', 'Barra vertical (|)'], ['x', 'Otro…']], ',', () => { other.hidden = sel.value !== 'x'; });
      const other = h('input.inp', { type: 'text', maxlength: 5, placeholder: 'Separador', hidden: true });
      ui.dialog({ title: 'Texto en columnas', width: 380, body: h('div', h('p.muted', 'Divide el texto de la columna ' + HC.colName(g.c1) + ' en varias columnas hacia la derecha.'), h('div.row', ui.field('Separador', sel), other)), buttons: [{ label: 'Cancelar' }, { label: 'Dividir', primary: true, action: () => {
        const d = sel.value === 'x' ? other.value : sel.value;
        if (!d) return false;
        a.wb.textToColumns(a.sheet, { r1: g.r1, c1: g.c1, r2: g.r2, c2: g.c1 }, d);
        return true;
      } }] });
    },

    // ------------------------------------------------------------ tabla dinámica (con fórmulas: se actualiza sola)
    pivot() {
      const a = A(), sh = a.sheet, wb = a.wb, g = a.dataRegion();
      if (!g || g.r2 - g.r1 < 1 || g.c2 === g.c1) { ui.toast('Selecciona una celda dentro de una tabla con encabezados y al menos dos columnas.'); return; }
      const cols = [];
      for (let c = g.c1; c <= g.c2; c++) cols.push([c, wb.displayText(sh, g.r1, c) || 'Columna ' + HC.colName(c)]);
      const numeric = (c) => { for (let r = g.r1 + 1; r <= Math.min(g.r2, g.r1 + 50); r++) if (typeof sh.value(r, c) === 'number') return true; return false; };
      const firstText = cols.find(([c]) => !numeric(c)), firstNum = cols.slice().reverse().find(([c]) => numeric(c));
      const rowSel = ui.select(cols, (firstText || cols[0])[0]);
      const colSel = ui.select([['', '(Ninguna)']].concat(cols), '');
      const valSel = ui.select(cols, (firstNum || cols[cols.length - 1])[0]);
      const opSel = ui.select([['SUM', 'Suma'], ['AVERAGE', 'Promedio'], ['COUNT', 'Cuenta'], ['MAX', 'Máximo'], ['MIN', 'Mínimo']], firstNum ? 'SUM' : 'COUNT');
      const build = () => {
        const rc = +rowSel.value, cc = colSel.value === '' ? null : +colSel.value, vc = +valSel.value, op = opSel.value;
        if (cc === rc) { ui.toast('Elige campos distintos para filas y columnas.'); return false; }
        const name = (c) => cols.find((x) => x[0] === c)[1];
        const field = (c) => HC.quoteSheet(sh.name) + '!' + HC.rangeAddr({ r1: g.r1 + 1, c1: c, r2: g.r2, c2: c }, true);
        const items = (c) => {
          const seen = new Map();
          for (let r = g.r1 + 1; r <= g.r2; r++) { const v = sh.value(r, c); if (v == null || v === '' || v instanceof HC.FErr) continue; const k = typeof v === 'string' ? 's' + v.toLowerCase() : typeof v + v; if (!seen.has(k)) seen.set(k, v); }
          return Array.from(seen.values()).sort(HC.fx.sortCmp);
        };
        const ri = items(rc), ci = cc == null ? null : items(cc);
        if (!ri.length) { ui.toast('La columna de filas no tiene valores.'); return false; }
        if (ri.length > 2000 || (ci && ci.length > 200)) { ui.toast('Demasiados elementos distintos para una tabla dinámica.'); return false; }
        const F = { SUM: 'SUMIFS', AVERAGE: 'AVERAGEIFS', COUNT: 'COUNTIFS', MAX: 'MAXIFS', MIN: 'MINIFS' }[op];
        const agg = (crit) => {
          const c2 = crit.map(([f, ref]) => field(f) + ',' + ref).join(',');
          const f = op === 'COUNT' ? 'COUNTIFS(' + c2 + ')' : F + '(' + field(vc) + (c2 ? ',' + c2 : '') + ')';
          return op === 'AVERAGE' ? 'IFERROR(' + f + ',"")' : f;
        };
        const total = op === 'COUNT' ? 'COUNTA(' + field(rc) + ')' : op + '(' + field(vc) + ')';
        const label = { SUM: 'Suma', AVERAGE: 'Promedio', COUNT: 'Cuenta', MAX: 'Máximo', MIN: 'Mínimo' }[op] + ' de ' + name(vc);
        wb.begin('Tabla dinámica');
        const out = wb.addSheet(wb.uniqueSheetName('Tabla dinámica '), wb.sheets.indexOf(sh) + 1);
        const put = (r, c, v) => (typeof v === 'string' && v[0] === '=' ? wb._put(out, r, c, v.slice(1), null) : wb._put(out, r, c, undefined, v));
        put(0, 0, label + ' por ' + name(rc) + (cc != null ? ' y ' + name(cc) : ''));
        const H = 2, nC = ci ? ci.length : 1;
        put(H, 0, name(rc));
        if (ci) ci.forEach((v, j) => put(H, 1 + j, v)); else put(H, 1, label);
        if (ci) put(H, 1 + nC, 'Total');
        ri.forEach((v, i) => {
          const r = H + 1 + i, rowRef = '$A' + (r + 1);
          put(r, 0, v);
          if (ci) {
            ci.forEach((_, j) => put(r, 1 + j, '=' + agg([[rc, rowRef], [cc, HC.addr(H, 1 + j, true, false)]])));
            put(r, 1 + nC, '=' + agg([[rc, rowRef]]));
          } else put(r, 1, '=' + agg([[rc, rowRef]]));
        });
        const tr = H + 1 + ri.length;
        put(tr, 0, 'Total general');
        if (ci) { ci.forEach((_, j) => put(tr, 1 + j, '=' + agg([[cc, HC.addr(H, 1 + j, true, false)]]))); put(tr, 1 + nC, '=' + total); }
        else put(tr, 1, '=' + total);
        const lastC = ci ? 1 + nC : 1;
        const st = sh.styleAt(g.r1 + 1, vc), nf = op !== 'COUNT' && st && st.nf ? st.nf : op === 'AVERAGE' ? '#,##0.00' : null;
        wb.formatRange(out, [{ r1: 0, c1: 0, r2: 0, c2: 0 }], { b: true, fs: 14 });
        wb.formatRange(out, [{ r1: H, c1: 0, r2: H, c2: lastC }], { b: true, bg: '#ddebf7', bb: 'thin #5b9bd5' });
        wb.formatRange(out, [{ r1: tr, c1: 0, r2: tr, c2: lastC }], { b: true, bt: 'thin #5b9bd5', bg: '#ddebf7' });
        if (ci) wb.formatRange(out, [{ r1: H + 1, c1: lastC, r2: tr, c2: lastC }], { b: true });
        if (nf) wb.formatRange(out, [{ r1: H + 1, c1: 1, r2: tr, c2: lastC }], { nf });
        wb.setSize(out, 'col', 0, Math.max(120, Math.min(260, 8 + Math.max(...ri.map((v) => String(v).length)) * 7)));
        for (let c = 1; c <= lastC; c++) wb.setSize(out, 'col', c, 110);
        wb.setProp(out, 'frozenRows', H + 1);
        wb.commit();
        a.activateSheet(wb.sheets.indexOf(out));
        a.select(H + 1, 1);
        ui.toast('Tabla dinámica creada en «' + out.name + '». Se actualiza sola al cambiar los datos; si aparecen elementos nuevos, vuelve a crearla.', 6000);
        return true;
      };
      ui.dialog({ title: 'Tabla dinámica de ' + HC.rangeAddr(g), width: 440, body: h('div',
        h('p.muted', { style: { marginTop: 0 } }, 'Resume la tabla agrupando por los valores de una columna. El resultado va a una hoja nueva y usa fórmulas, así que se recalcula al cambiar los datos.'),
        h('div.row', ui.field('Filas', rowSel), ui.field('Columnas (opcional)', colSel)),
        h('div.row', ui.field('Valores', valSel), ui.field('Cálculo', opSel))), buttons: [{ label: 'Cancelar' }, { label: 'Crear', primary: true, action: build }] });
    },

    // ------------------------------------------------------------ nombres, buscar objetivo
    names() {
      const a = A(), wb = a.wb, listEl = h('div');
      const render = () => listEl.replaceChildren(...(wb.names.size ? Array.from(wb.names.values()).map((n) => h('div.rule-row', h('b', n.name), h('span.grow.muted', { title: n.f }, '= ' + HC.localizeFormula(n.f)),
        h('button.tb-btn', { type: 'button', title: 'Ir a', onclick: () => { if (a.goTo(n.name)) close(); } }, ui.icon('right')),
        h('button.tb-btn', { type: 'button', title: 'Eliminar', onclick: () => { wb.setName(n.name, null); render(); } }, ui.icon('trash')))) : [h('p.muted', 'No hay nombres definidos. Un nombre permite escribir =SUMA(Ventas) en lugar de =SUMA(B2:B50).')]));
      const nm = h('input.inp', { type: 'text', placeholder: 'Ventas' }), ref = h('input.inp', { type: 'text', value: '=' + HC.quoteSheet(a.sheet.name) + '!' + HC.rangeAddr(a.range, true) });
      const add = () => {
        const name = nm.value.trim();
        if (!HC.Workbook.validName(name) || HC.fns[HC.fnToCanon(name)]) { ui.toast('El nombre debe empezar por una letra, no llevar espacios y no coincidir con una celda o una función.'); return; }
        const f = HC.canonicalizeFormula(ref.value.trim().replace(/^=/, ''));
        if (!f || HC.parseFormula(f).err) { ui.toast('La referencia o fórmula no es válida.'); return; }
        wb.setName(name, f); nm.value = ''; render();
      };
      render();
      const close = ui.dialog({ title: 'Nombres definidos', width: 520, body: h('div', listEl, h('h4', { style: { margin: '14px 0 8px' } }, 'Nuevo nombre'), h('div.row', ui.field('Nombre', nm), ui.field('Se refiere a', ref), h('div.fixed', { style: { marginBottom: '10px' } }, h('button.btn', { type: 'button', onclick: add }, 'Añadir')))), buttons: [{ label: 'Cerrar', primary: true }] });
    },
    goalSeek() {
      const a = A(), s = a.sel;
      const t = h('input.inp', { type: 'text', value: HC.addr(s.r, s.c) }), g = h('input.inp', { type: 'text', placeholder: '1000' }), c = h('input.inp', { type: 'text', placeholder: 'B2' });
      ui.dialog({ title: 'Buscar objetivo', width: 380, body: h('div', h('p.muted', 'Encuentra el valor que debe tener una celda para que una fórmula dé el resultado que buscas.'), ui.field('Celda con la fórmula', t), ui.field('Resultado deseado', g), ui.field('Celda que debe cambiar', c)), buttons: [{ label: 'Cancelar' }, { label: 'Calcular', primary: true, action: () => {
        const tg = HC.parseA1(t.value), cg = HC.parseA1(c.value), goal = num(g.value);
        if (!tg || !cg || goal == null) { ui.toast('Revisa las celdas y el valor objetivo.'); return false; }
        const res = a.wb.goalSeek(a.sheet, { r: tg.r1, c: tg.c1 }, goal, { r: cg.r1, c: cg.c1 });
        ui.toast(res.ok ? 'Solución encontrada: ' + HC.addr(cg.r1, cg.c1) + ' = ' + HC.fmt.general(res.value, 12) : res.msg);
        return res.ok;
      } }] });
    },

    // ------------------------------------------------------------ buscar y reemplazar (panel flotante)
    find(withReplace) {
      const a = A();
      let panel = document.getElementById('find-panel');
      if (panel) { panel._show(withReplace); return; }
      const q = h('input.inp', { type: 'text', placeholder: 'Buscar', 'aria-label': 'Buscar' }), r = h('input.inp', { type: 'text', placeholder: 'Reemplazar por', 'aria-label': 'Reemplazar por' });
      const mc = ui.check('Mayúsculas', false), whole = ui.check('Celda completa', false), inF = ui.check('En fórmulas', false);
      const info = h('span.muted', { 'aria-live': 'polite' });
      const opts = () => ({ matchCase: mc.input.checked, whole: whole.input.checked, formulas: inF.input.checked });
      const matches = () => a.wb.findAll(a.sheet, q.value, opts());
      const go = (dir) => {
        const m = matches();
        if (!m.length) { info.textContent = q.value ? 'Sin resultados' : ''; return null; }
        const s = a.sel;
        let i = m.findIndex((p) => p[0] > s.r || (p[0] === s.r && p[1] > s.c));
        if (dir < 0) { i = -1; for (let k = m.length - 1; k >= 0; k--) if (m[k][0] < s.r || (m[k][0] === s.r && m[k][1] < s.c)) { i = k; break; } if (i < 0) i = m.length - 1; }
        else if (i < 0) i = 0;
        a.select(m[i][0], m[i][1]);
        info.textContent = i + 1 + ' de ' + m.length;
        return m[i];
      };
      const here = () => { const s = a.sel; return matches().some((p) => p[0] === s.r && p[1] === s.c); };
      const replOne = () => { if (!q.value) return; if (!here()) { go(1); return; } a.wb.replaceIn(a.sheet, a.sel.r, a.sel.c, q.value, r.value, opts()); go(1); };
      const replAll = () => {
        const m = matches(); let n = 0;
        if (!m.length) { info.textContent = 'Sin resultados'; return; }
        a.wb.begin('Reemplazar todo');
        for (const p of m) if (a.wb.replaceIn(a.sheet, p[0], p[1], q.value, r.value, opts())) n++;
        a.wb.commit();
        info.textContent = n + ' reemplazos';
      };
      const rowR = h('div.find-row', r, h('button.btn.small', { type: 'button', onclick: replOne }, 'Reemplazar'), h('button.btn.small', { type: 'button', onclick: replAll }, 'Todos'));
      panel = h('div#find-panel', { role: 'search' },
        h('div.find-row', q, h('button.tb-btn', { type: 'button', title: 'Anterior (Mayús+Intro)', onclick: () => go(-1) }, '↑'), h('button.tb-btn', { type: 'button', title: 'Siguiente (Intro)', onclick: () => go(1) }, '↓'), h('button.tb-btn', { type: 'button', title: 'Cerrar (Esc)', onclick: () => hide() }, ui.icon('close', 14))),
        rowR, h('div.find-row.opts', mc, whole, inF, info));
      const hide = () => { panel.remove(); a.focusGrid(); };
      panel._show = (rep) => { rowR.hidden = !rep; q.focus(); q.select(); };
      panel.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') hide(); else if (e.key === 'Enter') { e.preventDefault(); if (e.target === r) replOne(); else go(e.shiftKey ? -1 : 1); } });
      q.addEventListener('input', () => { const n = q.value ? matches().length : 0; info.textContent = q.value ? n + (n === 1 ? ' resultado' : ' resultados') : ''; });
      document.getElementById('main').appendChild(panel);
      panel._show(withReplace);
    },

    // ------------------------------------------------------------ ajustes y ayuda
    settings() {
      const a = A(), s = a.settings;
      const dec = ui.select([['', 'Automático (según el navegador)'], ['.', 'Punto: 1,234.56 — argumentos con coma'], [',', 'Coma: 1.234,56 — argumentos con punto y coma']], s.dec || '');
      const lang = ui.select([['es', 'Español: SUMA, SI, BUSCARV…'], ['en', 'Inglés: SUM, IF, VLOOKUP…']], s.lang || 'es');
      const curr = h('input.inp', { type: 'text', value: s.currency || '$', maxlength: 4, style: { width: '90px' } });
      ui.dialog({ title: 'Configuración', width: 440, body: h('div', ui.field('Separador decimal', dec, 'Afecta a cómo se escriben y se muestran los números y las fórmulas.'), ui.field('Nombres de las funciones', lang, 'Al escribir se aceptan los dos idiomas; aquí eliges cómo se muestran.'), ui.field('Símbolo de moneda', curr)),
        buttons: [{ label: 'Cancelar' }, { label: 'Guardar', primary: true, action: () => { s.dec = dec.value || null; s.lang = lang.value; s.currency = curr.value.trim() || '$'; a.applySettings(true); } }] });
    },
    touchHelp() {
      const steps = [
        ['Seleccionar celdas', 'Toca una celda y arrastra uno de los tiradores verdes para seleccionar un rango.'],
        ['Editar una celda', 'Tócala dos veces para escribir dentro de ella. También puedes tocar la barra de fórmulas. Usa ✓ para aceptar.'],
        ['Autorrellenar', 'Selecciona las celdas de origen, mantén pulsada la selección y elige Autorrellenar con el dedo › Continuar serie o Copiar celdas. Arrastra el tirador cuadrado y suelta para aplicar.'],
        ['Cambiar el tamaño', 'Arrastra con un dedo la línea entre dos letras para ajustar la columna de la izquierda, o la línea entre dos números para ajustar la fila de arriba. Suelta para aplicar el cambio.'],
        ['Desplazarte y cambiar el zoom', 'Desliza un dedo por la cuadrícula para moverte. Junta o separa dos dedos para cambiar el zoom. También puedes elegir 25 % en Ver › Zoom.'],
        ['Filtrar datos', 'Selecciona el rango con sus encabezados, activa Datos › Filtro y toca la flecha de la columna.'],
        ['Abrir y guardar archivos', 'Usa Archivo › Abrir o Archivo › Guardar como para elegir Excel, PDF u otro formato.'],
      ];
      const body = h('div.touch-help', steps.map(([title, instruction]) =>
        h('section', h('h3', title), h('p', instruction))));
      ui.dialog({ title: 'Gestos y acciones', width: 460, body });
    },
    about() {
      ui.alert('Creador: PhD Jhoni cerón', 'Acerca de');
    },
    shortcuts() {
      const rows = [
        ['Moverse y seleccionar'], ['Flechas', 'Mover la celda activa'], ['Mayús + flechas', 'Ampliar la selección'], ['Ctrl + flechas', 'Saltar al borde de los datos'], ['Ctrl + Inicio / Fin', 'Ir a la primera o a la última celda con datos'], ['Ctrl + A', 'Seleccionar todo'], ['Ctrl + Espacio / Mayús + Espacio', 'Seleccionar la columna / la fila'], ['Ctrl + Re Pág / Av Pág', 'Cambiar de hoja'],
        ['Editar'], ['F2 o doble clic', 'Editar la celda'], ['Intro / Tab', 'Aceptar y bajar / ir a la derecha'], ['Alt + Intro', 'Salto de línea dentro de la celda'], ['Ctrl + Intro', 'Escribir lo mismo en toda la selección'], ['Esc', 'Cancelar la edición'], ['F4', 'Alternar referencia fija ($A$1) al escribir una fórmula'], ['Supr', 'Borrar el contenido'], ['Ctrl + Z / Ctrl + Y', 'Deshacer / rehacer'], ['Ctrl + C / X / V', 'Copiar / cortar / pegar'], ['Ctrl + D / Ctrl + R', 'Rellenar hacia abajo / hacia la derecha'], ['Ctrl + ;', 'Escribir la fecha de hoy'], ['Alt + =', 'Autosuma'],
        ['Formato y datos'], ['Ctrl + B / I / U', 'Negrita / cursiva / subrayado'], ['Ctrl + 1', 'Formato de celdas'], ['Ctrl + Mayús + L', 'Activar o quitar el filtro'], ['Ctrl + F / Ctrl + H', 'Buscar / reemplazar'], ['Ctrl + `', 'Mostrar las fórmulas en lugar de los resultados'], ['F9', 'Recalcular todo'],
        ['Archivo'], ['Ctrl + S', 'Descargar como Excel (.xlsx)'], ['Ctrl + O', 'Abrir un archivo'], ['Ctrl + P', 'Imprimir'],
      ];
      const table = h('table.kbd-table', rows.map((r) => (r.length === 1 ? h('tr', h('th', { colspan: 2 }, r[0])) : h('tr', h('td', r[0]), h('td', r[1])))));
      ui.dialog({ title: 'Atajos de teclado', width: 520, body: table });
    },
  });
})();
