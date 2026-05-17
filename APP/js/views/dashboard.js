// Dashboard Analítico - KPIs, Rankings, Gráficos, AI Chat
import { el, icon, toast } from '../ui.js';
import { shell } from './shell.js';
import { supabase, state } from '../supabase.js';
import { isMaster, isGestor, activeViewRole } from '../auth.js';
import { ESTADOS_BR } from '../config.js';

// ─── Chart.js lazy loader ────────────────────────────────────────────────────
let _chartPromise = null;
async function loadChartJS() {
  if (window.Chart) return;
  if (_chartPromise) return _chartPromise;
  _chartPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
    s.onload = resolve;
    s.onerror = () => { _chartPromise = null; reject(new Error('Chart.js CDN falhou')); };
    document.head.appendChild(s);
  });
  return _chartPromise;
}

// ─── Helpers de período ────────────────────────────────────────────────────
function periodRange(p) {
  const now = new Date();
  const endOfToday = new Date(now); endOfToday.setHours(23, 59, 59, 999);
  let start, prevStart, prevEnd;
  if (p === 'hoje') {
    start = new Date(now); start.setHours(0, 0, 0, 0);
    prevStart = new Date(start.getTime() - 86400000);
    prevEnd   = new Date(start.getTime() - 1);
  } else if (p === 'semana') {
    start = new Date(now.getTime() - 6 * 86400000); start.setHours(0, 0, 0, 0);
    prevStart = new Date(start.getTime() - 7 * 86400000);
    prevEnd   = new Date(start.getTime() - 1);
  } else if (p === 'mes') {
    start = new Date(now.getTime() - 29 * 86400000); start.setHours(0, 0, 0, 0);
    prevStart = new Date(start.getTime() - 30 * 86400000);
    prevEnd   = new Date(start.getTime() - 1);
  } else if (p === 'trimestre') {
    start = new Date(now.getTime() - 89 * 86400000); start.setHours(0, 0, 0, 0);
    prevStart = new Date(start.getTime() - 90 * 86400000);
    prevEnd   = new Date(start.getTime() - 1);
  } else { // tudo
    start = null; prevStart = null; prevEnd = null;
  }
  return { start, end: endOfToday, prevStart, prevEnd };
}

const PERIODO_LABELS = {
  hoje: 'Hoje', semana: 'Últimos 7 dias', mes: 'Últimos 30 dias',
  trimestre: 'Últimos 90 dias', tudo: 'Todo período',
};

function fmtVGV(v) {
  if (!v) return 'R$ 0';
  if (v >= 1e6) return `R$ ${(v / 1e6).toFixed(1).replace('.', ',')} mi`;
  if (v >= 1e3) return `R$ ${(v / 1e3).toFixed(0)} mil`;
  return `R$ ${v.toLocaleString('pt-BR')}`;
}

function paceClass(pace) {
  if (pace === null || pace === undefined) return 'text-fg-muted';
  if (pace >= 100) return 'text-green-500';
  if (pace >= 80)  return 'text-yellow-500';
  return 'text-red-500';
}

function paceArrow(pace) {
  if (pace === null || pace === undefined) return '';
  if (pace >= 100) return ' ↑';
  if (pace >= 80)  return ' →';
  return ' ↓';
}

// ─── View principal ───────────────────────────────────────────────────────────
export async function dashboardView(_params, app) {
  const role = state.profile?.role;
  const isField = ['gerente', 'supervisor'].includes(role);
  const isSuperint = role === 'superintendente';
  const isGestReg  = role === 'gestor_regional';

  // Filtros — persiste em sessão para manter ao navegar
  const f = {
    periodo:       sessionStorage.getItem('dash-periodo')  || 'mes',
    estado:        sessionStorage.getItem('dash-estado')   || 'todos',
    cidade:        sessionStorage.getItem('dash-cidade')   || 'todas',
    empreend:      sessionStorage.getItem('dash-emp')      || 'todos',
    gerente:       sessionStorage.getItem('dash-gerente')  || 'todos',
    rankAba:       'gerente',
  };
  function saveF() {
    sessionStorage.setItem('dash-periodo', f.periodo);
    sessionStorage.setItem('dash-estado',  f.estado);
    sessionStorage.setItem('dash-cidade',  f.cidade);
    sessionStorage.setItem('dash-emp',     f.empreend);
    sessionStorage.setItem('dash-gerente', f.gerente);
  }

  // Para gerentes/supervisores, fixa o filtro no próprio usuário
  if (isField) { f.gerente = state.user.id; }

  // ── Elementos da UI ────────────────────────────────────────────────────────
  const statusEl  = el('p',   { class: 'text-xs text-fg-muted' });
  const kpiGrid   = el('div', { class: 'grid grid-cols-2 gap-3' });
  const chartBox  = el('div', { class: 'card p-4 flex flex-col gap-2' });
  const funnelBox = el('div', { class: 'card p-4 flex flex-col gap-2' });
  const rankBox   = el('div', { class: 'card p-3 flex flex-col gap-3' });
  const histBox   = el('div', { class: 'card p-3 flex flex-col gap-2' });
  const aiBox     = el('div', { class: 'card p-4 flex flex-col gap-3' });

  const refreshBtn = el('button', {
    class: 'btn btn-sm btn-secondary flex items-center gap-1.5',
    onclick: () => reload(),
  }, '🔄 Atualizar agora');

  // ── Filter bar ─────────────────────────────────────────────────────────────
  const cidSel = el('select', { class: 'select text-sm',
    onchange: e => { f.cidade = e.target.value; saveF(); reload(); } });
  cidSel.appendChild(el('option', { value: 'todas' }, 'Todas cidades'));

  const estSel = el('select', { class: 'select text-sm',
    onchange: async e => {
      f.estado = e.target.value; f.cidade = 'todas'; saveF();
      cidSel.innerHTML = '';
      cidSel.appendChild(el('option', { value: 'todas' }, 'Todas cidades'));
      if (f.estado !== 'todos') {
        const cids = await loadCidades(f.estado);
        cids.forEach(c => cidSel.appendChild(el('option', { value: c }, c)));
      }
      reload();
    } });
  estSel.appendChild(el('option', { value: 'todos' }, 'Todos estados'));

  // Restringe estados para superintendente
  const estadosOpts = (isSuperint && state.profile?.estados_acesso?.length)
    ? state.profile.estados_acesso
    : ESTADOS_BR;
  estadosOpts.forEach(uf =>
    estSel.appendChild(el('option', { value: uf, ...(f.estado === uf ? { selected: true } : {}) }, uf)));

  const empSel = el('select', { class: 'select text-sm',
    onchange: e => { f.empreend = e.target.value; saveF(); reload(); } });
  empSel.appendChild(el('option', { value: 'todos' }, 'Todos empreend.'));
  state.empreendimentos.forEach(e2 =>
    empSel.appendChild(el('option', { value: e2.nome, ...(f.empreend === e2.nome ? { selected: true } : {}) }, e2.nome)));

  const gerSel = el('select', { class: 'select text-sm',
    onchange: e => { f.gerente = e.target.value; saveF(); reload(); } });
  gerSel.appendChild(el('option', { value: 'todos' }, 'Todos gerentes'));

  // Carrega gerentes em paralelo
  (async () => {
    const { data } = await supabase.from('profiles')
      .select('id, nome').in('role', ['gerente', 'supervisor']).eq('ativo', true).order('nome');
    (data || []).forEach(g =>
      gerSel.appendChild(el('option', { value: g.id, ...(f.gerente === g.id ? { selected: true } : {}) }, g.nome)));
  })();

  const periodoSel = el('select', { class: 'select text-sm',
    onchange: e => { f.periodo = e.target.value; saveF(); reload(); } });
  [['hoje','Hoje'], ['semana','7 dias'], ['mes','30 dias'], ['trimestre','90 dias'], ['tudo','Tudo']].forEach(([v, l]) =>
    periodoSel.appendChild(el('option', { value: v, ...(f.periodo === v ? { selected: true } : {}) }, l)));

  const filterBar = el('div', { class: 'card p-3 grid grid-cols-2 gap-2' },
    periodoSel, estSel, cidSel, empSel,
    ...(isField ? [] : [gerSel]),
  );

  // Layout montado
  const content = el('div', { class: 'flex flex-col gap-4' },
    el('div', { class: 'flex items-center justify-between gap-2' },
      el('div', {},
        el('h1', { class: 'text-xl font-extrabold' }, 'Dashboard Analítico'),
        statusEl,
      ),
      refreshBtn,
    ),
    filterBar,
    kpiGrid,
    chartBox,
    funnelBox,
    rankBox,
    histBox,
    aiBox,
  );

  app.appendChild(shell(content, { title: 'Dashboard' }));

  // Pré-carrega Chart.js em background
  loadChartJS().catch(() => {});

  // ── Cidades dinâmicas ──────────────────────────────────────────────────────
  async function loadCidades(estado) {
    const { data } = await supabase.from('profiles')
      .select('cidade').eq('ativo', true).not('cidade', 'is', null);
    const set = new Set((data || []).map(r => r.cidade).filter(Boolean));
    if (isGestReg && state.profile?.cidades_acesso?.length) {
      return [...set].filter(c => state.profile.cidades_acesso.includes(c)).sort();
    }
    return [...set].sort();
  }

  // ── Fetch activities ───────────────────────────────────────────────────────
  async function fetchAtividades(start, end) {
    let q = supabase.from('atividades')
      .select('id, tipo, valor, reserva, cancelada, created_at, gerente_id, imobiliaria, produto, empreendimento, profiles!atividades_gerente_id_fkey(nome, cidade, estado)')
      .eq('cancelada', false)
      .order('created_at', { ascending: false })
      .limit(3000);
    if (start) q = q.gte('created_at', start.toISOString());
    if (end)   q = q.lte('created_at', end.toISOString());
    if (f.gerente !== 'todos') q = q.eq('gerente_id', f.gerente);
    if (f.empreend !== 'todos') q = q.or(`empreendimento.eq.${f.empreend},produto.eq.${f.empreend}`);

    const { data, error } = await q;
    if (error) throw error;

    let rows = data || [];
    if (f.estado !== 'todos') rows = rows.filter(r => r.profiles?.estado === f.estado);
    if (f.cidade !== 'todas') rows = rows.filter(r => r.profiles?.cidade === f.cidade);
    return rows;
  }

  // ── Calcula KPIs ───────────────────────────────────────────────────────────
  function calcKPIs(curr, prev) {
    const sub = (arr, t) => arr.filter(r => r.tipo === t);
    const vgv = arr => arr.reduce((s, r) => s + (parseFloat(r.valor) || 0), 0);

    const cProps  = sub(curr, 'proposta');
    const cVendas = cProps.filter(r => r.reserva != null && r.reserva !== '');
    const cVisits = sub(curr, 'checkin').length + sub(curr, 'atendimento').length;
    const cAtend  = sub(curr, 'atendimento').length;

    const pProps  = sub(prev, 'proposta').length;
    const pVisits = sub(prev, 'checkin').length + sub(prev, 'atendimento').length;

    const convAP = cAtend > 0 ? cProps.length / cAtend * 100 : 0;
    const convPV = cProps.length > 0 ? cVendas.length / cProps.length * 100 : 0;
    const paceV  = pVisits > 0 ? cVisits / pVisits * 100 : null;
    const paceP  = pProps  > 0 ? cProps.length / pProps * 100 : null;

    return {
      vgvVendas:    vgv(cVendas),
      vgvPropostas: vgv(cProps),
      convAtendProp: convAP,
      convPropVenda: convPV,
      paceVisitas:   paceV,
      pacePropostas: paceP,
      // contagens para funil / gráfico
      visitas: cVisits, checkins: sub(curr, 'checkin').length, atendimentos: cAtend,
      propostas: cProps.length, vendas: cVendas.length,
      prevVisitas: pVisits, prevPropostas: pProps,
    };
  }

  // ── KPI Cards ──────────────────────────────────────────────────────────────
  function renderKPIs(kpis) {
    kpiGrid.innerHTML = '';
    const cards = [
      { label: 'VGV Vendas',       value: fmtVGV(kpis.vgvVendas),
        sub: `${kpis.vendas} venda${kpis.vendas !== 1 ? 's' : ''}`,      cls: 'text-green-500', ic: '💰' },
      { label: 'VGV Propostas',    value: fmtVGV(kpis.vgvPropostas),
        sub: `${kpis.propostas} proposta${kpis.propostas !== 1 ? 's' : ''}`, cls: 'text-blue-500',  ic: '📄' },
      { label: 'Conv. Atend→Prop', value: kpis.convAtendProp.toFixed(1).replace('.', ',') + '%',
        sub: `${kpis.propostas} / ${kpis.atendimentos} atend.`,           cls: 'text-purple-500', ic: '🔄' },
      { label: 'Conv. Prop→Venda', value: kpis.convPropVenda.toFixed(1).replace('.', ',') + '%',
        sub: `${kpis.vendas} / ${kpis.propostas} prop.`,                  cls: 'text-orange-500', ic: '🏆' },
      { label: 'Pace Visitas',
        value: kpis.paceVisitas !== null ? kpis.paceVisitas.toFixed(0) + '%' + paceArrow(kpis.paceVisitas) : 'N/D',
        sub: `${kpis.visitas} vs ${kpis.prevVisitas} ant.`,
        cls: paceClass(kpis.paceVisitas), ic: '📍' },
      { label: 'Pace Propostas',
        value: kpis.pacePropostas !== null ? kpis.pacePropostas.toFixed(0) + '%' + paceArrow(kpis.pacePropostas) : 'N/D',
        sub: `${kpis.propostas} vs ${kpis.prevPropostas} ant.`,
        cls: paceClass(kpis.pacePropostas), ic: '📊' },
    ];
    cards.forEach(c => kpiGrid.appendChild(
      el('div', { class: 'card p-3 flex flex-col gap-1' },
        el('span', { class: 'text-xs text-fg-muted' }, c.ic + ' ' + c.label),
        el('div', { class: 'text-xl font-extrabold leading-tight ' + c.cls }, c.value),
        el('div', { class: 'text-xs text-fg-muted' }, c.sub),
      )
    ));
  }

  // ── Gráfico de linha ───────────────────────────────────────────────────────
  let _lineChart = null;
  async function renderLineChart(curr) {
    chartBox.innerHTML = '';
    chartBox.appendChild(el('h2', { class: 'text-sm font-bold' }, 'Visitas por dia'));
    await loadChartJS();

    const map = {};
    curr.forEach(r => {
      if (!['checkin', 'atendimento'].includes(r.tipo)) return;
      const d = r.created_at.slice(0, 10);
      map[d] = (map[d] || 0) + 1;
    });
    const entries = Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
    const labels = entries.map(([d]) => { const [, m, dd] = d.split('-'); return `${dd}/${m}`; });
    const values = entries.map(([, v]) => v);

    if (_lineChart) { _lineChart.destroy(); _lineChart = null; }
    const canvas = el('canvas', { style: { maxHeight: '190px' } });
    chartBox.appendChild(canvas);

    const isDark = document.documentElement.classList.contains('dark');
    const gridColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
    const tickColor = isDark ? '#94a3b8' : '#64748b';

    _lineChart = new window.Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{ label: 'Visitas', data: values,
          borderColor: '#F26B22', backgroundColor: 'rgba(242,107,34,0.12)',
          tension: 0.4, fill: true, pointRadius: values.length > 20 ? 0 : 3 }],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: gridColor }, ticks: { maxTicksLimit: 8, color: tickColor, font: { size: 10 } } },
          y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 10 } } },
        },
      },
    });
  }

  // ── Funil de conversão ─────────────────────────────────────────────────────
  let _funnelChart = null;
  async function renderFunnel(kpis) {
    funnelBox.innerHTML = '';
    funnelBox.appendChild(el('h2', { class: 'text-sm font-bold' }, 'Funil de Conversão'));
    await loadChartJS();

    if (_funnelChart) { _funnelChart.destroy(); _funnelChart = null; }
    const canvas = el('canvas', { style: { maxHeight: '170px' } });
    funnelBox.appendChild(canvas);

    const isDark = document.documentElement.classList.contains('dark');
    const tickColor = isDark ? '#94a3b8' : '#64748b';

    _funnelChart = new window.Chart(canvas, {
      type: 'bar',
      data: {
        labels: ['Visitas', 'Propostas', 'Vendas'],
        datasets: [{ data: [kpis.visitas, kpis.propostas, kpis.vendas],
          backgroundColor: ['rgba(59,130,246,0.80)', 'rgba(168,85,247,0.80)', 'rgba(34,197,94,0.85)'],
          borderRadius: 6 }],
      },
      options: {
        indexAxis: 'y', responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, ticks: { color: tickColor, font: { size: 10 } } },
          y: { ticks: { color: tickColor, font: { size: 11, weight: 'bold' } } },
        },
      },
    });
  }

  // ── Rankings ───────────────────────────────────────────────────────────────
  function buildRanking(curr, aba) {
    const map = {};
    curr.forEach(r => {
      let key;
      if      (aba === 'estado')  key = r.profiles?.estado      || 'N/D';
      else if (aba === 'cidade')  key = r.profiles?.cidade       || 'N/D';
      else if (aba === 'emp')     key = r.empreendimento || r.produto || 'N/D';
      else if (aba === 'gerente') key = r.profiles?.nome         || 'N/D';
      else if (aba === 'imob')    key = r.imobiliaria            || 'N/D';
      if (!key || key === 'N/D') return;
      if (!map[key]) map[key] = { visitas: 0, propostas: 0, vendas: 0, vgv: 0 };
      if (['checkin', 'atendimento'].includes(r.tipo)) map[key].visitas++;
      if (r.tipo === 'proposta') {
        map[key].propostas++;
        map[key].vgv += parseFloat(r.valor) || 0;
        if (r.reserva) map[key].vendas++;
      }
    });
    return Object.entries(map)
      .map(([nome, v]) => ({ nome, ...v }))
      .sort((a, b) => b.vgv - a.vgv || b.visitas - a.visitas);
  }

  function renderRankings(curr) {
    rankBox.innerHTML = '';
    rankBox.appendChild(el('h2', { class: 'text-sm font-bold' }, 'Rankings'));

    const abas = [
      { id: 'gerente', label: 'Gerente' }, { id: 'estado', label: 'Estado' },
      { id: 'cidade',  label: 'Cidade'  }, { id: 'emp',    label: 'Empreend.' },
      { id: 'imob',    label: 'Imobiliária' },
    ];
    const tabBar = el('div', { class: 'flex gap-1.5 overflow-x-auto no-scrollbar' });
    abas.forEach(a => tabBar.appendChild(el('button', {
      class: 'btn btn-sm flex-shrink-0 ' + (f.rankAba === a.id ? 'btn-primary' : 'btn-secondary'),
      onclick: () => { f.rankAba = a.id; renderRankings(curr); },
    }, a.label)));
    rankBox.appendChild(tabBar);

    const rows = buildRanking(curr, f.rankAba);
    if (!rows.length) {
      rankBox.appendChild(el('p', { class: 'text-sm text-fg-muted text-center py-4' }, 'Sem dados no período'));
      return;
    }
    const t = el('table', { class: 'w-full text-xs' });
    t.innerHTML = '<thead><tr class="text-fg-muted border-b border-border"><th class="text-left py-1.5 pr-2 font-normal">Nome</th><th class="text-right py-1.5 px-1 font-normal">Visit.</th><th class="text-right py-1.5 px-1 font-normal">Prop.</th><th class="text-right py-1.5 px-1 font-normal">Vend.</th><th class="text-right py-1.5 pl-1 font-normal">VGV</th></tr></thead>';
    const tbody = document.createElement('tbody');
    rows.slice(0, 15).forEach((r, i) => tbody.appendChild(
      el('tr', { class: 'border-b border-border/30 hover:bg-bg-elev transition' },
        el('td', { class: 'py-1.5 pr-2 font-medium' },
          el('span', { class: 'text-fg-muted mr-1 text-[10px]' }, `${i + 1}.`),
          el('span', { class: 'truncate' }, r.nome)),
        el('td', { class: 'py-1.5 px-1 text-right tabular-nums' }, r.visitas),
        el('td', { class: 'py-1.5 px-1 text-right tabular-nums' }, r.propostas),
        el('td', { class: 'py-1.5 px-1 text-right tabular-nums font-semibold text-green-500' }, r.vendas),
        el('td', { class: 'py-1.5 pl-1 text-right tabular-nums font-bold' }, fmtVGV(r.vgv)),
      )
    ));
    t.appendChild(tbody);
    rankBox.appendChild(el('div', { class: 'overflow-x-auto' }, t));
  }

  // ── Histórico de snapshots ─────────────────────────────────────────────────
  async function renderHistory() {
    histBox.innerHTML = '';
    histBox.appendChild(el('h2', { class: 'text-sm font-bold' }, '📅 Histórico de atualizações'));
    const { data } = await supabase.from('dashboard_snapshots')
      .select('periodo_label, kpis, created_at').order('created_at', { ascending: false }).limit(20);
    if (!data?.length) {
      histBox.appendChild(el('p', { class: 'text-xs text-fg-muted' },
        'Clique em "Atualizar agora" para salvar o primeiro snapshot.'));
      return;
    }
    const list = el('div', { class: 'flex flex-col gap-0 max-h-48 overflow-y-auto' });
    data.forEach(snap => {
      const kpis = snap.kpis || {};
      const dt = new Date(snap.created_at).toLocaleString('pt-BR',
        { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
      list.appendChild(el('div', { class: 'flex items-center justify-between text-xs py-1.5 border-b border-border/30' },
        el('div', {},
          el('span', { class: 'font-medium' }, dt),
          el('span', { class: 'text-fg-muted ml-1.5' }, snap.periodo_label || ''),
        ),
        el('div', { class: 'flex gap-3' },
          el('div', { class: 'text-right' },
            el('div', { class: 'font-bold text-green-500' }, fmtVGV(kpis.vgvVendas || 0)),
            el('div', { class: 'text-fg-muted text-[10px]' }, 'VGV Vendas'),
          ),
          el('div', { class: 'text-right' },
            el('div', { class: 'font-bold' }, fmtVGV(kpis.vgvPropostas || 0)),
            el('div', { class: 'text-fg-muted text-[10px]' }, 'VGV Prop.'),
          ),
        ),
      ));
    });
    histBox.appendChild(list);
  }

  // ── AI Chat (Gemini Flash) ─────────────────────────────────────────────────
  let _lastKPIs = null;
  function renderAIChat() {
    aiBox.innerHTML = '';
    aiBox.appendChild(el('div', { class: 'flex items-center justify-between' },
      el('h2', { class: 'text-sm font-bold' }, '🤖 Análise com IA'),
      el('span', { class: 'text-[10px] text-fg-muted px-2 py-0.5 bg-bg-elev rounded-full' }, 'Gemini Flash'),
    ));

    const GEMINI_KEY = 'dash-gemini-key';

    // Campo de chave — apenas master/gestor
    if (isMaster() || isGestor()) {
      const keyInp = el('input', {
        class: 'input text-xs', type: 'password',
        placeholder: 'Chave Gemini API (Google AI Studio — gratuita)',
        value: localStorage.getItem(GEMINI_KEY) || '',
      });
      const saveKeyBtn = el('button', {
        class: 'btn btn-sm btn-secondary flex-shrink-0',
        onclick: () => { localStorage.setItem(GEMINI_KEY, keyInp.value.trim()); toast('Chave salva', 'success'); },
      }, 'Salvar');
      aiBox.appendChild(el('div', { class: 'flex gap-2 items-center' }, keyInp, saveKeyBtn));
    }

    const history = el('div', {
      class: 'flex flex-col gap-2 max-h-56 overflow-y-auto bg-bg-elev rounded-xl p-3 min-h-[80px]',
    }, el('p', { class: 'text-xs text-fg-muted' },
      'Pergunte sobre os KPIs: "Por que as conversões caíram?" ou "Qual gerente precisa de atenção?"'));

    const inp = el('input', { class: 'input text-sm flex-1', placeholder: 'Pergunte sobre os dados...' });
    const sendBtn = el('button', { class: 'btn btn-primary btn-sm px-4', onclick: sendMsg }, '↑');
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') sendMsg(); });

    aiBox.append(history, el('div', { class: 'flex gap-2' }, inp, sendBtn));

    async function sendMsg() {
      const q = inp.value.trim();
      if (!q) return;
      const key = localStorage.getItem(GEMINI_KEY) || '';
      if (!key) { toast('Configure a chave Gemini API acima', 'warning'); return; }

      history.appendChild(el('div', {
        class: 'self-end bg-rottas-500 text-white rounded-xl rounded-br-sm px-3 py-1.5 text-sm max-w-[88%] ml-auto',
      }, q));
      inp.value = '';
      sendBtn.disabled = true;

      const ctx = _lastKPIs ? `
KPIs atuais (${PERIODO_LABELS[f.periodo] || f.periodo}):
- VGV Vendas: ${fmtVGV(_lastKPIs.vgvVendas)} (${_lastKPIs.vendas} vendas)
- VGV Propostas: ${fmtVGV(_lastKPIs.vgvPropostas)} (${_lastKPIs.propostas} propostas)
- Conversão Atend→Prop: ${_lastKPIs.convAtendProp.toFixed(1)}%
- Conversão Prop→Venda: ${_lastKPIs.convPropVenda.toFixed(1)}%
- Pace Visitas: ${_lastKPIs.paceVisitas !== null ? _lastKPIs.paceVisitas.toFixed(0) + '%' : 'N/D'} (vs período anterior)
- Pace Propostas: ${_lastKPIs.pacePropostas !== null ? _lastKPIs.pacePropostas.toFixed(0) + '%' : 'N/D'} (vs período anterior)
- Total visitas: ${_lastKPIs.visitas} | Check-ins: ${_lastKPIs.checkins} | Atendimentos: ${_lastKPIs.atendimentos}
` : 'Dados não carregados.';

      const thinking = el('div', { class: 'text-sm text-fg-muted italic px-1 py-1.5' }, 'Analisando...');
      history.appendChild(thinking);
      history.scrollTop = history.scrollHeight;

      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text:
                `Você é um analista de negócios especialista em mercado imobiliário. Seja direto e prático, em português brasileiro.\n\n${ctx}\n\nPergunta: ${q}`,
              }] }],
              generationConfig: { maxOutputTokens: 400, temperature: 0.7 },
            }),
          }
        );
        const json = await res.json();
        const answer = json?.candidates?.[0]?.content?.parts?.[0]?.text || 'Sem resposta da IA.';
        thinking.remove();
        history.appendChild(el('div', {
          class: 'self-start bg-bg rounded-xl rounded-bl-sm px-3 py-2 text-sm max-w-[90%] border border-border',
        }, answer));
      } catch (err) {
        thinking.textContent = '⚠ Erro: ' + err.message;
        thinking.classList.remove('italic');
        thinking.classList.add('text-danger');
      } finally {
        sendBtn.disabled = false;
        history.scrollTop = history.scrollHeight;
      }
    }
  }

  // ── Salva snapshot ─────────────────────────────────────────────────────────
  async function saveSnapshot(kpis) {
    const { start, end } = periodRange(f.periodo);
    try {
      await supabase.from('dashboard_snapshots').insert({
        user_id: state.user.id,
        filtros: { periodo: f.periodo, estado: f.estado, cidade: f.cidade,
                   gerente: f.gerente, empreendimento: f.empreend },
        kpis,
        periodo_label: PERIODO_LABELS[f.periodo] || f.periodo,
        periodo_inicio: start?.toISOString() || null,
        periodo_fim: end?.toISOString() || null,
      });
    } catch (e) { /* snapshot failure is non-critical */ }
  }

  // ── Reload principal ───────────────────────────────────────────────────────
  async function reload() {
    refreshBtn.disabled = true;
    refreshBtn.textContent = '⏳ Carregando...';
    statusEl.textContent = 'Atualizando...';

    try {
      const { start, end, prevStart, prevEnd } = periodRange(f.periodo);
      const [curr, prev] = await Promise.all([
        fetchAtividades(start, end),
        prevStart ? fetchAtividades(prevStart, prevEnd) : Promise.resolve([]),
      ]);

      const kpis = calcKPIs(curr, prev);
      _lastKPIs = kpis;

      renderKPIs(kpis);
      renderRankings(curr);
      await Promise.all([renderLineChart(curr), renderFunnel(kpis)]);

      saveSnapshot(kpis);
      renderHistory();

      statusEl.textContent = 'Atualizado às ' +
        new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch (err) {
      toast('Erro ao carregar dashboard: ' + (err.message || err), 'error');
      statusEl.textContent = 'Erro ao carregar';
      console.error('[dashboard]', err);
    } finally {
      refreshBtn.disabled = false;
      refreshBtn.textContent = '🔄 Atualizar agora';
    }
  }

  // Inicializa UI de AI (sem dados ainda) e carrega dados
  renderAIChat();
  reload();
}
