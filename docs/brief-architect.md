# Brief para the-architect — Torre de Control Effi

> Entrada para `tools/the-architect` (modo clon). Las decisiones de DISCOVERY, DEEP DIVE y ARCHITECTURE ya las confirmó el usuario el 2026-10-22 (ver `docs/plan.md`). Falta **GENERATE**, que está bloqueado hasta cerrar los marcadores de abajo.

## RUNNING BRIEF
- **Proyecto:** tablero en línea que consolida Effi (ERP/logística contraentrega) de 8 cuentas: tiendas CO, EC, GT, CR y proveedurías GT ×2, HN, CR.
- **Forma (shape):** `internal-tool` (auth por invitación, roles, `can()`, auditoría) + `data-pipeline-analytics` (sync incremental y KPIs).
- **Runtime:** `ts-node`: Next.js 16 App Router, TypeScript, Tailwind 4, shadcn/ui, pnpm, Vitest, Playwright y Biome.
- **Datos y auth:** Supabase (Postgres, Auth con correo y clave, RLS, Realtime, Vault y pg_cron), desplegado en Vercel con Vercel Cron.
- **Integración:** API REST de Effi (`https://effi.com.co/api/...`) con `Authorization: Bearer <API key>`. Hay una API key por empresa (usuario de solo consulta), guardada en Vault.
  - Los **webhooks** firmados con HMAC-SHA256 dan el tiempo real.
  - Un sync programado cubre la carga histórica y sirve de red de seguridad.
  - Detalle en `docs/effi-api-map.md`.
- **Llave universal:** el número de guía. Venta → guía → estados → novedades → recaudo → pago.
- **Roles:**
  - `owner`: global.
  - `socio`: todos los módulos de sus cuentas.
  - `empleado`: solo los módulos y cuentas asignados.
  - Las sociedades se manejan fuera de Effi; en la app solo existen usuarios y permisos.
- **Diseño:** referencia Flowra (dark, brillos azules, tarjetas con borde degradado, KPIs grandes), fuente Geist y gráficos con shadcn charts (Recharts).
- **Reglas de negocio:** `docs/reglas-negocio.md`.

## Resueltos el 2026-10-23 (documentación oficial extraída a `docs/effi/`)
- **Endpoints y campos:** `docs/effi/api-referencia.md`.
- **Webhooks:** existen, firmados con HMAC-SHA256; ver `docs/effi/webhooks.md`.
- **Paginación y límites:** 100 registros por página, 120 req/min por key, rangos de 31 días en historial de estados y wallet.
- **Autenticación:** una API key por empresa Effi, con vigencia de 360 días.

## Marcadores abiertos (cerrar antes de GENERATE)
- [NEEDS CLARIFICATION: nombres exactos de las 8 empresas Effi, su país y su tipo, y quién genera la API key de solo consulta en cada una.]
- ✅ 2026-10-23: la API de NATURALFITT CO está conectada. Los montos vienen en pesos, no en centavos.
- [VERIFICAR: catálogo completo de `t_movimiento` para mapear las líneas del PyG.]
- [NEEDS CLARIFICATION: meses de histórico a cargar (backfill).]
- [NEEDS CLARIFICATION: fuente del tipo de cambio para la vista global en USD.]
