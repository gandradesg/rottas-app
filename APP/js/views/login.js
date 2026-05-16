import { el, toast, loadingBtn, icon, modal } from '../ui.js';
import { signIn, signOut, sendPasswordReset } from '../auth.js';
import { navigate } from '../router.js';
import { toggleTheme, getTheme } from '../theme.js';
import { getChosenLoginRole, setChosenLoginRole } from './role-select.js';
import { state } from '../supabase.js';

export async function loginView(_params, app) {
  // Login simplificado - sem pré-escolha de perfil. O role real do user define a visão.
  // Roles admin podem alternar pra "visão Gerente" pelo toggle no header depois.
  const accent = { bg: 'rgba(242,107,34,0.12)', fg: '#F26B22', label: 'Plataforma de Gerentes', ic: 'barChart' };
  const isGestor = false;

  const form = el('form', { class: 'flex flex-col gap-4 w-full' });
  const emailInput = el('input', { class: 'input', type: 'email', name: 'email', required: true,
    placeholder: 'seu.email@rottasconstrutora.com.br', autocomplete: 'username' });
  const passInput = el('input', { class: 'input', type: 'password', name: 'password', required: true,
    placeholder: 'Senha', autocomplete: 'current-password' });
  const submitBtn = el('button', { class: 'btn btn-primary btn-lg w-full mt-2', type: 'submit' }, 'Entrar');

  // Link de primeiro acesso / esqueci senha
  const firstAccessLink = el('button', {
    type: 'button',
    class: 'text-xs text-rottas-500 hover:underline self-start font-semibold',
    onclick: () => openFirstAccessModal(emailInput.value)
  }, '🔑 Primeiro acesso ou esqueci a senha');

  form.append(
    el('div', {}, el('label', { class: 'label' }, 'Email'), emailInput),
    el('div', {},
      el('div', { class: 'flex items-center justify-between mb-1' },
        el('label', { class: 'label mb-0' }, 'Senha'),
        firstAccessLink,
      ),
      passInput,
    ),
    submitBtn,
  );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    loadingBtn(submitBtn, true);
    try {
      await signIn(emailInput.value.trim().toLowerCase(), passInput.value);
      const userRole = state.profile?.role;
      // Master pode entrar em qualquer perfil. Gestor só entra como gestor. Gerente só como gerente.
      if (userRole === 'master') {
        // Master usa o perfil escolhido - fica armazenado para a sessão
        toast(`Logado como ${accent.label}`, 'success');
      } else if (userRole === 'gestor' && chosenRole === 'gerente') {
        await signOut();
        toast('Sua conta é de Gestor. Volte e selecione "Gestor".', 'error', 6000);
        loadingBtn(submitBtn, false);
        return;
      } else if (userRole === 'gerente' && chosenRole === 'gestor') {
        await signOut();
        toast('Sua conta é de Gerente. Volte e selecione "Gerente".', 'error', 6000);
        loadingBtn(submitBtn, false);
        return;
      } else if (!state.profile?.ativo) {
        await signOut();
        toast('Conta desativada. Procure o administrador.', 'error', 6000);
        loadingBtn(submitBtn, false);
        return;
      } else {
        toast('Login realizado!', 'success');
      }
      navigate('/', true);
    } catch (err) {
      toast(err.message || 'Falha no login', 'error');
      loadingBtn(submitBtn, false);
    }
  });

  const themeBtn = el('button', {
    class: 'absolute top-4 right-4 p-2.5 rounded-full bg-bg-card border border-border hover:bg-bg-elev transition',
    onclick: () => { toggleTheme(); }
  }, icon('sun', 18));

  const backBtn = null; // Removido - sem tela de role-select

  const layout = el('div', { class: 'min-h-screen flex flex-col items-center justify-center p-6 relative' },
    backBtn, themeBtn,
    el('div', { class: 'w-full max-w-md' },
      // Logo
      el('div', { class: 'flex flex-col items-center mb-6' },
        el('img', { src: '/assets/logo-rottas.png', alt: 'Rottas', class: 'h-14 mb-3' }),
      ),
      // Card
      el('div', { class: 'card p-7 animate-slide-up' },
        // Badge do perfil escolhido
        el('div', { class: 'inline-flex items-center gap-2 mb-4 px-3 py-1.5 rounded-full text-xs font-bold',
          style: { background: accent.bg, color: accent.fg } },
          icon(accent.ic, 14), 'Entrando como ' + accent.label
        ),
        el('h1', { class: 'text-2xl font-bold mb-1' }, 'Bem-vindo de volta'),
        el('p', { class: 'text-sm text-fg-muted mb-6' }, 'Use seu email e senha corporativos.'),
        form,
      ),
    ),
    el('div', { class: 'absolute -z-10 top-0 right-0 w-96 h-96 rounded-full opacity-20 blur-3xl pointer-events-none',
      style: { background: 'radial-gradient(circle, #F26B22, transparent 70%)' } }),
    el('div', { class: 'absolute -z-10 bottom-0 left-0 w-96 h-96 rounded-full opacity-15 blur-3xl pointer-events-none',
      style: { background: 'radial-gradient(circle, #FB8235, transparent 70%)' } }),
  );

  app.appendChild(layout);
  setTimeout(() => emailInput.focus(), 100);
}

// Modal de "Primeiro acesso ou esqueci a senha"
function openFirstAccessModal(prefilledEmail = '') {
  const emailInp = el('input', {
    class: 'input', type: 'email', value: prefilledEmail,
    placeholder: 'seu.email@rottasconstrutora.com.br'
  });
  const sendBtn = el('button', { class: 'btn btn-primary' }, 'Enviar link');
  const cancelBtn = el('button', { class: 'btn btn-ghost', onclick: () => m.close() }, 'Cancelar');

  const content = el('div', { class: 'flex flex-col gap-3' },
    el('p', { class: 'text-sm text-fg-muted' },
      'Digite seu email cadastrado e enviaremos um link para você ',
      el('strong', {}, 'definir ou redefinir sua senha'), '.',
    ),
    el('div', {},
      el('label', { class: 'label label-required' }, 'Email'),
      emailInp,
    ),
    el('div', { class: 'card p-3 text-xs text-fg-muted gradient-rottas-soft' },
      el('strong', {}, '💡 Primeiro acesso? '),
      'Se você foi convidado pelo administrador, use este botão para definir sua senha pela primeira vez.',
    ),
  );

  const m = modal({ title: '🔑 Acesso à conta', size: 'sm', content, footer: [cancelBtn, sendBtn] });
  setTimeout(() => emailInp.focus(), 80);

  sendBtn.addEventListener('click', async () => {
    const email = emailInp.value.trim().toLowerCase();
    if (!email) { toast('Digite seu email', 'error'); return; }
    loadingBtn(sendBtn, true);
    try {
      await sendPasswordReset(email);
      m.close();
      // Modal de confirmação amigável
      modal({
        title: '✅ Email enviado!',
        size: 'sm',
        content: el('div', { class: 'flex flex-col gap-3' },
          el('p', { class: 'text-sm' },
            'Enviamos um link para ',
            el('strong', {}, email),
            '. Clique nele para criar sua senha e acessar o app.',
          ),
          el('p', { class: 'text-xs text-fg-muted' },
            '⏱️ Pode levar 1–2 minutos. Verifique também a pasta de spam.',
          ),
        ),
        footer: el('button', { class: 'btn btn-primary', onclick: () => document.querySelector('#modal-root .modal-overlay')?.remove() }, 'OK, entendi'),
      });
    } catch (err) {
      toast(err.message || 'Erro ao enviar', 'error');
      loadingBtn(sendBtn, false);
    }
  });
}
