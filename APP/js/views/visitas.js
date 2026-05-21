// ═════════════════════════════════════════════════════════════════════════
// Visitas — Atividade exclusiva do perfil Recepção Rottas
// - visitasView:   lista das visitas registradas + botão importar/baixar template
// - visitaFormView: formulário de registro individual (com lógica condicional)
// ═════════════════════════════════════════════════════════════════════════

import { el, icon, toast, loadingBtn, fmt, modal } from '../ui.js';
import { shell } from './shell.js';
import { state, supabase } from '../supabase.js';
import { navigate } from '../router.js';
import { audioField } from '../components/audio-field.js';
import { field, locationField, creatableSelect } from '../components/form-fields.js';
import { VISITA_PERIODOS, VISITA_FORMAS, VISITA_CANAIS } from '../config.js';
import { isRecepcao } from '../auth.js';

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
function sanitizeText(s, maxLen = 500) {
  if (s == null) return null;
  let v = String(s).trim();
  if (!v) return null;
  if (/^[=+\-@\t]/.test(v)) v = "'" + v;
  if (v.length > maxLen) v = v.slice(0, maxLen);
  v = v.replace(/[\x00-\x08\x0B-\x1F\x7F]/g, '');
  return v;
}

const MAX_IMPORT_ROWS = 5000;

// ─── LISTAR VISITAS ──────────────────────────────────────────────────────
export async function visitasView(_params, app) {
  const content = el('div', { class: 'flex flex-col gap-4' });

  content.appendChild(el('div', { class: 'flex items-center justify-between flex-wrap gap-3' },
    el('div', {},
      el('h1', { class: 'text-2xl font-extrabold' }, '🚪 Visitas'),
      el('p', { class: 'text-sm text-fg-muted' }, 'Recepção Rottas — Registro de visitantes'),
    ),
    el('div', { class: 'flex items-center gap-2 flex-wrap' },
      isRecepcao() ? el('button', { class: 'btn btn-secondary', onclick: () => downloadTemplate() },
        icon('download', 16), 'Baixar modelo') : null,
      isRecepcao() ? el('button', { class: 'btn btn-secondary', onclick: () => openImportModal(reload) },
        icon('download', 16), 'Importar XLSX') : null,
      isRecepcao() ? el('button', { class: 'btn btn-primary', onclick: () => navigate('/visitas/nova') },
        icon('plus', 16), 'Nova Visita') : null,
    ),
  ));

  const kpisEl = el('div', { class: 'grid grid-cols-2 md:grid-cols-4 gap-3' });
  content.appendChild(kpisEl);

  const listEl = el('div', { class: 'flex flex-col gap-2' });
  content.appendChild(listEl);

  app.appendChild(shell(content, { title: 'Visitas' }));

  async function reload() {
    listEl.innerHTML = '<div class="skeleton h-16"></div><div class="skeleton h-16"></div>';
    kpisEl.innerHTML = '';

    let q = supabase.from('atividades')
      .select(`id, numero_sequencial, created_at, cliente, corretor, local_treinamento,
               imobiliaria, empreendimento, visita_periodo, visita_forma_atendimento,
               visita_canal, visita_gerente_house_id, observacoes,
               profiles!atividades_gerente_id_fkey(nome)`)
      .eq('tipo', 'visita')
      .eq('cancelada', false)
      .order('created_at', { ascending: false })
      .limit(500);
    const { data, error } = await q;
    if (error) { toast(error.message, 'error'); return; }
    const visitas = data || [];

    const now = new Date();
    const today = new Date(now); today.setHours(0,0,0,0);
    const week = new Date(now.getTime() - 7 * 86400000);
    const month = new Date(now.getTime() - 30 * 86400000);
    const t = visitas.filter(v => new Date(v.created_at) >= today).length;
    const w = visitas.filter(v => new Date(v.created_at) >= week).length;
    const m = visitas.filter(v => new Date(v.created_at) >= month).length;
    [
      { label: 'Hoje', value: t },
      { label: 'Últimos 7 dias', value: w },
      { label: 'Últimos 30 dias', value: m },
      { label: 'Total registrado', value: visitas.length },
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
  const numTag = v.numero_sequencial ? `#${v.numero_sequencial} ` : '';

  return el('div', { class: 'card p-3' },
    el('div', { class: 'flex items-start gap-3' },
      el('div', {
        class: 'w-10 h-10 rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 text-lg',
        style: { background: 'linear-gradient(135deg, #EC4899, #BE185D)' }
      }, '🚪'),
      el('div', { class: 'flex-1 min-w-0' },
        el('div', { class: 'flex items-center gap-2 flex-wrap' },
          el('span', { class: 'text-fg-muted font-bold text-sm' }, numTag),
          el('span', { class: 'font-semibold' }, v.cliente || 'sem nome'),
          v.visita_forma_atendimento && el('span', {
            class: 'chip ' + (v.visita_forma_atendimento === 'Agendado' ? 'chip-green' : 'chip-yellow')
          }, v.visita_forma_atendimento),
          v.visita_canal && el('span', {
            class: 'chip ' + (v.visita_canal === 'House' ? 'chip-purple' : 'chip-blue')
          }, v.visita_canal),
          v.visita_periodo && el('span', { class: 'chip chip-gray' }, v.visita_periodo),
        ),
        el('div', { class: 'text-xs text-fg-muted mt-1' },
          [v.local_treinamento, v.empreendimento].filter(Boolean).join(' · ') || '—'),
        el('div', { class: 'text-xs text-fg-subtle mt-0.5' },
          [v.visita_canal === 'House' ? `🏠 ${gerente || '—'} ${v.corretor ? '· ' + v.corretor : ''}` :
           v.visita_canal === 'Imob' ? `🏢 ${v.imobiliaria || '—'}` : '',
           dt,
           v.profiles?.nome && `por ${v.profiles.nome}`].filter(Boolean).join(' · ')),
      ),
    ),
  );
}

// ─── FORMULÁRIO ──────────────────────────────────────────────────────────
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

  // Localização com mini-mapa (mesmo componente do checkin)
  const locationFieldEl = locationField();

  const form = el('form', { class: 'flex flex-col gap-3' });

  // Campo Nome
  const nomeInp = el('input', { class: 'input', type: 'text', name: 'nome', required: true,
    placeholder: 'Nome e Sobrenome', autocomplete: 'off' });

  // Local da Visita — usa creatableSelect (mesmo do checkin)
  const localSel = creatableSelect({
    name: 'local', items: state.locaisVisita, required: true,
    allowAdd: false,
  });

  // Empreendimento — creatableSelect também
  const empSel = creatableSelect({
    name: 'empreendimento', items: state.empreendimentos, required: true,
    allowAdd: false,
  });

  const periodoSel = selectFromValues('periodo', VISITA_PERIODOS, 'Selecione…', true);
  const formaSel   = selectFromValues('forma', VISITA_FORMAS, 'Selecione…', true);
  const canalSel   = selectFromValues('canal', VISITA_CANAIS, 'Selecione…');

  const gerenteHouseSel = el('select', { class: 'input', name: 'gerente_house' },
    el('option', { value: '' }, 'Selecione o Gerente House…'),
    ...(state.gerentesHouse || []).map(g =>
      el('option', { value: g.id }, g.nome)));

  const corretorInp = el('input', { class: 'input', type: 'text', name: 'corretor',
    placeholder: 'Nome do corretor', autocomplete: 'off' });

  const imobSel = creatableSelect({
    name: 'imobiliaria', items: state.imobiliarias,
    allowAdd: false,
  });

  // Observações: textarea próprio + audioField apontando pra ele
  const obsEl = el('textarea', { class: 'input', name: 'observacoes', rows: 3,
    placeholder: 'Notas adicionais sobre a visita (opcional)…' });
  const audioFieldEl = audioField({ targetTextarea: obsEl });

  // Wrappers que vão ser ocultados/exibidos
  const canalField        = field('Canal', canalSel);
  const gerenteHouseField = field('Gerente House', gerenteHouseSel);
  const corretorField     = field('Corretor', corretorInp);
  const imobField         = field('Imobiliária', imobSel);

  form.append(
    field('Localização', locationFieldEl, { required: true }),
    field('Nome e Sobrenome', nomeInp, { required: true }),
    field('Local da Visita', localSel, { required: true }),
    field('Empreendimento', empSel, { required: true }),
    field('Período', periodoSel, { required: true }),
    field('Forma de Atendimento', formaSel, { required: true }),
    canalField,
    gerenteHouseField,
    corretorField,
    imobField,
    field('Observações', obsEl),
    audioFieldEl,
  );

  // Lógica condicional
  function applyConditional() {
    const forma = formaSel.value;
    const canal = canalSel.value;
    const isAgendado = forma === 'Agendado';
    const isHouse = canal === 'House';
    const isImob  = canal === 'Imob';

    canalField.style.display = isAgendado ? '' : 'none';
    canalSel.required = isAgendado;

    gerenteHouseField.style.display = (isAgendado && isHouse) ? '' : 'none';
    gerenteHouseSel.required = (isAgendado && isHouse);

    corretorField.style.display = (isAgendado && isHouse) ? '' : 'none';
    corretorInp.required = (isAgendado && isHouse);

    imobField.style.display = (isAgendado && isImob) ? '' : 'none';
    // creatableSelect tem um input hidden — vamos validar manualmente no submit
  }
  formaSel.addEventListener('change', applyConditional);
  canalSel.addEventListener('change', applyConditional);
  applyConditional();

  // Submit
  const submitBtn = el('button', { class: 'btn btn-primary btn-lg', type: 'submit' }, 'Registrar Visita');
  const cancelBtn = el('button', { type: 'button', class: 'btn btn-ghost', onclick: () => history.back() }, 'Cancelar');
  form.appendChild(el('div', { class: 'flex gap-2 mt-2' }, cancelBtn, submitBtn));

  // Helper para ler valor de creatableSelect (hidden input dentro)
  const readSel = (selEl) => {
    const hidden = selEl.querySelector?.('input[type="hidden"]');
    return (hidden?.value ?? selEl.value ?? '').trim();
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    loadingBtn(submitBtn, true);
    try {
      const nome  = sanitizeText(nomeInp.value);
      const local = readSel(localSel);
      const emp   = readSel(empSel);
      const periodo = periodoSel.value;
      const forma   = formaSel.value;
      const canal   = canalSel.value || null;
      const imobValue = readSel(imobSel);

      if (!nome) throw new Error('Nome obrigatório');
      if (!local) throw new Error('Local da Visita obrigatório');
      if (!emp) throw new Error('Empreendimento obrigatório');
      if (!periodo) throw new Error('Período obrigatório');
      if (!forma) throw new Error('Forma de Atendimento obrigatória');
      if (forma === 'Agendado') {
        if (!canal) throw new Error('Canal obrigatório quando Agendado');
        if (canal === 'House' && !gerenteHouseSel.value) throw new Error('Gerente House obrigatório');
        if (canal === 'House' && !sanitizeText(corretorInp.value)) throw new Error('Corretor obrigatório quando House');
        if (canal === 'Imob' && !imobValue) throw new Error('Imobiliária obrigatória quando Imob');
      }

      // Localização vem do locationField (hidden inputs lat/lng)
      const latInp = locationFieldEl.querySelector('input[name="latitude"]');
      const lngInp = locationFieldEl.querySelector('input[name="longitude"]');
      const lat = latInp?.value ? parseFloat(latInp.value) : null;
      const lng = lngInp?.value ? parseFloat(lngInp.value) : null;

      const payload = {
        tipo: 'visita',
        gerente_id: state.user.id,
        cancelada: false,
        cliente: nome,
        local_treinamento: local,
        empreendimento: emp,
        visita_periodo: periodo,
        visita_forma_atendimento: forma,
        visita_canal: forma === 'Agendado' ? canal : null,
        visita_gerente_house_id: (forma === 'Agendado' && canal === 'House' && gerenteHouseSel.value) || null,
        corretor: (forma === 'Agendado' && canal === 'House') ? sanitizeText(corretorInp.value) : null,
        imobiliaria: (forma === 'Agendado' && canal === 'Imob') ? imobValue : null,
        observacoes: sanitizeText(obsEl.value, 2000),
        latitude: lat,
        longitude: lng,
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

// ─── HELPERS ─────────────────────────────────────────────────────────────
function selectFromValues(name, values, placeholder, required = false) {
  const sel = el('select', { class: 'input', name });
  if (required) sel.setAttribute('required', '');
  sel.appendChild(el('option', { value: '' }, placeholder));
  values.forEach(v => sel.appendChild(el('option', { value: v }, v)));
  return sel;
}

// ─── XLSX TEMPLATE com data validation, comentários e listas suspensas ──
async function downloadTemplate() {
  try {
    const XLSX = await loadXLSX();
    const wb = XLSX.utils.book_new();

    // ── Aba "Listas" (oculta) — fonte das validações ──
    const locais   = state.locaisVisita.map(x => x.nome);
    const emps     = state.empreendimentos.map(x => x.nome);
    const gerentes = state.gerentesHouse.map(x => x.nome);
    const imobs    = state.imobiliarias.map(x => x.nome);

    // ── Aba "Dados" (cabeçalhos + 1 linha exemplo) ──
    const dataHeaders = [
      'Data de Importação',     // A — preenchida pelo sistema, ignorada no parse
      'Nome e Sobrenome',       // B
      'Local da Visita',        // C
      'Empreendimento',         // D
      'Período',                // E (Manhã/Tarde/Noite)
      'Forma de Atendimento',   // F (Espontânea/Agendado)
      'Canal',                  // G (House/Imob) — só se Agendado
      'Gerente House',          // H — só se Canal=House
      'Corretor',               // I — só se Canal=House
      'Imobiliária',            // J — só se Canal=Imob
      'Observações',            // K
    ];
    const exemploRow = [
      new Date().toLocaleDateString('pt-BR'),
      'João da Silva',
      locais[0] || '<preencher>',
      emps[0] || '<preencher>',
      'Manhã', 'Espontânea',
      '', '', '', '', 'Visita exemplo (apague esta linha)'
    ];

    const dataAA = [dataHeaders, exemploRow];
    const wsDados = XLSX.utils.aoa_to_sheet(dataAA);
    wsDados['!cols'] = [
      { wch: 18 }, { wch: 28 }, { wch: 22 }, { wch: 24 },
      { wch: 14 }, { wch: 20 }, { wch: 16 }, { wch: 22 },
      { wch: 20 }, { wch: 26 }, { wch: 40 },
    ];

    // Comentários (pop-ups) nos cabeçalhos
    const headerComments = {
      A1: 'Data registrada automaticamente no momento da importação. Coluna apenas informativa — não precisa preencher.',
      B1: 'OBRIGATÓRIO. Nome completo do visitante (Nome + Sobrenome).',
      C1: 'OBRIGATÓRIO. Selecione um Local da Visita cadastrado. Use a lista suspensa.',
      D1: 'OBRIGATÓRIO. Selecione um Empreendimento cadastrado. Use a lista suspensa.',
      E1: 'OBRIGATÓRIO. Manhã, Tarde ou Noite. Use a lista suspensa.',
      F1: 'OBRIGATÓRIO. Espontânea = sem agendamento prévio. Agendado = exige Canal preenchido.',
      G1: 'OBRIGATÓRIO se Forma=Agendado. House = atendimento próprio. Imob = via imobiliária parceira.',
      H1: 'OBRIGATÓRIO se Canal=House. Selecione o Gerente House responsável.',
      I1: 'OBRIGATÓRIO se Canal=House. Nome do corretor que conduziu a visita.',
      J1: 'OBRIGATÓRIO se Canal=Imob. Selecione a Imobiliária responsável.',
      K1: 'Opcional. Notas adicionais sobre a visita (máx 2000 caracteres).',
    };
    Object.entries(headerComments).forEach(([cell, text]) => {
      if (!wsDados[cell]) wsDados[cell] = {};
      wsDados[cell].c = [{ a: 'Imob Rottas', t: text, T: true }];
    });

    // ── Data validation (lista suspensa) — usa intervalos da aba "Listas" ──
    // Cobre as linhas 2 a 5001 (acima do header)
    const N = 5001;
    const setListValidation = (col, sourceRange) => {
      if (!wsDados['!dataValidation']) wsDados['!dataValidation'] = [];
      wsDados['!dataValidation'].push({
        type: 'list',
        sqref: `${col}2:${col}${N}`,
        formula1: sourceRange,
        showDropDown: false, // false = mostra a setinha
      });
    };

    // Listas inline (cabe em formula1 do SheetJS quando curtas)
    const setInlineValidation = (col, values) => {
      if (!wsDados['!dataValidation']) wsDados['!dataValidation'] = [];
      // Excel exige aspas duplas em torno do conteúdo
      const formula = `"${values.join(',')}"`;
      wsDados['!dataValidation'].push({
        type: 'list',
        sqref: `${col}2:${col}${N}`,
        formula1: formula,
      });
    };

    // Inline (poucos valores): Período, Forma, Canal
    setInlineValidation('E', VISITA_PERIODOS);  // Manhã, Tarde, Noite
    setInlineValidation('F', VISITA_FORMAS);    // Espontânea, Agendado
    setInlineValidation('G', VISITA_CANAIS);    // House, Imob

    // Range (muitos valores): Local, Empreendimento, Gerente House, Imobiliária
    setListValidation('C', `Listas!$A$2:$A$${locais.length + 1}`);
    setListValidation('D', `Listas!$B$2:$B$${emps.length + 1}`);
    setListValidation('H', `Listas!$C$2:$C$${gerentes.length + 1}`);
    setListValidation('J', `Listas!$D$2:$D$${imobs.length + 1}`);

    XLSX.utils.book_append_sheet(wb, wsDados, 'Dados');

    // ── Aba "Listas" — fonte das listas suspensas (oculta) ──
    const maxLen = Math.max(locais.length, emps.length, gerentes.length, imobs.length);
    const listsAA = [['Locais de Visita', 'Empreendimentos', 'Gerentes House', 'Imobiliárias']];
    for (let i = 0; i < maxLen; i++) {
      listsAA.push([
        locais[i] || '',
        emps[i] || '',
        gerentes[i] || '',
        imobs[i] || '',
      ]);
    }
    const wsListas = XLSX.utils.aoa_to_sheet(listsAA);
    wsListas['!cols'] = [{ wch: 28 }, { wch: 30 }, { wch: 26 }, { wch: 32 }];
    XLSX.utils.book_append_sheet(wb, wsListas, 'Listas');
    // Oculta a aba (Excel respeita)
    if (!wb.Workbook) wb.Workbook = {};
    if (!wb.Workbook.Sheets) wb.Workbook.Sheets = [];
    wb.Workbook.Sheets = wb.SheetNames.map(n => ({
      name: n, Hidden: n === 'Listas' ? 1 : 0,
    }));

    // ── Aba "Instruções" ──
    const instrucoes = [
      ['INSTRUÇÕES DE IMPORTAÇÃO DE VISITAS'],
      [''],
      ['Esta planilha permite registrar várias Visitas de uma só vez.'],
      ['Preencha a aba "Dados" e faça o upload no app pelo botão "Importar XLSX".'],
      [''],
      ['REGRAS:'],
      ['1. A coluna A (Data de Importação) é apenas informativa — preenchida automaticamente.'],
      ['2. Localização é capturada do dispositivo no momento do upload (não preencha).'],
      ['3. Use APENAS valores das listas suspensas — escrita diferente gera rejeição.'],
      ['4. Linhas com erro REJEITAM o arquivo INTEIRO (nada é salvo).'],
      ['5. Limite: 5.000 linhas por importação.'],
      [''],
      ['CAMPOS OBRIGATÓRIOS sempre:'],
      ['  Nome e Sobrenome, Local da Visita, Empreendimento, Período, Forma de Atendimento'],
      [''],
      ['REGRAS CONDICIONAIS:'],
      ['  Forma = Espontânea → Canal/Gerente House/Corretor/Imobiliária ficam VAZIOS'],
      ['  Forma = Agendado   → Canal é OBRIGATÓRIO. Conforme o canal:'],
      ['     Canal = House → Gerente House e Corretor são OBRIGATÓRIOS'],
      ['     Canal = Imob  → Imobiliária é OBRIGATÓRIA'],
      [''],
      ['DICA:'],
      ['  Passe o mouse sobre os cabeçalhos da aba "Dados" para ver o tooltip de cada coluna.'],
      ['  As células com seta para baixo (▼) têm lista suspensa — escolha um valor cadastrado.'],
    ];
    const wsInstr = XLSX.utils.aoa_to_sheet(instrucoes);
    wsInstr['!cols'] = [{ wch: 90 }];
    XLSX.utils.book_append_sheet(wb, wsInstr, 'Instruções');

    XLSX.writeFile(wb, `modelo_visitas_${new Date().toISOString().slice(0,10)}.xlsx`);
    toast('Modelo baixado com listas suspensas e validação', 'success');
  } catch (e) {
    console.error('[downloadTemplate]', e);
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

  // Captura geo via geo.js (sem mapa, só coordenadas pra auditoria)
  import('../geo.js').then(({ getLocation }) => {
    getLocation().then(loc => { geoData = loc; }).catch(() => {});
  });

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

      const errors = [];
      const normalized = [];
      rows.forEach((r, idx) => {
        const linha = idx + 2;
        // Aceita tanto chaves novas quanto antigas (compat)
        const nome    = sanitizeText(r['Nome e Sobrenome'] ?? r['Nome Sobrenome']);
        const local   = sanitizeText(r['Local da Visita']);
        const emp     = sanitizeText(r['Empreendimento']);
        const periodo = sanitizeText(r['Período'] ?? r['Período (Manhã/Tarde/Noite)']);
        const forma   = sanitizeText(r['Forma de Atendimento'] ?? r['Forma (Espontânea/Agendado)']);
        const canal   = sanitizeText(r['Canal'] ?? r['Canal (House/Imob — só se Agendado)']);
        const ghouse  = sanitizeText(r['Gerente House'] ?? r['Gerente House (se Canal=House)']);
        const corretor = sanitizeText(r['Corretor'] ?? r['Corretor (se Canal=House)']);
        const imob    = sanitizeText(r['Imobiliária'] ?? r['Imobiliária (se Canal=Imob)']);
        const obs     = sanitizeText(r['Observações'], 2000);

        if (!nome)    errors.push({ linha, coluna: 'Nome e Sobrenome', motivo: 'obrigatório' });
        if (!local)   errors.push({ linha, coluna: 'Local da Visita', motivo: 'obrigatório' });
        if (!emp)     errors.push({ linha, coluna: 'Empreendimento', motivo: 'obrigatório' });
        if (!periodo) errors.push({ linha, coluna: 'Período', motivo: 'obrigatório' });
        if (!forma)   errors.push({ linha, coluna: 'Forma de Atendimento', motivo: 'obrigatório' });

        if (periodo && !VISITA_PERIODOS.includes(periodo)) errors.push({ linha, coluna: 'Período', motivo: `valor inválido (use ${VISITA_PERIODOS.join('|')})` });
        if (forma && !VISITA_FORMAS.includes(forma))       errors.push({ linha, coluna: 'Forma', motivo: `valor inválido (use ${VISITA_FORMAS.join('|')})` });

        if (local && !state.locaisVisita.some(x => x.nome === local))
          errors.push({ linha, coluna: 'Local da Visita', motivo: `"${local}" não cadastrado` });
        if (emp && !state.empreendimentos.some(x => x.nome === emp))
          errors.push({ linha, coluna: 'Empreendimento', motivo: `"${emp}" não cadastrado` });

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
      const enriched = parsedRows.map(r => ({
        ...r,
        latitude: geoData?.latitude || null,
        longitude: geoData?.longitude || null,
      }));

      const { error } = await supabase.from('atividades').insert(enriched);
      if (error) throw error;

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
