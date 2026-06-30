// Componentes de formulário reutilizáveis
import { el, icon, toast, modal, confirmModal } from '../ui.js';
import { supabase, state, loadLists } from '../supabase.js';
import { MAX_PHOTOS_PER_ACTIVITY, ESTADOS_BR } from '../config.js';

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
    const cidadeInput = el('input', {
      class: 'input', type: 'text', placeholder: 'Ex: Curitiba',
    });
    const estadoSel = el('select', { class: 'select' },
      el('option', { value: '' }, 'Selecione...'),
      ...ESTADOS_BR.map(uf => el('option', { value: uf }, uf))
    );
    const submitBtn = el('button', { class: 'btn btn-primary' }, 'Cadastrar');
    const cancelBtn = el('button', { class: 'btn btn-ghost', onclick: () => { m.close(); reject(new Error('Cancelado')); } }, 'Cancelar');
    const m = modal({
      title: `Nova imobiliária: ${nomeUpper}`,
      size: 'sm',
      content: el('div', { class: 'flex flex-col gap-3' },
        el('p', { class: 'text-sm text-fg-muted' },
          'Pra cadastrar a imobiliária, informe a cidade e o estado dela.'),
        el('div', {},
          el('label', { class: 'label label-required' }, 'Cidade'),
          cidadeInput,
        ),
        el('div', {},
          el('label', { class: 'label label-required' }, 'Estado'),
          estadoSel,
        ),
      ),
      footer: [cancelBtn, submitBtn],
    });
    setTimeout(() => cidadeInput.focus(), 80);

    submitBtn.addEventListener('click', async () => {
      const cidade = cidadeInput.value.trim();
      const estado = estadoSel.value;
      if (!cidade) { toast('Cidade é obrigatória', 'error'); return; }
      if (!estado) { toast('Estado é obrigatório', 'error'); return; }
      submitBtn.disabled = true;
      submitBtn.textContent = 'Salvando...';
      try {
        const { data, error } = await supabase
          .from('imobiliarias')
          .insert({ nome: nomeUpper, cidade, estado })
          .select()
          .single();
        if (error) throw error;
        await loadLists();
        m.close();
        resolve(data);
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Cadastrar';
        toast(err.message || 'Erro ao cadastrar', 'error', 5000);
      }
    });
  });
}

// Cria novo local de visita no banco
export async function addLocalVisita(nome) {
  const { data, error } = await supabase.from('locais_visita').insert({ nome }).select().single();
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
        const { data, error } = await supabase.from('corretores').insert(payload).select().single();
        if (error) { toast('Erro: ' + error.message, 'error', 6000); saveBtn.disabled = false; return; }
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
        const { data, error } = await supabase.from('gerentes_imobiliaria').insert(payload).select().single();
        if (error) { toast('Erro: ' + error.message, 'error', 6000); saveBtn.disabled = false; return; }
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
    let cacheClientes = null;
    async function ensureClientes() {
      if (cacheClientes) return cacheClientes;
      const { data } = await supabase.from('clientes').select('id, nome, telefone, email').limit(5000);
      cacheClientes = data || [];
      return cacheClientes;
    }

    async function checkDup() {
      const telD = normDigits(telInp.value);
      const mail = mailInp.value.trim().toLowerCase();
      dupBox.innerHTML = '';
      chosen = null;
      if (!telD && !mail) return;
      // Comparação por dígitos normalizados (independe do formato salvo) e e-mail
      const all = await ensureClientes();
      const data = all.filter(c =>
        (telD && normDigits(c.telefone) === telD) || (mail && (c.email || '').toLowerCase() === mail)
      ).slice(0, 5);
      if (!data.length) return;
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
      const payload = {
        nome, telefone: telInp.value.trim() || null, email: mailInp.value.trim() || null,
        created_by: state.user?.id || null,
      };
      try {
        const { data, error } = await supabase.from('clientes').insert(payload).select().single();
        if (error) { toast('Erro: ' + error.message, 'error', 6000); saveBtn.disabled = false; return; }
        setValue(data.nome, data.id);
        m.close();
        toast(`Cliente "${data.nome}" cadastrado`, 'success');
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
