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
  motivosDwv: [],
  locaisVisita: [],
  cidades: [],
  gerentesHouse: [],  // lista mestra de gerentes house (para visitas)
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
  // 6 queries em paralelo (inclui gerentes_house para a atividade visita)
  const [imob, emp, mv, mo, lv, gh] = await Promise.all([
    supabase.from('imobiliarias').select('id, nome, cidade, estado').order('nome'),
    supabase.from('empreendimentos').select('id, nome, cidade, estado, link_url, cidades_visiveis').order('nome'),
    supabase.from('motivos_visita').select('id, nome').order('nome'),
    supabase.from('motivos_orulo').select('id, nome').order('nome'),
    supabase.from('locais_visita').select('id, nome').order('nome'),
    supabase.from('gerentes_house').select('id, nome, ativo').eq('ativo', true).order('nome'),
  ]);
  state.imobiliarias    = imob.data    || [];
  state.empreendimentos = emp.data     || [];
  state.motivosVisita   = mv.data      || [];
  state.motivosOrulo    = mo.data      || [];
  state.motivosDwv      = mo.data      || []; // alias - unificado
  state.locaisVisita    = lv.data      || [];
  state.gerentesHouse   = gh.data      || [];
  state.cidades         = [];          // descontinuado
  emitStateChange();
}

// ─── SCOPE HELPERS (filtro hierárquico de visibilidade) ─────────────────
// Hierarquia de visibilidade:
//   Master/Gestor    → tudo
//   Superintendente  → tudo nos estados_acesso (jsonb array)
//   Gestor Regional  → tudo nas cidades_acesso (jsonb array)
//   Gerente          → sua cidade (e supervisores subordinados, via outro helper)
//   Supervisor       → sua cidade (acompanha o gerente)

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
    if (!p.cidade) return [];
    return all.filter(im => im.cidade === p.cidade);
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
    if (!p.cidade) return [];
    return all.filter(e => atendeCidades(e, [p.cidade]));
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
