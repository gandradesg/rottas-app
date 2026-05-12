// Shell: header + main + bottom nav. Usado por todas as telas autenticadas.
import { el, icon, avatar } from '../ui.js';
import { state } from '../supabase.js';
import { signOut, isMaster, isGestor, isAdmin, activeViewRole, can, canManageAgenda } from '../auth.js';
import { toggleTheme, getTheme } from '../theme.js';
import { navigate, currentPath } from '../router.js';

export function shell(content, opts = {}) {
  const { title, subtitle, back, headerActions, hideBottomNav } = opts;
  const path = currentPath();

  // Toggle de perfil para master (alterna entre visão Gestor e Gerente)
  let roleToggle = null;
  if (isMaster() && !back) {
    const view = activeViewRole();
    roleToggle = el('button', {
      class: 'btn-sm flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border border-border hover:bg-bg-elev transition',
      style: { color: view === 'gestor' ? '#F26B22' : '#3B82F6' },
      onclick: () => {
        const next = view === 'gestor' ? 'gerente' : 'gestor';
        localStorage.setItem('rottas-login-as', next);
        navigate('/', true);
        // força re-render
        setTimeout(() => location.reload(), 50);
      }
    }, icon(view === 'gestor' ? 'barChart' : 'mapPin', 12), view === 'gestor' ? 'Gestor' : 'Gerente');
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
      el('div', { class: 'flex items-center gap-1' },
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

  // Bottom nav (varia por role/visao)
  // Supervisor: tem registro + historico (sem agenda - quem planeja é o gerente)
  // Gerente: agenda + inicio + historico + registrar
  // Roles admin (gestor/master/superintendente/gestor_regional): painel + historico + outros
  let bottom = null;
  if (!hideBottomNav) {
    const view = activeViewRole();
    const role = state.profile?.role;
    let items;
    if (role === 'supervisor') {
      items = [
        { p: '/inicio',     label: 'Início',     ic: 'home'       },
        { p: '/historico',  label: 'Histórico',  ic: 'fileText'   },
        { p: '/registrar',  label: 'Registrar',  ic: 'plus', primary: true },
      ];
    } else if (view === 'gestor' || ['gestor','superintendente','gestor_regional','master'].includes(role)) {
      items = [];
      if (canManageAgenda()) items.push({ p: '/', label: 'Agenda', ic: 'calendar' });
      items.push({ p: '/painel',     label: 'Painel',    ic: 'barChart' });
      items.push({ p: '/historico',  label: 'Histórico', ic: 'fileText' });
      if (can('gerenciar_usuarios')) items.push({ p: '/usuarios', label: 'Usuários', ic: 'users' });
      if (can('gerenciar_listas'))   items.push({ p: '/listas',   label: 'Listas',   ic: 'list'  });
    } else {
      // gerente
      items = [
        { p: '/',           label: 'Agenda',     ic: 'calendar'   },
        { p: '/inicio',     label: 'Início',     ic: 'home'       },
        { p: '/historico',  label: 'Histórico',  ic: 'fileText'   },
        { p: '/registrar',  label: 'Registrar',  ic: 'plus', primary: true },
      ];
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
