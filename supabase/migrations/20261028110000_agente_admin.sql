-- 🧾 Agente admin (pedido del dueño, 28-oct): pasa la wallet de Effi a comprobantes de Effi, como se hizo a mano con
-- Guatemala de julio a octubre. Solo lo ve y lo opera el dueño. Mismas reglas para todos los países; cada uno con su
-- modo: apagado, revisar (prepara el cierre y el dueño le da "Crear en Effi") o automatico (lo crea solo).
--
-- Cada cierre toma los movimientos vigentes de la wallet que aún no tienen comprobante, hasta el día anterior, y por mes:
-- - un comprobante de ingreso con los recaudos de venta (tercero Efficommerce);
-- - un egreso a Efficommerce con fletes con recaudo, fletes de devolución, fulfillment y comisiones;
-- - un egreso por proveedor que paga la remisión de compra (cuenta por pagar) de cada guía cobrada.
-- Se ignoran lo anulado o revertido (Effi anula el original y deja una reversión), los retiros y las indemnizaciones.
-- Un movimiento nunca entra dos veces (admin_wallet_usados). Lo que no se pudo cerrar queda en novedades.

create table public.admin_config (
  cuenta text primary key references public.effi_accounts (slug),
  modo text not null default 'apagado' check (modo in ('apagado', 'revisar', 'automatico')),
  sucursal integer not null default 1,
  centro_costos integer,
  caja integer,
  cuenta_bancaria integer,
  medio_pago integer not null default 5,
  tercero_efficommerce bigint,
  t_ingreso_recaudo integer,
  t_egreso jsonb not null default '{}'::jsonb,      -- {compra, flete_recaudo, flete_devolucion, fulfillment, comisiones}
  proveedores jsonb not null default '{}'::jsonb,   -- {"DISTRILAB": 3, ...}: proveedor dropshipping → tercero en Effi
  ultima_corrida timestamptz,
  ultimo_error text,
  actualizado_por text,
  actualizado_en timestamptz not null default now()
);

create table public.admin_cierres (
  id bigint generated always as identity primary key,
  cuenta text not null references public.effi_accounts (slug),
  desde date,
  hasta date not null,
  estado text not null default 'borrador' check (estado in ('borrador', 'creando', 'hecho', 'error')),
  origen text not null default 'programado',
  resumen jsonb not null default '{}'::jsonb,
  comprobantes jsonb not null default '[]'::jsonb,
  creado_en timestamptz not null default now(),
  creado_por text,
  aprobado_en timestamptz,
  aprobado_por text,
  error text
);
create index admin_cierres_cuenta on public.admin_cierres (cuenta, id desc);

create table public.admin_wallet_usados (
  cuenta text not null,
  wallet_id bigint not null,
  cierre_id bigint,          -- null = cierres hechos a mano el 28-oct (jul–27 oct en Guatemala)
  comprobante text,
  primary key (cuenta, wallet_id)
);

create table public.admin_novedades (
  id bigint generated always as identity primary key,
  cuenta text not null,
  tipo text not null,        -- compra_sin_remision, proveedor_sin_mapa, reliquidada, error_effi
  clave text not null,
  guia text,
  valor numeric,
  detalle text,
  cierre_id bigint,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  resuelta_en timestamptz,
  unique (cuenta, tipo, clave)
);

-- Copia de las remisiones de compra de Effi (para saber cuál pagar). Se completa en cada corrida con las nuevas.
create table public.admin_remisiones_compra (
  cuenta text not null,
  sucursal integer not null,
  id bigint not null,
  proveedor bigint,
  remision_num bigint,
  total numeric,
  pdte_pago numeric,
  fecha_trans timestamp,
  actualizado_en timestamptz not null default now(),
  primary key (cuenta, sucursal, id)
);
create index if not exists prov_remisiones_td on public.prov_remisiones (transaccion_dropshipping);
create index admin_remisiones_compra_prov on public.admin_remisiones_compra (cuenta, proveedor, remision_num);

alter table public.admin_config enable row level security;
alter table public.admin_cierres enable row level security;
alter table public.admin_wallet_usados enable row level security;
alter table public.admin_novedades enable row level security;
alter table public.admin_remisiones_compra enable row level security;
create policy dueno on public.admin_config for select to authenticated using (public.app_es_owner());
create policy dueno on public.admin_cierres for select to authenticated using (public.app_es_owner());
create policy dueno on public.admin_novedades for select to authenticated using (public.app_es_owner());

-- Movimientos de la wallet que aún no tienen comprobante, hasta p_hasta (fecha local de la tienda). Cada compra trae la
-- transacción dropshipping, el proveedor y, si el proveedor es nuestra proveeduría, su número de remisión (enlace exacto).
create or replace function public.admin_pendientes(p_cuenta text, p_hasta date)
returns jsonb language sql stable security definer set search_path = '' set "TimeZone" to 'UTC' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', w.id, 't', w.t_movimiento, 'valor', w.valor, 'guia', w.guia_inicial, 'detalle', w.detalle,
      'dia', ((w.fecha_trans + make_interval(mins => a.tz_offset_min))::date),
      'td', g.transaccion_dropshipping, 'proveedor', g.nombre_empresa_proveedor,
      'prov_num', (select p.id from public.prov_remisiones p where p.transaccion_dropshipping = g.transaccion_dropshipping limit 1),
      'reliquidada', w.t_movimiento = 13 and exists (select 1 from public.effi_wallet x where x.cuenta = w.cuenta and x.id_guia = w.id_guia
          and x.sucursal_guia = w.sucursal_guia and x.t_movimiento = 13 and x.vigente is false)
    ) order by w.fecha_trans), '[]'::jsonb)
  from public.effi_wallet w
  join public.effi_accounts a on a.slug = w.cuenta
  left join public.effi_guias g on g.cuenta = w.cuenta and g.sucursal = w.sucursal_guia and g.id = w.id_guia
  where w.cuenta = p_cuenta and w.vigente is not false
    and w.t_movimiento in (1, 7, 9, 12, 13, 36)
    and (w.fecha_trans + make_interval(mins => a.tz_offset_min))::date <= p_hasta
    and not exists (select 1 from public.admin_wallet_usados u where u.cuenta = w.cuenta and u.wallet_id = w.id);
$$;

-- Todas las ventas dropshipping de la tienda por proveedor, en orden, con lo que la wallet cobró de compra (para emparejar
-- con las remisiones de compra de los proveedores que no son nuestra proveeduría).
create or replace function public.admin_guias_drop(p_cuenta text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_array(g.nombre_empresa_proveedor, g.transaccion_dropshipping, g.guia, c.compra)
    order by g.transaccion_dropshipping), '[]'::jsonb)
  from (select distinct on (transaccion_dropshipping) * from public.effi_guias
        where cuenta = p_cuenta and transaccion_dropshipping is not null
        order by transaccion_dropshipping, vigente desc nulls last, fecha_trans desc) g
  left join (select id_guia, sucursal_guia, sum(-valor) compra from public.effi_wallet
             where cuenta = p_cuenta and vigente is not false and t_movimiento = 13 group by 1, 2) c
    on c.id_guia = g.id and c.sucursal_guia = g.sucursal;
$$;

revoke all on function public.admin_pendientes(text, date) from public, anon, authenticated;
revoke all on function public.admin_guias_drop(text) from public, anon, authenticated;

-- Pide trabajo a la función agente-admin (preparar un cierre o crearlo en Effi). La usa el cron y el dueño desde la Torre.
create or replace function public.admin_agente_llamar(p_cuenta text, p_accion text, p_cierre bigint default null, p_quien text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
begin
  return net.http_post(
    url := 'https://jlshlpotjpzwlxwdaktq.supabase.co/functions/v1/agente-admin?cuenta=' || p_cuenta || '&accion=' || p_accion
      || coalesce('&cierre=' || p_cierre, '') || coalesce('&quien=' || p_quien, ''),
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'effi_sync_token')),
    body := '{}'::jsonb, timeout_milliseconds := 10000);
end $$;
revoke all on function public.admin_agente_llamar(text, text, bigint, text) from public, anon, authenticated;

-- Lo que el dueño hace desde la Torre: cambiar el modo, correr ahora, crear en Effi y dar por vista una novedad.
create or replace function public.admin_agente_dueno(p_cuenta text, p_accion text, p_valor text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_email text := (select email from auth.users where id = auth.uid());
begin
  if not public.app_es_owner() then raise exception 'Solo el dueño'; end if;
  if p_accion = 'modo' then
    update public.admin_config set modo = p_valor, actualizado_por = v_email, actualizado_en = now() where cuenta = p_cuenta;
  elsif p_accion = 'correr' then
    perform public.admin_agente_llamar(p_cuenta, 'preparar', null, v_email);
  elsif p_accion = 'crear' then
    update public.admin_cierres set aprobado_en = now(), aprobado_por = v_email where id = p_valor::bigint and cuenta = p_cuenta and estado in ('borrador', 'error');
    if not found then raise exception 'Ese cierre ya no está por crear'; end if;
    perform public.admin_agente_llamar(p_cuenta, 'crear', p_valor::bigint, v_email);
  elsif p_accion = 'resolver' then
    update public.admin_novedades set resuelta_en = now(), actualizado_en = now() where id = p_valor::bigint and cuenta = p_cuenta;
  else
    raise exception 'Acción desconocida';
  end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.admin_agente_dueno(text, text, text) from public, anon;
grant execute on function public.admin_agente_dueno(text, text, text) to authenticated;

-- Horario (hora Colombia): martes, jueves y sábado a las 8 a. m. y el 1.º de cada mes a la 1 a. m. (cierre del mes).
create or replace function public.admin_agente_tick()
returns integer language plpgsql security definer set search_path = '' as $$
declare r record; n integer := 0;
begin
  for r in select cuenta from public.admin_config where modo <> 'apagado' loop
    perform public.admin_agente_llamar(r.cuenta, 'preparar', null, 'horario');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.admin_agente_tick() from public, anon, authenticated;
select cron.unschedule(j) from unnest(array['agente-admin-semana', 'agente-admin-mes']) j where exists (select 1 from cron.job where jobname = j);
select cron.schedule('agente-admin-semana', '0 13 * * 2,4,6', $$ select public.admin_agente_tick(); $$);
select cron.schedule('agente-admin-mes', '0 6 1 * *', $$ select public.admin_agente_tick(); $$);

-- Países: todos con las mismas reglas; Guatemala configurado y en "revisar", los demás apagados hasta configurarlos.
insert into public.admin_config (cuenta, modo, centro_costos, caja, cuenta_bancaria, medio_pago, tercero_efficommerce, t_ingreso_recaudo, t_egreso, proveedores)
values ('TIENDA_GT', 'revisar', 5, 1, 3, 5, 7041, 3,
  '{"compra": 4, "flete_recaudo": 5, "flete_devolucion": 6, "fulfillment": 7, "comisiones": 8}',
  '{"DISTRILAB": 3, "SICOMMER LAB GT": 4, "DISTRIBUCIONES LINEA VERDE GT": 4882, "VITALCOM": 5, "ALTAMIRA LABS": 1623, "NATURAL LABS ORGANIC": 6, "AMERICAN NATURAL": 4676}')
on conflict (cuenta) do nothing;
insert into public.admin_config (cuenta)
select slug from public.effi_accounts where tipo = 'tienda' and activa and slug <> 'TIENDA_GT'
on conflict (cuenta) do nothing;

-- Carga inicial de las remisiones de compra por partes (pueden ser miles): hasta qué página va y si ya terminó.
alter table public.admin_config add column if not exists remisiones_pagina integer not null default 0,
  add column if not exists remisiones_completas boolean not null default false;

-- Hecho a mano el 28-oct: Guatemala de julio al 27-oct ya tiene comprobantes (ingresos #1-#5, egresos #1-#22); esos
-- movimientos quedan como usados, salvo las 23 compras que no se pudieron pagar (las toma el agente).
-- (insert en admin_wallet_usados ejecutado aparte con la lista de guías pendientes.)
