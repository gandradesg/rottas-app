import { el, toast, loadingBtn } from '../ui.js';
import { setPassword } from '../auth.js';
import { navigate } from '../router.js';
import { state } from '../supabase.js';

export async function setupPasswordView(_params, app) {
  const isFirst = state.profile?.primeiro_acesso;

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
    // timeout de segurança — nunca deixa o botão girando além de 20s
    const timeout = setTimeout(() => {
      loadingBtn(btn, false);
      toast('Tempo esgotado — abra o console (F12) e me mande o erro', 'error', 6000);
    }, 20000);
    try {
      await setPassword(newInput.value);
      clearTimeout(timeout);
      toast('Senha definida com sucesso!', 'success');
      navigate('/', true);
    } catch (err) {
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
          el('h1', { class: 'text-2xl font-bold mb-1' }, isFirst ? 'Defina sua senha' : 'Alterar senha'),
          el('p', { class: 'text-sm text-fg-muted mb-6' },
            isFirst
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
