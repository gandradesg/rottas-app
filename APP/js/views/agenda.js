// Agenda - calendário dia/semana/mês com itens vinculados a atividades
import { el, icon, fmt, toast, confirmModal } from '../ui.js';
import { shell } from './shell.js';
import { state, supabase } from '../supabase.js';
import { activeViewRole } from '../auth.js';
import { navigate } from '../router.js';
import { TIPO_ATIVIDADE } from '../config.js';
import { calendarButton } from '../calendar-sync.js';

const STATUS_INFO = {
  pendente:   { label: 'Pendente',   chip: 'chip-yellow', icon: '⏳' },
  realizado:  { label: 'Realizado',  chip: 'chip-green',  icon: '✓'  },
  cancelado:  { label: 'Cancelado',  chip: 'chip-red',    icon: '✕'  },
  adiado:     { label: 'Adiado',     chip: 'chip',        icon: '↻'  },
};

const TIPO_ICON = {
  checkin: 'mapPin', atendimento: 'users', proposta: 'fileText', orulo: 'globe', outro: 'calendar'
};

const DAY_NAMES = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// ===== Indicador de performance da semana =====
// Considera os agendamentos cuja data prevista cai na semana corrente (Dom→Sáb).
function startOfWeekDate(d) {
  const x = new Date(d); x.setHours(0,0,0,0);
  x.setDate(x.getDate() - x.getDay());
  return x;
}
function computeWeekStats(items, refDate) {
  const start = startOfWeekDate(refDate);
  const end = new Date(start); end.setDate(end.getDate() + 7);
  const wk = (items || []).filter(it => {
    const d = new Date(it.data_prevista);
    return d >= start && d < end;
  });
  const total  = wk.length;
  const concl  = wk.filter(x => x.status === 'realizado').length;
  const canc   = wk.filter(x => x.status === 'cancelado').length;
  const remarc = wk.filter(x => x.remarcada).length;
  const pct = n => total ? Math.round((n / total) * 100) : 0;
  return { total, concl, canc, remarc, pctConcl: pct(concl), pctCanc: pct(canc), pctRemarc: pct(remarc) };
}
function renderWeekStats(box, items, refDate) {
  const s = computeWeekStats(items, refDate);
  box.innerHTML = '';
  const stat = (value, label, color, sub) => el('div', {
    class: 'flex flex-col items-center justify-center text-center px-1 py-2 rounded-xl',
    style: { background: color + '14' },
  },
    el('div', { class: 'text-xl font-extrabold leading-none', style: { color } }, value),
    el('div', { class: 'text-[10px] font-semibold uppercase tracking-wide text-fg-muted mt-1' }, label),
    sub ? el('div', { class: 'text-[10px] text-fg-subtle' }, sub) : null,
  );
  box.appendChild(el('div', { class: 'card p-3' },
    el('div', { class: 'text-xs font-bold uppercase tracking-wider text-fg-subtle mb-2' },
      '📊 Performance da semana'),
    el('div', { class: 'grid grid-cols-4 gap-2' },
      stat(String(s.total), 'Agendadas', '#F26B22'),
      stat(s.pctConcl + '%', 'Concluídas', '#10B981', `${s.concl}/${s.total}`),
      stat(s.pctCanc + '%', 'Canceladas', '#EF4444', `${s.canc}/${s.total}`),
      stat(s.pctRemarc + '%', 'Remarcadas', '#F59E0B', `${s.remarc}/${s.total}`),
    ),
  ));
}

export async function agendaView(_params, app) {
  const view = activeViewRole();
  if (view === 'gestor') return agendaGestorView(app);
  return agendaGerenteView(app);
}

// ============================================================
// Agenda do Gerente - calendário com modos dia/semana/mês
// ============================================================
async function agendaGerenteView(app) {
  // Estado da view
  const today = new Date(); today.setHours(0,0,0,0);
  let mode = localStorage.getItem('agenda-mode') || 'mes'; // 'dia' | 'semana' | 'mes'
  let cursor = new Date(today); // dia/semana/mês de referência
  let allItems = []; // Cache de agendamentos

  const content = el('div', { class: 'flex flex-col gap-3' });

  // Header (sem botão "Novo" - usa o "+" dentro de cada dia/seção)
  content.appendChild(el('div', {},
    el('h1', { class: 'text-2xl font-extrabold' }, 'Minha agenda'),
    el('p', { class: 'text-sm text-fg-muted' }, 'Toque em um dia para ver e adicionar atividades'),
  ));

  // Painel de performance da semana (preenchido após carregar os itens)
  const statsBox = el('div', {});
  content.appendChild(statsBox);

  // Helper: navega para criar agendamento prefilando a data
  function newOnDate(date) {
    if (date) {
      // Define hora padrão 9h se for só dia
      const d = new Date(date);
      if (d.getHours() === 0 && d.getMinutes() === 0) d.setHours(9, 0, 0, 0);
      localStorage.setItem('agenda-prefill-date', d.toISOString());
    }
    navigate('/agenda/nova');
  }

  // Toolbar (modo + navegação)
  const toolbar = el('div', { class: 'card p-2 flex flex-col gap-2' });
  content.appendChild(toolbar);

  // Container do calendário
  const cal = el('div', { class: 'flex flex-col gap-3' });
  content.appendChild(cal);

  app.appendChild(shell(content, { title: 'Agenda' }));

  // Carrega agendamentos (janela ampla - 3 meses para tras + 6 meses para frente)
  const from = new Date(today.getFullYear(), today.getMonth() - 3, 1);
  const to   = new Date(today.getFullYear(), today.getMonth() + 7, 0); to.setHours(23,59,59);

  cal.innerHTML = '<div class="skeleton h-32"></div>';

  // Carrega IDs do "meu time": eu + supervisores que reportam pra mim
  // (gerente vê tudo do supervisor pra acompanhar; supervisor vê só dele)
  const meuId = state.user.id;
  let teamIds = [meuId];
  if (state.profile?.role === 'gerente') {
    const { data: subs } = await supabase
      .from('profiles')
      .select('id, nome')
      .eq('gerente_supervisor_id', meuId)
      .eq('ativo', true);
    if (subs?.length) teamIds = [meuId, ...subs.map(s => s.id)];
  }

  const { data, error } = await supabase
    .from('agendamentos')
    .select('*, profiles!agendamentos_gerente_id_fkey(nome, role)')
    .in('gerente_id', teamIds)
    .gte('data_prevista', from.toISOString())
    .lte('data_prevista', to.toISOString())
    .order('data_prevista', { ascending: true });

  if (error) {
    cal.innerHTML = '';
    cal.appendChild(el('div', { class: 'card p-4 text-danger text-sm' }, 'Erro: ' + error.message));
    return;
  }
  allItems = data || [];

  function renderToolbar() {
    toolbar.innerHTML = '';
    // Linha 1: modos
    const modes = el('div', { class: 'flex gap-1.5' });
    [
      { id: 'dia',    label: 'Dia' },
      { id: 'semana', label: 'Semana' },
      { id: 'mes',    label: 'Mês' },
    ].forEach(m => {
      modes.appendChild(el('button', {
        class: 'btn btn-sm flex-1 ' + (mode === m.id ? 'btn-primary' : 'btn-ghost'),
        onclick: () => { mode = m.id; localStorage.setItem('agenda-mode', m.id); render(); }
      }, m.label));
    });
    toolbar.appendChild(modes);

    // Linha 2: navegação
    const nav = el('div', { class: 'flex items-center gap-2' });
    nav.appendChild(el('button', {
      class: 'btn btn-ghost btn-sm px-2',
      onclick: () => { shiftCursor(-1); render(); }
    }, '‹'));
    nav.appendChild(el('div', { class: 'flex-1 text-center font-bold text-sm' }, currentLabel()));
    nav.appendChild(el('button', {
      class: 'btn btn-ghost btn-sm px-2',
      onclick: () => { shiftCursor(1); render(); }
    }, '›'));
    nav.appendChild(el('button', {
      class: 'btn btn-secondary btn-sm text-xs',
      onclick: () => { cursor = new Date(today); render(); }
    }, 'Hoje'));
    toolbar.appendChild(nav);
  }

  function shiftCursor(dir) {
    if (mode === 'dia')    cursor.setDate(cursor.getDate() + dir);
    if (mode === 'semana') cursor.setDate(cursor.getDate() + 7*dir);
    if (mode === 'mes')    cursor.setMonth(cursor.getMonth() + dir);
  }
  function currentLabel() {
    if (mode === 'dia') {
      return cursor.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
    }
    if (mode === 'semana') {
      const start = startOfWeek(cursor);
      const end = new Date(start); end.setDate(end.getDate() + 6);
      const sameMonth = start.getMonth() === end.getMonth();
      if (sameMonth) {
        return `${start.getDate()}–${end.getDate()} ${MONTH_NAMES[start.getMonth()]}`;
      }
      return `${start.getDate()} ${MONTH_NAMES[start.getMonth()]} – ${end.getDate()} ${MONTH_NAMES[end.getMonth()]}`;
    }
    return `${MONTH_NAMES[cursor.getMonth()]} ${cursor.getFullYear()}`;
  }

  function render() {
    renderWeekStats(statsBox, allItems, today);
    renderToolbar();
    cal.innerHTML = '';
    if (mode === 'dia')    renderDay();
    if (mode === 'semana') renderWeek();
    if (mode === 'mes')    renderMonth();
  }

  function itemsOnDay(date) {
    return allItems.filter(it => isSameDay(new Date(it.data_prevista), date));
  }
  function isSameDay(a, b) {
    return a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate();
  }
  function startOfWeek(d) {
    const x = new Date(d); x.setHours(0,0,0,0);
    const dow = x.getDay(); // 0 = Dom
    x.setDate(x.getDate() - dow);
    return x;
  }

  function renderDay() {
    const items = itemsOnDay(cursor).sort((a,b) => new Date(a.data_prevista) - new Date(b.data_prevista));
    cal.appendChild(dayHeaderWithAdd(cursor, items.length));
    if (!items.length) {
      cal.appendChild(el('div', { class: 'card p-6 text-center text-sm text-fg-muted' },
        'Sem agendamentos para este dia.'));
      return;
    }
    items.forEach(it => cal.appendChild(itemCard(it)));
  }

  // Cabeçalho do card de dia com botão "+" circular no canto superior direito
  function dayHeaderWithAdd(date, count) {
    const isToday = isSameDay(date, today);
    const label = isToday
      ? `Hoje, ${date.toLocaleDateString('pt-BR', { day:'2-digit', month:'long' })}`
      : date.toLocaleDateString('pt-BR', { weekday: 'long', day:'2-digit', month:'long' });
    return el('div', { class: 'card p-3 flex items-start justify-between' },
      el('div', { class: 'flex items-center gap-2 min-w-0' },
        el('div', { class: 'flex flex-col min-w-0' },
          el('span', { class: 'text-[10px] font-bold uppercase tracking-wider ' +
            (isToday ? 'text-rottas-500' : 'text-fg-subtle') }, isToday ? 'Hoje' : 'Dia selecionado'),
          el('h3', { class: 'text-base font-extrabold truncate' }, label),
          count > 0
            ? el('span', { class: 'text-xs text-fg-muted' }, `${count} agendamento${count!==1?'s':''}`)
            : el('span', { class: 'text-xs text-fg-subtle italic' }, 'Sem agendamentos'),
        ),
      ),
      el('button', {
        class: 'flex items-center justify-center rounded-full text-white shadow-md flex-shrink-0',
        style: {
          width: '36px', height: '36px',
          background: 'linear-gradient(135deg, #F26B22, #D5530F)',
          boxShadow: '0 4px 12px rgba(242,107,34,0.35)',
        },
        onclick: () => newOnDate(date),
        title: 'Adicionar agendamento neste dia',
        'aria-label': 'Adicionar agendamento',
      }, icon('plus', 20)),
    );
  }

  function renderWeek() {
    const start = startOfWeek(cursor);
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start); d.setDate(d.getDate() + i); return d;
    });
    days.forEach(d => {
      const dayItems = itemsOnDay(d).sort((a,b) => new Date(a.data_prevista) - new Date(b.data_prevista));
      const isToday = isSameDay(d, today);
      // Cabeçalho do dia com "+" no canto direito superior
      cal.appendChild(el('div', {
        class: 'card p-3 flex items-start justify-between mt-2',
      },
        el('div', { class: 'flex items-baseline gap-2' },
          el('span', { class: 'text-[10px] uppercase font-bold tracking-wider ' +
            (isToday ? 'text-rottas-500' : 'text-fg-subtle') }, DAY_NAMES[d.getDay()]),
          el('span', { class: 'text-xl font-extrabold ' +
            (isToday ? 'text-rottas-500' : 'text-fg') }, String(d.getDate())),
          isToday && el('span', { class: 'chip chip-orange text-[10px]' }, 'Hoje'),
          dayItems.length > 0 && el('span', { class: 'chip text-[10px]' }, `${dayItems.length}`),
        ),
        el('button', {
          class: 'flex items-center justify-center rounded-full text-white shadow-md flex-shrink-0',
          style: { width: '32px', height: '32px',
            background: 'linear-gradient(135deg, #F26B22, #D5530F)',
            boxShadow: '0 4px 12px rgba(242,107,34,0.35)' },
          onclick: () => newOnDate(d),
          'aria-label': 'Adicionar',
        }, icon('plus', 18)),
      ));
      if (!dayItems.length) {
        cal.appendChild(el('div', { class: 'text-xs text-fg-subtle italic px-3 py-1' }, 'Sem itens'));
      } else {
        dayItems.forEach(it => cal.appendChild(itemCard(it)));
      }
    });
  }

  // Estado da seleção de dia (vive entre re-renders)
  let monthSelectedDate = null;

  function renderMonth() {
    // Default: hoje (se está no mês atual) ou dia 1 do mês cursor
    if (!monthSelectedDate
        || monthSelectedDate.getMonth() !== cursor.getMonth()
        || monthSelectedDate.getFullYear() !== cursor.getFullYear()) {
      monthSelectedDate = isSameDay(cursor, today) ? new Date(today) : new Date(cursor);
    }

    // Grade (7 × 6)
    const monthFirst = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const gridStart = new Date(monthFirst); gridStart.setDate(gridStart.getDate() - monthFirst.getDay());
    const grid = el('div', { class: 'card p-2' });
    const head = el('div', { class: 'grid grid-cols-7 gap-1 mb-1' });
    DAY_NAMES.forEach(n => head.appendChild(el('div', {
      class: 'text-center text-[10px] uppercase font-bold tracking-wider text-fg-subtle py-1'
    }, n)));
    grid.appendChild(head);

    const cells = el('div', { class: 'grid grid-cols-7 gap-1' });
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart); d.setDate(d.getDate() + i);
      const inMonth = d.getMonth() === cursor.getMonth();
      const isToday = isSameDay(d, today);
      const isSelected = isSameDay(d, monthSelectedDate);
      const dayItems = itemsOnDay(d);
      const pendentes = dayItems.filter(x => x.status === 'pendente').length;
      const realizados = dayItems.filter(x => x.status === 'realizado').length;

      // Botão "+" overlay no canto superior direito (só em dia selecionado)
      // Usa um wrapper div em vez de button aninhado (evita HTML inválido)
      const dayCapture = new Date(d);
      // Botão "+" flutuante FORA da célula (canto superior direito sobressaindo) -
      // negative offsets evitam sobrepor o número do dia em telas pequenas
      const plusOverlay = isSelected ? el('div', {
        class: 'absolute flex items-center justify-center rounded-full shadow-lg cursor-pointer z-20',
        style: {
          width: '22px', height: '22px',
          top: '-8px', right: '-8px',
          background: 'linear-gradient(135deg, #F26B22, #D5530F)',
          color: 'white',
          border: '2px solid rgb(var(--bg))',
        },
        title: 'Adicionar agendamento',
        onclick: (ev) => { ev.stopPropagation(); newOnDate(dayCapture); },
      }, icon('plus', 12)) : null;

      const cell = el('div', {
        class: [
          'relative flex flex-col items-center justify-start gap-0.5 py-1 px-0.5 rounded-lg transition aspect-square min-h-[44px] border-2 cursor-pointer',
          inMonth ? '' : 'opacity-30',
          isToday ? 'bg-rottas-500 text-white font-bold border-transparent' :
            (isSelected ? 'border-rottas-500 bg-rottas-50 dark:bg-rottas-500/10'
                        : 'border-transparent hover:bg-bg-elev'),
        ].join(' '),
        onclick: () => {
          monthSelectedDate = new Date(d);
          render();
        },
      },
        plusOverlay,
        el('span', { class: 'text-sm font-bold leading-none mt-0.5' }, String(d.getDate())),
        (pendentes > 0 || realizados > 0)
          ? el('div', { class: 'flex gap-0.5 mt-0.5' },
              pendentes > 0 ? el('span', { class: 'inline-block rounded-full',
                style: { width: '4px', height: '4px',
                  background: isToday ? 'white' : '#F26B22' } }) : null,
              realizados > 0 ? el('span', { class: 'inline-block rounded-full',
                style: { width: '4px', height: '4px',
                  background: isToday ? 'white' : '#10B981' } }) : null,
            )
          : el('div', { style: { height: '5px' } }),
      );
      cells.appendChild(cell);
    }
    grid.appendChild(cells);
    cal.appendChild(grid);

    // Lista do dia selecionado (sem botão "+" pois já está na célula)
    const items = itemsOnDay(monthSelectedDate).sort((a,b) => new Date(a.data_prevista) - new Date(b.data_prevista));
    const isToday = isSameDay(monthSelectedDate, today);
    const dayLabel = isToday
      ? `Hoje, ${monthSelectedDate.toLocaleDateString('pt-BR', { day:'2-digit', month:'long' })}`
      : monthSelectedDate.toLocaleDateString('pt-BR', { weekday: 'long', day:'2-digit', month:'long' });
    cal.appendChild(el('h3', { class: 'text-xs font-bold uppercase tracking-wider mt-3 px-1 ' +
      (isToday ? 'text-rottas-500' : 'text-fg-subtle') },
      dayLabel,
      items.length > 0 ? ` · ${items.length} item${items.length!==1?'s':''}` : '',
    ));
    if (!items.length) {
      cal.appendChild(el('div', { class: 'card p-4 text-center text-sm text-fg-muted' },
        'Toque no ',
        el('span', { class: 'inline-flex items-center justify-center rounded-full',
          style: { width: '16px', height: '16px', background: 'linear-gradient(135deg, #F26B22, #D5530F)', color: 'white' } },
          icon('plus', 11)),
        ' do dia selecionado para adicionar.'));
    } else {
      items.forEach(it => cal.appendChild(itemCard(it)));
    }
  }

  // (emptyState não é mais usado - substituído por dayHeaderWithAdd + mensagem inline)

  function itemCard(item) {
    const status = STATUS_INFO[item.status] || STATUS_INFO.pendente;
    const tipo = TIPO_ATIVIDADE[item.tipo] || { label: item.tipo, icon: '📌' };
    const titulo = item.titulo || item.imobiliaria || item.empreendimento || tipo.label;
    const data = new Date(item.data_prevista);

    // Chip do responsável quando NÃO é do próprio user (gerente vendo de supervisor)
    const isMine = item.gerente_id === state.user.id;
    const respChip = (!isMine && item.profiles?.nome)
      ? el('span', { class: 'chip chip-purple text-[10px]' }, '👁️ ' + item.profiles.nome)
      : null;

    const card = el('div', { class: 'card p-3 flex flex-col gap-2' });
    card.appendChild(el('div', { class: 'flex items-start gap-3' },
      el('div', { class: `activity-icon activity-${item.tipo}` },
        icon(TIPO_ICON[item.tipo] || 'calendar', 18)
      ),
      el('div', { class: 'flex-1 min-w-0' },
        el('div', { class: 'flex items-center gap-2 flex-wrap' },
          el('span', { class: 'font-semibold truncate' }, titulo),
          el('span', { class: `chip ${status.chip}` }, status.icon, ' ', status.label),
          item.remarcada && el('span', { class: 'chip chip-yellow text-[10px]' },
            '↻ Remarcada' + (item.remarcacoes > 1 ? ` ${item.remarcacoes}x` : '')),
          respChip,
        ),
        el('div', { class: 'text-xs text-fg-muted mt-0.5' },
          fmt.time(item.data_prevista), ' · ', tipo.label,
          item.imobiliaria && item.imobiliaria !== titulo ? ' · ' + item.imobiliaria : '',
        ),
        item.observacoes && el('div', { class: 'text-xs text-fg-muted mt-1 line-clamp-2 italic' },
          '"' + item.observacoes + '"'
        ),
      ),
    ));

    const actions = el('div', { class: 'flex gap-1.5 flex-wrap' });
    if (item.status === 'pendente') {
      actions.appendChild(el('button', {
        class: 'btn btn-primary btn-sm flex items-center gap-1.5',
        onclick: () => navigate(`/agenda/${item.id}/realizar`)
      }, icon('mapPin', 14), 'Realizar agora'));
      // Botão sync de calendário (Google/Outlook/.ics)
      actions.appendChild(calendarButton(item, { el, icon, toast }));
      actions.appendChild(el('button', {
        class: 'btn btn-ghost btn-sm',
        onclick: () => navigate(`/agenda/${item.id}/editar`)
      }, icon('edit', 14)));
      actions.appendChild(el('button', {
        class: 'btn btn-ghost btn-sm text-fg-muted',
        onclick: async () => {
          const ok = await confirmModal({ title: 'Cancelar agendamento?', message: 'Você poderá reagendar depois.', confirmLabel: 'Cancelar agendamento' });
          if (!ok) return;
          await supabase.from('agendamentos').update({ status: 'cancelado' }).eq('id', item.id);
          toast('Cancelado', 'info');
          location.reload();
        }
      }, '✕'));
    } else if (item.status === 'realizado' && item.atividade_id) {
      actions.appendChild(el('button', {
        class: 'btn btn-secondary btn-sm flex items-center gap-1.5',
        onclick: () => navigate(`/atividade/${item.atividade_id}`)
      }, icon('fileText', 14), 'Ver atividade'));
    } else if (item.status === 'cancelado' || item.status === 'adiado') {
      actions.appendChild(el('button', {
        class: 'btn btn-secondary btn-sm',
        onclick: async () => {
          await supabase.from('agendamentos').update({ status: 'pendente' }).eq('id', item.id);
          toast('Reagendado', 'success');
          location.reload();
        }
      }, '↻ Reagendar'));
    }
    if (actions.children.length) card.appendChild(actions);
    return card;
  }

  render();
}

// ============================================================
// Agenda do Gestor - calendário consolidado com filtros
// ============================================================
async function agendaGestorView(app) {
  const today = new Date(); today.setHours(0,0,0,0);
  let mode = localStorage.getItem('agenda-mode-gestor') || 'mes';
  let cursor = new Date(today);
  const filters = { gerente: 'todos', tipo: 'todos', status: 'todos' };
  let allItems = [];

  const content = el('div', { class: 'flex flex-col gap-3' });
  content.appendChild(el('div', {},
    el('h1', { class: 'text-2xl font-extrabold' }, 'Agenda da equipe'),
    el('p', { class: 'text-sm text-fg-muted' }, 'Planejamento consolidado de todos os Gerentes'),
  ));

  // Painel de performance da semana (respeita os filtros aplicados)
  const statsBox = el('div', {});
  content.appendChild(statsBox);

  // Filtros
  const filterBar = el('div', { class: 'card p-3 grid grid-cols-3 gap-2' });
  const statusSel = el('select', { class: 'select' },
    el('option', { value: 'todos', selected: true }, 'Todos status'),
    el('option', { value: 'pendente' }, 'Pendentes'),
    el('option', { value: 'realizado' }, 'Realizados'),
    el('option', { value: 'cancelado' }, 'Cancelados'),
  );
  const tipoSel = el('select', { class: 'select' },
    el('option', { value: 'todos' }, 'Todos os tipos'),
    el('option', { value: 'checkin' }, 'Check-ins'),
    el('option', { value: 'atendimento' }, 'Atendimentos'),
    el('option', { value: 'proposta' }, 'Propostas'),
    el('option', { value: 'orulo' }, 'Órulo/DWV'),
    el('option', { value: 'outro' }, 'Outro'),
  );
  const gerenteSel = el('select', { class: 'select' },
    el('option', { value: 'todos' }, 'Todos os gerentes')
  );
  filterBar.append(statusSel, tipoSel, gerenteSel);
  content.appendChild(filterBar);

  // Toolbar de modo + nav
  const toolbar = el('div', { class: 'card p-2 flex flex-col gap-2' });
  content.appendChild(toolbar);

  const cal = el('div', { class: 'flex flex-col gap-3' });
  content.appendChild(cal);

  app.appendChild(shell(content, { title: 'Agenda' }));

  // Carrega gerentes para o filtro
  const { data: gerentes } = await supabase.from('profiles')
    .select('id, nome').eq('role', 'gerente').eq('ativo', true).order('nome');
  (gerentes || []).forEach(g => gerenteSel.appendChild(el('option', { value: g.id }, g.nome)));

  async function reload() {
    cal.innerHTML = '<div class="skeleton h-32"></div>';
    const from = new Date(today.getFullYear(), today.getMonth() - 3, 1);
    const to   = new Date(today.getFullYear(), today.getMonth() + 7, 0); to.setHours(23,59,59);
    let q = supabase
      .from('agendamentos')
      .select('*, profiles!agendamentos_gerente_id_fkey(nome)')
      .gte('data_prevista', from.toISOString())
      .lte('data_prevista', to.toISOString())
      .order('data_prevista', { ascending: true });
    if (filters.status !== 'todos') q = q.eq('status', filters.status);
    if (filters.tipo !== 'todos')   q = q.eq('tipo', filters.tipo);
    if (filters.gerente !== 'todos') q = q.eq('gerente_id', filters.gerente);

    const { data, error } = await q.limit(2000);
    if (error) {
      cal.innerHTML = '';
      cal.appendChild(el('div', { class: 'card p-4 text-danger text-sm' }, 'Erro: ' + error.message));
      return;
    }
    allItems = (data || []).map(i => ({ ...i, gerente_nome: i.profiles?.nome }));
    render();
  }

  function renderToolbar() {
    toolbar.innerHTML = '';
    const modes = el('div', { class: 'flex gap-1.5' });
    [
      { id: 'dia',    label: 'Dia' },
      { id: 'semana', label: 'Semana' },
      { id: 'mes',    label: 'Mês' },
    ].forEach(m => {
      modes.appendChild(el('button', {
        class: 'btn btn-sm flex-1 ' + (mode === m.id ? 'btn-primary' : 'btn-ghost'),
        onclick: () => { mode = m.id; localStorage.setItem('agenda-mode-gestor', m.id); render(); }
      }, m.label));
    });
    toolbar.appendChild(modes);

    const nav = el('div', { class: 'flex items-center gap-2' });
    nav.appendChild(el('button', { class: 'btn btn-ghost btn-sm px-2',
      onclick: () => { shiftCursor(-1); render(); } }, '‹'));
    nav.appendChild(el('div', { class: 'flex-1 text-center font-bold text-sm' }, currentLabel()));
    nav.appendChild(el('button', { class: 'btn btn-ghost btn-sm px-2',
      onclick: () => { shiftCursor(1); render(); } }, '›'));
    nav.appendChild(el('button', { class: 'btn btn-secondary btn-sm text-xs',
      onclick: () => { cursor = new Date(today); render(); } }, 'Hoje'));
    toolbar.appendChild(nav);
  }
  function shiftCursor(dir) {
    if (mode === 'dia')    cursor.setDate(cursor.getDate() + dir);
    if (mode === 'semana') cursor.setDate(cursor.getDate() + 7*dir);
    if (mode === 'mes')    cursor.setMonth(cursor.getMonth() + dir);
  }
  function currentLabel() {
    if (mode === 'dia') {
      return cursor.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
    }
    if (mode === 'semana') {
      const start = startOfWeek(cursor); const end = new Date(start); end.setDate(end.getDate() + 6);
      return `${start.getDate()}/${start.getMonth()+1} – ${end.getDate()}/${end.getMonth()+1}`;
    }
    return `${MONTH_NAMES[cursor.getMonth()]} ${cursor.getFullYear()}`;
  }
  function startOfWeek(d) { const x = new Date(d); x.setHours(0,0,0,0); x.setDate(x.getDate() - x.getDay()); return x; }
  function isSameDay(a, b) { return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate(); }
  function itemsOnDay(d) { return allItems.filter(it => isSameDay(new Date(it.data_prevista), d)); }

  function render() {
    renderWeekStats(statsBox, allItems, today);
    renderToolbar();
    cal.innerHTML = '';
    if (mode === 'dia')    renderDay();
    if (mode === 'semana') renderWeek();
    if (mode === 'mes')    renderMonth();
  }

  function renderDay() {
    const items = itemsOnDay(cursor).sort((a,b) => new Date(a.data_prevista) - new Date(b.data_prevista));
    if (!items.length) { cal.appendChild(emptyMsg('Nada agendado neste dia.')); return; }
    items.forEach(it => cal.appendChild(itemCard(it)));
  }
  function renderWeek() {
    const start = startOfWeek(cursor);
    let any = false;
    for (let i = 0; i < 7; i++) {
      const d = new Date(start); d.setDate(d.getDate() + i);
      const dayItems = itemsOnDay(d);
      const isToday = isSameDay(d, today);
      cal.appendChild(el('div', {
        class: 'flex items-center gap-2 px-2 pt-2 ' + (isToday ? 'text-rottas-500' : 'text-fg'),
      },
        el('span', { class: 'text-xs uppercase font-bold tracking-wider' }, DAY_NAMES[d.getDay()]),
        el('span', { class: 'text-base font-extrabold' }, String(d.getDate())),
        isToday && el('span', { class: 'chip chip-orange text-[10px]' }, 'Hoje'),
        dayItems.length ? el('span', { class: 'ml-auto text-xs text-fg-muted' }, `${dayItems.length} item${dayItems.length!==1?'s':''}`) : null,
      ));
      if (!dayItems.length) {
        cal.appendChild(el('div', { class: 'text-xs text-fg-subtle italic px-2 pb-1' }, 'Sem itens'));
      } else {
        any = true;
        dayItems.forEach(it => cal.appendChild(itemCard(it)));
      }
    }
    if (!any) cal.appendChild(emptyMsg('Sem agendamentos esta semana.'));
  }
  // Estado da seleção (vive entre re-renders)
  let monthSelDate = null;
  function renderMonth() {
    if (!monthSelDate
        || monthSelDate.getMonth() !== cursor.getMonth()
        || monthSelDate.getFullYear() !== cursor.getFullYear()) {
      monthSelDate = isSameDay(cursor, today) ? new Date(today) : new Date(cursor);
    }
    const monthFirst = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const gridStart = new Date(monthFirst); gridStart.setDate(gridStart.getDate() - monthFirst.getDay());
    const grid = el('div', { class: 'card p-2' });
    const head = el('div', { class: 'grid grid-cols-7 gap-1 mb-1' });
    DAY_NAMES.forEach(n => head.appendChild(el('div', {
      class: 'text-center text-[10px] uppercase font-bold tracking-wider text-fg-subtle py-1' }, n)));
    grid.appendChild(head);

    const cells = el('div', { class: 'grid grid-cols-7 gap-1' });
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart); d.setDate(d.getDate() + i);
      const inMonth = d.getMonth() === cursor.getMonth();
      const isToday = isSameDay(d, today);
      const isSel = isSameDay(d, monthSelDate);
      const dayItems = itemsOnDay(d);
      const cell = el('button', {
        type: 'button',
        class: [
          'flex flex-col items-center justify-start gap-0.5 py-1 px-0.5 rounded-lg transition aspect-square min-h-[44px] border-2',
          inMonth ? '' : 'opacity-30',
          isToday ? 'bg-rottas-500 text-white font-bold border-transparent' :
            (isSel ? 'border-rottas-500 bg-rottas-50 dark:bg-rottas-500/10' : 'border-transparent hover:bg-bg-elev'),
        ].join(' '),
        onclick: () => { monthSelDate = new Date(d); render(); },
      },
        el('span', { class: 'text-sm font-bold leading-none' }, String(d.getDate())),
        dayItems.length
          ? el('span', { class: 'text-[10px] mt-0.5 ' + (isToday?'':'text-fg-muted') }, `${dayItems.length}`)
          : el('div', { style: { height: '12px' } }),
      );
      cells.appendChild(cell);
    }
    grid.appendChild(cells);
    cal.appendChild(grid);

    const items = itemsOnDay(monthSelDate).sort((a,b) => new Date(a.data_prevista) - new Date(b.data_prevista));
    const label = isSameDay(monthSelDate, today)
      ? `Hoje, ${monthSelDate.toLocaleDateString('pt-BR', { day:'2-digit', month:'long' })}`
      : monthSelDate.toLocaleDateString('pt-BR', { weekday: 'long', day:'2-digit', month:'long' });
    cal.appendChild(el('h3', { class: 'text-xs font-bold uppercase tracking-wider text-fg-subtle mt-2 px-1' }, label));
    if (!items.length) {
      cal.appendChild(el('div', { class: 'card p-4 text-center text-sm text-fg-muted' }, 'Sem agendamentos para este dia.'));
    } else {
      items.forEach(it => cal.appendChild(itemCard(it)));
    }
  }
  function emptyMsg(msg) {
    return el('div', { class: 'card p-6 text-center text-fg-muted text-sm' }, msg);
  }

  function itemCard(item) {
    const status = STATUS_INFO[item.status] || STATUS_INFO.pendente;
    const tipo = TIPO_ATIVIDADE[item.tipo] || { label: item.tipo };
    const titulo = item.titulo || item.imobiliaria || item.empreendimento || tipo.label;
    return el('div', { class: 'card p-3' },
      el('div', { class: 'flex items-start gap-3' },
        el('div', { class: `activity-icon activity-${item.tipo}` },
          icon(TIPO_ICON[item.tipo] || 'calendar', 18)),
        el('div', { class: 'flex-1 min-w-0' },
          el('div', { class: 'flex items-center gap-2 flex-wrap' },
            el('span', { class: 'font-semibold truncate' }, titulo),
            el('span', { class: `chip ${status.chip}` }, status.icon, ' ', status.label),
            item.remarcada && el('span', { class: 'chip chip-yellow text-[10px]' },
              '↻ Remarcada' + (item.remarcacoes > 1 ? ` ${item.remarcacoes}x` : '')),
          ),
          el('div', { class: 'text-xs text-fg-muted mt-0.5' },
            fmt.time(item.data_prevista), ' · ', tipo.label,
            item.gerente_nome ? ' · 👤 ' + item.gerente_nome : '',
          ),
        ),
        item.atividade_id && el('button', {
          class: 'btn btn-ghost btn-sm',
          onclick: () => navigate(`/atividade/${item.atividade_id}`)
        }, 'Ver'),
      ),
    );
  }

  statusSel.addEventListener('change', () => { filters.status = statusSel.value; reload(); });
  tipoSel.addEventListener('change',   () => { filters.tipo   = tipoSel.value;   reload(); });
  gerenteSel.addEventListener('change',() => { filters.gerente= gerenteSel.value;reload(); });

  await reload();
}
