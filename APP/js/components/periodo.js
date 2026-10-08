// Filtro de PERÍODO compartilhado (Painel e Histórico).
//
//   Rápidos ........ Hoje · Últimos 7 dias · Últimos 30 dias · Tudo
//   Navegáveis ..... Semana e Mês, com ‹ › igual à Agenda (semana = domingo a
//                    sábado, a mesma regra da Agenda, pra os números baterem)
//   Personalizado .. De → Até
//
// O intervalo devolvido é sempre [de, ate): "ate" é EXCLUSIVO (00:00 do dia
// seguinte ao último dia), então a consulta usa gte(de) e lt(ate).
//
// Uso:
//   const per = periodoFiltro({ inicial: { modo: 'mes' }, aoMudar: (v, intervalo) => reload() });
//   coloque per.select onde ficava o <select> antigo e per.extra numa linha inteira
//   (é onde aparecem as setas ‹ › ou os campos De/Até).
import { el } from '../ui.js';

// 'semana' e 'mes' continuam significando ÚLTIMOS 7 / 30 DIAS: são os códigos que
// o Início já usa nos atalhos ("Semana"/"Mês" → Histórico). Os novos têm nome próprio.
export const MODOS_PERIODO = [
  { v: 'hoje',      l: 'Hoje' },
  { v: 'semana',    l: 'Últimos 7 dias' },
  { v: 'mes',       l: 'Últimos 30 dias' },
  { v: 'sem-cal',   l: '📅 Semana (‹ ›)' },
  { v: 'mes-cal',   l: '🗓️ Mês (‹ ›)' },
  { v: 'intervalo', l: '↔ De → Até' },
  { v: 'tudo',      l: 'Tudo' },
];

const inicioDia = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const inicioSemana = (d) => { const x = inicioDia(d); x.setDate(x.getDate() - x.getDay()); return x; };
const maiuscula = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const isoDia = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const deIso = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
const fmtBr = (s) => deIso(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

function rotuloSemana(de, fim) {
  const mesmoMes = de.getMonth() === fim.getMonth();
  const a = de.toLocaleDateString('pt-BR', mesmoMes ? { day: 'numeric' } : { day: 'numeric', month: 'short' });
  const b = fim.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${a} a ${b}`.replace(/\./g, '');
}

export function intervaloDoPeriodo(p) {
  const agora = new Date();
  const ref = p && p.ref ? deIso(p.ref) : agora;
  switch (p && p.modo) {
    case 'hoje': {
      const de = inicioDia(agora); const ate = new Date(de); ate.setDate(ate.getDate() + 1);
      return { de, ate, rotulo: 'Hoje' };
    }
    case 'semana': return { de: new Date(agora.getTime() - 7 * 86400000), ate: null, rotulo: 'Últimos 7 dias' };
    case 'mes':    return { de: new Date(agora.getTime() - 30 * 86400000), ate: null, rotulo: 'Últimos 30 dias' };
    case 'sem-cal': {
      const de = inicioSemana(ref); const ate = new Date(de); ate.setDate(ate.getDate() + 7);
      return { de, ate, rotulo: rotuloSemana(de, new Date(ate.getTime() - 1)) };
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

export function periodoFiltro({ inicial = { modo: 'mes' }, aoMudar = () => {} } = {}) {
  const p = { ...inicial };
  if (!MODOS_PERIODO.some((m) => m.v === p.modo)) p.modo = 'mes';

  const select = el('select', { class: 'select', 'aria-label': 'Período' },
    ...MODOS_PERIODO.map((m) => el('option', { value: m.v }, m.l)));
  select.value = p.modo;
  const extra = el('div', {});

  const emitir = () => aoMudar({ ...p }, intervaloDoPeriodo(p));

  function pintarExtra() {
    extra.innerHTML = '';
    if (p.modo === 'sem-cal' || p.modo === 'mes-cal') {
      const semana = p.modo === 'sem-cal';
      const mover = (dir) => {
        const d = p.ref ? deIso(p.ref) : new Date();
        if (semana) d.setDate(d.getDate() + 7 * dir);
        else { d.setDate(1); d.setMonth(d.getMonth() + dir); }
        p.ref = isoDia(d); pintarExtra(); emitir();
      };
      extra.appendChild(el('div', { class: 'card p-2 flex items-center gap-2' },
        el('button', { type: 'button', class: 'btn btn-ghost btn-sm px-3', 'aria-label': semana ? 'Semana anterior' : 'Mês anterior', onclick: () => mover(-1) }, '‹'),
        el('div', { class: 'flex-1 text-center font-bold text-sm' }, intervaloDoPeriodo(p).rotulo),
        el('button', { type: 'button', class: 'btn btn-ghost btn-sm px-3', 'aria-label': semana ? 'Próxima semana' : 'Próximo mês', onclick: () => mover(1) }, '›'),
        el('button', {
          type: 'button', class: 'btn btn-secondary btn-sm text-xs whitespace-nowrap',
          onclick: () => { p.ref = isoDia(new Date()); pintarExtra(); emitir(); },
        }, semana ? 'Esta semana' : 'Este mês'),
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
      extra.appendChild(el('div', { class: 'card p-2 flex flex-col gap-1' },
        el('div', { class: 'grid grid-cols-2 gap-2' }, campo('De', de), campo('Até', ate)), aviso));
    }
  }

  select.addEventListener('change', () => {
    p.modo = select.value;
    if ((p.modo === 'sem-cal' || p.modo === 'mes-cal') && !p.ref) p.ref = isoDia(new Date());
    if (p.modo === 'intervalo' && !p.de && !p.ate) {
      // Começa com "do dia 1 deste mês até hoje" — o usuário só ajusta
      const h = new Date();
      p.de = isoDia(new Date(h.getFullYear(), h.getMonth(), 1)); p.ate = isoDia(h);
    }
    pintarExtra(); emitir();
  });
  pintarExtra();

  return { select, extra, valor: () => ({ ...p }), intervalo: () => intervaloDoPeriodo(p) };
}
