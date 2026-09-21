// Perfil do usuário: ver/editar dados, alterar senha, configurar Whisper, logout
import { el, icon, toast, loadingBtn, fmt, modal, confirmModal, secaoRecolhivel } from '../ui.js';
import { shell } from './shell.js';
import { state, supabase, q as runQuery } from '../supabase.js';
import { signOut, setPassword, isMaster } from '../auth.js';
import { ESTADOS_BR, APP_VERSION, ROLES } from '../config.js';
import { navigate } from '../router.js';
import { phoneInput, cidadeEstadoField } from '../components/form-fields.js';
import { audioField } from '../components/audio-field.js';
import { FIELD_LABELS } from '../activity-actions.js';

export async function perfilView(_params, app) {
  const p = state.profile;
  if (!p) return;

  const nome = el('input', { class: 'input', value: p.nome });
  const tel = phoneInput({ value: p.telefone || '' });
  const _cef = cidadeEstadoField({ cidade: p.cidade, estado: p.estado });
  const cidade = _cef.cidadeInput;   // UF preenche automática ao escolher a cidade
  const estado = _cef.estadoSelect;
  const cidadeDL = _cef.datalist;

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
    // Registro de EXCLUSÃO: a atividade não existe mais, então não navega
    // (evita "item órfão" que abre uma tela vazia). Edição continua abrindo.
    const podeAbrir = !isExcl && !!h.atividade_id;
    const removerBtn = el('button', {
      class: 'flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-fg-subtle hover:text-danger hover:bg-danger/10 transition',
      title: 'Remover do histórico',
      onclick: async (e) => {
        e.stopPropagation();
        const ok = await confirmModal({
          title: 'Remover do histórico?',
          message: `Isto apaga só o registro de auditoria "${h.resumo || 'Atividade'}". Não afeta nenhuma atividade. Continuar?`,
          confirmLabel: 'Remover',
          danger: true,
        });
        if (!ok) return;
        const { error } = await supabase.from('atividades_historico').delete().eq('id', h.id);
        if (error) { toast('Erro ao remover: ' + error.message, 'error', 6000); return; }
        toast('Registro removido', 'success');
        loadHistorico();
      },
    }, icon('trash', 15));
    return el('div', { class: 'card p-3 flex flex-col gap-1' },
      el('div', { class: 'flex items-center gap-2' },
        el('button', {
          class: 'flex items-center gap-2 text-sm font-medium text-left flex-1 min-w-0' + (podeAbrir ? '' : ' cursor-default'),
          onclick: () => podeAbrir && navigate(`/atividade/${h.atividade_id}`),
        },
          el('span', {}, isExcl ? '🗑️' : '✏️'),
          el('span', { class: 'flex-1 truncate' }, h.resumo || 'Atividade'),
          el('span', { class: 'text-xs text-fg-subtle flex-shrink-0' }, fmt.date(h.em)),
        ),
        removerBtn,
      ),
      el('div', { class: 'text-xs text-fg-muted' },
        'por ' + (h.por_nome || '?') +
        (h.aprovado_por_nome && h.aprovado_por_nome !== h.por_nome ? ` · aprovado por ${h.aprovado_por_nome}` : '')),
      isExcl && dados.motivo ? el('div', { class: 'text-xs italic text-fg-muted' }, '"' + dados.motivo + '"') : null,
      changes.length ? el('div', { class: 'flex flex-col gap-0.5 mt-0.5' }, ...changes) : null,
    );
  }
  // ── Logs de registro (diagnóstico) ────────────────────────────────────────
  const logsWrap = isM ? el('div', { class: 'flex flex-col gap-2' }) : null;
  const ETAPA_INFO = {
    inicio:      { txt: 'Início',       cor: 'text-fg-muted' },
    fotos:       { txt: 'Fotos',        cor: 'text-info' },
    gravacao:    { txt: 'Gravação',     cor: 'text-warning' },
    confirmacao: { txt: 'Confirmação',  cor: 'text-warning' },
    sucesso:     { txt: '✓ Sucesso',    cor: 'text-success' },
    falha:       { txt: '✕ Falha',      cor: 'text-danger' },
  };
  // Detalhe TÉCNICO completo de uma etapa (é aqui que se vê "o código por trás").
  function abrirDetalheLog(l) {
    const linha = (k, v) => v == null || v === '' ? null : el('div', { class: 'flex gap-2 py-1.5 border-b border-border text-xs' },
      el('span', { class: 'text-fg-muted flex-shrink-0', style: { minWidth: '42%' } }, k),
      el('span', { class: 'font-mono break-all' }, String(v)),
    );
    const bruto = JSON.stringify(l, null, 2);
    const btnCopiar = el('button', { class: 'btn btn-secondary' }, '📋 Copiar tudo');
    const btnFechar = el('button', { class: 'btn btn-primary' }, 'Fechar');
    const m = modal({
      title: '🔎 Detalhe técnico da etapa',
      size: 'md',
      content: el('div', { class: 'flex flex-col' },
        linha('Etapa', l.etapa),
        linha('Tipo de registro', l.tipo),
        linha('Deu certo?', l.ok === null || l.ok === undefined ? '—' : (l.ok ? 'sim' : 'NÃO')),
        linha('Tentativa', l.tentativa),
        linha('Duração', l.duracao_ms != null ? `${l.duracao_ms} ms` : null),
        linha('Quando', fmt.dateTime(l.criado_em)),
        linha('Usuário', l.user_nome),
        linha('Estava online?', l.online === null || l.online === undefined ? '—' : (l.online ? 'sim' : 'NÃO (sem internet)')),
        linha('Versão do app', l.app_version),
        linha('Aparelho', l.dispositivo),
        linha('Mensagem do erro', l.erro),
        linha('Código do erro', l.erro_codigo),
        linha('Detalhe do erro', l.erro_detalhe),
        linha('ID do registro (liga as etapas)', l.registro_id),
        linha('ID do log', l.id),
        el('div', { class: 'mt-3' },
          el('div', { class: 'text-xs text-fg-muted mb-1' }, 'Dados brutos (para enviar ao suporte):'),
          el('pre', {
            class: 'text-[10px] bg-bg-elev rounded-lg p-2 overflow-x-auto',
            style: { maxHeight: '11rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all' },
          }, bruto),
        ),
      ),
      footer: [btnCopiar, btnFechar],
    });
    btnFechar.addEventListener('click', () => m.close());
    btnCopiar.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(bruto); toast('Copiado', 'success', 2000); }
      catch (e) { toast('Não consegui copiar automaticamente — selecione o texto.', 'warning', 4000); }
    });
  }

  function logRow(l) {
    const info = ETAPA_INFO[l.etapa] || { txt: l.etapa || '?', cor: 'text-fg-muted' };
    const dur = l.duracao_ms != null ? `${(l.duracao_ms / 1000).toFixed(1)}s` : '';
    return el('div', {
      class: 'card p-2.5 flex flex-col gap-0.5 cursor-pointer hover:bg-bg-elev transition',
      title: 'Toque para ver o detalhe técnico',
      onclick: () => abrirDetalheLog(l),
    },
      el('div', { class: 'flex items-center gap-2 text-sm flex-wrap' },
        el('span', { class: 'font-semibold ' + info.cor }, info.txt),
        el('span', { class: 'text-fg-muted' }, l.tipo || '—'),
        l.tentativa ? el('span', { class: 'chip text-[10px]' }, `tentativa ${l.tentativa}`) : null,
        dur ? el('span', { class: 'text-xs text-fg-subtle' }, dur) : null,
        el('span', { class: 'text-xs text-fg-subtle ml-auto' }, fmt.dateTime(l.criado_em)),
      ),
      el('div', { class: 'text-xs text-fg-muted' },
        (l.user_nome || 'eu') + (l.online === false ? ' · 📵 sem internet' : '') + (l.app_version ? ` · v${l.app_version}` : '')),
      l.erro ? el('div', { class: 'text-xs text-danger break-words' },
        '⚠ ' + l.erro + (l.erro_codigo ? ` (código ${l.erro_codigo})` : '')) : null,
      el('div', { class: 'text-[10px] text-rottas-500' }, 'ver detalhe técnico →'),
    );
  }

  // Agrupa as etapas de UM registro e mostra a história dele em ordem, dizendo
  // onde parou. É assim que se enxerga "em que ponto travou".
  function grupoRow(grupo) {
    const etapas = grupo.slice().sort((a, b) => String(a.criado_em).localeCompare(String(b.criado_em)));
    const ultima = etapas[etapas.length - 1];
    const falhou = etapas.some(e => e.ok === false) || ultima.etapa === 'falha';
    const concluiu = etapas.some(e => e.etapa === 'sucesso');
    const totalMs = etapas.reduce((mx, e) => Math.max(mx, e.duracao_ms || 0), 0);
    const trilha = etapas.map(e => {
      const inf = ETAPA_INFO[e.etapa] || { txt: e.etapa, cor: '' };
      const marca = e.ok === false ? '✕' : (e.ok === true ? '✓' : '·');
      return `${marca} ${inf.txt.replace(/^[✓✕]\s*/, '')}`;
    }).join('  →  ');
    const status = concluiu ? { txt: '✓ Concluído', cls: 'text-success' }
      : falhou ? { txt: '✕ Parou aqui', cls: 'text-danger' }
      : { txt: '… Sem conclusão', cls: 'text-warning' };
    const corpo = el('div', { class: 'flex flex-col gap-1.5 mt-2 hidden' },
      ...etapas.map(e => logRow(e)));
    const cab = el('button', { class: 'w-full text-left flex flex-col gap-0.5' },
      el('div', { class: 'flex items-center gap-2 text-sm flex-wrap' },
        el('span', { class: 'font-semibold ' + status.cls }, status.txt),
        el('span', { class: 'text-fg-muted' }, ultima.tipo || '—'),
        el('span', { class: 'chip text-[10px]' }, `${etapas.length} etapa(s)`),
        totalMs ? el('span', { class: 'text-xs text-fg-subtle' }, `${(totalMs / 1000).toFixed(1)}s`) : null,
        el('span', { class: 'text-xs text-fg-subtle ml-auto' }, fmt.dateTime(ultima.criado_em)),
      ),
      el('div', { class: 'text-xs text-fg-muted' },
        (ultima.user_nome || 'eu') + (ultima.online === false ? ' · 📵 sem internet' : '')),
      el('div', { class: 'text-[11px] text-fg-subtle font-mono break-words' }, trilha),
      falhou && ultima.erro ? el('div', { class: 'text-xs text-danger break-words' },
        '⚠ ' + ultima.erro + (ultima.erro_codigo ? ` (código ${ultima.erro_codigo})` : '')) : null,
      el('div', { class: 'text-[10px] text-rottas-500' }, 'toque para ver as etapas →'),
    );
    cab.addEventListener('click', () => corpo.classList.toggle('hidden'));
    return el('div', { class: 'card p-3' }, cab, corpo);
  }
  async function loadLogs() {
    if (!isM) return;
    logsWrap.innerHTML = '';
    logsWrap.appendChild(el('div', { class: 'text-xs text-fg-muted' }, 'Carregando...'));
    const { data, error } = await runQuery(
      () => supabase.from('registro_logs').select('*').order('criado_em', { ascending: false }).limit(200),
      { ms: 7000, label: 'logs' },
    );
    logsWrap.innerHTML = '';
    // Barra de ações (atualizar + só falhas)
    let apenasFalhas = false;
    const btnAtualizar = el('button', { class: 'btn btn-secondary btn-sm', onclick: () => loadLogs() }, '↻ Atualizar');
    const btnFalhas = el('button', { class: 'btn btn-ghost btn-sm' }, 'Mostrar só as falhas');
    const lista = el('div', { class: 'flex flex-col gap-2 mt-2 max-h-[28rem] overflow-y-auto' });
    logsWrap.append(el('div', { class: 'flex gap-2 flex-wrap' }, btnAtualizar, btnFalhas), lista);
    if (error) {
      lista.appendChild(el('div', { class: 'text-sm text-danger' }, 'Não foi possível carregar os logs: ' + (error.message || '')));
      return;
    }
    const todos = data || [];
    function pintar() {
      lista.innerHTML = '';
      // Agrupa por registro: cada grupo é a HISTÓRIA de um registro (início →
      // fotos → gravação → confirmação). Etapas antigas (sem registro_id) ficam
      // cada uma no seu grupo, pra não sumir.
      const mapa = new Map();
      todos.forEach(l => {
        const chave = l.registro_id || ('solto:' + l.id);
        if (!mapa.has(chave)) mapa.set(chave, []);
        mapa.get(chave).push(l);
      });
      let grupos = [...mapa.values()];
      if (apenasFalhas) grupos = grupos.filter(g => g.some(l => l.ok === false || l.etapa === 'falha'));
      // mais recentes primeiro
      grupos.sort((a, b) => String(b[b.length - 1].criado_em).localeCompare(String(a[a.length - 1].criado_em)));
      if (!grupos.length) {
        lista.appendChild(el('div', { class: 'text-sm text-fg-muted' },
          apenasFalhas ? 'Nenhuma falha registrada. 🎉' : 'Nenhum log ainda. Assim que a equipe registrar algo, aparece aqui.'));
        return;
      }
      lista.appendChild(el('div', { class: 'text-xs text-fg-muted' },
        `${grupos.length} registro(s) · toque num para ver as etapas e o detalhe técnico`));
      grupos.forEach(g => lista.appendChild(grupoRow(g)));
    }
    btnFalhas.addEventListener('click', () => {
      apenasFalhas = !apenasFalhas;
      btnFalhas.textContent = apenasFalhas ? 'Mostrar todos' : 'Mostrar só as falhas';
      pintar();
    });
    pintar();
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

  // ── Seções recolhíveis ────────────────────────────────────────────────────
  // Todas começam FECHADAS (a tela fica limpa) e há um botão pra abrir/fechar
  // todas de uma vez.
  const secoes = [
    secaoRecolhivel({
      titulo: 'Meus dados',
      conteudo: el('div', { class: 'flex flex-col gap-3' },
        el('div', {}, el('label', { class: 'label' }, 'Nome'), nome),
        el('div', {}, el('label', { class: 'label' }, 'Telefone'), tel),
        el('div', { class: 'grid grid-cols-3 gap-2' },
          el('div', { class: 'col-span-2' }, el('label', { class: 'label' }, 'Cidade'), cidade, cidadeDL),
          el('div', {}, el('label', { class: 'label' }, 'UF'), estado),
        ),
        saveBtn,
      ),
    }),
    secaoRecolhivel({
      titulo: 'Senha',
      conteudo: el('div', { class: 'flex flex-col gap-3' }, newPwd, confirmPwd, pwdBtn),
    }),
    secaoRecolhivel({
      titulo: '💡 Sugestões de melhoria',
      descricao: 'Tem uma ideia para melhorar o app? Mande pra cá — toda sugestão é registrada e analisada.',
      conteudo: [
        el('div', { class: 'flex flex-col gap-2' }, sugTxt, sugDitar, sugCat, sugBtn),
        minhasWrap,
      ],
    }),
    isM && secaoRecolhivel({
      titulo: '📋 Todas as sugestões (insights)',
      descricao: 'Tudo que a equipe sugeriu, mais recente primeiro.',
      conteudo: todasWrap,
    }),
    isM && secaoRecolhivel({
      titulo: '🗂️ Histórico de edições e exclusões',
      descricao: 'Auditoria de tudo que foi editado ou excluído nas atividades. Toque num item para abrir a atividade.',
      conteudo: histWrap,
    }),
    isM && secaoRecolhivel({
      titulo: '🩺 Logs de registro (diagnóstico)',
      descricao: 'Cada etapa dos registros da equipe (início → fotos → gravação → confirmação) com o tempo que levou e o erro real. Serve para ver EM QUE PONTO um registro travou.',
      conteudo: logsWrap,
    }),
    isMaster() && secaoRecolhivel({
      titulo: 'Transcrição de áudio',
      descricao: 'Para transcrever áudios automaticamente nas observações, configure sua chave da OpenAI Whisper. A chave fica salva apenas neste dispositivo.',
      conteudo: [
        el('label', { class: 'label' }, 'OpenAI API Key'),
        apiKey,
        el('div', { class: 'flex gap-2 mt-2' }, saveKey, removeKey),
        el('p', { class: 'text-[10px] text-fg-subtle mt-2' },
          'Pegue sua chave em platform.openai.com/api-keys (modelo whisper-1). Custo ~US$ 0,006/min.'),
      ],
    }),
  ].filter(Boolean);

  let todasAbertas = false;
  const btnTodas = el('button', { class: 'btn btn-secondary btn-sm' }, 'Expandir todas');
  btnTodas.addEventListener('click', () => {
    todasAbertas = !todasAbertas;
    secoes.forEach(s => s.setAberta(todasAbertas));
    btnTodas.textContent = todasAbertas ? 'Recolher todas' : 'Expandir todas';
  });
  const barraSecoes = el('div', { class: 'flex items-center justify-between gap-2' },
    el('span', { class: 'text-xs text-fg-subtle' }, 'Toque num título para abrir'),
    btnTodas,
  );

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

    barraSecoes,
    ...secoes,

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
  loadLogs();
}
