// Auth helpers: login, primeiro acesso, logout, permissões
import { supabase, state, loadProfile, loadLists, emitStateChange } from './supabase.js';

// Flag global: quando true, listener de auth ignora eventos
export const authGuards = { suppressed: false };

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  state.user = data.user;
  await Promise.all([loadProfile(), loadLists()]);
  emitStateChange();
  return data;
}

// Logout AGRESSIVO — limpa TODO storage Supabase + redireciona
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
  if (state.profile) {
    const { error: pErr } = await supabase
      .from('profiles')
      .update({ primeiro_acesso: false })
      .eq('id', state.profile.id);
    if (pErr) throw pErr;
    state.profile.primeiro_acesso = false;
  }
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
  emitStateChange();
}

export async function sendPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + '/#/setup-password',
  });
  if (error) throw error;
}

export async function initAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    state.user = session.user;
    // Carrega profile e listas em paralelo
    await Promise.all([loadProfile(), loadLists()]);
  }
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (authGuards.suppressed) {
      console.log('[auth] evento suprimido:', event);
      return;
    }
    console.log('[auth] evento:', event);
    state.user = session?.user || null;
    if (event === 'SIGNED_IN' && state.user) {
      await Promise.all([loadProfile(), loadLists()]);
    } else if (event === 'SIGNED_OUT') {
      state.profile = null;
    }
    emitStateChange();
  });
}

export function isMaster() { return state.profile?.role === 'master'; }
export function isGestor() { return state.profile?.role === 'gestor' || state.profile?.role === 'master'; }
export function isAdmin() { return isGestor(); }
export function isLoggedIn() { return !!state.user && !!state.profile; }
export function needsPasswordSetup() { return state.profile?.primeiro_acesso === true; }

// Master pode escolher entrar como Gestor ou Gerente.
export function activeViewRole() {
  if (state.profile?.role === 'master') {
    return localStorage.getItem('rottas-login-as') || 'gestor';
  }
  return state.profile?.role; // 'gestor' | 'gerente'
}

// Permissões: master tem tudo; gestor depende de profile.permissoes; gerente nada.
export function can(perm) {
  const role = state.profile?.role;
  if (role === 'master') return true;
  if (role !== 'gestor') return false;
  return state.profile?.permissoes?.[perm] === true;
}
