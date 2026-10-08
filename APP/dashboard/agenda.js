// ═════════════════════════════════════════════════════════════════════════
// Imob Rottas · Dashboard — seção AGENDA
//
// Visão dos agendamentos da equipe com navegação igual à Agenda do app:
//   Dia · Semana (domingo a sábado) · Mês, com ‹ › e "Hoje".
// Tem período PRÓPRIO (agenda olha pra frente; o filtro "30 dias" do topo olha
// pra trás), mas respeita os demais filtros do topo (estado, cidade, gerente,
// empreendimento, imobiliária) e o ESCOPO de cada perfil (allowedGerenteIds).
//
// Dependências recebidas por initAgenda() (evita import circular com app.js).
// ═════════════════════════════════════════════════════════════════════════

let D = null;   // { sb, state, toast }
const A = {
  modo: sessionStorage.getItem('dash-ag-modo') || 'semana',   // dia | semana | mes
  cursor: new Date(),
  status: 'todos',     // todos | pendente | atrasado | realizado | cancelado
  tipo: 'todos',       // todos | checkin | atendimento | outro
  itens: [],
  carregando: false,
};

const TIPOS = {
  checkin:     { label: 'Check-in',    cor: '#3B82F6', emoji: '📍' },
  atendimento: { label: 'Atendimento', cor: '#A855F7', emoji: '👥' },
  outro:       { label: 'Outro',       cor: '#94A3B8', emoji: '📅' },
};
const STATUS = {
  pendente:  { label: 'Pendente',  chip: 'chip-yellow' },
  atrasado:  { label: 'Atrasado',  chip: 'chip-red' },
  realizado: { label: 'Realizado', chip: 'chip-green' },
  cancelado: { label: 'Cancelado', chip: 'chip-gray' },
};
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inicioDia = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const mesmoDia = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const hora = (d) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const maiuscula = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const primeiroNome = (n) => String(n || '').trim().split(/\s+/)[0] || '—';

// Status "efetivo": pendente com horário que já passou vira ATRASADO.
function statusDe(ag) {
  if (ag.status === 'pendente' && new Date(ag.data_prevista) < new Date()) return 'atrasado';
  return STATUS[ag.status] ? ag.status : 'pendente';
}
function tituloDe(ag) {
  if (ag.tipo === 'outro') return ag.titulo || ag.imobiliaria || 'Outro';
  return ag.imobiliaria || ag.titulo || (TIPOS[ag.tipo] || TIPOS.outro).label;
}

function intervalo() {
  const c = inicioDia(A.cursor);
  if (A.modo === 'dia') { const fim = new Date(c); fim.setDate(fim.getDate() + 1); return { de: c, ate: fim }; }
  if (A.modo === 'mes') return { de: new Date(c.getFullYear(), c.getMonth(), 1), ate: new Date(c.getFullYear(), c.getMonth() + 1, 1) };
  const de = new Date(c); de.setDate(de.getDate() - de.getDay());
  const ate = new Date(de); ate.setDate(ate.getDate() + 7);
  return { de, ate };
}
function rotulo() {
  const { de, ate } = intervalo();
  if (A.modo === 'dia') return maiuscula(de.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
  if (A.modo === 'mes') return maiuscula(de.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }));
  const fim = new Date(ate.getTime() - 1);
  const a = de.toLocaleDateString('pt-BR', de.getMonth() === fim.getMonth() ? { day: 'numeric' } : { day: 'numeric', month: 'short' });
  return `${a} a ${fim.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })}`.replace(/\./g, '');
}

// ─── Dados ─────────────────────────────────────────────────────────────────
async function buscar() {
  const { sb, state } = D;
  const { de, ate } = intervalo();
  const F = state.filters;
  let q = sb.from('agendamentos')
    .select('id, gerente_id, tipo, data_prevista, imobiliaria, empreendimento, cliente, corretor, titulo, observacoes, status, motivo_visita, local_visita, realizado_em, cancelado_motivo, motivo_cancelamento, remarcada, recorrencia_freq, teste, created_at, registrado_em, profiles!agendamentos_gerente_id_fkey(nome, cidade, estado, role)')
    .gte('data_prevista', de.toISOString()).lt('data_prevista', ate.toISOString())
    .order('data_prevista', { ascending: true }).limit(3000);
  // Contas de teste ficam fora (null-safe: .neq sozinho descarta teste=NULL)
  if (!state.profile?.conta_teste) q = q.or('teste.is.null,teste.eq.false');
  if (F.gerente !== 'todos') q = q.eq('gerente_id', F.gerente);
  if (F.imob !== 'todas') q = q.eq('imobiliaria', F.imob);
  if (F.empreend !== 'todos') q = q.eq('empreendimento', F.empreend);
  const { data, error } = await q;
  if (error) throw error;
  let rows = data || [];
  if (F.estado !== 'todos') rows = rows.filter((r) => r.profiles?.estado === F.estado);
  if (F.cidade !== 'todas') rows = rows.filter((r) => r.profiles?.cidade === F.cidade);
  const allowed = state.data.allowedGerenteIds;
  if (allowed) rows = rows.filter((r) => allowed.has(r.gerente_id));
  return rows;
}

export async function recarregarAgenda() {
  if (!D || A.carregando) return;
  A.carregando = true;
  const corpo = $('agenda-corpo');
  if (corpo) corpo.innerHTML = '<div style="padding:40px;text-align:center;color:var(--fg-muted);font-size:13px;">Carregando agenda...</div>';
  try {
    A.itens = await buscar();
    pintar();
  } catch (e) {
    console.error('[agenda]', e);
    if (corpo) corpo.innerHTML = `<div class="card" style="padding:18px;font-size:13px;"><b style="color:var(--red);">Não foi possível carregar a agenda.</b><div style="color:var(--fg-muted);margin:6px 0 10px;">${esc(e.message || e)}</div><button class="btn btn-secondary" id="agenda-tentar">↻ Tentar de novo</button></div>`;
    $('agenda-tentar')?.addEventListener('click', recarregarAgenda);
  } finally {
    A.carregando = false;
  }
}

// ─── Desenho ───────────────────────────────────────────────────────────────
function filtrados() {
  return A.itens.filter((ag) =>
    (A.status === 'todos' || statusDe(ag) === A.status) &&
    (A.tipo === 'todos' || (TIPOS[ag.tipo] ? ag.tipo : 'outro') === A.tipo));
}

function kpi(label, valor, sub, cor) {
  return `<div class="kpi" style="${cor ? `border-left:3px solid ${cor};` : ''}">
    <div class="kpi-label">${label}</div>
    <div class="kpi-value" ${cor ? `style="color:${cor}"` : ''}>${valor}</div>
    <div class="kpi-sub">${sub}</div></div>`;
}

function pintarKpis() {
  const t = A.itens;   // KPIs sobre o período inteiro (independem dos chips)
  const n = (s) => t.filter((a) => statusDe(a) === s).length;
  const realizados = n('realizado'), atrasados = n('atrasado'), pendentes = n('pendente'), cancelados = n('cancelado');
  const base = realizados + atrasados;
  const taxa = base ? Math.round((realizados / base) * 100) : null;
  $('agenda-kpis').innerHTML = [
    kpi('Agendados', t.length, `${new Set(t.map((a) => a.gerente_id)).size} gerente(s)`),
    kpi('Realizados', realizados, 'já viraram registro', 'var(--green)'),
    kpi('A fazer', pendentes, 'ainda vão acontecer', 'var(--yellow)'),
    kpi('Atrasados', atrasados, 'passou do horário e não registrou', 'var(--red)'),
    kpi('Cancelados', cancelados, 'no período', 'var(--fg-muted)'),
    kpi('Taxa de realização', taxa === null ? 'N/D' : `${taxa}%`, 'realizados ÷ (realizados + atrasados)', taxa === null ? null : (taxa >= 80 ? 'var(--green)' : taxa >= 50 ? 'var(--yellow)' : 'var(--red)')),
  ].join('');
}

function cartao(ag, compacto) {
  const t = TIPOS[ag.tipo] || TIPOS.outro;
  const st = statusDe(ag);
  const d = new Date(ag.data_prevista);
  const riscado = st === 'cancelado' ? 'text-decoration:line-through;opacity:.6;' : '';
  return `<div class="ag-card" data-id="${ag.id}" title="Ver detalhes"
      style="border-left:3px solid ${t.cor};background:var(--bg-elev);border-radius:8px;padding:${compacto ? '6px 8px' : '9px 11px'};cursor:pointer;display:flex;flex-direction:column;gap:2px;${riscado}">
    <div style="display:flex;align-items:center;gap:6px;font-size:11px;white-space:nowrap;">
      <b style="font-variant-numeric:tabular-nums;">${hora(d)}</b>
      <span style="color:${t.cor};font-weight:700;" title="${t.label}">${t.emoji}${compacto ? '' : ' ' + t.label}</span>
      <span class="chip ${STATUS[st].chip}" style="margin-left:auto;font-size:9.5px;padding:1px 6px;flex-shrink:0;">${STATUS[st].label}</span>
    </div>
    <div style="font-size:12.5px;font-weight:700;line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(tituloDe(ag))}</div>
    <div style="font-size:11px;color:var(--fg-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">👤 ${esc(ag.profiles?.nome || '—')}${ag.cliente ? ` · ${esc(ag.cliente)}` : ''}</div>
  </div>`;
}

function vistaDia(lista) {
  if (!lista.length) return vazio('Nenhum agendamento neste dia.');
  return `<div style="display:flex;flex-direction:column;gap:8px;">${lista.map((a) => cartao(a, false)).join('')}</div>`;
}

function vistaSemana(lista) {
  const { de } = intervalo();
  const hoje = new Date();
  const cols = [];
  for (let i = 0; i < 7; i++) {
    const dia = new Date(de); dia.setDate(de.getDate() + i);
    const doDia = lista.filter((a) => mesmoDia(new Date(a.data_prevista), dia));
    const ehHoje = mesmoDia(dia, hoje);
    cols.push(`<div style="min-width:150px;display:flex;flex-direction:column;gap:6px;">
      <button class="ag-dia" data-dia="${dia.toISOString()}" title="Abrir o dia"
        style="all:unset;cursor:pointer;display:flex;align-items:baseline;gap:6px;padding:6px 8px;border-radius:8px;${ehHoje ? 'background:var(--accent);color:#fff;' : 'background:var(--bg-elev);'}">
        <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;">${DIAS[i]}</span>
        <span style="font-size:15px;font-weight:800;">${dia.getDate()}</span>
        <span style="margin-left:auto;font-size:10.5px;opacity:.8;">${doDia.length || ''}</span>
      </button>
      ${doDia.length ? doDia.map((a) => cartao(a, true)).join('') : '<div style="font-size:11px;color:var(--fg-muted);text-align:center;padding:10px 0;">—</div>'}
    </div>`);
  }
  return `<div class="scroll-thin" style="display:grid;grid-template-columns:repeat(7,minmax(150px,1fr));gap:8px;overflow-x:auto;padding-bottom:4px;">${cols.join('')}</div>`;
}

function vistaMes(lista) {
  const { de } = intervalo();
  const inicioGrade = new Date(de); inicioGrade.setDate(de.getDate() - de.getDay());
  const hoje = new Date();
  const celulas = [];
  for (let i = 0; i < 42; i++) {
    const dia = new Date(inicioGrade); dia.setDate(inicioGrade.getDate() + i);
    if (i >= 35 && dia.getMonth() !== de.getMonth()) break;   // 6ª linha só se precisar
    const doMes = dia.getMonth() === de.getMonth();
    const doDia = lista.filter((a) => mesmoDia(new Date(a.data_prevista), dia));
    const linhas = doDia.slice(0, 3).map((a) => {
      const t = TIPOS[a.tipo] || TIPOS.outro;
      return `<div style="font-size:10.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${statusDe(a) === 'cancelado' ? 'text-decoration:line-through;opacity:.55;' : ''}">
        <span style="color:${t.cor};">●</span> ${hora(new Date(a.data_prevista))} ${esc(primeiroNome(a.profiles?.nome))} · ${esc(tituloDe(a))}</div>`;
    }).join('');
    const atrasados = doDia.filter((a) => statusDe(a) === 'atrasado').length;
    celulas.push(`<button class="ag-dia" data-dia="${dia.toISOString()}" title="Abrir o dia"
      style="all:unset;cursor:pointer;min-height:86px;padding:6px;border-radius:8px;border:1px solid var(--border);display:flex;flex-direction:column;gap:2px;${doMes ? '' : 'opacity:.35;'}${mesmoDia(dia, hoje) ? 'border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent);' : ''}">
      <div style="display:flex;align-items:center;gap:4px;">
        <span style="font-size:12px;font-weight:800;">${dia.getDate()}</span>
        ${atrasados ? `<span class="chip chip-red" style="font-size:9px;padding:0 5px;">${atrasados} atras.</span>` : ''}
        ${doDia.length ? `<span style="margin-left:auto;font-size:10px;color:var(--fg-muted);font-weight:700;">${doDia.length}</span>` : ''}
      </div>
      ${linhas}${doDia.length > 3 ? `<div style="font-size:10px;color:var(--accent);font-weight:700;">+${doDia.length - 3} mais</div>` : ''}
    </button>`);
  }
  return `<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:4px;">${DIAS.map((d) => `<div style="font-size:10.5px;font-weight:700;color:var(--fg-muted);text-transform:uppercase;text-align:center;">${d}</div>`).join('')}</div>
    <div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;">${celulas.join('')}</div>`;
}

function vazio(txt) {
  return `<div style="padding:34px;text-align:center;color:var(--fg-muted);font-size:13px;">${txt}</div>`;
}

// Resumo por gerente (cumprimento da agenda no período)
function tabelaGerentes() {
  const mapa = new Map();
  for (const a of A.itens) {
    const k = a.gerente_id;
    if (!mapa.has(k)) mapa.set(k, { nome: a.profiles?.nome || '—', total: 0, realizado: 0, pendente: 0, atrasado: 0, cancelado: 0 });
    const g = mapa.get(k); g.total++; g[statusDe(a)]++;
  }
  const linhas = [...mapa.values()].sort((a, b) => b.total - a.total);
  if (!linhas.length) return '';
  return `<div class="card" style="padding:14px;margin-top:16px;">
    <h3 style="font-size:13px;font-weight:700;margin-bottom:10px;">Cumprimento da agenda por gerente</h3>
    <div style="overflow-x:auto;" class="scroll-thin"><table>
      <thead><tr><th>Gerente</th><th class="num">Agendados</th><th class="num">Realizados</th><th class="num">A fazer</th><th class="num">Atrasados</th><th class="num">Cancelados</th><th class="num">Realização</th></tr></thead>
      <tbody>${linhas.map((g) => {
        const base = g.realizado + g.atrasado;
        const tx = base ? Math.round((g.realizado / base) * 100) : null;
        const cor = tx === null ? 'var(--fg-muted)' : tx >= 80 ? 'var(--green)' : tx >= 50 ? 'var(--yellow)' : 'var(--red)';
        return `<tr><td style="font-weight:600;">${esc(g.nome)}</td><td class="num">${g.total}</td><td class="num" style="color:var(--green);">${g.realizado}</td>
          <td class="num">${g.pendente}</td><td class="num" style="color:${g.atrasado ? 'var(--red)' : 'inherit'};">${g.atrasado}</td><td class="num">${g.cancelado}</td>
          <td class="num" style="font-weight:800;color:${cor};">${tx === null ? 'N/D' : tx + '%'}</td></tr>`;
      }).join('')}</tbody></table></div></div>`;
}

function pintar() {
  $('agenda-rotulo').textContent = rotulo();
  document.querySelectorAll('#agenda-modos .tab').forEach((b) => b.classList.toggle('active', b.dataset.modo === A.modo));
  document.querySelectorAll('#agenda-status .tab').forEach((b) => b.classList.toggle('active', b.dataset.status === A.status));
  document.querySelectorAll('#agenda-tipos .tab').forEach((b) => b.classList.toggle('active', b.dataset.tipo === A.tipo));
  pintarKpis();
  const lista = filtrados();
  const corpo = $('agenda-corpo');
  const vista = A.modo === 'dia' ? vistaDia(lista) : A.modo === 'mes' ? vistaMes(lista) : vistaSemana(lista);
  corpo.innerHTML = `<div class="card" style="padding:12px;">${vista}</div>${tabelaGerentes()}`;
  corpo.querySelectorAll('.ag-card').forEach((c) => c.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const ag = A.itens.find((x) => x.id === c.dataset.id); if (ag) abrirDetalhe(ag);
  }));
  corpo.querySelectorAll('.ag-dia').forEach((b) => b.addEventListener('click', () => {
    A.cursor = new Date(b.dataset.dia); A.modo = 'dia'; sessionStorage.setItem('dash-ag-modo', 'dia'); recarregarAgenda();
  }));
  const badge = $('badge-agenda'); if (badge) badge.textContent = String(A.itens.filter((a) => statusDe(a) === 'atrasado').length || '');
}

// ─── Detalhe ──────────────────────────────────────────────────────────────
function abrirDetalhe(ag) {
  const t = TIPOS[ag.tipo] || TIPOS.outro;
  const st = statusDe(ag);
  const linha = (k, v) => (v === null || v === undefined || v === '') ? '' :
    `<div style="display:flex;gap:10px;padding:7px 0;border-bottom:1px solid var(--border);font-size:12.5px;"><span style="color:var(--fg-muted);min-width:140px;">${k}</span><span style="font-weight:600;word-break:break-word;">${esc(v)}</span></div>`;
  const dt = (v) => v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:200;display:flex;align-items:center;justify-content:center;padding:16px;';
  ov.innerHTML = `<div class="card" style="width:100%;max-width:520px;max-height:85vh;overflow:auto;padding:18px;">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
      <span style="font-size:20px;">${t.emoji}</span>
      <div style="flex:1;"><div style="font-weight:800;font-size:15px;">${esc(tituloDe(ag))}</div>
        <div style="font-size:12px;color:var(--fg-muted);">${t.label} · ${dt(ag.data_prevista)}</div></div>
      <span class="chip ${STATUS[st].chip}">${STATUS[st].label}</span>
    </div>
    ${linha('Gerente', ag.profiles?.nome)}
    ${linha('Imobiliária', ag.imobiliaria)}
    ${linha('Empreendimento', ag.empreendimento)}
    ${linha('Cliente', ag.cliente)}
    ${linha('Corretor', ag.corretor)}
    ${linha('Motivo', ag.motivo_visita)}
    ${linha('Local', ag.local_visita)}
    ${linha('Observações', ag.observacoes)}
    ${linha('Recorrência', ag.recorrencia_freq)}
    ${linha('Remarcado', ag.remarcada ? 'sim' : null)}
    ${linha('Realizado em', dt(ag.realizado_em))}
    ${linha('Motivo do cancelamento', ag.motivo_cancelamento || ag.cancelado_motivo)}
    ${linha('Agendado em', dt(ag.registrado_em || ag.created_at))}
    <div style="text-align:right;margin-top:14px;"><button class="btn btn-primary" id="ag-fechar">Fechar</button></div>
  </div>`;
  const fechar = () => ov.remove();
  ov.addEventListener('click', (e) => { if (e.target === ov) fechar(); });
  document.body.appendChild(ov);
  ov.querySelector('#ag-fechar').addEventListener('click', fechar);
}

// ─── Inicialização ────────────────────────────────────────────────────────
export function initAgenda(deps) {
  D = deps;
  const mover = (dir) => {
    const c = new Date(A.cursor);
    if (A.modo === 'dia') c.setDate(c.getDate() + dir);
    else if (A.modo === 'semana') c.setDate(c.getDate() + 7 * dir);
    else { c.setDate(1); c.setMonth(c.getMonth() + dir); }
    A.cursor = c; recarregarAgenda();
  };
  $('agenda-ant')?.addEventListener('click', () => mover(-1));
  $('agenda-prox')?.addEventListener('click', () => mover(1));
  $('agenda-hoje')?.addEventListener('click', () => { A.cursor = new Date(); recarregarAgenda(); });
  document.querySelectorAll('#agenda-modos .tab').forEach((b) => b.addEventListener('click', () => {
    A.modo = b.dataset.modo; sessionStorage.setItem('dash-ag-modo', A.modo); recarregarAgenda();
  }));
  document.querySelectorAll('#agenda-status .tab').forEach((b) => b.addEventListener('click', () => { A.status = b.dataset.status; pintar(); }));
  document.querySelectorAll('#agenda-tipos .tab').forEach((b) => b.addEventListener('click', () => { A.tipo = b.dataset.tipo; pintar(); }));
}
