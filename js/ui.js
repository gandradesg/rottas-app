// Helpers de UI: html``, toasts, modais, ícones
// html`` é uma tagged template que gera DOM nodes (similar a JSX-light, sem React)

// ----- HTML template helper (parser básico) -----
// Uso: const node = html`<div class="x">${variavel}</div>`;
// Suporta: strings, numbers, nodes, arrays de nodes, event handlers via on:event=${fn}
const PLACEHOLDER = '​__PH__​';
const TPL_CACHE = new WeakMap();

export function html(strings, ...values) {
  const tpl = TPL_CACHE.get(strings) || (() => {
    const t = document.createElement('template');
    t.innerHTML = strings.join(`<!--${PLACEHOLDER}-->`);
    TPL_CACHE.set(strings, t);
    return t;
  })();
  const frag = tpl.content.cloneNode(true);
  // Walk and replace comment placeholders
  const walker = document.createTreeWalker(frag, NodeFilter.SHOW_COMMENT);
  const placeholders = [];
  let n;
  while ((n = walker.nextNode())) {
    if (n.nodeValue === PLACEHOLDER) placeholders.push(n);
  }
  placeholders.forEach((ph, i) => {
    const v = values[i];
    if (v == null || v === false) {
      ph.remove();
    } else if (Array.isArray(v)) {
      const f = document.createDocumentFragment();
      v.forEach(item => {
        if (item == null || item === false) return;
        f.appendChild(item instanceof Node ? item : document.createTextNode(String(item)));
      });
      ph.replaceWith(f);
    } else if (v instanceof Node) {
      ph.replaceWith(v);
    } else {
      ph.replaceWith(document.createTextNode(String(v)));
    }
  });
  // Process attribute event handlers (data-on-EVENT="__PH__" pattern is workaround)
  // Simpler: caller adds events after via .addEventListener.
  return frag.children.length === 1 ? frag.firstElementChild : frag;
}

export function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') e.innerHTML = v;
    else if (v === true) e.setAttribute(k, '');
    else if (v != null && v !== false) e.setAttribute(k, v);
  }
  children.flat(Infinity).forEach(c => {
    if (c == null || c === false) return;
    e.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  });
  return e;
}

// ----- Toasts -----
export function toast(message, type = 'info', duration = 3500) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const icons = {
    success: '✓',
    error:   '✕',
    info:    'ℹ',
    warning: '⚠',
  };
  const t = el('div', { class: `toast toast-${type}` },
    el('span', { class: 'text-lg', style: { color: type==='success'?'#10B981':type==='error'?'#EF4444':type==='warning'?'#F59E0B':'#3B82F6' } }, icons[type] || ''),
    el('span', { class: 'flex-1 text-sm font-medium' }, message),
  );
  root.appendChild(t);
  setTimeout(() => {
    t.style.transition = 'opacity .25s, transform .25s';
    t.style.opacity = '0';
    t.style.transform = 'translateX(20px)';
    setTimeout(() => t.remove(), 260);
  }, duration);
}

// ----- Modal -----
export function modal({ title, content, footer, onClose, size = 'md' }) {
  const root = document.getElementById('modal-root');
  const overlay = el('div', { class: 'modal-overlay' });
  const sizeClass = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size] || 'max-w-lg';

  const close = () => {
    overlay.style.transition = 'opacity .15s';
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 150);
    onClose?.();
  };

  const content_div = el('div', { class: `modal-content ${sizeClass}` });
  if (title) content_div.appendChild(el('div', { class: 'flex items-center justify-between p-5 border-b border-border' },
    el('h2', { class: 'text-lg font-bold' }, title),
    el('button', { class: 'p-1 hover:bg-bg-elev rounded-lg transition', onclick: close }, '✕')
  ));
  content_div.appendChild(el('div', { class: 'p-5' }, content instanceof Node ? content : el('div', { html: content })));
  if (footer) content_div.appendChild(el('div', { class: 'flex items-center justify-end gap-2 p-4 border-t border-border' },
    ...(Array.isArray(footer) ? footer : [footer])
  ));
  overlay.appendChild(content_div);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  root.appendChild(overlay);
  return { close, overlay, content: content_div };
}

export function confirmModal({ title='Confirmar', message, confirmLabel='Confirmar', cancelLabel='Cancelar', danger=false }) {
  return new Promise((resolve) => {
    let resolved = false;
    const safeResolve = (val) => { if (!resolved) { resolved = true; resolve(val); } };
    const cancelBtn = el('button', { class: 'btn btn-ghost', onclick: () => { safeResolve(false); m.close(); } }, cancelLabel);
    const okBtn = el('button', {
      class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`,
      onclick: () => { safeResolve(true); m.close(); }
    }, confirmLabel);
    const m = modal({
      title, size: 'sm',
      content: el('p', { class: 'text-fg-muted' }, message),
      footer: [cancelBtn, okBtn],
      onClose: () => safeResolve(false),
    });
  });
}

// ----- Ícones (Lucide-style, inline SVG) -----
const ICONS = {
  home: 'M3 12l9-9 9 9v9a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2v-9z',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  mapPin: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  building: 'M3 21h18 M5 21V7l8-4v18 M19 21V11l-6-4 M9 9h0 M9 13h0 M9 17h0',
  fileText: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
  globe: 'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z M3 12h18 M12 3a14 14 0 0 1 0 18 M12 3a14 14 0 0 0 0 18',
  trendingUp: 'M23 6l-9.5 9.5-5-5L1 18 M17 6h6v6',
  barChart: 'M12 20V10 M18 20V4 M6 20v-6',
  trophy: 'M8 21h8 M12 17v4 M7 4h10v5a5 5 0 0 1-10 0V4z M17 4h2a2 2 0 0 1 2 2v0a4 4 0 0 1-4 4 M7 4H5a2 2 0 0 0-2 2v0a4 4 0 0 0 4 4',
  plus: 'M12 5v14 M5 12h14',
  check: 'M20 6L9 17l-5-5',
  x: 'M18 6L6 18 M6 6l12 12',
  edit: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z',
  trash: 'M3 6h18 M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2 M10 11v6 M14 11v6',
  search: 'M21 21l-6-6 M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z',
  filter: 'M22 3H2l8 9.46V19l4 2v-8.54L22 3z',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3',
  camera: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  mic: 'M12 1a3 3 0 0 0-3 3v8a3 3 0 1 0 6 0V4a3 3 0 0 0-3-3z M19 10v2a7 7 0 1 1-14 0v-2 M12 19v4 M8 23h8',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9',
  moon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z M12 1v2 M12 21v2 M4.22 4.22l1.42 1.42 M18.36 18.36l1.42 1.42 M1 12h2 M21 12h2 M4.22 19.78l1.42-1.42 M18.36 5.64l1.42-1.42',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  arrowLeft: 'M19 12H5 M12 19l-7-7 7-7',
  chevronRight: 'M9 18l6-6-6-6',
  chevronDown: 'M6 9l6 6 6-6',
  calendar: 'M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z M16 2v4 M8 2v4 M3 10h18',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 3',
  dollarSign: 'M12 1v22 M17 5H9.5a3.5 3.5 0 1 0 0 7h5a3.5 3.5 0 1 1 0 7H6',
  phone: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.72 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0 1 22 16.92z',
  mail: 'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6',
  list: 'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
  thermometer: 'M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z',
};

export function icon(name, size = 20, className = '') {
  const path = ICONS[name];
  if (!path) return el('span', {}, '');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('class', className);
  // suportar múltiplos paths separados por " M"
  const parts = path.split(/\s(?=M[\s\d])/);
  parts.forEach(p => {
    const path_el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path_el.setAttribute('d', p.trim().startsWith('M') ? p.trim() : 'M'+p.trim());
    svg.appendChild(path_el);
  });
  return svg;
}

// Loading spinner inline
export function spinner(dark = false) {
  return el('span', { class: `spinner ${dark ? 'spinner-dark' : ''}` });
}

// Skeleton placeholder
export function skeleton(className = 'h-4 w-full') {
  return el('div', { class: `skeleton ${className}` });
}

// Botão com loading state
export function loadingBtn(btn, loading) {
  if (loading) {
    btn._original = btn._original || btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '';
    btn.appendChild(spinner());
  } else if (btn._original) {
    btn.disabled = false;
    btn.innerHTML = btn._original;
    btn._original = null;
  }
}

// Formatadores
export const fmt = {
  currency: (v) => v == null ? '—' : new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(v),
  // Compacto em milhões: 2.600.000 → "R$ 2,6 mi"
  currencyMillions: (v) => {
    if (v == null) return '—';
    if (Math.abs(v) < 1) return 'R$ 0';
    const m = v / 1_000_000;
    const s = m.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
    return `R$ ${s} mi`;
  },
  date: (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—',
  time: (d) => d ? new Date(d).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' }) : '—',
  dateTime: (d) => d ? new Date(d).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—',
  // "há X horas" relativo
  relative: (d) => {
    if (!d) return '—';
    const diff = (new Date() - new Date(d)) / 1000;
    if (diff < 60) return 'agora';
    if (diff < 3600) return `há ${Math.floor(diff/60)} min`;
    if (diff < 86400) return `há ${Math.floor(diff/3600)} h`;
    if (diff < 604800) return `há ${Math.floor(diff/86400)} d`;
    return new Date(d).toLocaleDateString('pt-BR');
  },
  number: (v) => v == null ? '—' : new Intl.NumberFormat('pt-BR').format(v),
};

// Inicial do nome para avatar
export function initials(name='') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0,2).toUpperCase();
  return (parts[0][0] + parts[parts.length-1][0]).toUpperCase();
}

// Avatar visual
export function avatar(name, size = 36) {
  return el('div', {
    class: 'rounded-full flex items-center justify-center font-bold text-white',
    style: {
      width: size+'px', height: size+'px',
      background: 'linear-gradient(135deg, #F26B22, #D5530F)',
      fontSize: (size*0.4)+'px',
    }
  }, initials(name));
}
