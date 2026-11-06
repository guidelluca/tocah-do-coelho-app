#!/usr/bin/env bash
# Gera docs/claude/CODIGO-FONTE-COMPLETO.md com todo o código-fonte versionado (sem dist, locks e binários).
set -euo pipefail
cd "$(dirname "$0")/.."

OUT="docs/claude/CODIGO-FONTE-COMPLETO.md"
mkdir -p "$(dirname "$OUT")"

{
  echo "# Código-fonte completo — Tocah"
  echo
  echo "Gerado em $(date '+%Y-%m-%d %H:%M') a partir do commit \`$(git rev-parse --short HEAD)\`."
  echo
  git ls-files \
    | grep -Ev '^(dist/|docs/claude/)' \
    | grep -Ev '(package-lock\.json|\.png|\.jpg|\.jpeg|\.gif|\.ico)$' \
    | while read -r f; do
        [ -s "$f" ] || continue
        case "$f" in
          *.js|*.cjs) lang=javascript ;;
          *.json) lang=json ;;
          *.yml|*.yaml) lang=yaml ;;
          *.sh) lang=bash ;;
          *) lang=text ;;
        esac
        echo "## \`$f\`"
        echo
        echo "\`\`\`$lang"
        cat "$f"
        echo
        echo "\`\`\`"
        echo
      done
} > "$OUT"

echo "OK: $OUT ($(wc -l < "$OUT") linhas)"
