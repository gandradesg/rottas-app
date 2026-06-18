// Ações de atividade com auditoria: aplicar edição aprovada, rejeitar, excluir.
// Compartilhado entre o detalhe da atividade e o Painel (Aprovações).
import { supabase, state } from './supabase.js';
import { TIPO_ATIVIDADE } from './config.js';

// Rótulos legíveis dos campos (para exibir o "antes/depois" da edição)
export const FIELD_LABELS = {
  imobiliaria: 'Imobiliária',
  motivo_visita: 'Motivo da visita',
  local_visita: 'Local da visita',
  produto: 'Empreendimento',
  empreendimento: 'Empreendimento',
  corretor: 'Corretor',
  cliente: 'Cliente',
  termometro: 'Termômetro',
  unidade: 'Unidade',
  valor: 'Valor',
  observacoes: 'Observações',
  reserva: 'Reserva (CV)',
  motivo_contato: 'Motivo do contato',
  plataforma: 'Plataforma',
  qtd_pessoas: 'Qtd. de pessoas',
  local_treinamento: 'Local do treinamento',
  imobiliarias_participantes: 'Imobiliárias participantes',
  fotos: 'Fotos',
};

// Campos que nunca entram no "diff" de edição (metadados internos)
export const META_FIELDS = new Set([
  'id', 'gerente_id', 'tipo', 'created_at', 'updated_at', 'agendamento_id',
  'numero_sequencial', 'numero_venda', 'cancelada',
  'solicita_exclusao', 'exclusao_solicitada_em', 'exclusao_solicitada_por',
  'solicita_edicao', 'edicao_solicitada_em', 'edicao_solicitada_por', 'edicao_pendente',
  'excluida_em', 'excluida_por', 'motivo_exclusao',
  'status_aprovacao', 'historico_aprovacao', 'aprovado_em', 'aprovador_id',
  'escalada_para', 'motivo_rejeicao', 'profiles',
  'reserva_data', 'latitude', 'longitude',
]);

// Texto curto pra listar no histórico
export function resumoAtividade(a) {
  const t = TIPO_ATIVIDADE[a.tipo]?.label || a.tipo;
  const num = a.numero_sequencial ? `#${a.numero_sequencial}` : '';
  const titulo = a.imobiliaria || a.empreendimento || a.produto || a.cliente || a.local_visita || '';
  return [t, num, titulo].filter(Boolean).join(' · ');
}

// Diff entre dois objetos (só campos relevantes que mudaram)
export function buildDiff(orig, novo) {
  const antes = {}, depois = {};
  for (const k of Object.keys(novo || {})) {
    if (META_FIELDS.has(k)) continue;
    const a = orig?.[k] ?? null;
    const b = novo[k] ?? null;
    if (JSON.stringify(a) !== JSON.stringify(b)) { antes[k] = a; depois[k] = b; }
  }
  return { antes, depois };
}

async function logHistorico(entry) {
  const { error } = await supabase.from('atividades_historico').insert({
    atividade_id: entry.atividade_id,
    tipo_evento: entry.tipo_evento,
    resumo: entry.resumo || null,
    por: entry.por || state.user?.id || null,
    por_nome: entry.por_nome || state.profile?.nome || null,
    aprovado_por: entry.aprovado_por || null,
    aprovado_por_nome: entry.aprovado_por_nome || null,
    dados: entry.dados || null,
  });
  if (error) console.warn('[historico] falha ao registrar:', error.message);
}

// Aplica a edição pendente de uma atividade (chamado pelo aprovador).
// Retorna { ok, error }.
export async function aplicarEdicao(a) {
  const dep = a.edicao_pendente || {};
  if (!Object.keys(dep).length) return { ok: false, error: 'Nada para aplicar.' };
  const antes = {};
  for (const k of Object.keys(dep)) antes[k] = a[k] ?? null;

  const patch = {
    ...dep,
    solicita_edicao: false,
    edicao_solicitada_em: null,
    edicao_solicitada_por: null,
    edicao_pendente: null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('atividades').update(patch).eq('id', a.id).select();
  if (error) return { ok: false, error: error.message };
  if (!data || !data.length) return { ok: false, error: 'Sem permissão para aplicar (fora do seu escopo).' };

  await logHistorico({
    atividade_id: a.id, tipo_evento: 'edicao', resumo: resumoAtividade(a),
    aprovado_por: state.user?.id, aprovado_por_nome: state.profile?.nome,
    por: a.edicao_solicitada_por || a.gerente_id, por_nome: a.profiles?.nome || null,
    dados: { antes, depois: dep },
  });
  return { ok: true };
}

// Registra no histórico uma edição aplicada DIRETAMENTE (gestor/master editou
// sem precisar de aprovação). Não falha o fluxo se o log der erro.
export async function auditarEdicaoDireta(a, antes, depois) {
  if (!depois || !Object.keys(depois).length) return;
  await logHistorico({
    atividade_id: a.id, tipo_evento: 'edicao', resumo: resumoAtividade(a),
    dados: { antes, depois },
  });
}

// Rejeita a edição pendente (descarta a proposta de alteração). Retorna { ok, error }.
export async function rejeitarEdicao(a) {
  const { data, error } = await supabase.from('atividades').update({
    solicita_edicao: false, edicao_solicitada_em: null, edicao_solicitada_por: null, edicao_pendente: null,
  }).eq('id', a.id).select();
  if (error) return { ok: false, error: error.message };
  if (!data || !data.length) return { ok: false, error: 'Sem permissão (fora do seu escopo).' };
  return { ok: true };
}

// Exclui (soft-delete) mantendo histórico. Retorna { ok, error }.
export async function excluirAtividade(a, motivo) {
  const snapshot = {};
  for (const k of Object.keys(a)) {
    if (k === 'profiles') continue;
    snapshot[k] = a[k];
  }
  const { data, error } = await supabase.from('atividades').update({
    cancelada: true,
    solicita_exclusao: false, exclusao_solicitada_em: null, exclusao_solicitada_por: null,
    excluida_em: new Date().toISOString(),
    excluida_por: state.user?.id || null,
    motivo_exclusao: motivo || null,
    updated_at: new Date().toISOString(),
  }).eq('id', a.id).select();
  if (error) return { ok: false, error: error.message };
  if (!data || !data.length) return { ok: false, error: 'Sem permissão para excluir (fora do seu escopo).' };

  await logHistorico({
    atividade_id: a.id, tipo_evento: 'exclusao', resumo: resumoAtividade(a),
    aprovado_por: state.user?.id, aprovado_por_nome: state.profile?.nome,
    dados: { snapshot, motivo: motivo || null },
  });
  return { ok: true };
}
