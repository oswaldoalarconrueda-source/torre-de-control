-- Regla del dueño (5-nov): el pedido con + adelante del nombre del cliente va por el centro de costos Sin confirmar. Solo Colombia
-- (5) y Guatemala (2) lo tienen; donde es null, el agente deja la orden en revisión en lugar de crearla por otro centro.
alter table public.auto_config add column if not exists centro_sin_confirmar int;
update public.auto_config set centro_sin_confirmar = 5 where cuenta = 'TIENDA_CO';
update public.auto_config set centro_sin_confirmar = 2 where cuenta = 'TIENDA_GT';

-- auto_lista espera ese centro para los clientes con + y, al buscar si ya tienen guía, compara el nombre sin el + (como con el *).
do $do$
declare
  antes text := pg_get_functiondef('public.auto_lista(text,integer,date,date)'::regprocedure);
  d text := antes;
  v text;
begin
  v := d;
  d := replace(d, 'case when a.recuperado then (select centro_recuperado from cfg)',
    'case when ltrim(a.cliente) like ''+%'' then (select centro_sin_confirmar from cfg) when a.recuperado then (select centro_recuperado from cfg)');
  if d = v then raise exception 'auto_lista: no se encontró centro_esperado'; end if;
  v := d;
  d := replace(d, 'case when b.recuperado then ''Cliente con * y la remisión no va por Recuperado''',
    'case when ltrim(b.cliente) like ''+%'' then ''Cliente con + y la remisión no va por Sin confirmar'' when b.recuperado then ''Cliente con * y la remisión no va por Recuperado''');
  if d = v then raise exception 'auto_lista: no se encontró el motivo'; end if;
  v := d;
  d := replace(d, $x$'^\*+\s*'$x$, $x$'^[*+]+\s*'$x$);
  if d = v then raise exception 'auto_lista: no se encontró la comparación de nombres'; end if;
  execute d;
end $do$;
