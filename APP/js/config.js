// Configuração da aplicação
export const APP_VERSION = '0.8.2';
export const APP_BUILD_DATE = '2026-05-07';

export const CHANGELOG = [
  {
    version: '0.8.2',
    date: '07/05/2026',
    changes: [
      'Master agora pode criar OUTROS usuarios masters (terceiro pílula no seletor de perfil)',
      'Master principal (gabriel.galvao@rottasconstrutora.com.br) protegido contra exclusao - nem outros masters podem remove-lo',
      'Protecao via trigger no banco (defense-in-depth): impede DELETE/UPDATE de role mesmo via API direta',
      'Trigger tambem em auth.users impede admin.deleteUser do master principal',
      'Botão "Excluir este perfil" oculto para o master principal em qualquer tela',
    ],
  },
  {
    version: '0.8.1',
    date: '07/05/2026',
    changes: [
      'Convites agora usam Edge Function `invite-user` com template INVITE correto (não mais recovery)',
      'Email de convite com logo oficial Rottas no topo (PNG hospedado em Supabase Storage)',
      'Email de redefinição de senha apenas quando solicitado via "Esqueci minha senha"',
      'Templates de email com texto contextualizado (boas-vindas vs redefinição)',
      'Removidos travessões longos do app inteiro (substituídos por hifens simples)',
      'Title do navegador volta a "Rottas - Plataforma de Gerentes" + esvazia document.title em modo PWA standalone para evitar duplicação do nome no Windows',
    ],
  },
  {
    version: '0.8.0',
    date: '06/05/2026',
    changes: [
      'Ícone do PWA: 4 tamanhos (192/256/384/512) gerados a partir da logo oficial Rottas',
      'Background da splash do PWA agora branco (não mais laranja) - combina com a logo oficial',
      'Templates de email reescritos em formato Outlook-safe (table-based, sem CSS background)',
      'Cabeçalho ROTTAS visível no Outlook corporativo + botão de definir senha sólido',
    ],
  },
  {
    version: '0.7.9',
    date: '06/05/2026',
    changes: [
      'Favicon e ícone do PWA agora usam EXATAMENTE a mesma logo oficial Rottas da plataforma (logo-icon.png)',
      'Removido o app-icon.svg customizado (diamante laranja) - não usado mais em lugar nenhum',
      'Cache-bust ?v=078 no favicon para forçar atualização nos navegadores',
      'Email: SMTP do Resend configurado no Supabase + domínio rottasconstrutora.com.br registrado (aguardando DNS)',
    ],
  },
  {
    version: '0.7.8',
    date: '06/05/2026',
    changes: [
      'Logo oficial Rottas no PWA (primeira versão - substituída por 0.7.9)',
    ],
  },
  {
    version: '0.7.7',
    date: '05/05/2026',
    changes: [
      'Ícone do app em alta resolução também no Android (app-icon.svg escala perfeitamente até 512×512+)',
      'Manifest.webmanifest declarando ícones em 192×192 e 512×512 (requisitos do Android Chrome PWA)',
      'Suporte a ícone "maskable" (Android adaptive icons)',
      'Vercel: Content-Type correto para SVG e manifest',
    ],
  },
  {
    version: '0.7.6',
    date: '05/05/2026',
    changes: [
      'Ícone correto da Rottas ao adicionar como app na tela do celular (iOS e Android) - não mostra mais "R" como fallback',
      'Manifest PWA limpo: aponta só para arquivos reais',
    ],
  },
  {
    version: '0.7.5',
    date: '05/05/2026',
    changes: [
      'Início: feed agora mostra o # do número sequencial da atividade (consistente com Histórico)',
    ],
  },
  {
    version: '0.7.4',
    date: '05/05/2026',
    changes: [
      'Agenda Mês: botão "+" agora aparece no canto superior direito da célula do dia selecionado (na própria grade)',
      'Removido o card de cabeçalho com "+" abaixo da grade do mês (limpa duplicidade)',
    ],
  },
  {
    version: '0.7.3',
    date: '05/05/2026',
    changes: [
      'Painel do Gestor: VGVs em formato compacto (R$ X,X mi) - card grande mostra também valor completo abaixo',
      'Painel do Gestor: funil de vendas (Visitas → Propostas → Vendas) na aba Visão geral',
      'Histórico: funil agora aparece também para Gestor/Master',
    ],
  },
  {
    version: '0.7.2',
    date: '05/05/2026',
    changes: [
      'Recovery link DEFINITIVO: boot detecta tokens de auth/recovery na URL e força redirecionamento para /setup-password (independente de evento Supabase)',
      'Agenda: botão "+" agora é redondo no canto superior direito do card de cada dia',
      'Agenda Atendimento: removido Empreendimento (só preenche no momento do registro real)',
      'Início: filtro de período (Dia / Semana / Mês / Geral) com persistência local - KPIs e feed atualizam',
    ],
  },
  {
    version: '0.7.1',
    date: '05/05/2026',
    changes: [
      'Agenda: tipos restritos a Check-in, Atendimento e Outro (Proposta/Órulo não fazem sentido planejar)',
      'Agenda: botão "+ Adicionar" agora fica em cada dia (substitui o "+ Novo" do topo)',
      'Agenda: clicar em um dia no Mês não duplica mais o calendário (fix do bug de re-render)',
      'Agenda Check-in: ganha campo Motivo da visita (lista do master)',
      'Agenda Atendimento: ganha campos Local da visita, Cliente, Corretor, Empreendimento',
      'Agenda: ditado de áudio nas observações (Web Speech API)',
      'Realizar atividade da agenda: motivo da visita e local também são pré-preenchidos',
    ],
  },
  {
    version: '0.7.0',
    date: '05/05/2026',
    changes: [
      'Agenda agora é a tela inicial do app (primeira do bottom nav)',
      'Calendário com modos Dia / Semana / Mês - hoje sempre destacado',
      'Mês com grade interativa: clique em qualquer dia para ver os agendamentos',
      'Indicadores visuais de pendentes (laranja) e realizados (verde) por dia',
      'Listas de imobiliárias e Locais de visita SEPARADAS (novo cadastro: "Locais de visita")',
      'Recovery link: storage do Supabase é limpo no boot quando há token na URL - não loga mais direto',
      'Fix: erro "Could not embed" na agenda (FK ambígua entre agendamentos e atividades)',
      'Painel Gestor migrado para /painel · KPIs do Gerente migrados para /inicio',
    ],
  },
  {
    version: '0.6.0',
    date: '03/05/2026',
    changes: [
      'Novo: módulo de Agenda - gerentes planejam visitas e atendimentos futuros',
      'Realizar atividade direto da agenda (Check-in/Atendimento/Proposta/Órulo) com pré-preenchimento e vínculo bidirecional',
      'Visão consolidada da agenda da equipe para Gestor/Master, com filtros por gerente, tipo, status e período',
      'Faixa de semana com indicador de pendências por dia',
      'Agrupamento por seção: Atrasadas, Hoje, Amanhã, Esta semana, Próximas, Passadas',
      'Fluxo de "link expirado" no primeiro acesso: tela amigável para solicitar novo link sem precisar voltar ao login',
      'Detecção robusta de erros de recovery na URL (token consumido/expirado)',
    ],
  },
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

export const APP_NAME = 'Rottas - Plataforma de Gerentes';
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
