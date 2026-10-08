// Filtro de PERÍODO compartilhado (Painel e Histórico) — mesmo visual da Agenda:
//
//   [ Dia | Semana | Mês | Período | Tudo ]      ← botões lado a lado
//   [ ‹      4/10 – 10/10      ›   Hoje ]        ← navegação (Dia/Semana/Mês)
//   [ De ______ ] [ Até ______ ]                 ← só no "Período"
//
// Semana = domingo a sábado (mesma regra da Agenda, pra os números baterem).
// O intervalo devolvido é sempre [de, ate): "ate" é EXCLUSIVO (00:00 do dia
// seguinte ao último dia), então a consulta usa gte(de) e lt(ate).
//
// Uso:
//   const per = periodoFiltro({ inicial: { modo: 'mes-cal' }, aoMudar: () => reload() });
//   container.appendChild(per.bloco);
//   q = aplicarPeriodo(q, per.intervalo());
import { el } from '../ui.js';

export const MODOS_PERIODO = [
  { v: 'dia',       l: 'Dia' },
  { v: 'sem-cal',   l: 'Semana' },
  { v: 'mes-cal',   l: 'Mês' },
  { v: 'intervalo', l: 'Período' },
  { v: 'tudo',      l: 'Tudo' },
];
// Códigos antigos (atalhos do Início e versões anteriores) → modos atuais
const LEGADO = { hoje: 'dia', semana: 'sem-cal', mes: 'mes-cal' };

const inicioDia = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const inicioSemana = (d) => { const x = inicioDia(d); x.setDate(x.getDate() - x.getDay()); return x; };
const maiuscula = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const dm = (d) => `${d.getDate()}/${d.getMonth() + 1}`;
export const isoDia = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const deIso = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
const fmtBr = (s) => deIso(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

export function normalizarPeriodo(p) {
  const n = { ...(p || {}) };
  n.modo = LEGADO[n.modo] || n.modo;
  if (!MODOS_PERIODO.some((m) => m.v === n.modo)) n.modo = 'mes-cal';
  return n;
}

export function intervaloDoPeriodo(pBruto) {
  const p = normalizarPeriodo(pBruto);
  const ref = p.ref ? deIso(p.ref) : new Date();
  switch (p.modo) {
    case 'dia': {
      const de = inicioDia(ref); const ate = new Date(de); ate.setDate(ate.getDate() + 1);
      const r = de.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '');
      return { de, ate, rotulo: maiuscula(r) };
    }
    case 'sem-cal': {
      const de = inicioSemana(ref); const ate = new Date(de); ate.setDate(ate.getDate() + 7);
      return { de, ate, rotulo: `${dm(de)} – ${dm(new Date(ate.getTime() - 1))}` };
    }
    case 'mes-cal': {
      const de = new Date(ref.getFullYear(), ref.getMonth(), 1);
      const ate = new Date(ref.getFullYear(), ref.getMonth() + 1, 1);
      return { de, ate, rotulo: maiuscula(de.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })) };
    }
    case 'intervalo': {
      const de = p.de ? deIso(p.de) : null;
      const ate = p.ate ? deIso(p.ate) : null;
      if (ate) ate.setDate(ate.getDate() + 1);   // inclui o dia "Até" inteiro
      return { de, ate, rotulo: `${p.de ? fmtBr(p.de) : 'início'} → ${p.ate ? fmtBr(p.ate) : 'hoje'}` };
    }
    default: return { de: null, ate: null, rotulo: 'Todo o período' };
  }
}

// Aplica o intervalo numa consulta do Supabase (campo de data configurável).
export function aplicarPeriodo(q, intervalo, campo = 'created_at') {
  if (intervalo.de) q = q.gte(campo, intervalo.de.toISOString());
  if (intervalo.ate) q = q.lt(campo, intervalo.ate.toISOString());
  return q;
}

export function periodoFiltro({ inicial = { modo: 'mes-cal' }, aoMudar = () => {} } = {}) {
  const p = normalizarPeriodo(inicial);
  const bloco = el('div', { class: 'card p-2 flex flex-col gap-2' });
  const emitir = () => aoMudar({ ...p }, intervaloDoPeriodo(p));

  function trocar(modo) {
    if (p.modo === modo) return;
    p.modo = modo;
    if (modo === 'intervalo' && !p.de && !p.ate) {
      // Começa com "do dia 1 deste mês até hoje" — o usuário só ajusta
      const h = new Date();
      p.de = isoDia(new Date(h.getFullYear(), h.getMonth(), 1)); p.ate = isoDia(h);
    }
    pintar(); emitir();
  }

  function mover(dir) {
    const d = p.ref ? deIso(p.ref) : new Date();
    if (p.modo === 'dia') d.setDate(d.getDate() + dir);
    else if (p.modo === 'sem-cal') d.setDate(d.getDate() + 7 * dir);
    else { d.setDate(1); d.setMonth(d.getMonth() + dir); }
    p.ref = isoDia(d); pintar(); emitir();
  }

  function pintar() {
    bloco.innerHTML = '';
    // Linha 1: modos (igual à Agenda)
    bloco.appendChild(el('div', { class: 'flex gap-1' },
      ...MODOS_PERIODO.map((m) => el('button', {
        type: 'button',
        class: 'btn btn-sm flex-1 px-1 ' + (p.modo === m.v ? 'btn-primary' : 'btn-ghost'),
        onclick: () => trocar(m.v),
      }, m.l))));

    // Linha 2: navegação ‹ › Hoje (Dia/Semana/Mês) ou De/Até (Período)
    if (['dia', 'sem-cal', 'mes-cal'].includes(p.modo)) {
      bloco.appendChild(el('div', { class: 'flex items-center gap-2' },
        el('button', { type: 'button', class: 'btn btn-ghost btn-sm px-2', 'aria-label': 'Anterior', onclick: () => mover(-1) }, '‹'),
        el('div', { class: 'flex-1 text-center font-bold text-sm' }, intervaloDoPeriodo(p).rotulo),
        el('button', { type: 'button', class: 'btn btn-ghost btn-sm px-2', 'aria-label': 'Próximo', onclick: () => mover(1) }, '›'),
        el('button', {
          type: 'button', class: 'btn btn-secondary btn-sm text-xs',
          onclick: () => { p.ref = isoDia(new Date()); pintar(); emitir(); },
        }, 'Hoje'),
      ));
    } else if (p.modo === 'intervalo') {
      const de = el('input', { type: 'date', class: 'input', value: p.de || '' });
      const ate = el('input', { type: 'date', class: 'input', value: p.ate || '' });
      const aviso = el('div', { class: 'text-xs text-danger hidden' }, 'A data "Até" precisa ser igual ou depois da data "De".');
      const aplicar = () => {
        if (de.value && ate.value && ate.value < de.value) { aviso.classList.remove('hidden'); return; }
        aviso.classList.add('hidden');
        p.de = de.value || null; p.ate = ate.value || null; emitir();
      };
      de.addEventListener('change', aplicar);
      ate.addEventListener('change', aplicar);
      const campo = (rotulo, input) => el('label', { class: 'flex flex-col gap-0.5' },
        el('span', { class: 'text-[11px] font-semibold text-fg-muted uppercase tracking-wider' }, rotulo), input);
      bloco.appendChild(el('div', { class: 'grid grid-cols-2 gap-2' }, campo('De', de), campo('Até', ate)));
      bloco.appendChild(aviso);
    }
  }
  pintar();

  return { bloco, valor: () => ({ ...p }), intervalo: () => intervaloDoPeriodo(p) };
}
