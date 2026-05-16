// Tela inicial de seleção de perfil (antes do login)
import { el, icon } from '../ui.js';
import { navigate } from '../router.js';
import { toggleTheme, getTheme } from '../theme.js';

const ROLE_KEY = 'rottas-login-as';

export function getChosenLoginRole() {
  return localStorage.getItem(ROLE_KEY); // 'gestor' | 'gerente' | null
}

export function setChosenLoginRole(role) {
  if (role) localStorage.setItem(ROLE_KEY, role);
  else localStorage.removeItem(ROLE_KEY);
}

export async function roleSelectView(_params, app) {
  // Tela DESCONTINUADA - hoje vai direto pro login. Mantemos só pra absorver
  // links/caches antigos que ainda apontem pra /role.
  navigate('/login', true);
  return;
  // ----- código antigo abaixo (não roda mais) -----
  const themeBtn = el('button', {
    class: 'absolute top-4 right-4 p-2.5 rounded-full bg-bg-card border border-border hover:bg-bg-elev transition z-10',
    onclick: () => { toggleTheme(); app.innerHTML=''; roleSelectView({}, app); }
  }, icon(getTheme() === 'dark' ? 'sun' : 'moon', 18));

  const card = (role, title, subtitle, ic, accent) => el('button', {
    class: 'card p-6 flex flex-col items-center text-center gap-3 transition-all hover:scale-[1.02] hover:border-rottas-300 active:scale-[0.99]',
    style: { minHeight: '180px' },
    onclick: () => { setChosenLoginRole(role); navigate('/login'); }
  },
    el('div', {
      class: 'w-16 h-16 rounded-2xl flex items-center justify-center mb-1',
      style: { background: accent.bg, color: accent.fg }
    }, icon(ic, 32)),
    el('div', { class: 'font-extrabold text-lg' }, title),
    el('div', { class: 'text-xs text-fg-muted' }, subtitle),
    el('div', { class: 'mt-2 text-rottas-500 text-xs font-bold flex items-center gap-1' },
      'Entrar', icon('chevronRight', 14)),
  );

  const layout = el('div', { class: 'min-h-screen flex flex-col items-center justify-center p-6 relative' },
    themeBtn,
    el('div', { class: 'w-full max-w-md flex flex-col gap-6' },
      // Logo + título
      el('div', { class: 'flex flex-col items-center gap-3 mb-2' },
        el('img', { src: '/assets/logo-rottas.png', alt: 'Rottas', class: 'h-16' }),
        el('p', { class: 'text-fg-muted text-sm font-medium' }, 'Plataforma de Gerentes'),
      ),

      // Título
      el('div', { class: 'text-center' },
        el('h1', { class: 'text-2xl font-extrabold' }, 'Como você quer entrar?'),
        el('p', { class: 'text-sm text-fg-muted mt-1' }, 'Selecione seu perfil de acesso'),
      ),

      // Cards
      el('div', { class: 'grid grid-cols-2 gap-3 animate-slide-up' },
        card('gestor', 'Gestor', 'Visão consolidada e relatórios', 'barChart',
             { bg: 'rgba(242,107,34,0.12)', fg: '#F26B22' }),
        card('gerente', 'Gerente de Plataforma', 'Registrar atividades em campo', 'mapPin',
             { bg: 'rgba(59,130,246,0.12)', fg: '#3B82F6' }),
      ),

      el('p', { class: 'text-center text-xs text-fg-subtle mt-4' },
        '© ', new Date().getFullYear().toString(), ' Rottas Construtora e Incorporadora'),
    ),

    // Decorações
    el('div', {
      class: 'absolute -z-10 top-0 right-0 w-96 h-96 rounded-full opacity-20 blur-3xl pointer-events-none',
      style: { background: 'radial-gradient(circle, #F26B22, transparent 70%)' }
    }),
    el('div', {
      class: 'absolute -z-10 bottom-0 left-0 w-96 h-96 rounded-full opacity-15 blur-3xl pointer-events-none',
      style: { background: 'radial-gradient(circle, #FB8235, transparent 70%)' }
    }),
  );

  app.appendChild(layout);
}
