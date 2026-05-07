// Roteador hash-based simples
// Rotas: #/login, #/setup-password, #/home, #/atividade/checkin, #/historico, #/master/usuarios, etc.

const routes = new Map();
let currentCleanup = null;
let currentRoute = null;

export function route(pattern, handler) {
  routes.set(pattern, handler);
}

// match com :params, ex: '/atividade/:tipo' bate em '/atividade/checkin'
function matchRoute(path) {
  for (const [pattern, handler] of routes) {
    const pParts = pattern.split('/').filter(Boolean);
    const aParts = path.split('/').filter(Boolean);
    if (pParts.length !== aParts.length) continue;
    const params = {};
    let match = true;
    for (let i = 0; i < pParts.length; i++) {
      if (pParts[i].startsWith(':')) {
        params[pParts[i].slice(1)] = decodeURIComponent(aParts[i]);
      } else if (pParts[i] !== aParts[i]) {
        match = false; break;
      }
    }
    if (match) return { handler, params, pattern };
  }
  return null;
}

export function navigate(path, replace = false) {
  const target = '#' + path;
  if (location.hash === target) {
    // Same path — force re-render
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return;
  }
  if (replace) location.replace(target);
  else location.hash = target;
}

export function currentPath() {
  const h = location.hash || '#/';
  return h.startsWith('#') ? h.slice(1) : h;
}

export function currentRouteName() {
  return currentRoute;
}

async function render() {
  const path = currentPath() || '/';
  const m = matchRoute(path);
  const app = document.getElementById('app');
  if (currentCleanup) { try { currentCleanup(); } catch(e){} currentCleanup = null; }
  app.innerHTML = '';
  // Limpa modais que ficaram abertos durante a navegação
  document.getElementById('modal-root')?.replaceChildren();
  app.classList.add('animate-fade-in');
  if (!m) {
    // 404 — redirect home
    navigate('/', true);
    return;
  }
  currentRoute = m.pattern;
  try {
    const cleanup = await m.handler(m.params, app);
    if (typeof cleanup === 'function') currentCleanup = cleanup;
  } catch (e) {
    console.error('Erro renderizando rota', path, e);
    app.innerHTML = `<div class="p-6 text-center text-fg-muted">Erro ao carregar a página: ${e.message}</div>`;
  }
}

export function startRouter() {
  window.addEventListener('hashchange', render);
  render();
}
