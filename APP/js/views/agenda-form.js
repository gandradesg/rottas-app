// Formulário de criar/editar agendamento — só Check-in, Atendimento e Outro
import { el, icon, toast, loadingBtn } from '../ui.js';
import { shell } from './shell.js';
import { state, supabase } from '../supabase.js';
import { field, creatableSelect, addImobiliaria, addLocalVisita } from '../components/form-fields.js';
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

  // Data e hora — usa prefill se disponível, senão amanhã 9h
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

  // Containers para campos contextuais
  const imobWrap = el('div', {});
  const localWrap = el('div', {});
  const empWrap = el('div', {});
  const cliWrap = el('div', {});
  const corWrap = el('div', {});
  const motivoWrap = el('div', {});

  function updateContextualFields() {
    imobWrap.innerHTML = '';
    localWrap.innerHTML = '';
    empWrap.innerHTML = '';
    cliWrap.innerHTML = '';
    corWrap.innerHTML = '';
    motivoWrap.innerHTML = '';

    // CHECK-IN: imobiliária + motivo da visita
    if (chosenTipo === 'checkin') {
      imobWrap.appendChild(field('Imobiliária', creatableSelect({
        name: 'imobiliaria', items: state.imobiliarias, value: initial?.imobiliaria,
        allowAdd: true, onAdd: addImobiliaria,
      })));
      motivoWrap.appendChild(field('Motivo da visita', creatableSelect({
        name: 'motivo_visita', items: state.motivosVisita, value: initial?.motivo_visita,
      })));
    }
    // ATENDIMENTO: local da visita + cliente + corretor (Empreendimento só no momento do registro real)
    if (chosenTipo === 'atendimento') {
      localWrap.appendChild(field('Local da visita', creatableSelect({
        name: 'local_visita_disp', items: state.locaisVisita, value: initial?.imobiliaria,
        allowAdd: true, onAdd: addLocalVisita,
      }), { help: 'Onde o atendimento vai acontecer' }));
      cliWrap.appendChild(field('Cliente',
        el('input', { class: 'input', name: 'cliente', placeholder: 'Nome do cliente', value: initial?.cliente || '' })
      ));
      corWrap.appendChild(field('Corretor',
        el('input', { class: 'input', name: 'corretor', placeholder: 'Nome do corretor', value: initial?.corretor || '' })
      ));
    }
    // OUTRO: só título + observações (já estão no rodapé do form)
  }

  const submitBtn = el('button', { class: 'btn btn-primary btn-lg w-full mt-2', type: 'submit' },
    id ? 'Salvar alterações' : 'Agendar');
  const cancelBtn = el('button', { class: 'btn btn-ghost w-full', type: 'button',
    onclick: () => history.back() }, 'Cancelar');

  const form = el('form', { class: 'flex flex-col gap-4' },
    field('Tipo', el('div', { class: 'flex gap-2' }, ...tipoButtons), { required: true }),
    field('Data e hora prevista', dataInput, { required: true }),
    imobWrap, motivoWrap,         // check-in
    localWrap, empWrap, cliWrap, corWrap, // atendimento
    field('Título / descrição', tituloInput, { help: 'Texto livre para identificar o agendamento' }),
    field('Observações', obsInput),
    audioField({ targetTextarea: obsInput }),
    submitBtn, cancelBtn,
  );

  paintTipo();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const dataIso = new Date(fd.get('data_prevista')).toISOString();

    // Atendimento: o "Local da visita" mapeia pro campo `imobiliaria` do agendamento
    // (não temos coluna separada no schema; o que importa é prefilar atividade depois)
    const localAtend = (fd.get('local_visita_disp') || '').toString().trim();

    const payload = {
      gerente_id: state.user.id,
      tipo: chosenTipo,
      data_prevista: dataIso,
      titulo: (fd.get('titulo') || '').toString().trim() || null,
      observacoes: (fd.get('observacoes') || '').toString().trim() || null,
      imobiliaria: (fd.get('imobiliaria') || '').toString().trim() || localAtend || null,
      empreendimento: (fd.get('empreendimento') || '').toString().trim() || null,
      cliente: (fd.get('cliente') || '').toString().trim() || null,
      corretor: (fd.get('corretor') || '').toString().trim() || null,
      motivo_visita: (fd.get('motivo_visita') || '').toString().trim() || null,
      updated_at: new Date().toISOString(),
    };

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
