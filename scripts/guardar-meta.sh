#!/bin/zsh
# Agrega META_ACCESS_TOKEN (token del usuario del sistema de Meta, solo lectura de anuncios) al .env sin mostrarlo.
cd "$(dirname "$0")/.." || exit 1
read -s "t?Token de Meta (no se ve al escribir): "
echo
[[ -z "$t" ]] && { echo "No se pegó nada; no se guardó."; exit 1; }
grep -v '^META_ACCESS_TOKEN=' .env > .env.tmp && mv .env.tmp .env && chmod 600 .env
printf '\nMETA_ACCESS_TOKEN=%s\n' "${t// /}" >> .env
echo "✓ Guardado en .env (${#t} caracteres)"
