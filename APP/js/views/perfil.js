// Perfil do usuário: ver/editar dados, alterar senha, configurar Whisper, logout
import { el, icon, toast, loadingBtn, fmt, modal, confirmModal } from '../ui.js';
import { shell } from './shell.js';
import { state, supabase } from '../supabase.js';
import { signOut, setPassword, isMaster } from '../auth.js';
import { ESTADOS_BR, APP_VERSION, ROLES } from '../config.js';
import { navigate } from '../router.js';
import { phoneInput } from '../components/form-fields.js';
import { audioField } from '../components/audio-field.js';
import { FIELD_LABELS } from '../activity-actions.js';

export async function perfilView(_params, app) {
  const p = state.profile;
  if (!p) return;

  const nome = el('input', { class: 'input', value: p.nome });
  const tel = phoneInput({ value: p.telefone || '' });
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

  // ── Sugestões de melhoria ────────────────────────────────────────────────
  // Todos enviam e veem as suas; o Master vê todas (consulta de insights).
  const isM = isMaster();
  const CATEGORIAS = ['Geral', 'Visitas', 'Atividades', 'Relatórios', 'Agenda', 'Usabilidade', 'Bug / erro', 'Outro'];
  const STATUS = [
    { v: 'nova', label: '🆕 Nova' },
    { v: 'andamento', label: '⏳ Em andamento' },
    { v: 'concluida', label: '✅ Concluída' },
    { v: 'nao_acatada', label: '🚫 Não acatada' },
  ];
  const STATUS_LABEL = Object.fromEntries(STATUS.map(s => [s.v, s.label]));

  const sugTxt = el('textarea', { class: 'input', rows: 3, placeholder: 'Escreva sua sugestão de melhoria para o app...' });
  const sugDitar = audioField({ targetTextarea: sugTxt });
  const sugCat = el('select', { class: 'select' },
    el('option', { value: '' }, 'Categoria (opcional)'),
    ...CATEGORIAS.map(c => el('option', { value: c }, c)),
  );
  const sugBtn = el('button', { class: 'btn btn-primary w-full' }, icon('plus', 16), 'Enviar sugestão');
  const minhasWrap = el('div', { class: 'flex flex-col gap-2 mt-3' });
  const todasWrap = isM ? el('div', { class: 'flex flex-col gap-2' }) : null;

  function sugCard(s, showAuthor) {
    const meta = [fmt.date(s.created_at)];
    if (s.categoria) meta.push(s.categoria);
    // Master altera o status; os demais só veem o selo
    let statusEl;
    if (isM) {
      const sel = el('select', {
        class: 'select ml-auto',
        style: { width: 'auto', height: 'auto', padding: '3px 24px 3px 8px', fontSize: '12px' },
      }, ...STATUS.map(o => el('option', { value: o.v, selected: (s.status || 'nova') === o.v }, o.label)));
      sel.addEventListener('change', async () => {
        const prev = s.status || 'nova';
        const { data, error } = await supabase.from('sugestoes').update({ status: sel.value }).eq('id', s.id).select();
        if (error || !data || !data.length) { sel.value = prev; return toast(error?.message || 'Sem permissão para alterar.', 'error'); }
        s.status = sel.value;
        toast('Status atualizado', 'success');
      });
      statusEl = sel;
    } else {
      statusEl = el('span', { class: 'ml-auto' }, STATUS_LABEL[s.status] || '🆕 Nova');
    }
    return el('div', { class: 'card p-3 flex flex-col gap-1.5' },
      el('div', { class: 'flex items-start gap-2' },
        el('p', { class: 'text-sm flex-1 whitespace-pre-wrap' }, s.texto),
        isM ? el('button', {
          class: 'p-1 rounded hover:bg-bg-elev transition flex-shrink-0', title: 'Excluir sugestão',
          onclick: async () => {
            const ok = await confirmModal({ title: 'Excluir sugestão?', message: 'Esta ação não pode ser desfeita.', confirmLabel: 'Excluir', danger: true });
            if (!ok) return;
            const { data, error } = await supabase.from('sugestoes').delete().eq('id', s.id).select();
            if (error) return toast(error.message, 'error', 6000);
            if (!data || !data.length) return toast('Sem permissão para excluir.', 'error');
            toast('Sugestão excluída', 'success');
            loadMinhas(); loadTodas();
          },
        }, icon('trash', 15, 'text-danger')) : null,
      ),
      el('div', { class: 'flex items-center gap-2 flex-wrap text-xs text-fg-subtle' },
        showAuthor ? el('span', { class: 'font-semibold text-fg-muted' }, '👤 ' + (s.user_nome || 'Anônimo')) : null,
        showAuthor && s.user_role ? el('span', { class: 'chip chip-blue' }, ROLES[s.user_role]?.label || s.user_role) : null,
        el('span', {}, '📅 ' + meta.join(' · ')),
        statusEl,
      ),
    );
  }

  async function loadMinhas() {
    const { data, error } = await supabase.from('sugestoes').select('*').eq('user_id', p.id).order('created_at', { ascending: false }).limit(50);
    minhasWrap.innerHTML = '';
    if (error) { minhasWrap.appendChild(el('div', { class: 'text-sm text-danger' }, 'Erro ao carregar: ' + error.message)); return; }
    if (!data || !data.length) { minhasWrap.appendChild(el('div', { class: 'text-sm text-fg-muted' }, 'Você ainda não enviou sugestões.')); return; }
    minhasWrap.appendChild(el('p', { class: 'text-xs font-bold text-fg-muted uppercase' }, 'Minhas sugestões'));
    data.forEach(s => minhasWrap.appendChild(sugCard(s, false)));
  }
  async function loadTodas() {
    if (!isM) return;
    const { data, error } = await supabase.from('sugestoes').select('*').order('created_at', { ascending: false }).limit(500);
    todasWrap.innerHTML = '';
    if (error) { todasWrap.appendChild(el('div', { class: 'text-sm text-danger' }, 'Erro ao carregar: ' + error.message)); return; }
    if (!data || !data.length) { todasWrap.appendChild(el('div', { class: 'text-sm text-fg-muted' }, 'Nenhuma sugestão enviada ainda.')); return; }
    todasWrap.appendChild(el('p', { class: 'text-xs text-fg-muted' }, `${data.length} sugestão(ões) no total`));
    data.forEach(s => todasWrap.appendChild(sugCard(s, true)));
  }

  sugBtn.addEventListener('click', async () => {
    const texto = sugTxt.value.trim();
    if (!texto) return toast('Escreva sua sugestão', 'error');
    loadingBtn(sugBtn, true);
    try {
      const { error } = await supabase.from('sugestoes').insert({
        texto, categoria: sugCat.value || null,
        user_id: p.id, user_nome: p.nome, user_email: p.email, user_role: p.role,
      });
      if (error) throw error;
      sugTxt.value = ''; sugCat.value = '';
      toast('Sugestão enviada! Obrigado 🙏', 'success');
      await loadMinhas(); await loadTodas();
    } catch (e) { toast(e.message, 'error', 6000); }
    finally { loadingBtn(sugBtn, false); }
  });

  // ── Histórico de edições e exclusões (só Master — central de auditoria) ───
  const histWrap = isM ? el('div', { class: 'flex flex-col gap-2' }) : null;
  const fvHist = (k, v) => (v == null || v === '') ? '—' : (k === 'valor' ? fmt.currency(v) : Array.isArray(v) ? (v.join(', ') || '—') : String(v));
  function histCard(h) {
    const isExcl = h.tipo_evento === 'exclusao';
    const dados = h.dados || {};
    const changes = [];
    if (!isExcl && dados.depois) {
      for (const k of Object.keys(dados.depois)) {
        if (!FIELD_LABELS[k]) continue;
        changes.push(el('div', { class: 'text-xs' },
          el('span', { class: 'font-semibold' }, FIELD_LABELS[k] + ': '),
          el('span', { class: 'text-fg-muted line-through' }, fvHist(k, dados.antes?.[k])),
          el('span', { class: 'mx-1' }, '→'),
          el('span', {}, fvHist(k, dados.depois[k])),
        ));
      }
    }
    return el('div', { class: 'card p-3 flex flex-col gap-1' },
      el('button', {
        class: 'flex items-center gap-2 text-sm font-medium text-left w-full',
        onclick: () => h.atividade_id && navigate(`/atividade/${h.atividade_id}`),
      },
        el('span', {}, isExcl ? '🗑️' : '✏️'),
        el('span', { class: 'flex-1 truncate' }, h.resumo || 'Atividade'),
        el('span', { class: 'text-xs text-fg-subtle flex-shrink-0' }, fmt.date(h.em)),
      ),
      el('div', { class: 'text-xs text-fg-muted' },
        'por ' + (h.por_nome || '?') +
        (h.aprovado_por_nome && h.aprovado_por_nome !== h.por_nome ? ` · aprovado por ${h.aprovado_por_nome}` : '')),
      isExcl && dados.motivo ? el('div', { class: 'text-xs italic text-fg-muted' }, '"' + dados.motivo + '"') : null,
      changes.length ? el('div', { class: 'flex flex-col gap-0.5 mt-0.5' }, ...changes) : null,
    );
  }
  async function loadHistorico() {
    if (!isM) return;
    const { data, error } = await supabase.from('atividades_historico').select('*').order('em', { ascending: false }).limit(300);
    histWrap.innerHTML = '';
    if (error) { histWrap.appendChild(el('div', { class: 'text-sm text-danger' }, 'Erro: ' + error.message)); return; }
    if (!data || !data.length) { histWrap.appendChild(el('div', { class: 'text-sm text-fg-muted' }, 'Nenhuma edição ou exclusão registrada ainda.')); return; }
    histWrap.appendChild(el('p', { class: 'text-xs text-fg-muted' }, `${data.length} registro(s)`));
    data.forEach(h => histWrap.appendChild(histCard(h)));
  }

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
            ROLES[p.role]?.label || p.role || 'Usuário'),
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

    // Sugestões de melhoria (todos enviam e veem as suas)
    el('div', { class: 'card p-4' },
      el('h2', { class: 'font-bold' }, '💡 Sugestões de melhoria'),
      el('p', { class: 'text-xs text-fg-muted mb-3 mt-1' },
        'Tem uma ideia para melhorar o app? Mande pra cá — toda sugestão é registrada e analisada.'),
      el('div', { class: 'flex flex-col gap-2' }, sugTxt, sugDitar, sugCat, sugBtn),
      minhasWrap,
    ),

    // Todas as sugestões (só Master — consulta de insights)
    isM && el('div', { class: 'card p-4' },
      el('h2', { class: 'font-bold' }, '📋 Todas as sugestões (insights)'),
      el('p', { class: 'text-xs text-fg-muted mb-3 mt-1' },
        'Tudo que a equipe sugeriu, mais recente primeiro.'),
      todasWrap,
    ),

    // Histórico de edições e exclusões (só Master — auditoria)
    isM && el('div', { class: 'card p-4' },
      el('h2', { class: 'font-bold' }, '🗂️ Histórico de edições e exclusões'),
      el('p', { class: 'text-xs text-fg-muted mb-3 mt-1' },
        'Auditoria de tudo que foi editado ou excluído nas atividades. Toque num item para abrir a atividade.'),
      histWrap,
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

  // Carrega as sugestões e o histórico depois de montar a tela
  loadMinhas();
  loadTodas();
  loadHistorico();
}
