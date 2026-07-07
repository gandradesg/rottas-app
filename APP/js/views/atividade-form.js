// Formulário unificado de atividade - discriminado por tipo
import { el, icon, toast, loadingBtn, fmt, confirmModal } from '../ui.js';
import { shell } from './shell.js';
import { state, supabase, getScopedImobiliarias, getScopedEmpreendimentos } from '../supabase.js';
import { field, creatableSelect, addImobiliaria, addLocalVisita, addMotivoVisita, addMotivoOrulo, photoPicker, locationField, termometroField, corretorField, clienteField, gerenteImobField, ensureCorretorCadastro } from '../components/form-fields.js';
import { uploadPhotos } from '../storage.js';
import { navigate } from '../router.js';
import { TIPO_ATIVIDADE } from '../config.js';
import { audioField } from '../components/audio-field.js';
import { isGestor, isAdmin } from '../auth.js';
import { buildDiff, auditarEdicaoDireta } from '../activity-actions.js';

// Marca o agendamento como realizado. Se for parte de um GRUPO (vários gerentes
// presentes), realiza TODAS as agendas do grupo de uma vez via RPC (SECURITY
// DEFINER) — assim a linha dos colegas também vira "realizado / ver atividade"
// e ninguém precisa registrar o mesmo check-in de novo.
function marcarAgendamentoRealizado(agendamento, atividadeId) {
  if (agendamento.grupo_id) {
    supabase.rpc('realizar_agendamento_grupo', {
      p_grupo_id: agendamento.grupo_id, p_atividade_id: atividadeId,
    }).then(() => {}).catch(() => {});
  } else {
    supabase.from('agendamentos').update({
      status: 'realizado', atividade_id: atividadeId, realizado_em: new Date().toISOString(),
    }).eq('id', agendamento.id).then(() => {});
  }
}

const TITLES = {
  checkin:     { novo: 'Registro de novo Check-in',     editar: 'Editar Check-in' },
  atendimento: { novo: 'Registro de novo Atendimento',  editar: 'Editar Atendimento' },
  proposta:    { novo: 'Registro de nova Proposta',     editar: 'Editar Proposta' },
  orulo:       { novo: 'Registro de novo Órulo',        editar: 'Editar Órulo' },
};

// Formulário restrito apenas para informar a Reserva (gerente)
function reservaOnlyForm(app, atividade) {
  const reservaInput = el('input', {
    class: 'input', name: 'reserva',
    placeholder: 'Código/número da reserva no CV',
    value: atividade.reserva || '',
    required: true,
  });

  const submitBtn = el('button', { class: 'btn btn-primary btn-lg w-full', type: 'submit' }, 'Salvar reserva');
  const cancelBtn = el('button', { class: 'btn btn-ghost w-full', type: 'button',
    onclick: () => history.back() }, 'Cancelar');

  // Resumo da proposta (read-only)
  const summary = el('div', { class: 'card p-4 flex flex-col gap-2 text-sm' },
    el('h3', { class: 'text-xs font-bold uppercase tracking-wider text-fg-subtle mb-1' }, 'Proposta'),
    el('div', {}, el('span', { class: 'text-fg-muted' }, 'Cliente: '), el('strong', {}, atividade.cliente)),
    el('div', {}, el('span', { class: 'text-fg-muted' }, 'Imobiliária: '), atividade.imobiliaria),
    el('div', {}, el('span', { class: 'text-fg-muted' }, 'Corretor: '), atividade.corretor),
    el('div', {}, el('span', { class: 'text-fg-muted' }, 'Empreendimento: '), atividade.empreendimento),
    el('div', {}, el('span', { class: 'text-fg-muted' }, 'Unidade: '), atividade.unidade),
    el('div', {}, el('span', { class: 'text-fg-muted' }, 'Valor: '), fmt.currency(atividade.valor)),
  );

  const form = el('form', { class: 'flex flex-col gap-4' },
    summary,
    el('div', { class: 'card p-3 text-xs gradient-rottas-soft' },
      '✏️ Você só pode editar o campo de Reserva. Se precisar alterar outras informações, peça a um Gestor.'
    ),
    field('Reserva (CV)', reservaInput, { required: true,
      help: 'Preencha quando a reserva for efetivada no sistema CV' }),
    submitBtn, cancelBtn,
  );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const reserva = reservaInput.value.trim();
    if (!reserva) { toast('Informe o código da reserva', 'error'); return; }
    loadingBtn(submitBtn, true);
    try {
      const { data, error } = await supabase
        .from('atividades')
        .update({
          reserva,
          reserva_data: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', atividade.id)
        .select();
      if (error) throw error;
      if (!data || !data.length) throw new Error('Sem permissão (RLS rejeitou)');
      toast('✓ Reserva salva!', 'success', 2500);
      navigate(`/atividade/${atividade.id}`, true);
    } catch (err) {
      console.error('[reserva] erro:', err);
      toast(err.message || 'Erro ao salvar', 'error', 6000);
      loadingBtn(submitBtn, false);
    }
  });

  app.appendChild(shell(form, { title: 'Informar reserva', back: true, hideBottomNav: true }));
}

function formatCurrency(num) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL'
  }).format(num);
}
function parseCurrency(str) {
  if (typeof str === 'number') return str;
  if (!str) return NaN;
  // "R$ 850.000,00" → 850000
  const clean = String(str).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  return parseFloat(clean);
}

export async function atividadeFormView(params, app) {
  // Modo "vindo da agenda": params.agendamentoId está setado
  const agendamentoId = params.agendamentoId || null;
  let agendamento = null;
  if (agendamentoId) {
    const { data } = await supabase.from('agendamentos').select('*').eq('id', agendamentoId).single();
    if (!data) { toast('Agendamento não encontrado', 'error'); navigate('/agenda', true); return; }
    if (data.status === 'realizado' && data.atividade_id) {
      // Já foi realizado - vai direto pra atividade
      navigate(`/atividade/${data.atividade_id}`, true);
      return;
    }
    agendamento = data;
  }

  const tipo = params.tipo || agendamento?.tipo || null;
  const id = params.id;
  const t = TIPO_ATIVIDADE[tipo];
  if (!t) { navigate('/registrar', true); return; }

  let initial = null;
  if (id) {
    const { data } = await supabase.from('atividades').select('*').eq('id', id).single();
    if (!data) { toast('Atividade não encontrada', 'error'); navigate('/historico', true); return; }
    initial = data;
  }
  // Se vier de agendamento, pré-preenche com os dados dele
  if (agendamento && !initial) {
    initial = {
      imobiliaria:    agendamento.imobiliaria,
      empreendimento: agendamento.empreendimento,
      produto:        agendamento.empreendimento, // atendimento usa "produto"
      cliente:        agendamento.cliente,
      corretor:       agendamento.corretor,
      motivo_visita:  agendamento.motivo_visita,
      // Local da visita e Imobiliária agora são campos separados no agendamento
      local_visita:   agendamento.local_visita || null,
      observacoes:    agendamento.observacoes,
    };
  }

  // Proposta criada A PARTIR de um atendimento (vínculo + pré-preenchimento)
  let atendimentoLinkId = null;
  if (tipo === 'proposta' && !id) {
    const fromAt = localStorage.getItem('proposta-from-atendimento');
    if (fromAt) {
      localStorage.removeItem('proposta-from-atendimento');
      const { data: at } = await supabase.from('atividades').select('*').eq('id', fromAt).single();
      if (at) {
        atendimentoLinkId = at.id;
        initial = {
          ...(initial || {}),
          cliente: at.cliente, cliente_id: at.cliente_id,
          imobiliaria: at.imobiliaria,
          corretor: at.corretor, corretor_id: at.corretor_id,
          gerente_imob: at.gerente_imob, gerente_imob_id: at.gerente_imob_id,
          empreendimento: at.produto || at.empreendimento,
        };
      }
    }
  }

  // Gerente editando a própria atividade: pode editar TODOS os campos, mas o
  // resultado vai para aprovação do gestor (os dados só mudam após aprovado).
  const gerenteEditandoPropria = !!id && !isAdmin() && initial?.gerente_id === state.user.id;

  const form = el('form', { class: 'flex flex-col gap-4' });

  // Aviso de que a edição precisará de aprovação
  if (gerenteEditandoPropria) {
    form.appendChild(el('div', {
      class: 'card p-3 border-2 flex items-start gap-2 text-sm',
      style: { borderColor: '#F59E0B', background: 'rgba(245,158,11,0.08)' }
    },
      el('span', { class: 'text-xl' }, '✏️'),
      el('div', { class: 'flex-1' },
        el('div', { class: 'font-bold text-warning' }, 'Edição com aprovação'),
        el('div', { class: 'text-xs text-fg-muted mt-0.5' },
          'As alterações serão enviadas ao seu gestor. A atividade só muda depois que ele aprovar.'),
      ),
    ));
  }

  // Banner quando vindo da agenda
  if (agendamento) {
    form.appendChild(el('div', {
      class: 'card p-3 border-2 flex items-start gap-2 text-sm',
      style: { borderColor: '#F26B22', background: 'rgba(242,107,34,0.08)' }
    },
      el('span', { class: 'text-xl' }, '📅'),
      el('div', { class: 'flex-1' },
        el('div', { class: 'font-bold text-rottas-600' }, 'Realizando agendamento'),
        el('div', { class: 'text-xs text-fg-muted mt-0.5' },
          'Esta atividade será vinculada ao agendamento de ',
          new Date(agendamento.data_prevista).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }),
          '. Os campos abaixo já vieram preenchidos.',
        ),
      ),
    ));
  }

  let photoPickerEl, locationFieldEl, audioFieldEl;
  const obsEl = el('textarea', { class: 'textarea', name: 'observacoes', placeholder: 'Observações livres...' }, initial?.observacoes || '');

  // ===== CHECK-IN =====
  if (tipo === 'checkin') {
    if (!id) locationFieldEl = locationField();
    photoPickerEl = photoPicker({});

    // Motivo da visita - lista aberta: o gerente pode DIGITAR um novo motivo ao
    // criar (fica salvo na lista pra mapearmos as necessidades). Só pode escolher/
    // adicionar no PRIMEIRO cadastro; ao editar, o gerente não altera (fica travado);
    // admin pode trocar. Quando "Treinamento", abre campos extras.
    const motivoLocked = !!id && !isAdmin();
    let motivoSel;
    if (motivoLocked) {
      motivoSel = el('div', {},
        el('input', { type: 'hidden', name: 'motivo_visita', value: initial?.motivo_visita || '' }),
        el('div', { class: 'select flex items-center justify-between', style: { opacity: '0.7' } },
          el('span', {}, initial?.motivo_visita || '—'),
          el('span', { class: 'text-[10px] text-fg-subtle' }, '🔒 não editável'),
        ),
      );
    } else {
      motivoSel = creatableSelect({
        name: 'motivo_visita', items: state.motivosVisita, value: initial?.motivo_visita, required: true,
        allowAdd: !id, onAdd: addMotivoVisita,
      });
    }

    // === Campos extras de treinamento ===
    const localTreinamentoSel = creatableSelect({
      name: 'local_treinamento', items: state.locaisVisita, value: initial?.local_treinamento,
      allowAdd: true, onAdd: addLocalVisita,
    });
    const qtdPessoasInput = el('input', {
      class: 'input', type: 'number', name: 'qtd_pessoas', min: 1, max: 999,
      placeholder: 'Ex: 12', value: initial?.qtd_pessoas || '',
    });
    // Multi-select de imobiliárias participantes COM busca
    const initialImobsExtras = Array.isArray(initial?.imobiliarias_participantes)
      ? initial.imobiliarias_participantes : [];
    const imobsCheck = {};
    // SCOPED: só mostra imobiliárias relevantes pra hierarquia do usuário
    const scopedImobs = getScopedImobiliarias();
    scopedImobs.forEach(im => { imobsCheck[im.nome] = initialImobsExtras.includes(im.nome); });

    const imobsSearchInput = el('input', {
      type: 'text',
      class: 'input',
      placeholder: '🔍 Buscar imobiliária...',
      autocomplete: 'off',
    });
    const imobsListEl = el('div', { class: 'max-h-48 overflow-y-auto flex flex-col gap-1 mt-2' });
    function renderImobsList() {
      const f = (imobsSearchInput.value || '').trim().toLowerCase();
      imobsListEl.innerHTML = '';
      const filtered = scopedImobs.filter(im =>
        !f || im.nome.toLowerCase().includes(f)
      );
      if (scopedImobs.length === 0) {
        imobsListEl.appendChild(el('span', { class: 'text-sm text-fg-muted px-2 py-1' }, 'Nenhuma imobiliária cadastrada.'));
        return;
      }
      if (filtered.length === 0) {
        imobsListEl.appendChild(el('span', { class: 'text-sm text-fg-muted px-2 py-1' }, 'Nenhuma encontrada.'));
        return;
      }
      // Marcadas primeiro (já selecionadas), depois alfabético
      filtered.sort((a,b) => {
        const aChk = imobsCheck[a.nome] ? 0 : 1;
        const bChk = imobsCheck[b.nome] ? 0 : 1;
        return aChk - bChk || a.nome.localeCompare(b.nome);
      });
      filtered.forEach(im => {
        const cb = el('input', { type: 'checkbox', checked: !!imobsCheck[im.nome] });
        cb.addEventListener('change', () => { imobsCheck[im.nome] = cb.checked; });
        imobsListEl.appendChild(el('label', {
          class: 'flex items-center gap-2 p-1.5 rounded hover:bg-bg-elev cursor-pointer text-sm'
        }, cb, el('span', {},
          im.nome,
          (im.cidade || im.estado) && el('span', { class: 'text-xs text-fg-muted ml-2' },
            '· ' + [im.cidade, im.estado].filter(Boolean).join(' · '))
        )));
      });
    }
    imobsSearchInput.addEventListener('input', renderImobsList);
    const imobsMulti = el('div', { class: 'card p-2' }, imobsSearchInput, imobsListEl);
    renderImobsList();

    const treinamentoBox = el('div', {
      class: 'flex flex-col gap-3 hidden',
      style: { padding: '12px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: '10px' },
    },
      el('div', { class: 'text-xs font-bold uppercase tracking-wider text-warning' }, '🎓 Detalhes do treinamento'),
      field('Local do treinamento', localTreinamentoSel, { required: true, help: 'Onde o treinamento aconteceu' }),
      field('Quantidade de pessoas', qtdPessoasInput, { required: true }),
      field('Imobiliárias participantes', imobsMulti, { required: true, help: 'Marque todas as imobiliárias que enviaram corretores' }),
    );

    // Reage a mudança no motivo - se virar Treinamento, abre o box
    // motivoSel é um wrapper do creatableSelect; o valor real está no hidden input
    function getMotivoValue() {
      const hidden = motivoSel.querySelector('input[type="hidden"]');
      return (hidden?.value || '').trim().toLowerCase();
    }
    function checkTreinamentoMode() {
      treinamentoBox.classList.toggle('hidden', getMotivoValue() !== 'treinamento');
    }
    motivoSel.addEventListener('change', checkTreinamentoMode);
    setTimeout(checkTreinamentoMode, 50);

    form.append(
      locationFieldEl ? field('Localização', locationFieldEl, { help: 'Capturada automaticamente. Se o dispositivo não permitir, dá para registrar sem ela.' }) :
        el('div', { class: 'card p-3 text-xs text-fg-muted' }, '📍 Editando: localização não pode ser alterada.'),
      field('Imobiliária', creatableSelect({
        name: 'imobiliaria', items: getScopedImobiliarias(), value: initial?.imobiliaria,
        required: true, allowAdd: true, onAdd: addImobiliaria,
      }), { required: true }),
      field('Motivo da visita', motivoSel, { required: true }),
      treinamentoBox,
      field('Observações', obsEl),
      audioFieldEl = audioField({ targetTextarea: obsEl }),
      field('Fotos (até 3)', photoPickerEl, { help: 'Opcional. Máximo 3 fotos.' }),
    );

    // Expõe pra o submit handler ler os valores extras
    form._treinamentoData = () => {
      if (getMotivoValue() !== 'treinamento') return {};
      // localTreinamentoSel também é creatableSelect → ler do hidden input dele
      const ltHidden = localTreinamentoSel.querySelector('input[type="hidden"]');
      return {
        local_treinamento: ltHidden?.value || null,
        qtd_pessoas: qtdPessoasInput.value ? parseInt(qtdPessoasInput.value, 10) : null,
        imobiliarias_participantes: scopedImobs
          .filter(im => imobsCheck[im.nome])
          .map(im => im.nome),
      };
    };
  }

  // ===== ATENDIMENTO - ordem: Localização, Local visita, Imobiliária, Corretor, Empreendimento, Cliente, Termômetro, Obs =====
  if (tipo === 'atendimento') {
    if (!id) locationFieldEl = locationField();
    let atImobWrap;

    form.append(
      locationFieldEl ? field('Localização', locationFieldEl, { help: 'Capturada automaticamente. Se o dispositivo não permitir, dá para registrar sem ela.' }) :
        el('div', { class: 'card p-3 text-xs text-fg-muted' }, '📍 Editando: localização não pode ser alterada.'),
      field('Local da visita', creatableSelect({
        name: 'local_visita', items: state.locaisVisita, value: initial?.local_visita,
        required: true, allowAdd: true, onAdd: addLocalVisita,
      }), { required: true, help: 'Você pode adicionar um novo local se não estiver na lista' }),
      (atImobWrap = creatableSelect({
        name: 'imobiliaria', items: getScopedImobiliarias(), value: initial?.imobiliaria,
        required: true, allowAdd: true, onAdd: addImobiliaria,
      })) && field('Imobiliária', atImobWrap, { required: true }),
      field('Gerente da imobiliária', gerenteImobField({ imobWrap: atImobWrap, value: initial?.gerente_imob, valueId: initial?.gerente_imob_id, required: false }), { help: 'Opcional. Caso tenha, você pode cadastrar o gerente ou dono da imobiliária.' }),
      field('Corretor', corretorField({ imobWrap: atImobWrap, value: initial?.corretor, valueId: initial?.corretor_id }), { required: true, help: 'Vinculado à imobiliária. Pode cadastrar um novo.' }),
      field('Empreendimento', creatableSelect({
        name: 'produto', items: getScopedEmpreendimentos(), value: initial?.produto, required: true,
      }), { required: true }),
      field('Cliente', clienteField({ value: initial?.cliente, valueId: initial?.cliente_id }), { required: true, help: 'Abre o cadastro de cliente (lead).' }),
      field('Termômetro', termometroField({ value: initial?.termometro }), { required: true }),
      field('Observações', obsEl),
      audioFieldEl = audioField({ targetTextarea: obsEl }),
    );
  }

  // ===== PROPOSTA - ordem: Cliente, Imobiliária, Corretor, Empreendimento, Unidade, Valor, Obs, [Reserva] =====
  if (tipo === 'proposta') {
    const showReserva = !!id;

    // Input de valor com máscara R$
    const valorInput = el('input', {
      class: 'input', type: 'text', name: 'valor', inputmode: 'numeric',
      required: true, placeholder: 'R$ 0,00', autocomplete: 'off',
      value: initial?.valor ? formatCurrency(parseFloat(initial.valor)) : '',
    });
    valorInput.addEventListener('input', () => {
      const raw = valorInput.value.replace(/\D/g, '');
      if (!raw) { valorInput.value = ''; return; }
      const num = parseInt(raw, 10) / 100;
      valorInput.value = formatCurrency(num);
    });

    let prImobWrap;
    form.append(
      field('Cliente', clienteField({ value: initial?.cliente, valueId: initial?.cliente_id }), { required: true, help: 'Abre o cadastro de cliente (lead).' }),
      (prImobWrap = creatableSelect({
        name: 'imobiliaria', items: getScopedImobiliarias(), value: initial?.imobiliaria,
        required: true, allowAdd: true, onAdd: addImobiliaria,
      })) && field('Imobiliária', prImobWrap, { required: true }),
      field('Gerente da imobiliária', gerenteImobField({ imobWrap: prImobWrap, value: initial?.gerente_imob, valueId: initial?.gerente_imob_id, required: false }), { help: 'Opcional. Caso tenha, você pode cadastrar o gerente ou dono da imobiliária.' }),
      field('Corretor', corretorField({ imobWrap: prImobWrap, value: initial?.corretor, valueId: initial?.corretor_id }), { required: true, help: 'Vinculado à imobiliária. Pode cadastrar um novo.' }),
      field('Empreendimento', creatableSelect({
        name: 'empreendimento', items: getScopedEmpreendimentos(), value: initial?.empreendimento, required: true,
      }), { required: true }),
      field('Unidade', el('input', { class: 'input', name: 'unidade', required: true, value: initial?.unidade || '' }), { required: true }),
      field('Valor', valorInput, { required: true, help: 'Digite só os números - formata automaticamente' }),
      field('Observações', obsEl),
      audioFieldEl = audioField({ targetTextarea: obsEl }),
      showReserva
        ? field('Reserva (CV)', el('input', { class: 'input', name: 'reserva', placeholder: 'Código/número da reserva no CV', value: initial?.reserva || '' }),
            { help: 'Preencha após efetivar a reserva no sistema CV' })
        : el('div', { class: 'card p-3 text-xs text-fg-muted gradient-rottas-soft' },
            '💡 Após salvar, volte na atividade pelo histórico e edite para informar a reserva quando ela for efetivada no CV.'),
    );
  }

  // ===== ÓRULO/DWV (unificado - mesma plataforma conceitualmente, motivos únicos) =====
  if (tipo === 'orulo' || tipo === 'dwv') {
    // Select de plataforma (Órulo PR ou DWV SC) - texto livre salvo em motivo_contato
    // ou num campo dedicado. Vamos usar `plataforma` numa coluna nova OU como tag
    // dentro de observações. Pra simplicidade, salva como prefixo do motivo_contato.
    const plataformaSel = el('select', { class: 'select', name: 'plataforma', required: true },
      el('option', { value: '' }, 'Selecione a plataforma...'),
      el('option', { value: 'Órulo', selected: (initial?.plataforma || '') === 'Órulo' }, 'Órulo (PR)'),
      el('option', { value: 'DWV', selected: (initial?.plataforma || '') === 'DWV' }, 'DWV (SC)'),
    );
    // Motivo do contato - lista aberta (mesma regra do motivo da visita):
    // digitável/adicionável só no primeiro cadastro; travado ao editar (gerente).
    const motivoContatoLocked = !!id && !isAdmin();
    const motivoContatoControl = motivoContatoLocked
      ? el('div', {},
          el('input', { type: 'hidden', name: 'motivo_contato', value: initial?.motivo_contato || '' }),
          el('div', { class: 'select flex items-center justify-between', style: { opacity: '0.7' } },
            el('span', {}, initial?.motivo_contato || '—'),
            el('span', { class: 'text-[10px] text-fg-subtle' }, '🔒 não editável')))
      : creatableSelect({
          name: 'motivo_contato', items: state.motivosOrulo, value: initial?.motivo_contato, required: true,
          allowAdd: !id, onAdd: addMotivoOrulo,
        });

    let orImobWrap;
    form.append(
      field('Plataforma', plataformaSel, { required: true, help: 'Por qual plataforma o contato veio' }),
      (orImobWrap = creatableSelect({
        name: 'imobiliaria', items: getScopedImobiliarias(), value: initial?.imobiliaria,
        required: true, allowAdd: true, onAdd: addImobiliaria,
      })) && field('Imobiliária', orImobWrap, { required: true }),
      field('Gerente da imobiliária', gerenteImobField({ imobWrap: orImobWrap, value: initial?.gerente_imob, valueId: initial?.gerente_imob_id, required: false }), { help: 'Opcional. Caso tenha, você pode cadastrar o gerente ou dono da imobiliária.' }),
      field('Corretor', corretorField({ imobWrap: orImobWrap, value: initial?.corretor, valueId: initial?.corretor_id }), { required: true, help: 'Vinculado à imobiliária. Pode cadastrar um novo.' }),
      field('Empreendimento', creatableSelect({
        name: 'empreendimento', items: getScopedEmpreendimentos(), value: initial?.empreendimento, required: true,
      }), { required: true }),
      field('Motivo do contato', motivoContatoControl, { required: true }),
      field('Observações', obsEl),
      audioFieldEl = audioField({ targetTextarea: obsEl }),
    );
  }

  const submitBtn = el('button', {
    class: 'btn btn-primary btn-lg w-full mt-2', type: 'submit'
  }, id ? 'Salvar alterações' : 'Registrar atividade');

  const cancelBtn = el('button', {
    class: 'btn btn-ghost w-full', type: 'button',
    onclick: () => history.back()
  }, 'Cancelar');

  form.append(submitBtn, cancelBtn);

  // Submit handler com safety timeout
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);

    // Timeout de seguranca aumentado para 60s (Android com rede 4G/3G demora mais)
    const safetyTimeout = setTimeout(() => {
      loadingBtn(submitBtn, false);
      toast('Operação demorou muito - verifique sua conexão e tente novamente', 'error', 6000);
    }, 60000);

    const payload = {
      gerente_id: state.user.id,
      tipo,
      observacoes: (fd.get('observacoes') || '').toString().trim() || null,
      updated_at: new Date().toISOString(),
    };
    // Se veio da agenda, vincula ao agendamento
    if (agendamento && !id) {
      payload.agendamento_id = agendamento.id;
      // Agenda em grupo (vários gerentes presentes): credita todos os presentes
      // nesta ÚNICA atividade — conta no contador de cada um sem inflar o total.
      if (Array.isArray(agendamento.participantes) && agendamento.participantes.length > 1) {
        payload.participantes = agendamento.participantes;
      }
    }

    try {
      // ===== Validações + payload por tipo =====
      if (tipo === 'checkin') {
        const coords = locationFieldEl?.getCoords?.();
        if (!id) {
          if (coords) {
            payload.latitude = coords.latitude;
            payload.longitude = coords.longitude;
          } else {
            // Localização NÃO é obrigatória: alguns PCs não conseguem ativar o GPS.
            // Continua tentando puxar automática, mas permite registrar sem ela.
            const ok = await confirmModal({
              title: 'Sem localização',
              message: 'Não foi possível capturar a localização (GPS bloqueado ou indisponível neste dispositivo). Deseja registrar mesmo assim, sem localização?',
              confirmLabel: 'Registrar sem localização',
              cancelLabel: 'Voltar',
            });
            if (!ok) { clearTimeout(safetyTimeout); loadingBtn(submitBtn, false); return; }
          }
        }
        payload.imobiliaria = (fd.get('imobiliaria') || '').toString().trim();
        payload.motivo_visita = (fd.get('motivo_visita') || '').toString().trim();
        if (!payload.imobiliaria) throw new Error('Imobiliária é obrigatória');
        if (!payload.motivo_visita) throw new Error('Motivo da visita é obrigatório');
        // Campos extras de treinamento (quando motivo = "Treinamento")
        const trei = form._treinamentoData ? form._treinamentoData() : {};
        if (trei.local_treinamento !== undefined) {
          // Validação: quando é treinamento, os 3 campos extras são obrigatórios
          if (!trei.local_treinamento) throw new Error('Treinamento: informe o Local do treinamento');
          if (!trei.qtd_pessoas) throw new Error('Treinamento: informe a Quantidade de pessoas');
          if (!Array.isArray(trei.imobiliarias_participantes) || trei.imobiliarias_participantes.length === 0) {
            throw new Error('Treinamento: marque pelo menos uma Imobiliária participante');
          }
          payload.local_treinamento = trei.local_treinamento;
          payload.qtd_pessoas = trei.qtd_pessoas;
          payload.imobiliarias_participantes = trei.imobiliarias_participantes;
        }
        const files = photoPickerEl?.getFiles?.() || [];
        loadingBtn(submitBtn, true);

        if (!id) {
          // INSERT otimista: sem fotos, navega, sobe fotos em bg
          console.log('[atividade] inserindo check-in...');
          const { data: inserted, error } = await supabase
            .from('atividades').insert({ ...payload, fotos: [] }).select().single();
          if (error) throw error;
          if (!inserted) throw new Error('Falha ao inserir (RLS ou rede)');
          clearTimeout(safetyTimeout);
          // Linkage com agendamento (em bg)
          if (agendamento) {
            marcarAgendamentoRealizado(agendamento, inserted.id);
            toast('✓ Check-in registrado e agenda atualizada!', 'success', 3500);
            navigate('/agenda', true);
          } else {
            toast('✓ Check-in registrado!', 'success', 2500);
            navigate('/', true);
          }
          if (files.length) {
            uploadPhotos(files).then(urls =>
              supabase.from('atividades').update({ fotos: urls }).eq('id', inserted.id)
            ).then(() => toast('✓ Fotos enviadas', 'success', 2500))
             .catch(e => toast('Erro ao subir fotos: ' + (e.message||''), 'error', 5000));
          }
          return;
        } else {
          // UPDATE: upload sync se houver
          if (files.length) payload.fotos = await uploadPhotos(files);
          else if (initial?.fotos) payload.fotos = initial.fotos;
        }
      }

      if (tipo === 'atendimento') {
        const coords = locationFieldEl?.getCoords?.();
        if (!id) {
          if (coords) {
            payload.latitude = coords.latitude;
            payload.longitude = coords.longitude;
          } else {
            // Localização NÃO é obrigatória: alguns PCs não conseguem ativar o GPS.
            // Continua tentando puxar automática, mas permite registrar sem ela.
            const ok = await confirmModal({
              title: 'Sem localização',
              message: 'Não foi possível capturar a localização (GPS bloqueado ou indisponível neste dispositivo). Deseja registrar mesmo assim, sem localização?',
              confirmLabel: 'Registrar sem localização',
              cancelLabel: 'Voltar',
            });
            if (!ok) { clearTimeout(safetyTimeout); loadingBtn(submitBtn, false); return; }
          }
        }
        payload.local_visita = (fd.get('local_visita')||'').toString().trim();
        payload.produto = (fd.get('produto')||'').toString().trim();
        payload.imobiliaria = (fd.get('imobiliaria')||'').toString().trim();
        payload.corretor = (fd.get('corretor')||'').toString().trim();
        payload.corretor_id = (fd.get('corretor_id')||'').toString().trim() || null;
        payload.gerente_imob = (fd.get('gerente_imob')||'').toString().trim() || null;
        payload.gerente_imob_id = (fd.get('gerente_imob_id')||'').toString().trim() || null;
        payload.cliente = (fd.get('cliente')||'').toString().trim();
        payload.cliente_id = (fd.get('cliente_id')||'').toString().trim() || null;
        payload.termometro = (fd.get('termometro')||'').toString().trim();
        for (const k of ['local_visita','produto','imobiliaria','corretor','cliente','termometro']) {
          if (!payload[k]) throw new Error(`Campo obrigatório: ${k}`);
        }
        loadingBtn(submitBtn, true);
      }

      if (tipo === 'proposta') {
        payload.imobiliaria = (fd.get('imobiliaria')||'').toString().trim();
        payload.gerente_imob = (fd.get('gerente_imob')||'').toString().trim() || null;
        payload.gerente_imob_id = (fd.get('gerente_imob_id')||'').toString().trim() || null;
        payload.corretor = (fd.get('corretor')||'').toString().trim();
        payload.corretor_id = (fd.get('corretor_id')||'').toString().trim() || null;
        payload.cliente = (fd.get('cliente')||'').toString().trim();
        payload.cliente_id = (fd.get('cliente_id')||'').toString().trim() || null;
        payload.empreendimento = (fd.get('empreendimento')||'').toString().trim();
        payload.unidade = (fd.get('unidade')||'').toString().trim();
        payload.valor = parseCurrency(fd.get('valor'));
        if (atendimentoLinkId) payload.atendimento_id = atendimentoLinkId;
        for (const k of ['imobiliaria','corretor','cliente','empreendimento','unidade']) {
          if (!payload[k]) throw new Error(`Campo obrigatório: ${k}`);
        }
        if (!payload.valor || isNaN(payload.valor)) throw new Error('Valor é obrigatório');
        const reserva = (fd.get('reserva')||'').toString().trim();
        if (reserva) {
          payload.reserva = reserva;
          payload.reserva_data = new Date().toISOString();
        }
        loadingBtn(submitBtn, true);
      }

      if (tipo === 'orulo' || tipo === 'dwv') {
        payload.tipo = 'orulo'; // canonicalizar (DWV é apenas label visual da plataforma)
        const plataforma = (fd.get('plataforma')||'').toString().trim();
        if (!plataforma) throw new Error('Selecione a plataforma (Órulo ou DWV)');
        payload.plataforma = plataforma;
        payload.imobiliaria = (fd.get('imobiliaria')||'').toString().trim();
        payload.gerente_imob = (fd.get('gerente_imob')||'').toString().trim() || null;
        payload.gerente_imob_id = (fd.get('gerente_imob_id')||'').toString().trim() || null;
        payload.corretor = (fd.get('corretor')||'').toString().trim();
        payload.corretor_id = (fd.get('corretor_id')||'').toString().trim() || null;
        payload.empreendimento = (fd.get('empreendimento')||'').toString().trim();
        payload.motivo_contato = (fd.get('motivo_contato')||'').toString().trim();
        for (const k of ['imobiliaria','corretor','empreendimento','motivo_contato']) {
          if (!payload[k]) throw new Error(`Campo obrigatório: ${k}`);
        }
        loadingBtn(submitBtn, true);
      }

      // ===== Garante o cadastro do corretor (quando veio por nome livre) =====
      // Ex.: corretor digitado no agendamento e trazido ao "realizar" fica sem
      // corretor_id; aqui criamos o cadastro vinculado à imobiliária pra ele
      // aparecer na lista de corretores da imobiliária.
      if (['atendimento', 'proposta', 'orulo'].includes(tipo)
          && payload.corretor && !payload.corretor_id && payload.imobiliaria) {
        payload.corretor_id = await ensureCorretorCadastro(payload.corretor, payload.imobiliaria);
      }

      // ===== AVISO: corretor/cliente sem telefone/e-mail cadastrado =====
      // (telefone/e-mail não são obrigatórios; ao executar um agendamento os
      // contatos vêm automáticos, então avisamos se o cadastro está incompleto.)
      if (['atendimento', 'proposta', 'orulo'].includes(tipo)) {
        const faltando = [];
        if (payload.corretor) {
          let tem = false;
          if (payload.corretor_id) {
            const c = (state.corretores || []).find(x => x.id === payload.corretor_id);
            tem = !!(c && (c.telefone || c.email));
          }
          if (!tem) faltando.push('corretor');
        }
        if (payload.cliente) {
          let tem = false;
          if (payload.cliente_id) {
            const { data: tc } = await supabase.rpc('cliente_tem_contato', { p_id: payload.cliente_id });
            tem = !!tc;
          }
          if (!tem) faltando.push('cliente');
        }
        if (faltando.length) {
          const ok = await confirmModal({
            title: 'Contato incompleto',
            message: `Você não cadastrou telefone/e-mail de: ${faltando.join(' e ')}. Você pode incluir agora (clicando no nome do ${faltando.join('/')}) ou continuar mesmo assim.`,
            confirmLabel: 'Continuar mesmo assim',
            cancelLabel: 'Incluir agora',
          });
          if (!ok) { clearTimeout(safetyTimeout); loadingBtn(submitBtn, false); return; }
        }
      }

      // ===== GERENTE/SUPERVISOR editando a própria atividade =====
      // Campos de BAIXO IMPACTO (não afetam o funil/valores) são aplicados DIRETO,
      // sem aprovação: reserva, termômetro e observações. Os demais campos vão
      // para aprovação do gestor (a atividade só muda quando ele aprovar).
      if (gerenteEditandoPropria) {
        const { depois } = buildDiff(initial, payload);
        const LIVRES = ['reserva', 'termometro', 'observacoes'];
        const diretas = {};
        for (const k of LIVRES) {
          if (k in depois) { diretas[k] = depois[k]; delete depois[k]; }
        }
        let aplicouDireto = false;
        if (Object.keys(diretas).length) {
          const patch = { ...diretas, updated_at: new Date().toISOString() };
          if ('reserva' in diretas && payload.reserva_data) patch.reserva_data = payload.reserva_data;
          const { data: dd, error: dErr } = await supabase.from('atividades').update(patch).eq('id', id).select();
          if (dErr) throw dErr;
          if (!dd || !dd.length) throw new Error('Sem permissão para salvar (RLS rejeitou)');
          aplicouDireto = true;
          const antesDiretas = {};
          for (const k of Object.keys(diretas)) antesDiretas[k] = initial[k] ?? null;
          auditarEdicaoDireta({ ...initial, id }, antesDiretas, diretas).catch(() => {});
        }
        const temOutros = Object.keys(depois).length > 0;
        if (temOutros) {
          const { data, error } = await supabase.from('atividades').update({
            solicita_edicao: true,
            edicao_solicitada_em: new Date().toISOString(),
            edicao_solicitada_por: state.user.id,
            edicao_pendente: depois,
          }).eq('id', id).select();
          if (error) throw error;
          if (!data || !data.length) throw new Error('Sem permissão para solicitar edição (RLS rejeitou)');
        }
        clearTimeout(safetyTimeout);
        if (aplicouDireto && temOutros) toast('✓ Alterações salvas. As demais foram enviadas para aprovação.', 'success', 4500);
        else if (aplicouDireto) toast('✓ Alterações salvas!', 'success', 2500);
        else if (temOutros) toast('✓ Edição enviada para aprovação do gestor', 'success', 3500);
        else { toast('Nenhuma alteração para enviar', 'info'); loadingBtn(submitBtn, false); return; }
        navigate(`/atividade/${id}`, true);
        return;
      }

      // ===== INSERT/UPDATE com detecção de RLS-rejection =====
      console.log('[atividade] enviando:', tipo, id ? 'UPDATE' : 'INSERT');
      const { data, error } = id
        ? await supabase.from('atividades').update(payload).eq('id', id).select()
        : await supabase.from('atividades').insert(payload).select();
      if (error) throw error;
      if (!data || !data.length) {
        throw new Error('Sem permissão para ' + (id ? 'editar' : 'criar') + ' (RLS rejeitou)');
      }
      // Edição direta (gestor/master): registra no histórico de auditoria
      if (id) {
        const { antes, depois } = buildDiff(initial, payload);
        auditarEdicaoDireta({ ...initial, ...payload, id }, antes, depois).catch(() => {});
      }

      clearTimeout(safetyTimeout);
      // Linkage bidirecional com agendamento (se veio de lá)
      if (agendamento && !id && data[0]?.id) {
        marcarAgendamentoRealizado(agendamento, data[0].id);
        toast('✓ Atividade registrada e agenda atualizada!', 'success', 3500);
        navigate('/agenda', true);
      } else {
        toast(id ? '✓ Atualizado' : '✓ Registrado', 'success', 2500);
        navigate('/', true);
      }
    } catch (err) {
      clearTimeout(safetyTimeout);
      console.error('[atividade] erro:', err);
      toast(err.message || JSON.stringify(err) || 'Erro ao salvar', 'error', 6000);
      loadingBtn(submitBtn, false);
    }
  });

  app.appendChild(shell(form, {
    title: id ? TITLES[tipo].editar : TITLES[tipo].novo,
    subtitle: id ? null : new Date().toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }),
    back: true, hideBottomNav: true,
  }));
}
