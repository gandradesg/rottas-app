// Tela de seleção de tipo de atividade
import { el, icon } from '../ui.js';
import { shell } from './shell.js';
import { navigate } from '../router.js';
import { state } from '../supabase.js';
import { getTipoCaptacao } from '../config.js';

// Captação muda conforme o estado do gerente: PR=Órulo, SC=DWV
function captacaoCard() {
  const estado = state.profile?.estado;
  const id = getTipoCaptacao(estado);
  const label = id === 'dwv' ? 'DWV' : 'Órulo';
  const desc = id === 'dwv'
    ? 'Contato via plataforma DWV'
    : 'Contato via plataforma Órulo';
  return { id, title: label, desc, ic: 'globe', bg: 'rgba(16,185,129,0.10)', fg: '#10B981' };
}

function getTipos() {
  return [
    { id: 'checkin',     title: 'Check-in',     desc: 'Visita à imobiliária com localização',  ic: 'mapPin',   bg: 'rgba(59,130,246,0.10)',  fg: '#3B82F6' },
    { id: 'atendimento', title: 'Atendimento',  desc: 'Visita com cliente em apartamento',     ic: 'users',    bg: 'rgba(139,92,246,0.10)',  fg: '#8B5CF6' },
    { id: 'proposta',    title: 'Proposta',     desc: 'Proposta enviada ou venda fechada',     ic: 'fileText', bg: 'rgba(245,158,11,0.10)',  fg: '#F59E0B' },
    captacaoCard(),
  ];
}

export async function registrarView(_params, app) {
  const tipos = getTipos();
  const content = el('div', { class: 'flex flex-col gap-4' },
    el('div', {},
      el('h1', { class: 'text-2xl font-extrabold' }, 'Nova atividade'),
      el('p', { class: 'text-sm text-fg-muted mt-1' }, 'O que você está registrando?'),
    ),
    el('div', { class: 'flex flex-col gap-3' },
      ...tipos.map(t => el('button', {
        class: 'card p-4 flex items-center gap-4 hover:border-rottas-300 transition text-left',
        onclick: () => navigate(`/atividade/novo/${t.id}`),
      },
        el('div', {
          class: 'w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0',
          style: { background: t.bg, color: t.fg }
        }, icon(t.ic, 24)),
        el('div', { class: 'flex-1' },
          el('div', { class: 'font-bold' }, t.title),
          el('div', { class: 'text-xs text-fg-muted' }, t.desc),
        ),
        icon('chevronRight', 18, 'text-fg-subtle'),
      )),
    ),
  );
  app.appendChild(shell(content, { title: 'Registrar', back: true, hideBottomNav: true }));
}
