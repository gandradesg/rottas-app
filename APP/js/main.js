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
// ─── QUANDO É SEGURO RECARREGAR ────────────────────────────────────────────
// No celular, "entrar no app" quase sempre é VOLTAR a um app que estava em 2º
// plano — sem recarregar, ele não conferia a versão e ficava dias na antiga.
// Agora confere ao voltar, mas NUNCA recarrega com a pessoa no meio de algo:
//   • telas de formulário (registrar/editar/realizar, agendar, visita, login, senha);
//   • janela (modal) aberta;
//   • qualquer coisa digitada nesta tela (vale pra Perfil, Listas, busca etc.).
// Nesses casos mostra a faixa e atualiza sozinho assim que a pessoa sair.
const ROTAS_FORMULARIO = [
  /^\/atividade\/novo\//, /^\/atividade\/[^/]+\/editar\//, /^\/agenda\/nova$/, /^\/agenda\/[^/]+\/editar$/,
  /^\/agenda\/[^/]+\/realizar$/, /^\/visitas\/nova$/, /^\/login$/, /^\/setup-password$/,
];
let _digitouNestaTela = false;
document.addEventListener('input', () => { _digitouNestaTela = true; }, true);
function rotaAtual() { return (location.hash || '#/').slice(1).split('?')[0] || '/'; }
function appOcupado() {
  if (ROTAS_FORMULARIO.some((r) => r.test(rotaAtual()))) return true;
  const modais = document.getElementById('modal-root');
  if (modais && modais.children.length) return true;
  if (_digitouNestaTela) return true;
  return false;
}

let _versaoPendente = null;      // versão nova esperando a pessoa sair do formulário
let _ultimaConferencia = 0;

async function aplicarAtualizacao(versao) {
  // Trava anti-loop: 1 recarga automática por versão e por sessão.
  const flagKey = 'auto-upd-' + versao;
  if (sessionStorage.getItem(flagKey)) return false;
  sessionStorage.setItem(flagKey, '1');
  console.warn('[update] recarregando para', versao);
  try { if ('caches' in window) { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); } } catch (e) {}
  // update() em vez de unregister(): preserva a inscrição das notificações.
  try {
    const regs = await navigator.serviceWorker?.getRegistrations?.();
    if (regs) await Promise.all(regs.map(x => x.update().catch(() => {})));
  } catch (e) {}
  location.reload();
  return true;
}

// Ao sair do formulário (troca de tela), aplica a versão que estava esperando.
let _recarregarAoSair = false;  // service worker novo assumiu durante um formulário
window.addEventListener('hashchange', () => {
  _digitouNestaTela = false;   // tela nova = nada digitado nela ainda
  if (_versaoPendente) setTimeout(() => { if (_versaoPendente && !appOcupado()) aplicarAtualizacao(_versaoPendente); }, 300);
  else if (_recarregarAoSair) setTimeout(() => { if (_recarregarAoSair && !appOcupado()) location.reload(); }, 300);
});

// Ao VOLTAR pro app (estava em 2º plano): confere a versão (no máximo a cada 2 min).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (Date.now() - _ultimaConferencia < 2 * 60 * 1000) return;
  checkForUpdate();
});

async function checkForUpdate() {
  _ultimaConferencia = Date.now();
  try {
    const { APP_VERSION: localVersion } = await import('./config.js');
    const r = await fetch('/js/config.js?nocache=' + Date.now(), { cache: 'no-store' });
    const txt = await r.text();
    const m = txt.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
    if (m && m[1] && m[1] !== localVersion) {
      console.warn('[update] versao local:', localVersion, '- servidor:', m[1]);
      // Pessoa no meio de um registro: NÃO recarrega (perderia o que digitou e as
      // fotos). Avisa e atualiza sozinho quando ela sair do formulário.
      if (appOcupado()) {
        _versaoPendente = m[1];
        showUpdateBanner(localVersion, m[1], true);
        return;
      }
      if (await aplicarAtualizacao(m[1])) return;
      // Já tentou o reload automático nesta sessão e ainda está desatualizado:
      // mostra banner manual (raro — ex.: WebAPK Android muito preso).
      showUpdateBanner(localVersion, m[1]);
    }
  } catch (e) { /* sem internet ou off - silencia */ }
}
// emFormulario = true: a pessoa está registrando algo → a faixa explica que nada
// será perdido e que a atualização acontece sozinha ao sair da tela.
function showUpdateBanner(local, server, emFormulario = false) {
  if (document.getElementById('update-banner')) return; // ja existe
  const banner = document.createElement('div');
  banner.id = 'update-banner';
  banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#F26B22;color:#fff;padding:10px 14px;font:14px/1.4 sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.2);display:flex;gap:10px;align-items:center;justify-content:space-between;';
  banner.innerHTML = emFormulario
    ? `<div><b>Nova versão disponível</b> (v${server}). Termine o que está fazendo — nada será perdido. O app atualiza sozinho quando você sair desta tela.</div><button style="background:#fff;color:#F26B22;border:none;padding:6px 12px;border-radius:4px;font-weight:bold;cursor:pointer">Ok</button>`
    : `<div><b>Nova versão disponível</b> (v${server}). Você está na v${local}. Toque em Atualizar.</div><button style="background:#fff;color:#F26B22;border:none;padding:6px 12px;border-radius:4px;font-weight:bold;cursor:pointer">Atualizar agora</button>`;
  if (emFormulario) {
    banner.querySelector('button').onclick = () => banner.remove();   // só fecha; atualiza ao sair da tela
    document.body.appendChild(banner);
    return;
  }
  banner.querySelector('button').onclick = async () => {
    // Limpa cache + desregistra SW + reload (funciona no navegador E no PWA instalado).
    try { if ('caches' in window) { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); } } catch (e) {}
    // update() em vez de unregister(): preserva a inscrição das notificações.
    try { const regs = await navigator.serviceWorker?.getRegistrations?.(); if (regs) await Promise.all(regs.map(x => x.update().catch(() => {}))); } catch (e) {}
    location.reload();
  };
  document.body.appendChild(banner);
}
setTimeout(checkForUpdate, 3000);

// INSTALAÇÃO DO APP (Android/Chrome/Edge): guarda o convite do navegador para o
// botão "📲 Instalar o app" usar depois. Capturado aqui porque dispara cedo.
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); window.__rottasInstallPrompt = e; });
window.addEventListener('appinstalled', () => { window.__rottasInstallPrompt = null; });

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
    // AUDITORIA: antes recarregava NA HORA, mesmo com o gerente no meio de um
    // registro (passava por cima da proteção de formulário). Agora, se estiver
    // ocupado, espera ele sair da tela.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      if (appOcupado()) { _recarregarAoSair = true; console.log('[sw] controllerchange - aguardando sair do formulário'); return; }
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

// FILA OFFLINE: ativa desde o começo pra mostrar o selo "aguardando envio" e
// reenviar sozinho o que ficou guardado no aparelho.
import('./outbox.js').catch(() => {});
// NOTIFICAÇÕES: mantém a inscrição deste aparelho em dia com o servidor.
import('./notificacoes.js').catch(() => {});

// Global: re-render ao mudar estado de auth (login/logout em outras abas)
onStateChange(() => {
  const path = location.hash.slice(1) || '/';
  // Permite /setup-password sem sessão se houver erro de recovery
  if (!isLoggedIn() && path === '/setup-password' && recoveryState.error) return;
  if (!isLoggedIn() && path !== '/login' && path !== '/role') navigate('/login', true);
  else if (isLoggedIn() && needsPasswordSetup() && path !== '/setup-password') navigate('/setup-password', true);
});
