// Configuração da aplicação
export const APP_VERSION = '1.9.33';
export const APP_BUILD_DATE = '2026-07-10';

// Histórico curado: uma entrada por dia, só com as mudanças relevantes.
// (O detalhe técnico de cada micro-versão fica no Git; aqui é a visão de produto.)
export const CHANGELOG = [
  {
    version: '1.9.33',
    date: '10/07/2026',
    changes: [
      'CONFIABILIDADE: cadastro de cliente não perde mais o lead por "Tempo esgotado" — agora reenvia sozinho em conexão instável e NUNCA duplica (id gerado no aparelho). Tempo-limite aumentado para 15s',
      'AGENDA: o app só confirma "Agendado!" depois de verificar que o agendamento realmente entrou no servidor — acaba o "deu certo mas não apareceu na agenda"',
    ],
  },
  {
    version: '1.9.30',
    date: '10/07/2026',
    changes: [
      'LOCALIZAÇÃO mais simples: em "Editar Localização" ficou só a busca por endereço + o botão "Buscar no Maps" (pesquisa a imobiliária no Google Maps; é só copiar o endereço e colar na busca). Removido o campo de colar coordenadas',
    ],
  },
  {
    version: '1.9.29',
    date: '04/07/2026',
    changes: [
      'LOCALIZAÇÃO manual agora integra o Google Maps: botão "Abrir no Google Maps para buscar" (acha a imobiliária pelo nome) + campo para colar o link/coordenadas de lá — o app converte na localização. A busca por endereço/cidade continua também',
    ],
  },
  {
    version: '1.9.28',
    date: '04/07/2026',
    changes: [
      'LOCALIZAÇÃO editável: continua capturando automática, mas agora dá para "Corrigir/editar localização" pesquisando a imobiliária/endereço (útil quando não deu pra registrar no local). O registro fica marcado com "✏️ Localização editada manualmente"',
    ],
  },
  {
    version: '1.9.27',
    date: '04/07/2026',
    changes: [
      'CADASTROS não travam mais em "Salvando...": imobiliária, corretor, gerente da imobiliária e cliente têm tempo-limite + repetição automática. Se a rede falhar, o botão volta e dá pra tentar de novo SEM perder o que foi digitado',
      'FOTOS no celular: agora dá para escolher entre CÂMERA e GALERIA (antes só abria a câmera)',
    ],
  },
  {
    version: '1.9.26',
    date: '04/07/2026',
    changes: [
      'INÍCIO: indicadores reorganizados — "Outros" e "Check-ins" dividem um mesmo quadrante (metade cada); Atendimentos, Propostas e Reservas ocupam os outros quadrantes',
    ],
  },
  {
    version: '1.9.24',
    date: '04/07/2026',
    changes: [
      'CORRIGIDO: erro ao registrar "Outro" (o banco não aceitava esse tipo) — agora registra normalmente',
      'REGISTRO à prova de conexão ruim para todos os tipos (atendimento, proposta, Órulo, Outro): salva com repetição automática, sem travar carregando nem duplicar',
      'A lista de "Tipos de Outro" agora aparece em Listas (dá pra gerenciar), não duplica mais e já inclui os tipos dos Outros que já estavam agendados',
    ],
  },
  {
    version: '1.9.23',
    date: '04/07/2026',
    changes: [
      'NOVO: "Outros" virou um indicador próprio (aparece antes de Check-ins na home e no painel) — conta separado, sem se misturar com check-in',
      'Ao agendar/realizar um "Outro", o campo Título virou uma LISTA (Treinamento, Evento, Reunião...) que os gerentes podem ampliar cadastrando novos tipos — padroniza os registros',
    ],
  },
  {
    version: '1.9.22',
    date: '04/07/2026',
    changes: [
      'AGENDAR à prova de conexão ruim: criar agendamento agora salva com repetição automática — se a rede travar (iOS suspende a conexão), tenta de novo sem duplicar, em vez de "ficar carregando e não ir"',
      'TESTE não consome mais numeração real (não fura os #números dos registros reais) e não conta em nada fora da própria conta de teste. Novo botão "🧹 Limpar teste" (Master, em Usuários) apaga os dados de teste quando quiser',
      'UI: botões da agenda mais compactos (Sync/Editar/Cancelar em ícones) para caberem na mesma linha; topo do iPhone corrigido',
      'ESTABILIDADE: quando a agenda não carrega (conexão suspensa pelo iOS após deixar o app parado), agora há o botão "Recarregar app" que reinicia a conexão e resolve — o "Tentar de novo" sozinho nem sempre bastava',
      'AGENDA: agendamento "Outro" agora é realizado como um check-in leve — sem exigir imobiliária; o título (ex.: "Treinamento de produto") vira a descrição. Conta como check-in',
      'CHECK-IN à prova de conexão ruim: registro salvo com repetição automática — se a resposta não voltar (iOS suspende ao usar a câmera, ou 3G/4G instável), o app tenta de novo sozinho sem duplicar e sem perder o check-in',
      'NOVO: contas de TESTE — o Master pode marcar um usuário como "conta de teste" (no editor de Usuários). Tudo que essa conta registra fica de fora dos contadores e relatórios gerais (Painel/Histórico da equipe). As contas Gabriel Gerente e Gabriel Supervisor já vêm marcadas',
      'HISTÓRICO: filtro extra conforme o tipo — Atendimentos por temperatura do cliente (Quente/Morno/Frio); Check-ins pelo tipo do check-in (motivo da visita)',
      'INÍCIO e PAINEL: os quadros de Check-ins, Atendimentos, Propostas, Reservas e Órulo/DWV agora são clicáveis — abrem o Histórico já filtrado por aquele tipo (no mesmo período). Vale para gerente e para as visões de gestão (Superintendente, Master, etc.)',
      'AGENDA: botão de cancelar agendamento em vermelho, mostrando "Cancelar" ao passar o mouse; o botão de editar mostra "Editar" ao passar o mouse',
      'NOVO: agenda compartilhada — ao agendar, marque todos os gerentes presentes (ex.: mesma imobiliária). Gera um único check-in, que conta no contador de cada presente sem duplicar o total da empresa',
      'Localização deixou de ser obrigatória em check-in/atendimento: onde há GPS continua automática; onde o dispositivo não permite, dá para registrar mesmo assim',
      'Escopo por praça reforçado: cada Superintendente só vê e edita usuários e agendas do(s) seu(s) estado(s); o Gestor Regional, só das suas cidades',
      'Painel de Imobiliárias ordenado pelas com mais atendimentos; Carteira filtra pelas imobiliárias da praça do gerente (com busca livre para outras)',
      'Cancelamento de agendamento com motivo livre e botão "Ditar" (voz → texto)',
      'ESTABILIDADE: fim das telas travadas no carregamento e do uso de versão desatualizada em cache — o app sempre carrega a versão mais recente e consistente',
    ],
  },
  {
    version: '1.9.2',
    date: '03/07/2026',
    changes: [
      'NOVO: cidade com preenchimento automático (lista oficial IBGE de PR e SC) e UF automática, em todos os cadastros',
      'NOVO: agenda compartilhada entre gerentes/supervisores da mesma cidade, com filtro "Ver agenda de" colegas da praça',
      'Motivos de visita e de contato viraram listas abertas — o gerente cadastra um novo na hora',
      'Master/admin na visão Gerente pode inspecionar e testar a agenda de qualquer gerente',
    ],
  },
  {
    version: '1.7.0',
    date: '02/07/2026',
    changes: [
      'NOVO: painel de Performance na Agenda — agendadas, % concluídas, canceladas e remarcadas, acompanhando o período (dia/semana/mês)',
      'NOVO: atendimentos adicionais dentro de um atendimento (registro complementar do mesmo cliente, fora do funil)',
      '"Gerente da imobiliária" deixou de ser obrigatório; edições de baixo impacto (termômetro, observações, reserva) passam a valer sem aprovação',
      'Cores padronizadas por tipo de atividade e KPI "Visitas" renomeado para "Atendimentos"',
      'Corrigido: envio do convite de usuário e o loop da tela "Defina sua senha"',
    ],
  },
  {
    version: '1.4.9',
    date: '18/06/2026',
    changes: [
      'NOVO: gerente pode editar qualquer campo da própria atividade — a alteração vai para aprovação do gestor (com antes → depois na aba Aprovações)',
      'NOVO: aba 🎯 Carteira — define por gerente/mês as imobiliárias a visitar (o alerta de "sem visita" passa a considerar só essas)',
      'NOVO: proposta vinculada ao atendimento e reserva livre (sem aprovação); "Venda" passou a se chamar "Reserva"',
      'Histórico de alterações e central de auditoria (edições e exclusões) para gestão',
      'Privacidade: lista de clientes só para admin; diversas correções de estabilidade',
    ],
  },
  {
    version: '1.2.2',
    date: '17/06/2026',
    changes: [
      'NOVO: telefone inteligente (bandeira e formato por país) e sugestão de domínio de e-mail',
      'NOVO: Corretor e Cliente com cadastro na hora, vinculados à imobiliária, com aviso de duplicado',
      'NOVO: Sugestões de melhoria no Perfil — qualquer usuário registra ideias e o Master acompanha',
      'NOVO: busca dinâmica no Painel e nas Listas; gestão de corretores e clientes direto nas Listas',
    ],
  },
  {
    version: '1.1.0',
    date: '21/05/2026',
    changes: [
      'NOVO PERFIL: Recepção Rottas — registra somente Visitas, isolado dos demais módulos',
      'NOVA ATIVIDADE: Visita, com importação em massa por planilha (XLSX) e auditoria',
    ],
  },
  {
    version: '1.0.6',
    date: '19/05/2026',
    changes: [
      'NOVO: Dashboard Analítico (VGV, conversões, curvas, funil e rankings), com escopo automático por perfil',
      'Hierarquia rígida na gestão de usuários e sincronização de calendário corporativo (Microsoft 365)',
    ],
  },
  {
    version: '0.9.4',
    date: '16/05/2026',
    changes: [
      'Órulo e DWV unificados; imobiliárias com cidade/estado obrigatórios (nome sempre em maiúsculas)',
      'Supervisor passou a ter aba Agenda; visibilidade por estado (Superintendente) e cidade (Gestor Regional)',
      'Performance: regras de acesso e carregamento bem mais rápidos',
    ],
  },
  {
    version: '0.9.0',
    date: '12/05/2026',
    changes: [
      'NOVA HIERARQUIA: 6 perfis — Supervisor → Gerente → Gestor Regional → Superintendente → Gestor → Master',
      'Superintendente multi-estado, Gestor Regional multi-cidade e workflow de aprovação de propostas',
      'Correção definitiva do loop de "definir senha"',
    ],
  },
  {
    version: '0.8.6',
    date: '07/05/2026',
    changes: [
      'NOVO: app sempre carrega a versão mais recente (atualização automática) e funciona offline',
      'Convites por e-mail com template correto e logo Rottas; Master pode criar outros masters',
      'Painel: aba Imobiliárias com alerta de "sem visita há 7+ dias" e importação de listas em massa',
      'Foto opcional no check-in; estados limitados a PR e SC',
    ],
  },
  {
    version: '0.8.0',
    date: '06/05/2026',
    changes: [
      'Ícone e splash do PWA com a logo oficial Rottas; e-mails compatíveis com Outlook corporativo',
    ],
  },
  {
    version: '0.7.7',
    date: '05/05/2026',
    changes: [
      'NOVO: Agenda como tela inicial — calendário dia/semana/mês e "Realizar" a atividade direto da agenda',
      'Listas de imobiliárias e locais de visita separadas; ditado por voz nas observações; sync de calendário',
      'Ícones do PWA para iOS e Android',
    ],
  },
  {
    version: '0.6.0',
    date: '03/05/2026',
    changes: [
      'NOVO: módulo de Agenda (planejamento de visitas e atendimentos) com visão consolidada da equipe',
      'Numeração sequencial automática por tipo, funil de vendas visual e mini-mapa no registro',
    ],
  },
  {
    version: '0.5.0',
    date: '02/05/2026',
    changes: [
      'Sistema de aprovação de exclusão e permissões granulares para gestores',
      'Papel Gestor separado do Master, transcrição de áudio por voz e tela "Sobre"',
    ],
  },
  {
    version: '0.1.0',
    date: '01/05/2026',
    changes: [
      'Primeira versão: Check-in, Atendimento, Proposta e Órulo com geolocalização e fotos',
      'Painel do Gestor com dashboards, ranking e filtros; cadastro de usuários e listas; tema claro/escuro',
    ],
  },
];

// Histórico técnico detalhado (todas as micro-versões) — não exibido na tela "Sobre",
// mantido só para referência interna.
const _CHANGELOG_DETALHADO = [
  {
    version: '1.9.11',
    date: '04/07/2026',
    changes: [
      'Texto do campo Localização ajustado: "Capturada automaticamente. Ative a localização do seu dispositivo."',
    ],
  },
  {
    version: '1.9.10',
    date: '04/07/2026',
    changes: [
      'LOCALIZAÇÃO opcional: em check-in e atendimento, se o dispositivo não conseguir ativar o GPS (comum em alguns PCs), agora é possível registrar mesmo assim — o app confirma e salva sem localização, em vez de travar o cadastro. Onde o GPS funciona, continua capturando automaticamente',
    ],
  },
  {
    version: '1.9.9',
    date: '04/07/2026',
    changes: [
      'ESTABILIDADE: fim do "estado misto" de versões (index antigo + código novo) que travava a tela — o app agora detecta versão nova e se atualiza sozinho (limpa cache, troca o service worker e recarrega uma vez)',
      'AGENDA: consultas iniciais com tempo-limite de 8s — se a rede pendurar, a tela carrega mesmo assim em vez de ficar no "carregando"',
    ],
  },
  {
    version: '1.9.8',
    date: '04/07/2026',
    changes: [
      'AGENDA: "Gerentes presentes" virou lista suspensa (dropdown) — mais limpo, sem poluir a tela',
      'ATIVIDADE: quando é compartilhada por vários gerentes, a tela de detalhe mostra os "Gerentes presentes" (conta 1x no total da empresa e 1x no contador de cada presente)',
    ],
  },
  {
    version: '1.9.7',
    date: '04/07/2026',
    changes: [
      'NOVO: agenda com vários gerentes presentes — ao agendar, marque todos os que estarão juntos (ex.: mesma imobiliária). Cria uma agenda para cada um, e ao realizar gera UM único check-in que conta no contador de todos, sem inflar o total da empresa (evita registro duplicado)',
      'ESTABILIDADE: tela travada "carregando pra sempre" — toda requisição agora tem tempo-limite (aborta em 45s em vez de pendurar), e as consultas iniciais da agenda são à prova de falha de rede',
    ],
  },
  {
    version: '1.9.6',
    date: '04/07/2026',
    changes: [
      'CORRIGIDO: Superintendente conseguia ver e EDITAR usuários de outro estado (ex.: PR editando gerente de SC). Agora cada Superintendente gerencia só os usuários do(s) seu(s) estado(s), e o Gestor Regional só das suas cidades — na lista de Usuários e na regra do banco',
    ],
  },
  {
    version: '1.9.5',
    date: '04/07/2026',
    changes: [
      'CORRIGIDO: Superintendente via agendamentos de gerentes de outro estado (ex.: PR via SC). A regra do banco tinha uma brecha que liberava tudo para admins — agora o Superintendente vê só o(s) estado(s) dele e o Gestor Regional só as cidades dele (atividades já respeitavam)',
      'PAINEL: o indicador "Equipe ativa" agora conta gerentes que registraram algo sobre o total de gerentes VISÍVEIS ao seu escopo (antes usava o total geral, dando ex.: 1 de 5 sem sentido)',
    ],
  },
  {
    version: '1.9.4',
    date: '04/07/2026',
    changes: [
      'PAINEL: a aba Imobiliárias agora lista sempre as com MAIS atendimentos primeiro (empate por propostas e VGV)',
      'CARTEIRA: ao escolher o gerente, a lista mostra por padrão só as imobiliárias da cidade (praça) dele. Pesquisando pelo nome, é possível incluir imobiliárias de qualquer outra regional',
      'AGENDA: ao cancelar um agendamento agora há um campo livre de motivo — com botão "Ditar" (voz → texto) para escrever mais rápido',
      'PADRONIZAÇÃO: "Local da visita" passa a ser salvo em MAIÚSCULAS (os já cadastrados foram uniformizados)',
    ],
  },
  {
    version: '1.9.3',
    date: '04/07/2026',
    changes: [
      'CORRIGIDO: corretor digitado sem cadastro (ex.: vindo do agendamento) não aparecia na lista de corretores da imobiliária. Agora, ao salvar, o corretor é cadastrado automaticamente e vinculado à imobiliária (e os que já existiam foram regularizados)',
      'AGENDA: o filtro "Ver agenda de" respeita o escopo — Superintendente vê só gerentes do seu estado, Gestor Regional das suas cidades, Master conforme o estado designado (ou todos)',
      'ESTABILIDADE: tela de carregamento não fica mais presa pra sempre — a agenda tem "tentar de novo" se a rede travar, e o app oferece "Recarregar" se o carregamento inicial demorar demais',
    ],
  },
  {
    version: '1.9.2',
    date: '03/07/2026',
    changes: [
      'CORRIGIDO: Master/admin na visão Gerente agora abre a agenda já mostrando TUDO de todos por padrão (antes vinha vazia, mostrando só a própria). Continua podendo filtrar por um gerente específico',
    ],
  },
  {
    version: '1.9.1',
    date: '03/07/2026',
    changes: [
      'NOVO: na visão Gerente do Master/admin, o filtro "Ver agenda de" lista TODOS os gerentes — dá pra inspecionar e testar a agenda de qualquer um. O admin também pode agir (realizar/editar/cancelar) nessas agendas; gerente comum continua só visualizando a de colegas',
    ],
  },
  {
    version: '1.9.0',
    date: '03/07/2026',
    changes: [
      'NOVO: cidade agora tem autocomplete com a lista oficial de municípios (IBGE) de PR e SC — e o Estado (UF) é preenchido automaticamente ao escolher a cidade',
      'Aplicado em todos os cadastros com cidade/estado: nova imobiliária (no registro e nas Listas), empreendimentos, usuários e perfil. Ainda é possível digitar uma cidade fora da lista',
    ],
  },
  {
    version: '1.8.2',
    date: '03/07/2026',
    changes: [
      'NOVO: agenda compartilhada — ao agendar, gerentes e supervisores da MESMA cidade podem marcar atividade um para o outro. O supervisor também pode agendar para o gerente superior dele',
      'No formulário de agendamento, o campo "Responsável" agora lista você + os gerentes/supervisores da sua cidade',
    ],
  },
  {
    version: '1.8.1',
    date: '03/07/2026',
    changes: [
      'LIMPEZA: removida a tabela "cidades" (legado, sem uso) e o código órfão que a referenciava. As cidades continuam vindo dinamicamente dos empreendimentos cadastrados',
    ],
  },
  {
    version: '1.8.0',
    date: '03/07/2026',
    changes: [
      'NOVO: "Motivo da visita" (check-in) e "Motivo do contato" (Órulo/DWV) viraram listas abertas — o gerente pode digitar um motivo novo na hora, que fica salvo pra irmos mapeando as necessidades de campo. Padroniza a primeira letra em maiúscula',
      'MUDANÇA: o motivo só pode ser digitado/escolhido no primeiro cadastro. Ao editar depois, o gerente não altera (fica travado); admin ainda pode ajustar',
      'NOVO: supervisor e gerente ligados agora enxergam a agenda um do outro',
      'NOVO: na "Minha agenda", filtro "Ver agenda de" para visualizar (somente leitura) a agenda de outro gerente da mesma praça (cidade) — útil para parcerias',
    ],
  },
  {
    version: '1.7.0',
    date: '02/07/2026',
    changes: [
      'MUDANÇA: campo "Gerente da imobiliária" deixou de ser obrigatório no atendimento, proposta e Órulo/DWV — preencha só se tiver',
      'NOVO: dentro de um atendimento dá para registrar "atendimentos adicionais" do mesmo cliente (2ª visita, outro local etc). Ficam dentro do próprio registro e NÃO contam no funil — é só um registro complementar',
      'MELHORADO: na edição pelo gerente, alterações de baixo impacto (termômetro, observações e reserva) passam a valer na hora, sem precisar de aprovação. Os demais campos seguem indo para aprovação do gestor',
    ],
  },
  {
    version: '1.6.3',
    date: '02/07/2026',
    changes: [
      'AJUSTE VISUAL: no painel de performance, "Remarcadas" voltou a ser um card lateral (com a quantidade em destaque e o % embaixo), separado dos outros três por um divisor vertical',
    ],
  },
  {
    version: '1.6.2',
    date: '02/07/2026',
    changes: [
      'MELHORADO: no painel de performance, "Remarcadas" saiu do grupo dos 100% e virou um indicador separado (quantidade + % do total) abaixo de um divisor. Assim não confunde mais com Pendentes/Concluídas/Canceladas, que continuam somando 100%',
    ],
  },
  {
    version: '1.6.1',
    date: '02/07/2026',
    changes: [
      'MELHORADO: o painel de performance agora acompanha o modo do calendário — no Dia mostra a performance do dia, na Semana a da semana e no Mês a do mês inteiro',
      'MELHORADO: o card antes chamado "Agendadas" virou "Pendentes" e mostra a % que ainda não aconteceu. Agora Pendentes + Concluídas + Canceladas fecham 100% (o total aparece no título do painel). Remarcadas segue como indicador à parte',
    ],
  },
  {
    version: '1.6.0',
    date: '02/07/2026',
    changes: [
      'NOVO: painel "Performance da semana" no topo da Agenda (do gerente e da equipe) — mostra Agendadas, % Concluídas, % Canceladas e % Remarcadas da semana atual',
      'NOVO: ao editar um agendamento e mudar a data/hora, ele é sinalizado como "Remarcada" (com contador de quantas vezes) — um chip aparece no card e entra no indicador de remarcação',
    ],
  },
  {
    version: '1.5.4',
    date: '02/07/2026',
    changes: [
      'AJUSTE: cores padronizadas por tipo de atividade — no funil (Painel e Histórico) o Atendimento passou de laranja para roxo, a mesma cor usada nos KPIs e etiquetas. Agora cada tipo tem uma cor única: Check-in azul, Atendimento roxo, Proposta amarelo, Reserva verde',
    ],
  },
  {
    version: '1.5.3',
    date: '02/07/2026',
    changes: [
      'AJUSTE: no feed de atividades da home do gerente, a etiqueta do atendimento aparecia como "Visita" — agora aparece como "Atendimento"',
    ],
  },
  {
    version: '1.5.2',
    date: '02/07/2026',
    changes: [
      'AJUSTE: o KPI "Visitas" (que na verdade conta atendimentos) foi renomeado para "Atendimentos" na home do gerente, no funil do Painel e no funil do Histórico. As Visitas da Recepção Rottas continuam iguais',
    ],
  },
  {
    version: '1.5.1',
    date: '02/07/2026',
    changes: [
      'CORRIGIDO: app abria sempre na tela "Defina sua senha" para quem já tinha senha. Agora, quem entra com senha tem esse status corrigido automaticamente (nunca mais fica preso nessa tela)',
    ],
  },
  {
    version: '1.5.0',
    date: '02/07/2026',
    changes: [
      'CORRIGIDO: convite de usuário não enviava (dizia "convidando" mas não criava o usuário nem o e-mail). A URL da função estava sendo montada errada e caía na própria página; agora usa o endereço correto do servidor',
      'Proteção extra: se a função de convite não responder de verdade, o app avisa erro em vez de fingir sucesso',
      'Convite/exclusão de usuário e limite de e-mails ajustados para o onboarding',
    ],
  },
  {
    version: '1.4.9',
    date: '18/06/2026',
    changes: [
      'CORRIGIDO: gerente voltou a conseguir cadastrar cliente (a privacidade da v1.4.8 estava bloqueando o cadastro por engano). Agora cadastra normalmente e continua sem poder listar a base',
    ],
  },
  {
    version: '1.4.8',
    date: '18/06/2026',
    changes: [
      'PRIVACIDADE: lista de clientes deixa de ser visível para usuários comuns (só admin). O aviso de cliente já cadastrado ao registrar continua funcionando. Corretor e Gerente da imobiliária seguem visíveis',
      'SEGURANÇA: importação de visitas agora escapa o conteúdo do arquivo (proteção contra código malicioso na planilha)',
      'CORRIGIDO: cores/bordas que sumiam por uso incorreto de variáveis de tema (importação de visitas, excluir usuário, botão + da agenda)',
      'iPhone: barra inferior respeita a área segura (não fica mais sob a barra de gestos)',
      'Acessibilidade: rótulos ligados aos campos, foco visível no teclado, descrições em ícones/filtros; segurança extra de cabeçalhos (anti-clickjacking)',
    ],
  },
  {
    version: '1.4.7',
    date: '18/06/2026',
    changes: [
      'Agenda: a lista de imobiliárias agora respeita a regional do usuário (só dá pra agendar em imobiliárias do seu escopo, igual ao registro de atividade)',
      'Aviso de contato incompleto explica como incluir (clicando no nome do corretor/cliente)',
    ],
  },
  {
    version: '1.4.6',
    date: '18/06/2026',
    changes: [
      'NOVO: agendamento de Atendimento agora tem campo próprio de Imobiliária (ordem: Data → Gerente → Local da visita → Imobiliária → Corretor → Cliente → Observações). Imobiliária não puxa mais do "Local da visita"',
      'MUDANÇA: campo "Título/descrição" no agendamento só aparece no tipo "Outro" (não em Check-in nem Atendimento)',
      'NOVO: ao salvar atendimento/proposta, avisa se o corretor/cliente está sem telefone/e-mail — com opção de incluir agora ou continuar',
      'CONFIABILIDADE: cache do app agora é versionado por release — cada atualização limpa a versão anterior, evitando o app abrir com versão velha/misturada',
    ],
  },
  {
    version: '1.4.5',
    date: '18/06/2026',
    changes: [
      'CORRIGIDO: app travando ao salvar/seguir (cadastro de cliente, aviso de duplicado, telas paradas). Era um travamento na trava de sessão do Supabase — agora à prova de deadlock',
      'Terminologia "Reservas" aplicada também na home do gerente (card e etiqueta "Reservada") e no menu de registro',
      'Removido o texto explicativo da janela de reserva',
    ],
  },
  {
    version: '1.4.4',
    date: '18/06/2026',
    changes: [
      'Terminologia: "Venda #N" virou "Reserva #N" no detalhe da atividade e na exportação (coluna "Nº Reserva")',
    ],
  },
  {
    version: '1.4.3',
    date: '18/06/2026',
    changes: [
      'MUDANÇA: proposta NÃO passa mais por aprovação — só edição e exclusão precisam de aprovação. Removido o "Aguardando aprovação" da proposta',
      'NOVO: botão "Informar reserva" na proposta — livre e direto (sem aprovação). Ao informar, a proposta fica "Reservada"',
      'NOVO: o vínculo mostra "Gerada a partir do atendimento #N"',
      'NOVO: cadastro de Gerente da imobiliária avisa se o telefone/e-mail já existe (igual corretor/cliente)',
    ],
  },
  {
    version: '1.4.2',
    date: '18/06/2026',
    changes: [
      'CORRIGIDO: Superintendente e Gestor Regional editam atividades direto (sem cair na regra de aprovação). Aprovação de edição fica só para gerente/supervisor',
    ],
  },
  {
    version: '1.4.1',
    date: '18/06/2026',
    changes: [
      'Carteira: a lista de imobiliárias agora respeita o escopo do usuário (Superintendente vê só os estados que controla)',
      'Carteira: botão "Nova" para cadastrar uma imobiliária na hora e já incluí-la na carteira do gerente',
    ],
  },
  {
    version: '1.4.0',
    date: '18/06/2026',
    changes: [
      'NOVO: campo obrigatório "Gerente da imobiliária" no atendimento/proposta/órulo (cadastro inline igual ao corretor)',
      'NOVO: dentro de um atendimento dá pra criar uma proposta vinculada a ele (e ver as propostas geradas)',
      'MUDANÇA: a reserva da proposta é livre — gerente/supervisor preenche direto, sem aprovação. Aprovação fica só para edição e exclusão. "Venda" passou a se chamar "Reserva" no painel',
      'NOVO: Superintendente pode criar atividades na agenda dos gerentes do seu time',
      'NOVO: aba 🎯 Carteira — define por gerente/mês as imobiliárias a visitar; o alerta de "sem visita" passa a considerar só essas',
    ],
  },
  {
    version: '1.3.2',
    date: '18/06/2026',
    changes: [
      'CORRIGIDO: aviso de cliente duplicado (telefone/e-mail já cadastrado) voltou a funcionar — agora compara só os dígitos, independe do formato do telefone',
      'NOVO: ao cadastrar corretor, avisa se o telefone/e-mail já existe em outra imobiliária e pede confirmação antes de duplicar (ex.: corretor que mudou de imobiliária)',
    ],
  },
  {
    version: '1.3.1',
    date: '18/06/2026',
    changes: [
      'CORRIGIDO: app não abria após a v1.3.0 (função de auditoria faltando quebrava o carregamento). Tudo normalizado.',
    ],
  },
  {
    version: '1.3.0',
    date: '18/06/2026',
    changes: [
      'NOVO: gerente agora pode editar qualquer campo da própria atividade — a alteração vai para aprovação do gestor (os dados só mudam depois de aprovada)',
      'NOVO: aba Aprovações (Painel) lista edições e exclusões pendentes, mostrando o antes → depois de cada mudança',
      'NOVO: histórico de alterações dentro de cada atividade (quem editou o quê e quando) para Master e gestores',
      'NOVO: central de auditoria no Perfil do Master — todas as edições e exclusões registradas',
      'MUDANÇA: excluir atividade agora preserva ela no histórico de exclusões (não some mais de vez)',
    ],
  },
  {
    version: '1.2.2',
    date: '17/06/2026',
    changes: [
      'NOVO: busca dinâmica no Painel do Gestor (filtra todas as abas: visão geral, aprovações, gerentes, empreendimentos, imobiliárias, ranking e feed)',
      'NOVO: busca dinâmica nas Listas (filtra os itens de qualquer aba enquanto você digita)',
    ],
  },
  {
    version: '1.2.1',
    date: '17/06/2026',
    changes: [
      'NOVO: o Master agora altera o status de cada sugestão (Nova → Em andamento → Concluída → Não acatada) direto no Perfil',
      'NOVO: botão "Ditar" no campo de sugestões (voz → texto), igual ao das observações',
    ],
  },
  {
    version: '1.2.0',
    date: '17/06/2026',
    changes: [
      'NOVO: campo de Sugestões de melhoria no Perfil — qualquer usuário pode registrar ideias para o app e acompanhar as que enviou',
      'NOVO: o Master vê todas as sugestões da equipe no Perfil (consulta de insights), com autor, perfil e data',
    ],
  },
  {
    version: '1.1.9',
    date: '17/06/2026',
    changes: [
      'NOVO: sugestões de e-mail agora incluem os domínios da Rottas (@rottasconstrutora.com.br e @rottasvendas.com.br) no topo da lista',
    ],
  },
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
  outro:        { label: 'Outro',       icon: '📅', color: 'gray'   },
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
