-- Regla del dueño (28-oct): el nombre de la segunda plataforma no aparece en ninguna parte de la Torre; sus datos sí.
-- Se cambian solo los textos que llegan a la pantalla: conceptos del PyG y nombres de las cargas. El valor interno
-- 'Dropi' de la columna plataforma se queda (la pantalla lo muestra como "Otra"), igual que los nombres de las tablas.
do $$
declare d text;
begin
  d := pg_get_functiondef('public.kpi_utilidad(text, date, date, text)'::regprocedure);
  d := replace(replace(d, '''Comisión Dropi''', '''Comisión'''), '''Otros cargos Dropi''', '''Otros cargos''');
  execute d;

  d := pg_get_functiondef('public.app_estado_cargas()'::regprocedure);
  d := replace(replace(replace(d, 'Dropi · órdenes', 'Órdenes'), 'Dropi · productos', 'Órdenes por producto'), 'Dropi · cartera', 'Historial de cartera');
  execute d;
end $$;
