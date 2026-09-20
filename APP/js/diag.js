// Diagnóstico de registros: grava cada ETAPA de um registro (início, fotos,
// gravação, confirmação, sucesso/falha) com duração e o erro real.
// Objetivo: descobrir EM QUE PONTO os registros dos gerentes travam, em vez de
// adivinhar. Guarda no aparelho (sempre funciona, mesmo sem internet) e envia
// pro banco quando dá (sem NUNCA atrasar ou travar o registro do usuário).
import { supabase, state } from './supabase.js';
import { APP_VERSION } from './config.js';

const KEY = 'rottas-diag-logs';
const MAX_LOCAL = 300;

export function lerLogsLocais() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; }
}
export function limparLogsLocais() {
  try { localStorage.removeItem(KEY); } catch (e) {}
}

function gravarLocal(ev) {
  try {
    const arr = lerLogsLocais();
    arr.push(ev);
    while (arr.length > MAX_LOCAL) arr.shift();
    localStorage.setItem(KEY, JSON.stringify(arr));
  } catch (e) { /* localStorage cheio/bloqueado: ignora */ }
}

// Registra uma etapa. Nunca lança, nunca espera — é "dispare e esqueça".
export function logRegistro({ tipo, etapa, ok = null, duracao_ms = null, erro = null, tentativa = null }) {
  const ev = {
    tipo: tipo || null,
    etapa: etapa || null,
    ok,
    duracao_ms: duracao_ms == null ? null : Math.round(duracao_ms),
    erro: erro ? String(erro.message || erro).slice(0, 300) : null,
    tentativa,
    app_version: APP_VERSION,
    online: typeof navigator !== 'undefined' ? navigator.onLine : null,
    criado_em: new Date().toISOString(),
  };
  gravarLocal(ev);
  try {
    if (!state.user?.id) return;   // sem sessão, só fica no aparelho
    const row = {
      ...ev,
      user_id: state.user.id,
      user_nome: state.profile?.nome || null,
      dispositivo: (navigator.userAgent || '').slice(0, 120),
    };
    delete row.criado_em; // o banco carimba sozinho
    Promise.race([
      supabase.from('registro_logs').insert(row),
      new Promise((r) => setTimeout(r, 6000)),
    ]).catch(() => {});
  } catch (e) { /* log nunca pode quebrar o registro */ }
}

// Cronômetro simples pra medir a duração de cada etapa.
export function cronometro() {
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  return () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
}
