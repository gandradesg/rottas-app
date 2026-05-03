// Configuração da aplicação
export const APP_VERSION = '0.5.2';
export const APP_BUILD_DATE = '2026-05-03';

export const CHANGELOG = [
  {
    version: '0.5.2',
    date: '03/05/2026',
    changes: [
      'Novo: numeração sequencial automática por tipo de atividade (nunca repete)',
      'Novo: número de venda atribuído ao adicionar reserva na proposta',
      'Novo: funil de vendas visual no Meu Funil (Visitas → Propostas → Vendas)',
      'Novo: mini-mapa Google Maps no formulário de registro após captura de GPS',
      'Corrigido: home carrega instantaneamente (sem skeletons travados)',
      'Corrigido: filtro "null" removido do histórico do gerente',
      'Segurança: exclusão agora é soft-delete (atividades canceladas mantêm número)',
      'Privacidade: seção OpenAI API Key visível apenas para Master',
    ],
  },
  {
    version: '0.5.1',
    date: '03/05/2026',
    changes: [
      'Corrigido: logout e confirmações de exclusão agora funcionam (bug de dupla resolução no modal)',
      'Corrigido: visualização de propostas sem reserva não causa mais erro',
      'Corrigido: selects nos formulários atualizam corretamente ao trocar valor',
      'Segurança: gerentes não podem mais deletar atividades diretamente (requer aprovação)',
      'SEO: adicionado meta description e tags Apple PWA',
    ],
  },
  {
    version: '0.5.0',
    date: '02/05/2026',
    changes: [
      'Sistema de aprovação de exclusão (gerente solicita, gestor aprova)',
      'Gerente só edita campo Reserva da própria Proposta',
      'Aba "Aprovações pendentes" no painel do Gestor',
      'Atendimento ganha geolocalização + nova ordem de campos',
      'Proposta: Cliente primeiro + valor com máscara R$ 0,00',
      'Logout completamente refeito (limpa todo storage)',
      'Detecção de RLS rejection em saves silenciosos',
    ],
  },
  {
    version: '0.4.0',
    date: '02/05/2026',
    changes: [
      'Permissões granulares para Gestores (controladas pelo Master)',
      'Transcrição de áudio gratuita via Web Speech API (Chrome/Edge)',
      'Logout corrigido + limpeza completa da sessão',
      'Performance: cargas paralelas, modais com UI otimista',
      'Upload de fotos em paralelo com progresso',
      'Tela "Sobre" com histórico de versões',
    ],
  },
  {
    version: '0.3.0',
    date: '02/05/2026',
    changes: [
      'Tela inicial de seleção de perfil (Gestor / Gerente de Plataforma)',
      'Papel "Gestor" separado de Master',
      'Master pode alternar entre visões Gestor/Gerente sem deslogar',
      'Cadastro de usuário com seletor de papel',
      'UI otimista nos modais (fecham na hora, salvam em background)',
      'Logo oficial Rottas em todo o app',
    ],
  },
  {
    version: '0.2.0',
    date: '01/05/2026',
    changes: [
      'Correção de race conditions na definição de senha',
      'Convite de Gerente preserva sessão do Master',
      'Timeouts de segurança em todas as operações async',
      'Logs detalhados para debug',
    ],
  },
  {
    version: '0.1.0',
    date: '01/05/2026',
    changes: [
      'Primeira versão: 4 atividades (Check-in, Atendimento, Proposta, Órulo)',
      'Geolocalização, upload de fotos, listas suspensas',
      'Painel Gestor com dashboards, ranking, feed e filtros',
      'Master: cadastro de usuários e listas',
      'Tema claro/escuro, exportação Excel + PNG',
    ],
  },
];

export const SUPABASE_URL  = 'https://lmzjlirzexyopnjxohez.supabase.co';
export const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxtempsaXJ6ZXh5b3BuanhvaGV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NzExMjcsImV4cCI6MjA5MzI0NzEyN30.V23FCvrJKRkGhjmZQqAnaXYLbtpMw7Wc_Ae7UB0t7a8';

export const APP_NAME = 'Rottas — Plataforma de Gerentes';
export const MASTER_EMAIL = 'gabriel.galvao@rottasconstrutora.com.br';

// Bucket de storage para fotos
export const PHOTO_BUCKET = 'fotos';
export const MAX_PHOTOS_PER_ACTIVITY = 3;

// Estados brasileiros (UF)
export const ESTADOS_BR = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR',
  'PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'
];

export const TERMOMETRO_OPTIONS = [
  { value: 'quente', label: 'Quente', color: 'red',    icon: '🔥' },
  { value: 'morno',  label: 'Morno',  color: 'yellow', icon: '🌤️' },
  { value: 'frio',   label: 'Frio',   color: 'blue',   icon: '❄️' },
];

export const TIPO_ATIVIDADE = {
  checkin:      { label: 'Check-in',    icon: '📍', color: 'blue'   },
  atendimento:  { label: 'Atendimento', icon: '👥', color: 'purple' },
  proposta:     { label: 'Proposta',    icon: '📄', color: 'yellow' },
  orulo:        { label: 'Órulo',       icon: '🌐', color: 'green'  },
};

// Permissões disponíveis para Gestores (Master pode marcar/desmarcar)
export const PERMISSOES = [
  { key: 'gerenciar_usuarios',   label: 'Gerenciar usuários',         desc: 'Criar, editar e desativar Gerentes de Plataforma' },
  { key: 'gerenciar_listas',     label: 'Gerenciar listas',           desc: 'Adicionar/editar imobiliárias, empreendimentos, motivos' },
  { key: 'editar_atividades',    label: 'Editar atividades',          desc: 'Editar atividades de qualquer Gerente (não só as próprias)' },
  { key: 'excluir_atividades',   label: 'Excluir atividades',         desc: 'Remover atividades do histórico' },
  { key: 'exportar_dados',       label: 'Exportar dados',             desc: 'Baixar relatórios em Excel e PNG' },
];
