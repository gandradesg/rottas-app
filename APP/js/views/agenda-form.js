// Formulário de criar/editar agendamento - só Check-in, Atendimento e Outro
import { el, icon, toast, loadingBtn } from '../ui.js';
import { shell } from './shell.js';
import { state, supabase, getScopedImobiliarias } from '../supabase.js';
import { field, creatableSelect, addImobiliaria, addLocalVisita, addMotivoVisita } from '../components/form-fields.js';
import { audioField } from '../components/audio-field.js';
import { navigate } from '../router.js';

// Apenas tipos que fazem sentido planejar com antecedência
const TIPOS = [
  { id: 'checkin',     label: 'Check-in',     ic: 'mapPin',   bg: 'rgba(59,130,246,0.10)',  fg: '#3B82F6' },
  { id: 'atendimento', label: 'Atendimento',  ic: 'users',    bg: 'rgba(139,92,246,0.10)',  fg: '#8B5CF6' },
  { id: 'outro',       label: 'Outro',        ic: 'calendar', bg: 'rgba(160,164,178,0.15)', fg: '#717784' },
];

const PREFILL_DATE_KEY = 'agenda-prefill-date';

export async function agendaFormView(params, app) {
  const id = params.id;
  let initial = null;
  if (id) {
    const { data } = await supabase.from('agendamentos').select('*').eq('id', id).single();
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
    const { data: pessoas } = await supabase.rpc('pessoas_agenda_mesma_praca');
    (pessoas || []).forEach(p => {
      const isSelf = p.id === meuId;
      const rl = p.role === 'gerente' ? 'Gerente' : 'Supervisor';
      responsaveis.push({ id: p.id, nome: isSelf ? ((p.nome || 'Você') + ' (você)') : `${p.nome} (${rl})` });
    });
    if (!responsaveis.some(r => r.id === meuId)) {
      responsaveis.unshift({ id: meuId, nome: (state.profile?.nome || 'Você') + ' (você)' });
    }
    // Eu sempre no topo
    responsaveis.sort((a, b) => (a.id === meuId ? -1 : b.id === meuId ? 1 : 0));
  } else if (['superintendente', 'gestor', 'gestor_regional', 'master'].includes(myRole)) {
    const { data: gers } = await supabase
      .from('profiles').select('id, nome, estado, cidade').eq('role', 'gerente').eq('ativo', true).order('nome');
    let list = gers || [];
    if (myRole === 'superintendente') {
      const es = Array.isArray(state.profile?.estados_acesso) ? state.profile.estados_acesso : [];
      list = list.filter(g => es.includes(g.estado));
    } else if (myRole === 'gestor_regional') {
      const cs = Array.isArray(state.profile?.cidades_acesso) ? state.profile.cidades_acesso : [];
      list = list.filter(g => cs.includes(g.cidade));
    }
    list.forEach(g => responsaveis.push({ id: g.id, nome: g.nome + ' (Gerente)' }));
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

  const dataInput = el('input', { class: 'input', type: 'datetime-local', name: 'data_prevista', required: true, value: defaultDate });
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
      // OUTRO: Título/descrição
      ctx.append(field('Título / descrição', tituloInput, { help: 'Texto livre para identificar o agendamento' }));
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
  // Mostra o seletor quando há mais de uma opção, ou quando é admin (precisa escolher o gerente)
  if (responsaveis.length > 1 || (isAdminRole && responsaveis.length >= 1)) {
    const respSel = el('select', { class: 'select' },
      isAdminRole ? el('option', { value: '', selected: !responsavelId }, 'Selecione o gerente...') : null,
      ...responsaveis.map(r => el('option', { value: r.id, selected: responsavelId === r.id }, r.nome)),
    );
    respSel.addEventListener('change', () => { responsavelId = respSel.value; });
    responsavelField = field(isAdminRole ? 'Gerente responsável' : 'Responsável pela atividade', respSel, {
      required: true,
      help: isAdminRole
        ? 'Em qual gerente do seu time esta agenda será criada'
        : 'Você, ou um gerente/supervisor da sua cidade (vocês compartilham agenda)',
    });
  } else if (isAdminRole && responsaveis.length === 0) {
    responsavelField = el('div', { class: 'card p-3 text-sm text-warning' },
      '⚠ Nenhum gerente no seu escopo para agendar. Verifique os cadastros.');
  }

  const form = el('form', { class: 'flex flex-col gap-4' },
    field('Tipo', el('div', { class: 'flex gap-2' }, ...tipoButtons), { required: true }),
    field('Data e hora prevista', dataInput, { required: true }),
    responsavelField,
    ctx,
    submitBtn, cancelBtn,
  );

  paintTipo();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!responsavelId) { toast('Selecione o gerente responsável pela agenda', 'error'); return; }
    const fd = new FormData(form);
    const dataIso = new Date(fd.get('data_prevista')).toISOString();

    // Local da visita e Imobiliária são campos SEPARADOS (colunas distintas).
    const payload = {
      gerente_id: responsavelId, // Próprio gerente OU um supervisor escolhido
      tipo: chosenTipo,
      data_prevista: dataIso,
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
      const { data, error } = id
        ? await supabase.from('agendamentos').update(payload).eq('id', id).select()
        : await supabase.from('agendamentos').insert(payload).select();
      if (error) throw error;
      if (!data || !data.length) throw new Error('Sem permissão (RLS rejeitou)');
      toast(id ? '✓ Atualizado' : '✓ Agendado!', 'success');
      navigate('/', true);
    } catch (err) {
      console.error('[agenda] erro:', err);
      toast(err.message || 'Erro ao salvar', 'error', 5000);
      loadingBtn(submitBtn, false);
    }
  });

  app.appendChild(shell(form, {
    title: id ? 'Editar agendamento' : 'Novo agendamento',
    back: true, hideBottomNav: true,
  }));
}
