// ═════════════════════════════════════════════════════════════════════════
// Imob Rottas · Dashboard — seção IMOBILIÁRIAS
//
// Assiduidade da carteira: quais imobiliárias são mais visitadas, quais NUNCA
// receberam visita e quais estão há mais tempo sem visita.
//   • "No período" (ranking) usa as atividades já carregadas pelo dashboard
//     (respeita período, gerente, estado, cidade, empreendimento e escopo).
//   • "Última visita" e "nunca visitada" olham TODO o histórico (função
//     imob_resumo_visitas no banco), senão uma imobiliária visitada há 2 meses
//     apareceria como "nunca visitada" no filtro de 30 dias.
// Visita = check-in ou atendimento.
// ═════════════════════════════════════════════════════════════════════════

let D = null;   // { sb, state }
const I = { aba: sessionStorage.getItem('dash-imob-aba') || 'mais', busca: '', resumo: null, carregando: false,
  ordem: (() => { try { return JSON.parse(sessionStorage.getItem('dash-imob-ordem') || '{}'); } catch (e) { return {}; } })() };

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const chave = (n) => String(n || '').trim().toUpperCase();
const num = (v) => (v ?? 0).toLocaleString('pt-BR');
const dataCurta = (d) => d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' }).replace(/\./g, '') : '—';
const diasDesde = (d) => Math.floor((Date.now() - new Date(d).getTime()) / 86400000);

// Imobiliárias do escopo de quem está vendo + filtros do topo
function imobsDoEscopo() {
  const { state } = D;
  const p = state.profile || {};
  const F = state.filters;
  let lista = state.data.imobiliarias || [];
  if (p.role === 'superintendente') {
    const es = p.estados_acesso || []; lista = lista.filter((i) => es.includes(i.estado));
  } else if (p.role === 'gestor_regional') {
    const cs = p.cidades_acesso || []; lista = lista.filter((i) => cs.includes(i.cidade));
  } else if (['gerente', 'supervisor', 'gerente_produto'].includes(p.role)) {
    const cs = new Set([p.cidade, ...(p.cidades_acesso || [])].filter(Boolean)); lista = lista.filter((i) => cs.has(i.cidade));
  }
  if (F.estado !== 'todos') lista = lista.filter((i) => i.estado === F.estado);
  if (F.cidade !== 'todas') lista = lista.filter((i) => i.cidade === F.cidade);
  if (F.imob !== 'todas') lista = lista.filter((i) => i.nome === F.imob);
  return lista;
}

async function carregarResumo() {
  const { sb, state } = D;
  const F = state.filters;
  const allowed = state.data.allowedGerenteIds;
  const gerentes = F.gerente !== 'todos' ? [F.gerente] : (allowed ? [...allowed] : null);
  const { data, error } = await sb.rpc('imob_resumo_visitas', { p_gerentes: gerentes });
  if (error) throw error;
  I.resumo = new Map((data || []).map((r) => [r.chave, r]));
}

export async function recarregarImobs() {
  if (!D || I.carregando) return;
  if (!$('sec-imobiliarias') || $('sec-imobiliarias').style.display === 'none') return;   // só quando aberta
  I.carregando = true;
  $('imob-corpo').innerHTML = '<div style="padding:40px;text-align:center;color:var(--fg-muted);font-size:13px;">Carregando imobiliárias...</div>';
  try { await carregarResumo(); pintar(); }
  catch (e) {
    $('imob-corpo').innerHTML = `<div class="card" style="padding:18px;font-size:13px;"><b style="color:var(--red);">Não foi possível carregar.</b><div style="color:var(--fg-muted);margin:6px 0 10px;">${esc(e.message || e)}</div><button class="btn btn-secondary" id="imob-tentar">↻ Tentar de novo</button></div>`;
    $('imob-tentar')?.addEventListener('click', recarregarImobs);
  } finally { I.carregando = false; }
}

function montar() {
  const imobs = imobsDoEscopo();
  // Período: soma das atividades já carregadas (já filtradas pelo topo)
  const noPeriodo = new Map();
  for (const a of D.state.data.atividades || []) {
    const k = chave(a.imobiliaria); if (!k) continue;
    if (!noPeriodo.has(k)) noPeriodo.set(k, { checkin: 0, atendimento: 0, proposta: 0, vendas: 0, vgv: 0, gerentes: new Set(), ultima: null });
    const m = noPeriodo.get(k);
    if (a.tipo === 'checkin') m.checkin++;
    if (a.tipo === 'atendimento') m.atendimento++;
    if (a.tipo === 'proposta') { m.proposta++; m.vgv += parseFloat(a.valor) || 0; if (a.reserva) m.vendas++; }
    if (a.profiles?.nome) m.gerentes.add(a.profiles.nome.split(' ')[0]);
    if (['checkin', 'atendimento'].includes(a.tipo) && (!m.ultima || a.created_at > m.ultima)) m.ultima = a.created_at;
  }
  return imobs.map((i) => {
    const k = chave(i.nome);
    const p = noPeriodo.get(k) || { checkin: 0, atendimento: 0, proposta: 0, vendas: 0, vgv: 0, gerentes: new Set(), ultima: null };
    const h = I.resumo?.get(k);
    return { ...i, ...p, visitas: p.checkin + p.atendimento, ultimaGeral: h?.ultima || null, totalGeral: Number(h?.total || 0) };
  });
}

function kpi(label, valor, sub, cor) {
  return `<div class="kpi" style="${cor ? `border-left:3px solid ${cor};` : ''}"><div class="kpi-label">${label}</div>
    <div class="kpi-value" ${cor ? `style="color:${cor}"` : ''}>${valor}</div><div class="kpi-sub">${sub}</div></div>`;
}

function pintar() {
  const linhas = montar();
  const total = linhas.length;
  const visitadasPeriodo = linhas.filter((l) => l.visitas > 0).length;
  const nunca = linhas.filter((l) => !l.ultimaGeral);
  const sem30 = linhas.filter((l) => l.ultimaGeral && diasDesde(l.ultimaGeral) >= 30);
  const visitasPeriodo = linhas.reduce((s, l) => s + l.visitas, 0);
  const cobertura = total ? Math.round(visitadasPeriodo / total * 100) : 0;
  $('imob-kpis').innerHTML = [
    kpi('Imobiliárias', num(total), 'na carteira (escopo + filtros)'),
    kpi('Visitadas no período', num(visitadasPeriodo), `${cobertura}% de cobertura`, cobertura >= 60 ? 'var(--green)' : cobertura >= 30 ? 'var(--yellow)' : 'var(--red)'),
    kpi('Visitas no período', num(visitasPeriodo), 'check-ins + atendimentos'),
    kpi('Sem visita há 30+ dias', num(sem30.length), 'já visitadas, mas paradas', 'var(--yellow)'),
    kpi('Nunca visitadas', num(nunca.length), 'nenhuma visita no histórico', 'var(--red)'),
  ].join('');
  document.querySelectorAll('#imob-abas .tab').forEach((b) => {
    b.classList.toggle('active', b.dataset.aba === I.aba);
    const n = { mais: visitadasPeriodo, paradas: linhas.filter((l) => l.ultimaGeral).length, nunca: nunca.length }[b.dataset.aba];
    b.textContent = `${b.dataset.rotulo} (${num(n)})`;
  });

  const busca = chave(I.busca);
  const filtra = (arr) => busca ? arr.filter((l) => chave(l.nome).includes(busca) || chave(l.cidade).includes(busca)) : arr;
  // Colunas de cada aba: rótulo, valor para ORDENAR e célula. Clicar no título
  // ordena; clicar de novo inverte. A escolha fica lembrada por aba.
  const txt = (v) => String(v || '');
  const tempo = (d) => d ? new Date(d).getTime() : null;
  const COLS = {
    mais: [
      { k: 'nome', label: 'Imobiliária', v: (l) => txt(l.nome), td: (l) => `<td style="font-weight:700;">${esc(l.nome)}</td>` },
      { k: 'cidade', label: 'Cidade', v: (l) => txt(l.cidade), td: (l) => `<td>${esc(l.cidade || '—')}</td>` },
      { k: 'checkin', label: 'Check-ins', n: 1, v: (l) => l.checkin, td: (l) => `<td class="num">${num(l.checkin)}</td>` },
      { k: 'atendimento', label: 'Atendimentos', n: 1, v: (l) => l.atendimento, td: (l) => `<td class="num">${num(l.atendimento)}</td>` },
      { k: 'visitas', label: 'Visitas', n: 1, v: (l) => l.visitas, td: (l) => `<td class="num" style="font-weight:800;">${num(l.visitas)}</td>` },
      { k: 'proposta', label: 'Propostas', n: 1, v: (l) => l.proposta, td: (l) => `<td class="num">${num(l.proposta)}</td>` },
      { k: 'vendas', label: 'Vendas', n: 1, v: (l) => l.vendas, td: (l) => `<td class="num" style="color:var(--green);">${num(l.vendas)}</td>` },
      { k: 'ultima', label: 'Última visita', v: (l) => tempo(l.ultima || l.ultimaGeral), td: (l) => `<td>${dataCurta(l.ultima || l.ultimaGeral)}</td>` },
      { k: 'gerentes', label: 'Gerentes', v: (l) => [...l.gerentes].join(', '), td: (l) => `<td style="font-size:11.5px;color:var(--fg-muted);">${esc([...l.gerentes].join(', ') || '—')}</td>` },
    ],
    paradas: [
      { k: 'nome', label: 'Imobiliária', v: (l) => txt(l.nome), td: (l) => `<td style="font-weight:700;">${esc(l.nome)}</td>` },
      { k: 'cidade', label: 'Cidade', v: (l) => txt(l.cidade), td: (l) => `<td>${esc(l.cidade || '—')}</td>` },
      { k: 'ultima', label: 'Última visita', v: (l) => tempo(l.ultimaGeral), td: (l) => `<td>${dataCurta(l.ultimaGeral)}</td>` },
      { k: 'dias', label: 'Sem visita há', n: 1, v: (l) => diasDesde(l.ultimaGeral), td: (l) => { const d = diasDesde(l.ultimaGeral); const cor = d >= 30 ? 'var(--red)' : d >= 7 ? 'var(--yellow)' : 'var(--green)';
        return `<td class="num" style="font-weight:800;color:${cor};">${d === 0 ? 'hoje' : d === 1 ? '1 dia' : d + ' dias'}</td>`; } },
      { k: 'totalGeral', label: 'Visitas (histórico)', n: 1, v: (l) => l.totalGeral, td: (l) => `<td class="num">${num(l.totalGeral)}</td>` },
    ],
    nunca: [
      { k: 'nome', label: 'Imobiliária', v: (l) => txt(l.nome), td: (l) => `<td style="font-weight:700;">${esc(l.nome)}</td>` },
      { k: 'cidade', label: 'Cidade', v: (l) => txt(l.cidade), td: (l) => `<td>${esc(l.cidade || '—')}</td>` },
      { k: 'estado', label: 'UF', v: (l) => txt(l.estado), td: (l) => `<td>${esc(l.estado || '—')}</td>` },
    ],
  };
  const PADRAO = { mais: { k: 'visitas', dir: -1 }, paradas: { k: 'dias', dir: -1 }, nunca: { k: 'cidade', dir: 1 } };
  const ord = I.ordem[I.aba] || PADRAO[I.aba];
  const cols = COLS[I.aba];
  const base = I.aba === 'mais' ? linhas.filter((l) => l.visitas > 0 || l.proposta > 0)
    : I.aba === 'paradas' ? linhas.filter((l) => l.ultimaGeral) : nunca;
  const col = cols.find((c) => c.k === ord.k) || cols[0];
  const arr = filtra(base).sort((a, b) => {
    const va = col.v(a), vb = col.v(b);
    if (va === null || va === undefined) return 1;            // vazios sempre no fim
    if (vb === null || vb === undefined) return -1;
    const r = typeof va === 'string' ? va.localeCompare(vb, 'pt-BR') : va - vb;
    return (r * ord.dir) || a.nome.localeCompare(b.nome, 'pt-BR');
  });
  const vazio = { mais: 'Nenhuma imobiliária visitada no período com estes filtros.', paradas: 'Nenhuma imobiliária com visita registrada.', nunca: 'Todas as imobiliárias já receberam visita. 🎉' }[I.aba];
  let html;
  if (!arr.length) html = `<p style="text-align:center;padding:30px;color:var(--fg-muted);font-size:12.5px;">${vazio}</p>`;
  else {
    const seta = (c) => c.k === ord.k ? (ord.dir > 0 ? ' ▲' : ' ▼') : '';
    const cab = '<th class="num" style="width:36px;">#</th>' + cols.map((c) =>
      `<th data-ord="${c.k}" class="${c.n ? 'num' : ''}" style="cursor:pointer;user-select:none;white-space:nowrap;${c.k === ord.k ? 'color:var(--accent);' : ''}" title="Ordenar por ${c.label}">${c.label}${seta(c)}</th>`).join('');
    const corpo = arr.slice(0, 500).map((l, i) => `<tr><td class="num" style="color:var(--fg-muted);">${i + 1}</td>${cols.map((c) => c.td(l)).join('')}</tr>`).join('');
    const mais = arr.length > 500 ? `<p style="font-size:11.5px;color:var(--fg-muted);padding:8px 0;">Mostrando 500 de ${num(arr.length)} — use a busca para encontrar uma específica.</p>` : '';
    html = `<table><thead><tr>${cab}</tr></thead><tbody>${corpo}</tbody></table>${mais}`;
  }
  $('imob-corpo').innerHTML = `<div class="card" style="padding:14px;"><div style="font-size:11px;color:var(--fg-muted);margin-bottom:6px;">Clique no título de uma coluna para ordenar.</div><div style="overflow:auto;max-height:620px;" class="scroll-thin">${html}</div></div>`;
  $('imob-corpo').querySelectorAll('th[data-ord]').forEach((th) => th.addEventListener('click', () => {
    const k = th.dataset.ord;
    const c = cols.find((x) => x.k === k);
    const atual = I.ordem[I.aba] || PADRAO[I.aba];
    // Mesma coluna: inverte. Outra: números/datas começam do maior, textos de A–Z.
    I.ordem[I.aba] = atual.k === k ? { k, dir: -atual.dir } : { k, dir: (c.n || k === 'ultima') ? -1 : 1 };
    try { sessionStorage.setItem('dash-imob-ordem', JSON.stringify(I.ordem)); } catch (e) {}
    pintar();
  }));
}

// Chamado pelo app.js quando as atividades do período mudam (filtros/atualizar)
export function atualizarImobsSeAberta() { if (I.resumo && $('sec-imobiliarias')?.style.display !== 'none') recarregarImobs(); }

export function initImobs(deps) {
  D = deps;
  document.querySelectorAll('#imob-abas .tab').forEach((b) => b.addEventListener('click', () => {
    I.aba = b.dataset.aba; sessionStorage.setItem('dash-imob-aba', I.aba); if (I.resumo) pintar();
  }));
  let t = null;
  $('imob-busca')?.addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { I.busca = e.target.value; if (I.resumo) pintar(); }, 150); });
}
