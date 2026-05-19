// ═════════════════════════════════════════════════════════════════════════
// Imob Rottas · Dashboard Analítico standalone v2
// app.js — bootstrap, auth, state, filtros, fetch, KPIs, orquestração
//          + navegação por páginas + restauração de snapshot + role-based
// ═════════════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { renderLineChart, renderFunnel } from './charts.js?v=102';
import { initAiChat, updateAiContext } from './ai-chat.js?v=102';

// ─── CONFIG ──────────────────────────────────────────────────────────────
const SUPABASE_URL  = 'https://lmzjlirzexyopnjxohez.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxtempsaXJ6ZXh5b3BuanhvaGV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NzExMjcsImV4cCI6MjA5MzI0NzEyN30.V23FCvrJKRkGhjmZQqAnaXYLbtpMw7Wc_Ae7UB0t7a8';

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
  data: { atividades: [], atividadesPrev: [], gerentes: [], empreendimentos: [], imobiliarias: [], allowedGerenteIds: null },
  kpis: null,
  rankAba: 'gerente',
  currentSection: sessionStorage.getItem('dash-section') || 'overview',
  lastUpdate: null,
  // Modo snapshot: quando true, mostra dados de um snapshot histórico (read-only)
  snapshotMode: null, // { id, label, dt, kpis }
};

function saveFilters() {
  sessionStorage.setItem('dash-periodo',  state.filters.periodo);
  sessionStorage.setItem('dash-estado',   state.filters.estado);
  sessionStorage.setItem('dash-cidade',   state.filters.cidade);
  sessionStorage.setItem('dash-emp',      state.filters.empreend);
  sessionStorage.setItem('dash-imob',     state.filters.imob);
  sessionStorage.setItem('dash-gerente',  state.filters.gerente);
}

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
  dateTime(d) { if (!d) return '—'; return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); },
  timeOnly(d) { if (!d) return '—'; return new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); },
};

function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

// ─── AUTH (agora aceita TODOS roles, mas aplica role-based filtering) ───
const ALL_ROLES = ['master', 'gestor', 'superintendente', 'gestor_regional', 'gerente', 'supervisor'];

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

  if (!ALL_ROLES.includes(profile.role)) {
    setMsg('Acesso negado. Redirecionando...');
    setTimeout(() => location.replace('/'), 1000);
    return false;
  }
  return true;
}

// ─── ROLE-BASED ACCESS: lista de gerentes que o user pode visualizar ────
async function computeAllowedGerenteIds() {
  const myRole = state.profile.role;
  const myId   = state.profile.id;

  // Master e Gestor veem todo mundo
  if (['master', 'gestor'].includes(myRole)) {
    state.data.allowedGerenteIds = null; // sem restrição
    return;
  }

  // Carrega TODOS os profiles para calcular subset
  const { data: allProfiles } = await sb.from('profiles')
    .select('id, role, estado, cidade, gerente_supervisor_id').eq('ativo', true);
  const profiles = allProfiles || [];

  let allowed = new Set();

  if (myRole === 'superintendente') {
    // Vê todos gerentes/supervisores nos estados do estados_acesso
    const estados = state.profile.estados_acesso || [];
    profiles.forEach(p => {
      if (['gerente', 'supervisor'].includes(p.role) && estados.includes(p.estado)) {
        allowed.add(p.id);
      }
    });
  } else if (myRole === 'gestor_regional') {
    // Vê gerentes/supervisores nas cidades do cidades_acesso
    const cidades = state.profile.cidades_acesso || [];
    profiles.forEach(p => {
      if (['gerente', 'supervisor'].includes(p.role) && cidades.includes(p.cidade)) {
        allowed.add(p.id);
      }
    });
  } else if (myRole === 'gerente') {
    // Vê a si mesmo + seus supervisores subordinados
    allowed.add(myId);
    profiles.forEach(p => {
      if (p.role === 'supervisor' && p.gerente_supervisor_id === myId) allowed.add(p.id);
    });
  } else if (myRole === 'supervisor') {
    // Vê apenas a si mesmo
    allowed.add(myId);
  }

  state.data.allowedGerenteIds = allowed;
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
    .eq('cancelada', false).order('created_at', { ascending: false }).limit(5000);
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
  // ROLE-BASED filtering: aplica allowedGerenteIds se definido
  if (state.data.allowedGerenteIds) {
    const allowed = state.data.allowedGerenteIds;
    rows = rows.filter(r => allowed.has(r.gerente_id));
  }
  return rows;
}

async function loadFilterOptions() {
  const { data: gerentes } = await sb.from('profiles')
    .select('id, nome, cidade, estado, role').in('role', ['gerente', 'supervisor']).eq('ativo', true).order('nome');
  let gs = gerentes || [];
  // Role-based: filtra a lista de gerentes mostrada no dropdown
  if (state.data.allowedGerenteIds) {
    gs = gs.filter(g => state.data.allowedGerenteIds.has(g.id));
  }
  state.data.gerentes = gs;

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

  // Para Supervisor: força filtro no próprio user
  if (state.profile.role === 'supervisor') {
    F.gerente = state.profile.id;
    gSel.value = state.profile.id;
    gSel.disabled = true;
  }

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

  // Filtra estados se Superintendente
  const estSel = $('f-estado');
  if (state.profile.role === 'superintendente') {
    const estados = state.profile.estados_acesso || [];
    estSel.innerHTML = '<option value="todos">Todos meus estados</option>';
    estados.forEach(uf => {
      const opt = document.createElement('option');
      opt.value = uf; opt.textContent = uf;
      if (F.estado === uf) opt.selected = true;
      estSel.appendChild(opt);
    });
  }
  estSel.value = F.estado;
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
    // Restringe APENAS às cidades de acesso
    const acessivel = new Set(state.profile.cidades_acesso);
    [...cidades].forEach(c => { if (!acessivel.has(c)) cidades.delete(c); });
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
  const cChk = sub(curr, 'checkin'); const cAt = sub(curr, 'atendimento');
  const cPr  = sub(curr, 'proposta'); const cVd = cPr.filter(r => r.reserva != null && r.reserva !== '');
  const cOr  = sub(curr, 'orulo');
  const pChk = sub(prev, 'checkin'); const pAt = sub(prev, 'atendimento'); const pPr = sub(prev, 'proposta');
  const cVis = cChk.length + cAt.length; const pVis = pChk.length + pAt.length;
  const convAP = cAt.length > 0 ? cPr.length / cAt.length * 100 : 0;
  const convPV = cPr.length > 0 ? cVd.length / cPr.length * 100 : 0;
  const paceV  = pVis > 0 ? cVis / pVis * 100 : null;
  const paceP  = pPr.length > 0 ? cPr.length / pPr.length * 100 : null;
  return {
    vgvVendas: vgv(cVd), vgvPropostas: vgv(cPr),
    convAtendProp: convAP, convPropVenda: convPV,
    paceVisitas: paceV, pacePropostas: paceP,
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
    { label: '💰 VGV Vendas', value: fmt.vgv(k.vgvVendas),
      sub: `${k.vendas} venda${k.vendas !== 1 ? 's' : ''} efetivada${k.vendas !== 1 ? 's' : ''}`,
      cls: 'kpi-accent', valueCls: 'text-rottas-500' },
    { label: '📄 VGV Propostas', value: fmt.vgv(k.vgvPropostas),
      sub: `${fmt.num(k.propostas)} proposta${k.propostas !== 1 ? 's' : ''}`,
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
    el.innerHTML = `<div class="kpi-label">${c.label}</div><div class="kpi-value ${c.valueCls}">${c.value}</div><div class="kpi-sub">${c.sub}</div>`;
    grid.appendChild(el);
  });
}

// ─── RANKINGS ────────────────────────────────────────────────────────────
function buildRanking(curr, aba) {
  const map = {};
  curr.forEach(r => {
    let key;
    if      (aba === 'gerente')        key = r.profiles?.nome || '—';
    else if (aba === 'regional')       key = r.profiles?.estado || '—';
    else if (aba === 'cidade')         key = r.profiles?.cidade || '—';
    else if (aba === 'empreendimento') key = r.empreendimento || r.produto || '—';
    else if (aba === 'imobiliaria')    key = r.imobiliaria || '—';
    if (!key || key === '—') return;
    if (!map[key]) map[key] = { visitas: 0, atendimentos: 0, propostas: 0, vendas: 0, vgv: 0 };
    const m = map[key];
    if (r.tipo === 'checkin')      m.visitas++;
    if (r.tipo === 'atendimento')  { m.visitas++; m.atendimentos++; }
    if (r.tipo === 'proposta') {
      m.propostas++; m.vgv += parseFloat(r.valor) || 0;
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
    wrap.innerHTML = `<p style="text-align:center;padding:30px;color:var(--fg-muted);font-size:13px;">Sem dados no período.</p>`;
    return;
  }
  const labelMap = { gerente:'Gerente', regional:'Regional', cidade:'Cidade', empreendimento:'Empreendimento', imobiliaria:'Imobiliária' };
  const lim = state.rankAba === 'regional' ? 5 : 15;
  let html = `<table><thead><tr>
    <th style="width:32px;">#</th><th>${labelMap[state.rankAba]}</th>
    <th class="num">Visitas</th><th class="num">Atend.</th>
    <th class="num">Prop.</th><th class="num">Vend.</th><th class="num">VGV</th>
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

// ─── SNAPSHOT (modal histórico + restore) ────────────────────────────────
async function openHistoryModal() {
  const modal = $('history-modal');
  const listEl = $('history-modal-list');
  listEl.innerHTML = '<div class="spinner" style="margin:30px auto;"></div>';
  modal.style.display = 'flex';

  const { data, error } = await sb.from('dashboard_snapshots')
    .select('id, periodo_label, kpis, created_at, filtros')
    .order('created_at', { ascending: false }).limit(50);

  if (error || !data?.length) {
    listEl.innerHTML = `<p style="text-align:center;padding:20px;color:var(--fg-muted);font-size:12.5px;">
      ${error ? 'Erro ao carregar histórico.' : 'Nenhum snapshot salvo ainda.'}</p>`;
    return;
  }
  let html = '';
  data.forEach(snap => {
    const k = snap.kpis || {};
    html += `<div class="hist-row" data-id="${snap.id}" style="display:flex;justify-content:space-between;align-items:center;padding:11px 12px;border:1px solid var(--border);border-radius:9px;font-size:12.5px;gap:10px;cursor:pointer;transition:background .15s;background:var(--bg-card);">
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;">${fmt.dateTime(snap.created_at)}</div>
        <div style="font-size:11px;color:var(--fg-muted);">${snap.periodo_label || '—'}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-weight:700;color:var(--green);">${fmt.vgv(k.vgvVendas || 0)}</div>
        <div style="font-size:10px;color:var(--fg-muted);">${fmt.num(k.vendas || 0)} vendas</div>
      </div>
      <div style="text-align:right;">
        <div style="font-weight:700;">${fmt.vgv(k.vgvPropostas || 0)}</div>
        <div style="font-size:10px;color:var(--fg-muted);">${fmt.num(k.propostas || 0)} prop.</div>
      </div>
      <button class="btn btn-secondary" style="font-size:10px;padding:5px 9px;flex-shrink:0;">Ver</button>
    </div>`;
  });
  listEl.innerHTML = html;

  $$('.hist-row', listEl).forEach(row => {
    row.addEventListener('mouseenter', () => row.style.background = 'var(--bg-elev)');
    row.addEventListener('mouseleave', () => row.style.background = 'var(--bg-card)');
    row.addEventListener('click', () => {
      const id = row.dataset.id;
      const snap = data.find(s => s.id === id);
      if (snap) restoreSnapshot(snap);
    });
  });
}

function closeHistoryModal() { $('history-modal').style.display = 'none'; }

function restoreSnapshot(snap) {
  state.snapshotMode = {
    id: snap.id, label: snap.periodo_label, dt: snap.created_at, kpis: snap.kpis,
  };
  state.kpis = snap.kpis;
  renderKPIs(snap.kpis);
  // Esconde curvas/funil/rankings que precisam de dados brutos (não armazenados no snapshot)
  $('snapshot-banner').style.display = 'flex';
  $('snapshot-banner-label').textContent = `Visualizando snapshot de ${fmt.dateTime(snap.created_at)} · ${snap.periodo_label || ''}`;
  closeHistoryModal();
  toast('Snapshot restaurado (somente KPIs salvos)', 'info');
}

function exitSnapshotMode() {
  state.snapshotMode = null;
  $('snapshot-banner').style.display = 'none';
  reload();
}

// ─── SAVE SNAPSHOT ───────────────────────────────────────────────────────
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
  if (state.snapshotMode) exitSnapshotMode(); // sai do modo histórico antes de reload
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

    saveSnapshot().then(() => updateLastUpdateChip());
    updateAiContext({ kpis: k, filters: state.filters, periodLabel: PERIODO_LABEL[state.filters.periodo] });

    state.lastUpdate = new Date();
    updateLastUpdateChip();
    $('status-text').textContent = `Atualizado às ${fmt.timeOnly(state.lastUpdate)}`;
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

function updateLastUpdateChip() {
  const chip = $('last-update-chip');
  if (!chip) return;
  if (state.lastUpdate) {
    chip.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg> Última atualização: <b>${fmt.timeOnly(state.lastUpdate)}</b>`;
  } else {
    chip.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg> Nenhuma atualização ainda`;
  }
}

// ─── PAGE NAVIGATION (sidebar = páginas) ─────────────────────────────────
function switchSection(section) {
  state.currentSection = section;
  sessionStorage.setItem('dash-section', section);

  // Hide/show sections
  const all = ['overview', 'charts', 'rankings'];
  all.forEach(s => {
    const el = $(`sec-${s}`);
    if (el) el.style.display = (s === section) ? 'block' : 'none';
  });
  // Update sidebar active state
  $$('.sb-link[data-section]').forEach(l => {
    l.classList.toggle('active', l.dataset.section === section);
  });
  // Update breadcrumb
  const titles = { overview:'Visão Geral', charts:'Curvas & Funil', rankings:'Rankings' };
  $('section-title').textContent = titles[section] || section;
  $('sidebar').classList.remove('open');
}

function wireSidebar() {
  $$('.sb-link[data-section]').forEach(link => {
    link.addEventListener('click', (e) => { e.preventDefault(); switchSection(link.dataset.section); });
  });
  $('sb-toggle-btn')?.addEventListener('click', () => $('sidebar').classList.toggle('open'));
}

// ─── UI WIRING ───────────────────────────────────────────────────────────
function wireFilters() {
  const onChange = (key) => (e) => {
    state.filters[key] = e.target.value;
    if (key === 'estado') { state.filters.cidade = 'todas'; refreshCidadesSelect(); }
    saveFilters();
    reload();
  };
  ['periodo','estado','cidade','empreend','imob','gerente'].forEach(k => {
    $(`f-${k}`).addEventListener('change', onChange(k));
  });
  $('btn-reset').addEventListener('click', () => {
    state.filters = { periodo: '30d', estado: 'todos', cidade: 'todas', empreend: 'todos', imob: 'todas', gerente: 'todos' };
    if (state.profile.role === 'supervisor') state.filters.gerente = state.profile.id;
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

function wireTheme() {
  const stored = localStorage.getItem('rottas-theme') || 'dark';
  applyTheme(stored);
  $('btn-theme').addEventListener('click', () => {
    const next = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
    applyTheme(next);
    if (state.kpis && state.data.atividades) {
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
      const ls = localStorage; const ks = [];
      for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i);
        if (k && (k.startsWith('rottas-') || k.startsWith('sb-') || k.toLowerCase().includes('supabase'))) ks.push(k);
      }
      ks.forEach(k => ls.removeItem(k));
    } catch {}
    location.replace('/#/login');
  });
}

function wireHistoryModal() {
  $('last-update-chip').addEventListener('click', openHistoryModal);
  $('history-modal-close').addEventListener('click', closeHistoryModal);
  $('history-modal-bg').addEventListener('click', closeHistoryModal);
  $('snapshot-exit-btn').addEventListener('click', exitSnapshotMode);
}

function wireChatToggle() {
  const panel = $('ai-panel');
  const fab   = $('ai-fab');
  const closeBtn = $('ai-close-btn');
  fab.addEventListener('click', () => {
    panel.classList.add('open');
    fab.style.display = 'none';
    setTimeout(() => $('ai-input')?.focus(), 200);
  });
  closeBtn.addEventListener('click', () => {
    panel.classList.remove('open');
    fab.style.display = 'flex';
  });
}

function renderUserChip() {
  const p = state.profile;
  const initials = (p.nome || '?').split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();
  $('user-avatar').textContent = initials;
  $('user-name').textContent = p.nome || p.email;
  const roleLabels = { master:'Master', gestor:'Gestor', superintendente:'Superintendente', gestor_regional:'Gestor Regional', gerente:'Gerente', supervisor:'Supervisor' };
  $('user-role').textContent = roleLabels[p.role] || p.role;
}

// ─── BOOT ────────────────────────────────────────────────────────────────
async function boot() {
  const ok = await authBoot();
  if (!ok) return;

  await computeAllowedGerenteIds();

  $('auth-gate').style.display = 'none';
  $('app').style.display = 'block';

  renderUserChip();
  wireTheme();
  wireLogout();
  wireFilters();
  wireRankTabs();
  wireSidebar();
  wireHistoryModal();
  wireChatToggle();

  initAiChat({
    keyboxEl: $('ai-keybox'),
    historyEl: $('ai-history'),
    suggestionsEl: $('ai-suggestions'),
    inputEl: $('ai-input'),
    sendEl: $('ai-send'),
    rateEl: $('ai-rate'),
    canManageKey: ['master', 'gestor'].includes(state.profile.role),
    toast,
    sb,
  });

  switchSection(state.currentSection);
  updateLastUpdateChip();
  await loadFilterOptions();
  await reload();
}

boot().catch(err => {
  console.error('[dashboard] boot fatal:', err);
  $('auth-msg').innerHTML = `<span style="color:var(--red);">Erro fatal: ${err.message || err}</span><br><a href="/" style="color:var(--accent);font-size:12px;text-decoration:underline;">Voltar ao app</a>`;
});
