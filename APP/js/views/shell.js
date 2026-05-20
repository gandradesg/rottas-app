// Shell: header + main + bottom nav. Usado por todas as telas autenticadas.
import { el, icon, avatar } from '../ui.js';
import { state } from '../supabase.js';
import { signOut, isMaster, isGestor, isAdmin, activeViewRole, can, canManageAgenda, canToggleView } from '../auth.js';
import { ROLES } from '../config.js';
import { toggleTheme, getTheme } from '../theme.js';
import { navigate, currentPath } from '../router.js';

export function shell(content, opts = {}) {
  const { title, subtitle, back, headerActions, hideBottomNav } = opts;
  const path = currentPath();

  // Toggle de perfil para roles admin (master, gestor, superintendente, gestor_regional)
  // Permite alternar entre a visao administrativa propria e a visao de gerente (campo)
  let roleToggle = null;
  if (canToggleView() && !back) {
    const view = activeViewRole();
    const isGerView = view === 'gerente';
    const ownAdminLabel = ROLES[state.profile?.role]?.label || 'Gestor';
    roleToggle = el('button', {
      class: 'btn-sm flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border border-border hover:bg-bg-elev transition',
      style: { color: isGerView ? '#3B82F6' : '#F26B22' },
      onclick: () => {
        const next = isGerView ? state.profile?.role : 'gerente';
        localStorage.setItem('rottas-login-as', next);
        // Volta pra raiz pra recalcular tudo no novo contexto e force reload
        location.href = '/';
      }
    },
      icon(isGerView ? 'mapPin' : 'barChart', 12),
      isGerView ? 'Gerente' : ownAdminLabel
    );
  }

  // Botão Dashboard (pagina externa /dashboard) — disponível para TODOS os roles
  // O dashboard aplica scope automaticamente: Gerente vê só seus dados +
  // supervisores, GestReg vê suas cidades, Superint seus estados, Master tudo.
  let dashboardBtn = null;
  if (state.profile?.role && !back) {
    dashboardBtn = el('button', {
      class: 'btn-sm flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold transition',
      style: {
        background: 'linear-gradient(135deg, #F26B22, #D5530F)',
        color: '#ffffff',
        boxShadow: '0 3px 10px rgba(242,107,34,0.25)',
      },
      title: 'Abrir Dashboard Analitico',
      onclick: () => { window.location.href = '/dashboard'; },
    },
      icon('trendingUp', 12),
      'Dashboard'
    );
  }

  // Header
  const header = el('header', { class: 'sticky top-0 z-30 glass border-b border-border' },
    el('div', { class: 'max-w-screen-md mx-auto px-4 py-3 flex items-center gap-3' },
      back
        ? el('button', { class: 'p-2 -ml-2 rounded-lg hover:bg-bg-elev transition', onclick: () => history.back() }, icon('arrowLeft', 22))
        : el('img', { src: '/assets/logo-icon.png', class: 'w-9 h-9 object-contain' }),
      el('div', { class: 'flex-1 min-w-0' },
        title
          ? el('h1', { class: 'text-base font-bold truncate' }, title)
          : el('h1', { class: 'text-base font-bold' }, 'ROTTAS', el('span', { class: 'text-rottas-500 ml-1' }, '•')),
        subtitle && el('p', { class: 'text-xs text-fg-muted truncate' }, subtitle),
      ),
      el('div', { class: 'flex items-center gap-1.5' },
        dashboardBtn,
        roleToggle,
        ...(headerActions || []),
        el('button', {
          class: 'p-2 rounded-lg hover:bg-bg-elev transition',
          'aria-label': 'Alternar tema',
          onclick: () => toggleTheme(),
        }, icon(getTheme() === 'dark' ? 'sun' : 'moon', 20)),
        el('button', {
          class: 'p-2 rounded-lg hover:bg-bg-elev transition flex items-center',
          'aria-label': 'Perfil',
          onclick: () => navigate('/perfil'),
        }, avatar(state.profile?.nome || '?', 28)),
      ),
    ),
  );

  // Main
  const main = el('main', { class: 'max-w-screen-md mx-auto px-4 py-4 ' + (hideBottomNav ? 'pb-6' : 'pb-24') }, content);

  // Bottom nav decidido pelo VIEW ATIVO (respeita o toggle), nao pelo role real.
  // - view='gerente'   -> nav de gerente (Agenda + Inicio + Historico + Registrar)
  // - view='supervisor'-> sem Agenda (gerente planeja), so Inicio + Historico + Registrar
  // - view admin       -> Agenda + Painel + Historico + Usuarios/Listas conforme perms
  let bottom = null;
  if (!hideBottomNav) {
    const view = activeViewRole();
    let items;
    if (view === 'supervisor') {
      // Supervisor TAMBÉM tem Agenda - vê o que o Gerente atribuiu pra ele
      // (mas não pode CRIAR agendamentos - só o Gerente planeja)
      items = [
        { p: '/',           label: 'Agenda',     ic: 'calendar'   },
        { p: '/inicio',     label: 'Início',     ic: 'home'       },
        { p: '/historico',  label: 'Histórico',  ic: 'fileText'   },
        { p: '/registrar',  label: 'Registrar',  ic: 'plus', primary: true },
      ];
    } else if (view === 'gerente') {
      items = [
        { p: '/',           label: 'Agenda',     ic: 'calendar'   },
        { p: '/inicio',     label: 'Início',     ic: 'home'       },
        { p: '/historico',  label: 'Histórico',  ic: 'fileText'   },
        { p: '/registrar',  label: 'Registrar',  ic: 'plus', primary: true },
      ];
    } else {
      // Visao administrativa: gestor, master, superintendente, gestor_regional
      items = [];
      if (canManageAgenda()) items.push({ p: '/', label: 'Agenda', ic: 'calendar' });
      items.push({ p: '/painel',     label: 'Painel',    ic: 'barChart' });
      items.push({ p: '/historico',  label: 'Histórico', ic: 'fileText' });
      if (can('gerenciar_usuarios')) items.push({ p: '/usuarios', label: 'Usuários', ic: 'users' });
      if (can('gerenciar_listas'))   items.push({ p: '/listas',   label: 'Listas',   ic: 'list'  });
    }

    bottom = el('nav', { class: 'fixed bottom-0 left-0 right-0 z-30 glass border-t border-border no-print' },
      el('div', { class: 'max-w-screen-md mx-auto flex items-center justify-around safe-area-bottom' },
        ...items.map(it => {
          const active = path === it.p || (it.p === '/' && path === '');
          if (it.primary) {
            return el('button', {
              class: 'flex flex-col items-center justify-center gap-0.5 py-1.5',
              onclick: () => navigate(it.p)
            },
              el('div', {
                class: 'w-12 h-12 rounded-full flex items-center justify-center text-white shadow-lg',
                style: { background: 'linear-gradient(135deg, #F26B22, #D5530F)', boxShadow: '0 6px 20px rgba(242,107,34,0.45)' }
              }, icon(it.ic, 22)),
              el('span', { class: 'text-[10px] font-semibold mt-0.5 text-rottas-500' }, it.label),
            );
          }
          return el('button', {
            class: 'bottom-nav-item ' + (active ? 'active' : ''),
            onclick: () => navigate(it.p)
          },
            icon(it.ic, 22),
            el('span', { class: 'font-semibold' }, it.label),
          );
        })
      )
    );
  }

  const wrapper = el('div', { class: 'min-h-screen' }, header, main, bottom);
  return wrapper;
}
