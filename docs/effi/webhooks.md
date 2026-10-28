# Webhooks de Effi (resumen del manual en `https://effi.com.co/app/webhook`, 2026-10-23)

- **Un webhook = un evento + una URL `https://`.** Se crean en Integraciones → Webhooks. No tienen costo ni límite por plan.
- **Secreto:** Effi genera 64 caracteres al crear el webhook y los muestra **una sola vez**. Si se pierde, se usa "Regenerar secreto".
- **Cabeceras adicionales:** opcionales, en JSON (p. ej. `{"Authorization": "Bearer xyz"}`).
- **Entrega:** `POST` con un JSON que trae los datos del registro como los devuelve la API, más el evento, la fecha y la empresa. Cabeceras:
  - `Content-Type: application/json`
  - `X-Effi-Event`: el evento.
  - `X-Effi-Delivery`: id único de la entrega. Si llega repetido es un reintento.
  - `X-Effi-Signature`: `sha256=` + HMAC-SHA256 del cuerpo con el secreto.
- **Respuesta:** cualquier 2xx en **menos de 5 s**. Si tarda más o devuelve otro código, la entrega cuenta como fallida.
- **Reintentos:** 12, a los 1m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 10h, 12h, 18h y 24h (unos 3 días en total). Si los 12 fallan, el webhook pasa a **Inactivo**.
  - **Reactivar** reanuda las entregas pendientes, pero no recupera los eventos ocurridos mientras estuvo inactivo; esos hay que consultarlos por la API.
  - **Anulado** es definitivo.
- **Lo que guarda Effi:** las entregas exitosas no se guardan. Las fallidas se conservan 30 días con el detalle de cada intento.

## Eventos útiles para la Torre de Control
- Logística:
  - Cambio de estado de Guía de transporte
  - Creación / Modificación / Anulación de Guía de transporte
  - Creación / Anulación de Novedad de guía de transporte
  - Solución de Novedad de guía de transporte
- Wallet:
  - Creación / Anulación de Movimiento de wallet
  - Creación / Autorización de Solicitud de retiro de wallet
  - Creación de Transferencia entre wallets
- Ventas:
  - Creación / Modificación / Anulación de Orden de venta
  - Cambio de estado de Orden de venta
  - Creación / Modificación / Anulación de Remisión de venta
  - Creación / Modificación / Anulación de Factura de venta
  - Creación / Anulación de Devolución de venta

La lista completa de eventos (unos 190, de todos los módulos) aparece en el selector "Evento" de esa pantalla.

## Webhooks registrados (Torre de Control)

**Receptor:** función de Supabase `effi-webhook` del proyecto "Super Data". Guarda cada aviso en `public.effi_webhook_events`.
- URL: `https://jlshlpotjpzwlxwdaktq.supabase.co/functions/v1/effi-webhook?cuenta=<SLUG>`. `<SLUG>` es el mismo de `effi_accounts` y del `.env` (TIENDA_CO, TIENDA_EC…).
- **Seguridad:** los avisos se tratan como *no confiables*. El procesador vuelve a consultar cada guía, orden o movimiento en la API de Effi con la key de la cuenta. Por eso no se guardan los secretos de cada webhook, y no se agregaron cabeceras.
- La firma `X-Effi-Signature` se guarda igual, para auditoría.
- **Nombre en Effi:** `Torre Control · <evento>`.
- **Plataforma destino:** Otra.

| `t_evento_webhook` | Nombre |
|---|---|
| `guia_transporte.tracking` | Cambio de estado de Guía |
| `guia_transporte.crear` / `.modificar` / `.anular` | Creación / Modificación / Anulación de Guía |
| `novedad_guia_transporte.crear` | Creación de Novedad |
| `gestion_novedad_guia_transporte.crear` | Solución de Novedad |
| `movimiento_dinero_effi.crear` / `.anular` | Creación / Anulación de Movimiento de wallet |
| `orden_v.crear` / `.estado` / `.anular` | Creación / Cambio de estado / Anulación de Orden de venta |
| `remision_v.crear` / `.anular` | Creación / Anulación de Remisión de venta |

| Cuenta | Estado |
|---|---|
| TIENDA_CO (NATURALFITT CO, ID 58004) | ✅ 13/13, el 2026-10-23 |
| TIENDA_EC (NATURALFITT EC, ID 57380) | ✅ 13/13, el 2026-10-23 |
| TIENDA_GT | pendiente |
| TIENDA_CR | pendiente |
| VALKA_GT (VALKA GT, ID 58130, sociedad Valka) | ✅ 13/13, el 2026-10-25 (nombre "Torre Control - <evento>": Effi quita el "·") |
| DISTRI_GT (DISTRIGUATEMALA, ID 25084, sociedad Distrilatam) | ✅ 43: 10 de proveeduría + 17 de inventario + 16 de compras, el 2026-10-26 |
| DISTRI_CR (DISTRICOSTARICA, ID 40014, sociedad Distrilatam) | ✅ 43: 10 de proveeduría + 17 de inventario + 16 de compras, el 2026-10-26 |
| DISTRI_LAB (DISTRILAB, ID 53639, sociedad Distrilatam) | ✅ 43: 10 de proveeduría + 17 de inventario + 16 de compras, el 2026-10-26 |

**Proveedurías (Distrilatam):** no hacen guías, así que llevan otros 10 eventos. Todos se llaman "Torre Control - <evento>" y
apuntan a `effi-webhook?cuenta=DISTRI_…`:
- `remision_v.crear` / `.anular`
- `factura_v.crear` / `.anular`
- `orden_v.crear` / `.anular`
- `devolucion_v.crear` / `.anular`
- `movimiento_dinero_effi.crear` / `.anular`

Más 33 de inventario y compras (pedido del 2026-10-26):
- **Inventario (17):**
  - `articulo.crear` / `.modificar` / `.anular`
  - `ajuste_inventario.crear` / `.anular`
  - `traslado_inventario.crear` / `.autorizar` / `.anular`
  - `despacho_inventario`, `recepcion_inventario` y `conteo_inventario`: `.crear` / `.modificar` / `.anular`
- **Compras (16):**
  - `factura_c`, `orden_c`, `remision_c` y `nota_credito_c`: `.crear` / `.modificar` / `.anular`
  - `devolucion_c.crear` / `.anular`
  - `anticipo_proveedor.crear` / `.anular`
- **Cómo se crearon:** desde la sesión de Effi, con el mismo formulario de la página (`POST app/webhook/crear`), sin recargarla.

**Observación del 2026-10-23, unos 20 min después de crear los webhooks de CO y EC:**
- La API muestra cambios de estado y movimientos de wallet posteriores a la creación de los webhooks: CO tiene 1.840 cambios de estado en el día y EC 1.061.
- Aun así, Effi marca cada webhook "Último envío: Sin envíos", con 0 entregas fallidas.
- Los registros de la función en Supabase no muestran ninguna llamada de Effi.
- Effi todavía no está despachando. Falta confirmar con soporte si los cambios automáticos de las transportadoras y las liquidaciones disparan webhooks.
- Mientras tanto, el sync por API (cada pocos minutos) es la fuente principal.

**Al registrar:** al cerrar el aviso del secreto ("Ya lo guardé") Effi recarga la página, así que se crea un webhook por cada carga de la página.

**Diagnóstico del 2026-10-27:**
- `effi_webhook_events` sigue en 0 filas para todas las cuentas.
- En Effi, los 13 webhooks de CO siguen "Vigente - Activo", con "Último envío: Sin envíos" y 0 entregas fallidas. Effi nunca intentó enviar: no es que la Torre los rechace.
- Eventos reales desde que se crearon los webhooks (datos del sync por API):

  | Cuenta | Guías creadas | Cambios de estado | Movimientos de wallet | Avisos recibidos |
  |---|---|---|---|---|
  | TIENDA_CO (desde el 23-oct 15:00) | 1.363 | 9.620 | 6.068 | 0 |
  | TIENDA_EC (desde el 23-oct 15:00) | 1.331 | 7.002 | 2.816 | 0 |
  | VALKA_GT (desde el 25-oct 18:00) | 5 | 99 | 52 | 0 |

- El receptor funciona: un POST de prueba sin clave respondió 200 en 0,5 s y quedó guardado (la fila de prueba se borró).
- Pasa igual con lo creado por la API (remisiones y guías de la Torre) y con lo hecho en la pantalla de Effi.
- Conclusión: Effi no está despachando webhooks. Hay que abrir caso con soporte de Effi antes de crear los de GT y CR.

**2026-10-28 — Effi corrigió el despacho (aviso del ingeniero de Effi):**
- Desde las 09:55 UTC (4:55 a. m. Colombia) llegan avisos por primera vez: en la primera hora, 108 en CO, EC y GT.
  - `guia_transporte.tracking`: CO 61, EC 20, GT 15.
  - `movimiento_dinero_effi.crear`: CO 11.
  - `novedad_guia_transporte.crear`: EC 1.
- **Están completos:** los avisos coinciden con lo que trae la sincronización por API en la misma hora (09:55–11:00 UTC).
  - Cambios de estado de guía: CO 54, EC 18 y GT 15 por API; los avisos de tracking son esos mismos, más los del último minuto.
  - Movimientos de wallet de CO: 11 por API y 11 avisos.
  - Todos los avisos corresponden a guías que existen en `effi_guia_estados`.
- **Demora:** unos 30 s entre `fecha_evento` y la llegada. Effi los manda en tandas, más o menos cada minuto.
- **Forma del aviso:** `{ evento, empresa, entrega, fecha_evento, datos }`. En el tracking, `datos` es la guía completa (los mismos campos de `api/guia_transporte`, más `estado_anterior`).
- **GT ya recibe avisos de tracking**, aunque la Torre no le había creado webhooks: los configuraron del lado de Effi.
- **Ninguno tiene error, pero ninguno se procesa todavía** (`procesado_en` vacío): los datos en vivo siguen saliendo del `effi-sync` cada minuto.
