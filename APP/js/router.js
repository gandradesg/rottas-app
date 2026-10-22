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
    // Same path - force re-render
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
    // 404 - redirect home
    navigate('/', true);
    return;
  }
  currentRoute = m.pattern;
  // Cada tela desenha num "palco" próprio. Se a tela demorou (rede lenta) e o
  // usuário já foi pra outra, o palco antigo já saiu da página — o que ela
  // desenhar depois fica invisível, em vez de aparecer POR CIMA da tela nova.
  const palco = document.createElement('div');
  palco.className = 'min-h-screen';
  app.appendChild(palco);
  try {
    const cleanup = await m.handler(m.params, palco);
    if (!palco.isConnected) { if (typeof cleanup === 'function') { try { cleanup(); } catch (e) {} } return; }
    if (typeof cleanup === 'function') currentCleanup = cleanup;
  } catch (e) {
    console.error('Erro renderizando rota', path, e);
    if (palco.isConnected) palco.innerHTML = `<div class="p-6 text-center text-fg-muted">Erro ao carregar a página: ${e.message}</div>`;
  }
}

export function startRouter() {
  window.addEventListener('hashchange', render);
  // Se for um token do Supabase na URL, não faz o render inicial!
  // Isso previne o router de dar 404 e limpar o token antes do Supabase ler.
  const h = location.hash;
  if (h.includes('access_token=') || h.includes('type=recovery') || h.includes('type=invite')) {
    return;
  }
  render();
}
