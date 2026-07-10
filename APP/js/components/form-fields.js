// Componentes de formulário reutilizáveis
import { el, icon, toast, modal, confirmModal } from '../ui.js';
import { supabase, state, loadLists } from '../supabase.js';
import { MAX_PHOTOS_PER_ACTIVITY, ESTADOS_BR } from '../config.js';
import { loadCidadesBR, mapaCidadeUf } from '../cidades-br.js';

// ═══════════════════════════════════════════════════════════════════════════
// CIDADE + ESTADO com autocomplete (lista automática do IBGE) e UF automática.
// Retorna { cidadeInput, estadoSelect, datalist, getCidade, getEstado }.
// - cidadeInput: input texto com datalist das cidades de PR/SC (aceita digitar livre)
// - estadoSelect: <select> UF que é preenchido SOZINHO ao escolher uma cidade conhecida
// - datalist: precisa ser inserido no DOM (o input aponta pra ele via list=)
// ═══════════════════════════════════════════════════════════════════════════
export function cidadeEstadoField({ cidade, estado } = {}) {
  const listId = 'cidades-br-' + Math.random().toString(36).slice(2, 9);
  const cidadeInput = el('input', {
    class: 'input', type: 'text', value: cidade || '',
    placeholder: 'Cidade', list: listId, autocomplete: 'off',
  });
  const datalist = el('datalist', { id: listId });
  const estadoSelect = el('select', { class: 'select' },
    el('option', { value: '' }, 'UF'),
    ...ESTADOS_BR.map(u => el('option', { value: u, selected: estado === u }, u)),
  );

  let cidadeUf = new Map();
  loadCidadesBR().then(list => {
    cidadeUf = mapaCidadeUf(list);
    datalist.innerHTML = '';
    list.forEach(c => datalist.appendChild(el('option', { value: c.nome })));
    // Se já veio uma cidade preenchida e sem UF, tenta inferir
    if (cidadeInput.value && !estadoSelect.value) aplicarUf();
  }).catch(() => {});

  function aplicarUf() {
    const uf = cidadeUf.get((cidadeInput.value || '').trim().toLowerCase());
    if (uf) estadoSelect.value = uf; // só sobrescreve quando reconhece a cidade
  }
  cidadeInput.addEventListener('input', aplicarUf);
  cidadeInput.addEventListener('change', aplicarUf);

  return {
    cidadeInput, estadoSelect, datalist,
    getCidade: () => (cidadeInput.value || '').trim() || null,
    getEstado: () => estadoSelect.value || null,
  };
}

// Insere numa tabela de forma RESILIENTE: gera id no cliente + upsert idempotente
// + tempo-limite por tentativa + repetição. Se a rede travar (iOS suspende a
// conexão), não fica preso em "Salvando..." pra sempre — e não duplica (mesmo id).
// Retorna { data, error }.
export async function resilientInsert(table, row, { retries = 2, timeoutMs = 6000 } = {}) {
  const withId = { ...row };
  if (!withId.id && self.crypto && crypto.randomUUID) withId.id = crypto.randomUUID();
  const canRetry = !!withId.id;
  let lastErr = null;
  for (let i = 0; i < (canRetry ? retries : 1); i++) {
    try {
      const res = await Promise.race([
        supabase.from(table).upsert(withId, { onConflict: 'id' }).select().single(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('Tempo esgotado — verifique a conexão')), timeoutMs)),
      ]);
      if (!res.error && res.data) return { data: res.data, error: null };
      if (res.error) { lastErr = res.error; break; } // rejeição real do banco: não repete
    } catch (e) { lastErr = e; } // timeout/rede: tenta de novo
    await new Promise(r => setTimeout(r, 900 * (i + 1)));
  }
  return { data: null, error: lastErr || new Error('Falha ao salvar') };
}

// Só os dígitos de um telefone (ignora +55, parênteses, espaços, traços).
// Usado pra detectar duplicado independente do formato em que foi salvo.
export function normDigits(s) { return (s || '').replace(/\D/g, ''); }

// Corretores já cadastrados (em qualquer imobiliária) com o mesmo telefone/e-mail.
// state.corretores já vem carregado em memória (loadLists).
export function findCorretorDuplicates(tel, email) {
  const td = normDigits(tel);
  const em = (email || '').trim().toLowerCase();
  if (!td && !em) return [];
  return (state.corretores || []).filter(c =>
    (td && normDigits(c.telefone) === td) || (em && (c.email || '').toLowerCase() === em));
}

// Mesma ideia para gerentes da imobiliária
export function findGerenteImobDuplicates(tel, email) {
  const td = normDigits(tel);
  const em = (email || '').trim().toLowerCase();
  if (!td && !em) return [];
  return (state.gerentesImob || []).filter(c =>
    (td && normDigits(c.telefone) === td) || (em && (c.email || '').toLowerCase() === em));
}

// Campo wrapper com label
export function field(labelText, control, opts = {}) {
  const { required, help } = opts;
  const lbl = el('label', { class: 'label ' + (required ? 'label-required' : '') }, labelText);
  // Acessibilidade: associa o <label> ao controle quando é um campo de formulário
  if (control && /^(INPUT|SELECT|TEXTAREA)$/.test(control.tagName || '')) {
    if (!control.id) control.id = 'f-' + Math.random().toString(36).slice(2, 9);
    lbl.htmlFor = control.id;
  }
  const wrap = el('div', { class: 'flex flex-col gap-1' }, lbl, control);
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
    // Dispara eventos change pra listeners externos poderem reagir
    // (ex: form que mostra campos extras quando Motivo = Treinamento)
    hidden.dispatchEvent(new Event('change', { bubbles: true }));
    wrap.dispatchEvent(new Event('change', { bubbles: true }));
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

// Cria nova imobiliária - exige cidade e estado.
// Quando o gerente cria via creatableSelect (no checkin), abre modal pedindo cidade/estado.
// Nome é normalizado pra UPPERCASE pelo trigger do banco (e no frontend pra UX consistente).
export async function addImobiliaria(nome) {
  const nomeUpper = (nome || '').trim().toUpperCase();
  if (!nomeUpper) throw new Error('Nome obrigatório');
  return new Promise((resolve, reject) => {
    const cef = cidadeEstadoField({});
    const submitBtn = el('button', { class: 'btn btn-primary' }, 'Cadastrar');
    const cancelBtn = el('button', { class: 'btn btn-ghost', onclick: () => { m.close(); reject(new Error('Cancelado')); } }, 'Cancelar');
    const m = modal({
      title: `Nova imobiliária: ${nomeUpper}`,
      size: 'sm',
      content: el('div', { class: 'flex flex-col gap-3' },
        el('p', { class: 'text-sm text-fg-muted' },
          'Escolha a cidade (a UF é preenchida automaticamente).'),
        el('div', {},
          el('label', { class: 'label label-required' }, 'Cidade'),
          cef.cidadeInput, cef.datalist,
        ),
        el('div', {},
          el('label', { class: 'label label-required' }, 'Estado'),
          cef.estadoSelect,
        ),
      ),
      footer: [cancelBtn, submitBtn],
    });
    setTimeout(() => cef.cidadeInput.focus(), 80);

    submitBtn.addEventListener('click', async () => {
      const cidade = cef.getCidade();
      const estado = cef.getEstado();
      if (!cidade) { toast('Cidade é obrigatória', 'error'); return; }
      if (!estado) { toast('Estado é obrigatório', 'error'); return; }
      submitBtn.disabled = true;
      submitBtn.textContent = 'Salvando...';
      try {
        const { data, error } = await resilientInsert('imobiliarias', { nome: nomeUpper, cidade, estado });
        if (error) throw error;
        await loadLists();
        m.close();
        resolve(data);
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Cadastrar';
        toast((err.message || 'Erro ao cadastrar') + ' — toque em Cadastrar para tentar de novo.', 'error', 6000);
      }
    });
  });
}

// Padroniza texto de motivo: primeira letra maiúscula (mantém o resto como digitado)
function capitalizeFirst(s) {
  const t = (s || '').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

// Garante que um corretor informado por NOME (sem cadastro) exista na lista,
// vinculado à imobiliária. Retorna o id (existente ou recém-criado) ou null.
// Evita o caso de atendimentos com corretor digitado livre (ex.: vindo do
// agendamento) que não apareciam na lista de corretores da imobiliária.
export async function ensureCorretorCadastro(nome, imobiliaria) {
  const n = (nome || '').trim();
  const imob = (imobiliaria || '').trim();
  if (!n || !imob) return null;
  const existing = (state.corretores || []).find(c =>
    (c.nome || '').trim().toLowerCase() === n.toLowerCase() &&
    (c.imobiliaria_nome || '') === imob);
  if (existing) return existing.id;
  const imobObj = (state.imobiliarias || []).find(i => i.nome === imob);
  try {
    const { data, error } = await supabase.from('corretores').insert({
      nome: n, imobiliaria_nome: imob, imobiliaria_id: imobObj?.id || null,
      created_by: state.user?.id || null,
    }).select().single();
    if (error || !data) return null;
    (state.corretores || (state.corretores = [])).push(data);
    return data.id;
  } catch (e) { return null; }
}

// Cria novo motivo da visita (lista compartilhada) - qualquer usuário pode adicionar
export async function addMotivoVisita(nome) {
  const n = capitalizeFirst(nome);
  if (!n) throw new Error('Informe o motivo');
  const { data, error } = await supabase.from('motivos_visita').insert({ nome: n }).select().single();
  if (error) throw error;
  return data;
}

// Cria novo motivo do contato (Órulo/DWV) - qualquer usuário pode adicionar
export async function addMotivoOrulo(nome) {
  const n = capitalizeFirst(nome);
  if (!n) throw new Error('Informe o motivo');
  const { data, error } = await supabase.from('motivos_orulo').insert({ nome: n }).select().single();
  if (error) throw error;
  return data;
}

// Cria novo tipo de "Outro" (lista dedicada) — primeira letra maiúscula.
// Não duplica: se já existir (ignorando maiúsc./minúsc.), reaproveita o existente.
export async function addOutroTipo(nome) {
  const n = capitalizeFirst(nome);
  if (!n) throw new Error('Informe o tipo');
  const existente = (state.outrosTipos || []).find(o => (o.nome || '').toLowerCase() === n.toLowerCase());
  if (existente) return existente;
  const { data, error } = await supabase.from('outros_tipos')
    .insert({ nome: n, created_by: state.user?.id || null }).select().single();
  if (error) {
    // Corrida/duplicado no banco: recarrega e devolve o que já existe
    const dup = (state.outrosTipos || []).find(o => (o.nome || '').toLowerCase() === n.toLowerCase());
    if (dup) return dup;
    throw error;
  }
  (state.outrosTipos || (state.outrosTipos = [])).push(data);
  return data;
}

// Cria novo local de visita no banco.
// Padroniza tudo em MAIÚSCULAS para ficar uniforme na lista.
export async function addLocalVisita(nome) {
  const n = (nome || '').trim().toUpperCase();
  if (!n) throw new Error('Informe o local');
  const { data, error } = await supabase.from('locais_visita').insert({ nome: n }).select().single();
  if (error) throw error;
  await loadLists();
  return data;
}

// Upload de fotos com preview
export function photoPicker({ name = 'fotos', max = MAX_PHOTOS_PER_ACTIVITY }) {
  const wrap = el('div', { class: 'flex flex-col gap-2' });
  const previews = el('div', { class: 'grid grid-cols-3 gap-2' });
  const files = []; // { file, url }

  // Sem "capture": no celular o usuário escolhe entre CÂMERA e GALERIA
  // (com capture:'environment' abria só a câmera, sem opção de galeria).
  const input = el('input', {
    type: 'file', accept: 'image/*', multiple: true,
    class: 'hidden', name,
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

// Botão de captura de localização com preview de mapa + EDIÇÃO MANUAL por busca
// (pesquisa a imobiliária/endereço no OpenStreetMap e puxa a localização dela).
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
  let manual = false; // true quando a localização foi definida por busca

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
      manual = false; // veio do GPS
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

  // ===== Edição manual: pesquisar imobiliária/endereço e puxar a localização =====
  const editBtn = el('button', {
    type: 'button', class: 'btn btn-ghost btn-sm w-full text-xs',
  }, icon('search', 14), 'Editar Localização');

  const searchPanel = el('div', { class: 'flex flex-col gap-2 hidden' });
  const searchInput = el('input', { class: 'input', type: 'search',
    placeholder: 'Endereço' });
  const searchBtn = el('button', { type: 'button', class: 'btn btn-secondary btn-sm flex-shrink-0' },
    icon('search', 14), 'Buscar');
  const resultsBox = el('div', { class: 'flex flex-col gap-1' });

  // Abrir a busca direto no Google Maps (encontra imobiliárias por nome).
  // O gerente copia o endereço no Maps e cola no campo de busca acima.
  const gmapsBtn = el('button', { type: 'button', class: 'btn btn-secondary btn-sm w-full' },
    icon('mapPin', 14), 'Buscar no Maps');

  searchPanel.append(
    el('div', { class: 'text-[11px] font-semibold text-fg-muted' }, 'Busque pelo endereço:'),
    el('div', { class: 'flex gap-2' }, searchInput, searchBtn),
    resultsBox,
    gmapsBtn,
    el('div', { class: 'text-[10px] text-fg-subtle' },
      'No Maps pesquise a imobiliária e cole o endereço acima.'),
  );

  gmapsBtn.addEventListener('click', () => {
    const q = (searchInput.value || document.querySelector('input[name="imobiliaria"]')?.value || '').trim();
    const url = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q || 'imobiliária');
    window.open(url, '_blank', 'noopener');
  });

  async function doSearch() {
    const q = (searchInput.value || '').trim();
    if (!q) { toast('Digite o que buscar', 'warning'); return; }
    resultsBox.innerHTML = '';
    resultsBox.appendChild(el('div', { class: 'text-xs text-fg-muted' }, 'Buscando...'));
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=br&addressdetails=0&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      const list = await res.json();
      resultsBox.innerHTML = '';
      if (!Array.isArray(list) || !list.length) {
        resultsBox.appendChild(el('div', { class: 'text-xs text-fg-muted' }, 'Nada encontrado. Tente incluir a cidade.'));
        return;
      }
      list.forEach(r => {
        resultsBox.appendChild(el('button', {
          type: 'button',
          class: 'text-left text-sm px-3 py-2 rounded-lg hover:bg-bg-elev border border-border',
          onclick: () => {
            coords = { latitude: parseFloat(r.lat), longitude: parseFloat(r.lon), accuracy: null };
            manual = true;
            status.innerHTML = '';
            status.append(
              icon('mapPin', 16, 'text-warning'),
              el('span', { class: 'text-fg' },
                el('span', { class: 'font-semibold text-warning' }, '✏️ Localização definida manualmente: '),
                (r.display_name || '').split(',').slice(0, 3).join(', '),
              ),
            );
            showMap(coords.latitude, coords.longitude);
            searchPanel.classList.add('hidden');
          },
        }, r.display_name));
      });
    } catch (e) {
      resultsBox.innerHTML = '';
      resultsBox.appendChild(el('div', { class: 'text-xs text-danger' }, 'Falha na busca. Verifique a conexão e tente de novo.'));
    }
  }
  searchBtn.addEventListener('click', doSearch);
  searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } });
  editBtn.addEventListener('click', () => {
    const abrindo = searchPanel.classList.contains('hidden');
    searchPanel.classList.toggle('hidden');
    if (abrindo && !searchInput.value) {
      // Pré-preenche com a imobiliária selecionada no formulário (se houver)
      const imob = document.querySelector('input[name="imobiliaria"]')?.value || '';
      if (imob) { searchInput.value = imob; setTimeout(doSearch, 50); }
      setTimeout(() => searchInput.focus(), 60);
    }
  });

  wrap.append(status, mapPreview, btn, editBtn, searchPanel);
  // captura automaticamente
  setTimeout(capture, 200);

  wrap.getCoords = () => coords;
  wrap.isManual = () => manual;
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

// ═══════════════════════════════════════════════════════════════════════════
// CORRETOR (item 3) — dropdown filtrado pela imobiliária selecionada + cadastro
// inline. Todo corretor é vinculado a uma imobiliária. Salva corretor (nome,
// retrocompat) + corretor_id. imobWrap = nó do creatableSelect de imobiliária.
// ═══════════════════════════════════════════════════════════════════════════
export function corretorField({ imobWrap, value, valueId, required = true }) {
  const wrap = el('div', { class: 'relative' });
  const hiddenNome = el('input', { type: 'hidden', name: 'corretor', value: value || '', required });
  const hiddenId   = el('input', { type: 'hidden', name: 'corretor_id', value: valueId || '' });
  const display = el('button', { type: 'button', class: 'select text-left flex items-center justify-between' });
  let labelSpan = el('span', { class: 'truncate ' + (value ? '' : 'text-fg-subtle') }, value || 'Selecione o corretor...');
  display.append(labelSpan, icon('chevronDown', 16, 'text-fg-subtle flex-shrink-0'));

  const popup = el('div', { class: 'absolute z-40 left-0 right-0 mt-1 card max-h-72 overflow-y-auto hidden', style: { top: '100%' } });
  const search = el('input', { class: 'input rounded-none border-0 border-b border-border bg-transparent sticky top-0 z-10', placeholder: 'Buscar corretor...' });
  const listEl = el('div', { class: 'flex flex-col p-1' });
  popup.append(search, listEl);

  const currentImob = () => (imobWrap?.querySelector('input[name="imobiliaria"]')?.value || '').trim();

  function setValue(nome, id) {
    hiddenNome.value = nome || '';
    hiddenId.value = id || '';
    const ns = el('span', { class: 'truncate ' + (nome ? '' : 'text-fg-subtle') }, nome || 'Selecione o corretor...');
    labelSpan.replaceWith(ns); labelSpan = ns;
    hiddenNome.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function close() { popup.classList.add('hidden'); document.removeEventListener('click', outside); search.value = ''; }
  function outside(e) { if (!wrap.contains(e.target)) close(); }
  function open() { popup.classList.remove('hidden'); setTimeout(() => search.focus(), 50); renderList(); document.addEventListener('click', outside); }

  function renderList(filter = '') {
    listEl.innerHTML = '';
    const imob = currentImob();
    const f = filter.trim().toLowerCase();
    if (!imob) {
      listEl.appendChild(el('div', { class: 'text-xs text-fg-muted px-3 py-3 text-center' }, 'Selecione a imobiliária primeiro.'));
      return;
    }
    const matches = (state.corretores || []).filter(c =>
      (c.imobiliaria_nome || '') === imob && c.nome.toLowerCase().includes(f));
    if (!matches.length) listEl.appendChild(el('div', { class: 'text-xs text-fg-muted px-3 py-2' }, 'Nenhum corretor desta imobiliária ainda.'));
    matches.forEach(c => listEl.appendChild(el('button', {
      type: 'button',
      class: 'text-left px-3 py-2 rounded-lg hover:bg-bg-elev text-sm flex items-center justify-between',
      onclick: () => { setValue(c.nome, c.id); close(); },
    },
      el('span', { class: 'truncate' }, c.nome + (c.telefone ? ` · ${c.telefone}` : '')),
      c.id === hiddenId.value ? icon('check', 16, 'text-rottas-500') : null,
    )));
    listEl.appendChild(el('button', {
      type: 'button',
      class: 'text-left px-3 py-2 rounded-lg hover:bg-rottas-50 text-sm flex items-center gap-2 text-rottas-600 font-semibold border-t border-border mt-1 pt-2',
      onclick: () => openAddCorretor(imob, filter.trim()),
    }, icon('plus', 16), `Cadastrar corretor${f ? ` "${filter.trim()}"` : ' nesta imobiliária'}`));
  }

  function openAddCorretor(imob, presetNome) {
    if (!imob) { toast('Selecione a imobiliária primeiro', 'error'); return; }
    const nomeInp = el('input', { class: 'input', value: presetNome || '', placeholder: 'Nome do corretor' });
    const telInp  = phoneInput({});
    const mailInp = emailInput({ placeholder: 'email@exemplo.com (opcional)' });
    const dupBox  = el('div', {});
    const saveBtn = el('button', { class: 'btn btn-primary' }, 'Cadastrar');
    const cancelBtn = el('button', { class: 'btn btn-ghost', onclick: () => m.close() }, 'Cancelar');

    function checkCorretorDup() {
      dupBox.innerHTML = '';
      const matches = findCorretorDuplicates(telInp.value, mailInp.value);
      if (!matches.length) return;
      dupBox.appendChild(el('div', { class: 'card p-3 flex flex-col gap-1', style: { background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.35)' } },
        el('div', { class: 'text-xs font-bold text-warning' }, '⚠ Esse telefone/e-mail já está cadastrado:'),
        ...matches.map(c => el('div', { class: 'text-sm' },
          el('strong', {}, c.nome), ' — ', c.imobiliaria_nome || 'sem imobiliária',
          c.telefone ? ` · ${c.telefone}` : '', c.email ? ` · ${c.email}` : '',
        )),
        el('div', { class: 'text-xs text-fg-muted mt-1' }, 'Se ele mudou de imobiliária, você pode cadastrar mesmo assim ao salvar.'),
      ));
    }
    let dupT;
    const onDupLookup = () => { clearTimeout(dupT); dupT = setTimeout(checkCorretorDup, 300); };
    telInp.addEventListener('input', onDupLookup);
    mailInp.addEventListener('input', onDupLookup);

    const m = modal({
      title: 'Novo corretor', size: 'sm',
      content: el('div', { class: 'flex flex-col gap-3' },
        el('div', { class: 'card p-2 text-xs text-fg-muted gradient-rottas-soft' }, '🏢 Vinculado à imobiliária: ', el('strong', {}, imob)),
        el('div', {}, el('label', { class: 'label label-required' }, 'Nome'), nomeInp),
        el('div', {}, el('label', { class: 'label' }, 'Telefone (opcional)'), telInp),
        el('div', {}, el('label', { class: 'label' }, 'E-mail (opcional)'), mailInp),
        dupBox,
      ),
      footer: [cancelBtn, saveBtn],
    });
    setTimeout(() => nomeInp.focus(), 60);
    saveBtn.addEventListener('click', async () => {
      const nome = nomeInp.value.trim();
      if (!nome) { toast('Nome é obrigatório', 'error'); return; }
      // Sinaliza duplicado e pede confirmação antes de criar outro cadastro
      const dups = findCorretorDuplicates(telInp.value, mailInp.value);
      if (dups.length) {
        const ok = await confirmModal({
          title: 'Corretor já cadastrado',
          message: `Já existe "${dups[0].nome}" (${dups[0].imobiliaria_nome || 'sem imobiliária'}) com esse telefone/e-mail. Cadastrar mesmo assim em "${imob}"?`,
          confirmLabel: 'Cadastrar mesmo assim',
        });
        if (!ok) return;
      }
      const imobObj = (state.imobiliarias || []).find(i => i.nome === imob);
      const payload = {
        nome, telefone: telInp.value.trim() || null, email: mailInp.value.trim() || null,
        imobiliaria_id: imobObj?.id || null, imobiliaria_nome: imob,
        created_by: state.user?.id || null,
      };
      saveBtn.disabled = true;
      try {
        const { data, error } = await resilientInsert('corretores', payload);
        if (error) { toast('Erro: ' + error.message + ' — toque em Cadastrar de novo.', 'error', 6000); saveBtn.disabled = false; return; }
        if (!Array.isArray(state.corretores)) state.corretores = [];
        state.corretores.push(data);
        state.corretores.sort((a, b) => a.nome.localeCompare(b.nome));
        setValue(data.nome, data.id);
        m.close(); close();
        toast(`Corretor "${data.nome}" cadastrado`, 'success');
      } catch (e) {
        toast('Falha ao cadastrar corretor: ' + (e.message || e), 'error', 6000);
        saveBtn.disabled = false;
      }
    });
  }

  display.addEventListener('click', (e) => { e.stopPropagation(); popup.classList.contains('hidden') ? open() : close(); });
  search.addEventListener('input', (e) => renderList(e.target.value));
  // Se trocar a imobiliária, limpa o corretor que não pertence mais a ela
  imobWrap?.addEventListener('change', () => {
    const sel = (state.corretores || []).find(c => c.id === hiddenId.value);
    if (sel && (sel.imobiliaria_nome || '') !== currentImob()) setValue('', '');
  });

  wrap.append(hiddenNome, hiddenId, display, popup);
  return wrap;
}

// ═══════════════════════════════════════════════════════════════════════════
// GERENTE DA IMOBILIÁRIA — dropdown filtrado pela imobiliária + cadastro inline.
// Mesmo formato do corretor. Salva gerente_imob (nome) + gerente_imob_id.
// ═══════════════════════════════════════════════════════════════════════════
export function gerenteImobField({ imobWrap, value, valueId, required = true }) {
  const wrap = el('div', { class: 'relative' });
  const hiddenNome = el('input', { type: 'hidden', name: 'gerente_imob', value: value || '', required });
  const hiddenId   = el('input', { type: 'hidden', name: 'gerente_imob_id', value: valueId || '' });
  const display = el('button', { type: 'button', class: 'select text-left flex items-center justify-between' });
  let labelSpan = el('span', { class: 'truncate ' + (value ? '' : 'text-fg-subtle') }, value || 'Selecione o gerente...');
  display.append(labelSpan, icon('chevronDown', 16, 'text-fg-subtle flex-shrink-0'));

  const popup = el('div', { class: 'absolute z-40 left-0 right-0 mt-1 card max-h-72 overflow-y-auto hidden', style: { top: '100%' } });
  const search = el('input', { class: 'input rounded-none border-0 border-b border-border bg-transparent sticky top-0 z-10', placeholder: 'Buscar gerente...' });
  const listEl = el('div', { class: 'flex flex-col p-1' });
  popup.append(search, listEl);

  const currentImob = () => (imobWrap?.querySelector('input[name="imobiliaria"]')?.value || '').trim();

  function setValue(nome, id) {
    hiddenNome.value = nome || '';
    hiddenId.value = id || '';
    const ns = el('span', { class: 'truncate ' + (nome ? '' : 'text-fg-subtle') }, nome || 'Selecione o gerente...');
    labelSpan.replaceWith(ns); labelSpan = ns;
    hiddenNome.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function close() { popup.classList.add('hidden'); document.removeEventListener('click', outside); search.value = ''; }
  function outside(e) { if (!wrap.contains(e.target)) close(); }
  function open() { popup.classList.remove('hidden'); setTimeout(() => search.focus(), 50); renderList(); document.addEventListener('click', outside); }

  function renderList(filter = '') {
    listEl.innerHTML = '';
    const imob = currentImob();
    const f = filter.trim().toLowerCase();
    if (!imob) {
      listEl.appendChild(el('div', { class: 'text-xs text-fg-muted px-3 py-3 text-center' }, 'Selecione a imobiliária primeiro.'));
      return;
    }
    const matches = (state.gerentesImob || []).filter(c =>
      (c.imobiliaria_nome || '') === imob && c.nome.toLowerCase().includes(f));
    if (!matches.length) listEl.appendChild(el('div', { class: 'text-xs text-fg-muted px-3 py-2' }, 'Nenhum gerente desta imobiliária ainda.'));
    matches.forEach(c => listEl.appendChild(el('button', {
      type: 'button',
      class: 'text-left px-3 py-2 rounded-lg hover:bg-bg-elev text-sm flex items-center justify-between',
      onclick: () => { setValue(c.nome, c.id); close(); },
    },
      el('span', { class: 'truncate' }, c.nome + (c.telefone ? ` · ${c.telefone}` : '')),
      c.id === hiddenId.value ? icon('check', 16, 'text-rottas-500') : null,
    )));
    listEl.appendChild(el('button', {
      type: 'button',
      class: 'text-left px-3 py-2 rounded-lg hover:bg-rottas-50 text-sm flex items-center gap-2 text-rottas-600 font-semibold border-t border-border mt-1 pt-2',
      onclick: () => openAddGerente(imob, filter.trim()),
    }, icon('plus', 16), `Cadastrar gerente${f ? ` "${filter.trim()}"` : ' nesta imobiliária'}`));
  }

  function openAddGerente(imob, presetNome) {
    if (!imob) { toast('Selecione a imobiliária primeiro', 'error'); return; }
    const nomeInp = el('input', { class: 'input', value: presetNome || '', placeholder: 'Nome do gerente / dono' });
    const telInp  = phoneInput({});
    const mailInp = emailInput({ placeholder: 'email@exemplo.com (opcional)' });
    const dupBox  = el('div', {});
    const saveBtn = el('button', { class: 'btn btn-primary' }, 'Cadastrar');
    const cancelBtn = el('button', { class: 'btn btn-ghost', onclick: () => m.close() }, 'Cancelar');

    function checkGerenteDup() {
      dupBox.innerHTML = '';
      const matches = findGerenteImobDuplicates(telInp.value, mailInp.value);
      if (!matches.length) return;
      dupBox.appendChild(el('div', { class: 'card p-3 flex flex-col gap-1', style: { background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.35)' } },
        el('div', { class: 'text-xs font-bold text-warning' }, '⚠ Esse telefone/e-mail já está cadastrado:'),
        ...matches.map(c => el('div', { class: 'text-sm' },
          el('strong', {}, c.nome), ' — ', c.imobiliaria_nome || 'sem imobiliária',
          c.telefone ? ` · ${c.telefone}` : '', c.email ? ` · ${c.email}` : '',
        )),
        el('div', { class: 'text-xs text-fg-muted mt-1' }, 'Se ele mudou de imobiliária, você pode cadastrar mesmo assim ao salvar.'),
      ));
    }
    let dupT;
    const onDupLookup = () => { clearTimeout(dupT); dupT = setTimeout(checkGerenteDup, 300); };
    telInp.addEventListener('input', onDupLookup);
    mailInp.addEventListener('input', onDupLookup);

    const m = modal({
      title: 'Novo gerente da imobiliária', size: 'sm',
      content: el('div', { class: 'flex flex-col gap-3' },
        el('div', { class: 'card p-2 text-xs text-fg-muted gradient-rottas-soft' }, '🏢 Vinculado à imobiliária: ', el('strong', {}, imob)),
        el('div', {}, el('label', { class: 'label label-required' }, 'Nome'), nomeInp),
        el('div', {}, el('label', { class: 'label' }, 'Telefone (opcional)'), telInp),
        el('div', {}, el('label', { class: 'label' }, 'E-mail (opcional)'), mailInp),
        dupBox,
      ),
      footer: [cancelBtn, saveBtn],
    });
    setTimeout(() => nomeInp.focus(), 60);
    saveBtn.addEventListener('click', async () => {
      const nome = nomeInp.value.trim();
      if (!nome) { toast('Nome é obrigatório', 'error'); return; }
      const dups = findGerenteImobDuplicates(telInp.value, mailInp.value);
      if (dups.length) {
        const ok = await confirmModal({
          title: 'Gerente já cadastrado',
          message: `Já existe "${dups[0].nome}" (${dups[0].imobiliaria_nome || 'sem imobiliária'}) com esse telefone/e-mail. Cadastrar mesmo assim em "${imob}"?`,
          confirmLabel: 'Cadastrar mesmo assim',
        });
        if (!ok) return;
      }
      const imobObj = (state.imobiliarias || []).find(i => i.nome === imob);
      const payload = {
        nome, telefone: telInp.value.trim() || null, email: mailInp.value.trim() || null,
        imobiliaria_id: imobObj?.id || null, imobiliaria_nome: imob,
        created_by: state.user?.id || null,
      };
      saveBtn.disabled = true;
      try {
        const { data, error } = await resilientInsert('gerentes_imobiliaria', payload);
        if (error) { toast('Erro: ' + error.message + ' — toque em Cadastrar de novo.', 'error', 6000); saveBtn.disabled = false; return; }
        if (!Array.isArray(state.gerentesImob)) state.gerentesImob = [];
        state.gerentesImob.push(data);
        state.gerentesImob.sort((a, b) => a.nome.localeCompare(b.nome));
        setValue(data.nome, data.id);
        m.close(); close();
        toast(`Gerente "${data.nome}" cadastrado`, 'success');
      } catch (e) {
        toast('Falha ao cadastrar gerente: ' + (e.message || e), 'error', 6000);
        saveBtn.disabled = false;
      }
    });
  }

  display.addEventListener('click', (e) => { e.stopPropagation(); popup.classList.contains('hidden') ? open() : close(); });
  search.addEventListener('input', (e) => renderList(e.target.value));
  imobWrap?.addEventListener('change', () => {
    const sel = (state.gerentesImob || []).find(c => c.id === hiddenId.value);
    if (sel && (sel.imobiliaria_nome || '') !== currentImob()) setValue('', '');
  });

  wrap.append(hiddenNome, hiddenId, display, popup);
  return wrap;
}

// ═══════════════════════════════════════════════════════════════════════════
// CLIENTE / LEAD (item 4) — campo livre de cadastro (NÃO é lista). Ao clicar,
// abre cadastro: nome (obrig.), telefone e e-mail (opcionais). Detecta telefone/
// e-mail já usados e oferece reaproveitar o cadastro existente. Salva cliente
// (nome, retrocompat) + cliente_id.
// ═══════════════════════════════════════════════════════════════════════════
export function clienteField({ value, valueId, required = true }) {
  const wrap = el('div', {});
  const hiddenNome = el('input', { type: 'hidden', name: 'cliente', value: value || '', required });
  const hiddenId   = el('input', { type: 'hidden', name: 'cliente_id', value: valueId || '' });
  const display = el('button', { type: 'button', class: 'select text-left flex items-center justify-between' });
  let labelSpan = el('span', { class: 'truncate ' + (value ? '' : 'text-fg-subtle') }, value || 'Cadastrar / selecionar cliente...');
  display.append(labelSpan, icon('user', 16, 'text-fg-subtle flex-shrink-0'));

  function setValue(nome, id) {
    hiddenNome.value = nome || '';
    hiddenId.value = id || '';
    const ns = el('span', { class: 'truncate ' + (nome ? '' : 'text-fg-subtle') }, nome || 'Cadastrar / selecionar cliente...');
    labelSpan.replaceWith(ns); labelSpan = ns;
    hiddenNome.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function openModal() {
    const nomeInp = el('input', { class: 'input', value: hiddenNome.value || '', placeholder: 'Nome do cliente' });
    const telInp  = phoneInput({});
    const mailInp = emailInput({ placeholder: 'email@exemplo.com (opcional)' });
    const dupBox  = el('div', {});
    const saveBtn = el('button', { class: 'btn btn-primary' }, 'Usar este cliente');
    const cancelBtn = el('button', { class: 'btn btn-ghost', onclick: () => m.close() }, 'Cancelar');
    let chosen = null; // cliente existente escolhido

    async function checkDup() {
      const tel = telInp.value.trim();
      const mail = mailInp.value.trim();
      dupBox.innerHTML = '';
      chosen = null;
      if (!normDigits(tel) && !mail) return;
      // Busca por contato via função no banco (não lista a base — só o que casa)
      const { data } = await supabase.rpc('cliente_por_contato', { p_tel: tel || null, p_email: mail || null });
      if (!data || !data.length) return;
      dupBox.appendChild(el('div', { class: 'card p-3 flex flex-col gap-2', style: { background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.35)' } },
        el('div', { class: 'text-xs font-bold text-warning' }, '⚠ Já existe cadastro com esse telefone/e-mail:'),
        ...data.map(c => el('button', {
          type: 'button', class: 'text-left text-sm px-3 py-2 rounded-lg hover:bg-bg-elev flex items-center justify-between',
          onclick: () => {
            chosen = c; nomeInp.value = c.nome;
            if (c.telefone) telInp.value = c.telefone;
            if (c.email) mailInp.value = c.email;
            dupBox.querySelectorAll('button').forEach(b => b.classList.remove('ring-2', 'ring-rottas-500'));
            // marca selecionado
          },
        },
          el('span', {}, el('strong', {}, c.nome), c.telefone ? ` · ${c.telefone}` : '', c.email ? ` · ${c.email}` : ''),
          el('span', { class: 'text-xs text-rottas-600 font-semibold' }, 'Usar este'),
        )),
      ));
    }
    let dupTimer;
    const onLookup = () => { clearTimeout(dupTimer); dupTimer = setTimeout(checkDup, 350); };
    telInp.addEventListener('input', onLookup);
    mailInp.addEventListener('input', onLookup);

    const m = modal({
      title: '👤 Cadastro de cliente (lead)', size: 'sm',
      content: el('div', { class: 'flex flex-col gap-3' },
        el('p', { class: 'text-xs text-fg-muted' }, 'Cadastre o cliente na base para futuros retornos. Telefone e e-mail são opcionais, mas ajudam a evitar duplicados.'),
        el('div', {}, el('label', { class: 'label label-required' }, 'Nome'), nomeInp),
        el('div', {}, el('label', { class: 'label' }, 'Telefone (opcional)'), telInp),
        el('div', {}, el('label', { class: 'label' }, 'E-mail (opcional)'), mailInp),
        dupBox,
      ),
      footer: [cancelBtn, saveBtn],
    });
    setTimeout(() => nomeInp.focus(), 60);

    saveBtn.addEventListener('click', async () => {
      const nome = nomeInp.value.trim();
      if (!nome) { toast('Nome é obrigatório', 'error'); return; }
      // Se escolheu um cadastro existente, usa ele direto
      if (chosen) { setValue(chosen.nome, chosen.id); m.close(); toast('Cliente vinculado', 'success'); return; }
      saveBtn.disabled = true;
      try {
        // Cria via função no banco (não exige permissão de leitura da tabela clientes).
        // Com tempo-limite: se a rede travar, não fica preso — libera pra tentar de novo.
        const { data, error } = await Promise.race([
          supabase.rpc('criar_cliente', {
            p_nome: nome,
            p_tel: telInp.value.trim() || null,
            p_email: mailInp.value.trim() || null,
          }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('Tempo esgotado — verifique a conexão e toque em salvar de novo')), 7000)),
        ]);
        const row = Array.isArray(data) ? data[0] : data;
        if (error || !row) { toast('Erro: ' + (error?.message || 'falha ao cadastrar'), 'error', 6000); saveBtn.disabled = false; return; }
        setValue(row.nome, row.id);
        m.close();
        toast(`Cliente "${row.nome}" cadastrado`, 'success');
      } catch (e) {
        toast('Falha ao cadastrar cliente: ' + (e.message || e), 'error', 6000);
        saveBtn.disabled = false;
      }
    });
  }

  display.addEventListener('click', openModal);
  wrap.append(hiddenNome, hiddenId, display);
  return wrap;
}

// ═══════════════════════════════════════════════════════════════════════════
// TELEFONE INTELIGENTE — seletor de país (bandeira + DDI, padrão Brasil +55) +
// máscara automática conforme o país. Para o Brasil formata (XX) XXXXX-XXXX e
// valida o celular (11 dígitos). Drop-in: o nó retornado expõe `.value`
// (get/set) como um <input>, então `node.value.trim()` continua funcionando.
// Valor guardado/lido = "+55 (22) 99763-7344".
// ═══════════════════════════════════════════════════════════════════════════
// Cada país tem `masks` (formatos reais, do mais curto p/ o mais longo) onde
// '#' é um dígito e o resto é literal. `lens` = quantidades de dígitos válidas.
const PHONE_COUNTRIES = [
  { iso: 'BR', code: '55',  name: 'Brasil',        masks: ['(##) ####-####', '(##) #####-####'], lens: [10, 11] },
  { iso: 'PT', code: '351', name: 'Portugal',      masks: ['### ### ###'],                       lens: [9] },
  { iso: 'US', code: '1',   name: 'EUA / Canadá',  masks: ['(###) ###-####'],                    lens: [10] },
  { iso: 'AR', code: '54',  name: 'Argentina',     masks: ['## #### ####', '## ##### ####'],     lens: [10, 11] },
  { iso: 'PY', code: '595', name: 'Paraguai',      masks: ['### ### ###'],                        lens: [9] },
  { iso: 'UY', code: '598', name: 'Uruguai',       masks: ['#### ####', '## ### ###'],            lens: [8, 9] },
  { iso: 'CL', code: '56',  name: 'Chile',         masks: ['# #### ####'],                        lens: [9] },
  { iso: 'BO', code: '591', name: 'Bolívia',       masks: ['#### ####'],                          lens: [8] },
  { iso: 'CO', code: '57',  name: 'Colômbia',      masks: ['### ### ####'],                       lens: [10] },
  { iso: 'PE', code: '51',  name: 'Peru',          masks: ['### ### ###'],                        lens: [9] },
  { iso: 'ES', code: '34',  name: 'Espanha',       masks: ['### ## ## ##'],                       lens: [9] },
  { iso: 'MX', code: '52',  name: 'México',        masks: ['## #### ####'],                       lens: [10] },
  { iso: 'IT', code: '39',  name: 'Itália',        masks: ['### ### ####'],                       lens: [10] },
  { iso: 'FR', code: '33',  name: 'França',        masks: ['# ## ## ## ##'],                      lens: [9] },
  { iso: 'DE', code: '49',  name: 'Alemanha',      masks: ['### ########'],                       lens: [10, 11] },
  { iso: 'GB', code: '44',  name: 'Reino Unido',   masks: ['##### ######'],                       lens: [10, 11] },
];

// Aplica uma máscara progressivamente: preenche os '#' com os dígitos e só
// emite separadores quando há dígito depois deles.
function applyMask(mask, digits) {
  let out = '', di = 0;
  for (const ch of mask) {
    if (di >= digits.length) break;
    if (ch === '#') out += digits[di++];
    else out += ch;
  }
  return out;
}

// Formata os dígitos nacionais escolhendo a máscara do país que melhor cabe.
function formatPhoneNational(country, digits) {
  const masks = country.masks || ['##############'];
  const maxLen = Math.max(...masks.map(m => (m.match(/#/g) || []).length));
  const d = digits.slice(0, maxLen);
  // menor máscara cujo nº de dígitos >= o que já foi digitado
  const mask = masks.find(m => (m.match(/#/g) || []).length >= d.length) || masks[masks.length - 1];
  return applyMask(mask, d);
}

// Placeholder do país: a máscara mais longa com 0 no lugar dos dígitos
function placeholderFor(country) {
  const masks = country.masks || ['##############'];
  return masks[masks.length - 1].replace(/#/g, '0');
}

// true se o número nacional parece válido p/ o país (vazio = ok, campo opcional)
function phoneNationalValid(country, digits) {
  if (!digits) return true;
  return (country.lens || []).includes(digits.length);
}

// Imagem real da bandeira (Windows/Chrome não renderiza emoji de bandeira).
function flagImg(iso, h = 14) {
  return el('img', {
    src: `https://flagcdn.com/${(h * 2)}x${Math.round(h * 1.5)}/${iso.toLowerCase()}.png`,
    alt: iso,
    width: Math.round(h * 4 / 3), height: h,
    loading: 'lazy',
    style: { height: h + 'px', width: 'auto', borderRadius: '2px', display: 'inline-block', objectFit: 'cover' },
  });
}

export function phoneInput({ value = '', placeholder = '(00) 00000-0000', name } = {}) {
  const wrap = el('div', { class: 'flex flex-col gap-1' });
  const row = el('div', { class: 'relative flex gap-2' });

  let country = PHONE_COUNTRIES[0]; // Brasil por padrão

  const flagBtn = el('button', {
    type: 'button',
    class: 'select flex items-center gap-1 flex-shrink-0',
    style: { width: 'auto', minWidth: '5.5rem' },
    title: 'Trocar país',
  });
  const flagLabel = el('span', {}, '');
  flagBtn.append(flagLabel, icon('chevronDown', 14, 'text-fg-subtle'));

  const input = el('input', {
    class: 'input flex-1', type: 'tel', placeholder, inputmode: 'tel', autocomplete: 'off',
  });
  if (name) input.name = name;

  const hint = el('p', { class: 'text-xs text-danger hidden' }, '');

  const popup = el('div', {
    class: 'absolute z-50 left-0 mt-1 card max-h-64 overflow-y-auto hidden',
    style: { top: '100%', minWidth: '14rem' },
  });
  PHONE_COUNTRIES.forEach(c => {
    popup.appendChild(el('button', {
      type: 'button',
      class: 'w-full text-left px-3 py-2 hover:bg-bg-elev text-sm flex items-center gap-2',
      onclick: () => { setCountry(c); reformat(); closePopup(); input.focus(); },
    },
      flagImg(c.iso, 14),
      el('span', { class: 'flex-1 truncate' }, c.name),
      el('span', { class: 'text-fg-subtle' }, '+' + c.code),
    ));
  });

  function setCountry(c) {
    country = c;
    flagLabel.innerHTML = '';
    flagLabel.append(flagImg(c.iso, 14), document.createTextNode(' +' + c.code));
    input.placeholder = placeholderFor(c);
  }
  function openPopup()  { popup.classList.remove('hidden'); document.addEventListener('click', outside); }
  function closePopup() { popup.classList.add('hidden'); document.removeEventListener('click', outside); }
  function outside(e)   { if (!row.contains(e.target)) closePopup(); }

  function reformat() {
    const digits = input.value.replace(/\D/g, '');
    input.value = formatPhoneNational(country, digits);
    if (phoneNationalValid(country, digits)) {
      hint.classList.add('hidden');
    } else {
      hint.textContent = country.iso === 'BR'
        ? 'Número incompleto — celular tem 11 dígitos com DDD.'
        : 'Número parece incompleto para ' + country.name + '.';
      hint.classList.remove('hidden');
    }
  }

  function setValue(raw) {
    raw = (raw || '').trim();
    if (!raw) { setCountry(PHONE_COUNTRIES[0]); input.value = ''; hint.classList.add('hidden'); return; }
    let c = PHONE_COUNTRIES[0];
    let rest = raw;
    const m = raw.match(/^\+\s*(\d[\d\s]*?)\s*(\(.*)?$/) || raw.match(/^\+\s*(\d+)(.*)$/);
    if (m) {
      const lead = m[1].replace(/\D/g, '');
      const cand = PHONE_COUNTRIES
        .filter(x => lead.startsWith(x.code))
        .sort((a, b) => b.code.length - a.code.length)[0];
      if (cand) { c = cand; rest = lead.slice(c.code.length) + ' ' + (m[2] || ''); }
    }
    setCountry(c);
    input.value = formatPhoneNational(c, rest.replace(/\D/g, ''));
  }

  flagBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    popup.classList.contains('hidden') ? openPopup() : closePopup();
  });
  input.addEventListener('input', reformat);

  row.append(flagBtn, input, popup);
  wrap.append(row, hint);
  setValue(value);

  Object.defineProperty(wrap, 'value', {
    get() {
      const digits = input.value.replace(/\D/g, '');
      if (!digits) return '';
      return `+${country.code} ${input.value.trim()}`;
    },
    set(v) { setValue(v); },
  });
  return wrap;
}

// ═══════════════════════════════════════════════════════════════════════════
// E-MAIL INTELIGENTE — ao digitar "@" sugere gmail/outlook/hotmail; filtra
// conforme você completa o domínio e aceita qualquer outro provedor. Drop-in:
// expõe `.value` (get/set) como um <input>.
// ═══════════════════════════════════════════════════════════════════════════
const EMAIL_DOMAINS = ['rottasconstrutora.com.br', 'rottasvendas.com.br', 'gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com.br', 'icloud.com'];

export function emailInput({ value = '', placeholder = 'email@exemplo.com', name } = {}) {
  const wrap = el('div', { class: 'relative' });
  const input = el('input', { class: 'input', type: 'email', placeholder, autocomplete: 'off', value: value || '' });
  if (name) input.name = name;
  const popup = el('div', { class: 'absolute z-50 left-0 right-0 mt-1 card overflow-hidden hidden', style: { top: '100%' } });

  function render() {
    const v = input.value;
    const at = v.indexOf('@');
    popup.innerHTML = '';
    if (at < 1) { popup.classList.add('hidden'); return; }
    const local = v.slice(0, at);
    const typed = v.slice(at + 1).toLowerCase();
    const matches = EMAIL_DOMAINS.filter(d => d.startsWith(typed));
    // já completou um domínio conhecido → não sugere
    if (!matches.length || (matches.length === 1 && matches[0] === typed)) {
      popup.classList.add('hidden'); return;
    }
    matches.forEach(d => {
      const btn = el('button', {
        type: 'button',
        class: 'w-full text-left px-3 py-2 hover:bg-bg-elev text-sm',
      }, el('span', { class: 'text-fg-subtle' }, local + '@'), el('strong', {}, d));
      // mousedown (antes do blur) pra não fechar antes do clique
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        input.value = local + '@' + d;
        popup.classList.add('hidden');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      popup.appendChild(btn);
    });
    popup.classList.remove('hidden');
  }
  input.addEventListener('input', render);
  input.addEventListener('focus', render);
  input.addEventListener('blur', () => setTimeout(() => popup.classList.add('hidden'), 120));

  wrap.append(input, popup);
  Object.defineProperty(wrap, 'value', {
    get: () => input.value,
    set: (v) => { input.value = v || ''; },
  });
  return wrap;
}
