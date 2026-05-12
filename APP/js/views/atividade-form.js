// Formulário unificado de atividade - discriminado por tipo
import { el, icon, toast, loadingBtn, fmt } from '../ui.js';
import { shell } from './shell.js';
import { state, supabase } from '../supabase.js';
import { field, creatableSelect, addImobiliaria, addLocalVisita, photoPicker, locationField, termometroField } from '../components/form-fields.js';
import { uploadPhotos } from '../storage.js';
import { navigate } from '../router.js';
import { TIPO_ATIVIDADE } from '../config.js';
import { audioField } from '../components/audio-field.js';
import { isGestor } from '../auth.js';

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
      // Atendimento: se o agendamento tinha "imobiliaria" preenchida, foi a partir do
      // local da visita. Pré-preenche local_visita também
      local_visita:   agendamento.tipo === 'atendimento' ? agendamento.imobiliaria : null,
      observacoes:    agendamento.observacoes,
    };
  }

  // ===== MODO RESTRITO: Gerente editando proposta - só Reserva =====
  // Gerente só pode editar o campo Reserva da própria Proposta
  if (id && initial && tipo === 'proposta' && !isGestor() && initial.gerente_id === state.user.id) {
    return reservaOnlyForm(app, initial);
  }
  // Gerente tentando editar outras atividades - bloqueia
  if (id && !isGestor() && initial?.gerente_id === state.user.id && tipo !== 'proposta') {
    toast('Apenas Gestores podem editar esta atividade', 'error', 5000);
    navigate(`/atividade/${id}`, true);
    return;
  }

  const form = el('form', { class: 'flex flex-col gap-4' });

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

    // Motivo da visita - quando "Treinamento", abre campos extras (item 3)
    const motivoSel = creatableSelect({
      name: 'motivo_visita', items: state.motivosVisita, value: initial?.motivo_visita, required: true,
    });

    // === Campos extras de treinamento ===
    const localTreinamentoSel = creatableSelect({
      name: 'local_treinamento', items: state.locaisVisita, value: initial?.local_treinamento,
      allowAdd: true, onAdd: addLocalVisita,
    });
    const qtdPessoasInput = el('input', {
      class: 'input', type: 'number', name: 'qtd_pessoas', min: 1, max: 999,
      placeholder: 'Ex: 12', value: initial?.qtd_pessoas || '',
    });
    // Multi-select de imobiliárias participantes
    const initialImobsExtras = Array.isArray(initial?.imobiliarias_participantes)
      ? initial.imobiliarias_participantes : [];
    const imobsCheck = {};
    state.imobiliarias.forEach(im => { imobsCheck[im.nome] = initialImobsExtras.includes(im.nome); });
    const imobsMulti = el('div', { class: 'card p-2 max-h-48 overflow-y-auto flex flex-col gap-1' },
      ...(state.imobiliarias.length === 0
        ? [el('span', { class: 'text-sm text-fg-muted' }, 'Nenhuma imobiliária cadastrada.')]
        : state.imobiliarias.map(im => {
          const cb = el('input', { type: 'checkbox', checked: imobsCheck[im.nome] });
          cb.addEventListener('change', () => { imobsCheck[im.nome] = cb.checked; });
          return el('label', { class: 'flex items-center gap-2 p-1.5 rounded hover:bg-bg-elev cursor-pointer text-sm' },
            cb, el('span', {}, im.nome));
        }))
    );

    const treinamentoBox = el('div', {
      class: 'flex flex-col gap-3 hidden',
      style: { padding: '12px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: '10px' },
    },
      el('div', { class: 'text-xs font-bold uppercase tracking-wider text-warning' }, '🎓 Detalhes do treinamento'),
      field('Local do treinamento', localTreinamentoSel, { help: 'Onde o treinamento aconteceu' }),
      field('Quantidade de pessoas', qtdPessoasInput),
      field('Imobiliárias participantes', imobsMulti, { help: 'Marque todas as imobiliárias que enviaram corretores' }),
    );

    // Reage a mudança no motivo - se virar Treinamento, abre o box
    function checkTreinamentoMode() {
      const v = (motivoSel.value || '').trim().toLowerCase();
      treinamentoBox.classList.toggle('hidden', v !== 'treinamento');
    }
    motivoSel.addEventListener('change', checkTreinamentoMode);
    setTimeout(checkTreinamentoMode, 50);

    form.append(
      locationFieldEl ? field('Localização', locationFieldEl, { required: true }) :
        el('div', { class: 'card p-3 text-xs text-fg-muted' }, '📍 Editando: localização não pode ser alterada.'),
      field('Imobiliária', creatableSelect({
        name: 'imobiliaria', items: state.imobiliarias, value: initial?.imobiliaria,
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
      const motivo = (motivoSel.value || '').trim().toLowerCase();
      if (motivo !== 'treinamento') return {};
      return {
        local_treinamento: localTreinamentoSel.value || null,
        qtd_pessoas: qtdPessoasInput.value ? parseInt(qtdPessoasInput.value, 10) : null,
        imobiliarias_participantes: state.imobiliarias
          .filter(im => imobsCheck[im.nome])
          .map(im => im.nome),
      };
    };
  }

  // ===== ATENDIMENTO - ordem: Localização, Local visita, Imobiliária, Corretor, Empreendimento, Cliente, Termômetro, Obs =====
  if (tipo === 'atendimento') {
    if (!id) locationFieldEl = locationField();

    form.append(
      locationFieldEl ? field('Localização', locationFieldEl, { required: true }) :
        el('div', { class: 'card p-3 text-xs text-fg-muted' }, '📍 Editando: localização não pode ser alterada.'),
      field('Local da visita', creatableSelect({
        name: 'local_visita', items: state.locaisVisita, value: initial?.local_visita,
        required: true, allowAdd: true, onAdd: addLocalVisita,
      }), { required: true, help: 'Você pode adicionar um novo local se não estiver na lista' }),
      field('Imobiliária', creatableSelect({
        name: 'imobiliaria', items: state.imobiliarias, value: initial?.imobiliaria,
        required: true, allowAdd: true, onAdd: addImobiliaria,
      }), { required: true }),
      field('Corretor', el('input', { class: 'input', name: 'corretor', required: true, value: initial?.corretor || '' }), { required: true }),
      field('Empreendimento', creatableSelect({
        name: 'produto', items: state.empreendimentos, value: initial?.produto, required: true,
      }), { required: true }),
      field('Cliente', el('input', { class: 'input', name: 'cliente', required: true, value: initial?.cliente || '' }), { required: true }),
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

    form.append(
      field('Cliente', el('input', { class: 'input', name: 'cliente', required: true, value: initial?.cliente || '' }), { required: true }),
      field('Imobiliária', creatableSelect({
        name: 'imobiliaria', items: state.imobiliarias, value: initial?.imobiliaria,
        required: true, allowAdd: true, onAdd: addImobiliaria,
      }), { required: true }),
      field('Corretor', el('input', { class: 'input', name: 'corretor', required: true, value: initial?.corretor || '' }), { required: true }),
      field('Empreendimento', creatableSelect({
        name: 'empreendimento', items: state.empreendimentos, value: initial?.empreendimento, required: true,
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

  // ===== ÓRULO / DWV (mesma estrutura, motivos vêm de tabela diferente) =====
  if (tipo === 'orulo' || tipo === 'dwv') {
    const motivosList = tipo === 'dwv' ? state.motivosDwv : state.motivosOrulo;
    const labelPlataforma = tipo === 'dwv' ? 'DWV' : 'Órulo';
    form.append(
      field('Imobiliária', creatableSelect({
        name: 'imobiliaria', items: state.imobiliarias, value: initial?.imobiliaria,
        required: true, allowAdd: true, onAdd: addImobiliaria,
      }), { required: true }),
      field('Corretor', el('input', { class: 'input', name: 'corretor', required: true, value: initial?.corretor || '' }), { required: true }),
      field('Empreendimento', creatableSelect({
        name: 'empreendimento', items: state.empreendimentos, value: initial?.empreendimento, required: true,
      }), { required: true }),
      field(`Motivo do contato (${labelPlataforma})`, creatableSelect({
        name: 'motivo_contato', items: motivosList, value: initial?.motivo_contato, required: true,
      }), { required: true }),
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
    }

    try {
      // ===== Validações + payload por tipo =====
      if (tipo === 'checkin') {
        const coords = locationFieldEl?.getCoords?.();
        if (!id) {
          if (!coords) throw new Error('Capture a localização antes de salvar');
          payload.latitude = coords.latitude;
          payload.longitude = coords.longitude;
        }
        payload.imobiliaria = (fd.get('imobiliaria') || '').toString().trim();
        payload.motivo_visita = (fd.get('motivo_visita') || '').toString().trim();
        if (!payload.imobiliaria) throw new Error('Imobiliária é obrigatória');
        if (!payload.motivo_visita) throw new Error('Motivo da visita é obrigatório');
        // Campos extras de treinamento (quando motivo = "Treinamento")
        const trei = form._treinamentoData ? form._treinamentoData() : {};
        if (trei.local_treinamento !== undefined) payload.local_treinamento = trei.local_treinamento;
        if (trei.qtd_pessoas !== undefined) payload.qtd_pessoas = trei.qtd_pessoas;
        if (trei.imobiliarias_participantes !== undefined) payload.imobiliarias_participantes = trei.imobiliarias_participantes;
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
            supabase.from('agendamentos').update({
              status: 'realizado', atividade_id: inserted.id, realizado_em: new Date().toISOString()
            }).eq('id', agendamento.id).then(() => {});
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
          if (!coords) throw new Error('Capture a localização antes de salvar');
          payload.latitude = coords.latitude;
          payload.longitude = coords.longitude;
        }
        payload.local_visita = (fd.get('local_visita')||'').toString().trim();
        payload.produto = (fd.get('produto')||'').toString().trim();
        payload.imobiliaria = (fd.get('imobiliaria')||'').toString().trim();
        payload.corretor = (fd.get('corretor')||'').toString().trim();
        payload.cliente = (fd.get('cliente')||'').toString().trim();
        payload.termometro = (fd.get('termometro')||'').toString().trim();
        for (const k of ['local_visita','produto','imobiliaria','corretor','cliente','termometro']) {
          if (!payload[k]) throw new Error(`Campo obrigatório: ${k}`);
        }
        loadingBtn(submitBtn, true);
      }

      if (tipo === 'proposta') {
        payload.imobiliaria = (fd.get('imobiliaria')||'').toString().trim();
        payload.corretor = (fd.get('corretor')||'').toString().trim();
        payload.cliente = (fd.get('cliente')||'').toString().trim();
        payload.empreendimento = (fd.get('empreendimento')||'').toString().trim();
        payload.unidade = (fd.get('unidade')||'').toString().trim();
        payload.valor = parseCurrency(fd.get('valor'));
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
        payload.imobiliaria = (fd.get('imobiliaria')||'').toString().trim();
        payload.corretor = (fd.get('corretor')||'').toString().trim();
        payload.empreendimento = (fd.get('empreendimento')||'').toString().trim();
        payload.motivo_contato = (fd.get('motivo_contato')||'').toString().trim();
        for (const k of ['imobiliaria','corretor','empreendimento','motivo_contato']) {
          if (!payload[k]) throw new Error(`Campo obrigatório: ${k}`);
        }
        loadingBtn(submitBtn, true);
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

      clearTimeout(safetyTimeout);
      // Linkage bidirecional com agendamento (se veio de lá)
      if (agendamento && !id && data[0]?.id) {
        supabase.from('agendamentos').update({
          status: 'realizado',
          atividade_id: data[0].id,
          realizado_em: new Date().toISOString(),
        }).eq('id', agendamento.id).then(() => {});
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
