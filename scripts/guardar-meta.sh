#!/bin/zsh
# Agrega al .env el token de Meta (usuario del sistema de un portafolio, solo lectura de anuncios) sin mostrarlo.
# Un token por portafolio, cada uno con su nombre:
#   scripts/guardar-meta.sh            → META_ACCESS_TOKEN          (Compras FACIL)
#   scripts/guardar-meta.sh joaquin    → META_ACCESS_TOKEN_JOAQUIN  (otro portafolio)
# Luego: node --env-file=.env scripts/push-meta.mjs (los sube todos al Vault).
cd "$(dirname "$0")/.." || exit 1
n=${(U)1//[^a-zA-Z0-9]/}
var="META_ACCESS_TOKEN${n:+_$n}"
read -s "t?Token de Meta para ${var} (no se ve al escribir): "
echo
t="${t//[[:space:]]/}"
[[ -z "$t" ]] && { echo "No se pegó nada; no se guardó."; exit 1; }
# Si quedó pegado varias veces seguidas, deja una sola copia.
p=${t:0:8}; rest=${t:8}; i=${rest[(i)$p]}
(( i <= ${#rest} )) && t=${t:0:$((i+7))}
grep -v "^${var}=" .env > .env.tmp && mv .env.tmp .env && chmod 600 .env
printf '\n%s=%s\n' "$var" "$t" >> .env
echo "✓ Guardado en .env como ${var} (${#t} caracteres)"
