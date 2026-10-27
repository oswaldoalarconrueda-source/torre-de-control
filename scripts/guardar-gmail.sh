#!/bin/zsh
# Agrega GMAIL_USER y GMAIL_APP_PASSWORD al .env sin mostrar la clave en pantalla.
cd "$(dirname "$0")/.." || exit 1
read "u?Correo de Gmail: "
read -s "p?Contraseña de aplicación (no se ve al escribir): "
echo
[[ -z "$u" || -z "$p" ]] && { echo "Faltó el correo o la clave; no se guardó nada."; exit 1; }
printf '\nGMAIL_USER=%s\nGMAIL_APP_PASSWORD=%s\n' "$u" "${p// /}" >> .env
echo "✓ Guardado en .env"
