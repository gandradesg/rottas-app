import { el, toast, loadingBtn, icon } from '../ui.js';
import { setPassword, sendPasswordReset, recoveryState } from '../auth.js';
import { navigate } from '../router.js';
import { state } from '../supabase.js';

export async function setupPasswordView(_params, app) {
  // Modo 1: link expirado/inválido (sem sessão + erro de recovery detectado)
  // Modo 2: recovery válido (sessão recovery ativa)
  // Modo 3: primeiro acesso normal (sessão + primeiro_acesso=true)
  const hasSession = !!state.user;
  const hasError = !!recoveryState.error;
  const isFirst = state.profile?.primeiro_acesso;

  // Detecção de modo
  let mode = 'first';
  if (!hasSession || hasError) mode = 'expired';
  else if (isFirst) mode = 'first';
  else mode = 'change';

  if (mode === 'expired') {
    return renderExpiredMode(app);
  }
  return renderSetPasswordMode(app, mode);
}

// ===== MODO: link expirado / sem sessão =====
function renderExpiredMode(app) {
  const emailInput = el('input', {
    class: 'input', type: 'email', required: true, autocomplete: 'username',
    placeholder: 'seu.email@rottasconstrutora.com.br',
  });
  const sendBtn = el('button', { class: 'btn btn-primary btn-lg w-full mt-2', type: 'submit' }, 'Enviar novo link');

  const form = el('form', { class: 'flex flex-col gap-3' },
    el('div', {}, el('label', { class: 'label label-required' }, 'Email cadastrado'), emailInput),
    sendBtn,
  );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim().toLowerCase();
    if (!email) { toast('Digite seu email', 'error'); return; }
    loadingBtn(sendBtn, true);
    try {
      // Limpa qualquer sessão antiga ANTES de pedir novo link
      try {
        Object.keys(localStorage).forEach(k => {
          if (k.startsWith('rottas-app-auth') || k.startsWith('sb-') || k.toLowerCase().includes('supabase')) {
            localStorage.removeItem(k);
          }
        });
      } catch (e) {}
      await sendPasswordReset(email);
      // Limpa erro
      recoveryState.error = null;
      // Mostra confirmação
      app.innerHTML = '';
      app.appendChild(buildConfirmationScreen(email));
    } catch (err) {
      toast(err.message || 'Erro ao enviar email', 'error', 5000);
      loadingBtn(sendBtn, false);
    }
  });

  app.appendChild(
    el('div', { class: 'min-h-screen flex flex-col items-center justify-center p-6' },
      el('div', { class: 'w-full max-w-md' },
        el('img', { src: '/assets/logo-rottas.png', class: 'h-12 mb-6 mx-auto' }),
        el('div', { class: 'card p-7' },
          // Banner de aviso
          el('div', { class: 'flex items-start gap-3 p-3 rounded-lg mb-5',
            style: { background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' } },
            el('span', { class: 'text-2xl' }, '⏳'),
            el('div', { class: 'flex-1 text-sm' },
              el('div', { class: 'font-bold text-warning' }, 'Link expirado ou já utilizado'),
              el('div', { class: 'text-fg-muted mt-0.5' },
                'Por segurança, o link de definir senha só pode ser usado uma vez.',
              ),
            ),
          ),
          el('h1', { class: 'text-2xl font-bold mb-1' }, 'Receber novo link'),
          el('p', { class: 'text-sm text-fg-muted mb-5' },
            'Digite seu email cadastrado e enviaremos um novo link para você definir sua senha.',
          ),
          form,
          el('button', {
            class: 'btn btn-ghost w-full mt-3 text-sm',
            onclick: () => { recoveryState.error = null; navigate('/login'); }
          }, '← Voltar para login'),
        ),
      ),
    )
  );
  setTimeout(() => emailInput.focus(), 80);
}

function buildConfirmationScreen(email) {
  return el('div', { class: 'min-h-screen flex flex-col items-center justify-center p-6' },
    el('div', { class: 'w-full max-w-md' },
      el('img', { src: '/assets/logo-rottas.png', class: 'h-12 mb-6 mx-auto' }),
      el('div', { class: 'card p-7 text-center' },
        el('div', { class: 'text-5xl mb-3' }, '✅'),
        el('h1', { class: 'text-2xl font-bold mb-2' }, 'Email enviado!'),
        el('p', { class: 'text-sm text-fg-muted mb-1' },
          'Enviamos um novo link para:',
        ),
        el('p', { class: 'font-bold text-rottas-500 mb-4' }, email),
        el('div', { class: 'text-xs text-fg-muted gradient-rottas-soft p-3 rounded-lg mb-4' },
          '⏱️ Pode levar 1–2 minutos para chegar.',
          el('br', {}),
          'Verifique também a pasta de spam.',
        ),
        el('button', {
          class: 'btn btn-secondary w-full',
          onclick: () => { recoveryState.error = null; navigate('/login'); }
        }, 'Voltar para login'),
      ),
    ),
  );
}

// ===== MODO: definir senha (recovery válido OU primeiro acesso) =====
function renderSetPasswordMode(app, mode) {
  const newInput = el('input', { class: 'input', type: 'password', required: true, minlength: 8, placeholder: 'Mínimo 8 caracteres' });
  const confirmInput = el('input', { class: 'input', type: 'password', required: true, minlength: 8, placeholder: 'Repita a senha' });
  const btn = el('button', { class: 'btn btn-primary btn-lg w-full mt-2', type: 'submit' }, 'Salvar senha');

  const form = el('form', { class: 'flex flex-col gap-4' },
    el('div', {}, el('label', { class: 'label' }, 'Nova senha'), newInput),
    el('div', {}, el('label', { class: 'label' }, 'Confirmar senha'), confirmInput),
    btn,
  );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (newInput.value !== confirmInput.value) {
      toast('As senhas não coincidem', 'error');
      return;
    }
    if (newInput.value.length < 8) {
      toast('A senha deve ter ao menos 8 caracteres', 'error');
      return;
    }
    loadingBtn(btn, true);
    // Timeout aumentado para 60s (rede lenta + listeners do Supabase podem demorar)
    let resolved = false;
    const timeout = setTimeout(() => {
      if (resolved) return;
      loadingBtn(btn, false);
      toast('A operação está demorando mais que o esperado. Tente novamente ou veja o console (F12)', 'error', 7000);
    }, 60000);
    try {
      await setPassword(newInput.value);
      resolved = true;
      clearTimeout(timeout);
      toast('✓ Senha definida!', 'success');
      navigate('/', true);
    } catch (err) {
      resolved = true;
      clearTimeout(timeout);
      console.error('Erro setPassword:', err);
      toast(err.message || JSON.stringify(err) || 'Erro ao salvar senha', 'error', 6000);
      loadingBtn(btn, false);
    }
  });

  app.appendChild(
    el('div', { class: 'min-h-screen flex flex-col items-center justify-center p-6' },
      el('div', { class: 'w-full max-w-md' },
        el('img', { src: '/assets/logo-rottas.png', class: 'h-12 mb-6 mx-auto' }),
        el('div', { class: 'card p-7' },
          el('h1', { class: 'text-2xl font-bold mb-1' }, mode === 'first' ? 'Defina sua senha' : 'Alterar senha'),
          el('p', { class: 'text-sm text-fg-muted mb-6' },
            mode === 'first'
              ? 'Este é seu primeiro acesso. Crie uma senha segura para continuar.'
              : 'Escolha uma nova senha.'
          ),
          form,
        ),
      ),
    )
  );
  newInput.focus();
}
