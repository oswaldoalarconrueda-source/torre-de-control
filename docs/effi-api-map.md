# Mapa de la API de Effi → Torre de Control

Fuente: la documentación oficial que se ve con sesión iniciada en Effi (cuenta NATURALFITT CO), extraída el 2026-10-23.

| Archivo | Contenido |
|---|---|
| `docs/effi/api-referencia.md` | Parámetros, campos y ejemplos de los 21 endpoints que usamos |
| `docs/effi/api-endpoints.json` | Los 342 endpoints de la API |
| `docs/effi/webhooks.md` | Avisos automáticos |
| `docs/effi/mcp-conector-manual.txt` | Servidor MCP (para IA; **no** lo usa el sync) |

## Decisiones que cambian frente al plan
1. **Se usa la API REST, no MCP.**
   - Effi tiene una API REST formal: `https://effi.com.co/api/...`.
   - El MCP queda solo para que una IA (Claude, ChatGPT) consulte.
2. **La autenticación es con API key, no con OAuth.**
   - Cada request lleva `Authorization: Bearer <API_KEY_EFFI>`.
   - La API key es de un **usuario** de Effi: Administración → Usuarios → Ver más detalles.
   - Dura **360 días**. Al renovarla, la anterior deja de funcionar de inmediato.
   - Se necesita **una API key por empresa Effi**: 4 tiendas y 4 proveedurías, 8 en total.
   - Recomendado: crear en cada empresa un usuario "API Torre de Control" con perfil **solo consulta** y usar su key.
   - Las keys se guardan cifradas en Supabase Vault.
   - El tablero alerta 30 días antes de que venza cada una.
3. **Tiempo real por webhooks:** Effi hace POST firmado (HMAC-SHA256) a nuestra URL en cada evento.
   - El sync programado queda como red de seguridad y para la carga histórica.

## Límites que condicionan el sync
- **Rate limit:** 120 req/min por API key. Si se pasa, responde 429 con `Retry-After`.
- **Paginación:** `pagina` y `por_pagina` (máximo 100). La respuesta trae `paginacion.total_paginas`.
- **Rangos de fecha:**
  - `hist_est_guia_transporte` y `movimiento_dinero_effi` exigen fecha desde y aceptan **31 días máximo** por consulta. El backfill va mes a mes.
  - `guia_transporte` sin `desde` solo devuelve las guías desde ayer: **siempre enviar `desde` y `hasta`**.
  - `orden_v` sin parámetros solo devuelve el mes actual.
  - `novedad_guia_transporte` sin filtros solo devuelve los últimos 5 días y por defecto solo `t_novedad=2`.
- **Llave de cualquier documento:** `empresa + sucursal + id`, porque el `id` se repite entre sucursales.
- **Fechas:** `fecha_trans` viene en **UTC**. Los filtros `desde` y `hasta` se interpretan en la zona horaria de la empresa.
- **Agregados:** `agrupar_por` en `guia_transporte` devuelve totales por transportadora, estado, ciudad, día o mes sin paginar. Sirve para los KPIs rápidos y para cuadrar contra el detalle.

## Endpoint → tabla
| Endpoint (GET) | Tabla | Llave | Notas |
|---|---|---|---|
| `api/orden_v` | `orders` | empresa+sucursal+id | `est_orden_v`/`estado` explican por qué la orden no avanzó. `id_remision_v`/`id_factura_v` la enlazan con la venta. |
| `api/est_orden_v_empresa` | `order_states` | empresa+id | Estados propios de cada empresa (p. ej. "Confirmación exitosa" / "Confirmación rechazada"). |
| `api/remision_v`, `api/factura_v` | `sales` | empresa+sucursal+id | Trae `guia`/`id_guia_transporte`, datos de dropshipping (`empresa_proveedor`, `empresa_distribuidor`), `pdte_cobro` y `devolucion`. |
| `api/guia_transporte` | `guides` | empresa+sucursal+id; número `guia` | Estado global Effi (`est_guia_efficommerce`), `valor_recaudo`, `valor_flete`, transportadora Effi, fechas (`fecha_estado_final`), marcas de liquidación y datos de dropshipping. |
| `api/hist_est_guia_transporte` | `guide_status_events` | empresa+sucursal+id+`fecha_hist_est`+estado | **Cada fila es un cambio de estado.** Es el dato más importante. |
| `api/novedad_guia_transporte` | `novedades` | empresa+id | Enviar `t_novedad` explícito para traer todos los tipos. `est_novedad`, `cant_gestion`, `fecha_solucion`. |
| `api/gestion_novedad_guia_transporte` | `novedad_gestiones` | — | Soluciones y gestiones de cada novedad. |
| `api/movimiento_dinero_effi` | `wallet_movements` | empresa+id | `t_movimiento`/`tipo_movimiento`, `valor`, `divisa`, **`guia_inicial`/`guia_adicional`** (une el dinero con la guía), `fecha_origen`, `movimiento_dinero_effi_reversion`. |
| `api/solicitud_retiro_cuenta_effi`, `api/transferencia_cuenta_effi` | `wallet_withdrawals` | empresa+id | Caja, fuera del PyG. |
| `api/est_guia_efficommerce` | `guide_states` | id | Tabla global de 9 estados (1 Generada, 2 En tránsito, 3 Novedad, 4 Entregada, 5 Devolución…). Trae `estado_final`. |
| `api/transportadora_efficommerce` | `carriers` | id | Global. |
| `api/cliente`, `api/articulo`, `api/centro_costos`, `api/sucursal` | catálogos | empresa+id | Para nombres y filtros. |

**Proveeduría:** con la key de la proveeduría, `guia_transporte` y `remision_v` incluyen las guías de los distribuidores donde la empresa es proveedor dropshipping. `dropshipping_proveedor=1` las aísla. El **cliente de la proveeduría** es `empresa_distribuidor`/`nombre_empresa_distribuidor` (en guías: `empresa`/`nombre_empresa`).

## Webhooks a registrar (uno por evento, todos a `/api/effi/webhook`)
| Evento Effi | Efecto |
|---|---|
| Cambio de estado de Guía de transporte | Inserta en `guide_status_events`, actualiza `guides` y empuja al feed en vivo |
| Creación / Modificación / Anulación de Guía de transporte | Upsert de `guides` |
| Creación de Novedad de guía / Solución de Novedad | Upsert de `novedades` |
| Creación / Anulación de Movimiento de wallet | Upsert de `wallet_movements` |
| Creación / Modificación / Anulación / Cambio de estado de Orden de venta | Upsert de `orders` |
| Creación / Modificación / Anulación de Remisión de venta y de Factura de venta | Upsert de `sales` |

**Verificación del webhook:**
- Validar `X-Effi-Signature` (`sha256=` + HMAC del cuerpo con el secreto del webhook).
- Usar `X-Effi-Delivery` como llave de idempotencia.
- Responder 2xx en menos de 5 s: se encola y se procesa aparte.

**Si el webhook falla:**
- Effi reintenta 12 veces durante unos 3 días y después lo marca como **Inactivo**.
- Los eventos ocurridos mientras está inactivo no se recuperan por webhook. Por eso el sync programado por API sigue siendo obligatorio.

## Confirmado con datos reales (NATURALFITT CO, 2026-10-23)
- **`valor` de `movimiento_dinero_effi` viene en pesos, con signo y 2 decimales.** Ejemplo: `Flete crédito devolución: -22686.00 COP`. **No se divide entre 100** (eso era solo del export HTML).
- **Volumen de CO:**
  - Unas 12.600 guías en 30 días.
  - 11.205 movimientos de wallet en 7 días, unas 113 páginas por semana. El backfill debe ir paginado y respetar las 120 req/min.
- **Estados globales vistos:** Entregada a destino, Devolución a origen, En transito, Disponible para retiro en oficina, Novedad, Generada, En reparto y **Cancelada por transportadora**. Este último va a EXCLUIDA.
- La cuenta CO tiene 1 sucursal. El `nombre_empresa` de la wallet es el titular legal de la empresa, no el nombre comercial.

## Pendiente de confirmar con datos reales
- Cuerpo exacto de cada webhook. La documentación dice "los datos del registro tal como los devuelve la API, más el evento, la fecha y la empresa".
- Los 9 ids de `est_guia_efficommerce` y sus nombres exactos (incluida Indemnización).
- Catálogo de `t_movimiento` de la wallet, para mapearlo a las líneas del PyG de `docs/reglas-negocio.md`.
