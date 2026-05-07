# Instruções permanentes - Projeto Rottas

## Regra de ouro: Claude é o EXECUTOR

O usuário (Gabriel Galvão) é o **orquestrador**. Claude é o **executor**.
Toda alteração de código deve seguir o ciclo COMPLETO automaticamente, sem precisar pedir:

1. **Editar** o(s) arquivo(s) no working dir local: `C:/Users/gabriel.galvao/OneDrive - Rottas Construtora e Incorporadora/Área de Trabalho/APP/`
2. **Sincronizar** para o repo deploy: `/tmp/rottas-fix/APP/` (clone limpo do GitHub)
3. **Commitar** com mensagem descritiva (versão + o que mudou)
4. **Push** pra `origin/main` no GitHub
5. **Vercel auto-deploy dispara** (~30-60s após o push)
6. **Bumpar APP_VERSION** em `js/config.js` + entrada no CHANGELOG

NUNCA deixar o usuário ter que pedir "agora sobe pro GitHub" ou "faz o deploy". Se editou código, já sobe.

## Estrutura do GitHub (CRÍTICO)

```
github.com/gandradesg/rottas-app/
├── README.md
└── APP/                    ← Vercel deploya DAQUI (root directory = "APP")
    ├── assets/
    ├── css/
    ├── js/
    ├── index.html
    ├── manifest.webmanifest
    └── ...
```

**Vercel está configurado pra deployar a partir da pasta `APP/`** dentro do repo.
Se commitar arquivos na raiz do repo (fora de APP/), o deploy NÃO pega - vira lixo.

O working dir local é `C:/.../Área de Trabalho/APP/`, mas o `.git` dele está bagunçado
(commita na raiz). Usar sempre o clone em `/tmp/rottas-fix/` como área de deploy:
após editar local, copiar pra `/tmp/rottas-fix/APP/`, commitar lá, push de lá.

## Comandos prontos para o ciclo de deploy

```bash
SRC="C:/Users/gabriel.galvao/OneDrive - Rottas Construtora e Incorporadora/Área de Trabalho/APP"
DST="/tmp/rottas-fix/APP"

# 1. Garantir clone atualizado
[ ! -d /tmp/rottas-fix ] && git clone https://github.com/gandradesg/rottas-app.git /tmp/rottas-fix
cd /tmp/rottas-fix && git pull origin main

# 2. Sincronizar (preserva .git)
cp -r "$SRC"/assets "$SRC"/css "$SRC"/js "$SRC"/index.html "$SRC"/manifest.webmanifest "$SRC"/vercel.json "$SRC"/supabase_*.sql "$DST"/

# 3. Commit + push
cd /tmp/rottas-fix
git add -A
git -c user.email=gabriel.galvao@rottasconstrutora.com.br -c user.name="Gabriel Galvao" commit -m "vX.Y.Z: descrição"
git push origin main
```

## Credenciais e tokens em uso

- **Supabase project ref**: `lmzjlirzexyopnjxohez`
- **Supabase Management PAT**: armazenado fora do repo (sessão Claude)
- **Master email**: `gabriel.galvao@rottasconstrutora.com.br`
- **GitHub repo**: `https://github.com/gandradesg/rottas-app`

**NUNCA commitar tokens, PATs, API keys ou senhas neste repo.** GitHub secret scanning bloqueia o push.

## Princípios de UX

- Tudo em português brasileiro
- Logo oficial Rottas (NUNCA criar SVG customizado tipo "diamante laranja")
- Manter fluxo aditivo - não quebrar funcionalidade existente
- Versão sempre bump + entrada no CHANGELOG visível na tela "Sobre"
