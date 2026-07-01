// Detalhe de uma atividade (com edição se for da gerente, ou só leitura para master ver)
import { el, icon, fmt, toast, confirmModal, modal } from '../ui.js';
import { shell } from './shell.js';
import { state, supabase } from '../supabase.js';
import { isMaster, isGestor, isAdmin, can, canApproveLevel, roleLevel } from '../auth.js';
import { navigate } from '../router.js';
import { TIPO_ATIVIDADE, PROPOSTA_STATUS, NEXT_APPROVER, ROLES } from '../config.js';
import { gmapsLink } from '../geo.js';
import { aplicarEdicao, rejeitarEdicao, excluirAtividade, FIELD_LABELS } from '../activity-actions.js';

export async function atividadeDetailView(params, app) {
  const { data: a, error } = await supabase
    .from('atividades')
    .select('*, profiles!atividades_gerente_id_fkey(nome, email, telefone)')
    .eq('id', params.id)
    .single();
  if (error || !a) {
    toast('Atividade não encontrada', 'error');
    navigate('/historico', true);
    return;
  }

  const t = TIPO_ATIVIDADE[a.tipo];
  const isOwner = a.gerente_id === state.user.id;
  const userIsGestor = isGestor();
  const userIsAdmin = isAdmin();
  // Admin (gestor/master/superintendente/regional) edita direto.
  // Só gerente/supervisor edita com aprovação do gestor.
  const canFullEdit = userIsAdmin;
  const canRequestEdit = isOwner && !userIsAdmin && !a.solicita_edicao;
  const canApproveEdit = userIsAdmin && !isOwner && a.solicita_edicao;
  const canApproveDeletion = userIsGestor && a.solicita_exclusao;
  const canRequestDeletion = isOwner && !a.solicita_exclusao;
  const canHardDelete = userIsGestor;

  const rows = [];
  function addRow(label, value, extra) {
    if (value == null || value === '') return;
    rows.push(el('div', { class: 'flex flex-col py-2 border-b border-border last:border-0' },
      el('span', { class: 'text-xs uppercase tracking-wider text-fg-subtle font-semibold' }, label),
      el('span', { class: 'text-sm font-medium mt-0.5' }, value),
      extra,
    ));
  }

  switch (a.tipo) {
    case 'checkin':
      addRow('Imobiliária', a.imobiliaria);
      addRow('Motivo da visita', a.motivo_visita);
      if (a.latitude && a.longitude) {
        rows.push(locationMapRow(a.latitude, a.longitude));
      }
      break;
    case 'atendimento':
      addRow('Local da visita', a.local_visita);
      addRow('Produto', a.produto);
      addRow('Imobiliária', a.imobiliaria);
      addRow('Gerente da imobiliária', a.gerente_imob);
      addRow('Corretor', a.corretor);
      addRow('Cliente', a.cliente);
      if (a.termometro) addRow('Termômetro', a.termometro.charAt(0).toUpperCase() + a.termometro.slice(1));
      if (a.latitude && a.longitude) {
        rows.push(locationMapRow(a.latitude, a.longitude));
      }
      break;
    case 'proposta':
      addRow('Empreendimento', a.empreendimento);
      addRow('Unidade', a.unidade);
      addRow('Valor', fmt.currency(a.valor));
      if (a.reserva) {
        addRow('Reserva (CV)', a.reserva, el('span', { class: 'text-xs text-success mt-1' }, '✓ Reserva registrada em ' + fmt.dateTime(a.reserva_data)));
      } else {
        rows.push(el('div', { class: 'card p-3 mt-3 gradient-rottas-soft text-xs text-fg-muted' },
          '⏳ Sem reserva registrada. Use o botão "Informar reserva" abaixo quando ela for efetivada no CV (livre, sem aprovação).'
        ));
      }
      break;
    case 'orulo':
    case 'dwv':
      addRow('Imobiliária', a.imobiliaria);
      addRow('Gerente da imobiliária', a.gerente_imob);
      addRow('Corretor', a.corretor);
      addRow('Empreendimento', a.empreendimento);
      addRow('Motivo do contato', a.motivo_contato);
      break;
  }

  // ===== Detalhes extras de Check-in com Treinamento =====
  if (a.tipo === 'checkin' && (a.motivo_visita || '').toLowerCase() === 'treinamento') {
    if (a.local_treinamento) addRow('Local do treinamento', a.local_treinamento);
    if (a.qtd_pessoas) addRow('Quantidade de pessoas', a.qtd_pessoas + ' pessoas');
    if (Array.isArray(a.imobiliarias_participantes) && a.imobiliarias_participantes.length) {
      rows.push(el('div', { class: 'flex flex-col py-2 border-b border-border' },
        el('span', { class: 'text-xs uppercase tracking-wider text-fg-subtle font-semibold' }, 'Imobiliárias participantes'),
        el('div', { class: 'flex flex-wrap gap-1.5 mt-2' },
          ...a.imobiliarias_participantes.map(nome =>
            el('span', { class: 'chip chip-blue' }, nome)
          )
        ),
      ));
    }
  }

  if (a.observacoes) {
    rows.push(el('div', { class: 'flex flex-col py-2 border-b border-border' },
      el('span', { class: 'text-xs uppercase tracking-wider text-fg-subtle font-semibold' }, 'Observações'),
      el('p', { class: 'text-sm mt-1 whitespace-pre-wrap' }, a.observacoes),
    ));
  }

  // Fotos
  let fotosSection = null;
  if (a.fotos && a.fotos.length) {
    fotosSection = el('div', { class: 'card p-4' },
      el('h3', { class: 'text-xs font-bold uppercase text-fg-subtle tracking-wider mb-2' }, `Fotos (${a.fotos.length})`),
      el('div', { class: 'grid grid-cols-3 gap-2' },
        ...a.fotos.map(url => el('a', { href: url, target: '_blank' },
          el('img', { src: url, class: 'w-full aspect-square object-cover rounded-lg' })
        ))
      ),
    );
  }

  const headerActions = [];
  if (canFullEdit || canRequestEdit) {
    headerActions.push(el('button', {
      class: 'p-2 rounded-lg hover:bg-bg-elev transition',
      'aria-label': 'Editar',
      onclick: () => navigate(`/atividade/${a.id}/editar/${a.tipo}`)
    }, icon('edit', 18)));
  }

  // Número sequencial formatado
  const numLabel = a.numero_sequencial ? `#${a.numero_sequencial}` : '';
  const vendaLabel = a.numero_venda ? ` · Reserva #${a.numero_venda}` : '';

  // Header com gerente (visível para master)
  const header = el('div', { class: 'card p-4 flex items-center gap-3' },
    el('div', { class: `activity-icon activity-${a.tipo}` },
      icon(a.tipo==='checkin'?'mapPin':a.tipo==='atendimento'?'users':a.tipo==='proposta'?'fileText':'globe', 22)
    ),
    el('div', { class: 'flex-1' },
      el('div', { class: 'text-xs text-fg-subtle font-semibold uppercase tracking-wider flex items-center gap-2' },
        t.label,
        numLabel && el('span', { class: 'text-rottas-500 font-bold' }, numLabel + vendaLabel),
      ),
      el('div', { class: 'font-bold' }, fmt.dateTime(a.created_at)),
      isMaster() && a.profiles && el('div', { class: 'text-xs text-fg-muted mt-0.5' },
        'Por: ' + a.profiles.nome
      ),
    ),
  );

  // Banner de exclusão pendente
  const pendingBanner = a.solicita_exclusao ? el('div', {
    class: 'card p-3 border-2 flex items-start gap-2 text-sm',
    style: { borderColor: '#F59E0B', background: 'rgba(245,158,11,0.1)' }
  },
    el('span', { class: 'text-2xl' }, '⏳'),
    el('div', { class: 'flex-1' },
      el('div', { class: 'font-bold text-warning' }, 'Exclusão solicitada'),
      el('div', { class: 'text-xs text-fg-muted' }, 'Aguardando aprovação de um Gestor.'),
      el('div', { class: 'text-xs text-fg-subtle mt-0.5' }, fmt.relative(a.exclusao_solicitada_em)),
    ),
  ) : null;

  // ===== Banner de EDIÇÃO pendente (mostra o que foi proposto) =====
  const editBanner = a.solicita_edicao ? renderEdicaoPendenteBanner(a) : null;

  // ===== Vínculo proposta ↔ atendimento (item 2) =====
  const vinculoSection = el('div', { class: 'flex flex-col gap-3' });
  if (a.tipo === 'proposta' && a.atendimento_id) {
    const origemLabel = el('span', { class: 'text-sm font-medium' }, 'Gerada a partir de um atendimento — ver origem');
    vinculoSection.appendChild(el('button', {
      class: 'card p-3 w-full text-left flex items-center gap-2 hover:border-rottas-300 transition',
      onclick: () => navigate(`/atividade/${a.atendimento_id}`),
    }, el('span', {}, '🔗'), origemLabel));
    // Busca o número do atendimento de origem para exibir "atendimento #X"
    (async () => {
      const { data: src } = await supabase.from('atividades').select('numero_sequencial').eq('id', a.atendimento_id).single();
      if (src?.numero_sequencial) origemLabel.textContent = `Gerada a partir do atendimento #${src.numero_sequencial} — ver origem`;
    })();
  }
  if (a.tipo === 'atendimento') {
    if (isOwner || userIsGestor) {
      vinculoSection.appendChild(el('button', {
        class: 'btn btn-secondary',
        onclick: () => { localStorage.setItem('proposta-from-atendimento', a.id); navigate('/atividade/novo/proposta'); },
      }, icon('fileText', 16), 'Criar proposta vinculada a este atendimento'));
    }
    (async () => {
      const { data: props } = await supabase
        .from('atividades').select('id, empreendimento, unidade, reserva, created_at')
        .eq('atendimento_id', a.id).eq('cancelada', false).order('created_at', { ascending: false });
      if (props && props.length) {
        vinculoSection.appendChild(el('div', { class: 'card p-3' },
          el('div', { class: 'text-xs font-bold uppercase text-fg-subtle mb-2' }, `Propostas vinculadas (${props.length})`),
          ...props.map(pp => el('button', {
            class: 'w-full text-left text-sm py-1.5 flex items-center justify-between hover:text-rottas-600',
            onclick: () => navigate(`/atividade/${pp.id}`),
          },
            el('span', {}, `${pp.empreendimento || '-'} · Un. ${pp.unidade || '-'}`),
            el('span', { class: 'text-xs ' + (pp.reserva ? 'text-success' : 'text-fg-subtle') }, pp.reserva ? 'Reserva' : 'Proposta'),
          )),
        ));
      }
    })();
  }

  // ===== Reserva (item 4): campo livre, salva direto SEM aprovação. =====
  // Ao ter reserva, a proposta vira "Reservada".
  const reservaSection = el('div', { class: 'flex flex-col gap-3' });
  if (a.tipo === 'proposta') {
    if (a.reserva) {
      reservaSection.appendChild(el('div', { class: 'card p-3 border-2', style: { borderColor: '#10B981', background: 'rgba(16,185,129,0.08)' } },
        el('div', { class: 'font-bold text-success text-sm' }, '✓ Reservada'),
        el('div', { class: 'text-xs text-fg-muted mt-0.5' }, 'Reserva ' + a.reserva + (a.reserva_data ? ' · ' + fmt.dateTime(a.reserva_data) : '')),
      ));
    }
    if (isOwner || userIsAdmin) {
      reservaSection.appendChild(el('button', {
        class: 'btn btn-primary',
        onclick: () => openReservaModal(a),
      }, icon('check', 16), a.reserva ? 'Atualizar reserva' : 'Informar reserva (livre, sem aprovação)'));
    }
  }

  function openReservaModal(at) {
    const inp = el('input', { class: 'input', value: at.reserva || '', placeholder: 'Código/número da reserva no CV' });
    const saveBtn = el('button', { class: 'btn btn-primary' }, 'Salvar reserva');
    const cancelBtn = el('button', { class: 'btn btn-ghost', onclick: () => m.close() }, 'Cancelar');
    const m = modal({
      title: 'Reserva da proposta', size: 'sm',
      content: el('div', { class: 'flex flex-col gap-2' }, inp),
      footer: [cancelBtn, saveBtn],
    });
    setTimeout(() => inp.focus(), 60);
    saveBtn.addEventListener('click', async () => {
      const reserva = inp.value.trim();
      saveBtn.disabled = true;
      const patch = {
        reserva: reserva || null,
        reserva_data: reserva ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase.from('atividades').update(patch).eq('id', at.id).select();
      if (error || !data || !data.length) { toast(error?.message || 'Sem permissão para salvar a reserva', 'error', 6000); saveBtn.disabled = false; return; }
      toast(reserva ? '✓ Reserva salva — proposta Reservada' : 'Reserva removida', 'success');
      location.reload();
    });
  }

  // Proposta NÃO passa mais por aprovação (só edição e exclusão são aprovadas).
  const aprovacaoBanner = null;

  // ===== Histórico de auditoria (edições + exclusões) desta atividade =====
  const histSection = el('div', {});
  (async () => {
    const { data: hist } = await supabase
      .from('atividades_historico')
      .select('*')
      .eq('atividade_id', a.id)
      .order('em', { ascending: false })
      .limit(100);
    if (!hist || !hist.length) return;
    histSection.appendChild(el('details', { class: 'card p-4' },
      el('summary', { class: 'cursor-pointer font-bold text-sm flex items-center gap-2' },
        icon('clock', 16, 'text-fg-muted'), `Histórico de alterações (${hist.length})`),
      el('div', { class: 'flex flex-col gap-2 mt-3' }, ...hist.map(renderHistEntry)),
    ));
  })();

  const content = el('div', { class: 'flex flex-col gap-3' },
    header,
    aprovacaoBanner,
    editBanner,
    pendingBanner,
    el('div', { class: 'card p-4' }, ...rows),
    fotosSection,
    vinculoSection,

    // Botão de edição. Gerente: vai para aprovação. Gestor/Master: edita direto.
    (canFullEdit || canRequestEdit) && !a.solicita_edicao && el('button', {
      class: 'btn btn-secondary',
      onclick: () => navigate(`/atividade/${a.id}/editar/${a.tipo}`)
    }, icon('edit', 16),
      canRequestEdit ? 'Editar (requer aprovação)' : 'Editar atividade'
    ),

    // Aprovador: aplicar a edição proposta
    canApproveEdit && el('button', {
      class: 'btn btn-primary',
      onclick: async () => {
        const ok = await confirmModal({
          title: 'Aprovar edição?',
          message: 'As alterações propostas serão aplicadas à atividade.',
          confirmLabel: 'Aprovar e aplicar',
        });
        if (!ok) return;
        const r = await aplicarEdicao(a);
        if (!r.ok) { toast(r.error, 'error', 6000); return; }
        toast('✓ Edição aplicada', 'success');
        location.reload();
      }
    }, icon('check', 16), 'Aprovar edição'),

    // Aprovador: rejeitar a edição proposta
    canApproveEdit && el('button', {
      class: 'btn btn-ghost text-danger',
      onclick: async () => {
        const r = await rejeitarEdicao(a);
        if (!r.ok) { toast(r.error, 'error', 6000); return; }
        toast('Edição rejeitada', 'info');
        location.reload();
      }
    }, '✕ Rejeitar edição'),

    // Dono: cancelar a própria solicitação de edição
    isOwner && a.solicita_edicao && a.edicao_solicitada_por === state.user.id && el('button', {
      class: 'btn btn-ghost',
      onclick: async () => {
        const r = await rejeitarEdicao(a);
        if (!r.ok) { toast(r.error, 'error', 6000); return; }
        toast('Solicitação de edição cancelada', 'info');
        location.reload();
      }
    }, '↩ Cancelar solicitação de edição'),

    // Gestor: aprovar exclusão
    canApproveDeletion && el('button', {
      class: 'btn btn-danger',
      onclick: async () => {
        const ok = await confirmModal({
          title: 'Aprovar exclusão?',
          message: `Confirma a exclusão definitiva desta ${TIPO_ATIVIDADE[a.tipo].label}? Esta ação não pode ser desfeita.`,
          confirmLabel: 'Aprovar e excluir', danger: true,
        });
        if (!ok) return;
        const r = await excluirAtividade(a);
        if (!r.ok) { toast(r.error, 'error', 6000); return; }
        toast('✓ Atividade excluída (mantida no histórico)', 'success');
        navigate('/historico', true);
      }
    }, icon('check', 16), 'Aprovar exclusão e remover'),

    // Gestor: rejeitar exclusão
    canApproveDeletion && el('button', {
      class: 'btn btn-ghost',
      onclick: async () => {
        const { error } = await supabase
          .from('atividades')
          .update({ solicita_exclusao: false, exclusao_solicitada_em: null, exclusao_solicitada_por: null })
          .eq('id', a.id).select();
        if (error) { toast(error.message, 'error'); return; }
        toast('Solicitação rejeitada', 'info');
        location.reload();
      }
    }, '✕ Rejeitar solicitação de exclusão'),

    // Gerente: solicitar exclusão
    canRequestDeletion && el('button', {
      class: 'btn btn-ghost text-warning',
      onclick: async () => {
        const ok = await confirmModal({
          title: 'Solicitar exclusão?',
          message: 'A atividade só será removida após aprovação de um Gestor. Você pode cancelar a solicitação a qualquer momento.',
          confirmLabel: 'Solicitar exclusão',
        });
        if (!ok) return;
        const { error } = await supabase.from('atividades').update({
          solicita_exclusao: true,
          exclusao_solicitada_em: new Date().toISOString(),
          exclusao_solicitada_por: state.user.id,
        }).eq('id', a.id).select();
        if (error) { toast(error.message, 'error'); return; }
        toast('Solicitação enviada para o Gestor', 'success');
        location.reload();
      }
    }, '⏳ Solicitar exclusão'),

    // Gerente: cancelar própria solicitação
    isOwner && a.solicita_exclusao && a.exclusao_solicitada_por === state.user.id && el('button', {
      class: 'btn btn-ghost',
      onclick: async () => {
        const { error } = await supabase.from('atividades').update({
          solicita_exclusao: false, exclusao_solicitada_em: null, exclusao_solicitada_por: null
        }).eq('id', a.id).select();
        if (error) { toast(error.message, 'error'); return; }
        toast('Solicitação cancelada', 'info');
        location.reload();
      }
    }, '↩ Cancelar solicitação de exclusão'),

    // Gestor: exclusão direta sem precisar de solicitação
    canHardDelete && !a.solicita_exclusao && el('button', {
      class: 'btn btn-ghost text-danger',
      onclick: async () => {
        const ok = await confirmModal({
          title: 'Excluir atividade?',
          message: 'A atividade sai das telas, mas fica registrada no histórico de exclusões para auditoria.',
          confirmLabel: 'Excluir', danger: true,
        });
        if (!ok) return;
        const r = await excluirAtividade(a);
        if (!r.ok) { toast(r.error, 'error', 6000); return; }
        toast('Atividade excluída (mantida no histórico)', 'success');
        navigate('/historico', true);
      }
    }, icon('trash', 16), 'Excluir'),

    // Reserva (livre, sem aprovação) + selo "Reservada"
    reservaSection,

    // Histórico de auditoria desta atividade
    histSection,
  );

  app.appendChild(shell(content, {
    title: t.label, back: true, hideBottomNav: true, headerActions
  }));
}

function fmtFieldValue(k, v) {
  if (v == null || v === '') return '—';
  if (k === 'valor') return fmt.currency(v);
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  return String(v);
}

function renderEdicaoPendenteBanner(a) {
  const dep = a.edicao_pendente || {};
  const keys = Object.keys(dep).filter(k => FIELD_LABELS[k]);
  return el('div', { class: 'card p-3 border-2', style: { borderColor: '#F59E0B', background: 'rgba(245,158,11,0.1)' } },
    el('div', { class: 'flex items-center gap-2' },
      el('span', { class: 'text-2xl' }, '✏️'),
      el('div', { class: 'flex-1' },
        el('div', { class: 'font-bold text-warning' }, 'Edição aguardando aprovação'),
        el('div', { class: 'text-xs text-fg-subtle' }, fmt.relative(a.edicao_solicitada_em)),
      ),
    ),
    keys.length ? el('div', { class: 'flex flex-col gap-1.5 mt-2 pt-2 border-t border-border' },
      ...keys.map(k => el('div', { class: 'text-xs' },
        el('span', { class: 'font-semibold' }, FIELD_LABELS[k] + ': '),
        el('span', { class: 'text-fg-muted line-through' }, fmtFieldValue(k, a[k])),
        el('span', { class: 'mx-1' }, '→'),
        el('span', { class: 'text-fg font-medium' }, fmtFieldValue(k, dep[k])),
      )),
    ) : null,
  );
}

function renderHistEntry(h) {
  const isExcl = h.tipo_evento === 'exclusao';
  const dados = h.dados || {};
  const changes = [];
  if (!isExcl && dados.depois) {
    for (const k of Object.keys(dados.depois)) {
      if (!FIELD_LABELS[k]) continue;
      changes.push(el('div', { class: 'text-xs' },
        el('span', { class: 'font-semibold' }, FIELD_LABELS[k] + ': '),
        el('span', { class: 'text-fg-muted line-through' }, fmtFieldValue(k, dados.antes?.[k])),
        el('span', { class: 'mx-1' }, '→'),
        el('span', {}, fmtFieldValue(k, dados.depois[k])),
      ));
    }
  }
  return el('div', { class: 'border-l-2 border-border pl-3 py-1' },
    el('div', { class: 'text-sm font-medium flex items-center gap-2' },
      isExcl ? '🗑️ Exclusão' : '✏️ Edição',
      el('span', { class: 'text-xs text-fg-subtle font-normal' }, fmt.dateTime(h.em)),
    ),
    el('div', { class: 'text-xs text-fg-muted' },
      'por ' + (h.por_nome || '?') +
      (h.aprovado_por_nome && h.aprovado_por_nome !== h.por_nome ? ` · aprovado por ${h.aprovado_por_nome}` : '')),
    isExcl && dados.motivo ? el('div', { class: 'text-xs italic text-fg-muted mt-0.5' }, '"' + dados.motivo + '"') : null,
    changes.length ? el('div', { class: 'flex flex-col gap-0.5 mt-1' }, ...changes) : null,
  );
}

function locationMapRow(lat, lng) {
  const mapsUrl = gmapsLink(lat, lng);
  const embedUrl = `https://www.google.com/maps?q=${lat},${lng}&z=15&output=embed`;

  // Container do mapa
  const mapContainer = el('div', {
    class: 'rounded-xl overflow-hidden border border-border',
    style: { height: '180px', position: 'relative' }
  });

  // Iframe do Google Maps
  const iframe = document.createElement('iframe');
  iframe.src = embedUrl;
  iframe.width = '100%';
  iframe.height = '180';
  iframe.style.cssText = 'border:0; display:block;';
  iframe.loading = 'lazy';
  iframe.setAttribute('allowfullscreen', '');
  iframe.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
  mapContainer.appendChild(iframe);

  // Fallback: se iframe não carregar em 4s, mostra card visual
  const fallbackTimer = setTimeout(() => {
    if (!iframe.contentWindow) {
      mapContainer.innerHTML = '';
      mapContainer.style.background = 'linear-gradient(135deg, rgba(59,130,246,0.08), rgba(59,130,246,0.02))';
      mapContainer.style.display = 'flex';
      mapContainer.style.alignItems = 'center';
      mapContainer.style.justifyContent = 'center';
      mapContainer.style.flexDirection = 'column';
      mapContainer.style.gap = '8px';
      mapContainer.appendChild(el('div', { style: { fontSize: '2rem' } }, '📍'));
      mapContainer.appendChild(el('div', { class: 'text-sm font-semibold text-fg' },
        `${lat.toFixed(5)}, ${lng.toFixed(5)}`));
    }
  }, 4000);

  iframe.addEventListener('load', () => clearTimeout(fallbackTimer));

  return el('div', { class: 'flex flex-col py-2 border-b border-border' },
    el('span', { class: 'text-xs uppercase tracking-wider text-fg-subtle font-semibold mb-1.5' }, 'Localização'),
    mapContainer,
    el('a', {
      class: 'mt-2 text-xs text-rottas-500 font-semibold inline-flex items-center gap-1.5 hover:underline',
      href: mapsUrl, target: '_blank', rel: 'noopener'
    }, icon('mapPin', 14), 'Abrir no Google Maps'),
  );
}

// ===== WORKFLOW DE APROVAÇÃO DE PROPOSTAS =====
// Status: pendente -> aprovada_regional -> aprovada_super -> aprovada_master
// A qualquer momento pode ser rejeitada (com motivo).
// O aprovador atual pode: aprovar, escalar pro próximo nível, ou rejeitar.

function renderAprovacaoBanner(a) {
  const status = a.status_aprovacao || 'pendente';
  const meta = PROPOSTA_STATUS[status] || PROPOSTA_STATUS.pendente;
  const colors = {
    yellow: { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.4)', text: '#B45309' },
    blue:   { bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.4)', text: '#1D4ED8' },
    purple: { bg: 'rgba(139,92,246,0.1)', border: 'rgba(139,92,246,0.4)', text: '#6D28D9' },
    green:  { bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.4)', text: '#047857' },
    red:    { bg: 'rgba(239,68,68,0.1)',  border: 'rgba(239,68,68,0.4)',  text: '#B91C1C' },
  }[meta.color] || { bg: '#F3F4F6', border: '#E5E7EB', text: '#374151' };

  const historico = Array.isArray(a.historico_aprovacao) ? a.historico_aprovacao : [];

  return el('div', {
    class: 'card p-3 border-2',
    style: { borderColor: colors.border, background: colors.bg },
  },
    el('div', { class: 'flex items-center gap-2' },
      el('span', { class: 'text-2xl' }, meta.icon),
      el('div', { class: 'flex-1' },
        el('div', { class: 'font-bold text-sm', style: { color: colors.text } }, meta.label),
        a.escalada_para && el('div', { class: 'text-xs text-fg-muted' },
          '↗ Escalada para: ' + (ROLES[a.escalada_para]?.label || a.escalada_para)),
        a.aprovado_em && el('div', { class: 'text-xs text-fg-subtle' },
          'Última ação: ' + fmt.relative(a.aprovado_em)),
      ),
    ),
    a.motivo_rejeicao && el('div', { class: 'mt-2 text-xs text-fg-muted italic' },
      '"' + a.motivo_rejeicao + '"'),
    // Histórico (collapsible)
    historico.length > 0 && el('details', { class: 'mt-2' },
      el('summary', { class: 'text-xs text-fg-muted cursor-pointer' }, `Histórico (${historico.length})`),
      el('div', { class: 'mt-2 flex flex-col gap-1' },
        ...historico.map(h => el('div', { class: 'text-xs text-fg-muted' },
          `${h.acao} por ${h.por_nome || h.por || '?'} em ${fmt.dateTime(h.em)}` +
          (h.motivo ? ` - ${h.motivo}` : '')
        ))
      )
    ),
  );
}

function renderPropostaActions(a) {
  const status = a.status_aprovacao || 'pendente';
  const actions = [];
  // Status final: nao mostra mais botoes
  if (status === 'aprovada_master' || status === 'rejeitada') return actions;

  // Próximo aprovador esperado (ou para quem foi escalado)
  const expected = a.escalada_para || NEXT_APPROVER[status];
  if (!expected || !canApproveLevel(expected)) return actions;

  // === APROVAR ===
  actions.push(el('button', {
    class: 'btn btn-primary',
    onclick: async () => {
      const ok = await confirmModal({
        title: 'Aprovar proposta?',
        message: `Você está aprovando esta proposta como ${ROLES[expected]?.label || expected}.`,
        confirmLabel: 'Aprovar',
      });
      if (!ok) return;
      await applyPropostaAction(a, 'aprovar', expected);
    }
  }, icon('check', 16), `✓ Aprovar como ${ROLES[expected]?.label || expected}`));

  // === ESCALAR (só se há nível acima) ===
  const nextLevel = NEXT_APPROVER[
    expected === 'gestor_regional' ? 'pendente' :
    expected === 'superintendente' ? 'aprovada_regional' :
    expected === 'master' ? 'aprovada_super' : null
  ];
  // Simplificando: a partir do nível atual, qual seria o próximo?
  const chain = ['gestor_regional', 'superintendente', 'master'];
  const idx = chain.indexOf(expected);
  const nextEscalation = (idx >= 0 && idx < chain.length - 1) ? chain[idx + 1] : null;

  if (nextEscalation) {
    actions.push(el('button', {
      class: 'btn btn-secondary',
      onclick: async () => {
        const motivo = prompt(`Por que está escalando para ${ROLES[nextEscalation]?.label}? (opcional)`);
        if (motivo === null) return; // cancelou
        await applyPropostaAction(a, 'escalar', expected, { escalar_para: nextEscalation, motivo });
      }
    }, '↗ Escalar para ' + ROLES[nextEscalation]?.label));
  }

  // === REJEITAR ===
  actions.push(el('button', {
    class: 'btn btn-ghost text-danger',
    onclick: async () => {
      const motivo = prompt('Motivo da rejeição:');
      if (!motivo || !motivo.trim()) return;
      await applyPropostaAction(a, 'rejeitar', expected, { motivo: motivo.trim() });
    }
  }, '✕ Rejeitar proposta'));

  return actions;
}

async function applyPropostaAction(a, acao, nivel, opts = {}) {
  const now = new Date().toISOString();
  const historico = Array.isArray(a.historico_aprovacao) ? [...a.historico_aprovacao] : [];
  const meuNome = state.profile?.nome || '?';
  historico.push({
    acao,
    nivel,
    por: state.user.id,
    por_nome: meuNome,
    em: now,
    motivo: opts.motivo || null,
    escalar_para: opts.escalar_para || null,
  });

  const patch = {
    historico_aprovacao: historico,
    aprovado_em: now,
    aprovador_id: state.user.id,
  };

  if (acao === 'aprovar') {
    const statusMap = {
      gestor_regional: 'aprovada_regional',
      superintendente: 'aprovada_super',
      master: 'aprovada_master',
    };
    patch.status_aprovacao = statusMap[nivel];
    patch.escalada_para = null;
  } else if (acao === 'escalar') {
    // Mantém status anterior, mas marca escalation
    patch.escalada_para = opts.escalar_para;
    patch.motivo_rejeicao = null;
  } else if (acao === 'rejeitar') {
    patch.status_aprovacao = 'rejeitada';
    patch.motivo_rejeicao = opts.motivo;
    patch.escalada_para = null;
  }

  const { error } = await supabase.from('atividades').update(patch).eq('id', a.id);
  if (error) {
    toast('Erro: ' + error.message, 'error', 5000);
    return;
  }
  toast({
    aprovar: '✓ Proposta aprovada',
    escalar: '↗ Proposta escalada',
    rejeitar: 'Proposta rejeitada',
  }[acao] || 'OK', acao === 'rejeitar' ? 'info' : 'success');
  location.reload();
}
