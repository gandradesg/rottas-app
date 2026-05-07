// Histórico de atividades — para o Gerente vê suas próprias, Master vê todas
import { el, icon, fmt, toast } from '../ui.js';
import { shell } from './shell.js';
import { state, supabase } from '../supabase.js';
import { isAdmin, activeViewRole } from '../auth.js';
import { navigate } from '../router.js';
import { TIPO_ATIVIDADE } from '../config.js';
import { exportAtividadesExcel } from '../exports.js';

export async function historicoView(_params, app) {
  const filters = {
    tipo: 'todos',
    periodo: 'mes',
    gerente: 'todos',
    empreendimento: 'todos',
    estado: 'todos',
    busca: '',
  };

  const content = el('div', { class: 'flex flex-col gap-4' });

  // Header com título e ações
  content.appendChild(el('div', { class: 'flex items-center justify-between' },
    el('div', {},
      el('h1', { class: 'text-2xl font-extrabold' }, ( activeViewRole() === "gestor") ? 'Histórico geral' : 'Meu histórico'),
      el('p', { class: 'text-sm text-fg-muted' }, ( activeViewRole() === "gestor") ? 'Todas as atividades da equipe' : 'Suas atividades registradas'),
    ),
  ));

  // Barra de filtros
  const filterBar = el('div', { class: 'card p-3 flex flex-col gap-2' });
  const tipoSel = el('select', { class: 'select' },
    el('option', { value: 'todos' }, 'Todos os tipos'),
    el('option', { value: 'checkin' }, 'Check-ins'),
    el('option', { value: 'atendimento' }, 'Atendimentos'),
    el('option', { value: 'proposta' }, 'Propostas'),
    el('option', { value: 'orulo' }, 'Órulos'),
  );
  const periodoSel = el('select', { class: 'select' },
    el('option', { value: 'hoje' }, 'Hoje'),
    el('option', { value: 'semana' }, 'Últimos 7 dias'),
    el('option', { value: 'mes', selected: true }, 'Últimos 30 dias'),
    el('option', { value: 'tudo' }, 'Tudo'),
  );

  let gerenteSel = null;
  if (( activeViewRole() === "gestor")) {
    gerenteSel = el('select', { class: 'select' }, el('option', { value: 'todos' }, 'Todos os gerentes'));
    // populado depois com profiles
  }

  const buscaInput = el('input', { class: 'input', type: 'search', placeholder: 'Buscar (cliente, imobiliária, observações...)' });

  const filterItems = [
    el('div', { class: 'grid grid-cols-2 gap-2' }, tipoSel, periodoSel),
  ];
  if (gerenteSel) filterItems.push(gerenteSel);
  filterItems.push(buscaInput);
  filterBar.append(...filterItems);
  content.appendChild(filterBar);

  // Botão exportar
  const exportBtn = el('button', {
    class: 'btn btn-secondary flex items-center justify-center gap-2',
    onclick: () => doExport()
  }, icon('download', 16), 'Exportar Excel');
  content.appendChild(exportBtn);

  // Funil de vendas (só para gerente)
  const funnelSection = el('div', {});
  if (activeViewRole() !== 'gestor') content.appendChild(funnelSection);

  const summary = el('div', { class: 'flex items-center justify-between text-xs text-fg-muted' });
  content.appendChild(summary);

  const list = el('div', { class: 'flex flex-col gap-2' });
  content.appendChild(list);

  app.appendChild(shell(content, { title: ( activeViewRole() === "gestor") ? 'Histórico' : 'Meu funil' }));

  // Carrega gerentes (se master)
  if (( activeViewRole() === "gestor")) {
    const { data: gerentes } = await supabase.from('profiles').select('id, nome').eq('role', 'gerente').eq('ativo', true).order('nome');
    (gerentes || []).forEach(g => gerenteSel.appendChild(el('option', { value: g.id }, g.nome)));
  }

  let allData = [];

  async function reload() {
    list.innerHTML = '';
    summary.textContent = 'Carregando...';

    let q = supabase.from('atividades').select('*, profiles!atividades_gerente_id_fkey(nome, email)').eq('cancelada', false).order('created_at', { ascending: false });
    if (!( activeViewRole() === "gestor")) q = q.eq('gerente_id', state.user.id);
    if (( activeViewRole() === "gestor") && filters.gerente !== 'todos') q = q.eq('gerente_id', filters.gerente);
    if (filters.tipo !== 'todos') q = q.eq('tipo', filters.tipo);

    const now = new Date();
    if (filters.periodo === 'hoje') {
      const d = new Date(); d.setHours(0,0,0,0);
      q = q.gte('created_at', d.toISOString());
    } else if (filters.periodo === 'semana') {
      const d = new Date(now.getTime() - 7*24*60*60*1000);
      q = q.gte('created_at', d.toISOString());
    } else if (filters.periodo === 'mes') {
      const d = new Date(now.getTime() - 30*24*60*60*1000);
      q = q.gte('created_at', d.toISOString());
    }

    const { data, error } = await q.limit(500);
    if (error) {
      console.error(error);
      summary.textContent = 'Erro: ' + error.message;
      return;
    }
    let filtered = data;
    if (filters.busca) {
      const b = filters.busca.toLowerCase();
      filtered = filtered.filter(a => JSON.stringify(a).toLowerCase().includes(b));
    }
    allData = filtered;

    // Renderizar funil
    if (activeViewRole() !== 'gestor') renderFunnel(funnelSection, filtered);

    summary.innerHTML = '';
    summary.append(
      el('span', {}, `${filtered.length} atividade${filtered.length !== 1 ? 's' : ''}`),
      el('span', {}, periodoSel.options[periodoSel.selectedIndex].textContent),
    );

    if (!filtered.length) {
      list.appendChild(el('div', { class: 'card p-8 text-center text-sm text-fg-muted' }, 'Nenhuma atividade encontrada com os filtros atuais.'));
      return;
    }
    filtered.forEach(a => list.appendChild(historyRow(a)));
  }

  async function doExport() {
    if (!allData.length) { toast('Nada para exportar', 'warning'); return; }
    try {
      await exportAtividadesExcel(allData);
      toast('Excel exportado!', 'success');
    } catch (err) {
      toast(err.message || 'Erro ao exportar', 'error');
    }
  }

  // Listeners
  tipoSel.addEventListener('change', () => { filters.tipo = tipoSel.value; reload(); });
  periodoSel.addEventListener('change', () => { filters.periodo = periodoSel.value; reload(); });
  if (gerenteSel) gerenteSel.addEventListener('change', () => { filters.gerente = gerenteSel.value; reload(); });
  let searchTimer;
  buscaInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { filters.busca = buscaInput.value; reload(); }, 300);
  });

  reload();
}

function historyRow(a) {
  const gerenteName = a.profiles?.nome || '';
  const t = TIPO_ATIVIDADE[a.tipo];
  const date = fmt.dateTime(a.created_at);
  const numTag = a.numero_sequencial ? `#${a.numero_sequencial} ` : '';
  let title = '';
  let chips = [{ label: t.label, cls: a.tipo === 'checkin' ? 'chip-blue' : a.tipo === 'atendimento' ? 'chip-purple' : a.tipo === 'proposta' ? (a.reserva ? 'chip-green' : 'chip-yellow') : 'chip-green' }];
  let lines = [];

  switch (a.tipo) {
    case 'checkin':
      title = a.imobiliaria;
      if (a.motivo_visita) chips.push({ label: a.motivo_visita, cls: 'chip-orange' });
      break;
    case 'atendimento':
      title = `${a.local_visita} · ${a.cliente}`;
      if (a.termometro) chips.push({ label: a.termometro, cls: a.termometro==='quente'?'chip-red':a.termometro==='morno'?'chip-yellow':'chip-blue' });
      lines.push(`Corretor: ${a.corretor}`);
      if (a.produto) lines.push(`Produto: ${a.produto}`);
      break;
    case 'proposta':
      title = `${a.empreendimento} · Un. ${a.unidade}`;
      lines.push(fmt.currency(a.valor));
      if (a.reserva) chips.push({ label: 'Reserva: ' + a.reserva, cls: 'chip-green' });
      break;
    case 'orulo':
      title = `${a.empreendimento} · ${a.imobiliaria}`;
      if (a.motivo_contato) lines.push(a.motivo_contato);
      break;
  }

  return el('button', {
    class: 'card p-3 text-left hover:border-rottas-300 transition w-full',
    onclick: () => navigate(`/atividade/${a.id}`)
  },
    el('div', { class: 'flex items-start gap-3' },
      el('div', { class: `activity-icon activity-${a.tipo}` },
        icon(a.tipo==='checkin'?'mapPin':a.tipo==='atendimento'?'users':a.tipo==='proposta'?'fileText':'globe', 18)
      ),
      el('div', { class: 'flex-1 min-w-0' },
        el('div', { class: 'flex items-center justify-between gap-2 mb-1' },
          el('span', { class: 'font-semibold text-sm truncate' }, numTag + title),
          el('span', { class: 'text-xs text-fg-subtle flex-shrink-0' }, date),
        ),
        el('div', { class: 'flex items-center gap-1.5 flex-wrap mb-1' },
          ...chips.map(c => el('span', { class: `chip ${c.cls}` }, c.label)),
          gerenteName && el('span', { class: 'chip' }, gerenteName),
        ),
        ...lines.map(l => el('div', { class: 'text-xs text-fg-muted' }, l)),
        a.observacoes && el('div', { class: 'text-xs text-fg-muted mt-1 line-clamp-2 italic' }, '"' + a.observacoes + '"'),
      ),
    ),
  );
}

function renderFunnel(container, data) {
  container.innerHTML = '';
  const visitas = data.filter(a => a.tipo === 'atendimento').length;
  const propostas = data.filter(a => a.tipo === 'proposta').length;
  const vendas = data.filter(a => a.tipo === 'proposta' && a.reserva).length;

  if (!visitas && !propostas && !vendas) return;

  const convVP = visitas ? ((propostas / visitas) * 100).toFixed(1) : '0.0';
  const convPV = propostas ? ((vendas / propostas) * 100).toFixed(1) : '0.0';
  const convTotal = visitas ? ((vendas / visitas) * 100).toFixed(1) : '0.0';

  const stages = [
    { label: 'Visitas', sub: 'atendimentos', count: visitas, color: '#F26B22', width: 100 },
    { label: 'Propostas', sub: 'enviadas', count: propostas, color: '#F59E0B', width: 68, conv: convVP },
    { label: 'Vendas', sub: 'com reserva', count: vendas, color: '#10B981', width: 40, conv: convPV },
  ];

  const funnelBars = [];
  stages.forEach((s, i) => {
    if (i > 0) {
      funnelBars.push(el('div', { class: 'flex items-center justify-center gap-2 py-0.5' },
        el('span', { class: 'text-[10px] text-fg-subtle' }, '▼'),
        el('span', { class: 'text-xs font-bold', style: { color: s.color } }, `${s.conv}%`),
      ));
    }
    funnelBars.push(el('div', { style: { width: s.width + '%', margin: '0 auto' } },
      el('div', {
        class: 'text-center py-3 text-white font-bold rounded-xl',
        style: {
          background: `linear-gradient(135deg, ${s.color}, ${s.color}dd)`,
          clipPath: 'polygon(4% 0%, 96% 0%, 100% 100%, 0% 100%)',
        }
      },
        el('div', { class: 'text-xl' }, String(s.count)),
        el('div', { class: 'text-[11px] font-medium opacity-85' }, s.label),
      ),
    ));
  });

  container.appendChild(el('div', { class: 'card p-5' },
    el('div', { class: 'flex items-center justify-between mb-4' },
      el('h3', { class: 'text-sm font-bold uppercase tracking-wider text-fg-subtle' }, 'Funil de Vendas'),
      el('span', { class: 'text-xs text-fg-muted' }, `Conversão total: ${convTotal}%`),
    ),
    el('div', { class: 'flex flex-col' }, ...funnelBars),
  ));
}
