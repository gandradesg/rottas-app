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

function kpi(label, valor, sub, cor, aba) {
  return `<div class="kpi clicavel${aba === I.aba ? ' ativo' : ''}" data-ir="${aba}" title="Ver na lista" style="${cor ? `border-left:3px solid ${cor};` : ''}"><div class="kpi-label">${label}</div>
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
    kpi('Imobiliárias', num(total), 'na carteira (escopo + filtros)', null, 'todas'),
    kpi('Visitadas no período', num(visitadasPeriodo), `${cobertura}% de cobertura`, cobertura >= 60 ? 'var(--green)' : cobertura >= 30 ? 'var(--yellow)' : 'var(--red)', 'mais'),
    kpi('Visitas no período', num(visitasPeriodo), 'check-ins + atendimentos', null, 'visitas'),
    kpi('Sem visita há 30+ dias', num(sem30.length), 'já visitadas, mas paradas', 'var(--yellow)', 'p30'),
    kpi('Nunca visitadas', num(nunca.length), 'nenhuma visita no histórico', 'var(--red)', 'nunca'),
  ].join('');
  // Cartões são atalhos: abrem a lista já filtrada (e ordenada) no que mostram.
  $('imob-kpis').querySelectorAll('[data-ir]').forEach((c) => c.addEventListener('click', () => {
    const ir = c.dataset.ir;
    if (ir === 'visitas') { I.aba = 'mais'; I.ordem.mais = { k: 'visitas', dir: -1 }; }
    else I.aba = ir;
    sessionStorage.setItem('dash-imob-aba', I.aba);
    pintar();
    $('imob-abas')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  document.querySelectorAll('#imob-abas .tab').forEach((b) => {
    b.classList.toggle('active', b.dataset.aba === I.aba);
    const n = { todas: total, mais: visitadasPeriodo, p30: sem30.length, paradas: linhas.filter((l) => l.ultimaGeral).length, nunca: nunca.length }[b.dataset.aba];
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
      { k: 'dias', label: 'Sem visita há', n: 1, v: (l) => diasDesde(l.ultimaGeral), td: (l) => celulaDias(l) },
      { k: 'totalGeral', label: 'Visitas (histórico)', n: 1, v: (l) => l.totalGeral, td: (l) => `<td class="num">${num(l.totalGeral)}</td>` },
    ],
    todas: [
      { k: 'nome', label: 'Imobiliária', v: (l) => txt(l.nome), td: (l) => `<td style="font-weight:700;">${esc(l.nome)}</td>` },
      { k: 'cidade', label: 'Cidade', v: (l) => txt(l.cidade), td: (l) => `<td>${esc(l.cidade || '—')}</td>` },
      { k: 'visitas', label: 'Visitas no período', n: 1, v: (l) => l.visitas, td: (l) => `<td class="num" style="font-weight:800;">${num(l.visitas)}</td>` },
      { k: 'proposta', label: 'Propostas', n: 1, v: (l) => l.proposta, td: (l) => `<td class="num">${num(l.proposta)}</td>` },
      { k: 'ultima', label: 'Última visita', v: (l) => tempo(l.ultimaGeral), td: (l) => `<td>${l.ultimaGeral ? dataCurta(l.ultimaGeral) : '<span style="color:var(--red);font-weight:700;">nunca</span>'}</td>` },
      { k: 'dias', label: 'Sem visita há', n: 1, v: (l) => l.ultimaGeral ? diasDesde(l.ultimaGeral) : null, td: (l) => celulaDias(l) },
      { k: 'totalGeral', label: 'Visitas (histórico)', n: 1, v: (l) => l.totalGeral, td: (l) => `<td class="num">${num(l.totalGeral)}</td>` },
    ],
    nunca: [
      { k: 'nome', label: 'Imobiliária', v: (l) => txt(l.nome), td: (l) => `<td style="font-weight:700;">${esc(l.nome)}</td>` },
      { k: 'cidade', label: 'Cidade', v: (l) => txt(l.cidade), td: (l) => `<td>${esc(l.cidade || '—')}</td>` },
      { k: 'estado', label: 'UF', v: (l) => txt(l.estado), td: (l) => `<td>${esc(l.estado || '—')}</td>` },
    ],
  };
  COLS.p30 = COLS.paradas;
  const PADRAO = { todas: { k: 'nome', dir: 1 }, mais: { k: 'visitas', dir: -1 }, p30: { k: 'dias', dir: -1 }, paradas: { k: 'dias', dir: -1 }, nunca: { k: 'cidade', dir: 1 } };
  const ord = I.ordem[I.aba] || PADRAO[I.aba];
  const cols = COLS[I.aba];
  const base = I.aba === 'todas' ? linhas
    : I.aba === 'mais' ? linhas.filter((l) => l.visitas > 0 || l.proposta > 0)
    : I.aba === 'p30' ? sem30
    : I.aba === 'paradas' ? linhas.filter((l) => l.ultimaGeral) : nunca;
  const col = cols.find((c) => c.k === ord.k) || cols[0];
  const arr = filtra(base).sort((a, b) => {
    const va = col.v(a), vb = col.v(b);
    if (va === null || va === undefined) return 1;            // vazios sempre no fim
    if (vb === null || vb === undefined) return -1;
    const r = typeof va === 'string' ? va.localeCompare(vb, 'pt-BR') : va - vb;
    return (r * ord.dir) || a.nome.localeCompare(b.nome, 'pt-BR');
  });
  const vazio = { todas: 'Nenhuma imobiliária com estes filtros.', p30: 'Nenhuma imobiliária parada há 30+ dias. 🎉', mais: 'Nenhuma imobiliária visitada no período com estes filtros.', paradas: 'Nenhuma imobiliária com visita registrada.', nunca: 'Todas as imobiliárias já receberam visita. 🎉' }[I.aba];
  let html;
  if (!arr.length) html = `<p style="text-align:center;padding:30px;color:var(--fg-muted);font-size:12.5px;">${vazio}</p>`;
  else {
    const seta = (c) => c.k === ord.k ? (ord.dir > 0 ? ' ▲' : ' ▼') : '';
    const cab = '<th class="num" style="width:36px;">#</th>' + cols.map((c) =>
      `<th data-ord="${c.k}" class="${c.n ? 'num' : ''}" style="cursor:pointer;user-select:none;white-space:nowrap;${c.k === ord.k ? 'color:var(--accent);' : ''}" title="Ordenar por ${c.label}">${c.label}${seta(c)}</th>`).join('');
    const corpo = arr.slice(0, 500).map((l, i) => `<tr class="linha-clicavel" data-imob="${esc(l.nome)}" title="Ver detalhes"><td class="num" style="color:var(--fg-muted);">${i + 1}</td>${cols.map((c) => c.td(l)).join('')}</tr>`).join('');
    const mais = arr.length > 500 ? `<p style="font-size:11.5px;color:var(--fg-muted);padding:8px 0;">Mostrando 500 de ${num(arr.length)} — use a busca para encontrar uma específica.</p>` : '';
    html = `<table><thead><tr>${cab}</tr></thead><tbody>${corpo}</tbody></table>${mais}`;
  }
  $('imob-corpo').innerHTML = `<div class="card" style="padding:14px;"><div style="font-size:11px;color:var(--fg-muted);margin-bottom:6px;">Clique no título de uma coluna para ordenar.</div><div style="overflow:auto;max-height:620px;" class="scroll-thin">${html}</div></div>`;
  $('imob-corpo').querySelectorAll('tr[data-imob]').forEach((tr) => tr.addEventListener('click', () => {
    const l = linhas.find((x) => x.nome === tr.dataset.imob); if (l) detalhe(l);
  }));
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

function celulaDias(l) {
  if (!l.ultimaGeral) return '<td class="num" style="color:var(--fg-muted);">—</td>';
  const d = diasDesde(l.ultimaGeral); const cor = d >= 30 ? 'var(--red)' : d >= 7 ? 'var(--yellow)' : 'var(--green)';
  return `<td class="num" style="font-weight:800;color:${cor};">${d === 0 ? 'hoje' : d === 1 ? '1 dia' : d + ' dias'}</td>`;
}

// Detalhe de UMA imobiliária: números do período + cada registro (clicável) e
// atalho para filtrar o dashboard inteiro por ela.
const TIPO_ROT = { checkin: '📍 Check-in', atendimento: '👥 Atendimento', proposta: '📄 Proposta', orulo: '🌐 Órulo', outro: '📅 Outro' };
function detalhe(l) {
  const k = chave(l.nome);
  const regs = (D.state.data.atividades || []).filter((a) => chave(a.imobiliaria) === k)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:200;display:flex;align-items:center;justify-content:center;padding:16px;';
  const info = (r, v) => `<div class="kpi" style="padding:10px 12px;"><div class="kpi-label">${r}</div><div class="kpi-value" style="font-size:20px;">${v}</div></div>`;
  ov.innerHTML = `<div class="card" style="width:100%;max-width:640px;max-height:86vh;overflow:auto;padding:18px;display:flex;flex-direction:column;gap:12px;">
    <div style="display:flex;align-items:flex-start;gap:10px;">
      <div style="flex:1;"><div style="font-weight:800;font-size:16px;">🏢 ${esc(l.nome)}</div>
        <div style="font-size:12px;color:var(--fg-muted);">${esc([l.cidade, l.estado].filter(Boolean).join(' · ') || '—')} · última visita: ${l.ultimaGeral ? dataCurta(l.ultimaGeral) + ` (${diasDesde(l.ultimaGeral) === 0 ? "hoje" : diasDesde(l.ultimaGeral) === 1 ? "1 dia" : diasDesde(l.ultimaGeral) + " dias"})` : '<b style="color:var(--red);">nunca visitada</b>'}</div></div>
      <button class="btn btn-secondary" data-x>Fechar</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;">
      ${info('Check-ins', num(l.checkin))}${info('Atendimentos', num(l.atendimento))}${info('Propostas', num(l.proposta))}${info('Vendas', num(l.vendas))}${info('Visitas (histórico)', num(l.totalGeral))}
    </div>
    <div style="font-size:12px;font-weight:700;">Registros no período (${regs.length}) <span style="font-weight:400;color:var(--fg-muted);">— clique para abrir</span></div>
    <div style="display:flex;flex-direction:column;gap:6px;">${regs.length ? regs.slice(0, 100).map((a) => `
      <a href="/#/atividade/${a.id}" target="_blank" class="card" style="padding:8px 10px;display:flex;gap:10px;align-items:center;text-decoration:none;color:inherit;font-size:12.5px;">
        <span style="min-width:110px;font-weight:700;">${TIPO_ROT[a.tipo] || a.tipo}</span>
        <span style="flex:1;color:var(--fg-muted);">${esc(a.profiles?.nome || '—')}${a.cliente ? ' · ' + esc(a.cliente) : ''}${a.motivo_visita ? ' · ' + esc(a.motivo_visita) : ''}</span>
        <span style="white-space:nowrap;">${new Date(a.created_at).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></a>`).join('')
      : '<div style="font-size:12.5px;color:var(--fg-muted);padding:8px 0;">Nenhum registro no período selecionado.</div>'}</div>
    <div style="display:flex;justify-content:flex-end;"><button class="btn btn-primary" data-filtrar>Filtrar o dashboard por esta imobiliária</button></div>
  </div>`;
  const fechar = () => ov.remove();
  ov.addEventListener('click', (e) => { if (e.target === ov) fechar(); });
  ov.querySelector('[data-x]').addEventListener('click', fechar);
  ov.querySelector('[data-filtrar]').addEventListener('click', () => {
    fechar();
    const sel = document.getElementById('f-imob');
    if (sel) { sel.value = l.nome; sel.dispatchEvent(new Event('change')); }
  });
  document.body.appendChild(ov);
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
