# Rottas — Plataforma de Gerentes

Aplicativo de controle de atividades dos Gerentes de Plataforma (imobiliárias) da Rottas Construtora e Incorporadora.

## Stack

- **Frontend:** HTML + Vanilla JS (ES Modules) + Tailwind CSS (CDN)
- **Backend:** Supabase (Postgres + Auth + Storage)
- **Hospedagem:** Vercel (estático)
- **Sem build step** — basta servir os arquivos estáticos.

## Funcionalidades

### Visão Gerente de Plataforma
- Home com KPIs do dia (check-ins, atendimentos, propostas, vendas)
- Feed de atividades de hoje
- Registro de 4 tipos de atividade:
  - **Check-in** — geolocalização, imobiliária, motivo, fotos (até 3)
  - **Atendimento** — local, produto, imobiliária, corretor, cliente, termômetro
  - **Proposta** — empreendimento, unidade, valor, reserva (editável depois)
  - **Órulo** — corretor, imobiliária, empreendimento, motivo
- Histórico filtrável + busca + exportação Excel
- Gravação de áudio com transcrição (Whisper, opcional)

### Visão Gestor (Master)
- Painel consolidado com KPIs, VGV, equipe ativa
- Dashboard por gerente / por empreendimento
- Ranking (propostas, atendimentos, VGV)
- Feed ao vivo
- Filtros: período, gerente, empreendimento, estado
- Exportação Excel + PNG

### Master (Gabriel)
- Cadastro/edição de gerentes (envia email de convite com link para definir senha)
- Gerenciamento das listas: imobiliárias, empreendimentos, motivos de visita, motivos Órulo

## Setup

### 1. Banco de dados (Supabase)
Rode o arquivo `supabase_schema.sql` no SQL Editor do projeto Supabase.

### 2. Deploy no Vercel
```bash
# Opção A: via GitHub
# 1. Suba esta pasta para um repo no GitHub
# 2. Em vercel.com → Add New → Project → importe o repo
# 3. Framework Preset: Other
# 4. Build Command: deixe em branco
# 5. Output Directory: deixe em branco (raiz)
# 6. Deploy

# Opção B: via Vercel CLI (em outra máquina com Node)
npm i -g vercel
vercel
```

A configuração já está em `vercel.json` (rewrites para SPA, headers de segurança, permissões geo/mic/camera).

### 3. Primeiro acesso
- Email: `gabriel.galvao@rottasconstrutora.com.br`
- O Supabase já tem o usuário criado. No primeiro login:
  1. Use a senha temporária definida ao criar no Supabase
  2. Vá em **Perfil → Senha** e defina sua senha definitiva

## Estrutura

```
APP/
├── index.html              # entry HTML
├── manifest.webmanifest    # PWA
├── vercel.json             # config Vercel
├── supabase_schema.sql     # schema do banco
├── assets/                 # logos e ícones SVG
├── css/styles.css          # variáveis de tema + estilos
└── js/
    ├── main.js             # entry, rotas, boot
    ├── config.js
    ├── supabase.js         # cliente + estado global
    ├── auth.js
    ├── theme.js
    ├── router.js
    ├── geo.js
    ├── storage.js          # upload de fotos
    ├── exports.js          # excel/png
    ├── ui.js               # helpers de DOM, toast, modal, ícones
    ├── tailwind-config.js  # config Tailwind no browser
    ├── components/         # form-fields, audio-field
    └── views/              # uma view por rota
```

## Notas técnicas

- **Tailwind via CDN**: produção tem ~300KB de overhead, mas zero build. Para otimizar futuramente, gerar CSS compilado.
- **Persistência de sessão**: localStorage (Supabase JS).
- **Fotos**: comprimidas a 1600px / JPEG 80% antes do upload.
- **Áudio**: gravação via MediaRecorder, transcrição via OpenAI Whisper (chave configurada por usuário em Perfil, salva apenas no dispositivo).
- **RLS**: já configurado — gerentes só veem suas atividades, master vê tudo.

## Customizações futuras

- [ ] Notificações push (PWA)
- [ ] Modo offline (Service Worker + sync)
- [ ] Dashboards mais ricos (Chart.js)
- [ ] Filtros salvos / favoritos
- [ ] Compartilhamento de relatórios via link público
