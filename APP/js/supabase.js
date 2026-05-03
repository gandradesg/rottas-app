// Cliente Supabase compartilhado
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { SUPABASE_URL, SUPABASE_ANON } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
    storageKey: 'rottas-app-auth',
  },
});

// Estado global da aplicação
export const state = {
  user: null,         // auth.user
  profile: null,      // profile da tabela `profiles`
  // caches de listas
  imobiliarias: [],
  empreendimentos: [],
  motivosVisita: [],
  motivosOrulo: [],
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
  const [imob, emp, mv, mo] = await Promise.all([
    supabase.from('imobiliarias').select('*').order('nome'),
    supabase.from('empreendimentos').select('*').order('nome'),
    supabase.from('motivos_visita').select('*').order('nome'),
    supabase.from('motivos_orulo').select('*').order('nome'),
  ]);
  state.imobiliarias    = imob.data    || [];
  state.empreendimentos = emp.data     || [];
  state.motivosVisita   = mv.data      || [];
  state.motivosOrulo    = mo.data      || [];
  emitStateChange();
}

// Helper: carrega todos os profiles (apenas master)
export async function loadAllProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('nome');
  if (error) { console.error(error); return []; }
  state.profiles = data || [];
  emitStateChange();
  return data;
}
