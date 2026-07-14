// Painel do Gestor (Master) - visão consolidada de todos os gerentes
import { el, icon, fmt, toast } from '../ui.js';
import { shell } from './shell.js';
import { state, supabase, getScopedImobiliarias } from '../supabase.js';
import { addImobiliaria } from '../components/form-fields.js';
import { navigate } from '../router.js';
import { TIPO_ATIVIDADE, ESTADOS_BR } from '../config.js';
import { exportAtividadesExcel, exportElementPNG } from '../exports.js';
import { aplicarEdicao, rejeitarEdicao, excluirAtividade, FIELD_LABELS } from '../activity-actions.js';

export async function painelGestorView(_params, app) {
  const filters = {
    periodo: 'mes',
    estado: 'todos',
    cidade: 'todas',
    empreendimento: 'todos',
    imobiliaria: 'todas',
    gerente: 'todos',
    busca: '',
    aba: 'overview', // overview | gerentes | empreendimentos | imobiliarias | feed | ranking
  };

  // Busca dinâmica client-side: bate em qualquer campo do objeto (igual ao Histórico)
  const hay = (o) => {
    const b = (filters.busca || '').trim().toLowerCase();
    return !b || JSON.stringify(o).toLowerCase().includes(b);
  };

  const content = el('div', { class: 'flex flex-col gap-4' });
  app.appendChild(shell(content, { title: 'Painel do Gestor' }));

  // Header card com saudação
  content.appendChild(el('div', {},
    el('h1', { class: 'text-2xl font-extrabold' }, 'Painel do Gestor'),
    el('p', { class: 'text-sm text-fg-muted' },
      new Date().toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long' })
    ),
  ));

  // Tabs
  const tabs = [
    { id: 'overview',       label: 'Visão geral' },
    { id: 'aprovacoes',     label: '⏳ Aprovações' },
    { id: 'gerentes',       label: 'Gerentes' },
    { id: 'empreendimentos',label: 'Empreendimentos' },
    { id: 'imobiliarias',   label: 'Imobiliárias' },
    { id: 'carteira',       label: '🎯 Carteira' },
    { id: 'ranking',        label: 'Ranking' },
    { id: 'feed',           label: 'Feed' },
  ];
  const tabBar = el('div', { class: 'flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1' });
  function renderTabs() {
    tabBar.innerHTML = '';
    tabs.forEach(t => {
      tabBar.appendChild(el('button', {
        class: 'btn btn-sm flex-shrink-0 ' + (filters.aba === t.id ? 'btn-primary' : 'btn-secondary'),
        onclick: () => { filters.aba = t.id; renderAll(); }
      }, t.label));
    });
  }
  content.appendChild(tabBar);

  // Filter bar (collapsable)
  const filterBar = el('div', { class: 'card p-3 grid grid-cols-2 gap-2' });
  const periodoSel = el('select', { class: 'select', 'aria-label': 'Período' },
    el('option', { value: 'hoje' }, 'Hoje'),
    el('option', { value: 'semana' }, 'Últimos 7 dias'),
    el('option', { value: 'mes', selected: true }, 'Últimos 30 dias'),
    el('option', { value: 'tudo' }, 'Tudo'),
  );
  const empSel = el('select', { class: 'select', 'aria-label': 'Empreendimento' }, el('option', { value: 'todos' }, 'Todos empreendimentos'));
  state.empreendimentos.forEach(e => empSel.appendChild(el('option', { value: e.nome }, e.nome)));
  const imobSel = el('select', { class: 'select', 'aria-label': 'Imobiliária' }, el('option', { value: 'todas' }, 'Todas imobiliárias'));
  state.imobiliarias.forEach(i => imobSel.appendChild(el('option', { value: i.nome }, i.nome)));
  const gerSel = el('select', { class: 'select', 'aria-label': 'Gerente' }, el('option', { value: 'todos' }, 'Todos gerentes'));
  const estSel = el('select', { class: 'select', 'aria-label': 'Estado' }, el('option', { value: 'todos' }, 'Todos estados'));
  ESTADOS_BR.forEach(uf => estSel.appendChild(el('option', { value: uf }, uf)));

  filterBar.append(periodoSel, empSel, imobSel, gerSel, estSel);
  content.appendChild(filterBar);

  // Busca dinâmica (filtra o conteúdo de todas as abas)
  const buscaInput = el('input', { class: 'input', type: 'search', placeholder: 'Buscar (gerente, imobiliária, empreendimento, cliente...)' });
  content.appendChild(buscaInput);

  // Container principal
  const dash = el('div', { class: 'flex flex-col gap-4', id: 'gestor-dash' });
  content.appendChild(dash);

  // Carrega gerentes (só quem registra atividades)
  const { data: gerentes } = await supabase.from('profiles')
    .select('*').eq('role', 'gerente').eq('ativo', true).order('nome');
  (gerentes || []).forEach(g => gerSel.appendChild(el('option', { value: g.id }, g.nome)));

  let baseAtividades = [];

  async function reload() {
    const now = new Date();
    let from = null;
    if (filters.periodo === 'hoje') { from = new Date(); from.setHours(0,0,0,0); }
    else if (filters.periodo === 'semana') from = new Date(now.getTime() - 7*86400000);
    else if (filters.periodo === 'mes') from = new Date(now.getTime() - 30*86400000);

    // Exclui tipo='visita' (exclusiva da Recepção Rottas — não aparece no painel)
    let q = supabase.from('atividades').select('*, profiles!atividades_gerente_id_fkey(nome, email, cidade, estado)').eq('cancelada', false).neq('tipo', 'visita').or('teste.is.null,teste.eq.false').order('created_at', { ascending: false });
    if (from) q = q.gte('created_at', from.toISOString());
    if (filters.empreendimento !== 'todos') q = q.or(`empreendimento.eq.${filters.empreendimento},produto.eq.${filters.empreendimento}`);
    if (filters.gerente !== 'todos') q = q.eq('gerente_id', filters.gerente);

    const { data, error } = await q.limit(2000);
    if (error) { toast(error.message, 'error'); return; }
    let filtered = data;
    if (filters.estado !== 'todos') {
      filtered = filtered.filter(a => a.profiles?.estado === filters.estado);
    }
    if (filters.imobiliaria !== 'todas') {
      filtered = filtered.filter(a => a.imobiliaria === filters.imobiliaria);
    }
    baseAtividades = filtered;
    renderAll();
  }

  function renderAll() {
    renderTabs();
    dash.innerHTML = '';
    if (filters.aba === 'overview')        renderOverview();
    if (filters.aba === 'aprovacoes')      renderAprovacoes();
    if (filters.aba === 'gerentes')        renderGerentes();
    if (filters.aba === 'empreendimentos') renderEmpreendimentos();
    if (filters.aba === 'imobiliarias')    renderImobiliarias();
    if (filters.aba === 'carteira')        renderCarteira();
    if (filters.aba === 'ranking')         renderRanking();
    if (filters.aba === 'feed')            renderFeed();
  }

  // Mês corrente no formato YYYY-MM
  function curAnoMes() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  // Gerentes dentro do escopo do usuário (super = estado, regional = cidade)
  function scopedGerentes() {
    const role = state.profile?.role;
    const list = gerentes || [];
    if (role === 'superintendente') {
      const es = Array.isArray(state.profile?.estados_acesso) ? state.profile.estados_acesso : [];
      return list.filter(g => es.includes(g.estado));
    }
    if (role === 'gestor_regional') {
      const cs = Array.isArray(state.profile?.cidades_acesso) ? state.profile.cidades_acesso : [];
      return list.filter(g => cs.includes(g.cidade));
    }
    return list;
  }

  // ===== CARTEIRA (item 5): superintendente define imobiliárias por gerente/mês =====
  function renderCarteira() {
    const gers = scopedGerentes();
    const gSel = el('select', { class: 'select' },
      el('option', { value: '' }, 'Selecione o gerente...'),
      ...gers.map(g => el('option', { value: g.id }, g.nome)),
    );
    const mInput = el('input', { class: 'input', type: 'month', value: curAnoMes() });
    const box = el('div', { class: 'flex flex-col gap-2' });

    dash.append(
      el('div', { class: 'card p-3 flex flex-col gap-2' },
        el('div', { class: 'text-sm font-bold' }, '🎯 Carteira de visitas do mês'),
        el('p', { class: 'text-xs text-fg-muted' }, 'Escolha o gerente e o mês e marque as imobiliárias que ele deve visitar. O alerta de "sem visita" na aba Imobiliárias passa a considerar só essas.'),
        gSel, mInput,
      ),
      box,
    );

    async function load() {
      box.innerHTML = '';
      const gid = gSel.value, ym = mInput.value;
      if (!gid || !ym) { box.appendChild(el('div', { class: 'card p-4 text-center text-sm text-fg-muted' }, 'Selecione o gerente e o mês.')); return; }
      box.appendChild(el('div', { class: 'card p-4 text-center text-sm text-fg-muted' }, 'Carregando...'));
      const { data } = await supabase.from('carteira_visitas').select('imobiliaria_nome').eq('gerente_id', gid).eq('ano_mes', ym);
      const set = new Set((data || []).map(r => r.imobiliaria_nome));
      box.innerHTML = '';
      const search = el('input', { class: 'input flex-1', type: 'search', placeholder: 'Buscar imobiliária (outras cidades)...' });
      const novaBtn = el('button', { class: 'btn btn-secondary btn-sm flex-shrink-0' }, icon('plus', 14), 'Nova');
      const counter = el('div', { class: 'text-xs text-fg-muted' }, `${set.size} imobiliária(s) na carteira`);
      const list = el('div', { class: 'flex flex-col gap-1' });
      // Cidade (praça) do gerente selecionado: por padrão a lista mostra só as
      // imobiliárias dessa cidade. Ao pesquisar, libera TODAS (qualquer regional).
      const gerObj = gers.find(g => g.id === gid);
      const gerCidade = (gerObj?.cidade || '').trim().toLowerCase();
      const hint = el('div', { class: 'text-[11px] text-fg-subtle' },
        gerCidade
          ? `Mostrando imobiliárias de ${gerObj.cidade}. Pesquise pelo nome para incluir de outra praça.`
          : 'Gerente sem cidade cadastrada — pesquise pelo nome para listar imobiliárias.');
      function renderList(f) {
        list.innerHTML = '';
        const ff = (f || '').trim().toLowerCase();
        const all = state.imobiliarias || [];
        // Com busca: todas as imobiliárias (livre). Sem busca: só a cidade do gerente.
        const base = ff
          ? all.filter(im => im.nome.toLowerCase().includes(ff))
          : all.filter(im => gerCidade && (im.cidade || '').trim().toLowerCase() === gerCidade);
        if (!base.length) {
          list.appendChild(el('div', { class: 'card p-3 text-center text-xs text-fg-muted' },
            ff ? 'Nenhuma imobiliária encontrada.'
               : 'Nenhuma imobiliária na cidade do gerente. Pesquise pelo nome para incluir de outra praça.'));
          return;
        }
        base.forEach(im => {
          const cb = el('input', { type: 'checkbox' });
          cb.checked = set.has(im.nome);
          cb.addEventListener('change', async () => {
            cb.disabled = true;
            if (cb.checked) {
              const { error } = await supabase.from('carteira_visitas').insert({ gerente_id: gid, imobiliaria_nome: im.nome, ano_mes: ym, created_by: state.user?.id || null });
              if (error) { toast(error.message, 'error', 5000); cb.checked = false; } else { set.add(im.nome); }
            } else {
              const { error } = await supabase.from('carteira_visitas').delete().eq('gerente_id', gid).eq('imobiliaria_nome', im.nome).eq('ano_mes', ym);
              if (error) { toast(error.message, 'error', 5000); cb.checked = true; } else { set.delete(im.nome); }
            }
            counter.textContent = `${set.size} imobiliária(s) na carteira`;
            cb.disabled = false;
          });
          list.appendChild(el('label', { class: 'card p-2 flex items-center gap-2 cursor-pointer text-sm' },
            cb,
            el('span', { class: 'flex-1' }, im.nome,
              (im.cidade || im.estado) ? el('span', { class: 'text-xs text-fg-muted ml-2' }, '· ' + [im.cidade, im.estado].filter(Boolean).join(' · ')) : null),
          ));
        });
      }
      search.addEventListener('input', () => renderList(search.value));
      // Criar imobiliária nova na hora (ex.: gerente vai visitar uma imob ainda não cadastrada)
      novaBtn.addEventListener('click', async () => {
        try {
          const nova = await addImobiliaria(search.value.trim());
          if (nova?.nome) {
            // já marca na carteira do gerente/mês
            const { error } = await supabase.from('carteira_visitas').insert({ gerente_id: gid, imobiliaria_nome: nova.nome, ano_mes: ym, created_by: state.user?.id || null });
            if (!error) { set.add(nova.nome); counter.textContent = `${set.size} imobiliária(s) na carteira`; }
            search.value = '';
            renderList('');
          }
        } catch (e) { /* cancelado */ }
      });
      box.append(el('div', { class: 'card p-2 flex gap-2 items-center' }, search, novaBtn), hint, counter, list);
      renderList('');
    }
    gSel.addEventListener('change', load);
    mInput.addEventListener('change', load);
    load();
  }

  const fv = (k, v) => (v == null || v === '') ? '—' : (k === 'valor' ? fmt.currencyMillions(v) : Array.isArray(v) ? (v.join(', ') || '—') : String(v));

  function aprovTitulo(p) {
    if (p.tipo === 'proposta') return `${p.empreendimento} · Un. ${p.unidade}`;
    return p.imobiliaria || p.empreendimento || p.local_visita || '-';
  }
  function aprovIcon(p) {
    return el('div', { class: `activity-icon activity-${p.tipo}` },
      icon(p.tipo==='checkin'?'mapPin':p.tipo==='atendimento'?'users':p.tipo==='proposta'?'fileText':'globe', 18));
  }

  async function renderAprovacoes() {
    dash.innerHTML = '<div class="skeleton h-20"></div>';
    const { data: pendentes, error } = await supabase
      .from('atividades')
      .select('*, profiles!atividades_gerente_id_fkey(nome)')
      .or('solicita_exclusao.eq.true,solicita_edicao.eq.true')
      .order('created_at', { ascending: false });
    dash.innerHTML = '';
    if (error) {
      dash.appendChild(el('div', { class: 'card p-4 text-danger text-sm' }, 'Erro: ' + error.message));
      return;
    }
    const all = (pendentes || []).filter(hay);
    if (!all.length) {
      dash.appendChild(el('div', { class: 'card p-8 text-center text-fg-muted' },
        el('div', { class: 'text-4xl mb-2' }, '✅'),
        el('div', { class: 'font-bold' }, 'Tudo em ordem'),
        el('div', { class: 'text-sm mt-1' }, pendentes?.length ? 'Nenhuma aprovação para a busca.' : 'Nenhuma solicitação pendente.'),
      ));
      return;
    }
    const edicoes = all.filter(p => p.solicita_edicao);
    const exclusoes = all.filter(p => p.solicita_exclusao);
    dash.appendChild(el('div', { class: 'card p-3 gradient-rottas-soft text-sm font-semibold' },
      `⏳ ${all.length} solicitação${all.length !== 1 ? 'ões' : ''} aguardando sua aprovação`));

    // ===== EDIÇÕES =====
    if (edicoes.length) {
      dash.appendChild(el('div', { class: 'text-xs font-bold uppercase tracking-wider text-fg-subtle mt-2' }, `✏️ Edições (${edicoes.length})`));
    }
    edicoes.forEach(p => {
      const t = TIPO_ATIVIDADE[p.tipo];
      const dep = p.edicao_pendente || {};
      const keys = Object.keys(dep).filter(k => FIELD_LABELS[k]);
      dash.appendChild(el('div', { class: 'card p-4' },
        el('div', { class: 'flex items-start gap-3 mb-2' },
          aprovIcon(p),
          el('div', { class: 'flex-1 min-w-0' },
            el('div', { class: 'font-semibold' }, aprovTitulo(p)),
            el('div', { class: 'text-xs text-fg-muted' }, t.label, ' · ', p.profiles?.nome ? 'Por: ' + p.profiles.nome : ''),
            el('div', { class: 'text-xs text-warning mt-1' }, '✏️ Edição solicitada ' + fmt.relative(p.edicao_solicitada_em)),
          ),
        ),
        keys.length ? el('div', { class: 'flex flex-col gap-1 mb-3 pt-2 border-t border-border' },
          ...keys.map(k => el('div', { class: 'text-xs' },
            el('span', { class: 'font-semibold' }, FIELD_LABELS[k] + ': '),
            el('span', { class: 'text-fg-muted line-through' }, fv(k, p[k])),
            el('span', { class: 'mx-1' }, '→'),
            el('span', { class: 'font-medium' }, fv(k, dep[k])),
          )),
        ) : el('div', { class: 'text-xs text-fg-muted mb-3' }, 'Sem alterações de campos exibíveis.'),
        el('div', { class: 'flex gap-2' },
          el('button', { class: 'btn btn-secondary btn-sm flex-1', onclick: () => navigate(`/atividade/${p.id}`) }, 'Ver detalhes'),
          el('button', { class: 'btn btn-primary btn-sm', onclick: async () => {
            const r = await aplicarEdicao(p);
            if (!r.ok) { toast(r.error, 'error', 6000); return; }
            toast('✓ Edição aplicada', 'success'); renderAprovacoes();
          } }, '✓ Aprovar'),
          el('button', { class: 'btn btn-ghost btn-sm', onclick: async () => {
            const r = await rejeitarEdicao(p);
            if (!r.ok) { toast(r.error, 'error', 6000); return; }
            toast('Edição rejeitada', 'info'); renderAprovacoes();
          } }, '✕ Rejeitar'),
        ),
      ));
    });

    // ===== EXCLUSÕES =====
    if (exclusoes.length) {
      dash.appendChild(el('div', { class: 'text-xs font-bold uppercase tracking-wider text-fg-subtle mt-2' }, `🗑️ Exclusões (${exclusoes.length})`));
    }
    exclusoes.forEach(p => {
      const t = TIPO_ATIVIDADE[p.tipo];
      dash.appendChild(el('div', { class: 'card p-4' },
        el('div', { class: 'flex items-start gap-3 mb-3' },
          aprovIcon(p),
          el('div', { class: 'flex-1 min-w-0' },
            el('div', { class: 'font-semibold' }, aprovTitulo(p)),
            el('div', { class: 'text-xs text-fg-muted' }, t.label, ' · ', fmt.dateTime(p.created_at), p.profiles?.nome ? ' · Por: ' + p.profiles.nome : ''),
            el('div', { class: 'text-xs text-warning mt-1' }, '⏳ Exclusão solicitada ' + fmt.relative(p.exclusao_solicitada_em)),
          ),
        ),
        el('div', { class: 'flex gap-2' },
          el('button', { class: 'btn btn-secondary btn-sm flex-1', onclick: () => navigate(`/atividade/${p.id}`) }, 'Ver detalhes'),
          el('button', { class: 'btn btn-danger btn-sm', onclick: async () => {
            if (!confirm('Aprovar exclusão? A atividade fica no histórico de exclusões.')) return;
            const r = await excluirAtividade(p);
            if (!r.ok) { toast(r.error, 'error', 6000); return; }
            toast('✓ Excluída (mantida no histórico)', 'success'); renderAprovacoes();
          } }, '✓ Aprovar'),
          el('button', { class: 'btn btn-ghost btn-sm', onclick: async () => {
            const { data, error } = await supabase.from('atividades').update({
              solicita_exclusao: false, exclusao_solicitada_em: null, exclusao_solicitada_por: null
            }).eq('id', p.id).select();
            if (error) { toast(error.message, 'error'); return; }
            if (!data || !data.length) { toast('Sem permissão (fora do seu escopo).', 'error', 6000); return; }
            toast('Rejeitada', 'info'); renderAprovacoes();
          } }, '✕ Rejeitar'),
        ),
      ));
    });
  }

  // Abre o Histórico da equipe já filtrado por tipo (mesmo período do painel)
  function goHist(tipo) {
    try { localStorage.setItem('historico-preset', JSON.stringify({ tipo, periodo: filters.periodo })); } catch (e) {}
    navigate('/historico');
  }

  function renderOverview() {
    const allAtividades = baseAtividades.filter(hay);
    const c = {
      outro:   allAtividades.filter(a => a.tipo === 'outro').length,
      checkin: allAtividades.filter(a => a.tipo === 'checkin').length,
      atend:   allAtividades.filter(a => a.tipo === 'atendimento').length,
      prop:    allAtividades.filter(a => a.tipo === 'proposta').length,
      vendas:  allAtividades.filter(a => a.tipo === 'proposta' && !!a.reserva).length,
      orulo:   allAtividades.filter(a => a.tipo === 'orulo').length,
    };
    const valorVendas = allAtividades
      .filter(a => a.tipo === 'proposta' && a.reserva)
      .reduce((s,a) => s + (parseFloat(a.valor) || 0), 0);
    const valorPropostas = allAtividades
      .filter(a => a.tipo === 'proposta')
      .reduce((s,a) => s + (parseFloat(a.valor) || 0), 0);

    const grid = el('div', { class: 'grid grid-cols-2 gap-3' },
      kpi('Outros', c.outro, 'calendar', '#717784', () => goHist('outro')),
      kpi('Check-ins', c.checkin, 'mapPin', '#3B82F6', () => goHist('checkin')),
      kpi('Atendimentos', c.atend, 'users', '#8B5CF6', () => goHist('atendimento')),
      kpi('Propostas', c.prop, 'fileText', '#F59E0B', () => goHist('proposta')),
      kpi('Reservas', c.vendas, 'trendingUp', '#10B981', () => goHist('proposta')),
      kpi('Órulo/DWV', c.orulo, 'globe', '#10B981', () => goHist('orulo')),
      kpi('VGV propostas', fmt.currencyMillions(valorPropostas), 'dollarSign', '#F26B22', () => goHist('proposta')),
    );

    const vendasCard = el('div', { class: 'card p-4' },
      el('h3', { class: 'text-xs font-bold uppercase tracking-wider text-fg-subtle mb-2' }, 'Reservas (VGV)'),
      el('div', { class: 'text-3xl font-extrabold' }, fmt.currencyMillions(valorVendas)),
      el('div', { class: 'text-sm text-fg-muted mt-1' }, `${c.vendas} reserva${c.vendas !== 1 ? 's' : ''} no período`),
    );

    // "Equipe ativa": gerentes que registraram algo / total de gerentes VISÍVEIS
    // ao escopo do usuário (superintendente = seus estados, regional = cidades).
    const escopoGers = scopedGerentes();
    const escopoIds = new Set(escopoGers.map(g => g.id));
    const totalEscopo = escopoIds.size;
    const ativosEscopo = new Set(
      allAtividades.map(a => a.gerente_id).filter(id => escopoIds.has(id))
    ).size;
    const ativosCard = el('div', { class: 'card p-4' },
      el('h3', { class: 'text-xs font-bold uppercase tracking-wider text-fg-subtle mb-2' }, 'Equipe ativa'),
      el('div', { class: 'text-3xl font-extrabold' },
        ativosEscopo,
        el('span', { class: 'text-base text-fg-muted ml-2 font-normal' }, `de ${totalEscopo}`)
      ),
      el('div', { class: 'text-sm text-fg-muted mt-1' }, 'gerentes registraram atividades'),
    );

    // Funil de vendas (consolidado)
    const funnel = renderFunnelOverview(allAtividades);

    dash.append(
      el('div', { class: 'grid grid-cols-2 gap-3' }, vendasCard, ativosCard),
      grid,
      funnel,
      exportBar(),
    );
  }

  // Funil consolidado para o gestor
  function renderFunnelOverview(data) {
    const visitas = data.filter(a => a.tipo === 'atendimento').length;
    const propostas = data.filter(a => a.tipo === 'proposta').length;
    const vendas = data.filter(a => a.tipo === 'proposta' && a.reserva).length;
    if (!visitas && !propostas && !vendas) {
      return el('div', { class: 'card p-5 text-center text-sm text-fg-muted' },
        '🎯 Funil aparece quando houver atendimentos e propostas no período.'
      );
    }
    const convVP = visitas ? ((propostas / visitas) * 100).toFixed(1) : '0.0';
    const convPV = propostas ? ((vendas / propostas) * 100).toFixed(1) : '0.0';
    const convTotal = visitas ? ((vendas / visitas) * 100).toFixed(1) : '0.0';
    const stages = [
      { label: 'Atendimentos', count: visitas,   color: '#8B5CF6', width: 100 },
      { label: 'Propostas', count: propostas, color: '#F59E0B', width: 68, conv: convVP },
      { label: 'Reservas',  count: vendas,    color: '#10B981', width: 40, conv: convPV },
    ];
    const bars = [];
    stages.forEach((s, i) => {
      if (i > 0) {
        bars.push(el('div', { class: 'flex items-center justify-center gap-2 py-0.5' },
          el('span', { class: 'text-[10px] text-fg-subtle' }, '▼'),
          el('span', { class: 'text-xs font-bold', style: { color: s.color } }, `${s.conv}%`),
        ));
      }
      bars.push(el('div', { style: { width: s.width + '%', margin: '0 auto' } },
        el('div', {
          class: 'text-center py-3 text-white font-bold rounded-xl',
          style: {
            background: `linear-gradient(135deg, ${s.color}, ${s.color}dd)`,
            clipPath: 'polygon(4% 0%, 96% 0%, 100% 100%, 0% 100%)',
          },
        },
          el('div', { class: 'text-xl' }, String(s.count)),
          el('div', { class: 'text-[11px] font-medium opacity-85' }, s.label),
        ),
      ));
    });
    return el('div', { class: 'card p-5' },
      el('div', { class: 'flex items-center justify-between mb-4' },
        el('h3', { class: 'text-sm font-bold uppercase tracking-wider text-fg-subtle' }, 'Funil de Reservas'),
        el('span', { class: 'text-xs text-fg-muted' }, `Conversão total: ${convTotal}%`),
      ),
      el('div', { class: 'flex flex-col' }, ...bars),
    );
  }

  function renderGerentes() {
    const allAtividades = baseAtividades.filter(hay);
    const byGerente = {};
    const nomeDe = (gid, a) => (gerentes || []).find(g => g.id === gid)?.nome
      || (gid === a.gerente_id ? a.profiles?.nome : null) || 'Sem nome';
    allAtividades.forEach(a => {
      // Credita o dono E os participantes (agenda em grupo): o check-in único
      // conta no card de cada gerente presente, sem duplicar no total da empresa.
      const creditos = new Set([a.gerente_id, ...(Array.isArray(a.participantes) ? a.participantes : [])]);
      creditos.forEach(id => {
        if (!id) return;
        if (!byGerente[id]) byGerente[id] = { id, nome: nomeDe(id, a), profile: id === a.gerente_id ? a.profiles : null, checkin:0, atend:0, prop:0, vendas:0, orulo:0, vgv:0 };
        const g = byGerente[id];
        if (a.tipo === 'checkin') g.checkin++;
        if (a.tipo === 'atendimento') g.atend++;
        if (a.tipo === 'proposta') { g.prop++; g.vgv += parseFloat(a.valor) || 0; if (a.reserva) g.vendas++; }
        if (a.tipo === 'orulo') g.orulo++;
      });
    });
    // Inclui gerentes sem atividades (respeitando a busca)
    (gerentes || []).forEach(g => {
      if (!hay(g)) return;
      if (!byGerente[g.id]) byGerente[g.id] = { id: g.id, nome: g.nome, profile: g, checkin:0, atend:0, prop:0, vendas:0, orulo:0, vgv:0 };
    });
    const list = Object.values(byGerente).sort((a,b) => b.atend + b.checkin - (a.atend + a.checkin));

    if (!list.length) {
      dash.appendChild(el('div', { class: 'card p-8 text-center text-fg-muted' }, 'Nenhum gerente cadastrado.'));
      return;
    }

    list.forEach(g => {
      dash.appendChild(el('div', { class: 'card p-4' },
        el('div', { class: 'flex items-center justify-between mb-3' },
          el('div', {},
            el('div', { class: 'font-bold' }, g.nome),
            el('div', { class: 'text-xs text-fg-muted' },
              [g.profile?.cidade, g.profile?.estado].filter(Boolean).join(' · ') || 'Sem localização cadastrada'
            ),
          ),
          el('button', {
            class: 'btn btn-ghost btn-sm',
            onclick: () => { filters.gerente = g.id; gerSel.value = g.id; reload(); }
          }, 'Filtrar'),
        ),
        el('div', { class: 'grid grid-cols-5 gap-2 text-center' },
          miniStat('Check-in', g.checkin, '#3B82F6'),
          miniStat('Atend.', g.atend, '#8B5CF6'),
          miniStat('Prop.', g.prop, '#F59E0B'),
          miniStat('Reservas', g.vendas, '#10B981'),
          miniStat('Órulo/DWV', g.orulo, '#10B981'),
        ),
        g.vgv > 0 && el('div', { class: 'mt-3 pt-3 border-t border-border text-sm' },
          el('span', { class: 'text-fg-muted' }, 'VGV propostas: '),
          el('span', { class: 'font-bold' }, fmt.currencyMillions(g.vgv))
        ),
      ));
    });
    dash.appendChild(exportBar());
  }

  function renderEmpreendimentos() {
    const allAtividades = baseAtividades.filter(hay);
    const byEmp = {};
    allAtividades.forEach(a => {
      const emp = a.empreendimento || a.produto;
      if (!emp) return;
      if (!byEmp[emp]) byEmp[emp] = { nome: emp, atend:0, prop:0, vendas:0, vgv:0, orulo:0 };
      const e = byEmp[emp];
      if (a.tipo === 'atendimento') e.atend++;
      if (a.tipo === 'proposta') { e.prop++; e.vgv += parseFloat(a.valor) || 0; if (a.reserva) e.vendas++; }
      if (a.tipo === 'orulo') e.orulo++;
    });
    const list = Object.values(byEmp).sort((a,b) => b.vgv - a.vgv);
    if (!list.length) {
      dash.appendChild(el('div', { class: 'card p-8 text-center text-fg-muted' }, 'Sem dados de empreendimentos no período.'));
      return;
    }
    list.forEach(e => {
      dash.appendChild(el('div', { class: 'card p-4' },
        el('div', { class: 'font-bold mb-2' }, e.nome),
        el('div', { class: 'grid grid-cols-4 gap-2 text-center' },
          miniStat('Atend.', e.atend, '#8B5CF6'),
          miniStat('Prop.', e.prop, '#F59E0B'),
          miniStat('Reservas', e.vendas, '#10B981'),
          miniStat('Órulo/DWV', e.orulo, '#10B981'),
        ),
        el('div', { class: 'mt-3 pt-3 border-t border-border text-sm' },
          el('span', { class: 'text-fg-muted' }, 'VGV: '),
          el('span', { class: 'font-bold' }, fmt.currencyMillions(e.vgv)),
        ),
      ));
    });
    dash.appendChild(exportBar());
  }

  // ===== IMOBILIARIAS =====
  // Agrupa atividades por imobiliária. Para cada uma:
  //  - mostra checkins, atend, prop, vendas, vgv
  //  - calcula "última visita" (max created_at) e dias desde então
  //  - alerta visual (laranja) quando última visita > 7 dias
  async function renderImobiliarias() {
    const allAtividades = baseAtividades.filter(hay);
    // Carteira do mês: se houver imobiliárias atribuídas, o alerta só considera essas
    const { data: cartData } = await supabase.from('carteira_visitas').select('imobiliaria_nome').eq('ano_mes', curAnoMes());
    const carteiraSet = new Set((cartData || []).map(r => r.imobiliaria_nome));
    const usandoCarteira = carteiraSet.size > 0;
    const byImob = {};
    allAtividades.forEach(a => {
      const nome = a.imobiliaria;
      if (!nome) return;
      if (!byImob[nome]) byImob[nome] = {
        nome, checkin: 0, atend: 0, prop: 0, vendas: 0, vgv: 0, orulo: 0, lastAt: null,
      };
      const x = byImob[nome];
      if (a.tipo === 'checkin') x.checkin++;
      if (a.tipo === 'atendimento') x.atend++;
      if (a.tipo === 'proposta') { x.prop++; x.vgv += parseFloat(a.valor) || 0; if (a.reserva) x.vendas++; }
      if (a.tipo === 'orulo') x.orulo++;
      const at = new Date(a.created_at);
      if (!x.lastAt || at > x.lastAt) x.lastAt = at;
    });
    // Inclui imobiliárias cadastradas SEM atividades no período (pra acender alerta).
    // Com carteira ativa, só injeta as que estão na carteira do mês.
    state.imobiliarias.forEach(im => {
      if (!hay(im)) return;
      if (usandoCarteira && !carteiraSet.has(im.nome)) return;
      if (!byImob[im.nome]) byImob[im.nome] = {
        nome: im.nome, checkin: 0, atend: 0, prop: 0, vendas: 0, vgv: 0, orulo: 0, lastAt: null,
      };
    });

    let list = Object.values(byImob);
    // Com carteira ativa, mostra/alerta só as imobiliárias atribuídas no mês
    if (usandoCarteira) list = list.filter(x => carteiraSet.has(x.nome));
    // Ordena SEMPRE pelas que têm mais atendimentos primeiro.
    // Empate: mais propostas, depois maior VGV, depois nome.
    list.sort((a,b) =>
      (b.atend - a.atend) || (b.prop - a.prop) || (b.vgv - a.vgv) || a.nome.localeCompare(b.nome));

    if (!list.length) {
      dash.appendChild(el('div', { class: 'card p-8 text-center text-fg-muted' },
        usandoCarteira
          ? 'Nenhuma imobiliária na carteira deste mês. Defina a carteira na aba 🎯 Carteira.'
          : 'Cadastre imobiliárias na aba Listas para acompanhar visitas.'));
      return;
    }

    if (usandoCarteira) {
      dash.appendChild(el('div', { class: 'card p-2 text-xs text-fg-muted' },
        '🎯 Mostrando só a carteira do mês. Para alertar sobre outras, ajuste na aba Carteira.'));
    }

    // Banner de alerta consolidado (lista completa visível abaixo nos cards)
    const stale = list.filter(x => !x.lastAt || (Date.now() - x.lastAt.getTime()) >= 7 * 86400000);
    if (stale.length) {
      dash.appendChild(el('div', { class: 'card p-3 flex items-start gap-2', style: { background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' } },
        el('span', { class: 'text-2xl' }, '⚠️'),
        el('div', { class: 'flex-1' },
          el('div', { class: 'font-bold text-warning text-sm' }, `${stale.length} imobiliária${stale.length>1?'s':''} sem visita há 1 semana ou mais`),
          el('div', { class: 'text-xs text-fg-muted mt-0.5' }, 'Listadas no topo abaixo (cards com borda laranja). Considere agendar uma visita.'),
        ),
      ));
    }

    list.forEach(im => {
      const days = im.lastAt ? Math.floor((Date.now() - im.lastAt.getTime()) / 86400000) : null;
      const isStale = days === null || days >= 7;
      const lastLabel = im.lastAt
        ? (days === 0 ? 'hoje' : days === 1 ? 'ontem' : `${days} dias atrás`)
        : 'sem registro no período';

      dash.appendChild(el('div', {
        class: 'card p-4 ' + (isStale ? 'border-2' : ''),
        style: isStale ? { borderColor: 'rgba(245,158,11,0.6)' } : {},
      },
        el('div', { class: 'flex items-center justify-between gap-2 mb-2' },
          el('div', { class: 'font-bold flex items-center gap-2' },
            isStale ? el('span', { class: 'text-warning' }, '⚠️') : null,
            im.nome,
          ),
          el('button', {
            class: 'btn btn-ghost btn-sm',
            onclick: () => { filters.imobiliaria = im.nome; imobSel.value = im.nome; reload(); }
          }, 'Filtrar'),
        ),
        el('div', { class: 'text-xs mb-3 ' + (isStale ? 'text-warning font-semibold' : 'text-fg-muted') },
          'Última visita: ' + lastLabel,
        ),
        el('div', { class: 'grid grid-cols-5 gap-2 text-center' },
          miniStat('Check-in', im.checkin, '#3B82F6'),
          miniStat('Atend.', im.atend, '#8B5CF6'),
          miniStat('Prop.', im.prop, '#F59E0B'),
          miniStat('Reservas', im.vendas, '#10B981'),
          miniStat('Órulo/DWV', im.orulo, '#10B981'),
        ),
        im.vgv > 0 && el('div', { class: 'mt-3 pt-3 border-t border-border text-sm' },
          el('span', { class: 'text-fg-muted' }, 'VGV: '),
          el('span', { class: 'font-bold' }, fmt.currencyMillions(im.vgv)),
        ),
      ));
    });
    dash.appendChild(exportBar());
  }

  function renderRanking() {
    const allAtividades = baseAtividades.filter(hay);
    // Ranking por número de propostas e visitas
    const byGer = {};
    allAtividades.forEach(a => {
      const id = a.gerente_id;
      const name = a.profiles?.nome || '?';
      if (!byGer[id]) byGer[id] = { id, nome: name, prop: 0, atend: 0, vendas: 0, vgv: 0 };
      if (a.tipo === 'atendimento') byGer[id].atend++;
      if (a.tipo === 'proposta') {
        byGer[id].prop++;
        byGer[id].vgv += parseFloat(a.valor) || 0;
        if (a.reserva) byGer[id].vendas++;
      }
    });
    const list = Object.values(byGer);
    const propRanking = [...list].sort((a,b) => b.prop - a.prop).filter(x => x.prop>0);
    const atendRanking = [...list].sort((a,b) => b.atend - a.atend).filter(x => x.atend>0);
    const vgvRanking = [...list].sort((a,b) => b.vgv - a.vgv).filter(x => x.vgv>0);

    function rankingCard(title, list, valueLabel) {
      return el('div', { class: 'card p-4' },
        el('div', { class: 'flex items-center gap-2 mb-3' },
          icon('trophy', 18, 'text-rottas-500'),
          el('h3', { class: 'font-bold' }, title),
        ),
        list.length
          ? el('ol', { class: 'flex flex-col gap-2' },
              ...list.slice(0, 10).map((g, i) => el('li', {
                class: 'flex items-center gap-3 p-2 rounded-lg ' + (i < 3 ? 'gradient-rottas-soft' : '')
              },
                el('span', {
                  class: 'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
                  style: { background: i===0?'#FFD700':i===1?'#C0C0C0':i===2?'#CD7F32':'rgb(var(--bg-elev))', color: i<3?'#000':'rgb(var(--fg))' }
                }, String(i+1)),
                el('span', { class: 'flex-1 text-sm font-semibold truncate' }, g.nome),
                el('span', { class: 'text-sm font-bold' }, valueLabel(g)),
              )),
            )
          : el('p', { class: 'text-sm text-fg-muted text-center py-4' }, 'Sem dados.'),
      );
    }

    // Ranking de imobiliárias por VGV e por número de visitas
    const byImob = {};
    allAtividades.forEach(a => {
      if (!a.imobiliaria) return;
      if (!byImob[a.imobiliaria]) byImob[a.imobiliaria] = { nome: a.imobiliaria, visitas: 0, prop: 0, vendas: 0, vgv: 0 };
      const x = byImob[a.imobiliaria];
      if (a.tipo === 'checkin' || a.tipo === 'atendimento') x.visitas++;
      if (a.tipo === 'proposta') { x.prop++; x.vgv += parseFloat(a.valor) || 0; if (a.reserva) x.vendas++; }
    });
    const imobs = Object.values(byImob);
    const imobVisitasRanking = [...imobs].sort((a,b) => b.visitas - a.visitas).filter(x => x.visitas > 0);
    const imobVgvRanking = [...imobs].sort((a,b) => b.vgv - a.vgv).filter(x => x.vgv > 0);

    dash.append(
      rankingCard('Ranking de Propostas', propRanking, g => `${g.prop}`),
      rankingCard('Ranking de Atendimentos', atendRanking, g => `${g.atend}`),
      rankingCard('Ranking VGV (em propostas)', vgvRanking, g => fmt.currencyMillions(g.vgv)),
      rankingCard('Imobiliárias - Mais visitadas', imobVisitasRanking, x => `${x.visitas} visitas`),
      rankingCard('Imobiliárias - Maior VGV', imobVgvRanking, x => fmt.currencyMillions(x.vgv)),
      exportBar(),
    );
  }

  function renderFeed() {
    const allAtividades = baseAtividades.filter(hay);
    if (!allAtividades.length) {
      dash.appendChild(el('div', { class: 'card p-8 text-center text-fg-muted' }, 'Sem atividades no período.'));
      return;
    }
    const items = el('div', { class: 'flex flex-col gap-2' });
    allAtividades.slice(0, 50).forEach(a => {
      const t = TIPO_ATIVIDADE[a.tipo];
      let title = a.imobiliaria || a.local_visita || a.empreendimento || '-';
      let detail = '';
      if (a.tipo === 'proposta') detail = `Un. ${a.unidade} · ${fmt.currency(a.valor)}`;
      else if (a.tipo === 'atendimento') detail = `${a.cliente} · ${a.corretor}`;
      else if (a.tipo === 'checkin') detail = a.motivo_visita || '';
      else if (a.tipo === 'orulo') detail = a.motivo_contato || '';

      items.appendChild(el('button', {
        class: 'card p-3 flex items-start gap-3 hover:border-rottas-300 transition w-full text-left',
        onclick: () => navigate(`/atividade/${a.id}`),
      },
        el('div', { class: `activity-icon activity-${a.tipo}` },
          icon(a.tipo==='checkin'?'mapPin':a.tipo==='atendimento'?'users':a.tipo==='proposta'?'fileText':'globe', 18)
        ),
        el('div', { class: 'flex-1 min-w-0' },
          el('div', { class: 'flex items-center justify-between gap-2' },
            el('span', { class: 'font-semibold text-sm truncate' }, title),
            el('span', { class: 'text-xs text-fg-subtle flex-shrink-0' }, fmt.relative(a.created_at)),
          ),
          el('div', { class: 'flex items-center gap-1.5 flex-wrap mt-1' },
            el('span', { class: `chip chip-${a.tipo === 'checkin' ? 'blue' : a.tipo === 'atendimento' ? 'purple' : a.tipo === 'proposta' ? (a.reserva ? 'green' : 'yellow') : 'green'}` },
              a.reserva && a.tipo==='proposta' ? 'Reserva' : t.label),
            a.profiles?.nome && el('span', { class: 'chip chip-orange' }, a.profiles.nome),
            detail && el('span', { class: 'text-xs text-fg-muted truncate' }, detail),
          ),
        ),
      ));
    });
    dash.append(items, exportBar());
  }

  function exportBar() {
    return el('div', { class: 'flex gap-2 mt-2' },
      el('button', {
        class: 'btn btn-secondary flex-1 flex items-center justify-center gap-2',
        onclick: async () => {
          const exp = baseAtividades.filter(hay);
          if (!exp.length) return toast('Nada para exportar', 'warning');
          try { await exportAtividadesExcel(exp); toast('Excel exportado!', 'success'); }
          catch (e) { toast(e.message || 'Erro', 'error'); }
        }
      }, icon('download', 16), 'Exportar Excel'),
      el('button', {
        class: 'btn btn-secondary flex-1 flex items-center justify-center gap-2',
        onclick: async () => {
          try { await exportElementPNG(dash, `painel-${new Date().toISOString().slice(0,10)}.png`); toast('PNG salvo!', 'success'); }
          catch (e) { toast(e.message || 'Erro', 'error'); }
        }
      }, icon('camera', 16), 'Exportar PNG'),
    );
  }

  // Listeners
  periodoSel.addEventListener('change', () => { filters.periodo = periodoSel.value; reload(); });
  empSel.addEventListener('change', () => { filters.empreendimento = empSel.value; reload(); });
  imobSel.addEventListener('change', () => { filters.imobiliaria = imobSel.value; reload(); });
  gerSel.addEventListener('change', () => { filters.gerente = gerSel.value; reload(); });
  estSel.addEventListener('change', () => { filters.estado = estSel.value; reload(); });
  let buscaTimer;
  buscaInput.addEventListener('input', () => {
    clearTimeout(buscaTimer);
    buscaTimer = setTimeout(() => { filters.busca = buscaInput.value; renderAll(); }, 250);
  });

  reload();
}

function kpi(label, value, ic, color, onClick) {
  // Card clicável → abre o Histórico filtrado por este tipo
  return el('button', {
    class: 'card p-3 flex flex-col gap-1 text-left w-full hover:border-rottas-300 transition group',
    onclick: onClick || null,
    title: onClick ? `Ver ${label.toLowerCase()}` : null,
  },
    el('div', { class: 'flex items-center gap-2' },
      el('div', {
        class: 'w-7 h-7 rounded-lg flex items-center justify-center',
        style: { background: color + '20', color }
      }, icon(ic, 16)),
      el('span', { class: 'text-[10px] font-bold uppercase tracking-wider text-fg-subtle' }, label),
      onClick ? el('span', { class: 'ml-auto text-fg-subtle group-hover:text-rottas-500 transition' }, icon('chevronRight', 16)) : null,
    ),
    el('div', { class: 'text-2xl font-extrabold leading-tight mt-1' }, String(value)),
  );
}
function miniStat(label, value, color) {
  return el('div', { class: 'flex flex-col items-center gap-0.5 py-2 rounded-lg', style: { background: color + '10' } },
    el('div', { class: 'text-lg font-extrabold', style: { color } }, String(value)),
    el('div', { class: 'text-[9px] uppercase tracking-wider font-bold text-fg-subtle' }, label),
  );
}
