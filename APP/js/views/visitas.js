// ═════════════════════════════════════════════════════════════════════════
// Visitas — Atividade exclusiva do perfil Recepção Rottas
// - visitasView:   lista das visitas registradas + botão importar/baixar template
// - visitaFormView: formulário de registro individual (com lógica condicional)
// ═════════════════════════════════════════════════════════════════════════

import { el, icon, toast, loadingBtn, fmt, modal, confirmModal } from '../ui.js';
import { shell } from './shell.js';
import { state, supabase } from '../supabase.js';
import { navigate } from '../router.js';
import { isRecepcao } from '../auth.js';
import { audioField } from '../components/audio-field.js';
import { getLocation } from '../geo.js';
import { VISITA_PERIODOS, VISITA_FORMAS, VISITA_CANAIS } from '../config.js';

// ─── SHEETJS LOADER (lazy CDN) ──────────────────────────────────────────
let _xlsxPromise = null;
async function loadXLSX() {
  if (window.XLSX) return window.XLSX;
  if (_xlsxPromise) return _xlsxPromise;
  _xlsxPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js';
    s.onload = () => resolve(window.XLSX);
    s.onerror = () => { _xlsxPromise = null; reject(new Error('SheetJS CDN falhou')); };
    document.head.appendChild(s);
  });
  return _xlsxPromise;
}

// ─── SANITIZAÇÃO ─────────────────────────────────────────────────────────
// Defesa contra CSV/formula injection (= + - @) e texto malicioso
function sanitizeText(s, maxLen = 500) {
  if (s == null) return null;
  let v = String(s).trim();
  if (!v) return null;
  // Anti formula injection
  if (/^[=+\-@\t]/.test(v)) v = "'" + v;
  // Comprimento
  if (v.length > maxLen) v = v.slice(0, maxLen);
  // Remove caracteres de controle
  v = v.replace(/[\x00-\x08\x0B-\x1F\x7F]/g, '');
  return v;
}

const MAX_IMPORT_ROWS = 5000;

// ─── LISTAR VISITAS (lista paginada) ─────────────────────────────────────
export async function visitasView(_params, app) {
  const content = el('div', { class: 'flex flex-col gap-4' });

  content.appendChild(el('div', { class: 'flex items-center justify-between flex-wrap gap-3' },
    el('div', {},
      el('h1', { class: 'text-2xl font-extrabold' }, '🚪 Visitas'),
      el('p', { class: 'text-sm text-fg-muted' }, 'Recepção Rottas — Registro de visitantes'),
    ),
    el('div', { class: 'flex items-center gap-2 flex-wrap' },
      // Master apenas visualiza — não pode registrar nem importar
      isRecepcao() ? el('button', {
        class: 'btn btn-secondary',
        onclick: () => downloadTemplate(),
      }, icon('download', 16), 'Baixar modelo') : null,
      isRecepcao() ? el('button', {
        class: 'btn btn-secondary',
        onclick: () => openImportModal(reload),
      }, icon('download', 16), 'Importar XLSX') : null,
      isRecepcao() ? el('button', {
        class: 'btn btn-primary',
        onclick: () => navigate('/visitas/nova'),
      }, icon('plus', 16), 'Nova Visita') : null,
    ),
  ));

  // KPIs rápidos do dia/semana/mês
  const kpisEl = el('div', { class: 'grid grid-cols-2 md:grid-cols-4 gap-3' });
  content.appendChild(kpisEl);

  // Lista
  const listEl = el('div', { class: 'flex flex-col gap-2' });
  content.appendChild(listEl);

  app.appendChild(shell(content, { title: 'Visitas' }));

  async function reload() {
    listEl.innerHTML = '<div class="skeleton h-16"></div><div class="skeleton h-16"></div>';
    kpisEl.innerHTML = '';

    // Master vê todas; Recepção só as suas (RLS já garante)
    let q = supabase.from('atividades')
      .select(`id, created_at, cliente, corretor, local_treinamento, imobiliaria,
               empreendimento, visita_periodo, visita_forma_atendimento, visita_canal,
               visita_gerente_house_id, observacoes, profiles!atividades_gerente_id_fkey(nome)`)
      .eq('tipo', 'visita')
      .eq('cancelada', false)
      .order('created_at', { ascending: false })
      .limit(500);
    const { data, error } = await q;
    if (error) { toast(error.message, 'error'); return; }
    const visitas = data || [];

    // KPIs simples
    const now = new Date();
    const today = new Date(now); today.setHours(0,0,0,0);
    const week = new Date(now.getTime() - 7 * 86400000);
    const month = new Date(now.getTime() - 30 * 86400000);
    const inRange = (d, since) => new Date(d) >= since;
    const t = visitas.filter(v => inRange(v.created_at, today)).length;
    const w = visitas.filter(v => inRange(v.created_at, week)).length;
    const m = visitas.filter(v => inRange(v.created_at, month)).length;
    const total = visitas.length;
    [
      { label: 'Hoje', value: t },
      { label: 'Últimos 7 dias', value: w },
      { label: 'Últimos 30 dias', value: m },
      { label: 'Total registrado', value: total },
    ].forEach(k => kpisEl.appendChild(el('div', { class: 'card p-3' },
      el('div', { class: 'text-xs text-fg-muted font-bold uppercase' }, k.label),
      el('div', { class: 'text-2xl font-extrabold mt-1' }, k.value.toLocaleString('pt-BR')),
    )));

    listEl.innerHTML = '';
    if (!visitas.length) {
      listEl.appendChild(el('div', { class: 'card p-8 text-center text-fg-muted' },
        'Nenhuma visita registrada. Clique em "Nova Visita" ou importe um XLSX.'));
      return;
    }

    visitas.forEach(v => listEl.appendChild(visitaRow(v)));
  }

  await reload();
}

function visitaRow(v) {
  const dt = new Date(v.created_at).toLocaleString('pt-BR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
  const gerente = state.gerentesHouse?.find(g => g.id === v.visita_gerente_house_id)?.nome;
  const canalChip = v.visita_canal
    ? el('span', { class: 'chip ' + (v.visita_canal === 'House' ? 'chip-purple' : 'chip-blue') }, v.visita_canal)
    : null;
  const formaChip = v.visita_forma_atendimento
    ? el('span', { class: 'chip ' + (v.visita_forma_atendimento === 'Agendado' ? 'chip-green' : 'chip-yellow') },
        v.visita_forma_atendimento)
    : null;

  return el('div', { class: 'card p-3' },
    el('div', { class: 'flex items-start gap-3' },
      el('div', {
        class: 'w-10 h-10 rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 text-lg',
        style: { background: 'linear-gradient(135deg, #EC4899, #BE185D)' }
      }, '🚪'),
      el('div', { class: 'flex-1 min-w-0' },
        el('div', { class: 'flex items-center gap-2 flex-wrap' },
          el('span', { class: 'font-semibold' }, v.cliente || 'sem nome'),
          formaChip,
          canalChip,
          v.visita_periodo && el('span', { class: 'chip chip-gray' }, v.visita_periodo),
        ),
        el('div', { class: 'text-xs text-fg-muted mt-1' },
          [v.local_treinamento, v.empreendimento].filter(Boolean).join(' · ') || '—'
        ),
        el('div', { class: 'text-xs text-fg-subtle mt-0.5' },
          [v.visita_canal === 'House' ? `🏠 ${gerente || '—'} ${v.corretor ? '· ' + v.corretor : ''}` :
           v.visita_canal === 'Imob' ? `🏢 ${v.imobiliaria || '—'}` : '',
           dt,
           v.profiles?.nome && `por ${v.profiles.nome}`].filter(Boolean).join(' · ')
        ),
      ),
    ),
  );
}

// ─── FORMULÁRIO DE NOVA VISITA ───────────────────────────────────────────
export async function visitaFormView(_params, app) {
  const content = el('div', { class: 'flex flex-col gap-4' });
  app.appendChild(shell(content, { title: 'Nova Visita', back: true }));

  content.appendChild(el('div', { class: 'flex items-center gap-3' },
    el('div', {
      class: 'w-12 h-12 rounded-2xl flex items-center justify-center text-2xl text-white flex-shrink-0',
      style: { background: 'linear-gradient(135deg, #EC4899, #BE185D)' },
    }, '🚪'),
    el('div', {},
      el('h1', { class: 'text-xl font-extrabold' }, 'Registrar Visita'),
      el('p', { class: 'text-xs text-fg-muted' }, 'Localização e Data são preenchidas automaticamente'),
    ),
  ));

  // Container de localização (status visível pro usuário)
  const geoStatus = el('div', { class: 'card p-3 text-sm flex items-center gap-2' },
    el('span', { class: 'text-fg-muted' }, '📍'),
    el('span', { id: 'geo-status' }, 'Capturando localização...'),
  );
  content.appendChild(geoStatus);

  // Estado para captura automática
  let geoData = null;
  getLocation()
    .then(loc => {
      geoData = loc;
      const txt = loc?.latitude ? `${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}` : '—';
      document.getElementById('geo-status').innerHTML = `<b>Localização:</b> ${txt}`;
    })
    .catch(err => {
      document.getElementById('geo-status').textContent = '⚠ Não foi possível capturar a localização. Permita acesso ao GPS.';
    });

  const form = el('form', { class: 'flex flex-col gap-3' });

  // 3. Nome + Sobrenome
  const nomeInp = el('input', { class: 'input', type: 'text', name: 'nome', required: true,
    placeholder: 'Nome e Sobrenome', autocomplete: 'off' });
  form.appendChild(fieldWrap('Nome e Sobrenome *', nomeInp));

  // 4. Local da Visita
  const localSel = selectFromList('local', state.locaisVisita, 'Selecione o local…', true);
  form.appendChild(fieldWrap('Local da Visita *', localSel));

  // 5. Empreendimento
  const empSel = selectFromList('empreendimento', state.empreendimentos, 'Selecione o empreendimento…', true);
  form.appendChild(fieldWrap('Empreendimento *', empSel));

  // 6. Período
  const periodoSel = selectFromValues('periodo', VISITA_PERIODOS, 'Selecione…', true);
  form.appendChild(fieldWrap('Período *', periodoSel));

  // 7. Forma de Atendimento
  const formaSel = selectFromValues('forma', VISITA_FORMAS, 'Selecione…', true);
  form.appendChild(fieldWrap('Forma de Atendimento *', formaSel));

  // 8. Canal (condicional)
  const canalSel = selectFromValues('canal', VISITA_CANAIS, 'Selecione…');
  const canalWrap = fieldWrap('Canal', canalSel);
  form.appendChild(canalWrap);

  // 8.1 House → Gerente House
  const gerenteHouseSel = selectFromList('gerente_house', state.gerentesHouse, 'Selecione o Gerente House…');
  const gerenteHouseWrap = fieldWrap('Gerente House', gerenteHouseSel);
  form.appendChild(gerenteHouseWrap);

  // 8.1.1 House → Corretor (texto livre)
  const corretorInp = el('input', { class: 'input', type: 'text', name: 'corretor',
    placeholder: 'Nome do corretor', autocomplete: 'off' });
  const corretorWrap = fieldWrap('Corretor', corretorInp);
  form.appendChild(corretorWrap);

  // 8.2 Imob → Imobiliária
  const imobSel = selectFromList('imobiliaria', state.imobiliarias, 'Selecione a imobiliária…');
  const imobWrap = fieldWrap('Imobiliária', imobSel);
  form.appendChild(imobWrap);

  // 9. Observações com ditado
  const obsField = audioField({
    name: 'observacoes', label: 'Observações',
    placeholder: 'Notas adicionais sobre a visita (opcional)…',
    rows: 3,
  });
  form.appendChild(obsField);

  // Lógica condicional de visibilidade/obrigatoriedade
  function applyConditional() {
    const forma = formaSel.value;
    const canal = canalSel.value;
    const isAgendado = forma === 'Agendado';
    const isHouse = canal === 'House';
    const isImob  = canal === 'Imob';

    // Canal só aparece (e obrigatório) se Agendado
    canalWrap.style.display = isAgendado ? '' : 'none';
    canalSel.required = isAgendado;

    // House: gerente_house e corretor obrigatórios
    gerenteHouseWrap.style.display = (isAgendado && isHouse) ? '' : 'none';
    gerenteHouseSel.required = (isAgendado && isHouse);
    corretorWrap.style.display = (isAgendado && isHouse) ? '' : 'none';

    // Imob: imobiliaria obrigatória
    imobWrap.style.display = (isAgendado && isImob) ? '' : 'none';
    imobSel.required = (isAgendado && isImob);
  }
  formaSel.addEventListener('change', applyConditional);
  canalSel.addEventListener('change', applyConditional);
  applyConditional();

  // Submit
  const submitBtn = el('button', { class: 'btn btn-primary btn-lg', type: 'submit' }, 'Registrar Visita');
  const cancelBtn = el('button', { type: 'button', class: 'btn btn-ghost', onclick: () => history.back() }, 'Cancelar');
  form.appendChild(el('div', { class: 'flex gap-2 mt-2' }, cancelBtn, submitBtn));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    loadingBtn(submitBtn, true);
    try {
      const nome = sanitizeText(nomeInp.value);
      const local = localSel.value;
      const empreendimento = empSel.value;
      const periodo = periodoSel.value;
      const forma = formaSel.value;
      const canal = canalSel.value || null;

      // Validação
      if (!nome) throw new Error('Nome obrigatório');
      if (!local) throw new Error('Local da Visita obrigatório');
      if (!empreendimento) throw new Error('Empreendimento obrigatório');
      if (!periodo) throw new Error('Período obrigatório');
      if (!forma) throw new Error('Forma de Atendimento obrigatória');
      if (forma === 'Agendado') {
        if (!canal) throw new Error('Canal obrigatório quando Agendado');
        if (canal === 'House' && !gerenteHouseSel.value) throw new Error('Gerente House obrigatório');
        if (canal === 'Imob' && !imobSel.value) throw new Error('Imobiliária obrigatória');
      }

      const payload = {
        tipo: 'visita',
        gerente_id: state.user.id,
        cancelada: false,
        cliente: nome,
        local_treinamento: local,
        empreendimento,
        visita_periodo: periodo,
        visita_forma_atendimento: forma,
        visita_canal: forma === 'Agendado' ? canal : null,
        visita_gerente_house_id: (forma === 'Agendado' && canal === 'House' && gerenteHouseSel.value) || null,
        corretor: (forma === 'Agendado' && canal === 'House') ? sanitizeText(corretorInp.value) : null,
        imobiliaria: (forma === 'Agendado' && canal === 'Imob') ? imobSel.value : null,
        observacoes: sanitizeText(obsField.querySelector('textarea')?.value, 2000),
        latitude: geoData?.latitude || null,
        longitude: geoData?.longitude || null,
      };

      const { error } = await supabase.from('atividades').insert(payload);
      if (error) throw error;
      toast('Visita registrada!', 'success');
      navigate('/visitas');
    } catch (err) {
      toast(err.message || 'Erro ao registrar', 'error');
      loadingBtn(submitBtn, false);
    }
  });

  content.appendChild(form);
}

// ─── HELPERS UI ──────────────────────────────────────────────────────────
function fieldWrap(label, control) {
  return el('div', { class: 'flex flex-col gap-1' },
    el('label', { class: 'text-xs font-bold text-fg-muted uppercase tracking-wider' }, label),
    control,
  );
}
function selectFromValues(name, values, placeholder, required = false) {
  const sel = el('select', { class: 'input', name, required });
  sel.appendChild(el('option', { value: '' }, placeholder));
  values.forEach(v => sel.appendChild(el('option', { value: v }, v)));
  return sel;
}
function selectFromList(name, items, placeholder, required = false) {
  const sel = el('select', { class: 'input', name, required });
  sel.appendChild(el('option', { value: '' }, placeholder));
  (items || []).forEach(it => {
    sel.appendChild(el('option', { value: it.id || it.nome }, it.nome));
  });
  return sel;
}

// ─── DOWNLOAD TEMPLATE XLSX ──────────────────────────────────────────────
async function downloadTemplate() {
  try {
    const XLSX = await loadXLSX();
    const wb = XLSX.utils.book_new();

    // Aba "Dados" — cabeçalhos
    const dataHeaders = [
      'Nome Sobrenome', 'Local da Visita', 'Empreendimento',
      'Período (Manhã/Tarde/Noite)', 'Forma (Espontânea/Agendado)',
      'Canal (House/Imob — só se Agendado)',
      'Gerente House (se Canal=House)', 'Corretor (se Canal=House)',
      'Imobiliária (se Canal=Imob)', 'Observações',
    ];
    const dataAA = [dataHeaders, ['', '', '', 'Manhã', 'Espontânea', '', '', '', '', '']];
    const wsDados = XLSX.utils.aoa_to_sheet(dataAA);
    wsDados['!cols'] = dataHeaders.map(() => ({ wch: 22 }));
    XLSX.utils.book_append_sheet(wb, wsDados, 'Dados');

    // Aba "Instruções"
    const instrucoes = [
      ['INSTRUÇÕES DE PREENCHIMENTO'],
      [''],
      ['Esta planilha permite registrar várias Visitas de uma só vez.'],
      ['Preencha a aba "Dados" e faça o upload no app.'],
      [''],
      ['Regras:'],
      ['1. Localização é capturada automaticamente do seu dispositivo.'],
      ['2. Data é registrada automaticamente no momento do upload.'],
      ['3. Linhas com erro REJEITAM o arquivo INTEIRO (nada é salvo).'],
      ['4. Limite: 5.000 linhas por importação.'],
      [''],
      ['Campos obrigatórios sempre: Nome Sobrenome, Local, Empreendimento, Período, Forma.'],
      [''],
      ['Se Forma = Espontânea: Canal/Gerente House/Corretor/Imobiliária ficam OPCIONAIS.'],
      ['Se Forma = Agendado:  Canal é OBRIGATÓRIO.'],
      ['   - Se Canal = House: Gerente House e Corretor são OBRIGATÓRIOS'],
      ['   - Se Canal = Imob:  Imobiliária é OBRIGATÓRIA'],
      [''],
      ['Valores aceitos:'],
      ['  Período: Manhã | Tarde | Noite'],
      ['  Forma:   Espontânea | Agendado'],
      ['  Canal:   House | Imob'],
      [''],
      ['Local da Visita: use exatamente o nome cadastrado em Listas > Locais de Visita'],
      ['Empreendimento:  use exatamente o nome cadastrado em Listas > Empreendimentos'],
      ['Gerente House:   use exatamente o nome cadastrado em Listas > Gerentes House'],
      ['Imobiliária:     use exatamente o nome cadastrado em Listas > Imobiliárias'],
    ];
    const wsInstr = XLSX.utils.aoa_to_sheet(instrucoes);
    wsInstr['!cols'] = [{ wch: 90 }];
    XLSX.utils.book_append_sheet(wb, wsInstr, 'Instruções');

    XLSX.writeFile(wb, `modelo_visitas_${new Date().toISOString().slice(0,10)}.xlsx`);
    toast('Modelo baixado', 'success');
  } catch (e) {
    toast('Erro ao gerar modelo: ' + e.message, 'error');
  }
}

// ─── IMPORTAR XLSX ───────────────────────────────────────────────────────
function openImportModal(onSuccess) {
  const fileInput = el('input', { type: 'file', accept: '.xlsx,.xls', class: 'input' });
  const resultBox = el('div', { class: 'text-sm', style: { 'max-height': '300px', 'overflow-y': 'auto' } });
  const submitBtn = el('button', { class: 'btn btn-primary', disabled: true }, 'Importar');
  const cancelBtn = el('button', { class: 'btn btn-ghost', onclick: () => m.close() }, 'Cancelar');

  let parsedRows = null;
  let geoData = null;

  // Captura geo no momento da abertura
  getLocation().then(loc => { geoData = loc; }).catch(() => {});

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    resultBox.innerHTML = 'Lendo arquivo…';
    submitBtn.disabled = true;
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('Arquivo muito grande (máx 10MB)');
      const XLSX = await loadXLSX();
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets['Dados'] || wb.Sheets[wb.SheetNames[0]];
      if (!ws) throw new Error('Aba "Dados" não encontrada');
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
      if (!rows.length) throw new Error('Planilha vazia');
      if (rows.length > MAX_IMPORT_ROWS) throw new Error(`Máximo de ${MAX_IMPORT_ROWS} linhas por importação`);

      // Validação por linha
      const errors = [];
      const normalized = [];
      rows.forEach((r, idx) => {
        const linha = idx + 2; // +1 cabeçalho, +1 base 1
        const nome  = sanitizeText(r['Nome Sobrenome']);
        const local = sanitizeText(r['Local da Visita']);
        const emp   = sanitizeText(r['Empreendimento']);
        const periodo = sanitizeText(r['Período (Manhã/Tarde/Noite)']);
        const forma   = sanitizeText(r['Forma (Espontânea/Agendado)']);
        const canal   = sanitizeText(r['Canal (House/Imob — só se Agendado)']);
        const ghouse  = sanitizeText(r['Gerente House (se Canal=House)']);
        const corretor = sanitizeText(r['Corretor (se Canal=House)']);
        const imob    = sanitizeText(r['Imobiliária (se Canal=Imob)']);
        const obs     = sanitizeText(r['Observações'], 2000);

        // Required base
        if (!nome)    errors.push({ linha, coluna: 'Nome Sobrenome', motivo: 'obrigatório' });
        if (!local)   errors.push({ linha, coluna: 'Local da Visita', motivo: 'obrigatório' });
        if (!emp)     errors.push({ linha, coluna: 'Empreendimento', motivo: 'obrigatório' });
        if (!periodo) errors.push({ linha, coluna: 'Período', motivo: 'obrigatório' });
        if (!forma)   errors.push({ linha, coluna: 'Forma', motivo: 'obrigatório' });

        // Valores válidos
        if (periodo && !VISITA_PERIODOS.includes(periodo)) errors.push({ linha, coluna: 'Período', motivo: `valor inválido (use ${VISITA_PERIODOS.join('|')})` });
        if (forma && !VISITA_FORMAS.includes(forma))       errors.push({ linha, coluna: 'Forma', motivo: `valor inválido (use ${VISITA_FORMAS.join('|')})` });

        // Listas mestras
        if (local && !state.locaisVisita.some(x => x.nome === local))
          errors.push({ linha, coluna: 'Local da Visita', motivo: `"${local}" não cadastrado em Listas > Locais` });
        if (emp && !state.empreendimentos.some(x => x.nome === emp))
          errors.push({ linha, coluna: 'Empreendimento', motivo: `"${emp}" não cadastrado` });

        // Condicional Agendado
        if (forma === 'Agendado') {
          if (!canal) errors.push({ linha, coluna: 'Canal', motivo: 'obrigatório quando Agendado' });
          else if (!VISITA_CANAIS.includes(canal)) errors.push({ linha, coluna: 'Canal', motivo: `valor inválido (use ${VISITA_CANAIS.join('|')})` });
          else if (canal === 'House') {
            if (!ghouse) errors.push({ linha, coluna: 'Gerente House', motivo: 'obrigatório quando Canal=House' });
            else if (!state.gerentesHouse.some(x => x.nome === ghouse))
              errors.push({ linha, coluna: 'Gerente House', motivo: `"${ghouse}" não cadastrado` });
            if (!corretor) errors.push({ linha, coluna: 'Corretor', motivo: 'obrigatório quando Canal=House' });
          } else if (canal === 'Imob') {
            if (!imob) errors.push({ linha, coluna: 'Imobiliária', motivo: 'obrigatório quando Canal=Imob' });
            else if (!state.imobiliarias.some(x => x.nome === imob))
              errors.push({ linha, coluna: 'Imobiliária', motivo: `"${imob}" não cadastrada` });
          }
        }

        const ghObj = ghouse ? state.gerentesHouse.find(x => x.nome === ghouse) : null;
        normalized.push({
          tipo: 'visita',
          gerente_id: state.user.id,
          cancelada: false,
          cliente: nome,
          local_treinamento: local,
          empreendimento: emp,
          visita_periodo: periodo,
          visita_forma_atendimento: forma,
          visita_canal: forma === 'Agendado' ? canal : null,
          visita_gerente_house_id: (forma === 'Agendado' && canal === 'House' && ghObj) ? ghObj.id : null,
          corretor: (forma === 'Agendado' && canal === 'House') ? corretor : null,
          imobiliaria: (forma === 'Agendado' && canal === 'Imob') ? imob : null,
          observacoes: obs,
        });
      });

      if (errors.length) {
        const html = `<div style="color:var(--red);font-weight:700;margin-bottom:6px;">⚠ Verifique seu arquivo — ${errors.length} erro(s) encontrado(s). Nenhum registro foi salvo.</div>
          <table style="font-size:11px;width:100%;border-collapse:collapse;">
            <thead><tr><th style="text-align:left;padding:4px;">Linha</th><th style="text-align:left;padding:4px;">Coluna</th><th style="text-align:left;padding:4px;">Motivo</th></tr></thead>
            <tbody>${errors.slice(0,100).map(e => `<tr><td style="padding:3px 4px;">${e.linha}</td><td style="padding:3px 4px;">${e.coluna}</td><td style="padding:3px 4px;">${e.motivo}</td></tr>`).join('')}</tbody>
          </table>
          ${errors.length > 100 ? `<p style="font-size:11px;color:var(--fg-muted);margin-top:6px;">+ ${errors.length - 100} erros não exibidos…</p>` : ''}`;
        resultBox.innerHTML = html;
        submitBtn.disabled = true;
        parsedRows = null;
        return;
      }

      parsedRows = normalized;
      resultBox.innerHTML = `<div style="color:var(--green);font-weight:700;">✓ Arquivo válido — ${normalized.length} visita(s) prontas para importar.</div>
        <div style="font-size:11px;color:var(--fg-muted);margin-top:4px;">Localização será derivada do seu dispositivo no momento do upload.</div>`;
      submitBtn.disabled = false;
    } catch (err) {
      resultBox.innerHTML = `<div style="color:var(--red);font-weight:700;">Erro: ${err.message}</div>`;
      submitBtn.disabled = true;
      parsedRows = null;
    }
  });

  submitBtn.addEventListener('click', async () => {
    if (!parsedRows) return;
    loadingBtn(submitBtn, true);
    try {
      // Aplica geo derivada do uploader em TODAS as linhas
      const enriched = parsedRows.map(r => ({
        ...r,
        latitude: geoData?.latitude || null,
        longitude: geoData?.longitude || null,
      }));

      // Insere em batch único (Supabase faz UMA transação por insert array)
      const { error } = await supabase.from('atividades').insert(enriched);
      if (error) throw error;

      // Auditoria
      await supabase.from('visitas_imports').insert({
        user_id: state.user.id,
        filename: fileInput.files[0]?.name || null,
        qtd_registros: enriched.length,
        geo: geoData ? { lat: geoData.latitude, lng: geoData.longitude } : null,
        status: 'ok',
      });

      toast(`${enriched.length} visita(s) importadas com sucesso!`, 'success');
      m.close();
      onSuccess?.();
    } catch (err) {
      // Tenta gravar auditoria de falha (best-effort)
      try {
        await supabase.from('visitas_imports').insert({
          user_id: state.user.id,
          filename: fileInput.files[0]?.name || null,
          qtd_registros: 0, status: 'erro', erro: err.message,
        });
      } catch {}
      toast('Erro: ' + (err.message || err), 'error');
      loadingBtn(submitBtn, false);
    }
  });

  const content = el('div', { class: 'flex flex-col gap-3' },
    el('p', { class: 'text-sm text-fg-muted' },
      'Selecione um arquivo XLSX preenchido conforme o modelo. Localização e Data são adicionadas automaticamente.'),
    fileInput,
    resultBox,
  );

  const m = modal({
    title: 'Importar Visitas em Massa',
    size: 'lg',
    content,
    footer: [cancelBtn, submitBtn],
  });
}
