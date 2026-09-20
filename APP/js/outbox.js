// FILA OFFLINE ("caixa de saída") — o registro NUNCA se perde.
//
// Quando a gravação falha (rede caiu, conexão morta, servidor fora), em vez de
// perder o que o gerente preencheu, guardamos tudo AQUI no aparelho — inclusive
// as fotos — e enviamos sozinho assim que a conexão voltar.
//
// Usamos IndexedDB (e não localStorage) porque ele guarda as FOTOS (Blob) e tem
// espaço de sobra. Tudo é idempotente: cada registro leva um id gerado no
// aparelho, então reenviar NUNCA duplica.
import { supabase, state } from './supabase.js';
import { uploadPhotos } from './storage.js';
import { logRegistro } from './diag.js';

const DB_NAME = 'rottas-outbox';
const STORE = 'pendentes';
let _dbPromise = null;

function abrirDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}
const pedido = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export async function guardar(item) {
  const db = await abrirDB();
  const t = db.transaction(STORE, 'readwrite');
  await pedido(t.objectStore(STORE).put(item));
  notificar();
  return item.id;
}
export async function listar() {
  try {
    const db = await abrirDB();
    const t = db.transaction(STORE, 'readonly');
    const all = await pedido(t.objectStore(STORE).getAll());
    return (all || []).sort((a, b) => String(a.criadoEm || '').localeCompare(String(b.criadoEm || '')));
  } catch (e) { return []; }
}
export async function remover(id) {
  const db = await abrirDB();
  const t = db.transaction(STORE, 'readwrite');
  await pedido(t.objectStore(STORE).delete(id));
  notificar();
}
export async function contar() { return (await listar()).length; }

// ── Avisos de mudança (pro selo na tela) ──────────────────────────────────
const _ouvintes = new Set();
export function aoMudar(fn) { _ouvintes.add(fn); return () => _ouvintes.delete(fn); }
function notificar() {
  contar().then(n => { _ouvintes.forEach(f => { try { f(n); } catch (e) {} }); atualizarSelo(n); }).catch(() => {});
}

// ── Envio ─────────────────────────────────────────────────────────────────
let _enviando = false;
export async function sincronizar() {
  if (_enviando) return { enviados: 0 };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { enviados: 0 };
  if (!state.user?.id) return { enviados: 0 };
  _enviando = true;
  let enviados = 0;
  try {
    const itens = await listar();
    for (const item of itens) {
      try {
        const row = { ...item.row };
        // 1) sobe as fotos que ficaram guardadas no aparelho
        if (Array.isArray(item.fotos) && item.fotos.length) {
          const urls = await uploadPhotos(item.fotos);
          row.fotos = [...(Array.isArray(row.fotos) ? row.fotos : []), ...urls];
        }
        // 2) grava (mesmo id → reenviar não duplica)
        const res = await Promise.race([
          supabase.from(item.tabela).upsert(row, { onConflict: 'id' }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('tempo esgotado')), 12000)),
        ]);
        if (res.error) throw res.error;
        // 3) confirma que entrou de verdade
        const chk = await Promise.race([
          supabase.from(item.tabela).select('id').eq('id', row.id).maybeSingle(),
          new Promise((_, rej) => setTimeout(() => rej(new Error('tempo esgotado ao confirmar')), 8000)),
        ]);
        if (chk.error) throw chk.error;
        if (!chk.data) throw new Error('não confirmado no servidor');
        // 4) vínculos que dependiam do registro (marcar agenda como realizada)
        if (item.posSync && item.posSync.agendamentoId) {
          try {
            if (item.posSync.grupoId) {
              await supabase.rpc('realizar_agendamento_grupo', { p_grupo_id: item.posSync.grupoId, p_atividade_id: row.id });
            } else {
              await supabase.from('agendamentos').update({
                status: 'realizado', atividade_id: row.id, realizado_em: new Date().toISOString(),
              }).eq('id', item.posSync.agendamentoId);
            }
          } catch (e) { /* o registro já entrou; o vínculo não bloqueia */ }
        }
        await remover(item.id);
        enviados++;
        logRegistro({ tipo: item.tipo, etapa: 'sucesso', ok: true, erro: 'enviado pela fila offline' });
      } catch (e) {
        item.tentativas = (item.tentativas || 0) + 1;
        item.ultimoErro = String((e && e.message) || e).slice(0, 300);
        await guardar(item);
        logRegistro({ tipo: item.tipo, etapa: 'falha', ok: false, erro: e, tentativa: item.tentativas });
        break; // conexão ainda ruim: para e tenta de novo mais tarde
      }
    }
  } finally {
    _enviando = false;
    notificar();
  }
  return { enviados };
}

// ── Painel "o que está aguardando envio" ──────────────────────────────────
// IMPORTANTE contra duplicidade: o gerente PRECISA enxergar que o registro
// existe e está só aguardando envio — senão ele registra de novo, achando que
// não foi, e aí sim nascem dois registros diferentes.
export async function abrirPainelFila() {
  const { el, modal, fmt } = await import('./ui.js');
  const itens = await listar();
  const linhas = itens.length
    ? itens.map(it => {
        const r = it.row || {};
        const titulo = r.imobiliaria || r.titulo || r.motivo_visita || r.cliente || (it.tipo || 'Registro');
        return el('div', { class: 'card p-3 flex flex-col gap-0.5' },
          el('div', { class: 'flex items-center gap-2 flex-wrap' },
            el('span', { class: 'font-semibold' }, String(titulo)),
            el('span', { class: 'chip chip-yellow text-[10px]' }, '📥 Aguardando envio'),
          ),
          el('div', { class: 'text-xs text-fg-muted' },
            (it.tipo || '—') + ' · salvo em ' + fmt.dateTime(it.criadoEm) +
            (Array.isArray(it.fotos) && it.fotos.length ? ` · ${it.fotos.length} foto(s)` : '')),
          it.ultimoErro ? el('div', { class: 'text-xs text-danger break-words' }, '⚠ ' + it.ultimoErro) : null,
        );
      })
    : [el('div', { class: 'text-sm text-fg-muted' }, 'Nada aguardando envio. Tudo sincronizado. ✓')];

  const btnEnviar = el('button', { class: 'btn btn-primary' }, 'Enviar agora');
  const btnFechar = el('button', { class: 'btn btn-ghost' }, 'Fechar');
  const m = modal({
    title: '📥 Registros aguardando envio',
    size: 'sm',
    content: el('div', { class: 'flex flex-col gap-2' },
      el('p', { class: 'text-xs text-fg-muted' },
        'Estes registros JÁ ESTÃO salvos no seu aparelho — não registre de novo. Eles sobem sozinhos quando a conexão voltar.'),
      ...linhas,
    ),
    footer: [btnFechar, btnEnviar],
  });
  btnFechar.addEventListener('click', () => m.close());
  btnEnviar.addEventListener('click', async () => {
    btnEnviar.disabled = true; btnEnviar.textContent = 'Enviando...';
    const { enviados } = await sincronizar();
    m.close();
    const { toast } = await import('./ui.js');
    const restam = await contar();
    if (enviados) toast(`✓ ${enviados} registro(s) enviado(s).` + (restam ? ` ${restam} ainda pendente(s).` : ''), 'success', 5000);
    else toast(restam ? 'Ainda sem conexão. Continua guardado no aparelho.' : 'Nada pendente.', restam ? 'warning' : 'info', 5000);
  });
}

// ── Selo flutuante "N aguardando envio" ───────────────────────────────────
function atualizarSelo(n) {
  if (typeof document === 'undefined' || !document.body) return;
  let selo = document.getElementById('outbox-selo');
  if (!n) { if (selo) selo.remove(); return; }
  if (!selo) {
    selo = document.createElement('div');
    selo.id = 'outbox-selo';
    selo.style.cssText = 'position:fixed;left:12px;bottom:78px;z-index:9998;background:#0F1525;color:#fff;border:1px solid rgba(255,255,255,.25);border-radius:999px;padding:8px 14px;font:13px/1.2 sans-serif;display:flex;gap:10px;align-items:center;box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer';
    selo.title = 'Registros salvos no aparelho, aguardando envio — toque para ver';
    selo.onclick = () => { abrirPainelFila(); };
    document.body.appendChild(selo);
  }
  selo.innerHTML = `<span>📥 <b>${n}</b> aguardando envio</span><span style="opacity:.75">ver</span>`;
}

// ── Gatilhos automáticos ──────────────────────────────────────────────────
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => sincronizar());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') sincronizar();
  });
  setInterval(() => sincronizar(), 45000);   // tenta de tempos em tempos
  setTimeout(() => { notificar(); sincronizar(); }, 4000); // logo após abrir o app
}
