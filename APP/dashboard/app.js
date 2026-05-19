// ═════════════════════════════════════════════════════════════════════════
// Imob Rottas · Dashboard Analítico standalone
// app.js — bootstrap, auth, state, filtros, fetch, KPIs, orquestração
// ═════════════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { renderLineChart, renderFunnel } from './charts.js?v=101';
import { initAiChat, updateAiContext } from './ai-chat.js?v=101';

// ─── CONFIG ──────────────────────────────────────────────────────────────
const SUPABASE_URL  = 'https://lmzjlirzexyopnjxohez.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxtempsaXJ6ZXh5b3BuanhvaGV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NzExMjcsImV4cCI6MjA5MzI0NzEyN30.V23FCvrJKRkGhjmZQqAnaXYLbtpMw7Wc_Ae7UB0t7a8';

// IMPORTANTE: storageKey IDÊNTICO ao SPA para compartilhar sessão
export const sb = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { persistSession: true, autoRefreshToken: true,
          detectSessionInUrl: false, storage: window.localStorage,
          storageKey: 'rottas-app-auth' },
});

// ─── STATE GLOBAL ────────────────────────────────────────────────────────
export const state = {
  user: null, profile: null,
  filters: {
    periodo:  sessionStorage.getItem('dash-periodo')  || '30d',
    estado:   sessionStorage.getItem('dash-estado')   || 'todos',
    cidade:   sessionStorage.getItem('dash-cidade')   || 'todas',
    empreend: sessionStorage.getItem('dash-emp')      || 'todos',
    imob:     sessionStorage.getItem('dash-imob')     || 'todas',
    gerente:  sessionStorage.getItem('dash-gerente')  || 'todos',
  },
  data: { atividades: [], atividadesPrev: [], gerentes: [], empreendimentos: [], imobiliarias: [] },
  kpis: null,
  rankAba: 'gerente',
  lastUpdate: null,
};

function saveFilters() {
  sessionStorage.setItem('dash-periodo',  state.filters.periodo);
  sessionStorage.setItem('dash-estado',   state.filters.estado);
  sessionStorage.setItem('dash-cidade',   state.filters.cidade);
  sessionStorage.setItem('dash-emp',      state.filters.empreend);
  sessionStorage.setItem('dash-imob',     state.filters.imob);
  sessionStorage.setItem('dash-gerente',  state.filters.gerente);
}

// ─── HELPERS ─────────────────────────────────────────────────────────────
const $  = (id) => document.getElementById(id);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function toast(msg, type = 'info', ms = 3200) {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  const icons = { success: '✓', error: '⚠', warning: '!', info: 'ℹ' };
  t.innerHTML = `<span style="font-weight:700;">${icons[type] || 'ℹ'}</span><span>${msg}</span>`;
  $('toast-root').appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(8px)'; t.style.transition = 'all .2s'; setTimeout(() => t.remove(), 220); }, ms);
}

export const fmt = {
  vgv(v) {
    if (!v) return 'R$ 0';
    if (v >= 1e6) return `R$ ${(v / 1e6).toFixed(1).replace('.', ',')} mi`;
    if (v >= 1e3) return `R$ ${(v / 1e3).toFixed(0)} mil`;
    return `R$ ${Math.round(v).toLocaleString('pt-BR')}`;
  },
  pct(v, decimals = 1) { return (v ?? 0).toFixed(decimals).replace('.', ',') + '%'; },
  num(v) { return (v ?? 0).toLocaleString('pt-BR'); },
  dateTime(d) {
    if (!d) return '—';
    return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  },
};

// ─── AUTH ────────────────────────────────────────────────────────────────
const ADMIN_ROLES = ['master', 'gestor', 'superintendente', 'gestor_regional'];

async function authBoot() {
  const setMsg = (m) => { const e = $('auth-msg'); if (e) e.textContent = m; };
  setMsg('Verificando sessão...');

  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    setMsg('Sessão não encontrada. Redirecionando...');
    setTimeout(() => location.replace('/#/login'), 600);
    return false;
  }
  state.user = session.user;

  setMsg('Carregando perfil...');
  const { data: profile, error } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
  if (error || !profile) {
    setMsg('Perfil não encontrado. Redirecionando...');
    setTimeout(() => location.replace('/'), 800);
    return false;
  }
  state.profile = profile;

  if (!ADMIN_ROLES.includes(profile.role)) {
    setMsg('Acesso restrito à gerência. Redirecionando...');
    setTimeout(() => location.replace('/'), 1000);
    return false;
  }
  return true;
}

// ─── PERIOD HELPER ───────────────────────────────────────────────────────
export function periodRange(p) {
  const now = new Date();
  const end = new Date(now); end.setHours(23, 59, 59, 999);
  const D = 86400000;
  let start, prevStart, prevEnd;

  if (p === 'hoje')      { start = new Date(); start.setHours(0,0,0,0); }
  else if (p === '7d')   { start = new Date(now.getTime() - 6 * D);  start.setHours(0,0,0,0); }
  else if (p === '30d')  { start = new Date(now.getTime() - 29 * D); start.setHours(0,0,0,0); }
  else if (p === '90d')  { start = new Date(now.getTime() - 89 * D); start.setHours(0,0,0,0); }
  else if (p === '12m')  { start = new Date(now.getTime() - 364 * D); start.setHours(0,0,0,0); }
  else                   { start = null; }

  if (start) {
    const dur = end - start + 1;
    prevEnd = new Date(start.getTime() - 1);
    prevStart = new Date(prevEnd.getTime() - dur + 1);
  }
  return { start, end, prevStart, prevEnd };
}

const PERIODO_LABEL = { hoje:'Hoje', '7d':'Últimos 7 dias', '30d':'Últimos 30 dias', '90d':'Últimos 90 dias', '12m':'Últimos 12 meses', tudo:'Todo período' };

// ─── DATA FETCH ──────────────────────────────────────────────────────────
async function fetchAtividades(start, end) {
  let q = sb.from('atividades')
    .select('id, tipo, valor, reserva, cancelada, created_at, gerente_id, imobiliaria, produto, empreendimento, plataforma, profiles!atividades_gerente_id_fkey(nome, cidade, estado, role)')
    .eq('cancelada', false)
    .order('created_at', { ascending: false })
    .limit(5000);
  if (start) q = q.gte('created_at', start.toISOString());
  if (end)   q = q.lte('created_at', end.toISOString());

  const F = state.filters;
  if (F.gerente !== 'todos')   q = q.eq('gerente_id', F.gerente);
  if (F.empreend !== 'todos')  q = q.or(`empreendimento.eq.${F.empreend},produto.eq.${F.empreend}`);
  if (F.imob !== 'todas')      q = q.eq('imobiliaria', F.imob);

  const { data, error } = await q;
  if (error) throw error;
  let rows = data || [];
  if (F.estado !== 'todos') rows = rows.filter(r => r.profiles?.estado === F.estado);
  if (F.cidade !== 'todas') rows = rows.filter(r => r.profiles?.cidade === F.cidade);
  return rows;
}

async function loadFilterOptions() {
  const { data: gerentes } = await sb.from('profiles')
    .select('id, nome, cidade, estado, role').in('role', ['gerente', 'supervisor']).eq('ativo', true).order('nome');
  state.data.gerentes = gerentes || [];

  const { data: emps } = await sb.from('empreendimentos').select('id, nome, cidade, estado').order('nome');
  state.data.empreendimentos = emps || [];

  const { data: imobs } = await sb.from('imobiliarias').select('id, nome, cidade, estado').order('nome');
  state.data.imobiliarias = imobs || [];

  populateFilterSelects();
}

function populateFilterSelects() {
  const { gerentes, empreendimentos, imobiliarias } = state.data;
  const F = state.filters;

  const gSel = $('f-gerente'); gSel.innerHTML = '<option value="todos">Todos gerentes</option>';
  gerentes.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g.id; opt.textContent = g.nome;
    if (F.gerente === g.id) opt.selected = true;
    gSel.appendChild(opt);
  });

  const eSel = $('f-empreend'); eSel.innerHTML = '<option value="todos">Todos empreend.</option>';
  empreendimentos.forEach(e => {
    const opt = document.createElement('option');
    opt.value = e.nome; opt.textContent = e.nome;
    if (F.empreend === e.nome) opt.selected = true;
    eSel.appendChild(opt);
  });

  const iSel = $('f-imob'); iSel.innerHTML = '<option value="todas">Todas imobiliárias</option>';
  imobiliarias.forEach(i => {
    const opt = document.createElement('option');
    opt.value = i.nome; opt.textContent = i.nome;
    if (F.imob === i.nome) opt.selected = true;
    iSel.appendChild(opt);
  });

  refreshCidadesSelect();

  $('f-periodo').value = F.periodo;
  $('f-estado').value  = F.estado;
}

function refreshCidadesSelect() {
  const F = state.filters;
  const cSel = $('f-cidade');
  const cidades = new Set();
  const useState = F.estado !== 'todos';

  state.data.gerentes.forEach(g => {
    if (g.cidade && (!useState || g.estado === F.estado)) cidades.add(g.cidade);
  });
  state.data.empreendimentos.forEach(e => {
    if (e.cidade && (!useState || e.estado === F.estado)) cidades.add(e.cidade);
  });
  state.data.imobiliarias.forEach(i => {
    if (i.cidade && (!useState || i.estado === F.estado)) cidades.add(i.cidade);
  });

  if (state.profile.role === 'gestor_regional' && Array.isArray(state.profile.cidades_acesso)) {
    state.profile.cidades_acesso.forEach(c => cidades.add(c));
  }

  cSel.innerHTML = '<option value="todas">Todas cidades</option>';
  [...cidades].sort().forEach(c => {
    const opt = document.createElement('option');
    opt.value = c; opt.textContent = c;
    if (F.cidade === c) opt.selected = true;
    cSel.appendChild(opt);
  });
  if (![...cidades].includes(F.cidade)) F.cidade = 'todas';
}

// ─── KPIs ────────────────────────────────────────────────────────────────
export function calcKPIs(curr, prev) {
  const sub = (arr, t) => arr.filter(r => r.tipo === t);
  const vgv = arr => arr.reduce((s, r) => s + (parseFloat(r.valor) || 0), 0);

  const cChk = sub(curr, 'checkin');
  const cAt  = sub(curr, 'atendimento');
  const cPr  = sub(curr, 'proposta');
  const cVd  = cPr.filter(r => r.reserva != null && r.reserva !== '');
  const cOr  = sub(curr, 'orulo');

  const pChk = sub(prev, 'checkin');
  const pAt  = sub(prev, 'atendimento');
  const pPr  = sub(prev, 'proposta');

  const cVis = cChk.length + cAt.length;
  const pVis = pChk.length + pAt.length;

  const convAP = cAt.length > 0 ? cPr.length / cAt.length * 100 : 0;
  const convPV = cPr.length > 0 ? cVd.length / cPr.length * 100 : 0;
  const paceV  = pVis > 0 ? cVis / pVis * 100 : null;
  const paceP  = pPr.length > 0 ? cPr.length / pPr.length * 100 : null;

  return {
    vgvVendas: vgv(cVd),
    vgvPropostas: vgv(cPr),
    convAtendProp: convAP,
    convPropVenda: convPV,
    paceVisitas: paceV,
    pacePropostas: paceP,
    visitas: cVis, checkins: cChk.length, atendimentos: cAt.length,
    propostas: cPr.length, vendas: cVd.length, orulo: cOr.length,
    prevVisitas: pVis, prevPropostas: pPr.length, prevAtendimentos: pAt.length,
  };
}

function paceColor(p) {
  if (p === null || p === undefined) return { cls: 'pace-yellow', text: 'kpi-trend-flat', icon: '·' };
  if (p >= 100) return { cls: 'pace-green',  text: 'kpi-trend-up',   icon: '↑' };
  if (p >= 80)  return { cls: 'pace-yellow', text: 'kpi-trend-flat', icon: '→' };
  return { cls: 'pace-red', text: 'kpi-trend-down', icon: '↓' };
}

function renderKPIs(k) {
  const paceV = paceColor(k.paceVisitas);
  const paceP = paceColor(k.pacePropostas);

  const cards = [
    { label: '💰 VGV Vendas',       value: fmt.vgv(k.vgvVendas),
      sub: `${k.vendas} venda${k.vendas !== 1 ? 's' : ''} efetivada${k.vendas !== 1 ? 's' : ''}`,
      cls: 'kpi-accent', valueCls: 'text-rottas-500' },
    { label: '📄 VGV Propostas',    value: fmt.vgv(k.vgvPropostas),
      sub: `${fmt.num(k.propostas)} proposta${k.propostas !== 1 ? 's' : ''} subida${k.propostas !== 1 ? 's' : ''}`,
      cls: '', valueCls: '' },
    { label: '🔄 Conv. Atend→Prop', value: fmt.pct(k.convAtendProp),
      sub: `${fmt.num(k.propostas)} / ${fmt.num(k.atendimentos)} atendimentos`,
      cls: '', valueCls: '' },
    { label: '🏆 Conv. Prop→Venda', value: fmt.pct(k.convPropVenda),
      sub: `${fmt.num(k.vendas)} / ${fmt.num(k.propostas)} propostas`,
      cls: '', valueCls: '' },
    { label: '📍 Pace Visitas',
      value: k.paceVisitas !== null ? `${k.paceVisitas.toFixed(0)}% ${paceV.icon}` : 'N/D',
      sub: `${fmt.num(k.visitas)} atual · ${fmt.num(k.prevVisitas)} ant.`,
      cls: paceV.cls, valueCls: paceV.text },
    { label: '📊 Pace Propostas',
      value: k.pacePropostas !== null ? `${k.pacePropostas.toFixed(0)}% ${paceP.icon}` : 'N/D',
      sub: `${fmt.num(k.propostas)} atual · ${fmt.num(k.prevPropostas)} ant.`,
      cls: paceP.cls, valueCls: paceP.text },
  ];

  const grid = $('kpi-grid');
  grid.innerHTML = '';
  cards.forEach(c => {
    const el = document.createElement('div');
    el.className = `kpi ${c.cls}`;
    el.innerHTML = `
      <div class="kpi-label">${c.label}</div>
      <div class="kpi-value ${c.valueCls}">${c.value}</div>
      <div class="kpi-sub">${c.sub}</div>
    `;
    grid.appendChild(el);
  });
}

// ─── RANKINGS ────────────────────────────────────────────────────────────
function buildRanking(curr, aba) {
  const map = {};
  curr.forEach(r => {
    let key;
    if      (aba === 'gerente')         key = r.profiles?.nome || '—';
    else if (aba === 'regional')        key = r.profiles?.estado || '—';
    else if (aba === 'cidade')          key = r.profiles?.cidade || '—';
    else if (aba === 'empreendimento')  key = r.empreendimento || r.produto || '—';
    else if (aba === 'imobiliaria')     key = r.imobiliaria || '—';
    if (!key || key === '—') return;
    if (!map[key]) map[key] = { visitas: 0, atendimentos: 0, propostas: 0, vendas: 0, vgv: 0 };
    const m = map[key];
    if (r.tipo === 'checkin')      m.visitas++;
    if (r.tipo === 'atendimento')  { m.visitas++; m.atendimentos++; }
    if (r.tipo === 'proposta') {
      m.propostas++;
      m.vgv += parseFloat(r.valor) || 0;
      if (r.reserva) m.vendas++;
    }
  });
  return Object.entries(map).map(([nome, v]) => ({ nome, ...v }))
    .sort((a, b) => b.vgv - a.vgv || b.visitas - a.visitas);
}

function renderRanking() {
  const rows = buildRanking(state.data.atividades, state.rankAba);
  const wrap = $('rank-table-wrap');
  if (!rows.length) {
    wrap.innerHTML = `<p style="text-align:center;padding:30px;color:var(--fg-muted);font-size:13px;">Sem dados no período selecionado.</p>`;
    return;
  }
  const labelMap = { gerente:'Gerente', regional:'Regional', cidade:'Cidade', empreendimento:'Empreendimento', imobiliaria:'Imobiliária' };
  const lim = state.rankAba === 'regional' ? 5 : 15;
  let html = `<table><thead><tr>
    <th style="width:32px;">#</th>
    <th>${labelMap[state.rankAba]}</th>
    <th class="num">Visitas</th>
    <th class="num">Atend.</th>
    <th class="num">Prop.</th>
    <th class="num">Vend.</th>
    <th class="num">VGV</th>
  </tr></thead><tbody>`;
  rows.slice(0, lim).forEach((r, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `<span style="color:var(--fg-muted);font-weight:600;">${i + 1}</span>`;
    html += `<tr>
      <td style="text-align:center;font-size:14px;">${medal}</td>
      <td style="font-weight:600;">${escapeHtml(r.nome)}</td>
      <td class="num">${fmt.num(r.visitas)}</td>
      <td class="num">${fmt.num(r.atendimentos)}</td>
      <td class="num">${fmt.num(r.propostas)}</td>
      <td class="num" style="color:var(--green);font-weight:700;">${fmt.num(r.vendas)}</td>
      <td class="num" style="font-weight:700;">${fmt.vgv(r.vgv)}</td>
    </tr>`;
  });
  html += '</tbody></table>';
  wrap.innerHTML = html;
}

function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

// ─── HISTORY ─────────────────────────────────────────────────────────────
async function renderHistory() {
  const wrap = $('history-list');
  const { data, error } = await sb.from('dashboard_snapshots')
    .select('periodo_label, kpis, created_at, filtros')
    .order('created_at', { ascending: false }).limit(20);

  if (error || !data?.length) {
    wrap.innerHTML = `<p style="text-align:center;padding:20px;color:var(--fg-muted);font-size:12px;">
      ${error ? 'Erro ao carregar histórico.' : 'Sem snapshots. Clique em <b>Atualizar</b> para registrar o primeiro.'}</p>`;
    return;
  }

  let html = '';
  data.forEach(snap => {
    const k = snap.kpis || {};
    const dt = fmt.dateTime(snap.created_at);
    html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border);font-size:12px;gap:10px;">
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;">${dt}</div>
        <div style="font-size:10.5px;color:var(--fg-muted);">${snap.periodo_label || ''}</div>
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <div style="font-weight:700;color:var(--green);">${fmt.vgv(k.vgvVendas || 0)}</div>
        <div style="font-size:10px;color:var(--fg-muted);">Vendas</div>
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <div style="font-weight:700;">${fmt.vgv(k.vgvPropostas || 0)}</div>
        <div style="font-size:10px;color:var(--fg-muted);">Propostas</div>
      </div>
    </div>`;
  });
  wrap.innerHTML = html;
}

async function saveSnapshot() {
  if (!state.kpis) return;
  const { start, end } = periodRange(state.filters.periodo);
  try {
    await sb.from('dashboard_snapshots').insert({
      user_id: state.user.id,
      filtros: { ...state.filters },
      kpis: state.kpis,
      periodo_label: PERIODO_LABEL[state.filters.periodo] || state.filters.periodo,
      periodo_inicio: start?.toISOString() || null,
      periodo_fim: end?.toISOString() || null,
    });
  } catch (e) { console.warn('[dashboard] snapshot falhou (não crítico):', e); }
}

// ─── MAIN RELOAD ─────────────────────────────────────────────────────────
async function reload() {
  const btn = $('btn-refresh');
  btn.disabled = true;
  $('btn-refresh-label').textContent = 'Atualizando...';
  $('status-text').textContent = 'Buscando dados...';
  $('pulse-dot').style.background = 'var(--yellow)';

  try {
    const { start, end, prevStart, prevEnd } = periodRange(state.filters.periodo);
    const [curr, prev] = await Promise.all([
      fetchAtividades(start, end),
      prevStart ? fetchAtividades(prevStart, prevEnd) : Promise.resolve([]),
    ]);
    state.data.atividades     = curr;
    state.data.atividadesPrev = prev;

    const k = calcKPIs(curr, prev);
    state.kpis = k;

    renderKPIs(k);
    renderRanking();
    await Promise.all([
      renderLineChart($('chart-line-wrap'), curr, state.filters.periodo),
      renderFunnel($('chart-funnel-wrap'), k),
    ]);

    saveSnapshot().then(() => renderHistory());
    updateAiContext({ kpis: k, filters: state.filters, periodLabel: PERIODO_LABEL[state.filters.periodo] });

    state.lastUpdate = new Date();
    $('status-text').textContent = `Atualizado às ${state.lastUpdate.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })}`;
    $('status-counts').textContent = `${fmt.num(curr.length)} atividades · período: ${PERIODO_LABEL[state.filters.periodo]}`;
    $('pulse-dot').style.background = 'var(--green)';
  } catch (err) {
    console.error('[dashboard] reload:', err);
    toast('Erro ao carregar: ' + (err.message || err), 'error');
    $('status-text').textContent = 'Erro ao carregar dados';
    $('pulse-dot').style.background = 'var(--red)';
  } finally {
    btn.disabled = false;
    $('btn-refresh-label').textContent = 'Atualizar';
  }
}

// ─── UI WIRING ───────────────────────────────────────────────────────────
function wireFilters() {
  const onChange = (key) => (e) => {
    state.filters[key] = e.target.value;
    if (key === 'estado') { state.filters.cidade = 'todas'; refreshCidadesSelect(); }
    saveFilters();
    reload();
  };
  $('f-periodo').addEventListener('change',  onChange('periodo'));
  $('f-estado').addEventListener('change',   onChange('estado'));
  $('f-cidade').addEventListener('change',   onChange('cidade'));
  $('f-empreend').addEventListener('change', onChange('empreend'));
  $('f-imob').addEventListener('change',     onChange('imob'));
  $('f-gerente').addEventListener('change',  onChange('gerente'));

  $('btn-reset').addEventListener('click', () => {
    state.filters = { periodo: '30d', estado: 'todos', cidade: 'todas', empreend: 'todos', imob: 'todas', gerente: 'todos' };
    saveFilters();
    populateFilterSelects();
    reload();
  });

  $('btn-refresh').addEventListener('click', reload);
}

function wireRankTabs() {
  $$('#rank-tabs .tab').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('#rank-tabs .tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.rankAba = btn.dataset.rank;
      renderRanking();
    });
  });
}

function wireSidebarAnchors() {
  $$('.sb-link[data-anchor]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const anchor = link.dataset.anchor;
      const map = { overview:'sec-overview', charts:'sec-charts', rankings:'sec-rankings', history:'sec-history-ai', ai:'sec-history-ai' };
      const target = $(map[anchor]);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        $$('.sb-link[data-anchor]').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        const titleMap = { overview:'Visão Geral', charts:'Curvas & Funil', rankings:'Rankings', history:'Histórico', ai:'Chat IA' };
        $('section-title').textContent = titleMap[anchor];
        $('sidebar').classList.remove('open');
        if (anchor === 'ai') setTimeout(() => $('ai-input')?.focus(), 400);
      }
    });
  });

  $('sb-toggle-btn')?.addEventListener('click', () => {
    $('sidebar').classList.toggle('open');
  });
}

function wireTheme() {
  const stored = localStorage.getItem('rottas-theme') || 'dark';
  applyTheme(stored);
  $('btn-theme').addEventListener('click', () => {
    const next = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
    applyTheme(next);
    if (state.kpis) {
      renderLineChart($('chart-line-wrap'), state.data.atividades, state.filters.periodo);
      renderFunnel($('chart-funnel-wrap'), state.kpis);
    }
  });
}
function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.classList.toggle('light', theme === 'light');
  localStorage.setItem('rottas-theme', theme);
  $('theme-icon').textContent = theme === 'dark' ? '☀️' : '🌙';
}

function wireLogout() {
  $('btn-logout').addEventListener('click', async () => {
    try { await sb.auth.signOut(); } catch {}
    try {
      const ls = localStorage;
      const ks = [];
      for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i);
        if (k && (k.startsWith('rottas-') || k.startsWith('sb-') || k.toLowerCase().includes('supabase'))) ks.push(k);
      }
      ks.forEach(k => ls.removeItem(k));
    } catch {}
    location.replace('/#/login');
  });
}

function renderUserChip() {
  const p = state.profile;
  const initials = (p.nome || '?').split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();
  $('user-avatar').textContent = initials;
  $('user-name').textContent = p.nome || p.email;
  const roleLabels = { master:'Master', gestor:'Gestor', superintendente:'Superintendente', gestor_regional:'Gestor Regional' };
  $('user-role').textContent = roleLabels[p.role] || p.role;
}

// ─── BOOT ────────────────────────────────────────────────────────────────
async function boot() {
  const ok = await authBoot();
  if (!ok) return;

  $('auth-gate').style.display = 'none';
  $('app').style.display = 'block';

  renderUserChip();
  wireTheme();
  wireLogout();
  wireFilters();
  wireRankTabs();
  wireSidebarAnchors();

  initAiChat({
    keyboxEl: $('ai-keybox'),
    historyEl: $('ai-history'),
    suggestionsEl: $('ai-suggestions'),
    inputEl: $('ai-input'),
    sendEl: $('ai-send'),
    rateEl: $('ai-rate'),
    canManageKey: ['master', 'gestor'].includes(state.profile.role),
    toast,
  });

  await loadFilterOptions();
  await reload();
}

boot().catch(err => {
  console.error('[dashboard] boot fatal:', err);
  $('auth-msg').innerHTML = `<span style="color:var(--red);">Erro fatal: ${err.message || err}</span><br><a href="/" style="color:var(--accent);font-size:12px;text-decoration:underline;">Voltar ao app</a>`;
});
