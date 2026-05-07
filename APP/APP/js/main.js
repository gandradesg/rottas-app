// Entry point — wires up auth, theme, router e rotas
import { initTheme } from './theme.js';
import { initAuth, isLoggedIn, isMaster, isGestor, activeViewRole, needsPasswordSetup, can } from './auth.js';
import { startRouter, route, navigate } from './router.js';
import { state, onStateChange } from './supabase.js';
import { el } from './ui.js';

import { loginView } from './views/login.js';
import { roleSelectView } from './views/role-select.js';
import { setupPasswordView } from './views/setup-password.js';
import { homeGerenteView } from './views/home-gerente.js';
import { painelGestorView } from './views/painel-gestor.js';
import { registrarView } from './views/registrar.js';
import { atividadeFormView } from './views/atividade-form.js';
import { atividadeDetailView } from './views/atividade-detail.js';
import { historicoView } from './views/historico.js';
import { perfilView } from './views/perfil.js';
import { masterUsuariosView } from './views/master-usuarios.js';
import { masterListasView } from './views/master-listas.js';

// Splash screen rápido enquanto auth carrega
function splash() {
  const app = document.getElementById('app');
  app.innerHTML = '';
  app.appendChild(el('div', { class: 'min-h-screen flex flex-col items-center justify-center gap-4' },
    el('img', { src: '/assets/logo-rottas.png', class: 'h-12 animate-pulse-soft' }),
    el('span', { class: 'text-xs text-fg-muted' }, 'Carregando...')
  ));
}

// Guard: redireciona para login/setup conforme estado de auth
function authGuard(handler) {
  return async (params, app) => {
    if (!isLoggedIn()) {
      navigate('/role', true);
      return;
    }
    if (needsPasswordSetup()) {
      navigate('/setup-password', true);
      return;
    }
    return handler(params, app);
  };
}

function publicRoute(handler) {
  return async (params, app) => {
    // Página /role sempre pode ser acessada (mesmo logado, para trocar perspectiva)
    if (isLoggedIn() && !needsPasswordSetup() && handler !== roleSelectView) {
      navigate('/', true);
      return;
    }
    return handler(params, app);
  };
}

// Home — escolhe view por role ativo (master pode ser qualquer um)
const homeView = authGuard(async (params, app) => {
  const view = activeViewRole();
  if (view === 'gestor') return painelGestorView(params, app);
  return homeGerenteView(params, app);
});

// Setup password também precisa estar logado
const setupGuard = async (params, app) => {
  if (!isLoggedIn()) {
    navigate('/login', true); return;
  }
  return setupPasswordView(params, app);
};

// Master-only (compatibilidade)
function masterGuard(handler) {
  return authGuard(async (params, app) => {
    if (!isMaster()) {
      navigate('/', true); return;
    }
    return handler(params, app);
  });
}

// Permission-based guard
function permGuard(perm, handler) {
  return authGuard(async (params, app) => {
    if (!can(perm)) {
      navigate('/', true); return;
    }
    return handler(params, app);
  });
}

// Define rotas
route('/role',                     publicRoute(roleSelectView));
route('/login',                    publicRoute(loginView));
route('/setup-password',           setupGuard);
route('/',                         homeView);
route('/perfil',                   authGuard(perfilView));
route('/registrar',                authGuard(registrarView));
route('/atividade/novo/:tipo',     authGuard(atividadeFormView));
route('/atividade/:id/editar/:tipo', authGuard(atividadeFormView));
route('/atividade/:id',            authGuard(atividadeDetailView));
route('/historico',                authGuard(historicoView));
route('/usuarios',                 permGuard('gerenciar_usuarios', masterUsuariosView));
route('/listas',                   permGuard('gerenciar_listas',   masterListasView));
route('/sobre',                    authGuard((p, a) => import('./views/sobre.js').then(m => m.sobreView(p, a))));

// Boot
async function boot() {
  initTheme();
  splash();
  await initAuth();
  startRouter();
}

boot().catch(err => {
  console.error('Boot error', err);
  document.getElementById('app').innerHTML = `<div class="p-6 text-center"><p class="text-danger">Erro ao iniciar: ${err.message}</p></div>`;
});

// Global: re-render ao mudar estado de auth (login/logout em outras abas)
onStateChange(() => {
  const path = location.hash.slice(1) || '/';
  if (!isLoggedIn() && path !== '/role' && path !== '/login') navigate('/role', true);
  else if (isLoggedIn() && needsPasswordSetup() && path !== '/setup-password') navigate('/setup-password', true);
});
