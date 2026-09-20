// Cliente Supabase compartilhado
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { SUPABASE_URL, SUPABASE_ANON } from './config.js';

// ─── TRAVA DE SESSÃO (serialização do refresh de token) ────────────────────
// CAUSA RAIZ do bug "depois de um tempo tudo trava e só F5 resolve":
// o supabase-js usa uma trava pra garantir que só UMA renovação de token rode
// por vez. A versão anterior daqui usava navigator.locks com `ifAvailable`, o
// que na prática DESLIGAVA a serialização: quando o token expirava, várias
// renovações disparavam ao mesmo tempo com o MESMO refresh token. Como o
// Supabase rotaciona esse token (uso único), uma renovação invalidava a outra e
// a sessão ficava num estado quebrado — aí TODA query ficava pendurada
// (Usuários/Painel/Histórico vazios, registro girando pra sempre).
//
// Aqui usamos uma fila em memória: as operações rodam UMA DE CADA VEZ, na ordem.
// E, pra nunca repetir o problema oposto (deadlock), a fila anda sozinha depois
// de 35s mesmo se uma operação ficar pendurada. 35s é DE PROPÓSITO maior que o
// tempo-limite do fetch (30s): assim a requisição já foi abortada antes de a
// fila liberar a próxima — nunca há duas renovações de token ao mesmo tempo.
let _filaSessao = Promise.resolve();
function serialLock(_name, _acquireTimeout, fn) {
  const exec = () => fn();
  const resultado = _filaSessao.then(exec, exec);
  _filaSessao = Promise.race([
    resultado.then(() => {}, () => {}),          // segue quando terminar (ok ou erro)
    new Promise((r) => setTimeout(r, 35000)),    // ...ou depois de 35s, sem travar a fila
  ]);
  return resultado;
}

// Fetch com timeout GLOBAL: a causa nº1 de "tela carregando pra sempre" é uma
// requisição (query, RPC ou refresh de token) que fica pendurada em rede ruim e
// nunca resolve — travando getSession() e todas as queries em fila atrás dela.
// Aqui abortamos qualquer requisição que passar de 45s, então ela REJEITA (as
// telas mostram erro/retry) em vez de congelar. 45s é folgado pra uploads de
// foto em 3G, mas ainda finito.
function fetchWithTimeout(input, init = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => {
    try { ctrl.abort(new DOMException('Tempo esgotado', 'AbortError')); } catch { ctrl.abort(); }
  }, 30000);
  // Encadeia com um signal externo, se houver
  if (init.signal) {
    if (init.signal.aborted) ctrl.abort();
    else init.signal.addEventListener('abort', () => ctrl.abort(), { once: true });
  }
  return fetch(input, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
    storageKey: 'rottas-app-auth',
    lock: serialLock,
  },
  global: { fetch: fetchWithTimeout },
});

// ─── SAÚDE DA CONEXÃO / AUTO-RECUPERAÇÃO ───────────────────────────────────
// Toda query passa por `q()`. Se ela estourar o tempo, tentamos CONSERTAR a
// sessão (renovar o token) e repetir uma vez. Se ainda assim falhar, marcamos o
// app como "travado" e mostramos um aviso com "Reconectar" — em vez de deixar a
// tela girando pra sempre (que era o que obrigava o usuário a dar F5).
let _consertando = null;
export async function repararSessao() {
  if (_consertando) return _consertando;           // um conserto por vez
  _consertando = (async () => {
    try {
      const r = await Promise.race([
        supabase.auth.refreshSession(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000)),
      ]);
      return !!(r && r.data && r.data.session);
    } catch (e) { return false; }
    finally { setTimeout(() => { _consertando = null; }, 1000); }
  })();
  return _consertando;
}

// Mostra (uma vez) o aviso de conexão travada com botão de reconectar.
function avisarTravado() {
  if (document.getElementById('conn-banner')) return;
  const b = document.createElement('div');
  b.id = 'conn-banner';
  b.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:9999;background:#B91C1C;color:#fff;padding:10px 14px;font:14px/1.4 sans-serif;display:flex;gap:10px;align-items:center;justify-content:space-between;';
  b.innerHTML = '<div><b>Conexão travada.</b> Toque em Reconectar para voltar a salvar/carregar.</div>'
    + '<button style="background:#fff;color:#B91C1C;border:none;padding:6px 12px;border-radius:4px;font-weight:bold;cursor:pointer">Reconectar</button>';
  b.querySelector('button').onclick = async () => {
    b.querySelector('button').textContent = 'Reconectando...';
    try { if ('caches' in window) { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); } } catch (e) {}
    location.reload();
  };
  document.body.appendChild(b);
}

// Executa uma consulta do Supabase com tempo-limite + REPETIÇÃO AUTOMÁTICA.
//
// Por que repetir: a causa nº1 do "fica pensando e não vai" depois de alguns
// minutos parado é a CONEXÃO DE REDE MORRER em silêncio (operadora/roteador
// derrubam conexões ociosas). O navegador reaproveita essa conexão morta e a
// requisição fica pendurada por minutos. Ao estourar o tempo e tentar de novo,
// o navegador abre uma conexão NOVA — e aí funciona na hora.
//
// Passe uma FÁBRICA pra permitir a repetição:  q(() => supabase.from('x').select())
// Passe o builder direto pra NÃO repetir (use em gravações, que não podem duplicar).
export async function q(fonte, { ms = 10000, label = 'consulta', tentativas = 2 } = {}) {
  const ehFabrica = typeof fonte === 'function';
  const max = ehFabrica ? tentativas : 1;   // sem fábrica, não dá pra repetir com segurança
  let ultimo = null;
  for (let i = 0; i < max; i++) {
    try {
      return await Promise.race([
        ehFabrica ? fonte() : fonte,
        new Promise((_, rej) => setTimeout(() => rej(new Error(`Tempo esgotado (${label})`)), ms)),
      ]);
    } catch (e) {
      ultimo = e;
      if (i === 0) await repararSessao();   // revalida a sessão antes de repetir
    }
  }
  avisarTravado();
  return { data: null, error: ultimo || new Error(`Falha na ${label}`) };
}

// ─── KEEP-ALIVE ────────────────────────────────────────────────────────────
// Mantém a conexão viva enquanto o app está na frente: um toque minúsculo no
// servidor a cada 60s evita que a conexão ociosa seja derrubada (que é o que
// deixava o app "pensando" depois de poucos minutos parado).
let _keepAliveTimer = null;
function pingServidor() {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
  if (!state.user) return; // só faz sentido logado
  Promise.race([
    supabase.from('outros_tipos').select('id').limit(1),
    new Promise((r) => setTimeout(r, 8000)),
  ]).catch(() => {});
}
export function iniciarKeepAlive() {
  if (_keepAliveTimer) return;
  _keepAliveTimer = setInterval(pingServidor, 60000);
}
// Liga sozinho logo após o boot (o setTimeout garante que `state` já existe).
if (typeof window !== 'undefined') setTimeout(iniciarKeepAlive, 5000);

// Ao VOLTAR pro app (aba/PWA que estava em 2º plano), valida a sessão antes das
// próximas queries. Sem isso, a primeira ação depois de voltar costumava ficar
// pendurada esperando um refresh de token que nunca completava.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    Promise.race([
      supabase.auth.getSession(),
      new Promise((r) => setTimeout(r, 6000)),
    ]).catch(() => {});
  });
}

// Estado global da aplicação
export const state = {
  user: null,         // auth.user
  profile: null,      // profile da tabela `profiles`
  // caches de listas
  imobiliarias: [],
  empreendimentos: [],
  motivosVisita: [],
  motivosOrulo: [],
  motivosDwv: [],
  locaisVisita: [],
  outrosTipos: [],    // tipos de "Outro" (lista dedicada, gerentes cadastram)
  gerentesHouse: [],  // lista mestra de gerentes house (para visitas)
  corretores: [],     // lista mestra de corretores (vinculados a imobiliária)
  gerentesImob: [],   // gerentes/donos das imobiliárias (vinculados a imobiliária)
  profiles: [],       // só populado para master
  // listeners
  _listeners: new Set(),
};

export function onStateChange(fn) {
  state._listeners.add(fn);
  return () => state._listeners.delete(fn);
}

export function emitStateChange() {
  state._listeners.forEach(fn => { try { fn(state); } catch(e){ console.error(e); } });
}

// Helper: pega profile do user atual
export async function loadProfile() {
  if (!state.user) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', state.user.id)
    .single();
  if (error) {
    console.error('Erro ao carregar profile:', error);
    return null;
  }
  state.profile = data;
  emitStateChange();
  return data;
}

// Helper: carrega todas as listas gerenciadas pelo master
export async function loadLists() {
  // RESILIENTE: cada query tem tempo-limite próprio (nunca TRAVA a chamada) e,
  // se uma falhar/estourar, a lista correspondente NÃO é zerada — mantém o que já
  // estava. Isso evita dois bugs graves nos cadastros:
  //  1) uma query com hiccup zerava a lista pra [] (sumia da tela);
  //  2) Promise.all sem timeout deixava o `await loadLists()` preso pra sempre
  //     (tela "agarrada", só resolvia com F5).
  const q = (sel) => Promise.race([
    sel,
    new Promise((resolve) => setTimeout(() => resolve({ data: null, error: new Error('timeout') }), 15000)),
  ]);
  const [imob, emp, mv, mo, lv, gh, cor, gim, ot] = await Promise.all([
    q(supabase.from('imobiliarias').select('id, nome, cidade, estado').order('nome')),
    q(supabase.from('empreendimentos').select('id, nome, cidade, estado, link_url, cidades_visiveis').order('nome')),
    q(supabase.from('motivos_visita').select('id, nome').order('nome')),
    q(supabase.from('motivos_orulo').select('id, nome').order('nome')),
    q(supabase.from('locais_visita').select('id, nome').order('nome')),
    q(supabase.from('gerentes_house').select('id, nome, ativo').eq('ativo', true).order('nome')),
    q(supabase.from('corretores').select('id, nome, telefone, email, imobiliaria_id, imobiliaria_nome').order('nome')),
    q(supabase.from('gerentes_imobiliaria').select('id, nome, telefone, email, imobiliaria_id, imobiliaria_nome').order('nome')),
    q(supabase.from('outros_tipos').select('id, nome').order('nome')),
  ]);
  // Só sobrescreve quando a query REALMENTE trouxe dados (data é array, mesmo que []).
  // Se veio null (erro/timeout), preserva a lista anterior — não apaga a tela.
  const set = (key, res) => { if (res && Array.isArray(res.data)) state[key] = res.data; };
  set('imobiliarias', imob);
  set('empreendimentos', emp);
  set('motivosVisita', mv);
  if (mo && Array.isArray(mo.data)) { state.motivosOrulo = mo.data; state.motivosDwv = mo.data; } // alias unificado
  set('locaisVisita', lv);
  set('gerentesHouse', gh);
  set('corretores', cor);
  set('gerentesImob', gim);
  set('outrosTipos', ot);
  emitStateChange();
}

// ─── SCOPE HELPERS (filtro hierárquico de visibilidade) ─────────────────
// Hierarquia de visibilidade:
//   Master/Gestor    → tudo
//   Superintendente  → tudo nos estados_acesso (jsonb array)
//   Gestor Regional  → tudo nas cidades_acesso (jsonb array)
//   Gerente          → cidade base + cidades de responsabilidade (cidades_acesso)
//   Supervisor       → cidade base + cidades de responsabilidade (cidades_acesso)

// Cidades que um gerente/supervisor atende: a cidade base + as cidades de
// responsabilidade (cidades_acesso). Sem duplicatas.
export function cidadesDoGerente(p) {
  const set = new Set();
  if (p?.cidade) set.add(p.cidade);
  if (Array.isArray(p?.cidades_acesso)) p.cidades_acesso.forEach(c => { if (c) set.add(c); });
  return [...set];
}

// Retorna imobiliárias visíveis ao usuário atual (scope geográfico)
export function getScopedImobiliarias() {
  const all = state.imobiliarias || [];
  const p = state.profile;
  if (!p) return [];
  if (['master', 'gestor'].includes(p.role)) return all;
  if (p.role === 'superintendente') {
    const estados = Array.isArray(p.estados_acesso) ? p.estados_acesso : [];
    return all.filter(im => estados.includes(im.estado));
  }
  if (p.role === 'gestor_regional') {
    const cidades = Array.isArray(p.cidades_acesso) ? p.cidades_acesso : [];
    return all.filter(im => cidades.includes(im.cidade));
  }
  if (['gerente', 'supervisor'].includes(p.role)) {
    const cidades = cidadesDoGerente(p);
    if (!cidades.length) return [];
    return all.filter(im => cidades.includes(im.cidade));
  }
  return all;
}

// Retorna empreendimentos visíveis ao usuário atual.
// Um empreendimento aparece numa cidade se for a cidade-sede (campo cidade)
// OU se a cidade estiver em cidades_visiveis (multi-cidade — ex.: empreend. de
// Itapoá vendido em Curitiba).
export function getScopedEmpreendimentos() {
  const all = state.empreendimentos || [];
  const p = state.profile;
  if (!p) return [];
  if (['master', 'gestor'].includes(p.role)) return all;
  // Helper: o empreendimento "atende" alguma das cidades informadas?
  const atendeCidades = (e, cidades) => {
    const extras = Array.isArray(e.cidades_visiveis) ? e.cidades_visiveis : [];
    return cidades.some(c => e.cidade === c || extras.includes(c));
  };
  if (p.role === 'superintendente') {
    const estados = Array.isArray(p.estados_acesso) ? p.estados_acesso : [];
    // Sede no estado OU alguma cidade_visivel (cidade não mapeia estado direto,
    // então mantemos o critério por estado da sede como base).
    return all.filter(e => estados.includes(e.estado));
  }
  if (p.role === 'gestor_regional') {
    const cidades = Array.isArray(p.cidades_acesso) ? p.cidades_acesso : [];
    return all.filter(e => atendeCidades(e, cidades));
  }
  if (['gerente', 'supervisor'].includes(p.role)) {
    const cidades = cidadesDoGerente(p);
    if (!cidades.length) return [];
    return all.filter(e => atendeCidades(e, cidades));
  }
  return all;
}

// Retorna IDs de gerentes/supervisores visíveis ao user (async — consulta DB)
// Master/Gestor: null (sem restrição)
// Superintendente: gerentes/supervisores nos estados_acesso
// Gestor Regional: gerentes/supervisores nas cidades_acesso
// Gerente: ele + supervisores subordinados (gerente_supervisor_id = self)
// Supervisor: só ele
export async function getScopedGerenteIds() {
  const p = state.profile;
  if (!p) return new Set();
  if (['master', 'gestor'].includes(p.role)) return null;
  const { data } = await supabase.from('profiles')
    .select('id, role, estado, cidade, gerente_supervisor_id').eq('ativo', true);
  const profiles = data || [];
  const allowed = new Set();
  if (p.role === 'superintendente') {
    const estados = p.estados_acesso || [];
    profiles.forEach(x => { if (['gerente','supervisor'].includes(x.role) && estados.includes(x.estado)) allowed.add(x.id); });
  } else if (p.role === 'gestor_regional') {
    const cidades = p.cidades_acesso || [];
    profiles.forEach(x => { if (['gerente','supervisor'].includes(x.role) && cidades.includes(x.cidade)) allowed.add(x.id); });
  } else if (p.role === 'gerente') {
    allowed.add(p.id);
    profiles.forEach(x => { if (x.role === 'supervisor' && x.gerente_supervisor_id === p.id) allowed.add(x.id); });
  } else if (p.role === 'supervisor') {
    allowed.add(p.id);
  }
  return allowed;
}

// Helper: carrega todos os profiles (apenas master)
// Devolve o array de profiles, ou NULL quando a consulta falha/estoura o tempo
// (a tela usa isso pra mostrar erro + "Tentar de novo" em vez de ficar no
// skeleton pra sempre, ou mentir "nenhum usuário cadastrado").
export async function loadAllProfiles() {
  const { data, error } = await q(
    () => supabase.from('profiles').select('*').order('nome'),
    { ms: 10000, label: 'usuários' },
  );
  if (error) { console.error('[profiles]', error); return null; }
  state.profiles = data || [];
  emitStateChange();
  return data;
}
