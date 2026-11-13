/* Utilidades de interfaz: creación de elementos, iconos, menús emergentes, diálogos y selector de color. */
(function () {
  'use strict';
  const HC = window.HC;
  const ui = (HC.ui = {});

  // h('div.clase#id', {attr}, hijos…): crea un elemento.
  function h(spec, attrs, ...kids) {
    const m = /^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i.exec(spec);
    const el = document.createElement(m[1] || 'div');
    if (m[2]) for (const p of m[2].match(/[.#][\w-]+/g)) { if (p[0] === '.') el.classList.add(p.slice(1)); else el.id = p.slice(1); }
    if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k in el && k !== 'list' && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    const add = (c) => { if (c == null || c === false) return; if (Array.isArray(c)) c.forEach(add); else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c))); };
    kids.forEach(add);
    return el;
  }
  ui.h = h;
  ui.esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  // ---------------------------------------------------------------- iconos (trazos de 16×16)
  const P = {
    undo: 'M4 6h6a3.5 3.5 0 0 1 0 7H6M4 6l3-3M4 6l3 3',
    redo: 'M12 6H6a3.5 3.5 0 0 0 0 7h4M12 6l-3-3M12 6l-3 3',
    print: 'M4.5 6V2.5h7V6M4.5 11.5h-2V6h11v5.5h-2M4.5 9.5h7v4h-7z',
    paint: 'M3 2.5h8v3H3zM11 4h2.5v3.5H8V10M7 10h2v3.5H7z',
    borders: 'M2.5 2.5h11v11h-11zM8 2.5v11M2.5 8h11',
    merge: 'M2.5 4h11v8h-11zM5 8h6M5 8l1.7-1.7M5 8l1.7 1.7M11 8L9.3 6.3M11 8l-1.7 1.7',
    alignL: 'M2.5 4h11M2.5 7h7M2.5 10h11M2.5 13h7',
    alignC: 'M2.5 4h11M4.5 7h7M2.5 10h11M4.5 13h7',
    alignR: 'M2.5 4h11M6.5 7h7M2.5 10h11M6.5 13h7',
    valignT: 'M2.5 2.5h11M8 13.5V6M8 6L5.5 8.5M8 6l2.5 2.5',
    valignM: 'M2.5 8h11M8 2v3.5M8 5.5L6.5 4M8 5.5L9.5 4M8 14v-3.5M8 10.5L6.5 12M8 10.5L9.5 12',
    valignB: 'M2.5 13.5h11M8 2.5V10M8 10L5.5 7.5M8 10l2.5-2.5',
    wrap: 'M2.5 4h11M2.5 8h8.5a2 2 0 0 1 0 4H9M9 12l1.5-1.5M9 12l1.5 1.5M2.5 12h4',
    sum: 'M11.5 3.5h-7l4 4.5-4 4.5h7',
    chart: 'M2.5 13.5h11M4.5 13.5V9M8 13.5V4M11.5 13.5V7',
    filter: 'M2.5 3.5h11l-4.2 5v4.5l-2.6-1.3V8.5z',
    sortAsc: 'M4.5 3v10M4.5 13l-2-2M4.5 13l2-2M9 4.5h2.5M9 8h4M9 11.5h5.5',
    sortDesc: 'M4.5 3v10M4.5 13l-2-2M4.5 13l2-2M9 4.5h5.5M9 8h4M9 11.5h2.5',
    link: 'M6.5 9.5l3-3M7.2 4.6l1-1a2.5 2.5 0 0 1 3.6 3.6l-1 1M8.8 11.4l-1 1a2.5 2.5 0 0 1-3.6-3.6l1-1',
    note: 'M2.5 3h11v8H8l-3 2.5V11H2.5z',
    freeze: 'M2.5 2.5h11v11h-11zM2.5 6h11M6 2.5v11',
    search: 'M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10zM10.6 10.6l3 3',
    plus: 'M8 3v10M3 8h10',
    minus: 'M3 8h10',
    close: 'M4 4l8 8M12 4l-8 8',
    check: 'M3 8.5l3.2 3.2L13 5',
    down: 'M4.5 6.5L8 10l3.5-3.5',
    right: 'M6.5 4.5L10 8l-3.5 3.5',
    menu: 'M2.5 4h11M2.5 8h11M2.5 12h11',
    cond: 'M2.5 2.5h4.5v4.5H2.5zM9 9h4.5v4.5H9zM9 2.5h4.5v4.5H9zM2.5 9h4.5v4.5H2.5z',
    valid: 'M2.5 4.5h11v7h-11zM9.5 4.5v7M10.6 7.4l1 1 1-1',
    download: 'M8 2.5v8M8 10.5l-3-3M8 10.5l3-3M3 13.5h10',
    upload: 'M8 10.5v-8M8 2.5l-3 3M8 2.5l3 3M3 13.5h10',
    file: 'M4 2.5h5l3 3v8H4zM9 2.5v3h3',
    trash: 'M3 4.5h10M6 4.5V3h4v1.5M4.5 4.5l.7 9h5.6l.7-9',
    rows: 'M2.5 3h11v10h-11zM2.5 6.3h11M2.5 9.7h11',
    cols: 'M2.5 3h11v10h-11zM6.2 3v10M9.8 3v10',
    clear: 'M3 13.5h10M5.2 11l-2-2 6-6 4 4-4.5 4.5H5.5z',
    gear: 'M8 10.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4zM8 1.8v1.7M8 12.5v1.7M1.8 8h1.7M12.5 8h1.7M3.6 3.6l1.2 1.2M11.2 11.2l1.2 1.2M12.4 3.6l-1.2 1.2M4.8 11.2l-1.2 1.2',
    help: 'M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM6.2 6.3a1.9 1.9 0 1 1 2.6 1.8c-.5.3-.8.6-.8 1.2M8 11.4v.2',
    copy: 'M5.5 5.5h8v8h-8zM3 10.5h-.5v-8h8V3',
    cut: 'M4.5 13a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4zM11.5 13a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4zM5.7 10L11 2.5M10.3 10L5 2.5',
    paste: 'M5 3.5H3.5v10h9v-10H11M5.5 2.5h5v2h-5z',
    eye: 'M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8zM8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
    table: 'M2.5 3h11v10h-11zM2.5 6.3h11M6.2 6.3V13',
    target: 'M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM8 10.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
    image: 'M2.5 3h11v10h-11zM2.5 11l3.5-3.5 2.5 2.5 2-2 3 3M10.5 6.2h.01',
    moon: 'M13 9.5A5.5 5.5 0 0 1 6.5 3 5.5 5.5 0 1 0 13 9.5z',
  };
  // iconos con relleno o texto
  const SPECIAL = {
    bold: '<text x="8" y="12.5" text-anchor="middle" font-size="12" font-weight="800" font-family="Arial,sans-serif" fill="currentColor" stroke="none">N</text>',
    italic: '<text x="8" y="12.5" text-anchor="middle" font-size="12" font-style="italic" font-family="Georgia,serif" fill="currentColor" stroke="none">K</text>',
    underline: '<text x="8" y="11" text-anchor="middle" font-size="11" font-family="Arial,sans-serif" fill="currentColor" stroke="none">S</text><path d="M3.5 14h9"/>',
    strike: '<text x="8" y="12" text-anchor="middle" font-size="11" font-family="Arial,sans-serif" fill="currentColor" stroke="none">ab</text><path d="M2.5 8.5h11"/>',
    fontColor: '<text x="8" y="10.5" text-anchor="middle" font-size="11" font-weight="700" font-family="Arial,sans-serif" fill="currentColor" stroke="none">A</text><rect class="swatch" x="2.5" y="12.2" width="11" height="2.6" rx=".6" stroke="none"/>',
    fillColor: '<path d="M7 2.5l5 5-4.2 4.2a1 1 0 0 1-1.4 0L3 8.3z"/><path d="M13.2 9.6c.6.9.9 1.4.9 1.8a.9.9 0 0 1-1.8 0c0-.4.3-.9.9-1.8z" fill="currentColor"/><rect class="swatch" x="2.5" y="13" width="11" height="2.2" rx=".6" stroke="none"/>',
    currency: '<text x="8" y="12.5" text-anchor="middle" font-size="12.5" font-family="Arial,sans-serif" fill="currentColor" stroke="none">$</text>',
    percent: '<text x="8" y="12.5" text-anchor="middle" font-size="12.5" font-family="Arial,sans-serif" fill="currentColor" stroke="none">%</text>',
    decMore: '<text x="1" y="8" font-size="6.5" font-family="Arial,sans-serif" fill="currentColor" stroke="none">.0</text><text x="6" y="14.5" font-size="6.5" font-family="Arial,sans-serif" fill="currentColor" stroke="none">.00</text><path d="M9 4.5h5M14 4.5l-1.8-1.8M14 4.5l-1.8 1.8"/>',
    decLess: '<text x="1" y="8" font-size="6.5" font-family="Arial,sans-serif" fill="currentColor" stroke="none">.00</text><text x="8.5" y="14.5" font-size="6.5" font-family="Arial,sans-serif" fill="currentColor" stroke="none">.0</text><path d="M7 11.8H2M2 11.8l1.8-1.8M2 11.8l1.8 1.8"/>',
    fx: '<text x="8" y="12" text-anchor="middle" font-size="11.5" font-style="italic" font-family="Georgia,serif" fill="currentColor" stroke="none">fx</text>',
    num123: '<text x="8" y="11.5" text-anchor="middle" font-size="8.5" font-family="Arial,sans-serif" fill="currentColor" stroke="none">123</text>',
    logo: '<rect x="1.5" y="1.5" width="13" height="13" rx="2" fill="var(--accent)" stroke="none"/><path d="M1.5 6h13M1.5 10.3h13M6 1.5v13" stroke="#fff" stroke-width="1"/>',
  };
  ui.icon = function (name, size) {
    const span = h('span.ico');
    const body = SPECIAL[name] || '<path d="' + (P[name] || '') + '"/>';
    span.innerHTML = '<svg viewBox="0 0 16 16" width="' + (size || 16) + '" height="' + (size || 16) + '" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
    return span;
  };

  // ---------------------------------------------------------------- capas emergentes
  const layer = () => document.getElementById('popups') || document.body.appendChild(h('div#popups'));
  const stack = [];
  function closeFrom(i) { while (stack.length > i) { const p = stack.pop(); p.el.remove(); if (p.onClose) p.onClose(); } }
  ui.closePopups = () => closeFrom(0);
  ui.popupOpen = () => stack.length > 0;
  document.addEventListener('pointerdown', (e) => {
    if (!stack.length) return;
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].el.contains(e.target) || (stack[i].anchor && stack[i].anchor.contains && stack[i].anchor.contains(e.target))) { closeFrom(i + 1); return; }
    }
    closeFrom(0);
  }, true);
  window.addEventListener('blur', () => closeFrom(0));
  window.addEventListener('resize', () => {
    if (stack[0]?.reposition) {
      closeFrom(1);
      stack[0].reposition();
    } else closeFrom(0);
  });
  // Muestra el elemento junto a un ancla (elemento o {x, y}). opts: {side: 'bottom'|'right', level, onClose}
  ui.popup = function (el, at, opts) {
    opts = opts || {};
    const level = opts.level || 0;
    closeFrom(level);
    el.classList.add('popup');
    layer().appendChild(el);
    function position() {
      const vw = window.innerWidth, vh = window.innerHeight;
      if (opts.keepOnResize) el.style.maxHeight = Math.max(120, vh - 12) + 'px';
      const w = el.offsetWidth, hh = el.offsetHeight;
      let x, y;
      if (at instanceof Element) {
        const r = at.getBoundingClientRect();
        if (opts.side === 'right') { x = r.right - 2; y = r.top - 4; } else { x = r.left; y = r.bottom + 2; }
        if (x + w > vw - 4) x = opts.side === 'right' ? Math.max(4, r.left - w + 2) : Math.max(4, vw - w - 4);
        if (y + hh > vh - 4) y = opts.side === 'right' ? Math.max(4, vh - hh - 4) : r.top - hh - 2 > 4 ? r.top - hh - 2 : Math.max(4, vh - hh - 4);
      } else {
        x = Math.max(4, Math.min(at.x, vw - w - 4));
        y = Math.max(4, Math.min(at.y, vh - hh - 4));
      }
      el.style.left = Math.round(x) + 'px'; el.style.top = Math.round(y) + 'px';
      el.style.maxHeight = Math.max(120, vh - Math.max(4, y) - 8) + 'px';
    }
    position();
    const rec = { el, anchor: at instanceof Element ? at : null, onClose: opts.onClose, level, reposition: opts.keepOnResize ? position : null };
    stack.push(rec);
    return () => { const i = stack.indexOf(rec); if (i >= 0) closeFrom(i); };
  };

  // items: [{label, icon, key, action, checked, disabled, sub: [...], hint} | '-' ]
  ui.menu = function (items, at, opts) {
    opts = opts || {};
    const level = opts.level || 0;
    const el = h('div.menu', { tabindex: '-1', role: 'menu' });
    let active = -1;
    const rows = [];
    const setActive = (i, openSub) => {
      if (active >= 0 && rows[active]) rows[active].el.classList.remove('active');
      active = i;
      closeFrom(level + 1);
      if (i < 0 || !rows[i]) return;
      rows[i].el.classList.add('active');
      rows[i].el.scrollIntoView({ block: 'nearest' });
      const it = rows[i].item;
      if (it.sub && openSub && !it.disabled) ui.menu(typeof it.sub === 'function' ? it.sub() : it.sub, rows[i].el, { side: 'right', level: level + 1, parent: el });
    };
    const run = (it) => {
      if (it.disabled) return;
      if (it.sub) return;
      closeFrom(0);
      if (it.action) it.action();
    };
    items.forEach((it) => {
      if (!it) return;
      if (it === '-') { el.appendChild(h('div.menu-sep')); return; }
      if (it.title) { el.appendChild(h('div.menu-title', it.title)); return; }
      const row = h('div.menu-item' + (it.disabled ? '.disabled' : ''), { role: 'menuitem' },
        h('span.menu-ico', it.checked ? ui.icon('check', 14) : it.icon ? ui.icon(it.icon, 15) : it.swatch ? h('span.menu-swatch', { style: { background: it.swatch } }) : null),
        h('span.menu-label', it.label),
        it.key ? h('span.menu-key', it.key) : null,
        it.sub ? h('span.menu-arrow', ui.icon('right', 12)) : null);
      const idx = rows.length;
      rows.push({ el: row, item: it });
      row.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') setActive(idx, true); });
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        if (it.sub && (e.pointerType === 'touch' || e.sourceCapabilities?.firesTouchEvents)) setActive(idx, true);
        else run(it);
      });
      el.appendChild(row);
    });
    el.addEventListener('keydown', (e) => {
      const n = rows.length;
      const step = (d) => { if (!n) return; let i = active; for (let k = 0; k < n; k++) { i = (i + d + n) % n; if (!rows[i].item.disabled) break; } setActive(i, false); };
      if (e.key === 'ArrowDown') { step(1); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { step(-1); e.preventDefault(); }
      else if (e.key === 'Home') { active = -1; step(1); e.preventDefault(); }
      else if (e.key === 'End') { active = 0; step(-1); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { if (active >= 0 && rows[active].item.sub) { setActive(active, true); const top = stack[stack.length - 1]; if (top && top.el !== el) top.el.focus(); } else if (opts.onSide) opts.onSide(1); e.preventDefault(); }
      else if (e.key === 'ArrowLeft') { if (opts.parent) { closeFrom(level); opts.parent.focus(); } else if (opts.onSide) opts.onSide(-1); e.preventDefault(); }
      else if (e.key === 'Enter' || e.key === ' ') { if (active >= 0) { const it = rows[active].item; if (it.sub) { setActive(active, true); const top = stack[stack.length - 1]; if (top && top.el !== el) top.el.focus(); } else run(it); } e.preventDefault(); }
      else if (e.key === 'Escape') { closeFrom(level); if (opts.parent) opts.parent.focus(); e.preventDefault(); }
      e.stopPropagation();
    });
    const close = ui.popup(el, at, { side: opts.side, level, onClose: () => { if (opts.onClose) opts.onClose(); if (level === 0 && HC.app && !ui.dialogOpen()) HC.app.focusGrid(); } });
    el.focus({ preventScroll: true });
    return close;
  };

  // ---------------------------------------------------------------- diálogos
  const dialogs = [];
  ui.dialogOpen = () => dialogs.length > 0;
  ui.handleAndroidBack = () => {
    if (ui.popupOpen()) { ui.closePopups(); return true; }
    if (ui.dialogOpen()) { dialogs[dialogs.length - 1].close(); return true; }
    if (HC.app && HC.app.edit) { HC.app.cancelEdit(); return true; }
    if (HC.app?.cancelTouchFill?.()) return true;
    return false;
  };
  // opts: {title, body, buttons: [{label, primary, danger, action (devuelve false para no cerrar)}], width, onClose}
  ui.dialog = function (opts) {
    closeFrom(0);
    const body = h('div.dlg-body', opts.body);
    const foot = h('div.dlg-foot');
    const panel = h('div.dlg', { role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title, style: { width: (opts.width || 420) + 'px' } },
      h('div.dlg-head', h('span.dlg-title', opts.title), h('button.dlg-x', { type: 'button', title: 'Cerrar', onclick: () => close() }, ui.icon('close', 14))),
      body, foot);
    const back = h('div.dlg-back', panel);
    let closed = false;
    function close(result) {
      if (closed) return;
      closed = true; back.remove();
      const i = dialogs.indexOf(rec); if (i >= 0) dialogs.splice(i, 1);
      if (opts.onClose) opts.onClose(result);
      if (!dialogs.length && HC.app) HC.app.focusGrid();
    }
    let primary = null;
    for (const b of opts.buttons || [{ label: 'Cerrar', primary: true }]) {
      const btn = h('button.btn' + (b.primary ? '.primary' : '') + (b.danger ? '.danger' : ''), { type: 'button' }, b.label);
      btn.addEventListener('click', () => { const r = b.action ? b.action() : undefined; if (r !== false) close(r); });
      if (b.primary) primary = btn;
      foot.appendChild(btn);
    }
    back.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { close(); e.preventDefault(); }
      else if (e.key === 'Enter' && primary && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON' && !(e.target.tagName === 'SELECT')) { primary.click(); e.preventDefault(); }
      else if (e.key === 'Tab') {
        const f = Array.from(panel.querySelectorAll('input,select,textarea,button,[tabindex]')).filter((x) => !x.disabled && x.offsetParent !== null && x.tabIndex >= 0);
        if (f.length) { const first = f[0], last = f[f.length - 1]; if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); } else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); } }
      }
      e.stopPropagation();
    });
    // preventDefault: si no, el navegador mueve el foco al documento al soltar el clic y la cuadrícula deja de recibir teclas
    back.addEventListener('pointerdown', (e) => { if (e.target === back) { e.preventDefault(); close(); } });
    panel.tabIndex = -1;
    document.body.appendChild(back);
    const rec = { close, panel };
    dialogs.push(rec);
    // primer control visible (los de pestañas ocultas no pueden recibir el foco)
    const visible = (sel) => Array.from(panel.querySelectorAll(sel)).find((x) => x.offsetParent !== null && !x.disabled);
    const focusEl = visible('[autofocus]') || visible('.dlg-body input:not([type=checkbox]):not([type=radio]), .dlg-body select, .dlg-body textarea') || primary || visible('button');
    if (focusEl) { focusEl.focus(); if (focusEl.select && focusEl.tagName === 'INPUT') focusEl.select(); }
    if (!panel.contains(document.activeElement)) panel.focus();
    return close;
  };
  ui.alert = (msg, title) => new Promise((res) => ui.dialog({ title: title || 'Hoja de cálculo', body: h('p.dlg-msg', msg), buttons: [{ label: 'Aceptar', primary: true }], onClose: () => res() }));
  ui.confirm = (msg, opts) => new Promise((res) => {
    let ok = false;
    ui.dialog({ title: (opts && opts.title) || 'Confirmar', body: h('p.dlg-msg', msg), buttons: [{ label: 'Cancelar' }, { label: (opts && opts.ok) || 'Aceptar', primary: true, danger: opts && opts.danger, action: () => { ok = true; } }], onClose: () => res(ok) });
  });
  ui.prompt = (label, value, opts) => new Promise((res) => {
    const input = h('input.inp', { type: 'text', value: value == null ? '' : value, autofocus: true });
    let out = null;
    ui.dialog({ title: (opts && opts.title) || 'Hoja de cálculo', body: ui.field(label, input), buttons: [{ label: 'Cancelar' }, { label: 'Aceptar', primary: true, action: () => { out = input.value; } }], onClose: () => res(out) });
  });
  let toastTimer = null;
  ui.toast = function (msg, ms) {
    let t = document.getElementById('toast');
    if (!t) t = document.body.appendChild(h('div#toast', { role: 'status', 'aria-live': 'polite' }));
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms || 3200);
  };

  // ---------------------------------------------------------------- controles de formulario
  ui.field = (label, control, hint) => h('label.field', h('span.field-label', label), control, hint ? h('span.field-hint', hint) : null);
  ui.select = function (options, value, onchange) {
    const s = h('select.inp');
    for (const o of options) { const [v, t] = Array.isArray(o) ? o : [o, o]; s.appendChild(h('option', { value: v, selected: String(v) === String(value) }, t)); }
    if (onchange) s.addEventListener('change', () => onchange(s.value));
    return s;
  };
  ui.check = function (label, checked, onchange) {
    const c = h('input', { type: 'checkbox', checked: !!checked });
    if (onchange) c.addEventListener('change', () => onchange(c.checked));
    const l = h('label.check', c, h('span', label));
    l.input = c;
    return l;
  };
  ui.tabs = function (defs) { // [{label, body}]
    const heads = h('div.tabs-head', { role: 'tablist' }), bodies = h('div.tabs-body');
    defs.forEach((d, i) => {
      const b = h('button.tab' + (i ? '' : '.on'), { type: 'button', role: 'tab' }, d.label);
      const pane = h('div.tab-pane', { hidden: i > 0 }, d.body);
      b.addEventListener('click', () => { Array.from(heads.children).forEach((x, k) => { x.classList.toggle('on', k === i); bodies.children[k].hidden = k !== i; }); });
      heads.appendChild(b); bodies.appendChild(pane);
    });
    return h('div.tabs', heads, bodies);
  };

  // ---------------------------------------------------------------- selector de color
  const BASE = ['#000000', '#ffffff', '#e7e6e6', '#44546a', '#4472c4', '#ed7d31', '#a5a5a5', '#ffc000', '#5b9bd5', '#70ad47'];
  const tint = (hex, t) => (t >= 0 ? HC.mixColor(hex, '#ffffff', t) : HC.mixColor(hex, '#000000', -t));
  const ROWS = [0, 0.8, 0.6, 0.4, -0.25, -0.5];
  ui.PALETTE = ROWS.map((t, i) => BASE.map((c, j) => {
    if (!i) return c;
    if (j === 0) return tint('#000000', [0, 0.5, 0.35, 0.25, 0.15, 0.05][i]);
    if (j === 1) return tint('#ffffff', [0, -0.05, -0.15, -0.25, -0.35, -0.5][i]);
    return tint(c, t);
  }));
  ui.STANDARD = ['#c00000', '#ff0000', '#ffc000', '#ffff00', '#92d050', '#00b050', '#00b0f0', '#0070c0', '#002060', '#7030a0'];
  // opts: {value, autoLabel ('Automático' / 'Sin relleno'), onPick(color|null), level}
  ui.colorPicker = function (at, opts) {
    const el = h('div.colorpick');
    const pick = (c) => { ui.closePopups(); opts.onPick(c); };
    if (opts.autoLabel) el.appendChild(h('button.cp-auto', { type: 'button', onclick: () => pick(null) }, opts.autoLabel));
    const grid = h('div.cp-grid');
    const sw = (c) => h('button.cp-sw' + (opts.value && opts.value.toLowerCase() === c ? '.on' : ''), { type: 'button', title: c, style: { background: c }, 'aria-label': 'Color ' + c, onclick: () => pick(c) });
    ui.PALETTE.forEach((row) => row.forEach((c) => grid.appendChild(sw(c))));
    el.appendChild(grid);
    el.appendChild(h('div.cp-label', 'Colores estándar'));
    const std = h('div.cp-grid'); ui.STANDARD.forEach((c) => std.appendChild(sw(c))); el.appendChild(std);
    const native = h('input', { type: 'color', value: opts.value || '#000000' });
    native.addEventListener('change', () => pick(native.value));
    el.appendChild(h('label.cp-more', h('span', 'Más colores…'), native));
    return ui.popup(el, at, { level: opts.level || 0 });
  };

  let resolveAndroidExport = null;
  ui.androidExportResult = (status) => {
    const saved = status === 'saved';
    const resolve = resolveAndroidExport;
    resolveAndroidExport = null;
    if (resolve) resolve(saved);
    if (saved) ui.toast('Archivo guardado.');
    else if (status === 'error') ui.alert('No se pudo guardar el archivo.', 'Guardar archivo');
  };

  function readBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.slice(reader.result.indexOf(',') + 1));
      reader.onerror = reader.onabort = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  ui.download = async function (blob, filename) {
    const bridge = window.AndroidSpreadsheet;
    if (bridge) {
      if (resolveAndroidExport || !bridge.beginExport()) {
        ui.toast('No se pudo iniciar el guardado.');
        return false;
      }
      const result = new Promise((resolve) => { resolveAndroidExport = resolve; });
      try {
        const chunkSize = 192 * 1024;
        for (let offset = 0; offset < blob.size; offset += chunkSize) {
          const chunk = await readBase64(blob.slice(offset, offset + chunkSize));
          if (!bridge.appendExport(chunk)) throw new Error('Error al preparar el archivo.');
        }
        if (!bridge.finishExport(filename)) throw new Error('Error al elegir el destino.');
      } catch (error) {
        bridge.abortExport();
        ui.androidExportResult('error');
      }
      return result;
    }
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: filename });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  };
  ui.pickFile = (accept) => new Promise((res) => {
    const inp = h('input', { type: 'file', accept, style: { display: 'none' } });
    inp.addEventListener('change', () => { res(inp.files[0] || null); inp.remove(); });
    inp.addEventListener('cancel', () => { res(null); inp.remove(); });
    document.body.appendChild(inp); inp.click();
  });
})();
