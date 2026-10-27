#!/bin/zsh
# Guarda en .env, sin mostrarla, una llave de Effi de prueba aparte de la que usa la Torre. Sirve para probar otra
# llave (p. ej. Ecuador con perfil principal) sin reemplazar la que está andando:
#   scripts/guardar-effi-prueba.sh            → EFFI_TIENDA_EC_PRINCIPAL_API_KEY
cd "$(dirname "$0")/.." || exit 1
var="EFFI_TIENDA_EC_PRINCIPAL_API_KEY"
read -s "t?Llave de Effi para ${var} (no se ve al escribir): "
echo
t="${t//[[:space:]]/}"
[[ -z "$t" ]] && { echo "No se pegó nada; no se guardó."; exit 1; }
# Si quedó pegada varias veces seguidas, deja una sola copia.
p=${t:0:8}; rest=${t:8}; i=${rest[(i)$p]}
(( i <= ${#rest} )) && t=${t:0:$((i+7))}
grep -v "^${var}=" .env > .env.tmp && mv .env.tmp .env && chmod 600 .env
printf '\n%s=%s\n' "$var" "$t" >> .env
echo "✓ Guardada en .env como ${var} (${#t} caracteres)"
