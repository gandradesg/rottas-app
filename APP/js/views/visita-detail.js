// ═════════════════════════════════════════════════════════════════════════
// Visita — view de detalhe completo
// Mostra: dados, status, mini-mapa, observações, auditoria (registrado em)
// Acessível por: dono (recepcao_rottas que registrou) E Master
// ═════════════════════════════════════════════════════════════════════════

import { el, icon, toast, fmt, confirmModal } from '../ui.js';
import { shell } from './shell.js';
import { state, supabase } from '../supabase.js';
import { navigate } from '../router.js';
import { ROLES } from '../config.js';

export async function visitaDetailView({ id }, app) {
  const content = el('div', { class: 'flex flex-col gap-4' });
  app.appendChild(shell(content, { title: 'Detalhe da Visita', back: true }));

  content.appendChild(el('div', { class: 'card p-8 text-center' }, '⏳ Carregando...'));

  const { data: v, error } = await supabase.from('atividades')
    .select(`*, profiles!atividades_gerente_id_fkey(nome, email),
             gerentes_house:visita_gerente_house_id(nome)`)
    .eq('id', id).eq('tipo', 'visita').maybeSingle();

  content.innerHTML = '';

  if (error || !v) {
    content.appendChild(el('div', { class: 'card p-8 text-center text-fg-muted' },
      el('p', { class: 'text-lg mb-3' }, '🔒 Visita não encontrada ou sem acesso'),
      el('p', { class: 'text-sm' }, 'Apenas o Recepção que registrou ou o Master podem visualizar.'),
      el('button', { class: 'btn btn-secondary mt-4', onclick: () => history.back() }, 'Voltar'),
    ));
    return;
  }

  const isOwn = v.gerente_id === state.user?.id;
  const isMaster = state.profile?.role === 'master';
  const canDelete = isOwn && !v.solicita_exclusao;
  const canCancelDelete = isOwn && v.solicita_exclusao;
  const canApprove = isMaster && v.solicita_exclusao;

  // Datas
  const dataVisita = v.data_visita
    ? new Date(v.data_visita + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day:'2-digit', month:'long', year:'numeric' })
    : '—';
  const registradoEm = new Date(v.created_at).toLocaleString('pt-BR', {
    day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit',
  });

  // Header card
  content.appendChild(el('div', { class: 'card p-5 flex items-center gap-4' },
    el('div', {
      class: 'w-14 h-14 rounded-2xl flex items-center justify-center text-3xl text-white flex-shrink-0',
      style: { background: 'linear-gradient(135deg, #EC4899, #BE185D)' }
    }, '🚪'),
    el('div', { class: 'flex-1 min-w-0' },
      el('div', { class: 'flex items-center gap-2 flex-wrap' },
        v.numero_sequencial && el('span', { class: 'text-fg-muted font-bold' }, `#${v.numero_sequencial}`),
        el('h1', { class: 'text-xl font-extrabold' }, v.cliente || 'Sem nome'),
      ),
      el('p', { class: 'text-sm text-fg-muted' }, '📅 ', dataVisita),
      v.solicita_exclusao && el('span', { class: 'chip chip-yellow mt-2 inline-block' }, '⏳ Exclusão solicitada'),
    ),
  ));

  // Chips de status
  content.appendChild(el('div', { class: 'flex flex-wrap gap-2' },
    v.visita_forma_atendimento && el('span', {
      class: 'chip ' + (v.visita_forma_atendimento === 'Agendado' ? 'chip-green' : 'chip-yellow')
    }, v.visita_forma_atendimento),
    v.visita_canal && el('span', {
      class: 'chip ' + (v.visita_canal === 'House' ? 'chip-purple' : 'chip-blue')
    }, 'Canal ' + v.visita_canal),
    v.visita_periodo && el('span', { class: 'chip chip-gray' }, v.visita_periodo),
  ));

  // Bloco principal de dados
  const dataBlock = el('div', { class: 'card p-4 flex flex-col gap-3' });
  dataBlock.appendChild(el('h2', { class: 'font-bold text-sm text-fg-muted uppercase tracking-wider' }, 'Dados da Visita'));

  // fieldRow só retorna nó se value for NÃO-vazio (esconde campos null/vazios)
  const fieldRow = (label, value) => {
    const v = value == null ? '' : String(value).trim();
    if (!v || v === 'null' || v === 'undefined') return null;
    return el('div', { class: 'flex items-start gap-3 py-2 border-b border-border last:border-0' },
      el('div', { class: 'w-32 flex-shrink-0 text-sm text-fg-muted' }, label),
      el('div', { class: 'flex-1 text-sm font-medium' }, v),
    );
  };

  // Filtra nulls antes do append (DOM nativo converte null em string "null")
  [
    fieldRow('Local da Visita', v.local_treinamento),
    fieldRow('Empreendimento', v.empreendimento),
    fieldRow('Período', v.visita_periodo),
    fieldRow('Forma', v.visita_forma_atendimento),
    v.visita_canal ? fieldRow('Canal', v.visita_canal) : null,
    v.visita_canal === 'House' ? fieldRow('Gerente House', v.gerentes_house?.nome) : null,
    v.visita_canal === 'House' ? fieldRow('Corretor', v.corretor) : null,
    v.visita_canal === 'Imob'  ? fieldRow('Imobiliária', v.imobiliaria) : null,
  ].filter(Boolean).forEach(node => dataBlock.appendChild(node));
  content.appendChild(dataBlock);

  // Observações
  if (v.observacoes) {
    const obs = el('div', { class: 'card p-4 flex flex-col gap-2' },
      el('h2', { class: 'font-bold text-sm text-fg-muted uppercase tracking-wider' }, '📝 Observações'),
      el('p', { class: 'text-sm whitespace-pre-wrap leading-relaxed' }, v.observacoes),
    );
    content.appendChild(obs);
  }

  // Localização + mini-mapa
  if (v.latitude != null && v.longitude != null) {
    const lat = v.latitude, lng = v.longitude;
    const mapBox = el('div', { class: 'card p-4 flex flex-col gap-2' },
      el('h2', { class: 'font-bold text-sm text-fg-muted uppercase tracking-wider' }, '📍 Localização'),
      el('p', { class: 'text-xs text-fg-muted' }, `Latitude ${lat}, Longitude ${lng}`),
      el('iframe', {
        class: 'w-full rounded-lg border border-border',
        style: { height: '300px' },
        src: `https://maps.google.com/maps?q=${lat},${lng}&hl=pt-BR&z=17&output=embed`,
        loading: 'lazy',
        referrerpolicy: 'no-referrer-when-downgrade',
      }),
      el('a', {
        class: 'btn btn-secondary btn-sm self-start',
        href: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
        target: '_blank',
      }, '🗺️ Abrir no Google Maps'),
    );
    content.appendChild(mapBox);
  }

  // Auditoria
  content.appendChild(el('div', { class: 'card p-4 flex flex-col gap-2' },
    el('h2', { class: 'font-bold text-sm text-fg-muted uppercase tracking-wider' }, 'ℹ️ Registro'),
    el('p', { class: 'text-sm' },
      el('span', { class: 'text-fg-muted' }, 'Registrado em: '),
      el('strong', {}, registradoEm),
    ),
    el('p', { class: 'text-sm' },
      el('span', { class: 'text-fg-muted' }, 'Recepção responsável: '),
      el('strong', {}, v.profiles?.nome || '—'),
    ),
    v.solicita_exclusao && el('p', { class: 'text-sm text-warning' },
      el('span', { class: 'text-fg-muted' }, 'Exclusão solicitada em: '),
      el('strong', {}, fmt.dateTime(v.exclusao_solicitada_em)),
    ),
  ));

  // Ações
  const actions = el('div', { class: 'flex flex-wrap gap-2 mt-2' });

  actions.appendChild(el('button', { class: 'btn btn-ghost', onclick: () => history.back() }, '← Voltar'));

  if (canDelete) {
    actions.appendChild(el('button', {
      class: 'btn btn-danger',
      onclick: async () => {
        const ok = await confirmModal({
          title: 'Solicitar exclusão?',
          message: 'A visita só será removida após aprovação do Master. Você pode cancelar a solicitação a qualquer momento.',
          confirmLabel: 'Solicitar exclusão', danger: true,
        });
        if (!ok) return;
        const { error } = await supabase.from('atividades').update({
          solicita_exclusao: true,
          exclusao_solicitada_em: new Date().toISOString(),
          exclusao_solicitada_por: state.user.id,
        }).eq('id', id);
        if (error) { toast(error.message, 'error'); return; }
        toast('Solicitação enviada. Aguardando aprovação do Master.', 'success');
        navigate('/visitas');
      },
    }, icon('trash', 16), 'Solicitar exclusão'));
  }

  if (canCancelDelete) {
    actions.appendChild(el('button', {
      class: 'btn btn-secondary',
      onclick: async () => {
        const { error } = await supabase.from('atividades').update({
          solicita_exclusao: false, exclusao_solicitada_em: null, exclusao_solicitada_por: null,
        }).eq('id', id);
        if (error) { toast(error.message, 'error'); return; }
        toast('Solicitação cancelada.', 'info');
        navigate('/visitas');
      },
    }, 'Cancelar solicitação de exclusão'));
  }

  if (canApprove) {
    actions.appendChild(el('button', {
      class: 'btn btn-danger',
      onclick: async () => {
        const ok = await confirmModal({
          title: 'Aprovar exclusão?',
          message: 'A visita será removida permanentemente do histórico ativo.',
          confirmLabel: 'Aprovar', danger: true,
        });
        if (!ok) return;
        const { error } = await supabase.from('atividades').update({ cancelada: true }).eq('id', id);
        if (error) { toast(error.message, 'error'); return; }
        toast('Visita excluída.', 'success');
        navigate('/visitas');
      },
    }, '✓ Aprovar exclusão'));

    actions.appendChild(el('button', {
      class: 'btn btn-secondary',
      onclick: async () => {
        const { error } = await supabase.from('atividades').update({
          solicita_exclusao: false, exclusao_solicitada_em: null, exclusao_solicitada_por: null,
        }).eq('id', id);
        if (error) { toast(error.message, 'error'); return; }
        toast('Solicitação rejeitada.', 'info');
        navigate('/visitas');
      },
    }, '✕ Manter visita'));
  }

  content.appendChild(actions);
}
