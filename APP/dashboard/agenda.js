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
    .select('id, gerente_id, grupo_id, recorrencia_id, participantes, data_fim, remarcacoes, data_prevista_original, tipo, data_prevista, imobiliaria, empreendimento, cliente, corretor, titulo, observacoes, status, motivo_visita, local_visita, realizado_em, cancelado_motivo, motivo_cancelamento, remarcada, recorrencia_freq, teste, created_at, registrado_em, profiles!agendamentos_gerente_id_fkey(nome, cidade, estado, role)')
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
  return juntarCompartilhadas(rows, state.profile?.id);
}

// Agenda COMPARTILHADA: cada presente tem a sua linha (mesmo grupo_id). Aqui
// vira UM cartão só, com o nome de todos (ex.: Marjorie + Bruno). Mantém a
// linha do próprio usuário quando ele é um dos presentes.
function juntarCompartilhadas(rows, meuId) {
  const porGrupo = new Map(); const saida = [];
  for (const r of rows) {
    const nome = r.profiles?.nome;
    if (!r.grupo_id) { saida.push({ ...r, _nomes: nome ? [nome] : [], _ids: [r.gerente_id] }); continue; }
    const ja = porGrupo.get(r.grupo_id);
    if (!ja) { const c = { ...r, _nomes: nome ? [nome] : [], _ids: [r.gerente_id] }; porGrupo.set(r.grupo_id, c); saida.push(c); continue; }
    if (nome && !ja._nomes.includes(nome)) ja._nomes.push(nome);
    if (!ja._ids.includes(r.gerente_id)) ja._ids.push(r.gerente_id);
    if (r.gerente_id === meuId && ja.gerente_id !== meuId) { const { _nomes, _ids } = ja; Object.assign(ja, r, { _nomes, _ids }); }
  }
  return saida;
}
const nomesDe = (ag) => (ag._nomes && ag._nomes.length ? ag._nomes : [ag.profiles?.nome || '—']);

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
    kpi('Agendados', t.length, `${new Set(t.flatMap((a) => a._ids || [a.gerente_id])).size} gerente(s)`),
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
      <b style="font-variant-numeric:tabular-nums;">${hora(d)}${ag.data_fim ? '–' + hora(new Date(ag.data_fim)) : ''}</b>
      <span style="color:${t.cor};font-weight:700;" title="${t.label}">${t.emoji}${compacto ? '' : ' ' + t.label}</span>
      <span class="chip ${STATUS[st].chip}" style="margin-left:auto;font-size:9.5px;padding:1px 6px;flex-shrink:0;">${STATUS[st].label}</span>
    </div>
    <div style="font-size:12.5px;font-weight:700;line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(tituloDe(ag))}</div>
    <div style="font-size:11px;color:var(--fg-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${nomesDe(ag).length > 1 ? '👥' : '👤'} ${esc(nomesDe(ag).map(primeiroNome).join(', '))}${ag.cliente ? ` · ${esc(ag.cliente)}` : ''}</div>
  </div>`;
}

function vistaDia(lista) {
  const { de } = intervalo();
  const novo = `<button class="ag-novo btn btn-secondary" data-dia="${de.toISOString()}" style="align-self:flex-start;">+ Agendar neste dia</button>`;
  if (!lista.length) return `<div style="display:flex;flex-direction:column;gap:8px;">${novo}${vazio('Nenhum agendamento neste dia.')}</div>`;
  return `<div style="display:flex;flex-direction:column;gap:8px;">${novo}${lista.map((a) => cartao(a, false)).join('')}</div>`;
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
      <button class="ag-novo" data-dia="${dia.toISOString()}" title="Nova atividade neste dia"
        style="all:unset;cursor:pointer;text-align:center;font-size:12px;font-weight:700;color:var(--accent);border:1px dashed var(--border);border-radius:8px;padding:3px 0;">+ Agendar</button>
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
        <span style="color:${t.cor};">●</span> ${hora(new Date(a.data_prevista))} ${esc(nomesDe(a).map(primeiroNome).join(', '))} · ${esc(tituloDe(a))}</div>`;
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
  corpo.querySelectorAll('.ag-novo').forEach((b) => b.addEventListener('click', (ev) => {
    ev.stopPropagation(); novaAtividade(new Date(b.dataset.dia));
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
  const aberto = st === 'pendente' || st === 'atrasado';
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
    ${linha(nomesDe(ag).length > 1 ? 'Presentes' : 'Gerente', nomesDe(ag).join(', '))}
    ${linha('Horário', hora(new Date(ag.data_prevista)) + (ag.data_fim ? ' até ' + hora(new Date(ag.data_fim)) : ''))}
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
    <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;margin-top:14px;">
      ${aberto ? `<button class="btn btn-secondary" id="ag-cancelar" style="color:var(--red);">✕ Cancelar</button>
      <button class="btn btn-secondary" id="ag-remarcar">🕑 Remarcar</button>
      <button class="btn btn-primary" id="ag-realizar">✓ Realizar</button>` : ''}
      <button class="btn btn-secondary" id="ag-fechar">Fechar</button>
    </div>
  </div>`;
  const fechar = () => ov.remove();
  ov.addEventListener('click', (e) => { if (e.target === ov) fechar(); });
  document.body.appendChild(ov);
  ov.querySelector('#ag-fechar').addEventListener('click', fechar);
  if (aberto) {
    ov.querySelector('#ag-realizar').addEventListener('click', () => { fechar(); abrirNoApp(`/agenda/${ag.id}/realizar`); });
    ov.querySelector('#ag-remarcar').addEventListener('click', () => { fechar(); remarcar(ag); });
    ov.querySelector('#ag-cancelar').addEventListener('click', () => { fechar(); cancelar(ag); });
  }
}

// ─── Ações ────────────────────────────────────────────────────────────────
// Realizar e Agendar abrem o formulário do app numa ABA NOVA (com fotos,
// localização etc.); o dashboard continua aberto e se atualiza ao voltar.
function abrirNoApp(rota) { window.open('/#' + rota, '_blank'); }
function novaAtividade(dia) {
  const d = new Date(dia);
  if (d.getHours() === 0 && d.getMinutes() === 0) d.setHours(9, 0, 0, 0);
  try { localStorage.setItem('agenda-prefill-date', d.toISOString()); } catch (e) {}
  abrirNoApp('/agenda/nova');
}

// Janela simples (sem depender do app)
function janela(titulo, corpoHtml, botoes) {
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:210;display:flex;align-items:center;justify-content:center;padding:16px;';
    ov.innerHTML = `<div class="card" style="width:100%;max-width:440px;padding:18px;display:flex;flex-direction:column;gap:12px;">
      <div style="font-weight:800;font-size:15px;">${titulo}</div>${corpoHtml}
      <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;">${botoes.map((b, i) =>
        `<button class="btn ${b.cls || 'btn-secondary'}" data-i="${i}">${b.label}</button>`).join('')}</div></div>`;
    const fim = (v) => { ov.remove(); resolve(v); };
    ov.addEventListener('click', (e) => { if (e.target === ov) fim(null); });
    ov.querySelectorAll('button[data-i]').forEach((b) => b.addEventListener('click', () => {
      const bt = botoes[+b.dataset.i]; fim(bt.valor === undefined ? null : (typeof bt.valor === 'function' ? bt.valor(ov) : bt.valor));
    }));
    document.body.appendChild(ov);
    const foco = ov.querySelector('input,textarea'); if (foco) setTimeout(() => foco.focus(), 50);
  });
}
async function alcanceSerie(ag, verbo) {
  if (!ag.recorrencia_id) return 'esta';
  return janela(`${verbo} agendamento repetido`,
    '<div style="font-size:13px;color:var(--fg-muted);">Este agendamento faz parte de uma sequência. As já realizadas ou canceladas não mudam.</div>',
    [{ label: 'Voltar' }, { label: 'Somente esta', valor: 'esta' }, { label: 'Esta e as seguintes', valor: 'seguintes', cls: 'btn-primary' }]);
}
// Linhas que representam ESTE compromisso: todas do grupo (agenda compartilhada) ou só ela.
const doCompromisso = (q, ag) => ag.grupo_id ? q.eq('grupo_id', ag.grupo_id).eq('status', 'pendente') : q.eq('id', ag.id);

async function cancelar(ag) {
  const motivo = await janela('Cancelar agendamento',
    `<div style="font-size:13px;color:var(--fg-muted);">${esc(tituloDe(ag))} · ${new Date(ag.data_prevista).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</div>
     <textarea id="ag-motivo" class="input" rows="3" placeholder="Motivo do cancelamento (ex.: cliente remarcou, imprevisto...)" style="width:100%;"></textarea>`,
    [{ label: 'Voltar' }, { label: 'Cancelar agendamento', cls: 'btn-primary', valor: (ov) => ({ txt: ov.querySelector('#ag-motivo').value.trim() }) }]);
  if (!motivo) return;
  const alcance = await alcanceSerie(ag, 'Cancelar'); if (!alcance) return;
  const { sb, toast } = D;
  const r = alcance === 'seguintes'
    ? await sb.rpc('agenda_serie_cancelar', { p_recorrencia_id: ag.recorrencia_id, p_desde: ag.data_prevista, p_motivo: motivo.txt || null })
    : await doCompromisso(sb.from('agendamentos').update({ status: 'cancelado', motivo_cancelamento: motivo.txt || null }), ag).select('id');
  if (r.error) { toast('Não foi possível cancelar: ' + r.error.message, 'error'); return; }
  if (alcance === 'esta' && (!r.data || !r.data.length)) { toast('Sem permissão para cancelar este agendamento.', 'error'); return; }
  toast(alcance === 'seguintes' ? `Cancelados: ${r.data || 0} da sequência` : 'Agendamento cancelado', 'success');
  recarregarAgenda();
}

async function remarcar(ag) {
  const pad = (n) => String(n).padStart(2, '0');
  const d = new Date(ag.data_prevista);
  const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const f = ag.data_fim ? new Date(ag.data_fim) : null;
  const res = await janela('Remarcar agendamento',
    `<div style="font-size:13px;color:var(--fg-muted);">${esc(tituloDe(ag))}</div>
     <div style="display:flex;gap:8px;align-items:center;">
       <input id="ag-ini" type="datetime-local" class="input" value="${local}" style="flex:1;min-width:0;">
       <span style="font-size:12px;color:var(--fg-muted);">até</span>
       <input id="ag-fim" type="time" class="input" value="${f ? pad(f.getHours()) + ':' + pad(f.getMinutes()) : ''}" style="width:110px;">
     </div>
     <div style="font-size:11.5px;color:var(--fg-muted);">O horário de término é opcional.</div>`,
    [{ label: 'Voltar' }, { label: 'Remarcar', cls: 'btn-primary', valor: (ov) => ({ ini: ov.querySelector('#ag-ini').value, fim: ov.querySelector('#ag-fim').value }) }]);
  if (!res || !res.ini) return;
  const { sb, toast } = D;
  const ini = new Date(res.ini);
  let fim = null;
  if (res.fim) { const [hh, mm] = res.fim.split(':').map(Number); fim = new Date(ini); fim.setHours(hh, mm, 0, 0); if (fim <= ini) { toast('O término precisa ser depois do início.', 'error'); return; } }
  const alcance = await alcanceSerie(ag, 'Remarcar'); if (!alcance) return;
  let r;
  if (alcance === 'seguintes') {
    r = await sb.rpc('agenda_serie_editar', {
      p_recorrencia_id: ag.recorrencia_id, p_desde: ag.data_prevista,
      p_delta_seg: Math.round((ini - new Date(ag.data_prevista)) / 1000), p_campos: {},
      p_duracao_seg: fim ? Math.round((fim - ini) / 1000) : null,
    });
  } else {
    r = await doCompromisso(sb.from('agendamentos').update({
      data_prevista: ini.toISOString(), data_fim: fim ? fim.toISOString() : null,
      remarcada: true, remarcacoes: (ag.remarcacoes || 0) + 1,
      data_prevista_original: ag.data_prevista_original || ag.data_prevista, updated_at: new Date().toISOString(),
    }), ag).select('id');
  }
  if (r.error) { toast('Não foi possível remarcar: ' + r.error.message, 'error'); return; }
  if (alcance === 'esta' && (!r.data || !r.data.length)) { toast('Sem permissão para remarcar este agendamento.', 'error'); return; }
  toast(alcance === 'seguintes' ? `Remarcados: ${r.data || 0} da sequência` : 'Agendamento remarcado', 'success');
  recarregarAgenda();
}

// ─── Inicialização ────────────────────────────────────────────────────────
export function initAgenda(deps) {
  D = deps;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && document.getElementById('agenda-corpo')?.offsetParent) recarregarAgenda();
  });
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
