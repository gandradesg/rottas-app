// Entry point - wires up auth, theme, router e rotas
// Forca document.title pra "Imob Rottas" em todo load (alguns navegadores cacheiam o
// title antigo pra "Adicionar a Tela de Inicio"). Em PWA instalado, esvazia para
// Windows nao duplicar com manifest.name.
if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
  document.title = '';
} else {
  document.title = 'Imob Rottas';
}

// ===== DETECTOR DE VERSAO DESATUALIZADA (banner, sem reload automatico) =====
// PWA Android cacheia em nivel de OS (WebAPK) - reload nao resolve, precisa reinstalar.
// Mostra um banner discreto pedindo pro usuario reinstalar o app.
async function checkForUpdate() {
  try {
    const { APP_VERSION: localVersion } = await import('./config.js');
    const r = await fetch('/js/config.js?nocache=' + Date.now(), { cache: 'no-store' });
    const txt = await r.text();
    const m = txt.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
    if (m && m[1] && m[1] !== localVersion) {
      console.warn('[update] versao local:', localVersion, '- servidor:', m[1]);
      showUpdateBanner(localVersion, m[1]);
    }
  } catch (e) { /* sem internet ou off - silencia */ }
}
function showUpdateBanner(local, server) {
  if (document.getElementById('update-banner')) return; // ja existe
  const isStandalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
  const banner = document.createElement('div');
  banner.id = 'update-banner';
  banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#F26B22;color:#fff;padding:10px 14px;font:14px/1.4 sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.2);display:flex;gap:10px;align-items:center;justify-content:space-between;';
  banner.innerHTML = `<div><b>Nova versao disponivel</b> (v${server}). Voce esta na v${local}.${isStandalone ? ' Para atualizar, desinstale e reinstale o app.' : ' Recarregue a pagina (Ctrl+Shift+R).'}</div><button style="background:#fff;color:#F26B22;border:none;padding:6px 12px;border-radius:4px;font-weight:bold;cursor:pointer">${isStandalone ? 'OK' : 'Recarregar'}</button>`;
  banner.querySelector('button').onclick = () => {
    if (isStandalone) banner.remove();
    else { if ('caches' in window) caches.keys().then(ks => ks.forEach(k => caches.delete(k))); location.reload(); }
  };
  document.body.appendChild(banner);
}
setTimeout(checkForUpdate, 3000);

// ===== SERVICE WORKER: garante que o app SEMPRE pega versao fresh =====
// Funciona inclusive em PWA instalado Android (intercepta cache do WebAPK).
// Estrategia: network-first com fallback offline. Auto-update transparente.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      console.log('[sw] registrado');
      // Forca check de update assim que registra
      reg.update().catch(() => {});
      // Quando detecta SW novo (apos reg.update ou navigate), aplica imediatamente
      reg.addEventListener('updatefound', () => {
        const newSW = reg.installing;
        if (!newSW) return;
        newSW.addEventListener('statechange', () => {
          if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('[sw] novo SW instalado - ativando e recarregando');
            newSW.postMessage('SKIP_WAITING');
          }
        });
      });
    }).catch(err => console.warn('[sw] erro:', err));

    // Recarrega quando o SW novo assume controle
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      console.log('[sw] controllerchange - reload');
      location.reload();
    });
  });
}

import { initTheme } from './theme.js';
import { initAuth, isLoggedIn, isMaster, isGestor, isRecepcao, activeViewRole, needsPasswordSetup, can, recoveryState } from './auth.js';
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
import { visitasView, visitaFormView } from './views/visitas.js';
import { visitaDetailView } from './views/visita-detail.js';

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
      navigate('/login', true);
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
// EXCEÇÃO: Recepção Rottas é redirecionada SEMPRE para /visitas (única tela que pode acessar)
const homeView = authGuard(async (params, app) => {
  if (isRecepcao()) { navigate('/visitas', true); return; }
  return agendaView(params, app);
});

// Guard que SÓ permite recepcao_rottas ou master acessar (rotas de visita)
function visitasGuard(handler) {
  return authGuard(async (params, app) => {
    const role = state.profile?.role;
    if (role !== 'recepcao_rottas' && role !== 'master') {
      navigate('/', true); return;
    }
    return handler(params, app);
  });
}

// Guard que BLOQUEIA recepcao_rottas de acessar (rotas operacionais comuns)
function blockRecepcao(handler) {
  return authGuard(async (params, app) => {
    if (isRecepcao()) { navigate('/visitas', true); return; }
    return handler(params, app);
  });
}
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
route('/registrar',                blockRecepcao(registrarView));
route('/atividade/novo/:tipo',     blockRecepcao(atividadeFormView));
route('/atividade/:id/editar/:tipo', blockRecepcao(atividadeFormView));
route('/atividade/:id',            authGuard(atividadeDetailView));
route('/agenda',                   blockRecepcao(agendaView));
route('/agenda/nova',              blockRecepcao(agendaFormView));
route('/agenda/:id/editar',        blockRecepcao(agendaFormView));
route('/agenda/:agendamentoId/realizar', blockRecepcao(atividadeFormView));
route('/painel',                   painelHomeView);
route('/inicio',                   blockRecepcao(inicioGerenteView));
route('/historico',                blockRecepcao(historicoView));
route('/visitas',                  visitasGuard(visitasView));
route('/visitas/nova',             visitasGuard(visitaFormView));
route('/visita/:id',               visitasGuard(visitaDetailView));
route('/usuarios',                 permGuard('gerenciar_usuarios', masterUsuariosView));
route('/listas',                   permGuard('gerenciar_listas',   masterListasView));
route('/sobre',                    authGuard((p, a) => import('./views/sobre.js').then(m => m.sobreView(p, a))));

// Boot
async function boot() {
  initTheme();
  splash();

  // Watchdog: se depois de 15s ainda estiver na tela de carregamento (boot travou
  // em rede/auth), oferece recarregar em vez de deixar o usuário preso no splash.
  const bootTimer = setTimeout(() => {
    const app = document.getElementById('app');
    if (app && app.querySelector('.animate-pulse-soft')) {
      const box = app.querySelector('div') || app;
      box.appendChild(el('div', { class: 'flex flex-col items-center gap-2 mt-4' },
        el('span', { class: 'text-xs text-fg-muted' }, 'Está demorando mais que o normal.'),
        el('button', {
          class: 'btn btn-primary btn-sm',
          onclick: () => {
            try { if ('caches' in window) caches.keys().then(ks => ks.forEach(k => caches.delete(k))); } catch (e) {}
            location.reload();
          },
        }, '↻ Recarregar'),
      ));
    }
  }, 15000);

  // Limpa o cache-buster ?_logout=... que o signOut adiciona à URL.
  // Ele só serve pra forçar reload limpo no logout; depois do boot fica preso
  // na barra de endereço (mesmo já logado). Remove preservando o hash da rota.
  if (location.search.includes('_logout')) {
    try { history.replaceState(null, '', location.pathname + (location.hash || '#/')); } catch (e) {}
  }

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

  clearTimeout(bootTimer);
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
  if (!isLoggedIn() && path !== '/login' && path !== '/role') navigate('/login', true);
  else if (isLoggedIn() && needsPasswordSetup() && path !== '/setup-password') navigate('/setup-password', true);
});
