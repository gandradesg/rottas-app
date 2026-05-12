#!/bin/bash
# backup.sh - Snapshot do projeto antes de releases.
# Uso: bash backup.sh [tag]      ex: bash backup.sh v0.9.0
# Mantem os 10 backups mais recentes (apaga antigos).
set -e
SRC="$(cd "$(dirname "$0")" && pwd)"
BKP="$SRC/.backups"
mkdir -p "$BKP"
TAG="${1:-snapshot}"
STAMP="$(date +%Y%m%d-%H%M%S)-$TAG"
DST="$BKP/$STAMP"
mkdir -p "$DST"

# Copia arquivos relevantes (preserva estrutura, ignora .git/node_modules/.backups)
cp -r "$SRC"/js "$SRC"/assets "$SRC"/css "$SRC"/index.html "$SRC"/manifest.webmanifest \
      "$SRC"/vercel.json "$SRC"/sw.js "$SRC"/CLAUDE.md \
      "$SRC"/supabase_*.sql "$SRC"/supabase_function_*.ts \
      "$DST"/ 2>/dev/null || true
[ -d "$SRC/dashboard" ] && cp -r "$SRC/dashboard" "$DST"/ 2>/dev/null || true

echo "[backup] criado em: $DST ($(du -sh "$DST" | cut -f1))"

# Mantem so os 10 mais recentes
cd "$BKP"
ls -1t | tail -n +11 | xargs -r rm -rf
echo "[backup] backups ativos:"
ls -1t "$BKP" | head -10 | sed 's/^/  - /'
