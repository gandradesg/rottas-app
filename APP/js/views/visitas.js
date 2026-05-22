// ═════════════════════════════════════════════════════════════════════════
// Visitas — Atividade exclusiva do perfil Recepção Rottas
// - visitasView:   lista das visitas registradas + botão importar/baixar template
// - visitaFormView: formulário de registro individual (com lógica condicional)
// ═════════════════════════════════════════════════════════════════════════

import { el, icon, toast, loadingBtn, fmt, modal, confirmModal } from '../ui.js';
import { shell } from './shell.js';
import { state, supabase } from '../supabase.js';
import { navigate } from '../router.js';
import { audioField } from '../components/audio-field.js';
import { field, locationField, creatableSelect } from '../components/form-fields.js';
import { VISITA_PERIODOS, VISITA_FORMAS, VISITA_CANAIS } from '../config.js';
import { isRecepcao } from '../auth.js';

// ─── SHEETJS (apenas LEITURA do upload) + ExcelJS (ESCRITA com validation) ──
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

let _exceljsPromise = null;
async function loadExcelJS() {
  if (window.ExcelJS) return window.ExcelJS;
  if (_exceljsPromise) return _exceljsPromise;
  _exceljsPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
    s.onload = () => resolve(window.ExcelJS);
    s.onerror = () => { _exceljsPromise = null; reject(new Error('ExcelJS CDN falhou')); };
    document.head.appendChild(s);
  });
  return _exceljsPromise;
}

// ─── PARSE DE DATA — robusto a vários formatos do Excel ────────────────
// Aceita: Date object, "AAAA-MM-DD", "DD/MM/AAAA", "DD/MM/AA" e (heurístico)
// "MM/DD/AAAA" (formato US — quando o Excel do usuário usa locale en-US).
// Retorna "AAAA-MM-DD" pronto pro PostgreSQL ou null se inválido.
function parseDateBR(v) {
  if (v == null || v === '') return null;
  // Date object (Excel quando célula é date e SheetJS converteu)
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return v.getFullYear() + '-' + String(v.getMonth()+1).padStart(2,'0') + '-' + String(v.getDate()).padStart(2,'0');
  }
  // Número serial do Excel (dias desde 1900-01-01)
  if (typeof v === 'number' && v > 0) {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime())) {
      return d.getUTCFullYear() + '-' + String(d.getUTCMonth()+1).padStart(2,'0') + '-' + String(d.getUTCDate()).padStart(2,'0');
    }
  }
  const s = String(v).trim();
  // ISO AAAA-MM-DD (sem ambiguidade)
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const [, y, mo, d] = m;
    if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31) return null;
    return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }
  // Slash/hyphen: X/Y/Z — heurística para resolver BR vs US
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    let [, a, b, y] = m;
    a = +a; b = +b;
    if (y.length === 2) y = (+y > 50 ? '19' : '20') + y;
    let dia, mes;
    // Se A > 12: A só pode ser dia (BR). Ex: "20/05/26" → dia=20, mes=05
    // Se B > 12: B só pode ser dia (US M/D/Y). Ex: "5/20/26" → mes=5, dia=20
    // Ambíguo (A<=12 E B<=12): assume BR (DD/MM)
    if (a > 12 && b <= 12) { dia = a; mes = b; }
    else if (b > 12 && a <= 12) { mes = a; dia = b; }
    else if (a <= 12 && b <= 12) { dia = a; mes = b; } // assume BR
    else return null; // ambos > 12 → inválido
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
    return `${y}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
  }
  return null;
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
      el('h1', { class: 'text-2xl font-extrabold' }, '🚪 Minhas Visitas'),
      el('p', { class: 'text-sm text-fg-muted' }, 'Suas visitas registradas — para visão consolidada da equipe, abra o Dashboard'),
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

    // No app: cada usuário vê APENAS as próprias visitas (controle pessoal).
    // No dashboard, a visão é consolidada (todas as visitas com filtro por
    // registrador). RLS já permitiria ver todas; o filtro aqui é client-side
    // para SEPARAR contexto pessoal vs analítico.
    let q = supabase.from('atividades')
      .select(`id, numero_sequencial, created_at, data_visita, gerente_id, cliente, corretor, local_treinamento,
               imobiliaria, empreendimento, visita_periodo, visita_forma_atendimento,
               visita_canal, visita_gerente_house_id, observacoes,
               solicita_exclusao, exclusao_solicitada_em,
               profiles!atividades_gerente_id_fkey(nome)`)
      .eq('tipo', 'visita')
      .eq('cancelada', false)
      .eq('gerente_id', state.user.id)
      .order('data_visita', { ascending: false, nullsFirst: false })
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
    visitas.forEach(v => listEl.appendChild(visitaRow(v, reload)));
  }

  await reload();
}

function visitaRow(v, onAfterAction) {
  // data DA visita (preenchida) — sem hora; e "registrado em" (created_at automático)
  const dataVisita = v.data_visita
    ? new Date(v.data_visita + 'T00:00:00').toLocaleDateString('pt-BR', { day:'2-digit', month:'short', year:'numeric' })
    : null;
  const registradoEm = new Date(v.created_at).toLocaleString('pt-BR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
  const gerente = state.gerentesHouse?.find(g => g.id === v.visita_gerente_house_id)?.nome;
  const numTag = v.numero_sequencial ? `#${v.numero_sequencial} ` : '';
  const isOwn = v.gerente_id === state.user?.id;
  const pendingDelete = !!v.solicita_exclusao;

  // Botão de exclusão (só pra dono, e desde que não tenha solicitação ativa)
  const deleteBtn = (isOwn && !pendingDelete) ? el('button', {
    class: 'btn btn-ghost btn-sm text-danger flex-shrink-0',
    title: 'Solicitar exclusão',
    onclick: async (e) => {
      e.stopPropagation();
      const ok = await confirmModal({
        title: 'Solicitar exclusão?',
        message: 'A visita só será removida após aprovação do Master. Você pode cancelar a solicitação a qualquer momento.',
        confirmLabel: 'Solicitar exclusão',
        danger: true,
      });
      if (!ok) return;
      const { error } = await supabase.from('atividades').update({
        solicita_exclusao: true,
        exclusao_solicitada_em: new Date().toISOString(),
        exclusao_solicitada_por: state.user.id,
      }).eq('id', v.id);
      if (error) { toast(error.message, 'error'); return; }
      toast('Solicitação enviada. Aguardando aprovação do Master.', 'success');
      onAfterAction?.();
    },
  }, icon('trash', 16)) : null;

  // Botão de CANCELAR solicitação (se já tem solicitação pendente)
  const cancelDeleteBtn = (isOwn && pendingDelete) ? el('button', {
    class: 'btn btn-secondary btn-sm flex-shrink-0',
    title: 'Cancelar solicitação',
    onclick: async (e) => {
      e.stopPropagation();
      const { error } = await supabase.from('atividades').update({
        solicita_exclusao: false,
        exclusao_solicitada_em: null,
        exclusao_solicitada_por: null,
      }).eq('id', v.id);
      if (error) { toast(error.message, 'error'); return; }
      toast('Solicitação cancelada.', 'info');
      onAfterAction?.();
    },
  }, 'Cancelar solicitação') : null;

  return el('div', {
      class: 'card p-3 cursor-pointer hover:bg-bg-elev transition',
      style: pendingDelete ? { borderLeft: '3px solid var(--warning, #F59E0B)' } : {},
      onclick: (e) => {
        // Não navega se clicou no botão de exclusão
        if (e.target.closest('button')) return;
        navigate('/visita/' + v.id);
      },
    },
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
          pendingDelete && el('span', { class: 'chip chip-yellow' }, '⏳ Exclusão solicitada'),
        ),
        el('div', { class: 'text-xs text-fg-muted mt-1' },
          [v.local_treinamento, v.empreendimento].filter(Boolean).join(' · ') || '—'),
        el('div', { class: 'text-xs text-fg-subtle mt-0.5' },
          [v.visita_canal === 'House' ? `🏠 ${gerente || '—'} ${v.corretor ? '· ' + v.corretor : ''}` :
           v.visita_canal === 'Imob' ? `🏢 ${v.imobiliaria || '—'}` : '',
           dataVisita ? `📅 Data da visita: ${dataVisita}` : null,
           v.profiles?.nome && `por ${v.profiles.nome}`,
           `registrado em ${registradoEm}`,
          ].filter(Boolean).join(' · ')),
      ),
      deleteBtn,
      cancelDeleteBtn,
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

  // Data da Visita (sem hora; default = hoje; pode ser retroativa)
  const hoje = new Date().toISOString().slice(0, 10);
  const dataVisitaInp = el('input', {
    class: 'input', type: 'date', name: 'data_visita', required: true,
    value: hoje, max: hoje, // não permite futuro
  });

  // Campo Nome
  const nomeInp = el('input', { class: 'input', type: 'text', name: 'nome', required: true,
    placeholder: 'Nome e Sobrenome (Cliente)', autocomplete: 'off' });

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
    field('Data da Visita', dataVisitaInp, { required: true, help: 'Pode ser retroativa. Não permite data futura.' }),
    field('Nome e Sobrenome (Cliente)', nomeInp, { required: true }),
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
      const imobValue = (readSel(imobSel) || '').toUpperCase();

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
        data_visita: dataVisitaInp.value || hoje,
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

// ─── XLSX TEMPLATE com data validation REAL (ExcelJS) ───────────────────
async function downloadTemplate() {
  try {
    const ExcelJS = await loadExcelJS();

    const locais   = state.locaisVisita.map(x => x.nome);
    const emps     = state.empreendimentos.map(x => x.nome);
    const gerentes = state.gerentesHouse.map(x => x.nome);
    const imobs    = state.imobiliarias.map(x => x.nome);
    const N = 5001; // linhas com validação (2..5001)

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Imob Rottas';
    wb.created = new Date();

    // ════════════════════════════════════════════════════════════
    // ORDEM DAS ABAS (ExcelJS preserva ordem de criação):
    //   1ª  "Dados"     (visível, ATIVA ao abrir)
    //   2ª  "Listas"    (OCULTA — fonte das validações)
    //   3ª  "Instruções" (visível)
    // ════════════════════════════════════════════════════════════

    // ════════════════════════════════════════════════════════════
    // Aba "Dados" — cabeçalhos + DATA VALIDATIONS (criada PRIMEIRO)
    // ════════════════════════════════════════════════════════════
    const wsDados = wb.addWorksheet('Dados');
    wsDados.columns = [
      { header: 'DATA DA VISITA',        key: 'data',     width: 18 },
      { header: 'NOME DO CLIENTE',       key: 'nome',     width: 28 },
      { header: 'LOCAL DA VISITA',       key: 'local',    width: 22 },
      { header: 'EMPREENDIMENTO',        key: 'emp',      width: 24 },
      { header: 'PERÍODO DA VISITA',     key: 'periodo',  width: 18 },
      { header: 'FORMA DE ATENDIMENTO',  key: 'forma',    width: 22 },
      { header: 'CANAL PARCEIRO',        key: 'canal',    width: 18 },
      { header: 'GERENTE HOUSE',         key: 'gerente',  width: 24 },
      { header: 'CORRETOR',              key: 'corretor', width: 22 },
      { header: 'IMOBILIÁRIA',           key: 'imob',     width: 28 },
      { header: 'OBSERVAÇÕES',           key: 'obs',      width: 42 },
    ];
    // Cabeçalho com estilo
    wsDados.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    wsDados.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF26B22' } };
    wsDados.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };
    wsDados.getRow(1).height = 22;
    wsDados.autoFilter = { from: 'A1', to: 'K1' };
    wsDados.views = [{ state: 'frozen', ySplit: 1 }];

    // ── PROMPTS (input message ao clicar na célula) e VALIDATIONS ──
    // Usa exatamente os títulos e textos que você ajustou no arquivo de referência.

    // A — DATA DA VISITA (date validation: aceita só datas, não permite futuras)
    wsDados.dataValidations.add('A2:A' + N, {
      type: 'date', operator: 'lessThanOrEqual',
      formulae: [new Date()], allowBlank: false,
      showInputMessage: true,
      promptTitle: 'DATA DA VISITA',
      prompt: 'OBRIGATÓRIO: Data em que a visita REALMENTE aconteceu (pode ser retroativa). Formato: DD/MM/AAAA. Não pode ser data futura.',
      showErrorMessage: true, errorStyle: 'stop',
      errorTitle: 'Data inválida',
      error: 'Use o formato DD/MM/AAAA. Não pode ser data futura.',
    });
    // Formatação visual da coluna como data
    wsDados.getColumn('A').numFmt = 'dd/mm/yyyy';

    // B — NOME DO CLIENTE
    addPromptRange(wsDados, 'B2:B' + N, 'NOME DO CLIENTE', 'OBRIGATÓRIO: Nome completo do visitante (Nome + Sobrenome).');

    // C — LOCAL DA VISITA  (lista suspensa ABERTA — aceita valor novo)
    addListRangeOpen(wsDados, 'C2:C' + N, `Listas!$A$2:$A$${Math.max(locais.length + 1, 2)}`,
      'LOCAL DA VISITA', 'OBRIGATÓRIO: Use a lista suspensa se possível, mas é permitido digitar um Local novo (será criado ao importar).');

    // D — EMPREENDIMENTO  (lista suspensa)
    addListRange(wsDados, 'D2:D' + N, `Listas!$B$2:$B$${emps.length + 1}`,
      'EMPREENDIMENTO', 'OBRIGATÓRIO: Selecione um Empreendimento cadastrado. Use a lista suspensa.');

    // E — PERÍODO DA VISITA  (lista inline)
    addListInline(wsDados, 'E2:E' + N, VISITA_PERIODOS,
      'PERÍODO DA VISITA', 'OBRIGATÓRIO: Manhã, Tarde ou Noite. Use a lista suspensa.');

    // F — FORMA DE ATENDIMENTO  (lista inline)
    addListInline(wsDados, 'F2:F' + N, VISITA_FORMAS,
      'FORMA DE ATENDIMENTO', 'OBRIGATÓRIO: Espontânea (sem agendamento prévio). Agendado (exige Canal preenchido).');

    // G — CANAL PARCEIRO  (lista inline)
    addListInline(wsDados, 'G2:G' + N, VISITA_CANAIS,
      'CANAL PARCEIRO', 'OBRIGATÓRIO se FORMA DE ATENDIMENTO = Agendado: House (atendimento próprio). Imob (via imobiliária parceira).');

    // H — GERENTE HOUSE  (lista suspensa)
    addListRange(wsDados, 'H2:H' + N, `Listas!$C$2:$C$${Math.max(gerentes.length + 1, 2)}`,
      'GERENTE HOUSE', 'OBRIGATÓRIO se CANAL PARCEIRO = House: Selecione o Gerente House responsável.');

    // I — CORRETOR
    addPromptRange(wsDados, 'I2:I' + N, 'CORRETOR', 'OBRIGATÓRIO se CANAL PARCEIRO = House: Nome do corretor que conduziu a visita.');

    // J — IMOBILIÁRIA  (lista suspensa ABERTA — aceita imob nova; backend normaliza pra UPPER)
    addListRangeOpen(wsDados, 'J2:J' + N, `Listas!$D$2:$D$${Math.max(imobs.length + 1, 2)}`,
      'IMOBILIÁRIA', 'OBRIGATÓRIO se CANAL PARCEIRO = Imob: Use a lista suspensa se possível. Imobiliárias novas serão criadas em LETRA MAIÚSCULA.');

    // K — OBSERVAÇÕES (textLength ≤ 2000)
    addLengthValidation(wsDados, 'K2:K' + N, 2000,
      'OBSERVAÇÕES', 'Opcional: Notas adicionais sobre a visita (máx 2000 caracteres).');

    // ════════════════════════════════════════════════════════════
    // Aba "Listas" — OCULTA, fonte das validações range
    // ════════════════════════════════════════════════════════════
    const wsListas = wb.addWorksheet('Listas', { state: 'veryHidden' });
    wsListas.columns = [
      { header: 'Locais de Visita',  key: 'locais',   width: 28 },
      { header: 'Empreendimentos',    key: 'emps',     width: 30 },
      { header: 'Gerentes House',     key: 'gerentes', width: 26 },
      { header: 'Imobiliárias',       key: 'imobs',    width: 32 },
    ];
    const maxLen = Math.max(locais.length, emps.length, gerentes.length, imobs.length, 1);
    for (let i = 0; i < maxLen; i++) {
      wsListas.addRow({
        locais: locais[i] || null,
        emps: emps[i] || null,
        gerentes: gerentes[i] || null,
        imobs: imobs[i] || null,
      });
    }
    wsListas.getRow(1).font = { bold: true };

    // ════════════════════════════════════════════════════════════
    // Aba "Instruções"
    // ════════════════════════════════════════════════════════════
    const wsInstr = wb.addWorksheet('Instruções');
    wsInstr.columns = [{ width: 92 }];
    [
      ['INSTRUÇÕES DE IMPORTAÇÃO DE VISITAS', true],
      [''],
      ['Esta planilha permite registrar várias Visitas de uma só vez.'],
      ['Preencha a aba "Dados" e faça o upload no app pelo botão "Importar XLSX".'],
      [''],
      ['REGRAS:', true],
      ['1. A coluna A (Data de Importação) é informativa — pode preencher ou deixar vazio.'],
      ['2. Localização é capturada do seu dispositivo no momento do upload (não preencha).'],
      ['3. Use APENAS valores das listas suspensas (▼) — qualquer escrita diferente é rejeitada.'],
      ['4. Linhas com erro REJEITAM o arquivo INTEIRO (nada é salvo até estar 100% válido).'],
      ['5. Limite: 5.000 linhas por importação.'],
      [''],
      ['CAMPOS OBRIGATÓRIOS sempre:', true],
      ['  • Nome do Cliente'],
      ['  • Local da Visita (lista suspensa)'],
      ['  • Empreendimento (lista suspensa)'],
      ['  • Período da Visita (Manhã/Tarde/Noite)'],
      ['  • Forma de Atendimento (Espontânea/Agendado)'],
      [''],
      ['REGRAS CONDICIONAIS:', true],
      ['  • Forma = Espontânea → Canal/Gerente House/Corretor/Imobiliária VAZIOS'],
      ['  • Forma = Agendado   → Canal é OBRIGATÓRIO: Conforme o canal:'],
      ['        Canal = House → Gerente House (lista) E Corretor (texto) OBRIGATÓRIOS'],
      ['        Canal = Imob  → Imobiliária (lista) OBRIGATÓRIA'],
      [''],
      ['DICA:', true],
      ['  Ao clicar em qualquer célula, aparece um balão explicando o campo.'],
      ['  Células com setinha (▼) têm lista suspensa — escolha sempre um valor cadastrado.'],
    ].forEach(([text, bold]) => {
      const row = wsInstr.addRow([text]);
      if (bold) row.font = { bold: true, color: { argb: 'FFF26B22' } };
    });

    // Define a aba ATIVA ao abrir = Dados (índice 0)
    wb.views = [{ activeTab: 0, firstSheet: 0, x: 0, y: 0, width: 16000, height: 12000, visibility: 'visible' }];

    // ════════════════════════════════════════════════════════════
    // SALVA
    // ════════════════════════════════════════════════════════════
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `modelo_visitas_${new Date().toISOString().slice(0,10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
    toast('Modelo baixado com listas suspensas reais ✓', 'success');
  } catch (e) {
    console.error('[downloadTemplate]', e);
    toast('Erro ao gerar modelo: ' + e.message, 'error');
  }
}

// Helpers ExcelJS para data validation
function addPromptRange(ws, range, promptTitle, prompt) {
  ws.dataValidations.add(range, {
    type: 'any', allowBlank: true,
    showInputMessage: true, promptTitle, prompt,
  });
}
function addListRange(ws, range, formula, promptTitle, prompt) {
  ws.dataValidations.add(range, {
    type: 'list', allowBlank: true,
    formulae: [formula],
    showInputMessage: true, promptTitle, prompt,
    showErrorMessage: true,
    errorStyle: 'stop', // BLOQUEIA — sem "Continuar mesmo assim"
    errorTitle: 'Valor não cadastrado',
    error: 'Use APENAS um valor da lista suspensa (▼). Não é permitido digitar valores diferentes.',
  });
}
// LISTA ABERTA: mostra dropdown ▼ MAS aceita valores livres (sem bloqueio).
// Usada quando o conjunto pode crescer (ex: Local da Visita pode ser novo).
// Implementação: errorStyle 'information' — mostra um "OK/Cancelar" amigável
// quando o valor está fora da lista, mas PERMITE o usuário continuar com OK.
// (type=list + showErrorMessage=false sozinho NÃO funciona — Excel mantém o
//  bloqueio default. errorStyle=information é a única forma confiável.)
function addListRangeOpen(ws, range, formula, promptTitle, prompt) {
  ws.dataValidations.add(range, {
    type: 'list', allowBlank: true,
    formulae: [formula],
    showInputMessage: true, promptTitle, prompt,
    showErrorMessage: true,
    errorStyle: 'information',
    errorTitle: 'Local novo será criado',
    error: 'Este Local não está na lista. Será criado automaticamente ao importar. Clique OK pra continuar.',
  });
}
function addListInline(ws, range, values, promptTitle, prompt) {
  // ExcelJS: lista inline = formula com aspas duplas em volta dos valores
  const formula = `"${values.join(',')}"`;
  ws.dataValidations.add(range, {
    type: 'list', allowBlank: true,
    formulae: [formula],
    showInputMessage: true, promptTitle, prompt,
    showErrorMessage: true, errorStyle: 'stop',
    errorTitle: 'Valor inválido',
    error: 'Use APENAS um dos valores da lista suspensa.',
  });
}
function addLengthValidation(ws, range, maxLen, promptTitle, prompt) {
  ws.dataValidations.add(range, {
    type: 'textLength', operator: 'lessThanOrEqual',
    formulae: [maxLen], allowBlank: true,
    showInputMessage: true, promptTitle, prompt,
    showErrorMessage: true, errorStyle: 'stop',
    errorTitle: 'Texto muito longo',
    error: `O número máximo de caracteres é ${maxLen}.`,
  });
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
      // cellDates: true → Excel date cells viram Date objects (parseDateBR cuida disso)
      const wb = XLSX.read(buf, { type: 'array', cellDates: true });
      const ws = wb.Sheets['Dados'] || wb.Sheets[wb.SheetNames[0]];
      if (!ws) throw new Error('Aba "Dados" não encontrada');
      // raw: true → preserva Date objects e números (em vez de virar string formatada)
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });
      if (!rows.length) throw new Error('Planilha vazia');
      if (rows.length > MAX_IMPORT_ROWS) throw new Error(`Máximo de ${MAX_IMPORT_ROWS} linhas por importação`);

      const errors = [];
      const normalized = [];
      // Helper: lookup case-insensitive em qualquer das chaves possíveis
      const pickRaw = (r, keys) => {
        const lowerRow = {};
        Object.keys(r).forEach(k => { lowerRow[k.toLowerCase().trim()] = r[k]; });
        for (const k of keys) {
          const v = lowerRow[k.toLowerCase().trim()];
          if (v != null && String(v).trim() !== '') return v;
        }
        return null;
      };

      rows.forEach((r, idx) => {
        const linha = idx + 2;
        // Aceita TODOS os nomes históricos de cabeçalho — atual + antigos
        const dataRaw = pickRaw(r, ['DATA DA VISITA', 'Data da Visita', 'DATA DE IMPORTAÇÃO', 'Data de Importação']);
        const dataVisita = parseDateBR(dataRaw); // string YYYY-MM-DD ou null
        const nome    = sanitizeText(pickRaw(r, ['NOME DO CLIENTE', 'Nome do Cliente', 'Nome e Sobrenome', 'Nome Sobrenome']));
        const local   = sanitizeText(pickRaw(r, ['LOCAL DA VISITA', 'Local da Visita']));
        const emp     = sanitizeText(pickRaw(r, ['EMPREENDIMENTO', 'Empreendimento']));
        const periodo = sanitizeText(pickRaw(r, ['PERÍODO DA VISITA', 'Período da Visita', 'Período', 'Período (Manhã/Tarde/Noite)']));
        const forma   = sanitizeText(pickRaw(r, ['FORMA DE ATENDIMENTO', 'Forma de Atendimento', 'Forma (Espontânea/Agendado)']));
        const canal   = sanitizeText(pickRaw(r, ['CANAL PARCEIRO', 'Canal Parceiro', 'Canal', 'Canal (House/Imob — só se Agendado)']));
        const ghouse  = sanitizeText(pickRaw(r, ['GERENTE HOUSE', 'Gerente House', 'Gerente House (se Canal=House)']));
        const corretor = sanitizeText(pickRaw(r, ['CORRETOR', 'Corretor', 'Corretor (se Canal=House)']));
        let imob    = sanitizeText(pickRaw(r, ['IMOBILIÁRIA', 'Imobiliária', 'Imobiliária (se Canal=Imob)']));
        if (imob) imob = imob.toUpperCase(); // sempre UPPERCASE
        const obs     = sanitizeText(pickRaw(r, ['OBSERVAÇÕES', 'Observações']), 2000);

        if (!dataVisita) errors.push({ linha, coluna: 'Data da Visita', motivo: dataRaw ? `valor inválido: "${dataRaw}" — use DD/MM/AAAA` : 'obrigatório' });
        else if (dataVisita > new Date().toISOString().slice(0,10)) errors.push({ linha, coluna: 'Data da Visita', motivo: 'não pode ser futura' });
        if (!nome)    errors.push({ linha, coluna: 'Nome e Sobrenome', motivo: 'obrigatório' });
        if (!local)   errors.push({ linha, coluna: 'Local da Visita', motivo: 'obrigatório' });
        if (!emp)     errors.push({ linha, coluna: 'Empreendimento', motivo: 'obrigatório' });
        if (!periodo) errors.push({ linha, coluna: 'Período', motivo: 'obrigatório' });
        if (!forma)   errors.push({ linha, coluna: 'Forma de Atendimento', motivo: 'obrigatório' });

        if (periodo && !VISITA_PERIODOS.includes(periodo)) errors.push({ linha, coluna: 'Período', motivo: `valor inválido (use ${VISITA_PERIODOS.join('|')})` });
        if (forma && !VISITA_FORMAS.includes(forma))       errors.push({ linha, coluna: 'Forma', motivo: `valor inválido (use ${VISITA_FORMAS.join('|')})` });

        // Local da Visita: NÃO valida contra a lista — aceita valor novo (será criado em batch antes da inserção)
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
            // NÃO valida contra lista — imobs novas são criadas automaticamente em UPPERCASE
          }
        }

        const ghObj = ghouse ? state.gerentesHouse.find(x => x.nome === ghouse) : null;
        normalized.push({
          tipo: 'visita',
          gerente_id: state.user.id,
          cancelada: false,
          data_visita: dataVisita,
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
      // 1a. Cria Locais de Visita NOVOS (que não estão na lista) em batch
      const localsCadastrados = new Set(state.locaisVisita.map(x => x.nome));
      const novosLocais = [...new Set(parsedRows.map(r => r.local_treinamento).filter(Boolean))]
        .filter(nome => !localsCadastrados.has(nome));
      if (novosLocais.length) {
        const { error: errLoc } = await supabase.from('locais_visita').insert(
          novosLocais.map(nome => ({ nome }))
        );
        if (errLoc) throw new Error('Falha ao criar Locais novos: ' + errLoc.message);
        novosLocais.forEach(nome => state.locaisVisita.push({ nome }));
      }
      // 1b. Cria Imobiliárias NOVAS em batch (sempre UPPERCASE; já normalizadas no parse)
      const imobsCadastradas = new Set(state.imobiliarias.map(x => x.nome));
      const novasImobs = [...new Set(parsedRows.map(r => r.imobiliaria).filter(Boolean))]
        .filter(nome => !imobsCadastradas.has(nome));
      if (novasImobs.length) {
        const { error: errImob } = await supabase.from('imobiliarias').insert(
          novasImobs.map(nome => ({ nome }))
        );
        if (errImob) throw new Error('Falha ao criar Imobiliárias novas: ' + errImob.message);
        novasImobs.forEach(nome => state.imobiliarias.push({ nome }));
      }

      // 2. Insere visitas
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
