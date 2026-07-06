// Home do Gerente - KPIs e feed com filtro de período
import { el, icon, fmt } from '../ui.js';
import { state, supabase, getScopedImobiliarias, getScopedGerenteIds } from '../supabase.js';
import { shell } from './shell.js';
import { navigate } from '../router.js';
import { TIPO_ATIVIDADE } from '../config.js';

const PERIOD_KEY = 'home-gerente-periodo';

export async function homeGerenteView(_params, app) {
  const content = el('div', { class: 'flex flex-col gap-5' });
  let periodo = localStorage.getItem(PERIOD_KEY) || 'dia'; // dia | semana | mes | geral

  // Saudação
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const firstName = (state.profile?.nome || '').split(' ')[0] || 'Gerente';

  content.appendChild(el('div', {},
    el('h1', { class: 'text-3xl font-extrabold tracking-tight' },
      `${greeting}, ${firstName} `,
      el('span', { class: 'inline-block animate-pulse-soft' }, '👋'),
    ),
    el('p', { class: 'text-sm text-fg-muted mt-1' },
      new Date().toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' }),
      ' · Vamos às visitas!'
    ),
  ));

  // Filtro de período
  const periodPills = el('div', { class: 'flex gap-1.5' });
  const PERIODS = [
    { id: 'dia',    label: 'Dia' },
    { id: 'semana', label: 'Semana' },
    { id: 'mes',    label: 'Mês' },
    { id: 'geral',  label: 'Geral' },
  ];

  function paintPills() {
    periodPills.innerHTML = '';
    PERIODS.forEach(p => {
      periodPills.appendChild(el('button', {
        class: 'btn btn-sm flex-1 ' + (periodo === p.id ? 'btn-primary' : 'btn-ghost'),
        onclick: () => {
          periodo = p.id;
          localStorage.setItem(PERIOD_KEY, p.id);
          paintPills();
          updateSectionTitle();
          load();
        }
      }, p.label));
    });
  }
  paintPills();
  content.appendChild(periodPills);

  // Título da seção (muda com período)
  const sectionTitle = el('h2', { class: 'text-xs font-bold uppercase text-fg-subtle tracking-wider mb-2' });
  function updateSectionTitle() {
    const labels = { dia: 'Hoje', semana: 'Últimos 7 dias', mes: 'Últimos 30 dias', geral: 'Geral (todos)' };
    sectionTitle.textContent = labels[periodo] || 'Período';
  }
  updateSectionTitle();

  // KPIs
  const kpiGrid = el('div', { class: 'grid grid-cols-2 gap-3' });
  function renderKPIs(counts) {
    kpiGrid.innerHTML = '';
    kpiGrid.append(
      kpiCard('Check-ins', counts.checkin, 'imobiliárias', 'blue', 'mapPin'),
      kpiCard('Atendimentos', counts.atendimento, 'clientes', 'purple', 'users'),
      kpiCard('Propostas', counts.proposta, 'enviadas', 'yellow', 'fileText'),
      kpiCard('Reservas', counts.venda, 'reservadas', 'green', 'trendingUp'),
    );
  }
  renderKPIs({ checkin: 0, atendimento: 0, proposta: 0, venda: 0 });

  content.appendChild(el('section', {}, sectionTitle, kpiGrid));

  // CTAs
  content.appendChild(el('section', {},
    el('h2', { class: 'text-xs font-bold uppercase text-fg-subtle tracking-wider mb-2' }, 'Registrar atividade'),
    el('div', { class: 'grid grid-cols-2 gap-3' },
      el('button', {
        class: 'card p-4 text-left flex flex-col gap-2 hover:border-rottas-300 transition group',
        style: { background: 'linear-gradient(135deg, rgba(242,107,34,0.08), transparent)', borderColor: 'rgba(242,107,34,0.3)' },
        onclick: () => navigate('/registrar'),
      },
        el('div', { class: 'w-10 h-10 rounded-xl gradient-rottas text-white flex items-center justify-center' }, icon('plus', 22)),
        el('div', { class: 'font-bold' }, 'Nova atividade'),
        el('div', { class: 'text-xs text-fg-muted' }, 'Check-in, atendimento…'),
      ),
      el('button', {
        class: 'card p-4 text-left flex flex-col gap-2 hover:border-fg-subtle transition',
        onclick: () => navigate('/historico'),
      },
        el('div', { class: 'w-10 h-10 rounded-xl bg-bg-elev text-fg flex items-center justify-center' }, icon('barChart', 22)),
        el('div', { class: 'font-bold' }, 'Meu funil'),
        el('div', { class: 'text-xs text-fg-muted' }, 'Histórico completo'),
      ),
    ),
  ));

  // Feed
  const feedTitle = el('h2', { class: 'text-xs font-bold uppercase text-fg-subtle tracking-wider mb-2' }, 'Atividades');
  const feedList = el('div', { class: 'flex flex-col gap-2' });
  content.appendChild(el('section', {}, feedTitle, feedList));

  // Alerta de imobiliárias sem visita há mais de 7 dias (do gerente)
  const staleAlertEl = el('div', { class: 'flex flex-col gap-1' });
  content.insertBefore(staleAlertEl, content.children[2] || null); // entre saudação e período

  app.appendChild(shell(content));

  // Busca última visita por imobiliária para o alerta — SCOPED por hierarquia
  // - Gerente: imobs da cidade dele + visitas dele e dos supervisores subordinados
  // - Supervisor: imobs da cidade + suas próprias visitas
  // - Gestor Regional / Superintendente: imobs nas cidades_acesso / estados_acesso
  // - Master / Gestor: tudo
  async function loadStaleAlert() {
    staleAlertEl.innerHTML = '';
    const scopedImobs = getScopedImobiliarias();
    if (!scopedImobs.length) return;

    // IDs de gerentes que esse user pode "ver" (gerente vê dele + supervisores subordinados)
    const allowedIds = await getScopedGerenteIds();

    let q = supabase.from('atividades')
      .select('imobiliaria, created_at')
      .eq('cancelada', false)
      .in('tipo', ['checkin', 'atendimento'])
      .not('imobiliaria', 'is', null)
      .order('created_at', { ascending: false });
    // Se allowedIds é null (master/gestor), não filtra; senão usa IN
    if (allowedIds && allowedIds.size > 0) {
      q = q.in('gerente_id', [...allowedIds]);
    } else if (allowedIds && allowedIds.size === 0) {
      // Sem ninguém no escopo: aborta
      return;
    }
    const { data } = await q;
    if (!data) return;

    const lastByImob = {};
    data.forEach(a => {
      if (!lastByImob[a.imobiliaria]) lastByImob[a.imobiliaria] = new Date(a.created_at);
    });
    // Compara contra a LISTA SCOPED de imobs (não a global)
    const stale = scopedImobs.filter(im => {
      const last = lastByImob[im.nome];
      if (!last) return true; // nunca visitou
      const days = Math.floor((Date.now() - last.getTime()) / 86400000);
      return days >= 7;
    });
    if (!stale.length) return;

    // Banner expansível: clica e mostra TODAS as imobiliárias (e dias desde última visita)
    let expanded = false;
    const summary = el('div', { class: 'text-xs text-fg-muted mt-0.5' });
    const fullList = el('div', { class: 'mt-2 flex flex-col gap-1' });

    function paint() {
      summary.innerHTML = '';
      fullList.innerHTML = '';
      if (!expanded) {
        summary.appendChild(el('span', {
          class: 'block text-rottas-500 font-bold cursor-pointer hover:underline',
        }, `Ver todas as ${stale.length} →`));
      } else {
        summary.appendChild(el('span', { class: 'text-rottas-500 font-bold cursor-pointer hover:underline' },
          '▴ Recolher'));
        stale.forEach(im => {
          const last = lastByImob[im.nome];
          const dayLabel = last
            ? `${Math.floor((Date.now() - last.getTime()) / 86400000)} dias atrás`
            : 'nunca visitou';
          fullList.appendChild(el('div', {
            class: 'flex justify-between items-center px-3 py-2 rounded-lg',
            style: { background: 'rgba(245,158,11,0.08)' },
          },
            el('span', { class: 'font-medium text-sm' }, im.nome),
            el('span', { class: 'text-xs text-warning font-semibold' }, dayLabel),
          ));
        });
      }
    }

    const banner = el('div', {
      class: 'card p-3 cursor-pointer transition hover:bg-warning/5',
      style: { background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' },
      onclick: () => { expanded = !expanded; paint(); },
    },
      el('div', { class: 'flex items-start gap-3' },
        el('span', { class: 'text-2xl flex-shrink-0' }, '⚠️'),
        el('div', { class: 'flex-1 min-w-0' },
          el('div', { class: 'font-bold text-warning text-sm' },
            `${stale.length} imobiliária${stale.length>1?'s':''} sem visita há 1 semana ou mais`),
          summary,
        ),
      ),
      fullList,
    );
    paint();
    staleAlertEl.appendChild(banner);
  }
  loadStaleAlert();

  // Carrega conforme o período
  async function load() {
    feedList.innerHTML = '<div class="skeleton h-16"></div>';
    // Conta as próprias atividades E aquelas em que sou participante (agenda em
    // grupo: um check-in feito por um colega presente também conta pra mim).
    let q = supabase
      .from('atividades')
      .select('*')
      .or(`gerente_id.eq.${state.user.id},participantes.cs.{${state.user.id}}`)
      .eq('cancelada', false)
      .neq('tipo', 'visita')
      .order('created_at', { ascending: false });

    const now = new Date();
    if (periodo === 'dia') {
      const d = new Date(); d.setHours(0,0,0,0);
      q = q.gte('created_at', d.toISOString());
    } else if (periodo === 'semana') {
      const d = new Date(now.getTime() - 7*86400000);
      q = q.gte('created_at', d.toISOString());
    } else if (periodo === 'mes') {
      const d = new Date(now.getTime() - 30*86400000);
      q = q.gte('created_at', d.toISOString());
    }
    // 'geral' = sem filtro de data

    const tPromise = new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout')), 8000));
    let atividades = [], error = null;
    try {
      const result = await Promise.race([q, tPromise]);
      atividades = result.data || [];
      error = result.error;
    } catch (err) { error = err; }

    if (error) {
      feedList.innerHTML = '';
      feedList.appendChild(el('div', { class: 'card p-4 text-sm text-danger' },
        '⚠️ Erro: ' + (error.message || 'rede') + '. ',
        el('button', { class: 'underline text-rottas-500 ml-1', onclick: () => location.reload() }, 'Recarregar'),
      ));
      return;
    }

    const counts = {
      checkin:     atividades.filter(a => a.tipo === 'checkin').length,
      atendimento: atividades.filter(a => a.tipo === 'atendimento').length,
      proposta:    atividades.filter(a => a.tipo === 'proposta').length,
      venda:       atividades.filter(a => a.tipo === 'proposta' && !!a.reserva).length,
    };
    renderKPIs(counts);

    feedList.innerHTML = '';
    feedTitle.textContent = (periodo === 'dia' ? 'Atividades de hoje'
      : periodo === 'semana' ? 'Atividades dos últimos 7 dias'
      : periodo === 'mes' ? 'Atividades dos últimos 30 dias'
      : 'Todas as atividades').toUpperCase();
    if (!atividades.length) {
      feedList.appendChild(el('div', { class: 'card p-6 text-center text-sm text-fg-muted' },
        el('div', { class: 'text-3xl mb-2' }, '🌟'),
        periodo === 'dia' ? 'Nenhuma atividade hoje. Que tal começar com um check-in?' : 'Nenhuma atividade no período selecionado.',
      ));
    } else {
      atividades.slice(0, 12).forEach(a => feedList.appendChild(activityRow(a)));
      if (atividades.length > 12) {
        feedList.appendChild(el('button', {
          class: 'btn btn-ghost w-full mt-2',
          onclick: () => navigate('/historico')
        }, `Ver todas (${atividades.length})`));
      }
    }
  }

  load();
}

function kpiCard(label, value, suffix, color, ic) {
  const colors = {
    blue:   { bg: 'rgba(59,130,246,0.12)',  fg: '#3B82F6' },
    purple: { bg: 'rgba(139,92,246,0.12)',  fg: '#8B5CF6' },
    yellow: { bg: 'rgba(245,158,11,0.12)',  fg: '#F59E0B' },
    green:  { bg: 'rgba(16,185,129,0.12)',  fg: '#10B981' },
  };
  const c = colors[color];
  return el('div', { class: 'card p-3 flex flex-col gap-1' },
    el('div', { class: 'flex items-center gap-2' },
      el('div', {
        class: 'w-7 h-7 rounded-lg flex items-center justify-center',
        style: { background: c.bg, color: c.fg }
      }, icon(ic, 16)),
      el('span', { class: 'text-[10px] font-bold uppercase tracking-wider text-fg-subtle' }, label),
    ),
    el('div', { class: 'text-3xl font-extrabold leading-none mt-1' }, String(value)),
    el('span', {
      class: 'chip mt-1 self-start',
      style: { background: c.bg, color: c.fg }
    }, suffix),
  );
}

function activityRow(a) {
  const t = TIPO_ATIVIDADE[a.tipo];
  const time = fmt.time(a.created_at);
  const numTag = a.numero_sequencial ? `#${a.numero_sequencial} ` : '';
  let title = '';
  let chips = [];
  let meta = '';
  switch (a.tipo) {
    case 'checkin':
      title = a.imobiliaria || '-';
      chips.push({ label: 'Check-in', cls: 'chip-blue' });
      if (a.motivo_visita) meta = a.motivo_visita;
      break;
    case 'atendimento':
      title = a.local_visita || a.produto || '-';
      chips.push({ label: 'Atendimento', cls: 'chip-purple' });
      if (a.cliente) meta = a.cliente;
      if (a.corretor) meta = (meta ? meta+' · ' : '') + a.corretor;
      break;
    case 'proposta':
      title = a.empreendimento || '-';
      chips.push({ label: a.reserva ? 'Reservada' : 'Proposta', cls: a.reserva ? 'chip-green' : 'chip-yellow' });
      if (a.valor) meta = fmt.currency(a.valor);
      if (a.unidade) meta = `Un. ${a.unidade}` + (meta ? ` · ${meta}`:'');
      break;
    case 'orulo':
      title = a.empreendimento || a.imobiliaria || 'Órulo/DWV';
      chips.push({ label: 'Órulo/DWV', cls: 'chip-green' });
      if (a.motivo_contato) meta = a.motivo_contato;
      break;
  }

  return el('button', {
    class: 'card p-3 flex items-start gap-3 text-left hover:border-rottas-300 transition w-full',
    onclick: () => navigate(`/atividade/${a.id}`),
  },
    el('div', { class: `activity-icon activity-${a.tipo}` }, icon(t.icon === '📍' ? 'mapPin' : t.icon === '👥' ? 'users' : t.icon === '📄' ? 'fileText' : 'globe', 18)),
    el('div', { class: 'flex-1 min-w-0' },
      el('div', { class: 'flex items-center justify-between gap-2 mb-1' },
        el('span', { class: 'font-semibold text-sm truncate' }, numTag + title),
        el('span', { class: 'text-xs text-fg-subtle flex-shrink-0' },
          (a.created_at && new Date(a.created_at).toDateString() === new Date().toDateString())
            ? time
            : fmt.dateTime(a.created_at)
        ),
      ),
      el('div', { class: 'flex items-center gap-2 flex-wrap' },
        ...chips.map(c => el('span', { class: `chip ${c.cls}` }, c.label)),
        meta && el('span', { class: 'text-xs text-fg-muted truncate' }, meta),
      ),
      a.observacoes && el('div', { class: 'text-xs text-fg-muted mt-1 line-clamp-2' }, a.observacoes),
    ),
  );
}
