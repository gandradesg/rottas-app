// Entry point - wires up auth, theme, router e rotas
import { initTheme } from './theme.js';
import { initAuth, isLoggedIn, isMaster, isGestor, activeViewRole, needsPasswordSetup, can, recoveryState } from './auth.js';
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
import { agendaView } from './views/agenda.js';
import { agendaFormView } from './views/agenda-form.js';

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

// Home - agora padrão é Agenda. Painel e Início ficam em rotas dedicadas.
const homeView = authGuard(async (params, app) => {
  return agendaView(params, app);
});
const painelHomeView = authGuard(async (params, app) => {
  return painelGestorView(params, app);
});
const inicioGerenteView = authGuard(async (params, app) => {
  return homeGerenteView(params, app);
});

// Setup password - permite acesso sem sessão se há erro de recovery (modo "link expirado")
const setupGuard = async (params, app) => {
  if (!isLoggedIn() && !recoveryState.error) {
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
route('/agenda',                   authGuard(agendaView));
route('/agenda/nova',              authGuard(agendaFormView));
route('/agenda/:id/editar',        authGuard(agendaFormView));
route('/agenda/:agendamentoId/realizar', authGuard(atividadeFormView));
route('/painel',                   painelHomeView);
route('/inicio',                   inicioGerenteView);
route('/historico',                authGuard(historicoView));
route('/usuarios',                 permGuard('gerenciar_usuarios', masterUsuariosView));
route('/listas',                   permGuard('gerenciar_listas',   masterListasView));
route('/sobre',                    authGuard((p, a) => import('./views/sobre.js').then(m => m.sobreView(p, a))));

// Boot
async function boot() {
  initTheme();
  splash();

  // ===== Detecção AGRESSIVA de fluxo de recovery na URL =====
  const initialHash = location.hash || '';
  const initialSearch = location.search || '';
  const hasAuthTokens =
    initialHash.includes('type=recovery') ||
    initialHash.includes('type=invite') ||
    initialHash.includes('type=signup') ||
    initialHash.includes('access_token=') ||
    initialHash.includes('refresh_token=') ||
    initialSearch.includes('type=recovery') ||
    initialSearch.includes('code=');

  if (hasAuthTokens) {
    console.log('[boot] DETECTADO fluxo de recovery na URL - vai limpar storage e forçar /setup-password');
    // 1. Limpa TODA sessão antiga ANTES de o Supabase ler o storage
    try {
      const ls = window.localStorage;
      const keys = [];
      for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i);
        if (k && (k.startsWith('rottas-app-auth') || k.startsWith('sb-') ||
                  k.toLowerCase().includes('supabase') || k.startsWith('auth-'))) {
          keys.push(k);
        }
      }
      keys.forEach(k => ls.removeItem(k));
    } catch (e) { console.warn('[boot] erro limpando storage:', e); }
  }

  await initAuth();

  if (hasAuthTokens) {
    // 2. Aguarda o Supabase processar o token e settar a sessão (250ms é suficiente)
    await new Promise(r => setTimeout(r, 250));
    // 3. FORÇA o destino para /setup-password - independente de qual evento auth disparou
    //    Não confia em PASSWORD_RECOVERY ser disparado.
    console.log('[boot] forçando hash → #/setup-password (sessão atual:', !!state.user, ')');
    if (location.hash !== '#/setup-password') {
      // Limpa qualquer resíduo da hash original (tokens já consumidos)
      history.replaceState(null, '', location.pathname + location.search + '#/setup-password');
    }
  }

  startRouter();
}

boot().catch(err => {
  console.error('Boot error', err);
  document.getElementById('app').innerHTML = `<div class="p-6 text-center"><p class="text-danger">Erro ao iniciar: ${err.message}</p></div>`;
});

// Global: re-render ao mudar estado de auth (login/logout em outras abas)
onStateChange(() => {
  const path = location.hash.slice(1) || '/';
  // Permite /setup-password sem sessão se houver erro de recovery
  if (!isLoggedIn() && path === '/setup-password' && recoveryState.error) return;
  if (!isLoggedIn() && path !== '/role' && path !== '/login') navigate('/role', true);
  else if (isLoggedIn() && needsPasswordSetup() && path !== '/setup-password') navigate('/setup-password', true);
});
