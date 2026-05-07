// Home do Gerente — visão consolidada do dia
import { el, icon, fmt } from '../ui.js';
import { state } from '../supabase.js';
import { supabase } from '../supabase.js';
import { shell } from './shell.js';
import { navigate } from '../router.js';
import { TIPO_ATIVIDADE } from '../config.js';

export async function homeGerenteView(_params, app) {
  const content = el('div', { class: 'flex flex-col gap-5' });

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

  // KPIs do dia — mostra 0s imediatamente, atualiza quando dados chegam
  const kpiGrid = el('div', { class: 'grid grid-cols-2 gap-3' });
  function renderKPIs(counts) {
    kpiGrid.innerHTML = '';
    kpiGrid.append(
      kpiCard('Check-ins', counts.checkin, 'imobiliárias', 'blue', 'mapPin'),
      kpiCard('Visitas', counts.atendimento, 'clientes', 'purple', 'users'),
      kpiCard('Propostas', counts.proposta, 'enviadas', 'yellow', 'fileText'),
      kpiCard('Vendas', counts.venda, 'fechadas', 'green', 'trendingUp'),
    );
  }
  renderKPIs({ checkin: 0, atendimento: 0, proposta: 0, venda: 0 });

  content.appendChild(el('section', {},
    el('h2', { class: 'text-xs font-bold uppercase text-fg-subtle tracking-wider mb-2' }, 'Hoje'),
    kpiGrid,
  ));

  // CTA: Registrar atividade
  const ctaSection = el('section', {},
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
  );
  content.appendChild(ctaSection);

  // Atividades de hoje (placeholder)
  const feedSection = el('section', {},
    el('h2', { class: 'text-xs font-bold uppercase text-fg-subtle tracking-wider mb-2' }, 'Atividades de hoje'),
  );
  const feedList = el('div', { class: 'flex flex-col gap-2' });
  feedSection.appendChild(feedList);
  content.appendChild(feedSection);

  app.appendChild(shell(content));

  // Carrega dados em background (não bloqueia render)
  console.log('[home] carregando atividades de hoje...');
  const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
  const queryPromise = supabase
    .from('atividades')
    .select('*')
    .eq('gerente_id', state.user.id)
    .eq('cancelada', false)
    .gte('created_at', startOfDay.toISOString())
    .order('created_at', { ascending: false });
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Timeout (6s)')), 6000)
  );
  let atividades = [], error = null;
  try {
    const result = await Promise.race([queryPromise, timeoutPromise]);
    atividades = result.data || [];
    error = result.error;
  } catch (err) {
    error = err;
  }
  console.log('[home] resposta:', { count: atividades?.length, error });

  if (error) {
    console.error(error);
    feedList.appendChild(el('div', { class: 'card p-4 text-sm text-danger' },
      '⚠️ Erro ao carregar: ' + (error.message || 'falha de rede') + '. ',
      el('button', {
        class: 'underline text-rottas-500 ml-1',
        onclick: () => location.reload()
      }, 'Recarregar')
    ));
    return;
  }

  // KPIs
  const counts = {
    checkin:     atividades.filter(a => a.tipo === 'checkin').length,
    atendimento: atividades.filter(a => a.tipo === 'atendimento').length,
    proposta:    atividades.filter(a => a.tipo === 'proposta').length,
    venda:       atividades.filter(a => a.tipo === 'proposta' && !!a.reserva).length,
  };

  renderKPIs(counts);

  // Feed
  if (!atividades.length) {
    feedList.appendChild(el('div', { class: 'card p-6 text-center text-sm text-fg-muted' },
      el('div', { class: 'text-3xl mb-2' }, '🌟'),
      'Nenhuma atividade hoje. Que tal começar com um check-in?'
    ));
  } else {
    atividades.slice(0, 8).forEach(a => feedList.appendChild(activityRow(a)));
    if (atividades.length > 8) {
      feedList.appendChild(el('button', {
        class: 'btn btn-ghost w-full mt-2',
        onclick: () => navigate('/historico')
      }, `Ver todas (${atividades.length})`));
    }
  }
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
  let title = '';
  let chips = [];
  let meta = '';
  switch (a.tipo) {
    case 'checkin':
      title = a.imobiliaria || '—';
      chips.push({ label: 'Check-in', cls: 'chip-blue' });
      if (a.motivo_visita) meta = a.motivo_visita;
      break;
    case 'atendimento':
      title = a.local_visita || a.produto || '—';
      chips.push({ label: 'Visita', cls: 'chip-purple' });
      if (a.cliente) meta = a.cliente;
      if (a.corretor) meta = (meta ? meta+' · ' : '') + a.corretor;
      break;
    case 'proposta':
      title = a.empreendimento || '—';
      chips.push({ label: a.reserva ? 'Venda' : 'Proposta', cls: a.reserva ? 'chip-green' : 'chip-yellow' });
      if (a.valor) meta = fmt.currency(a.valor);
      if (a.unidade) meta = `Un. ${a.unidade}` + (meta ? ` · ${meta}`:'');
      break;
    case 'orulo':
      title = a.empreendimento || a.imobiliaria || 'Órulo';
      chips.push({ label: 'Órulo', cls: 'chip-green' });
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
        el('span', { class: 'font-semibold text-sm truncate' }, title),
        el('span', { class: 'text-xs text-fg-subtle flex-shrink-0' }, time),
      ),
      el('div', { class: 'flex items-center gap-2 flex-wrap' },
        ...chips.map(c => el('span', { class: `chip ${c.cls}` }, c.label)),
        meta && el('span', { class: 'text-xs text-fg-muted truncate' }, meta),
      ),
      a.observacoes && el('div', { class: 'text-xs text-fg-muted mt-1 line-clamp-2' }, a.observacoes),
    ),
  );
}
