// Componentes de formulário reutilizáveis
import { el, icon, toast } from '../ui.js';
import { supabase, state, loadLists } from '../supabase.js';
import { MAX_PHOTOS_PER_ACTIVITY } from '../config.js';

// Campo wrapper com label
export function field(labelText, control, opts = {}) {
  const { required, help } = opts;
  const wrap = el('div', { class: 'flex flex-col gap-1' },
    el('label', { class: 'label ' + (required ? 'label-required' : '') }, labelText),
    control,
  );
  if (help) wrap.appendChild(el('p', { class: 'text-xs text-fg-subtle mt-1' }, help));
  return wrap;
}

// Select com opção "Adicionar novo..." (criable)
// items: array de { id, nome }
// allowAdd: se true, mostra opção "+ Adicionar..." que abre prompt
// onAdd: callback async (nome) => item criado
export function creatableSelect({ name, items, value, required, allowAdd = false, onAdd }) {
  const wrap = el('div', { class: 'relative' });
  const hidden = el('input', { type: 'hidden', name, value: value || '', required: required || false });

  const display = el('button', {
    type: 'button',
    class: 'select text-left flex items-center justify-between'
  });
  let labelSpan = el('span', { class: 'truncate' }, value || el('span', { class: 'text-fg-subtle' }, 'Selecione...'));
  display.appendChild(labelSpan);
  display.appendChild(icon('chevronDown', 16, 'text-fg-subtle flex-shrink-0'));

  const popup = el('div', {
    class: 'absolute z-40 left-0 right-0 mt-1 card max-h-72 overflow-y-auto hidden animate-fade-in',
    style: { top: '100%' }
  });
  const search = el('input', {
    class: 'input rounded-none border-0 border-b border-border bg-transparent sticky top-0 z-10',
    placeholder: 'Buscar...'
  });
  const list = el('div', { class: 'flex flex-col p-1' });
  popup.append(search, list);

  function setValue(v) {
    hidden.value = v || '';
    const newSpan = el('span', { class: 'truncate ' + (v ? '' : 'text-fg-subtle') }, v || 'Selecione...');
    labelSpan.replaceWith(newSpan);
    labelSpan = newSpan;
  }

  function renderList(filter = '') {
    list.innerHTML = '';
    const f = filter.trim().toLowerCase();
    const filtered = items.filter(i => i.nome.toLowerCase().includes(f));
    if (!filtered.length && !allowAdd) {
      list.appendChild(el('div', { class: 'text-xs text-fg-muted px-3 py-3 text-center' }, 'Nenhum resultado'));
    }
    filtered.forEach(i => {
      list.appendChild(el('button', {
        type: 'button',
        class: 'text-left px-3 py-2 rounded-lg hover:bg-bg-elev text-sm flex items-center justify-between',
        onclick: () => { setValue(i.nome); close(); }
      },
        el('span', { class: 'truncate' }, i.nome),
        i.nome === hidden.value ? icon('check', 16, 'text-rottas-500') : null,
      ));
    });
    if (allowAdd && f && !items.some(i => i.nome.toLowerCase() === f)) {
      list.appendChild(el('button', {
        type: 'button',
        class: 'text-left px-3 py-2 rounded-lg hover:bg-rottas-50 text-sm flex items-center gap-2 text-rottas-600 font-semibold border-t border-border mt-1 pt-2',
        onclick: async () => {
          try {
            const newItem = onAdd ? await onAdd(filter.trim()) : { nome: filter.trim() };
            if (newItem?.nome) {
              items.push(newItem);
              setValue(newItem.nome);
              close();
              toast(`"${newItem.nome}" adicionado`, 'success');
            }
          } catch (err) {
            toast(err.message || 'Erro ao adicionar', 'error');
          }
        }
      },
        icon('plus', 16),
        `Adicionar "${filter.trim()}"`,
      ));
    }
  }

  function open() {
    popup.classList.remove('hidden');
    setTimeout(() => search.focus(), 50);
    renderList();
    document.addEventListener('click', outsideClick);
  }
  function close() {
    popup.classList.add('hidden');
    document.removeEventListener('click', outsideClick);
    search.value = '';
  }
  function outsideClick(e) { if (!wrap.contains(e.target)) close(); }

  display.addEventListener('click', (e) => {
    e.stopPropagation();
    if (popup.classList.contains('hidden')) open(); else close();
  });
  search.addEventListener('input', (e) => renderList(e.target.value));
  search.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  wrap.append(hidden, display, popup);
  if (value) setValue(value);
  return wrap;
}

// Cria nova imobiliária no banco
export async function addImobiliaria(nome) {
  const { data, error } = await supabase.from('imobiliarias').insert({ nome }).select().single();
  if (error) throw error;
  await loadLists();
  return data;
}

// Upload de fotos com preview
export function photoPicker({ name = 'fotos', max = MAX_PHOTOS_PER_ACTIVITY }) {
  const wrap = el('div', { class: 'flex flex-col gap-2' });
  const previews = el('div', { class: 'grid grid-cols-3 gap-2' });
  const files = []; // { file, url }

  const input = el('input', {
    type: 'file', accept: 'image/*', multiple: true,
    capture: 'environment', class: 'hidden', name,
  });

  const addBtn = el('button', {
    type: 'button',
    class: 'btn btn-secondary w-full flex items-center justify-center gap-2',
    onclick: () => input.click(),
  }, icon('camera', 18), `Adicionar foto (${files.length}/${max})`);

  function refresh() {
    previews.innerHTML = '';
    files.forEach((f, idx) => {
      const item = el('div', { class: 'relative aspect-square rounded-lg overflow-hidden bg-bg-elev' },
        el('img', { src: f.url, class: 'w-full h-full object-cover' }),
        el('button', {
          type: 'button',
          class: 'absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center',
          onclick: () => { URL.revokeObjectURL(f.url); files.splice(idx,1); refresh(); }
        }, icon('x', 14)),
      );
      previews.appendChild(item);
    });
    addBtn.innerHTML = '';
    addBtn.append(icon('camera', 18), document.createTextNode(` Adicionar foto (${files.length}/${max})`));
    addBtn.disabled = files.length >= max;
    if (files.length >= max) addBtn.classList.add('opacity-50');
    else addBtn.classList.remove('opacity-50');
  }

  input.addEventListener('change', (e) => {
    const newFiles = Array.from(e.target.files || []);
    for (const file of newFiles) {
      if (files.length >= max) {
        toast(`Máximo ${max} fotos`, 'warning');
        break;
      }
      files.push({ file, url: URL.createObjectURL(file) });
    }
    input.value = '';
    refresh();
  });

  wrap.append(previews, addBtn, input);
  refresh();

  // expor api para o pai pegar os files
  wrap.getFiles = () => files.map(f => f.file);
  return wrap;
}

// Botão de captura de localização com preview de mapa
export function locationField() {
  const wrap = el('div', { class: 'card p-3 flex flex-col gap-2' });
  const status = el('div', { class: 'text-sm text-fg-muted flex items-center gap-2' },
    icon('mapPin', 16, 'text-rottas-500'),
    el('span', {}, 'Aguardando captura de localização...')
  );
  const btn = el('button', {
    type: 'button', class: 'btn btn-secondary btn-sm w-full',
  }, icon('mapPin', 16), 'Capturar localização agora');

  const mapPreview = el('div', {});
  let coords = null;

  function showMap(lat, lng) {
    mapPreview.innerHTML = '';
    const embedUrl = `https://www.google.com/maps?q=${lat},${lng}&z=15&output=embed`;
    const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
    const container = el('div', { class: 'rounded-xl overflow-hidden border border-border mt-2', style: { height: '150px' } });
    const iframe = document.createElement('iframe');
    iframe.src = embedUrl;
    iframe.width = '100%';
    iframe.height = '150';
    iframe.style.cssText = 'border:0; display:block;';
    iframe.loading = 'lazy';
    iframe.setAttribute('allowfullscreen', '');
    iframe.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
    container.appendChild(iframe);
    mapPreview.append(
      container,
      el('a', {
        class: 'mt-1.5 text-xs text-rottas-500 font-semibold inline-flex items-center gap-1 hover:underline',
        href: mapsUrl, target: '_blank', rel: 'noopener'
      }, icon('mapPin', 12), 'Abrir no Google Maps'),
    );
  }

  async function capture() {
    btn.disabled = true; btn.textContent = 'Capturando...';
    try {
      const { getLocation } = await import('../geo.js');
      coords = await getLocation();
      status.innerHTML = '';
      status.append(
        icon('mapPin', 16, 'text-success'),
        el('span', { class: 'text-fg' },
          el('span', { class: 'font-semibold' }, '📍 Capturado: '),
          `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`,
          el('span', { class: 'text-xs text-fg-subtle ml-1' }, `(±${Math.round(coords.accuracy)}m)`),
        )
      );
      showMap(coords.latitude, coords.longitude);
      btn.innerHTML = '';
      btn.append(icon('mapPin', 16), document.createTextNode(' Recapturar'));
      btn.disabled = false;
    } catch (err) {
      status.innerHTML = '';
      status.append(
        icon('mapPin', 16, 'text-danger'),
        el('span', { class: 'text-danger' }, err.message),
      );
      btn.innerHTML = '';
      btn.append(icon('mapPin', 16), document.createTextNode(' Tentar novamente'));
      btn.disabled = false;
      coords = null;
      mapPreview.innerHTML = '';
    }
  }
  btn.addEventListener('click', capture);

  wrap.append(status, mapPreview, btn);
  // captura automaticamente
  setTimeout(capture, 200);

  wrap.getCoords = () => coords;
  return wrap;
}

// Termômetro do atendimento
export function termometroField({ value, name = 'termometro' }) {
  const wrap = el('div', { class: 'grid grid-cols-3 gap-2' });
  const hidden = el('input', { type: 'hidden', name, value: value || '' });
  const opts = [
    { v: 'frio',  label: 'Frio',  emoji: '❄️', cls: 'border-info text-info bg-info/10' },
    { v: 'morno', label: 'Morno', emoji: '🌤️', cls: 'border-warning text-warning bg-warning/10' },
    { v: 'quente',label: 'Quente',emoji: '🔥', cls: 'border-danger text-danger bg-danger/10' },
  ];
  const buttons = opts.map(o => {
    const b = el('button', {
      type: 'button',
      class: 'border-2 rounded-xl py-3 flex flex-col items-center gap-1 transition font-semibold text-sm border-border hover:border-fg-subtle',
      'data-v': o.v,
    },
      el('span', { class: 'text-2xl' }, o.emoji),
      el('span', {}, o.label),
    );
    b.addEventListener('click', () => {
      hidden.value = o.v;
      buttons.forEach(bb => {
        bb.className = 'border-2 rounded-xl py-3 flex flex-col items-center gap-1 transition font-semibold text-sm ' +
          (bb.dataset.v === hidden.value ? o.cls : 'border-border text-fg-muted hover:border-fg-subtle');
      });
    });
    return b;
  });
  if (value) buttons.find(b => b.dataset.v === value)?.click();
  wrap.append(hidden, ...buttons);
  return wrap;
}
