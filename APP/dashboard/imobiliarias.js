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
const I = { aba: sessionStorage.getItem('dash-imob-aba') || 'mais', busca: '', resumo: null, carregando: false };

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
  let html = '';
  if (I.aba === 'mais') {
    const arr = filtra(linhas.filter((l) => l.visitas > 0 || l.proposta > 0))
      .sort((a, b) => b.visitas - a.visitas || b.proposta - a.proposta || b.vgv - a.vgv || a.nome.localeCompare(b.nome));
    html = tabela(['#', 'Imobiliária', 'Cidade', 'Check-ins', 'Atendimentos', 'Visitas', 'Propostas', 'Vendas', 'Última visita', 'Gerentes'],
      arr.map((l, i) => `<tr><td class="num" style="color:var(--fg-muted);">${i + 1}</td><td style="font-weight:700;">${esc(l.nome)}</td><td>${esc(l.cidade || '—')}</td>
        <td class="num">${num(l.checkin)}</td><td class="num">${num(l.atendimento)}</td><td class="num" style="font-weight:800;">${num(l.visitas)}</td>
        <td class="num">${num(l.proposta)}</td><td class="num" style="color:var(--green);">${num(l.vendas)}</td>
        <td>${dataCurta(l.ultima || l.ultimaGeral)}</td><td style="font-size:11.5px;color:var(--fg-muted);">${esc([...l.gerentes].join(', ') || '—')}</td></tr>`),
      'Nenhuma imobiliária visitada no período com estes filtros.');
  } else if (I.aba === 'paradas') {
    const arr = filtra(linhas.filter((l) => l.ultimaGeral)).sort((a, b) => new Date(a.ultimaGeral) - new Date(b.ultimaGeral));
    html = tabela(['Imobiliária', 'Cidade', 'Última visita', 'Sem visita há', 'Visitas (histórico)'],
      arr.map((l) => { const d = diasDesde(l.ultimaGeral); const cor = d >= 30 ? 'var(--red)' : d >= 7 ? 'var(--yellow)' : 'var(--green)';
        return `<tr><td style="font-weight:700;">${esc(l.nome)}</td><td>${esc(l.cidade || '—')}</td><td>${dataCurta(l.ultimaGeral)}</td>
          <td style="font-weight:800;color:${cor};">${d === 0 ? 'hoje' : d === 1 ? '1 dia' : d + ' dias'}</td><td class="num">${num(l.totalGeral)}</td></tr>`; }),
      'Nenhuma imobiliária com visita registrada.');
  } else {
    const arr = filtra(nunca).sort((a, b) => (a.cidade || '').localeCompare(b.cidade || '') || a.nome.localeCompare(b.nome));
    html = tabela(['Imobiliária', 'Cidade', 'UF'],
      arr.map((l) => `<tr><td style="font-weight:700;">${esc(l.nome)}</td><td>${esc(l.cidade || '—')}</td><td>${esc(l.estado || '—')}</td></tr>`),
      'Todas as imobiliárias já receberam visita. 🎉');
  }
  $('imob-corpo').innerHTML = `<div class="card" style="padding:14px;"><div style="overflow:auto;max-height:620px;" class="scroll-thin">${html}</div></div>`;
}

function tabela(cab, linhas, vazio) {
  if (!linhas.length) return `<p style="text-align:center;padding:30px;color:var(--fg-muted);font-size:12.5px;">${vazio}</p>`;
  const mais = linhas.length > 500 ? `<p style="font-size:11.5px;color:var(--fg-muted);padding:8px 0;">Mostrando 500 de ${num(linhas.length)} — use a busca para encontrar uma específica.</p>` : '';
  return `<table><thead><tr>${cab.map((c) => `<th${/Check|Atend|Visitas|Propostas|Vendas|#/.test(c) ? ' class="num"' : ''}>${c}</th>`).join('')}</tr></thead>
    <tbody>${linhas.slice(0, 500).join('')}</tbody></table>${mais}`;
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
