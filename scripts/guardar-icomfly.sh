#!/bin/zsh
# Agrega al .env el token de API de icomfly (empieza por ik_live_) de una tienda de A un clic, sin mostrarlo.
#   scripts/guardar-icomfly.sh hn   → ICOMFLY_TOKEN_HN  (tienda de Honduras)
#   scripts/guardar-icomfly.sh sv   → ICOMFLY_TOKEN_SV  (tienda de El Salvador)
# Se genera en icomfly, dentro de cada tienda: Configuración → Conexiones → «Conecta tu API» → Generar token.
# Luego: node --env-file=.env scripts/push-icomfly.mjs (lo prueba contra icomfly y lo sube cifrado al Vault).
cd "$(dirname "$0")/.." || exit 1
p=${(L)1}
[[ "$p" != "hn" && "$p" != "sv" ]] && { echo "Uso: scripts/guardar-icomfly.sh hn   (o sv)"; exit 1; }
var="ICOMFLY_TOKEN_${(U)p}"
read -s "t?Token de icomfly de ${(U)p} (empieza por ik_live_; no se ve al escribir): "
echo
t="${t//[[:space:]]/}"
[[ -z "$t" ]] && { echo "No se pegó nada; no se guardó."; exit 1; }
# Si se copió con algo antes (comillas, "Token:", etc.), empieza donde dice ik_live_; quita comillas del final.
[[ "$t" == *ik_live_* && "$t" != ik_live_* ]] && t="ik_live_${t#*ik_live_}"
t="${t%%[\"\'\`]*}"
if [[ "$t" != ik_live_* ]]; then
  echo "Lo pegado no tiene un token ik_live_ (${#t} caracteres, empieza por «${t:0:3}…»). No se guardó."
  echo "Vuelve a icomfly, toca el botón de copiar junto al token nuevo y corre de nuevo este comando."
  exit 1
fi
# Si quedó pegado varias veces seguidas, deja una sola copia.
rest=${t:8}; i=${rest[(i)ik_live_]}
(( i <= ${#rest} )) && t=${t:0:$((i+7))}
[[ "$t" != ik_live_* ]] && { echo "Ese token no empieza por ik_live_; no se guardó."; exit 1; }
grep -v "^${var}=" .env > .env.tmp && mv .env.tmp .env && chmod 600 .env
printf '\n%s=%s\n' "$var" "$t" >> .env
echo "✓ Guardado en .env como ${var} (${#t} caracteres)"
echo "  Ahora: node --env-file=.env scripts/push-icomfly.mjs"
