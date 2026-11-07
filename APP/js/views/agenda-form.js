// Formulário de criar/editar agendamento - só Check-in, Atendimento e Outro
import { el, icon, toast, loadingBtn, modal, painelSalvando, escolherAlcanceSerie } from '../ui.js';
import { shell, telaErroCarga } from './shell.js';
import { state, supabase, q, pessoasComAgenda, getScopedImobiliarias, avisarConexaoLenta, avisarConexaoTravada } from '../supabase.js';
import { field, creatableSelect, addImobiliaria, addLocalVisita, addMotivoVisita, addOutroTipo } from '../components/form-fields.js';
import { audioField } from '../components/audio-field.js';
import { navigate } from '../router.js';
import { sincronizarOutlook } from '../calendar-sync.js';
import { logRegistro, cronometro, novoRegistroId, vincularAlvo } from '../diag.js';

// Apenas tipos que fazem sentido planejar com antecedência
const TIPOS = [
  { id: 'checkin',     label: 'Check-in',     ic: 'mapPin',   bg: 'rgba(59,130,246,0.10)',  fg: '#3B82F6' },
  { id: 'atendimento', label: 'Atendimento',  ic: 'users',    bg: 'rgba(139,92,246,0.10)',  fg: '#8B5CF6' },
  { id: 'outro',       label: 'Outro',        ic: 'calendar', bg: 'rgba(160,164,178,0.15)', fg: '#717784' },
];

const PREFILL_DATE_KEY = 'agenda-prefill-date';

// Salva agendamento(s) de forma RESILIENTE: upsert idempotente (ids do cliente) +
// repetição com tempo-limite por tentativa. Se a rede travar (iOS suspende a
// conexão), tenta de novo sem duplicar. Retorna { ok, error }.
async function salvarAgendamentosResiliente(rows, tentativas = 3, onProgresso = null) {
  const ids = rows.map(r => r.id).filter(Boolean);
  // Liga todas as etapas deste agendamento numa história só (ver Logs no Perfil)
  const regId = novoRegistroId();
  vincularAlvo(regId, 'agendamentos', ids);   // permite conferir depois se subiu
  const tTotal = cronometro();
  logRegistro({ tipo: 'agendamento', registroId: regId, etapa: 'inicio' });
  let lastErr = null;
  for (let i = 0; i < tentativas; i++) {
    const tGrav = cronometro();
    try {
      const res = await Promise.race([
        supabase.from('agendamentos').upsert(rows, { onConflict: 'id', ignoreDuplicates: true }).select('id'),
        new Promise((_, rej) => setTimeout(() => rej(new Error('Tempo esgotado')), 6000)),
      ]);
      if (!res.error) {
        // CONFIRMAÇÃO read-after-write: só declara sucesso se as linhas realmente
        // existirem no banco. Evita o "deu tudo certo mas não apareceu na agenda":
        // se a resposta do upsert vier ok mas a linha não persistir/for filtrada,
        // reenvia; se depois de confirmar não achar nada, reporta erro honesto.
        const okLog = (extra) => { logRegistro({ tipo: 'agendamento', registroId: regId, etapa: 'sucesso', ok: true, duracao_ms: tTotal(), tentativa: i + 1, erro: extra || null }); return { ok: true }; };
        if (!ids.length) return okLog();
        try {
          const chk = await Promise.race([
            supabase.from('agendamentos').select('id').in('id', ids),
            new Promise((_, rej) => setTimeout(() => rej(new Error('to')), 4000)),
          ]);
          if (chk.error) return okLog('confirmacao indisponivel'); // não deu pra checar: aceita
          const achou = (chk.data || []).length;
          if (achou >= ids.length) return okLog();
          if (achou > 0) return okLog(`parcial ${achou}/${ids.length}`); // gravou parte — não trava
          lastErr = new Error('O agendamento não foi confirmado no servidor'); // 0 confirmadas: reenvia
          logRegistro({ tipo: 'agendamento', registroId: regId, etapa: 'confirmacao', ok: false, duracao_ms: tGrav(), erro: lastErr, tentativa: i + 1 });
        } catch (e) { return okLog('sem rede para confirmar'); }
      } else {
        lastErr = res.error;
        logRegistro({ tipo: 'agendamento', registroId: regId, etapa: 'gravacao', ok: false, duracao_ms: tGrav(), erro: res.error, tentativa: i + 1 });
      }
    } catch (e) {
      lastErr = e;
      logRegistro({ tipo: 'agendamento', registroId: regId, etapa: 'gravacao', ok: false, duracao_ms: tGrav(), erro: e, tentativa: i + 1 });
    }
    if (i < tentativas - 1) {
      // Avisa o usuario NA HORA (nao deixa o botao girando muda) e espera pouco.
      try { avisarConexaoLenta(); } catch (e) {}
      if (onProgresso) { try { onProgresso({ tentativa: i + 2, total: tentativas, motivo: String((lastErr && lastErr.message) || lastErr || '') }); } catch (e) {} }
      await new Promise(r => setTimeout(r, 700 * (i + 1)));
    }
  }
  try { avisarConexaoTravada(); } catch (e) {}
  logRegistro({ tipo: 'agendamento', registroId: regId, etapa: 'falha', ok: false, duracao_ms: tTotal(), erro: lastErr });
  return { ok: false, error: lastErr };
}

export async function agendaFormView(params, app) {
  const id = params.id;
  let initial = null;
  if (id) {
    const { data, error } = await q(() => supabase.from('agendamentos').select('*').eq('id', id).maybeSingle(),
      { ms: 6000, label: 'abrir agendamento', tentativas: 3 });
    if (error) { telaErroCarga(app, 'Não foi possível abrir o agendamento.', error, () => agendaFormView(params, app)); return; }
    if (!data) { toast('Agendamento não encontrado', 'error'); navigate('/', true); return; }
    initial = data;
  }

  // Quem pode ser o "responsável" pela agenda:
  //  - gerente: ele mesmo + seus supervisores
  //  - superintendente/gestor_regional/gestor/master: os gerentes no seu escopo
  const meuId = state.user.id;
  const myRole = state.profile?.role;
  let responsaveis = []; // [{ id, nome }]
  if (myRole === 'gerente' || myRole === 'supervisor') {
    // Gerente e supervisor podem marcar a si e a gerentes/supervisores da MESMA
    // cidade (agenda compartilhada), além do gerente superior do supervisor.
    const { data: pessoas } = await q(() => supabase.rpc('pessoas_agenda_mesma_praca'), { ms: 6000, label: 'pessoas da agenda', tentativas: 2 });
    (pessoas || []).forEach(p => {
      const isSelf = p.id === meuId;
      const rl = p.role === 'gerente' ? 'Gerente' : p.role === 'gerente_produto' ? 'Gerente de Produto' : 'Supervisor';
      responsaveis.push({ id: p.id, nome: isSelf ? ((p.nome || 'Você') + ' (você)') : `${p.nome} (${rl})` });
    });
    if (!responsaveis.some(r => r.id === meuId)) {
      responsaveis.unshift({ id: meuId, nome: (state.profile?.nome || 'Você') + ' (você)' });
    }
    // Eu sempre no topo
    responsaveis.sort((a, b) => (a.id === meuId ? -1 : b.id === meuId ? 1 : 0));
  } else if (['superintendente', 'gestor', 'gestor_regional', 'master'].includes(myRole)) {
    // Gerentes, supervisores e Gerentes de Produto do escopo
    const list = (await pessoasComAgenda()) || [];
    list.forEach(g => responsaveis.push({ id: g.id, nome: g.role === 'gerente' ? g.nome + ' (Gerente)' : g.rotulo }));
  }
  // Default responsável: gerente → ele mesmo; admin → forçar escolha. Editando mantém o atual.
  let responsavelId = initial?.gerente_id || (['gerente','supervisor'].includes(myRole) ? meuId : '');

  // Tipo padrão (legado: proposta/orulo viram 'outro')
  const initialTipo = initial?.tipo && TIPOS.find(t => t.id === initial.tipo) ? initial.tipo : 'checkin';
  let chosenTipo = initialTipo;

  // Pílulas de tipo
  const tipoButtons = TIPOS.map(t => {
    const b = el('button', {
      type: 'button',
      'data-tipo': t.id,
      class: 'flex-1 border-2 rounded-xl py-2.5 px-3 flex items-center justify-center gap-1.5 text-sm font-bold transition',
    });
    b.appendChild(icon(t.ic, 16));
    b.appendChild(el('span', {}, t.label));
    return b;
  });
  function paintTipo() {
    tipoButtons.forEach(b => {
      const t = TIPOS.find(x => x.id === b.dataset.tipo);
      const active = b.dataset.tipo === chosenTipo;
      b.style.background = active ? t.bg : '';
      b.style.color = active ? t.fg : '';
      b.style.borderColor = active ? t.fg : '';
      if (!active) b.classList.add('border-border', 'text-fg-muted');
      else b.classList.remove('border-border', 'text-fg-muted');
    });
    updateContextualFields();
  }
  tipoButtons.forEach(b => b.addEventListener('click', () => { chosenTipo = b.dataset.tipo; paintTipo(); }));

  // Data e hora - usa prefill se disponível, senão amanhã 9h
  const defaultDate = (() => {
    if (initial?.data_prevista) {
      const d = new Date(initial.data_prevista);
      return toDateTimeLocal(d);
    }
    // Lê data sugerida do localStorage (vem ao clicar "+" em um dia específico)
    const prefillIso = localStorage.getItem(PREFILL_DATE_KEY);
    if (prefillIso) {
      localStorage.removeItem(PREFILL_DATE_KEY);
      const d = new Date(prefillIso);
      // Se já passou da hora, agenda para 9h do dia
      if (d.getHours() === 0) d.setHours(9, 0, 0, 0);
      return toDateTimeLocal(d);
    }
    const t = new Date(); t.setDate(t.getDate() + 1); t.setHours(9, 0, 0, 0);
    return toDateTimeLocal(t);
  })();

  function toDateTimeLocal(d) {
    const pad = n => String(n).padStart(2,'0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  const dataInput = el('input', { class: 'input flex-1 min-w-0', type: 'datetime-local', name: 'data_prevista', required: true, value: defaultDate });
  // Término (opcional): só a HORA — o dia é o mesmo do início.
  const pad2 = n => String(n).padStart(2, '0');
  const fimInicial = initial?.data_fim ? (() => { const d = new Date(initial.data_fim); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); })() : '';
  const fimInput = el('input', { class: 'input w-[7.5rem] flex-shrink-0', type: 'time', name: 'hora_fim', value: fimInicial, title: 'Horário de término' });
  const dataHoraRow = el('div', { class: 'flex items-center gap-2' },
    dataInput, el('span', { class: 'text-xs text-fg-muted flex-shrink-0' }, 'até'), fimInput);
  const tituloInput = el('input', { class: 'input', name: 'titulo', placeholder: 'Ex: Treinamento de tarde', value: initial?.titulo || '' });
  const obsInput = el('textarea', { class: 'textarea', name: 'observacoes', placeholder: 'Observações livres...' }, initial?.observacoes || '');

  // Campos contextuais por tipo, em um único container (ordem correta).
  // Título/descrição só existe em "Outro". Observações + Ditar em todos.
  const ctx = el('div', { class: 'flex flex-col gap-4' });
  const audioEl = audioField({ targetTextarea: obsInput });

  function updateContextualFields() {
    ctx.innerHTML = '';
    if (chosenTipo === 'checkin') {
      // CHECK-IN: Imobiliária → Motivo da visita
      ctx.append(
        field('Imobiliária', creatableSelect({
          name: 'imobiliaria', items: getScopedImobiliarias(), value: initial?.imobiliaria,
          allowAdd: true, onAdd: addImobiliaria,
        })),
        field('Motivo da visita', creatableSelect({
          name: 'motivo_visita', items: state.motivosVisita, value: initial?.motivo_visita,
          allowAdd: true, onAdd: addMotivoVisita,
        })),
      );
    } else if (chosenTipo === 'atendimento') {
      // ATENDIMENTO: Local da visita → Imobiliária → Corretor → Cliente
      ctx.append(
        field('Local da visita', creatableSelect({
          name: 'local_visita_disp', items: state.locaisVisita, value: initial?.local_visita,
          allowAdd: true, onAdd: addLocalVisita,
        }), { help: 'Onde o atendimento vai acontecer' }),
        field('Imobiliária', creatableSelect({
          name: 'imobiliaria', items: getScopedImobiliarias(), value: initial?.imobiliaria,
          allowAdd: true, onAdd: addImobiliaria,
        }), { help: 'Imobiliária vinculada ao atendimento' }),
        field('Corretor', el('input', { class: 'input', name: 'corretor', placeholder: 'Nome do corretor', value: initial?.corretor || '' })),
        field('Cliente', el('input', { class: 'input', name: 'cliente', placeholder: 'Nome do cliente', value: initial?.cliente || '' })),
      );
    } else {
      // OUTRO: tipo padronizado por lista (gerente pode cadastrar novos)
      ctx.append(field('Tipo (Outro)', creatableSelect({
        name: 'titulo', items: state.outrosTipos, value: initial?.titulo,
        allowAdd: true, onAdd: addOutroTipo,
      }), { help: 'Ex.: Treinamento, Evento, Reunião. Pode cadastrar um novo.' }));
    }
    // Observações + Ditar em todos os tipos
    ctx.append(field('Observações', obsInput), audioEl);
  }

  const submitBtn = el('button', { class: 'btn btn-primary btn-lg w-full mt-2', type: 'submit' },
    id ? 'Salvar alterações' : 'Agendar');
  const cancelBtn = el('button', { class: 'btn btn-ghost w-full', type: 'button',
    onclick: () => history.back() }, 'Cancelar');

  // === Seletor de Responsável (só aparece se o gerente tem supervisores) ===
  // Permite o gerente escolher se ele mesmo vai cumprir ou um supervisor dele.
  // O gerente_id do agendamento aponta pra essa pessoa, então quem é "dono"
  // executa o check-in/atividade depois.
  let responsavelField = null;
  const isAdminRole = ['superintendente', 'gestor', 'gestor_regional', 'master'].includes(myRole);
  // Multi-seleção de presentes. Ao EDITAR, mantém 1 responsável (a linha em si);
  // na CRIAÇÃO, pode marcar vários — cria uma agenda pra cada um.
  const selecionados = new Set();
  if (responsavelId) selecionados.add(responsavelId);

  if (id) {
    // EDIÇÃO: seletor único (a agenda editada pertence a um gerente)
    if (responsaveis.length > 1 || (isAdminRole && responsaveis.length >= 1)) {
      const respSel = el('select', { class: 'select' },
        isAdminRole ? el('option', { value: '', selected: !responsavelId }, 'Selecione o gerente...') : null,
        ...responsaveis.map(r => el('option', { value: r.id, selected: responsavelId === r.id }, r.nome)),
      );
      respSel.addEventListener('change', () => { responsavelId = respSel.value; selecionados.clear(); if (respSel.value) selecionados.add(respSel.value); });
      responsavelField = field(isAdminRole ? 'Gerente responsável' : 'Responsável pela atividade', respSel, { required: true });
    }
  } else if (responsaveis.length > 1 || (isAdminRole && responsaveis.length >= 1)) {
    // CRIAÇÃO: lista suspensa (dropdown) multi-seleção — não polui a tela
    const dd = el('div', { class: 'relative' });
    const display = el('button', { type: 'button', class: 'select text-left flex items-center justify-between' });
    let labelSpan = el('span', { class: 'truncate text-fg-subtle' }, 'Selecione os gerentes...');
    display.append(labelSpan, icon('chevronDown', 16, 'text-fg-subtle flex-shrink-0'));
    const popup = el('div', { class: 'absolute z-40 left-0 right-0 mt-1 card max-h-72 overflow-y-auto hidden', style: { top: '100%' } });
    const listWrap = el('div', { class: 'flex flex-col p-1' });
    popup.append(listWrap);
    const nomeCurto = r => r.nome.replace(/\s*\(.*\)$/, '');
    function refreshLabel() {
      const marcados = responsaveis.filter(r => selecionados.has(r.id));
      const n = marcados.length;
      const txt = n === 0 ? 'Selecione os gerentes...'
        : n === 1 ? nomeCurto(marcados[0])
        : `${n} gerentes selecionados`;
      const ns = el('span', { class: 'truncate ' + (n ? '' : 'text-fg-subtle') }, txt);
      labelSpan.replaceWith(ns); labelSpan = ns;
    }
    responsaveis.forEach(r => {
      const cb = el('input', { type: 'checkbox', checked: selecionados.has(r.id) });
      cb.addEventListener('change', () => { cb.checked ? selecionados.add(r.id) : selecionados.delete(r.id); refreshLabel(); });
      listWrap.appendChild(el('label', { class: 'flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-bg-elev cursor-pointer text-sm' },
        cb, el('span', { class: 'flex-1' }, r.nome)));
    });
    const closeDD = () => { popup.classList.add('hidden'); document.removeEventListener('click', outsideDD); };
    const outsideDD = (e) => { if (!dd.contains(e.target)) closeDD(); };
    display.addEventListener('click', (e) => {
      e.stopPropagation();
      if (popup.classList.contains('hidden')) { popup.classList.remove('hidden'); document.addEventListener('click', outsideDD); }
      else closeDD();
    });
    dd.append(display, popup);
    refreshLabel();
    responsavelField = field(isAdminRole ? 'Gerentes presentes' : 'Quem estará presente', dd, {
      required: true,
      help: 'Selecione todos os gerentes presentes. Cria uma agenda para cada um; ao realizar, gera um único check-in que conta no contador de todos.',
    });
  } else if (isAdminRole && responsaveis.length === 0) {
    responsavelField = el('div', { class: 'card p-3 text-sm text-warning' },
      '⚠ Nenhum gerente no seu escopo para agendar. Verifique os cadastros.');
  }

  // === Recorrência (só na CRIAÇÃO) ===
  // Repete o mesmo agendamento nas próximas datas e sincroniza como evento
  // recorrente no calendário (RRULE).
  let recorrenciaSel = null, recUntilWrap = null, recUntilInput = null;
  if (!id) {
    recorrenciaSel = el('select', { class: 'select' },
      el('option', { value: '' }, 'Não repetir'),
      el('option', { value: 'diaria' }, 'Diária'),
      el('option', { value: 'semanal' }, 'Semanal'),
      el('option', { value: 'quinzenal' }, 'Quinzenal'),
      el('option', { value: 'mensal' }, 'Mensal'),
    );
    recUntilInput = el('input', { class: 'input', type: 'date' });
    recUntilWrap = field('Repetir até', recUntilInput);
    recUntilWrap.style.display = 'none';
    recorrenciaSel.addEventListener('change', () => {
      recUntilWrap.style.display = recorrenciaSel.value ? '' : 'none';
    });
  }
  const recorrenciaField = recorrenciaSel ? field('Recorrência', recorrenciaSel, {
    help: 'Cria o mesmo agendamento nas próximas datas e entra no calendário como evento recorrente.',
  }) : null;

  const form = el('form', { class: 'flex flex-col gap-4' },
    field('Tipo', el('div', { class: 'flex gap-2' }, ...tipoButtons), { required: true }),
    field('Data e hora prevista', dataHoraRow, { required: true, help: 'O horário de término é opcional.' }),
    recorrenciaField,
    recUntilWrap,
    responsavelField,
    ctx,
    submitBtn, cancelBtn,
  );

  paintTipo();

  // IDs ESTÁVEIS ENTRE TENTATIVAS — corrige duplicação.
  // "Tentar novamente" re-executa este submit. Antes, cada execução sorteava um
  // id novo, então o upsert INSERIA outra linha — e como o gravar pode ter dado
  // certo no servidor mesmo com "Tempo esgotado" no aparelho, cada tentativa
  // deixava um agendamento. Resultado: 3 cliques = 3 linhas.
  // Agora o id é fixo por (gerente × data): repetir SEMPRE cai na mesma linha.
  const _idsFixos = new Map();
  const idFixo = (pid, occ) => {
    const k = pid + '|' + occ;
    if (!_idsFixos.has(k)) {
      _idsFixos.set(k, (self.crypto && crypto.randomUUID) ? crypto.randomUUID() : undefined);
    }
    return _idsFixos.get(k);
  };

  // ── CONFLITO DE HORÁRIO ──────────────────────────────────────────────────
  // Avisa (não bloqueia) quando já existe agenda aberta no mesmo horário para
  // alguém que estará presente. Agenda sem término conta como 1h.
  const UMA_HORA = 60 * 60 * 1000;
  function duracaoAtual() {
    const hf = fimInput.value; if (!hf || !dataInput.value) return null;
    const ini = new Date(dataInput.value); const [hh, mm] = hf.split(':').map(Number);
    const f = new Date(ini); f.setHours(hh, mm, 0, 0);
    return f > ini ? f - ini : null;
  }
  async function confirmarSemConflito(inicios) {
    try {
      const pessoas = id ? (responsavelId ? [responsavelId] : []) : [...selecionados];
      if (!pessoas.length || !inicios.length) return true;
      const ts = inicios.map(x => new Date(x).getTime());
      const de = new Date(Math.min(...ts) - 12 * UMA_HORA).toISOString();
      const ate = new Date(Math.max(...ts) + 12 * UMA_HORA).toISOString();
      const { data, error } = await q(() => supabase.from('agendamentos')
        .select('id, gerente_id, data_prevista, data_fim, tipo, titulo, imobiliaria, recorrencia_id, grupo_id, profiles!agendamentos_gerente_id_fkey(nome)')
        .in('gerente_id', pessoas).eq('status', 'pendente').gte('data_prevista', de).lte('data_prevista', ate),
        { ms: 5000, label: 'conflito de horário', tentativas: 1 });
      if (error || !data) return true;              // sem resposta: não trava o agendamento
      const dur = duracaoAtual() || UMA_HORA;
      const conflitos = [];
      const vistos = new Set();
      for (const ini of ts) {
        const fimNovo = ini + dur;
        for (const a of data) {
          if (id && a.id === id) continue;
          if (initial?.recorrencia_id && a.recorrencia_id === initial.recorrencia_id) continue;
          const s0 = new Date(a.data_prevista).getTime();
          const e0 = a.data_fim ? new Date(a.data_fim).getTime() : s0 + UMA_HORA;
          const chave = a.grupo_id || a.id;
          if (s0 < fimNovo && ini < e0 && !vistos.has(chave)) { vistos.add(chave); conflitos.push(a); }
        }
      }
      if (!conflitos.length) return true;
      const hm = d => new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const dia = d => new Date(d).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
      return await new Promise((resolve) => {
        let feito = false; const fim = v => { if (!feito) { feito = true; resolve(v); } };
        const bVoltar = el('button', { class: 'btn btn-ghost', onclick: () => { fim(false); mm.close(); } }, 'Voltar e ajustar');
        const bOk = el('button', { class: 'btn btn-primary', onclick: () => { fim(true); mm.close(); } }, 'Agendar mesmo assim');
        const mm = modal({
          title: '⚠️ Conflito de horário', size: 'sm',
          content: el('div', { class: 'flex flex-col gap-2' },
            el('p', { class: 'text-sm text-fg-muted' }, 'Já existe agenda neste horário:'),
            ...conflitos.slice(0, 6).map(a => el('div', { class: 'card p-2 text-sm' },
              el('div', { class: 'font-semibold' }, (a.titulo || a.imobiliaria || a.tipo)),
              el('div', { class: 'text-xs text-fg-muted' },
                dia(a.data_prevista) + ' · ' + hm(a.data_prevista) + (a.data_fim ? '–' + hm(a.data_fim) : '') +
                (a.profiles?.nome ? ' · ' + a.profiles.nome : '')),
            )),
            conflitos.length > 6 ? el('p', { class: 'text-xs text-fg-subtle' }, `e mais ${conflitos.length - 6}…`) : null,
          ),
          footer: [bVoltar, bOk],
          onClose: () => fim(false),
        });
      });
    } catch (e) { return true; }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    // Lista de presentes (criação = multi; edição = 1)
    const presentes = id ? (responsavelId ? [responsavelId] : []) : [...selecionados];
    if (!presentes.length) { toast('Selecione quem estará presente', 'error'); return; }
    const fd = new FormData(form);
    const dataIso = new Date(fd.get('data_prevista')).toISOString();
    // Término (opcional) no MESMO dia do início.
    let duracaoMs = null;
    const horaFim = (fd.get('hora_fim') || '').toString();
    if (horaFim) {
      const ini = new Date(fd.get('data_prevista'));
      const [hh, mm] = horaFim.split(':').map(Number);
      const fim = new Date(ini); fim.setHours(hh, mm, 0, 0);
      if (fim <= ini) { toast('O horário de término precisa ser depois do início.', 'error', 5000); return; }
      duracaoMs = fim - ini;
    }
    const fimDe = (isoIni) => duracaoMs ? new Date(new Date(isoIni).getTime() + duracaoMs).toISOString() : null;

    // Grupo quando há mais de um presente: uma agenda por gerente, mesmo grupo_id,
    // e "participantes" = todos (usado ao realizar para creditar cada um).
    const ehGrupo = presentes.length > 1;
    const grupoId = ehGrupo ? crypto.randomUUID() : null;

    // Local da visita e Imobiliária são campos SEPARADOS (colunas distintas).
    const payload = {
      gerente_id: presentes[0], // dono da linha (nas N linhas, cada uma tem o seu)
      participantes: ehGrupo ? presentes : [],
      grupo_id: grupoId,
      teste: (!id && !!state.profile?.conta_teste) || undefined, // só na criação; não polui os números reais
      // HORA REAL em que foi agendado, medida no aparelho (sobrevive à fila offline)
      registrado_em: !id ? new Date().toISOString() : undefined,
      tipo: chosenTipo,
      data_prevista: dataIso,
      data_fim: fimDe(dataIso),
      titulo: (fd.get('titulo') || '').toString().trim() || null,
      observacoes: (fd.get('observacoes') || '').toString().trim() || null,
      imobiliaria: (fd.get('imobiliaria') || '').toString().trim() || null,       // só do campo Imobiliária
      local_visita: (fd.get('local_visita_disp') || '').toString().trim() || null, // coluna dedicada
      empreendimento: (fd.get('empreendimento') || '').toString().trim() || null,
      cliente: (fd.get('cliente') || '').toString().trim() || null,
      corretor: (fd.get('corretor') || '').toString().trim() || null,
      motivo_visita: (fd.get('motivo_visita') || '').toString().trim() || null,
      updated_at: new Date().toISOString(),
    };

    // Remarcação: numa EDIÇÃO, se a data/hora prevista mudou, sinaliza como remarcada
    // e incrementa o contador (preservando a 1ª data em data_prevista_original).
    if (id && initial) {
      const mudouDataHora = new Date(initial.data_prevista).getTime() !== new Date(dataIso).getTime();
      if (mudouDataHora) {
        payload.remarcada = true;
        payload.remarcacoes = (initial.remarcacoes || 0) + 1;
        payload.data_prevista_original = initial.data_prevista_original || initial.data_prevista;
      }
    }

    loadingBtn(submitBtn, true);
    try {
      if (id && initial?.recorrencia_id) {
        const escolha = await escolherAlcanceSerie('Editar agendamento repetido',
          'Este agendamento faz parte de uma sequência. O que você quer alterar?');
        if (!escolha) { loadingBtn(submitBtn, false); return; }
        if (escolha === 'seguintes') {
          if (!(await confirmarSemConflito([dataIso]))) { loadingBtn(submitBtn, false); return; }
          const campos = {};
          ['tipo', 'titulo', 'observacoes', 'imobiliaria', 'local_visita', 'empreendimento', 'cliente', 'corretor', 'motivo_visita']
            .forEach(k => { campos[k] = payload[k] == null ? '' : payload[k]; });
          const deltaSeg = Math.round((new Date(dataIso) - new Date(initial.data_prevista)) / 1000);
          const { data: n, error } = await q(() => supabase.rpc('agenda_serie_editar', {
            p_recorrencia_id: initial.recorrencia_id, p_desde: initial.data_prevista,
            p_delta_seg: deltaSeg, p_campos: campos, p_duracao_seg: duracaoMs ? Math.round(duracaoMs / 1000) : null,
          }), { ms: 8000, label: 'editar sequência', tentativas: 3 });
          if (error) throw error;
          sincronizarOutlook([id]);
          toast(`✓ ${n || 0} agendamento${n === 1 ? '' : 's'} da sequência atualizado${n === 1 ? '' : 's'}`, 'success', 5000);
          navigate('/', true);
          return;
        }
      }
      if (id) {
        if (!(await confirmarSemConflito([dataIso]))) { loadingBtn(submitBtn, false); return; }
        // Edição: idempotente (mesmo id, mesmos valores) → pode repetir à vontade.
        const { data, error } = await q(() => supabase.from('agendamentos').update(payload).eq('id', id).select(),
          { ms: 6000, label: 'editar agendamento', tentativas: 3 });
        if (error) {
          if (/tempo esgotado/i.test(error.message || '')) throw new Error('A conexão travou e a alteração não foi confirmada. Nada foi perdido — toque em Salvar de novo.');
          throw error;
        }
        if (!data || !data.length) throw new Error('Sem permissão (RLS rejeitou)');
        sincronizarOutlook([id]);
        toast('✓ Atualizado', 'success');
        navigate('/', true);
        return;
      }
      // CRIAÇÃO resiliente: id gerado no cliente + upsert idempotente + retry com
      // tempo-limite por tentativa. Se a rede travar (iOS suspende), tenta de novo
      // sem duplicar (mesmo id) — resolve o "ficou carregando e não foi".
      // Recorrência (só criação): repete a partir da data escolhida ATÉ a data limite.
      const freq = (recorrenciaSel && recorrenciaSel.value) ? recorrenciaSel.value : '';
      const base = new Date(dataIso);
      const passo = (d, i) => {
        const x = new Date(d);
        if (freq === 'diaria') x.setDate(x.getDate() + i);
        else if (freq === 'semanal') x.setDate(x.getDate() + 7 * i);
        else if (freq === 'quinzenal') x.setDate(x.getDate() + 14 * i);
        else if (freq === 'mensal') x.setMonth(x.getMonth() + i);
        return x;
      };
      // Datas das ocorrências (mantendo o horário da 1ª). Vai até o FIM do dia limite.
      const datas = [];
      if (freq) {
        const raw = (recUntilInput.value || '').trim();
        if (!raw) { loadingBtn(submitBtn, false); return toast('Escolha a data em "Repetir até".', 'error'); }
        const ate = new Date(raw + 'T23:59:59');
        if (isNaN(ate.getTime()) || ate < base) { loadingBtn(submitBtn, false); return toast('A data de "Repetir até" precisa ser depois da data do agendamento.', 'error', 6000); }
        for (let i = 0; i < 400; i++) { // teto de segurança
          const occ = passo(base, i);
          if (occ > ate) break;
          datas.push(occ.toISOString());
        }
      } else {
        datas.push(dataIso);
      }
      // Estável também: senão cada tentativa criaria uma "série" diferente.
      const recorrenciaId = freq ? idFixo('recorrencia', freq + '|' + dataIso) : null;
      // Uma linha por (presente × ocorrência). Campos de recorrência só entram
      // quando há recorrência (mantém a criação normal à prova de coluna faltando).
      const rows = [];
      for (const pid of presentes) {
        for (const occ of datas) {
          const row = { ...payload, gerente_id: pid, id: idFixo(pid, occ), data_prevista: occ, data_fim: fimDe(occ),
            // Cada DATA é um encontro: grupo próprio por ocorrência. Antes a série inteira
            // dividia o mesmo grupo e realizar UMA data marcaria todas como realizadas.
            grupo_id: ehGrupo ? idFixo('grupo', occ) : null };
          if (freq) { row.recorrencia_id = recorrenciaId; row.recorrencia_freq = freq; row.recorrencia_total = datas.length; }
          rows.push(row);
        }
      }
      if (!(await confirmarSemConflito(datas))) { loadingBtn(submitBtn, false); return; }
      const temIds = rows.every(r => r.id);
      // Guardar no aparelho. Serve pro atalho DURANTE as tentativas e pro botão
      // do aviso de falha. Mesmo id do upsert → nunca duplica.
      let saiuPelaFila = false;
      const guardarNaFila = async () => {
        if (saiuPelaFila) return;
        saiuPelaFila = true;
        try {
          const outbox = await import('../outbox.js');
          for (const linha of rows) {
            await outbox.guardar({
              id: linha.id, tipo: 'agendamento', tabela: 'agendamentos',
              row: linha, fotos: [], posSync: null,
              criadoEm: new Date().toISOString(), tentativas: 0,
            });
          }
          toast('📥 Agendamento salvo no aparelho. Sobe sozinho quando a conexão voltar.', 'success', 7000);
          navigate('/', true);
        } catch (e) {
          saiuPelaFila = false;
          toast('Não consegui guardar no aparelho: ' + (e.message || e), 'error', 7000);
        }
      };
      // Painel de progresso: o gerente LÊ em que tentativa está e, já na 1ª
      // falha (~6s), pode guardar no aparelho sem esperar o resto.
      const painel = painelSalvando(submitBtn, 'Salvando agendamento...');
      const r = await salvarAgendamentosResiliente(rows, temIds ? 3 : 1, ({ tentativa, total }) => {
        painel.progresso(`Conexão lenta. Tentando de novo (${tentativa} de ${total})...`);
        painel.oferecerFila(() => { painel.limpar(); loadingBtn(submitBtn, false); guardarNaFila(); });
      });
      painel.limpar();
      if (saiuPelaFila) return;   // o gerente já resolveu pelo atalho
      if (!r.ok) {
        // Não perde o agendamento: oferece guardar no aparelho e enviar depois.
        loadingBtn(submitBtn, false);
        const motivo = (r.error && (r.error.message || r.error)) || 'conexão travada';
        const bTentar = el('button', { class: 'btn btn-primary' }, 'Tentar novamente');
        const bFila = el('button', { class: 'btn btn-secondary' }, '📥 Salvar no aparelho');
        const bFechar = el('button', { class: 'btn btn-ghost' }, 'Fechar');
        const mm = modal({
          title: '❌ Agendamento não salvo',
          size: 'sm',
          content: el('div', { class: 'flex flex-col gap-2' },
            el('p', { class: 'text-sm text-fg-muted' }, `Não foi possível gravar no servidor (${motivo}).`),
            el('p', { class: 'text-xs text-fg-subtle' },
              'Com "Salvar no aparelho", o agendamento fica guardado aqui e sobe sozinho quando a conexão voltar — nada se perde e não duplica.'),
          ),
          footer: [bFechar, bFila, bTentar],
        });
        bFechar.addEventListener('click', () => mm.close());
        bTentar.addEventListener('click', () => { mm.close(); form.requestSubmit(); });
        bFila.addEventListener('click', () => { mm.close(); guardarNaFila(); });
        return;
      }
      sincronizarOutlook(rows.map(r => r.id));
      toast(
        freq ? `✓ ${datas.length} agendamentos criados (${recorrenciaSel.options[recorrenciaSel.selectedIndex].text.toLowerCase()})!`
             : (ehGrupo ? `✓ Agendado para ${presentes.length} gerentes!` : '✓ Agendado!'),
        'success');
      navigate('/', true);
    } catch (err) {
      console.error('[agenda] erro:', err);
      toast('⚠ ' + (err.message || 'Erro ao salvar') + '. Verifique a conexão e tente de novo.', 'error', 6000);
      loadingBtn(submitBtn, false);
    }
  });

  app.appendChild(shell(form, {
    title: id ? 'Editar agendamento' : 'Novo agendamento',
    back: true, hideBottomNav: true,
  }));
}
