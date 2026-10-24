# Torre de Control · Joalix Group

Tablero en vivo sobre **Effi** (logística y wallet de dropshipping contra entrega) para Colombia, Ecuador, Guatemala y Costa Rica. Reemplaza el "Dashboard Joalix Group" hecho a mano en Excel/HTML.

## Qué hace

| Menú | Qué muestra |
|---|---|
| 🛒 Datos | Despachado y entregado, resumen diario por estados, PyG según la wallet, utilidad neta real |
| 🏤 Disp. en Oficina | CRM para llamar a los clientes con guía en oficina, con estadísticas |
| 🤖 Agente | Vigila que cada orden de venta pase a remisión (con su convenio) y tenga guía, país por país |
| ⚡ En vivo | Red neuronal con cada cambio de estado de las guías, por país |
| 🪙 Wallet en vivo | Saldo de la wallet Effi de cada país en su moneda |
| 📤 Cargar archivos | Excel de Dropi y CSV de Meta Ads |

## Cómo está armado

```
web/                 App Next.js (App Router) — pantallas en web/src/app/(panel)
supabase/migrations  Esquema, funciones SQL (kpi_*, wallet_en_vivo, auto_*) y RLS
supabase/functions   Edge Functions: effi-sync (cada minuto), effi-webhook, auto-vigilancia
scripts/             Utilidades de carga y verificación contra la API de Effi
docs/                Plan, reglas de negocio y mapa de la API de Effi
```

- **Datos:** la API REST de Effi (una API key por empresa) se sincroniza a Supabase cada minuto con `pg_cron` → `effi-sync`. Las keys viven en Supabase Vault, nunca en el código.
- **Pantallas:** leen Supabase con la sesión del usuario; la seguridad la pone RLS (`app_cuentas_visibles`).
- **Reglas de negocio:** `docs/reglas-negocio.md`.

## Correrlo en local

1. Copia `.env.example` a `.env` y pon las API keys de Effi (solo para los scripts).
2. Crea `web/.env.local` con:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   ```
3. Instala y arranca:
   ```bash
   cd web && npm install && npm run dev
   ```
4. Abre http://localhost:3000 e inicia sesión con un usuario de Supabase Auth.

Para una base nueva: aplica `supabase/migrations` en orden y despliega las funciones de `supabase/functions`.

## Qué no está en este repositorio

- Claves y archivos `.env`.
- Cifras reales de publicidad y gastos (`supabase/seed/`).
- La copia de la documentación interna de Effi y las herramientas de terceros.
