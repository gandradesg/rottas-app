// Perfil do usuário: ver/editar dados, alterar senha, configurar Whisper, logout
import { el, icon, toast, loadingBtn, fmt, modal, confirmModal } from '../ui.js';
import { shell } from './shell.js';
import { state, supabase } from '../supabase.js';
import { signOut, setPassword, isMaster } from '../auth.js';
import { ESTADOS_BR, APP_VERSION } from '../config.js';
import { navigate } from '../router.js';

export async function perfilView(_params, app) {
  const p = state.profile;
  if (!p) return;

  const nome = el('input', { class: 'input', value: p.nome });
  const tel = el('input', { class: 'input', value: p.telefone || '', placeholder: '(00) 00000-0000' });
  const cidade = el('input', { class: 'input', value: p.cidade || '' });
  const estado = el('select', { class: 'select' },
    el('option', { value: '' }, 'UF'),
    ...ESTADOS_BR.map(u => el('option', { value: u, selected: p.estado === u }, u)),
  );

  const saveBtn = el('button', { class: 'btn btn-primary w-full mt-2' }, 'Salvar dados');
  saveBtn.addEventListener('click', async () => {
    loadingBtn(saveBtn, true);
    try {
      const { error } = await supabase.from('profiles').update({
        nome: nome.value.trim(),
        telefone: tel.value.trim() || null,
        cidade: cidade.value.trim() || null,
        estado: estado.value || null,
      }).eq('id', p.id);
      if (error) throw error;
      Object.assign(p, { nome: nome.value, telefone: tel.value, cidade: cidade.value, estado: estado.value });
      toast('Dados atualizados', 'success');
    } catch (e) { toast(e.message, 'error'); }
    finally { loadingBtn(saveBtn, false); }
  });

  // Senha
  const oldPwd = el('input', { class: 'input', type: 'password', placeholder: 'Senha atual (opcional)' });
  const newPwd = el('input', { class: 'input', type: 'password', placeholder: 'Nova senha (mín. 8)' });
  const confirmPwd = el('input', { class: 'input', type: 'password', placeholder: 'Confirmar nova senha' });
  const pwdBtn = el('button', { class: 'btn btn-secondary w-full' }, 'Alterar senha');
  pwdBtn.addEventListener('click', async () => {
    if (newPwd.value !== confirmPwd.value) return toast('Senhas não coincidem', 'error');
    if (newPwd.value.length < 8) return toast('Mínimo 8 caracteres', 'error');
    loadingBtn(pwdBtn, true);
    try {
      await setPassword(newPwd.value);
      toast('Senha alterada', 'success');
      oldPwd.value = newPwd.value = confirmPwd.value = '';
    } catch (e) { toast(e.message, 'error'); }
    finally { loadingBtn(pwdBtn, false); }
  });

  // OpenAI key (transcrição)
  const apiKey = el('input', { class: 'input', type: 'password', value: localStorage.getItem('rottas-openai-key') || '', placeholder: 'sk-...' });
  const saveKey = el('button', { class: 'btn btn-secondary w-full' }, 'Salvar chave');
  saveKey.addEventListener('click', () => {
    localStorage.setItem('rottas-openai-key', apiKey.value.trim());
    toast('Chave salva (apenas neste dispositivo)', 'success');
  });
  const removeKey = el('button', { class: 'btn btn-ghost btn-sm', onclick: () => {
    localStorage.removeItem('rottas-openai-key');
    apiKey.value = '';
    toast('Chave removida', 'info');
  } }, 'Remover chave');

  const content = el('div', { class: 'flex flex-col gap-4' },
    // Cabeçalho
    el('div', { class: 'card p-5 flex items-center gap-4' },
      el('div', {
        class: 'w-16 h-16 rounded-full flex items-center justify-center font-bold text-white text-xl',
        style: { background: 'linear-gradient(135deg, #F26B22, #D5530F)' }
      }, p.nome.split(' ').map(s=>s[0]).slice(0,2).join('').toUpperCase()),
      el('div', { class: 'flex-1' },
        el('div', { class: 'font-bold' }, p.nome),
        el('div', { class: 'text-xs text-fg-muted' }, p.email),
        el('div', { class: 'mt-1' },
          el('span', { class: 'chip ' + (isMaster() ? 'chip-orange' : 'chip-blue') },
            isMaster() ? 'Master' : 'Gerente de Plataforma'),
        ),
      ),
    ),

    // Dados
    el('div', { class: 'card p-4' },
      el('h2', { class: 'font-bold mb-3' }, 'Meus dados'),
      el('div', { class: 'flex flex-col gap-3' },
        el('div', {}, el('label', { class: 'label' }, 'Nome'), nome),
        el('div', {}, el('label', { class: 'label' }, 'Telefone'), tel),
        el('div', { class: 'grid grid-cols-3 gap-2' },
          el('div', { class: 'col-span-2' }, el('label', { class: 'label' }, 'Cidade'), cidade),
          el('div', {}, el('label', { class: 'label' }, 'UF'), estado),
        ),
        saveBtn,
      ),
    ),

    // Alterar senha
    el('div', { class: 'card p-4' },
      el('h2', { class: 'font-bold mb-3' }, 'Senha'),
      el('div', { class: 'flex flex-col gap-3' },
        newPwd, confirmPwd, pwdBtn,
      ),
    ),

    // Whisper (só para master)
    isMaster() && el('div', { class: 'card p-4' },
      el('h2', { class: 'font-bold' }, 'Transcrição de áudio'),
      el('p', { class: 'text-xs text-fg-muted mb-3 mt-1' },
        'Para transcrever áudios automaticamente nas observações, configure sua chave da OpenAI Whisper. ',
        'A chave fica salva apenas neste dispositivo (localStorage).'
      ),
      el('label', { class: 'label' }, 'OpenAI API Key'),
      apiKey,
      el('div', { class: 'flex gap-2 mt-2' }, saveKey, removeKey),
      el('p', { class: 'text-[10px] text-fg-subtle mt-2' },
        'Pegue sua chave em platform.openai.com/api-keys (modelo whisper-1). Custo ~US$ 0,006/min.'
      ),
    ),

    // Logout
    el('button', {
      class: 'btn btn-ghost text-danger w-full',
      onclick: async () => {
        const ok = await confirmModal({ title: 'Sair?', message: 'Confirmar logout?', confirmLabel: 'Sair' });
        if (ok) await signOut();
      }
    }, icon('logout', 16), 'Sair da conta'),

    el('p', { class: 'text-center text-xs text-fg-subtle' },
      `Membro desde ${fmt.date(p.created_at)}`
    ),

    // Link para "Sobre"
    el('button', {
      class: 'flex items-center justify-center gap-2 text-xs text-fg-muted hover:text-rottas-500 transition py-2',
      onclick: () => navigate('/sobre')
    },
      el('span', { class: 'font-mono font-bold' }, 'v' + APP_VERSION),
      el('span', {}, '·'),
      el('span', {}, 'Sobre o app e histórico de versões'),
      icon('chevronRight', 12),
    ),
  );

  app.appendChild(shell(content, { title: 'Perfil', back: true, hideBottomNav: true }));
}
