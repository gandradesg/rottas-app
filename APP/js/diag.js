// Diagnóstico de registros: grava cada ETAPA de um registro (início, fotos,
// gravação, confirmação, sucesso/falha) com duração e o erro real.
//
// LIÇÃO APRENDIDA (29/09/2026): a primeira versão enviava o log pela MESMA
// conexão que acabara de falhar. Resultado: o banco só tinha logs de registros
// que DERAM CERTO — 104 sucessos do Saulo e 0 falhas — justamente o contrário
// do que precisávamos. Agora o log é SEMPRE gravado no aparelho primeiro, fica
// numa fila, e sobe depois, quando a conexão voltar. Nenhuma falha se perde.
import { supabase, state, redeInfo } from './supabase.js';
import { APP_VERSION } from './config.js';

const KEY = 'rottas-diag-logs';
const MAX_LOCAL = 400;
const ABERTO_EM = Date.now();   // pra medir há quanto tempo a tela está aberta

export function lerLogsLocais() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; }
}
export function limparLogsLocais() {
  try { localStorage.removeItem(KEY); } catch (e) {}
}
function salvarTodos(arr) {
  try {
    while (arr.length > MAX_LOCAL) arr.shift();
    localStorage.setItem(KEY, JSON.stringify(arr));
  } catch (e) { /* cheio/bloqueado: ignora, log nunca pode quebrar o app */ }
}
function gravarLocal(ev) {
  const arr = lerLogsLocais();
  arr.push(ev);
  salvarTodos(arr);
}

// Gera o id que liga todas as etapas de UM registro (a história dele).
export function novoRegistroId() {
  return (self.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'r-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

// ─── CONTEXTO DO APARELHO NO MOMENTO DA FALHA ──────────────────────────────
// É isto que responde "por que trava mesmo com internet boa?". Lemos tudo SEM
// rede (localStorage + APIs do navegador), então funciona mesmo desconectado.
function contextoAgora() {
  const ctx = {
    tela_aberta_min: Math.round((Date.now() - ABERTO_EM) / 60000),
    online: typeof navigator !== 'undefined' ? navigator.onLine : null,
    visivel: typeof document !== 'undefined' ? document.visibilityState : null,
  };
  // Qualidade da rede informada pelo próprio navegador (Android/Chrome).
  try {
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (c) {
      ctx.rede_tipo = c.effectiveType || null;
      ctx.rede_rtt_ms = (c.rtt === undefined ? null : c.rtt);
      ctx.rede_economia = !!c.saveData;
    }
  } catch (e) {}
  // Situação do TOKEN — a hipótese principal para "trava depois de um tempo
  // aberto": o token vence e a renovação não completa. Lido do localStorage,
  // sem tocar na rede.
  try {
    const raw = localStorage.getItem('rottas-app-auth');
    if (!raw) {
      ctx.sessao = 'ausente';
    } else {
      const s = JSON.parse(raw);
      const exp = s && s.expires_at ? s.expires_at * 1000 : null;
      ctx.sessao = 'presente';
      if (exp) {
        ctx.token_expira_em_s = Math.round((exp - Date.now()) / 1000);
        ctx.token_vencido = Date.now() > exp;
      }
      ctx.tem_refresh_token = !!(s && s.refresh_token);
    }
  } catch (e) { ctx.sessao = 'ilegivel'; }
  // Última resposta HTTP real vista pelo app: diz se foi 401/403/5xx ou rede.
  try {
    if (redeInfo) {
      ctx.http_ultimo_status = redeInfo.ultimoStatus;
      ctx.http_ultimo_ms = redeInfo.ultimoMs;
      ctx.http_falhas_rede = redeInfo.falhasRede;
      ctx.http_falhas_401 = redeInfo.falhas401;
      ctx.http_ultimo_alvo = redeInfo.ultimoAlvo;
    }
  } catch (e) {}
  return ctx;
}

// Registra uma etapa. Nunca lança, nunca espera — é "dispare e esqueça".
export function logRegistro({ tipo, etapa, ok = null, duracao_ms = null, erro = null, tentativa = null, registroId = null }) {
  // Erros do Supabase/Postgres trazem code/details/hint — é o que explica a
  // causa técnica real (ex.: 23505 duplicado, 42501 bloqueado por permissão).
  const cod = erro && (erro.code || erro.status) ? String(erro.code || erro.status) : null;
  const det = erro && (erro.details || erro.hint)
    ? String([erro.details, erro.hint].filter(Boolean).join(' | ')).slice(0, 400)
    : null;
  const ev = {
    _lid: novoRegistroId(),        // chave local, só pra controlar o envio
    _enviado: false,
    tipo: tipo || null,
    etapa: etapa || null,
    ok,
    duracao_ms: duracao_ms == null ? null : Math.round(duracao_ms),
    erro: erro ? String(erro.message || erro).slice(0, 300) : null,
    erro_codigo: cod,
    erro_detalhe: det,
    tentativa,
    registro_id: registroId,
    app_version: APP_VERSION,
    online: typeof navigator !== 'undefined' ? navigator.onLine : null,
    contexto: contextoAgora(),
    criado_em: new Date().toISOString(),
  };
  gravarLocal(ev);                 // 1) SEMPRE fica no aparelho, aconteça o que acontecer
  enviarPendentes();               // 2) tenta subir; se falhar, continua na fila
}

// ─── FILA DE LOGS: sobe o que ainda não subiu ──────────────────────────────
let _enviandoLogs = false;
export async function enviarPendentes() {
  if (_enviandoLogs) return 0;
  if (!state.user || !state.user.id) return 0;          // sem sessão: fica guardado
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 0;
  const pendentes = lerLogsLocais().filter(l => !l._enviado);
  if (!pendentes.length) return 0;
  _enviandoLogs = true;
  try {
    const lote = pendentes.slice(0, 50);                // de 50 em 50, sem pesar
    const linhas = lote.map(l => {
      const row = { ...l };
      delete row._lid; delete row._enviado; delete row.criado_em;  // o banco carimba
      row.user_id = state.user.id;
      row.user_nome = (state.profile && state.profile.nome) || null;
      row.dispositivo = (navigator.userAgent || '').slice(0, 120);
      return row;
    });
    const res = await Promise.race([
      supabase.from('registro_logs').insert(linhas),
      new Promise((_, rej) => setTimeout(() => rej(new Error('tempo esgotado')), 8000)),
    ]);
    if (res && res.error) throw res.error;
    // Marca como enviados relendo do zero (outra aba pode ter mexido no meio).
    const enviados = new Set(lote.map(l => l._lid));
    salvarTodos(lerLogsLocais().map(l => (enviados.has(l._lid) ? { ...l, _enviado: true } : l)));
    return lote.length;
  } catch (e) {
    return 0;                                           // continua pendente, tenta depois
  } finally {
    _enviandoLogs = false;
  }
}
export function contarPendentes() {
  return lerLogsLocais().filter(l => !l._enviado).length;
}

// Gatilhos: assim que a conexão voltar, a fila de logs sobe sozinha.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => enviarPendentes());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') enviarPendentes();
  });
  setInterval(() => enviarPendentes(), 30000);
  setTimeout(() => enviarPendentes(), 6000);
}

// Cronômetro simples pra medir a duração de cada etapa.
export function cronometro() {
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  return () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
}

// ─── TESTE DE CONEXÃO (diagnóstico ao vivo) ────────────────────────────────
// Mede, em etapas, onde está a demora: ler a sessão (local), uma consulta
// minúscula e uma consulta real. Assim dá pra ver se o problema é sessão,
// rede/conexão ou a consulta em si — com números, não com achismo.
export async function testarConexao() {
  const etapas = [];
  const medir = async (nome, fn, limiteMs = 12000) => {
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const passou = () => Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0);
    try {
      const r = await Promise.race([
        fn(),
        new Promise((_, rej) => setTimeout(() => rej(new Error(`sem resposta em ${limiteMs / 1000}s`)), limiteMs)),
      ]);
      const erro = r && r.error ? (r.error.message || String(r.error)) : null;
      etapas.push({ etapa: nome, ms: passou(), ok: !erro, erro });
    } catch (e) {
      etapas.push({ etapa: nome, ms: passou(), ok: false, erro: String((e && e.message) || e) });
    }
  };

  await medir('1. Ler sessão (no aparelho)', () => supabase.auth.getSession(), 8000);
  await medir('2. Consulta minúscula (1 linha)', () => supabase.from('outros_tipos').select('id').limit(1));
  await medir('3. Consulta real (usuários)', () => supabase.from('profiles').select('id').limit(50));
  await medir('4. Renovar a sessão (rede)', () => supabase.auth.refreshSession(), 10000);

  etapas.forEach(e => logRegistro({
    tipo: 'teste-conexao', etapa: e.etapa, ok: e.ok, duracao_ms: e.ms,
    erro: e.erro ? { message: e.erro } : null,
  }));
  return etapas;
}
