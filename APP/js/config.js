// Configuração da aplicação
export const APP_VERSION = '1.1.8';
export const APP_BUILD_DATE = '2026-06-17';

export const CHANGELOG = [
  {
    version: '1.1.8',
    date: '17/06/2026',
    changes: [
      'CORRIGIDO: janelas de cadastro não fecham mais ao clicar fora por engano — agora só fecham no "✕" ou nos botões. Não se perde mais o que foi digitado',
    ],
  },
  {
    version: '1.1.7',
    date: '17/06/2026',
    changes: [
      'MELHORADO: telefone agora mostra a bandeira real do país (o emoji não aparecia no Windows) e usa o formato de cada país — ex.: Portugal 351 999 999 999, EUA (000) 000-0000, etc. O placeholder muda conforme o país escolhido',
    ],
  },
  {
    version: '1.1.6',
    date: '17/06/2026',
    changes: [
      'NOVO: campo de telefone inteligente — já vem como Brasil 🇧🇷 (+55), com troca de país, e formata sozinho enquanto você digita: (22) 99763-7344. Avisa se o celular estiver incompleto',
      'NOVO: campo de e-mail sugere @gmail.com, @outlook.com e @hotmail.com ao digitar "@" (e aceita qualquer outro provedor)',
      'Aplicado em todos os cadastros com telefone/e-mail: corretor, cliente, usuário e perfil',
    ],
  },
  {
    version: '1.1.5',
    date: '17/06/2026',
    changes: [
      'CORRIGIDO: URL não fica mais presa com "?_logout=..." depois de sair e entrar de novo',
    ],
  },
  {
    version: '1.1.4',
    date: '17/06/2026',
    changes: [
      'NOVO: nas Listas, clique em "Corretores" numa imobiliária para ver/adicionar/excluir os corretores vinculados a ela',
      'NOVO: aba "Clientes (leads)" nas Listas — veja e gerencie os clientes cadastrados nos atendimentos/propostas',
      'Barra de abas das Listas agora quebra linha (não corta mais "Gerentes House")',
    ],
  },
  {
    version: '1.1.3',
    date: '17/06/2026',
    changes: [
      'CORRIGIDO: edição/exclusão de listas (empreendimentos, gerentes house, etc) liberada para todos que têm a permissão "Gerenciar listas" — não só Master/Gestor',
      'CORRIGIDO: exclusão de item de lista agora avisa se faltar permissão (antes falhava em silêncio)',
      'CORRIGIDO: cadastro de corretor/cliente com tratamento de erro robusto (não trava mais o botão sem feedback)',
      'Label "Gerentes House" não corta mais na barra de listas',
    ],
  },
  {
    version: '1.1.2',
    date: '17/06/2026',
    changes: [
      'NOVO: Corretor agora é lista suspensa filtrada pela imobiliária — cadastro na hora (nome obrigatório, telefone e e-mail opcionais), vinculado automaticamente à imobiliária selecionada',
      'NOVO: Cliente abre cadastro de lead (nome + telefone/e-mail opcionais); avisa se o telefone/e-mail já existe e permite reaproveitar o cadastro',
      'Atividades agora guardam o vínculo com o cadastro de cliente e corretor (base para retornos futuros)',
    ],
  },
  {
    version: '1.1.1',
    date: '17/06/2026',
    changes: [
      'CORRIGIDO: rejeitar/aprovar solicitação de exclusão agora funciona sempre (antes falhava silenciosamente para Superintendente/Gestor Regional)',
      'CORRIGIDO: Histórico agora aparece para Superintendente e Gestor Regional, com a equipe do escopo deles (estado/cidade)',
      'NOVO: Empreendimentos podem aparecer em cidades adicionais — campo "Aparece também em" nas Listas (ex.: empreendimento de Itapoá vendido em Curitiba)',
    ],
  },
  {
    version: '1.1.0',
    date: '21/05/2026',
    changes: [
      'NOVO PERFIL: "Recepção Rottas" — Gerentes de Produto e Recepcionistas',
      '  → Acessa SOMENTE a atividade Visitas. Não vê check-ins/atendimentos/propostas/agenda',
      '  → Bottom nav exclusivo: Visitas + Perfil',
      'NOVA ATIVIDADE: tipo "visita" — campos: Nome, Local da Visita, Empreendimento,',
      '  Período (Manhã/Tarde/Noite), Forma (Espontânea/Agendado), Canal (House/Imob),',
      '  Gerente House (se House), Corretor (se House), Imobiliária (se Imob), Observações',
      '  → Localização e Data automáticas (geo + now no submit)',
      '  → Lógica condicional: Espontânea não exige canal; Agendado exige canal e detalhes',
      'IMPORTAÇÃO EM MASSA via XLSX:',
      '  → Download de modelo .xlsx (abas Dados + Instruções)',
      '  → Validação atomicamente — qualquer linha inválida rejeita o arquivo INTEIRO',
      '  → Relatório de erros por linha+coluna+motivo',
      '  → Limite 5.000 linhas, sanitização anti CSV/formula injection',
      '  → Localização derivada do dispositivo do uploader (ignora coluna no arquivo)',
      '  → Auditoria em visitas_imports (quem, quando, quantos, geo)',
      'NOVA LISTA MESTRA: "Gerentes House" — administrável em Listas (Master/Gestor)',
      'DASHBOARD: nova sidebar "Visitas (Recepção)" visível APENAS para Master',
      '  → KPIs: total, Espontâneas, Agendados, House, Imob, empreendimentos distintos',
      '  → Bars de distribuição (Período · Forma) + tabela detalhada',
      'Atividades visita NÃO aparecem em Painel/Histórico/Início/Dashboard normal',
      '  (defesa em profundidade no client + policies RLS dedicadas no banco)',
      'Migration v19: gerentes_house + visitas_imports + colunas atividades + RLS policies',
      '  *** APLICAR MANUALMENTE no Supabase SQL Editor ***',
    ],
  },
  {
    version: '1.0.6',
    date: '19/05/2026',
    changes: [
      'Botão Dashboard agora aparece no header para TODOS os roles (não só admin)',
      'Cada role vê o dashboard com escopo aplicado: Gerente vê próprios dados + supervisores, etc',
      'Sync calendário: corrigido para usar outlook.office.com (corporativo Microsoft 365)',
      '  em vez de outlook.live.com (pessoal Hotmail) — funcionava antes só pra email pessoal',
      'Sync calendário: dropdown agora separa "Corporativo (Microsoft 365)" de "Outras opções"',
      'Sync calendário: toast explicativo após clique — lembra de clicar SALVAR na aba aberta',
    ],
  },
  {
    version: '1.0.5',
    date: '19/05/2026',
    changes: [
      'Alerta de "imobiliárias sem visita" agora respeita HIERARQUIA de visibilidade:',
      '  → Master/Gestor: todas as imobiliárias',
      '  → Superintendente: apenas imobiliárias nos seus estados_acesso',
      '  → Gestor Regional: apenas imobiliárias nas suas cidades_acesso',
      '  → Gerente/Supervisor: apenas imobiliárias da sua cidade',
      'Atividades consideradas no alerta agora incluem subordinados:',
      '  → Gerente vê visitas dele + dos supervisores subordinados',
      'Form de check-in/atendimento/proposta/órulo: listas suspensas de imobiliárias',
      '  e empreendimentos agora filtradas por escopo (não mostra opções fora da região)',
      'Novos helpers em supabase.js: getScopedImobiliarias(), getScopedEmpreendimentos(),',
      '  getScopedGerenteIds() — reutilizáveis em qualquer view',
      'Gemini Chat: adiciona modelos 2.5-* no fallback (lançados Set/2025) + cache do modelo',
      '  descoberto via Testar pra evitar 404 nas próximas perguntas',
    ],
  },
  {
    version: '1.0.4',
    date: '19/05/2026',
    changes: [
      'Dashboard reestruturado em 5 páginas: Visão Geral · Check-ins · Atendimentos · Propostas & Vendas · Curvas & Funil · Rankings',
      'Visão Geral: ticker rolando com últimas vendas no topo (R$ + gerente + empreendimento + cliente)',
      'Visão Geral: feed de últimos 30 registros com tipo, gerente e tempo relativo',
      'Visão Geral: Top 5 inline (clique para drill-down)',
      'Check-ins: tabs por motivo de visita (Atendimento/Plantão/Ativação/Treinamento etc) + tabela detalhada',
      'Atendimentos: KPIs (clientes únicos, corretores, conversão) + tabela cliente/corretor/imob',
      'Propostas & Vendas: 3 tabs (Todas/Pendentes/Vendas) + ticket médio + tabela com status',
      'Rankings: clique em qualquer linha aplica filtro DRILL-DOWN e volta pra Visão Geral',
      'Drill-down pills no topbar mostram filtros ativos com ✕ pra remover',
      'Sidebar com badges mostrando contagem por categoria',
      'Chat IA: erro 429 (cota Gemini esgotada) agora exibe mensagem amigável com alternativas',
    ],
  },
  {
    version: '1.0.3',
    date: '19/05/2026',
    changes: [
      'SEGURANÇA: hierarquia rígida em /usuarios — cada nível só edita quem está abaixo: Master > {Gestor, Superintendente, Gestor Regional} > Gerente > Supervisor',
      'Gestor Regional não vê mais usuários Master/Gestor/Superintendente na lista',
      'Dashboard: acesso liberado para TODOS os roles, mas com filtragem automática por perfil',
      'Dashboard: Superintendente vê apenas dados nos seus estados_acesso',
      'Dashboard: Gestor Regional vê apenas dados nas suas cidades_acesso',
      'Dashboard: Gerente vê apenas seus dados + supervisores subordinados',
      'Dashboard: Supervisor vê apenas seus próprios dados (filtro travado)',
      'Dashboard: sidebar agora navega entre páginas (uma por vez) em vez de scroll',
      'Dashboard: Chat IA virou painel flutuante (FAB) — visível em todas as páginas',
      'Dashboard: Histórico de atualizações virou chip clicável "Última atualização: HH:MM" no topbar',
      'Dashboard: clicar em snapshot do histórico restaura os KPIs daquele momento (modo somente leitura)',
      'Dashboard: chave Gemini agora é COMPARTILHADA via tabela app_settings (migration v18 — Master cadastra uma vez, todos admins usam)',
    ],
  },
  {
    version: '1.0.2',
    date: '19/05/2026',
    changes: [
      'Botão "Dashboard" no header do app — atalho para a página /dashboard (apenas Master/Gestor/Superintendente/Gestor Regional)',
      'Botão fica ao lado do toggle Master/Gerente com destaque laranja gradient',
    ],
  },
  {
    version: '1.0.1',
    date: '19/05/2026',
    changes: [
      'NOVO: Dashboard Analítico STANDALONE em /dashboard (página separada, não fica dentro do app)',
      'Dashboard exclusivo para gerência e diretoria (master, gestor, superintendente, gestor_regional)',
      'Sessão compartilhada com o app — quem está logado no app entra direto no dashboard',
      '6 KPIs: VGV Vendas, VGV Propostas, Conv. Atend→Prop, Conv. Prop→Venda, Pace Visitas, Pace Propostas',
      'Curva temporal Chart.js (visitas, atendimentos, propostas sobrepostas) + funil ECharts (Visitas → Atendimentos → Propostas → Vendas)',
      '5 abas de Ranking: Gerente, Regional (PR/SC), Cidade, Empreendimento, Imobiliária',
      'Filtros globais persistidos: Período (Hoje/7d/30d/90d/12m/Tudo), Estado, Cidade dinâmica, Empreendimento, Imobiliária, Gerente',
      'Pace semafórico: verde ≥100% · amarelo 80-100% · vermelho <80% vs período anterior proporcional',
      'Histórico: 20 últimos snapshots em dashboard_snapshots (trigger mantém últimos 100)',
      'Chat IA Gemini 2.0 Flash (gratuito) — analisa KPIs e sugere ações, rate limit 20/hora',
      'Tema claro/escuro próprio + sidebar fixa desktop + hamburger mobile',
    ],
  },
  {
    version: '0.9.4',
    date: '16/05/2026',
    changes: [
      'PERFORMANCE: RLS Postgres reescritas com funções STABLE/SECURITY DEFINER cacheadas (10x mais rápido)',
      'PERFORMANCE: loadLists reduziu de 7 para 5 queries em paralelo, só colunas necessárias',
      'PERFORMANCE: signIn não duplica mais loadProfile/loadLists (suprime listener durante login)',
      'Indexes adicionados em atividades.gerente_id, agendamentos.gerente_id, profiles.role',
      'Login: fallback robusto - se navigate falhar em 300ms, força reload pra liberar de cache zumbi',
    ],
  },
  {
    version: '0.9.3',
    date: '16/05/2026',
    changes: [
      'BUG FIX: Gestor Regional - cidades de acesso agora salvam corretamente (Londrina, etc)',
      'Check-in TREINAMENTO: campos Local + Quantidade + Imobiliárias agora são obrigatórios',
      'Imobiliárias participantes: campo de busca pra filtrar a lista (ordenadas com marcadas no topo)',
      'Órulo → renomeado para "Órulo/DWV" em todo o app (cards, KPIs, filtros, agenda)',
      'Atividade Órulo/DWV: novo campo obrigatório "Plataforma" (Órulo PR ou DWV SC) no início do form',
      'Login simplificado: tela de pré-escolha (Gestor/Gerente) removida - vai direto pro login',
      'Toggle de visão no header continua disponível pra admins alternarem entre visão própria e Gerente',
      'Supervisor agora tem aba Agenda - vê os agendamentos que o Gerente atribuiu',
      'Gerente vê na própria agenda os agendamentos dos seus supervisores (chip 👁️ Nome)',
      'Hierarquia RLS: Gestor Regional vê tudo das cidades dele, Superintendente vê tudo dos estados dele',
      'Gestor Regional / Superintendente podem editar perfis dos subordinados (RLS valida)',
    ],
  },
  {
    version: '0.9.2',
    date: '16/05/2026',
    changes: [
      'Órulo e DWV unificados como um único tipo "Órulo/DWV" (uma plataforma conceitual, motivos compartilhados)',
      'Lista "Motivos DWV" removida (motivos foram migrados para Motivos Órulo/DWV automaticamente)',
      'Cidades de acesso (Gestor Regional) agora vêm dinâmicas dos empreendimentos cadastrados - sem necessidade de cadastro separado',
      'Aba "Cidades" removida de Listas (deixou de ser necessária)',
      'Imobiliárias agora têm cidade e estado obrigatórios no cadastro',
      'Nome de imobiliária sempre em UPPERCASE - você digita como quiser, o sistema normaliza',
      'Ao cadastrar nova imobiliária durante check-in (gerente/supervisor), abre modal pedindo cidade+estado',
    ],
  },
  {
    version: '0.9.1',
    date: '12/05/2026',
    changes: [
      'Empreendimentos agora podem ser linkados a uma cidade (e o estado é preenchido automaticamente)',
      'Importar Empreendimentos aceita formato CSV: "Nome;Cidade" (separadores ; , ou TAB)',
      'Importar Cidades aceita formato CSV: "Nome;PR" ou "Nome;SC"',
      'Importar de listas usa upsert em lote (~10x mais rápido, era sequencial)',
      'Bottom nav respeita 100% o toggle de visão (Gerente = visão de campo, sem itens admin)',
      'Toggle de visão expandido para todos roles admin (master, gestor, superintendente, gestor_regional)',
    ],
  },
  {
    version: '0.9.0',
    date: '12/05/2026',
    changes: [
      'NOVA HIERARQUIA: 6 perfis - Supervisor → Gerente → Gestor Regional → Superintendente → Gestor → Master',
      'Superintendente: visão multi-estado (PR e/ou SC selecionáveis)',
      'Gestor Regional: visão multi-cidade (lista cadastrável em Listas → Cidades)',
      'Supervisor de Plataforma: subordinado a um Gerente (campo no cadastro), sem aba Agenda',
      'Captação por estado: PR usa Órulo, SC usa DWV (escolhido automaticamente)',
      'Check-in com motivo "Treinamento" abre campos: Local, Quantidade de pessoas, Imobiliárias participantes (multi-select)',
      'WORKFLOW DE APROVAÇÃO DE PROPOSTAS: pendente → Regional → Superintendente → Master, com possibilidade de escalar ou rejeitar',
      'Histórico completo de aprovação visível em cada proposta',
      'Cadastro de Empreendimento agora aceita link de produto (campo opcional)',
      'Sincronização de Agenda: botão "Sync calendário" baixa .ics OU abre Google Calendar/Outlook pré-preenchidos',
      'Listas: nova aba Cidades + Motivos DWV',
      'BUG FIX: Importar lista agora processa item-a-item (não falha o batch inteiro por causa de 1 duplicado)',
      'Sistema de backup automático: 10 versões anteriores ficam em .backups/ dentro do projeto',
    ],
  },
  {
    version: '0.8.9',
    date: '12/05/2026',
    changes: [
      'Fix DEFINITIVO loop de definir senha: trigger no banco marca primeiro_acesso=false automaticamente quando o usuário troca a senha',
      'Reset manual aplicado em todos os users que já tinham logado e estavam presos no loop',
    ],
  },
  {
    version: '0.8.8',
    date: '08/05/2026',
    changes: [
      'Link de convite/redefinição agora dura 2 horas (era 1h) - mais tempo para o usuário usar',
      'Templates de email atualizados com novo prazo de expiração',
    ],
  },
  {
    version: '0.8.7',
    date: '08/05/2026',
    changes: [
      'Fix: loop infinito ao definir primeira senha - update de primeiro_acesso=false agora é bloqueante (await) antes do signOut',
      'Reenviar convite agora funciona pra qualquer usuário (incluindo outros masters), exceto o master principal',
    ],
  },
  {
    version: '0.8.6',
    date: '07/05/2026',
    changes: [
      'Estados disponíveis no app limitados a PR e SC (únicas praças com operação atualmente)',
    ],
  },
  {
    version: '0.8.5',
    date: '07/05/2026',
    changes: [
      'Após definir senha, usuário é direcionado pra tela de login (em vez de logar direto)',
      'Painel: nova aba "Imobiliárias" com resumo (check-ins, atendimentos, propostas, vendas, VGV) por imobiliária',
      'Painel: alerta laranja em imobiliárias sem visita há mais de 7 dias',
      'Painel: novo filtro "Todas imobiliárias" - filtra atividades por imobiliária específica',
      'Painel Ranking: agora inclui ranking de imobiliárias mais visitadas e maior VGV',
      'Início do Gerente: alerta no topo listando imobiliárias suas sem visita há 1 semana+',
      'Listas: botão "Importar lista" - cole texto OU envie .txt/.csv pra cadastrar em massa (ignora duplicados automaticamente)',
    ],
  },
  {
    version: '0.8.4',
    date: '07/05/2026',
    changes: [
      'Service Worker implementado: app sempre carrega versao fresh do servidor (network-first)',
      'Fim do problema de cache em PWA Android - updates automaticos sem precisar reinstalar',
      'Funciona offline: se sem internet, app abre da ultima versao em cache',
      'Auto-update: quando deploy nova versao, app reload automatico em background',
      'Banner de atualizacao indicando nova versao disponivel',
    ],
  },
  {
    version: '0.8.3',
    date: '07/05/2026',
    changes: [
      'Foto opcional no Check-in (não precisa mais anexar foto obrigatoriamente)',
      'Botão + da agenda agora flutua FORA da célula - não sobrepoe mais o número do dia em telas pequenas',
      'Painel: VGV mostra apenas valor abreviado (R$ X,X mi) sem repetir o valor cheio embaixo',
      'Cache de JS desativado (no-cache) - mudanças refletem imediatamente sem precisar limpar cache',
      'Timeout de submit aumentado para 60s (cobertura de redes 3G/4G corporativas)',
      'Edge Function de convite/reconvite preserva senha antiga + envio via Brevo SMTP',
      'Master pode criar outros masters (master principal protegido contra exclusão)',
    ],
  },
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

export const APP_NAME = 'Imob Rottas';
export const MASTER_EMAIL = 'gabriel.galvao@rottasconstrutora.com.br';

// Bucket de storage para fotos
export const PHOTO_BUCKET = 'fotos';
export const MAX_PHOTOS_PER_ACTIVITY = 3;

// Estados brasileiros (UF)
// Estados ativos da Rottas (apenas praças com operação no momento)
export const ESTADOS_BR = ['PR', 'SC'];

export const TERMOMETRO_OPTIONS = [
  { value: 'quente', label: 'Quente', color: 'red',    icon: '🔥' },
  { value: 'morno',  label: 'Morno',  color: 'yellow', icon: '🌤️' },
  { value: 'frio',   label: 'Frio',   color: 'blue',   icon: '❄️' },
];

// Órulo (PR) e DWV (SC) são a mesma coisa conceitualmente - plataformas de captação.
// Salvamos sempre tipo='orulo' no banco. A UI mostra "Órulo/DWV" pra clareza visual.
// Visita: atividade exclusiva do perfil Recepção Rottas — NÃO visível pros demais.
export const TIPO_ATIVIDADE = {
  checkin:      { label: 'Check-in',    icon: '📍', color: 'blue'   },
  atendimento:  { label: 'Atendimento', icon: '👥', color: 'purple' },
  proposta:     { label: 'Proposta',    icon: '📄', color: 'yellow' },
  orulo:        { label: 'Órulo/DWV',   icon: '🌐', color: 'green'  },
  visita:       { label: 'Visita',      icon: '🚪', color: 'pink'   },
};

// Tipos visíveis para os perfis OPERACIONAIS (gerente, supervisor, gestor regional,
// superintendente, gestor). Excluímos 'visita' que é exclusiva de Recepção Rottas + Master.
export const TIPOS_VISIVEIS_OPERACIONAIS = ['checkin', 'atendimento', 'proposta', 'orulo'];

// Períodos e formas de atendimento da Visita
export const VISITA_PERIODOS = ['Manhã', 'Tarde', 'Noite'];
export const VISITA_FORMAS   = ['Espontânea', 'Agendado'];
export const VISITA_CANAIS   = ['House', 'Imob'];

// Tipo de captação - sempre 'orulo' agora (DWV é o mesmo registro, apenas label visual)
export function getTipoCaptacao(_estado) {
  return 'orulo';
}

// Hierarquia de roles (do mais baixo ao mais alto)
// supervisor -> gerente -> gestor_regional -> superintendente -> gestor -> master
// recepcao_rottas: role FORA da hierarquia operacional — função isolada de recepção
//                  (Gerentes de Produto e Recepcionistas) que SÓ registra Visitas.
export const ROLES = {
  recepcao_rottas:  { label: 'Recepção Rottas',          icon: '🛎️', color: 'pink',   level: 1 },
  supervisor:       { label: 'Supervisor de Plataforma', icon: '👁️', color: 'blue',   level: 1 },
  gerente:          { label: 'Gerente de Plataforma',    icon: '🗺️', color: 'blue',   level: 2 },
  gestor_regional:  { label: 'Gestor Regional',          icon: '🌆', color: 'purple', level: 3 },
  superintendente:  { label: 'Superintendente',          icon: '🏛️', color: 'orange', level: 4 },
  gestor:           { label: 'Gestor',                   icon: '📊', color: 'orange', level: 5 },
  master:           { label: 'Master',                   icon: '👑', color: 'orange', level: 6 },
};

// Workflow de aprovação de propostas (escalation chain)
// pendente -> aprovada_regional -> (escalada) -> aprovada_super -> (escalada) -> aprovada_master
export const PROPOSTA_STATUS = {
  pendente:           { label: 'Aguardando aprovação',  color: 'yellow', icon: '⏳' },
  aprovada_regional:  { label: 'Aprovada (Regional)',   color: 'blue',   icon: '✓'  },
  aprovada_super:     { label: 'Aprovada (Superint.)',  color: 'purple', icon: '✓✓' },
  aprovada_master:    { label: 'Aprovada (Master)',     color: 'green',  icon: '🏆' },
  rejeitada:          { label: 'Rejeitada',             color: 'red',    icon: '✕'  },
};

// Próximo nível de escalation a partir do status atual
export const NEXT_APPROVER = {
  pendente:          'gestor_regional',
  aprovada_regional: 'superintendente',
  aprovada_super:    'master',
};

// Permissões disponíveis para Gestores (Master pode marcar/desmarcar)
export const PERMISSOES = [
  { key: 'gerenciar_usuarios',   label: 'Gerenciar usuários',         desc: 'Criar, editar e desativar usuários abaixo na hierarquia' },
  { key: 'gerenciar_listas',     label: 'Gerenciar listas',           desc: 'Adicionar/editar imobiliárias, empreendimentos, motivos' },
  { key: 'editar_atividades',    label: 'Editar atividades',          desc: 'Editar atividades de qualquer usuário (não só as próprias)' },
  { key: 'excluir_atividades',   label: 'Excluir atividades',         desc: 'Remover atividades do histórico' },
  { key: 'exportar_dados',       label: 'Exportar dados',             desc: 'Baixar relatórios em Excel e PNG' },
];
