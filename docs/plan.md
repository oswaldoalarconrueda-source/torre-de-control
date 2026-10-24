# Plan — Torre de Control Effi (tiendas + proveedurías, multi-país)

## Contexto
Hoy los tableros de Effi se arman a mano con Excel exportados (skills `effi-dashboard`, `dashboard-ecommerce-contraentrega`, `naturalfitt-precierre-gt`). Effi acaba de abrir acceso programático, así que queremos un **tablero web en línea** que:
- Reciba todo de forma automática: órdenes de venta, ventas, guías, **cambios de estado de guía** (el dato más importante), novedades y movimientos de dinero.
- Una todo por el **número de guía**, que es la llave común de Effi: venta → guía → novedad → recaudo → pago.
- Cubra 4 tiendas (CO, EC, GT, CR) y 4 proveedurías (GT ×2, HN, CR), con una vista global para el dueño.
- Dé acceso con usuario y clave: los socios ven todo; los empleados ven solo los módulos o cuentas que se les asignen.

Cómo es la API (lo que encontré): Effi expone un **servidor MCP** en `https://effi.com.co/mcp` con **OAuth 2.1** (PKCE, registro dinámico de clientes y refresh tokens). Cada cuenta Effi se autoriza una vez en la pantalla de login de Effi, así que **nunca guardamos claves**. Los nombres de herramientas y campos, los webhooks ("avisos automáticos de cada cambio") y la paginación están en `effi.com.co/app/conector_ia`. **El usuario enviará esa documentación**; con ella se completa el Paso 0.

La carpeta del proyecto está vacía; se arranca desde cero.

> **Actualización 2026-10-23:** con la documentación oficial (`docs/effi-api-map.md`), la integración pasa a ser **API REST con API key por empresa + webhooks**, en lugar de MCP con OAuth. Donde abajo dice MCP/OAuth, aplica esto.

## Stack (decidido)
- **Next.js 16 (App Router) + TypeScript + Tailwind 4 + shadcn/ui**, desplegado en **Vercel**.
- Gráficos con shadcn charts (Recharts).
- **Supabase:** Postgres, Auth (usuario y clave), RLS para permisos, Realtime para el feed de estados, pg_cron y Vault para guardar los tokens de Effi cifrados.
- Cliente MCP: `@modelcontextprotocol/sdk` (TypeScript) dentro de un **sync worker** que corre como ruta programada (Vercel Cron cada 5–10 min). Si Effi soporta webhooks, se agrega una ruta `/api/effi/webhook`.

## Cómo se usan los dos repos
1. **the-architect**
   - Se instala con `claude plugin marketplace add Hainrixz/the-architect` y `claude plugin install the-architect@soyenriquerocha`. Si el CLI no lo permite, el usuario corre `/plugin …` en una terminal de `claude`.
   - Se corre `/architect` usando este plan como brief, con la forma *internal-tool* + *data-pipeline-analytics*.
   - Genera `blueprints/effi-control/`: `blueprint.md`, `tasks.json`, epics y un `workspace/` con CLAUDE.md, skills y rules. Ese `workspace/` se copia a la raíz.
   - La construcción avanza tarea por tarea con `/architect-next`, cada tarea con su comando de verificación y su commit.
2. **claude-webkit**
   - Es una plantilla para *landing pages*; no se usa su flujo.
   - Solo se copian sus skills de construcción a `.claude/skills/`: frontend-design, shadcn-ui, building-components, vercel-react-best-practices, web-design-guidelines, ui-ux-pro-max, emil-design-eng y playwright-cli.
   - **No** se copia su `settings.local.json`, que pre-autoriza `rm*` y `curl*`.
   - Se usa **pnpm**, como dice the-architect.
3. **Diseño**
   - Se sigue la referencia Flowra: fondo negro/azul marino, brillos azules, tarjetas con borde degradado, KPIs grandes y navegación tipo píldora.
   - Esto choca con la regla de webkit de "no cyan-on-dark"; manda la referencia del usuario.
   - Fuente Geist, porque webkit prohíbe Inter.

## Modelo de datos (eje = guía)
- `effi_accounts`: país, moneda, tipo (`tienda` | `proveeduria`), estado de conexión OAuth, `last_sync_at`.
- `orders` (órdenes de venta) → `sales` (remisión/factura) → `guides`.
  - La llave de `guides` es (`account_id`, `numero_guia`). Guarda transportadora, valor de recaudo, flete, ciudad, producto(s), centro de costos y fechas.
- `guide_status_events`: historial append-only de cada cambio de estado (estado anterior, nuevo, fecha). Alimenta el feed en vivo y los tiempos.
- `novedades` (por guía), `wallet_movements` (por guía cuando aplica), `products`, `customers` (para proveeduría: dropshipper/distribuidor) y `carriers`.
- Vistas o materializaciones:
  - `guide_money`: recaudo esperado vs pagado, fecha de pago, **días entrega→pago** y flete real de devolución.
  - `order_funnel`: orden → venta → guía, con el motivo por el que no avanzó.
- `memberships`: (`user`, `account`, `rol` socio|empleado, `modulos[]`).
  - Las políticas RLS filtran todas las tablas por las cuentas del usuario.
  - El dueño tiene rol `owner` global.
- El mapeo exacto campo-API → columna se completa en el Paso 0 con la documentación de Effi.

## Reglas de negocio (se portan de los skills existentes a `lib/metrics/`, con tests)
- **Estados unificados:**
  - Entregada → ENTREGADO
  - En tránsito / En reparto / Recolectado → EN TRÁNSITO
  - Devolución a origen → DEVOLUCIÓN
  - Novedad → NOVEDAD
  - Generada → PENDIENTE
  - Disponible para retiro en oficina → EN OFICINA
  - Indemnización: excluida de los % de devolución
- **Fórmulas:**
  - **Efectividad** = entregadas / (entregadas + devueltas)
  - **% devolución por transportadora** = devueltas / total
- **Promedio por guía** = valor promedio de recaudo de las guías contraentrega, por cuenta, transportadora y periodo.
- **El wallet manda sobre el estado nominal:** si hay recaudo acreditado, la guía cuenta como entregada.
- Una guía entregada sin recaudo pasa a **"Guías sin liquidar"** (para reclamar).
- Flete de devolución: se toma el valor real del wallet. Costo de mercancía = 0 en devoluciones.
- Retiros y transferencias quedan fuera del PyG (van a caja).
- Semáforos por país, tomados del Apéndice B de `dashboard-ecommerce-contraentrega`.
- **Pendiente de verificar:** si la API devuelve montos en centavos, como el export HTML, o en pesos.

## Pantallas
1. **Global (dueño):** consolidado de las 8 cuentas, en moneda local y en USD.
2. **Órdenes vs Ventas:** embudo y lista de órdenes que no se convirtieron, con su motivo.
3. **Guías:**
   - Promedio por guía, distribución por transportadora y efectividad.
   - **Feed en vivo de cambios de estado.**
   - Guías estancadas (sin cambio en N días) y mapa por ciudad/departamento.
4. **Novedades:** por tipo y transportadora, % de recuperación y devoluciones causadas.
5. **Dinero:**
   - Pagado vs pendiente y cuándo se pagó.
   - **Días promedio de pago** por transportadora.
   - Guías sin liquidar, PyG y caja.
6. **Proveeduría:** mejores clientes (dropshippers), productos más vendidos y devolución por cliente/producto.
7. **Admin:** conectar cuentas Effi (botón OAuth), estado del sync, usuarios y permisos por cuenta y módulo.

## Orden de construcción
- **0. Mapeo API:** con la documentación de Effi, conectar la cuenta Colombia, listar las herramientas MCP, traer 1 día de guías y wallet, y escribir `docs/effi-api-map.md` (herramientas → tablas, unidades, paginación, webhooks).
- **1. Base:** repo, Supabase, Auth, `effi_accounts`, flujo OAuth "Conectar Effi" y tokens en Vault.
- **2. Sync worker:**
  - Sync incremental e idempotente (upsert por guía) de guías, eventos de estado, novedades, wallet, órdenes y ventas.
  - Carga histórica (backfill) de los últimos N meses.
  - Webhook si existe.
- **3. Métricas** en `lib/metrics/` con tests unitarios.
- **4. Pantallas de tienda** (Guías, Novedades, Dinero, Órdenes vs Ventas) para Colombia.
- **5. Multi-país:** conectar EC, GT y CR, más la vista Global y la conversión de moneda.
- **6. Proveedurías:** conectar GT ×2, HN y CR, más la pantalla Proveeduría.
- **7. Permisos:** usuarios, roles y módulos con RLS, más la pantalla Admin.
- **8. Deploy** a Vercel y QA.

## Verificación
- **Paridad:** tomar un mes ya cerrado de VITALIFE y comparar los KPIs del tablero (efectividad, recaudo, fletes, PyG) con el resultado del skill `effi-dashboard` sobre el Excel del mismo periodo. Deben coincidir.
- **Tests:**
  - Unitarios (Vitest) para `lib/metrics`.
  - Prueba de idempotencia del sync: correrlo 2 veces no debe duplicar nada.
- **E2E (Playwright):**
  - Login.
  - Un empleado no ve cuentas ni módulos que no tiene asignados (RLS).
  - Un cambio de estado de guía aparece en el feed.
- **Revisión visual:** en el navegador integrado, en escritorio y móvil, contra las imágenes de referencia.

## Notas de seguridad
- El skill programado `~/Documents/CLAUDE/Scheduled/effi-reporte-diario/SKILL.md` tiene **usuario y clave de Effi en texto plano**. Se recomienda cambiar esa clave. El nuevo sistema solo usa OAuth y no guarda claves.
- Los tokens de Effi se guardan en Supabase Vault; solo el worker del servidor los lee.
