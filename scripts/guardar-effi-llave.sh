#!/bin/zsh
# Guarda en .env, sin mostrarla, la API key de Effi de una tienda de la Torre (EFFI_<SLUG>_API_KEY) y la agrega a
# EFFI_ACCOUNTS si falta. Después: node --env-file=.env scripts/push-effi-keys.mjs (la sube cifrada al Vault).
#   scripts/guardar-effi-llave.sh AUNCLIC_GT
cd "$(dirname "$0")/.." || exit 1
slug=${(U)1//[^A-Za-z0-9_]/}
[[ -z "$slug" ]] && { echo "Uso: scripts/guardar-effi-llave.sh SLUG (p. ej. AUNCLIC_GT)"; exit 1; }
var="EFFI_${slug}_API_KEY"
read -s "t?Llave de Effi para ${slug} (no se ve al escribir): "
echo
t="${t//[[:space:]]/}"
[[ -z "$t" ]] && { echo "No se pegó nada; no se guardó."; exit 1; }
# Si quedó pegada varias veces seguidas, deja una sola copia.
p=${t:0:8}; rest=${t:8}; i=${rest[(i)$p]}
(( i <= ${#rest} )) && t=${t:0:$((i+7))}
grep -v "^${var}=" .env > .env.tmp && mv .env.tmp .env && chmod 600 .env
printf '\n%s=%s\n' "$var" "$t" >> .env
if ! grep -q "^EFFI_ACCOUNTS=.*\b${slug}\b" .env; then
  sed -i '' "s/^EFFI_ACCOUNTS=\(.*\)$/EFFI_ACCOUNTS=\1,${slug}/" .env
fi
echo "✓ Guardada en .env como ${var} (${#t} caracteres)"
