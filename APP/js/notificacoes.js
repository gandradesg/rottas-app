// NOTIFICAÇÕES DO APP (Web Push) + INSTALAÇÃO DO APP
//
// O aparelho se inscreve (com permissão do usuário) e o servidor manda o lembrete
// da agenda: às 18h (agenda do dia seguinte) e na segunda às 8h (a semana).
// Quem envia é o SERVIDOR (função lembretes-agenda) — não depende do app aberto.
//
// iPhone: só existe notificação com o app INSTALADO na Tela de Início (iOS 16.4+)
// e aberto pelo ícone. No Safari com barra de endereço não há como notificar —
// por isso o passo a passo de instalação.
import { supabase, state, onStateChange } from './supabase.js';
import { VAPID_PUBLIC_KEY } from './config.js';
import { el, toast } from './ui.js';

// Quem recebe lembretes (masters ficam de fora por enquanto).
const PAPEIS_COM_LEMBRETE = ['gerente', 'supervisor', 'gestor_regional', 'superintendente'];
const ADIADO_KEY = 'notif-adiado-ate';

export const ehIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const instalado = () => (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
  || navigator.standalone === true;
export const suportaPush = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const recebeLembretes = () => PAPEIS_COM_LEMBRETE.includes(state.profile && state.profile.role);

function b64ParaBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
// navigator.serviceWorker.ready nunca resolve se não houver SW — limita a espera.
function swPronto(ms = 5000) {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, rej) => setTimeout(() => rej(new Error('O app ainda está carregando. Tente de novo em instantes.')), ms)),
  ]);
}

export async function estadoNotificacoes() {
  const ios = ehIOS(), inst = instalado(), sup = suportaPush();
  const permissao = ('Notification' in window) ? Notification.permission : 'indisponivel';
  let inscrito = false;
  if (sup && permissao === 'granted') {
    try { const reg = await swPronto(); inscrito = !!(await reg.pushManager.getSubscription()); } catch (e) {}
  }
  let passo;
  if (inscrito) passo = 'ativo';
  else if (ios && !inst) passo = 'instalar-ios';
  else if (!sup) passo = 'sem-suporte';
  else if (permissao === 'denied') passo = 'bloqueado';
  else passo = 'ativar';
  return { ios, instalado: inst, suporta: sup, permissao, inscrito, passo, podeInstalar: !!window.__rottasInstallPrompt && !inst };
}

async function registrarNoServidor(sub) {
  const j = sub.toJSON();
  const { error } = await supabase.rpc('registrar_push', {
    p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth,
    p_dispositivo: (navigator.userAgent || '').slice(0, 160),
  });
  if (error) throw error;
}

// IMPORTANTE (iPhone): tem que ser chamada DIRETO no toque do botão — o pedido de
// permissão é o primeiro await, sem nada antes.
export async function ativarNotificacoes() {
  if (!suportaPush()) {
    throw new Error(ehIOS() && !instalado() ? 'Instale o app na Tela de Início primeiro.' : 'Este navegador não suporta notificações.');
  }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') {
    throw new Error(perm === 'denied'
      ? 'As notificações foram bloqueadas. Libere nas configurações do navegador.'
      : 'Permissão não concedida.');
  }
  const reg = await swPronto();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ParaBytes(VAPID_PUBLIC_KEY) });
  await registrarNoServidor(sub);
  try { localStorage.removeItem(ADIADO_KEY); } catch (e) {}
  return true;
}

// A cada abertura: se já tem permissão, garante que o servidor conhece ESTE
// aparelho (o navegador pode trocar a inscrição, e o servidor apaga as vencidas).
let _ultimaSync = 0;
export async function sincronizarInscricao() {
  try {
    if (!state.user || !state.user.id || !suportaPush() || Notification.permission !== 'granted') return;
    if (Date.now() - _ultimaSync < 10 * 60 * 1000) return;
    _ultimaSync = Date.now();
    const reg = await swPronto();
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      try { sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ParaBytes(VAPID_PUBLIC_KEY) }); }
      catch (e) { return; }   // iPhone pode exigir um toque: o cartão pede de novo
    }
    await registrarNoServidor(sub);
  } catch (e) { _ultimaSync = 0; }
}

// No logout: este aparelho para de receber os lembretes de quem saiu.
export async function desvincularAparelho() {
  try {
    if (!suportaPush()) return;
    const reg = await swPronto(2000);
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    try { await supabase.rpc('remover_push', { p_endpoint: sub.endpoint }); } catch (e) {}
    await sub.unsubscribe();
  } catch (e) {}
}

// variante: undefined = "ativadas!", 'manha' = exemplo do bom dia, 'antes15' = exemplo dos 15 min
export async function testarNotificacao(variante) {
  const { data, error } = await supabase.functions.invoke('lembretes-agenda', { body: { modo: 'push-teste', variante } });
  if (error) throw error;
  return data;
}

export async function instalarApp() {
  const p = window.__rottasInstallPrompt;
  if (!p) return false;
  p.prompt();
  const { outcome } = await p.userChoice;
  window.__rottasInstallPrompt = null;
  return outcome === 'accepted';
}

// ─── Interface ──────────────────────────────────────────────────────────────
function passoIOS(n, texto) {
  return el('div', { class: 'flex items-start gap-2 text-sm' },
    el('span', { class: 'w-6 h-6 rounded-full bg-rottas-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0' }, String(n)),
    el('span', { class: 'pt-0.5' }, ...texto),
  );
}

// Cartão com o PRÓXIMO passo certo para este aparelho.
//   modo 'banner' → topo das telas, só quando falta configurar (com "Agora não")
//   modo 'perfil' → sempre, com o estado atual + testar/desativar
export function cartaoNotificacoes({ modo = 'perfil' } = {}) {
  const raiz = el('div', {});
  async function pintar() {
    const e = await estadoNotificacoes();
    raiz.innerHTML = '';
    if (modo === 'banner') {
      if (!recebeLembretes() || e.passo === 'ativo' || e.passo === 'sem-suporte' || e.passo === 'bloqueado') return;
      let ate = 0; try { ate = +localStorage.getItem(ADIADO_KEY) || 0; } catch (x) {}
      if (Date.now() < ate) return;
    }
    const titulo = el('div', { class: 'font-bold text-sm' }, '🔔 Lembretes da sua agenda');
    const desc = el('div', { class: 'text-xs text-fg-muted' },
      'No celular: às 8h, quantas atividades você tem no dia, e 15 minutos antes de cada uma. ' +
      'Às 18h, a agenda de amanhã, e na segunda às 8h, a da semana (também por e-mail).');
    const corpo = [];
    const botoes = [];

    if (e.passo === 'instalar-ios') {
      corpo.push(
        el('div', { class: 'text-sm' }, 'No iPhone, os avisos só chegam com o app ', el('b', {}, 'instalado'), ':'),
        passoIOS(1, ['Toque em ', el('b', {}, 'Compartilhar'), ' ', el('span', { class: 'text-base' }, '⬆️'), ' na barra do Safari']),
        passoIOS(2, ['Escolha ', el('b', {}, '“Adicionar à Tela de Início”')]),
        passoIOS(3, ['Abra o ', el('b', {}, 'Imob Rottas'), ' pelo ícone novo e toque em ', el('b', {}, 'Ativar notificações')]),
      );
    } else if (e.passo === 'ativar') {
      if (e.podeInstalar) {
        const bInst = el('button', { class: 'btn btn-secondary btn-sm' }, '📲 Instalar o app');
        bInst.addEventListener('click', async () => { if (await instalarApp()) toast('App instalado! Abra pelo ícone.', 'success', 4000); pintar(); });
        botoes.push(bInst);
      }
      const bAtivar = el('button', { class: 'btn btn-primary btn-sm' }, '🔔 Ativar notificações');
      bAtivar.addEventListener('click', () => {
        bAtivar.disabled = true; bAtivar.textContent = 'Ativando...';
        ativarNotificacoes()   // chamada direta no toque (exigência do iPhone)
          .then(() => testarNotificacao().catch(() => null))
          .then(() => { toast('✓ Notificações ativadas! Enviamos uma de teste.', 'success', 5000); pintar(); })
          .catch((err) => { toast(err.message || 'Não foi possível ativar.', 'error', 6000); pintar(); });
      });
      botoes.push(bAtivar);
    } else if (e.passo === 'bloqueado') {
      corpo.push(el('div', { class: 'text-sm text-warning' },
        'As notificações estão bloqueadas neste aparelho. Para liberar, abra as configurações do navegador (ou do app instalado) → Notificações → Permitir. Os lembretes continuam chegando por e-mail.'));
    } else if (e.passo === 'sem-suporte') {
      corpo.push(el('div', { class: 'text-sm text-fg-muted' },
        'Este navegador não suporta notificações. Os lembretes continuam chegando por e-mail.'));
    } else if (e.passo === 'ativo') {
      corpo.push(el('div', { class: 'text-sm text-success font-semibold' }, '✅ Ativadas neste aparelho'));
      corpo.push(el('div', { class: 'text-xs text-fg-muted' }, 'Teste agora como cada aviso aparece (usa a sua agenda real):'));
      const botaoTeste = (rotulo, variante) => {
        const b = el('button', { class: 'btn btn-secondary btn-sm' }, rotulo);
        b.addEventListener('click', async () => {
          b.disabled = true; b.textContent = 'Enviando...';
          try {
            const r = await testarNotificacao(variante);
            toast(r && r.enviados ? '✓ Enviada! Deve aparecer em segundos.' : 'O servidor não achou este aparelho. Toque em Desativar e ative de novo.',
              r && r.enviados ? 'success' : 'warning', 5000);
          } catch (err) { toast('Falha ao enviar: ' + (err.message || err), 'error', 6000); }
          b.disabled = false; b.textContent = rotulo;
        });
        return b;
      };
      const bOff = el('button', { class: 'btn btn-ghost btn-sm' }, 'Desativar');
      bOff.addEventListener('click', async () => { await desvincularAparelho(); toast('Notificações desativadas neste aparelho.', 'info', 4000); pintar(); });
      botoes.push(botaoTeste('☀️ Testar “bom dia”', 'manha'), botaoTeste('⏰ Testar “15 min antes”', 'antes15'), bOff);
    }

    if (modo === 'banner') {
      const bDepois = el('button', { class: 'btn btn-ghost btn-sm' }, 'Agora não');
      bDepois.addEventListener('click', () => {
        try { localStorage.setItem(ADIADO_KEY, String(Date.now() + 3 * 24 * 3600 * 1000)); } catch (x) {}
        raiz.innerHTML = '';
      });
      botoes.push(bDepois);
    }
    raiz.appendChild(el('div', { class: modo === 'banner' ? 'card p-3 mb-3 flex flex-col gap-2 border-l-4 border-rottas-500' : 'flex flex-col gap-2' },
      modo === 'banner' ? titulo : null, desc, ...corpo,
      botoes.length ? el('div', { class: 'flex gap-2 flex-wrap mt-1' }, ...botoes) : null,
    ));
  }
  pintar();
  return raiz;
}

// Mantém a inscrição em dia: ao abrir o app e quando o login muda.
if (typeof window !== 'undefined') {
  setTimeout(() => sincronizarInscricao(), 5000);
  try { onStateChange(() => { if (state.user) sincronizarInscricao(); }); } catch (e) {}
}
