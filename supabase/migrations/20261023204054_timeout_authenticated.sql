-- Las consultas de KPIs recorren decenas de miles de guías; 8 s (por defecto) se queda corto con la carga histórica en curso.
alter role authenticated set statement_timeout = '30s';
notify pgrst, 'reload config';
