// Auth helpers: login, primeiro acesso, logout, permissões
import { supabase, state, loadProfile, loadLists, emitStateChange } from './supabase.js';
import { MASTER_EMAIL } from './config.js';

// Flag global: quando true, listener de auth ignora eventos
export const authGuards = { suppressed: false };

// Flag de erro de link de recovery (token expirado/inválido)
export const recoveryState = { error: null };

// Detecta erro/token na hash da URL atual (chamado no boot)
export function detectRecoveryFromUrl() {
  const h = location.hash || '';
  // Supabase coloca erro em links inválidos como #error=...&error_code=...&error_description=...
  if (h.includes('error=') || h.includes('error_code=')) {
    const params = new URLSearchParams(h.replace(/^#/, ''));
    recoveryState.error = {
      code: params.get('error_code') || params.get('error') || 'unknown',
      description: params.get('error_description') || 'Link inválido ou expirado',
    };
    // Limpa hash para evitar loop
    history.replaceState(null, '', location.pathname + location.search);
    return 'expired';
  }
  if (h.includes('access_token=') || h.includes('type=recovery') || h.includes('type=invite')) {
    return 'pending';
  }
  return null;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  state.user = data.user;
  await Promise.all([loadProfile(), loadLists()]);
  emitStateChange();
  return data;
}

// Logout AGRESSIVO - limpa TODO storage Supabase + redireciona
export function signOut() {
  console.log('[signOut] iniciando logout agressivo');
  authGuards.suppressed = true;
  // 1. Limpa estado em memória
  state.user = null;
  state.profile = null;
  state.profiles = [];
  // 2. Limpa TODOS os storages (rottas-* + sb-* + supabase*)
  try {
    const ls = window.localStorage;
    const toRemove = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k && (k.startsWith('rottas-') || k.startsWith('sb-') || k.toLowerCase().includes('supabase') || k.startsWith('auth-'))) {
        toRemove.push(k);
      }
    }
    toRemove.forEach(k => ls.removeItem(k));
    window.sessionStorage.clear();
  } catch (e) { console.warn('[signOut] erro limpando storage:', e); }
  // 3. Tenta signOut no servidor (não espera)
  try { supabase.auth.signOut({ scope: 'local' }).catch(() => {}); } catch (e) {}
  // 4. HARD navigate para a raiz com cache-buster + reload completo
  const url = window.location.origin + '/?_logout=' + Date.now() + '#/role';
  window.location.href = url;
  // Fallback: força reload se href não disparar (caso raro)
  setTimeout(() => { try { window.location.reload(); } catch(e){} }, 200);
}

export async function setPassword(newPassword) {
  // 1) Atualiza a senha PRIMEIRO (operacao critica - precisa garantir que vai)
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;

  // 2) Marca primeiro_acesso=false BLOQUEANTE - precisa terminar ANTES de signOut
  //    senao o update falha por sessao invalidada e usuario fica em loop
  //    ao logar de novo (primeiro_acesso ainda true -> redirect pra setup-password)
  if (state.profile) {
    const { error: pErr } = await supabase
      .from('profiles')
      .update({ primeiro_acesso: false })
      .eq('id', state.profile.id);
    if (pErr) {
      console.error('[setPassword] CRITICO: falha ao marcar primeiro_acesso:', pErr);
      // Nao throw - usuario ja tem senha nova, mas avisa
    } else {
      state.profile.primeiro_acesso = false;
    }
  }

  emitStateChange();
}

export async function sendPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + '/',
  });
  if (error) throw error;
}

export async function initAuth() {
  // Detecta estado de recovery na URL ANTES de inicializar
  const recoveryStatus = detectRecoveryFromUrl();

  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    state.user = session.user;
    // Carrega profile e listas em paralelo
    await Promise.all([loadProfile(), loadLists()]);
  }

  // Se chegou com hash de recovery mas após 4s ainda não tem sessão, é link expirado
  if (recoveryStatus === 'pending') {
    setTimeout(() => {
      if (!state.user) {
        console.warn('[auth] Token de recovery não foi processado em 4s - provavelmente expirado');
        recoveryState.error = recoveryState.error || {
          code: 'token_expired',
          description: 'O link de definir senha expirou ou já foi utilizado.',
        };
        emitStateChange();
        if (location.hash !== '#/setup-password') {
          location.hash = '#/setup-password';
        }
      }
    }, 4000);
  }
  if (recoveryStatus === 'expired') {
    // Já temos o erro setado, redireciona para setup-password em modo expirado
    setTimeout(() => {
      if (location.hash !== '#/setup-password') location.hash = '#/setup-password';
    }, 50);
  }
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (authGuards.suppressed) return;
    
    console.log('[auth] evento:', event);
    state.user = session?.user || null;
    
    if (event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') {
      if (state.user) {
        // Aguarda perfil carregar ANTES de notificar o app ou redirecionar
        await Promise.all([loadProfile(), loadLists()]);
      }
    } else if (event === 'SIGNED_OUT') {
      state.profile = null;
    }
    
    emitStateChange();
    
    if (event === 'PASSWORD_RECOVERY') {
      // Agora o profile está carregado, o router não vai barrar!
      window.location.hash = '#/setup-password';
    }
  });
}

// Hierarquia (do mais baixo ao mais alto). Niveis acima de gerente sao "admin"
// e tem visibilidade ampliada (varia por contexto - estado/cidade/equipe).
//   supervisor (1) -> gerente (2) -> gestor_regional (3) -> superintendente (4) -> gestor (5) -> master (6)
const ROLE_LEVEL = {
  supervisor: 1, gerente: 2, gestor_regional: 3,
  superintendente: 4, gestor: 5, master: 6,
};

export function roleLevel(role) { return ROLE_LEVEL[role] || 0; }
export function isMaster() { return state.profile?.role === 'master'; }
export function isGestor() { return ['master','gestor'].includes(state.profile?.role); }
// Admin amplo: pode aprovar propostas, ver painel, etc.
// Inclui gestor_regional e superintendente (que tem visibilidade no escopo deles).
export function isAdmin() {
  return ['master','gestor','superintendente','gestor_regional'].includes(state.profile?.role);
}
// Niveis acima de gerente vêem tudo (gestor_regional vê só sua cidade,
// superintendente vê só seu estado, gestor e master veem tudo).
export function isFieldUser() {
  return ['supervisor','gerente'].includes(state.profile?.role);
}
// Pode planejar agenda? Supervisor NAO pode (agenda fica com gerente).
export function canManageAgenda() {
  return state.profile?.role !== 'supervisor';
}
// Master principal: NUNCA pode ser excluido (defesa de UI + trigger no banco)
export function isPrincipalMaster(emailOrProfile) {
  const email = typeof emailOrProfile === 'string' ? emailOrProfile : emailOrProfile?.email;
  return (email || '').toLowerCase() === MASTER_EMAIL.toLowerCase();
}
export function isLoggedIn() { return !!state.user && !!state.profile; }
export function needsPasswordSetup() { return state.profile?.primeiro_acesso === true; }

// Master pode escolher entrar como Gestor ou Gerente (para testar visão de campo)
export function activeViewRole() {
  if (state.profile?.role === 'master') {
    return localStorage.getItem('rottas-login-as') || 'gestor';
  }
  return state.profile?.role;
}

// Permissões: roles altos (master/gestor) tem tudo; outros dependem de profile.permissoes
export function can(perm) {
  const role = state.profile?.role;
  if (role === 'master' || role === 'gestor') return true;
  // Superintendente e gestor_regional tem permissões implícitas de leitura ampla,
  // mas precisam de permissoes específicas pra ações cruzadas.
  if (['superintendente','gestor_regional'].includes(role)) {
    return state.profile?.permissoes?.[perm] === true ||
           ['exportar_dados','editar_atividades'].includes(perm); // implícitas
  }
  return false;
}

// Pode aprovar proposta no nivel `level`?
//   pendente -> gestor_regional+ aprova
//   aprovada_regional -> superintendente+ aprova
//   aprovada_super -> master aprova
export function canApproveLevel(level) {
  const role = state.profile?.role;
  const allowed = {
    gestor_regional: ['gestor_regional','superintendente','gestor','master'],
    superintendente: ['superintendente','gestor','master'],
    gestor:          ['gestor','master'],
    master:          ['master'],
  };
  return (allowed[level] || []).includes(role);
}
