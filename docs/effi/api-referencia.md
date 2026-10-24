# Effi API — referencia de los endpoints que usa la Torre de Control

Generado desde la Documentación API de Effi (`https://effi.com.co/app/api`, archivo `api.js?v313`), extraído el 2026-10-23. La lista completa de 342 endpoints está en `api-endpoints.json`.

**Base URL:** `https://effi.com.co/` · **Auth:** `Authorization: Bearer <API_KEY_EFFI>` · **Rate limit:** 120 req/min por API key (429 + Retry-After) · **Paginación:** `pagina`, `por_pagina` (máx. 100) → `paginacion {pagina, por_pagina, total, total_paginas}` · **Respuesta:** `{ok, data, paginacion}` / error `{ok:false, mensaje}`.

## Índice
- [GET api/guia_transporte — Consultar guías de transporte](#guia_transporte)
- [GET api/hist_est_guia_transporte — Consultar cambios de estado de guías de transporte](#hist_est_guia_transporte)
- [GET api/novedad_guia_transporte — Consultar novedades de guías](#novedad_guia_transporte)
- [GET api/gestion_novedad_guia_transporte — Consultar soluciones de novedades de guías de transporte](#gestion_novedad_guia_transporte)
- [GET api/movimiento_dinero_effi — Consultar movimientos de wallets](#movimiento_dinero_effi)
- [GET api/solicitud_retiro_cuenta_effi — Consultar solicitudes de retiro de wallet](#solicitud_retiro_cuenta_effi)
- [GET api/transferencia_cuenta_effi — Consultar transferencias entre wallets](#transferencia_cuenta_effi)
- [GET api/orden_v — Consultar órdenes de venta](#orden_v)
- [GET api/remision_v — Consultar remisiones de venta](#remision_v)
- [GET api/factura_v — Consultar facturas de venta](#factura_v)
- [GET api/devolucion_v — Consultar devoluciones de venta](#devolucion_v)
- [GET api/nota_credito_v — Consultar notas crédito de venta](#nota_credito_v)
- [GET api/est_orden_v — Consultar estados de orden de venta](#est_orden_v_empresa)
- [GET api/est_guia_efficommerce — Consultar estados de guía Efficommerce](#est_guia_efficommerce)
- [GET api/transportadora_efficommerce — Consultar transportadoras Efficommerce](#transportadora_efficommerce)
- [GET api/transportadora — Consultar transportadoras](#transportadora)
- [GET api/cliente — Consultar clientes](#cliente)
- [GET api/proveedor — Consultar proveedores](#proveedor)
- [GET api/articulo — Consultar artículos](#articulo)
- [GET api/centro_costos — Consultar centros de costos](#centro_costos)
- [GET api/sucursal — Consultar sucursales](#sucursal)

---

## <a id="guia_transporte"></a>GET `api/guia_transporte` — Consultar guías de transporte

Devuelve las guías de transporte de la empresa asociada a la API key con las mismas columnas de la tabla de consulta del web más las columnas de los filtros: id, prefijo e identificador visible (id_transaccion), empresa dueña de la guía, fechas (creación, envío, entrega esperada, guía de devolución, estado final, anulación), sucursal, centro de costos y ubicación de venta, remitente y destinatario con su identificación, ubicación y contacto, transportadora propia y transportadora Effi, números de guía inicial y de devolución, servicio, peso, paquetes, forma de pago del flete y contenido, documento de venta de referencia, datos de dropshipping, valores (declarado, recaudo, costos calculados por la API de la transportadora, flete, descuento), estados de la transportadora y estados globales Effi de la guía inicial y de la devolución, relación de despacho, responsable, marcas de liquidación Efficommerce y vigencia; cada id de otra tabla va seguido de su nombre. Igual que en el web, además de las guías propias se listan las guías de distribuidores en las que la empresa es el proveedor dropshipping, y las empresas matriz Effi ven las guías de las empresas que administran: por eso se exponen empresa y nombre_empresa. La clave de una guía es empresa + sucursal + id (el id se repite entre sucursales): combine siempre sucursal e id. Se listan de la más reciente a la más antigua por fecha de creación. Los filtros son los mismos del bloque de búsqueda del módulo Guía de transporte del web (se llaman igual que las columnas); los filtros de marca (1/0) se aplican solo si se envían: no envíe el parámetro vacío. Si la petición no trae id, guia, guia_adicional, id_ref ni desde, el modelo lista solo las guías creadas desde el día anterior (mismo comportamiento del web): se recomienda enviar siempre desde y hasta. Si no se envía vigente se listan vigentes y anuladas (como el web con "Seleccionar..."); vigente=1 lista solo las vigentes y vigente=0 solo las anuladas. Resumen agregado (agrupar_por): enviando agrupar_por=<dimensión> el servicio NO devuelve el listado paginado sino las filas agregadas de un GROUP BY sobre las mismas guías filtradas (mismo universo por empresa y filtros de cabecera), sin tope de días: data = [{clave, nombre, cantidad, valor_flete, valor_recaudo, valor_declarado, entregadas, devoluciones, con_novedad, dias_entrega_acumulados, guias_con_estado_final}] ordenadas por cantidad descendente (dia/mes/anio en orden cronológico) y resumen = {agrupar_por, limite, grupos, totales}. Dimensiones: transportadora, transportadora_efficommerce, est_guia_efficommerce, sucursal, centro_costos, pais_destinatario, provincia_destinatario, ciudad_destinatario, dia, mes y anio. En el resumen solo se suman las guías vigentes salvo que se envíe vigente, y aplican únicamente los filtros sucursal, ubicacion_venta, centro_costos, transportadora, transportadora_efficommerce, t_servicio, est_guia, est_guia_efficommerce, remitente, destinatario, recaudo, divisa, relacion_despacho, convenio_efficommerce, dropshipping, responsable, desde, hasta, envio_desde, envio_hasta, estado_final_desde, estado_final_hasta, id/pais/provincia/ciudad del remitente y del destinatario y vigente (los demás se ignoran). Es la vía recomendada para rankings y totales por periodo (p. ej. guías por transportadora o por ciudad de destino del año) en lugar de recorrer páginas. Requiere permiso de consulta sobre la función: Guías de transporte.

Ejemplo: `GET api/guia_transporte?desde=2026-01-01&hasta=2026-12-31&pagina=1&por_pagina=100`

### Parámetros

| Nombre | Tipo | Req. | Descripción |
|---|---|---|---|
| `agrupar_por` | string |  | Dimensión del resumen agregado. Si se envía, la respuesta cambia: data trae una fila por grupo {clave (id de la dimensión; YYYY-MM-DD, YYYY-MM o YYYY en dia/mes/anio), nombre (texto de la dimensión), cantidad (guías), valor_flete, valor_recaudo, valor_declarado, entregadas (estado global Effi 4), devoluciones (5), con_novedad (3), dias_entrega_acumulados y guias_con_estado_final (días entre la creación y el estado final de las guías finalizadas: dias_entrega_acumulados / guias_con_estado_final = días promedio de entrega)} y resumen trae {agrupar_por, limite, grupos, totales}; no hay paginación y no aplica el tope de fechas. Combínelo con desde y hasta para acotar el periodo. Un valor fuera de la lista responde 400 con las dimensiones válidas. Valores: `transportadora` Transportadora (de la empresa), `transportadora_efficommerce` Transportadora Effi (convenio), `est_guia_efficommerce` Estado global Effi, `sucursal` Sucursal, `centro_costos` Centro de costos, `pais_destinatario` País de destino, `provincia_destinatario` Departamento de destino, `ciudad_destinatario` Ciudad de destino, `dia` Día (YYYY-MM-DD), `mes` Mes (YYYY-MM), `anio` Año (YYYY) |
| `limite` | integer |  | Solo con agrupar_por: máximo de grupos (filas) del resumen, ordenados por cantidad de guías descendente. Por defecto 500, máximo 1000. |
| `sucursal` | integer |  | Filtrar por el id de la sucursal de la guía (ver api/sucursal). En el web es una lista desplegable dinámica. |
| `ubicacion_venta` | integer |  | Filtrar por el id de la ubicación de venta de la guía (ver api/ubicacion_venta). Lista desplegable dinámica en el web (se carga al elegir la sucursal). |
| `centro_costos` | integer |  | Filtrar por el id del centro de costos (ver api/centro_costos). En el web es una lista desplegable dinámica. |
| `id` | integer |  | Filtrar por el id interno de la guía (máximo 13 dígitos). El id se repite entre sucursales (la clave es empresa + sucursal + id): combínelo con sucursal. Con este filtro no se aplica el tope de fecha por defecto. |
| `guia` | string |  | Filtrar por el número exacto de la guía inicial asignado por la transportadora (máximo 20 caracteres; también coincide si el número almacenado tiene un 0 adelante). Con este filtro no se aplica el tope de fecha por defecto. |
| `guia_adicional` | string |  | Filtrar por el número exacto de la guía de devolución (reemplazatoria) asignado por la transportadora (máximo 20 caracteres). Con este filtro no se aplica el tope de fecha por defecto. |
| `existe_guia` | integer |  | Filtrar por si la guía ya tiene número asignado por la transportadora: 1 con número; 0 sin número. Solo se aplica si se envía. Valores: `1` Si, `0` No |
| `convenio_efficommerce` | integer |  | Filtrar por el tipo de transportadora: 1 guías de transportadoras Effi (transportadora_efficommerce no nulo); 0 guías de transportadoras propias. Solo se aplica si se envía. Valores: `1` Transportadora EFFI, `0` Transportadora propia |
| `transportadora_efficommerce` | integer |  | Filtrar por el id de la transportadora Effi (ver api/transportadora_efficommerce). En el web es una lista desplegable dinámica. Solo se aplica si se envía (no enviar vacío). |
| `transportadora` | integer |  | Filtrar por el id de la transportadora de la empresa (ver api/transportadora). En el web es una lista desplegable dinámica. |
| `t_servicio` | integer |  | Filtrar por el id del tipo de servicio de la transportadora (columna id_t_servicio). Lista desplegable dinámica en el web (se carga al elegir la transportadora). |
| `est_guia` | integer |  | Filtrar por el id del estado de la guía según la transportadora (est_guia_transportadora; los ids dependen de cada transportadora). Lista desplegable dinámica en el web (se carga al elegir la transportadora). |
| `est_guia_efficommerce` | string |  | Filtrar por el estado global Effi de la guía inicial (ver api/est_guia_efficommerce). Admite varios ids separados por coma (ej. 1,2): lista las guías que cumplan al menos uno, igual que la selección múltiple del web. |
| `remitente` | integer |  | Filtrar por el código del remitente (columna codigo de api/remitente). En el web es una lista desplegable dinámica. |
| `destinatario` | integer |  | Filtrar por el código del tercero destinatario (columna destinatario). En el web se elige con el buscador de terceros. |
| `relacion_despacho` | integer |  | Filtrar por si la guía está incluida en una relación de despacho: 1 sí (empresa_relacion_despacho no nulo); 0 no. Solo se aplica si se envía. Valores: `1` Si, `0` No |
| `id_ref` | integer |  | Filtrar por el id del documento de venta de referencia de la guía (columna id_ref; en la respuesta va con t_trans_ref, sucursal_ref y prefijo_ref). Con este filtro no se aplica el tope de fecha por defecto. |
| `responsable` | string |  | Filtrar por el usuario (correo) que creó la guía. En el web es una lista desplegable dinámica de los usuarios de la empresa. |
| `desde` | date |  | Fecha de creación (fecha_trans) mayor o igual a la indicada. Formato YYYY-MM-DD o YYYY-MM-DD HH:MM:SS, interpretada en la zona horaria de la empresa. Recomendado enviarlo siempre: sin él (y sin id, guia, guia_adicional ni id_ref) solo se listan las guías creadas desde el día anterior. |
| `hasta` | date |  | Fecha de creación (fecha_trans) menor o igual a la indicada. Formato YYYY-MM-DD o YYYY-MM-DD HH:MM:SS, interpretada en la zona horaria de la empresa. |
| `envio_desde` | date |  | Fecha de envío (fecha_envio) mayor o igual a la indicada (YYYY-MM-DD; se compara tal cual contra el valor almacenado). |
| `envio_hasta` | date |  | Fecha de envío (fecha_envio) menor o igual a la indicada (YYYY-MM-DD; se compara tal cual contra el valor almacenado). |
| `estado_final_desde` | date |  | Fecha en que la guía llegó a su estado final (fecha_estado_final) mayor o igual a la indicada (YYYY-MM-DD o YYYY-MM-DD HH:MM:SS; se compara tal cual contra el valor almacenado). |
| `estado_final_hasta` | date |  | Fecha en que la guía llegó a su estado final (fecha_estado_final) menor o igual a la indicada (YYYY-MM-DD o YYYY-MM-DD HH:MM:SS; se compara tal cual contra el valor almacenado). |
| `entrega_esperada_desde` | date |  | Fecha de entrega esperada (fecha_entrega_esperada) mayor o igual a la indicada (YYYY-MM-DD). |
| `entrega_esperada_hasta` | date |  | Fecha de entrega esperada (fecha_entrega_esperada) menor o igual a la indicada (YYYY-MM-DD). |
| `id_remitente` | string |  | Filtrar por el número de documento de identidad del remitente (columna id_remitente; máximo 13 caracteres). |
| `pais_remitente` | integer |  | Filtrar por el id del país del remitente (ver api/pais). En el web es una lista desplegable dinámica. |
| `provincia_remitente` | integer |  | Filtrar por el id del departamento/provincia del remitente (ver api/provincia). Lista desplegable dinámica en el web (se carga al elegir el país). |
| `ciudad_remitente` | integer |  | Filtrar por el id de la ciudad del remitente (ver api/ciudad). Lista desplegable dinámica en el web (se carga al elegir el departamento). |
| `recaudo` | integer |  | Filtrar por la marca de recaudo contra entrega: 1 con recaudo; 0 sin recaudo. Solo se aplica si se envía. Valores: `1` Si, `0` No |
| `divisa` | string |  | Filtrar por el código ISO de la moneda de la guía (ej. COP, USD, GTQ). En el web es una lista desplegable dinámica con las monedas de las empresas Effi. |
| `id_destinatario` | string |  | Filtrar por el número de documento de identidad del destinatario (columna id_destinatario; máximo 13 caracteres). |
| `pais_destinatario` | integer |  | Filtrar por el id del país del destinatario (ver api/pais). En el web es una lista desplegable dinámica. |
| `provincia_destinatario` | integer |  | Filtrar por el id del departamento/provincia del destinatario (ver api/provincia). Lista desplegable dinámica en el web (se carga al elegir el país). |
| `ciudad_destinatario` | integer |  | Filtrar por el id de la ciudad del destinatario (ver api/ciudad). Lista desplegable dinámica en el web (se carga al elegir el departamento). |
| `liquidacion_efficommerce` | integer |  | Filtrar por la marca de liquidación definitiva Efficommerce: 1 liquidada; 0 no. Solo se aplica si se envía. En el web solo aparece si la empresa tiene transportadoras Effi o convenios dropshipping vigentes. Valores: `1` Si, `0` No |
| `recaudo_efficommerce` | integer |  | Filtrar por la marca de liquidación con recaudo Efficommerce: 1 sí; 0 no. Solo se aplica si se envía. Valores: `1` Si, `0` No |
| `sin_recaudo_efficommerce` | integer |  | Filtrar por la marca de liquidación sin recaudo Efficommerce: 1 sí; 0 no. Solo se aplica si se envía. Valores: `1` Si, `0` No |
| `devolucion_efficommerce` | integer |  | Filtrar por la marca de liquidación de devolución Efficommerce: 1 sí; 0 no. Solo se aplica si se envía. Valores: `1` Si, `0` No |
| `indemnizacion_efficommerce` | integer |  | Filtrar por la marca de liquidación de indemnización Efficommerce: 1 sí; 0 no. Solo se aplica si se envía. Valores: `1` Si, `0` No |
| `alistamiento_efficommerce` | integer |  | Filtrar por la marca de liquidación de alistamiento Efficommerce: 1 sí; 0 no. Solo se aplica si se envía. Valores: `1` Si, `0` No |
| `convenio_dropshipping` | integer |  | Filtrar por el código del convenio dropshipping de la transacción (codigo_convenio). Lista desplegable dinámica en el web (solo visible si la empresa tiene convenios o es empresa Effi). |
| `dropshipping` | integer |  | Filtrar por si la guía pertenece a una transacción dropshipping: 1 sí (tiene empresa proveedora); 0 no. Solo se aplica si se envía. Valores: `1` Si, `0` No |
| `dropshipping_proveedor` | integer |  | Filtrar por guías en las que la empresa de la API key actúa como proveedor dropshipping: 1 sí; 0 las demás. Solo se aplica si se envía. Valores: `1` Si, `0` No |
| `dropshipping_distribuidor` | integer |  | Filtrar por guías en las que la empresa de la API key actúa como distribuidor dropshipping: 1 sí; 0 las demás. Solo se aplica si se envía. Valores: `1` Si, `0` No |
| `est_transaccion_dropshipping` | integer |  | Filtrar por el id del estado de la transacción dropshipping (1 = Pendiente de aprobación, 2 = Aprobada, 3 = Rechazada). En el web es una lista desplegable dinámica. |
| `id_est_guia` | integer |  | Filtrar por el id del estado de la guía inicial según la transportadora (columna est_guia) escribiéndolo directamente, sin elegir transportadora. En el web solo aparece para empresas Effi. |
| `logistica_efficommerce` | integer |  | Filtrar por la marca de bodega Efficommerce (fulfillment): 1 guías despachadas desde bodega Efficommerce; 0 las demás. Solo se aplica si se envía. En el web solo aparece para empresas Effi. Valores: `1` Si, `0` No |
| `t_plan_empresa` | integer |  | Filtrar por el id del tipo de plan de la empresa dueña de la guía (tabla t_plan: 1 LIMITED, 2 START, 3 PRO, 4 a 10 BUSINESS, 11 a 14 ENTERPRISE, 15 a 19 CORPORATE, 99 FREE ECOMMERCE, 999 Ilimitado). En el web solo aparece para empresas Effi. |
| `pago_anticipado` | integer |  | Enviar 1 para listar solo las guías de transportadoras Effi con recaudo (valor_recaudo mayor que 0) de la guía inicial y sin guía de devolución, que aplican para pago anticipado. Con este filtro no se aplica el tope de fecha por defecto. En el web solo aparece para empresas Effi. Valores: `1` Si |
| `recaudo_efficommerce_transportadora` | integer |  | Filtrar por si la transportadora ya pagó el recaudo a Efficommerce: 1 pagado; 0 pendiente de pago. Solo se aplica si se envía. En el web solo aparece para empresas Effi. Valores: `1` Pagado a Efficommerce, `0` Pendiente de pago a Efficommerce |
| `vigente` | integer |  | Si no se envía se listan vigentes y anuladas (como el web con "Seleccionar..."). Enviar vigente=1 para listar solo las vigentes o vigente=0 para listar solo las anuladas. Valores: `1` Vigente, `0` Anulada |
| `pagina` | integer |  | Número de página. Por defecto 1. |
| `por_pagina` | integer |  | Registros por página. Por defecto 100, máximo 100. |

### Campos de respuesta

| Campo | Descripción |
|---|---|
| `id` | Identificador interno de la guía. Se repite entre sucursales: la clave única es empresa + sucursal + id. |
| `prefijo` | Prefijo de la transacción en la sucursal (vacío si la sucursal no usa prefijo). |
| `id_transaccion` | Identificador visible prefijo-id, como en el ERP. |
| `empresa` | Id de la empresa dueña de la guía (puede ser distinta de la del token: distribuidores dropshipping o empresas administradas por una matriz Effi). |
| `nombre_empresa` | Nombre de la empresa dueña de la guía (texto de empresa). |
| `fecha_trans` | Fecha y hora de creación de la guía, en UTC tal como está almacenada en la base de datos. |
| `fecha_envio` | Fecha de envío (YYYY-MM-DD). |
| `fecha_entrega_esperada` | Fecha de entrega esperada (YYYY-MM-DD). |
| `fecha_guia_adicional` | Fecha y hora en que se generó la guía de devolución (null si no tiene). |
| `fecha_estado_final` | Fecha y hora en que la guía inicial llegó a su estado final (null si aún está en proceso). |
| `fecha_estado_final_guia_adicional` | Fecha y hora en que la guía de devolución llegó a su estado final (null si no aplica). |
| `fecha_anular` | Fecha y hora de anulación de la guía (null si está vigente). |
| `sucursal` | Id de la sucursal de la guía. |
| `nombre_sucursal` | Nombre de la sucursal (texto de sucursal). |
| `centro_costos` | Id del centro de costos. |
| `nombre_centro_costos` | Nombre del centro de costos (texto de centro_costos). |
| `ubicacion_venta` | Id de la ubicación de venta (null si no aplica). |
| `nombre_ubicacion_venta` | Nombre de la ubicación de venta (texto de ubicacion_venta). |
| `remitente` | Código del remitente (codigo de api/remitente). |
| `nombre_remitente` | Nombre del remitente (texto de remitente). |
| `dni_remitente` | Id del tipo de documento de identidad del remitente (t_dni). |
| `abreviacion_remitente` | Abreviatura del tipo de documento del remitente (texto de dni_remitente), ej. NIT, CC. |
| `id_remitente` | Número de identificación del remitente. |
| `pais_remitente` | Id del país del remitente. |
| `nombre_pais_remitente` | Nombre del país del remitente (texto de pais_remitente). |
| `provincia_remitente` | Id del departamento/provincia del remitente. |
| `nombre_provincia_remitente` | Nombre del departamento/provincia del remitente (texto de provincia_remitente). |
| `ciudad_remitente` | Id de la ciudad del remitente. |
| `nombre_ciudad_remitente` | Nombre de la ciudad del remitente (texto de ciudad_remitente). |
| `direccion_remitente` | Dirección de recogida del remitente. |
| `telefonos_remitente` | Teléfonos del remitente. |
| `destinatario` | Código del tercero destinatario. |
| `nombre_destinatario` | Nombre del destinatario (texto de destinatario). |
| `dni_destinatario` | Id del tipo de documento de identidad del destinatario (t_dni). |
| `abreviacion_destinatario` | Abreviatura del tipo de documento del destinatario (texto de dni_destinatario), ej. NIT, CC. |
| `id_destinatario` | Número de identificación del destinatario. |
| `pais_destinatario` | Id del país del destinatario. |
| `nombre_pais_destinatario` | Nombre del país del destinatario (texto de pais_destinatario). |
| `provincia_destinatario` | Id del departamento/provincia del destinatario. |
| `nombre_provincia_destinatario` | Nombre del departamento/provincia del destinatario (texto de provincia_destinatario). |
| `ciudad_destinatario` | Id de la ciudad del destinatario. |
| `nombre_ciudad_destinatario` | Nombre de la ciudad del destinatario (texto de ciudad_destinatario). |
| `direccion_destinatario` | Dirección de entrega del destinatario. |
| `telefonos_destinatario` | Teléfonos del destinatario. |
| `transportadora` | Id de la transportadora de la empresa (api/transportadora). |
| `nombre_transportadora` | Nombre de la transportadora (texto de transportadora). |
| `transportadora_efficommerce` | Id de la transportadora Effi (null si es una transportadora propia). |
| `nombre_transportadora_efficommerce` | Nombre de la transportadora Effi (texto de transportadora_efficommerce). |
| `guia` | Número de la guía inicial asignado por la transportadora (null o vacío si aún no tiene). |
| `guia_adicional` | Número de la guía de devolución (reemplazatoria) asignado por la transportadora (null si no tiene). |
| `id_t_servicio` | Id del tipo de servicio de la transportadora. |
| `servicio` | Nombre del tipo de servicio (texto de id_t_servicio), ej. Paquetería (1Kg-45Kg). |
| `peso_total` | Peso total del envío en kilogramos. |
| `cant_paquetes` | Cantidad de paquetes del envío. |
| `t_forma_pago` | Id de la forma de pago del flete. |
| `forma_pago` | Nombre de la forma de pago del flete (texto de t_forma_pago), ej. Crédito, Contado. |
| `contenido` | Descripción del contenido del envío impresa en la guía. |
| `t_trans_ref` | Id del tipo de documento de venta de referencia (1 = Factura de venta, 4 = Nota de remisión de venta; null si la guía no se generó desde un documento). |
| `tipo_trans_ref` | Nombre del tipo de documento de referencia (texto de t_trans_ref). |
| `sucursal_ref` | Sucursal del documento de venta de referencia. |
| `prefijo_ref` | Prefijo del documento de venta de referencia. |
| `id_ref` | Id del documento de venta de referencia. |
| `transaccion_dropshipping` | Id de la transacción dropshipping asociada (null si no es dropshipping). |
| `convenio_dropshipping` | Código del convenio dropshipping de la transacción. |
| `nombre_convenio_dropshipping` | Nombre del convenio dropshipping (texto de convenio_dropshipping). |
| `est_transaccion_dropshipping` | Id del estado de la transacción dropshipping (1 = Pendiente de aprobación, 2 = Aprobada, 3 = Rechazada). |
| `estado_dropshipping` | Nombre del estado de la transacción dropshipping (texto de est_transaccion_dropshipping). |
| `empresa_proveedor` | Id de la empresa proveedora en la transacción dropshipping. |
| `nombre_empresa_proveedor` | Nombre de la empresa proveedora (texto de empresa_proveedor). |
| `t_trans_venta_proveedor` | Id del tipo de documento de venta generado al proveedor dropshipping. |
| `tipo_trans_venta_proveedor` | Nombre del tipo de documento de venta del proveedor (texto de t_trans_venta_proveedor). |
| `sucursal_venta_proveedor` | Sucursal del documento de venta del proveedor. |
| `prefijo_venta_proveedor` | Prefijo del documento de venta del proveedor. |
| `id_venta_proveedor` | Id del documento de venta del proveedor. |
| `empresa_distribuidor` | Id de la empresa distribuidora en la transacción dropshipping. |
| `nombre_empresa_distribuidor` | Nombre de la empresa distribuidora (texto de empresa_distribuidor). |
| `t_trans_venta_distribuidor` | Id del tipo de documento de venta del distribuidor dropshipping. |
| `tipo_trans_venta_distribuidor` | Nombre del tipo de documento de venta del distribuidor (texto de t_trans_venta_distribuidor). |
| `sucursal_venta_distribuidor` | Sucursal del documento de venta del distribuidor. |
| `prefijo_venta_distribuidor` | Prefijo del documento de venta del distribuidor. |
| `id_venta_distribuidor` | Id del documento de venta del distribuidor. |
| `divisa` | Código ISO de la moneda de los valores de la guía. |
| `valor_declarado` | Valor declarado de la mercancía. |
| `recaudo` | 1 si la guía tiene recaudo contra entrega; 0 si no. |
| `valor_recaudo` | Valor a recaudar contra entrega. |
| `costo_flete_api_calculado` | Costo del flete calculado por la API de la transportadora. |
| `costo_manejo_api_calculado` | Costo de manejo calculado por la API de la transportadora. |
| `costo_otros_api_calculado` | Otros costos calculados por la API de la transportadora. |
| `valor_flete` | Valor total del flete de la guía. |
| `descuento` | Descuento aplicado al flete. |
| `est_guia` | Id del estado de la guía inicial según la transportadora (est_guia_transportadora). |
| `estado` | Nombre del estado de la guía inicial según la transportadora (texto de est_guia). |
| `est_guia_efficommerce` | Id del estado global Effi de la guía inicial (ver api/est_guia_efficommerce). |
| `estado_efficommerce` | Nombre del estado global Effi de la guía inicial (texto de est_guia_efficommerce). |
| `est_guia_adicional` | Id del estado de la guía de devolución según la transportadora (null si no tiene). |
| `estado_adicional` | Nombre del estado de la guía de devolución según la transportadora (texto de est_guia_adicional). |
| `est_guia_adicional_efficommerce` | Id del estado global Effi de la guía de devolución (null si no tiene). |
| `estado_adicional_efficommerce` | Nombre del estado global Effi de la guía de devolución (texto de est_guia_adicional_efficommerce). |
| `empresa_relacion_despacho` | Id de la empresa de la relación de despacho que incluye la guía (null si no está en una relación). |
| `nombre_empresa_relacion_despacho` | Nombre de la empresa de la relación de despacho (texto de empresa_relacion_despacho). |
| `sucursal_relacion_despacho` | Sucursal de la relación de despacho. |
| `prefijo_relacion_despacho` | Prefijo de la relación de despacho. |
| `id_relacion_despacho` | Id de la relación de despacho. |
| `responsable` | Usuario (correo) que creó la guía. |
| `nombre_responsable` | Nombres y apellidos del usuario que creó la guía (texto de responsable). |
| `liquidacion_efficommerce` | 1 si la guía ya tiene liquidación definitiva Efficommerce; 0 si no. |
| `recaudo_efficommerce` | 1 si la guía fue liquidada con recaudo por Efficommerce; 0 si no. |
| `sin_recaudo_efficommerce` | 1 si la guía fue liquidada sin recaudo por Efficommerce; 0 si no. |
| `devolucion_efficommerce` | 1 si la devolución fue liquidada por Efficommerce; 0 si no. |
| `indemnizacion_efficommerce` | 1 si la indemnización fue liquidada por Efficommerce; 0 si no. |
| `alistamiento_efficommerce` | 1 si el alistamiento fue liquidado por Efficommerce; 0 si no. |
| `logistica_efficommerce` | 1 si la guía se despachó desde una bodega Efficommerce (fulfillment); 0 si no. |
| `recaudo_efficommerce_transportadora` | 1 si la transportadora ya pagó el recaudo a Efficommerce; 0 si está pendiente. |
| `vigente` | 1 si la guía está vigente; 0 si está anulada. |

### Ejemplo de respuesta

```json
{
  "ok": true,
  "data": [
    {
      "id": "62",
      "prefijo": "",
      "id_transaccion": "62",
      "empresa": "7225",
      "nombre_empresa": "Comercializadora Andina S.A.S.",
      "fecha_trans": "2026-09-18 23:35:51",
      "fecha_envio": "2025-02-15",
      "fecha_entrega_esperada": "2025-02-15",
      "fecha_guia_adicional": null,
      "fecha_estado_final": null,
      "fecha_estado_final_guia_adicional": null,
      "fecha_anular": null,
      "sucursal": "1",
      "nombre_sucursal": "Principal",
      "centro_costos": "1",
      "nombre_centro_costos": "Principal",
      "ubicacion_venta": null,
      "nombre_ubicacion_venta": null,
      "remitente": "1",
      "nombre_remitente": "Comercializadora Andina S.A.S.",
      "dni_remitente": "48",
      "abreviacion_remitente": "NIT",
      "id_remitente": "900123456",
      "pais_remitente": "90",
      "nombre_pais_remitente": "Guatemala",
      "provincia_remitente": "1529",
      "nombre_provincia_remitente": "Guatemala",
      "ciudad_remitente": "59951",
      "nombre_ciudad_remitente": "Santa Catarina Pinula (El Prado)",
      "direccion_remitente": "Calle 10 # 20-30",
      "telefonos_remitente": "3001234567",
      "destinatario": "3",
      "nombre_destinatario": "Ana Pérez",
      "dni_destinatario": "48",
      "abreviacion_destinatario": "NIT",
      "id_destinatario": "1020304050",
      "pais_destinatario": "90",
      "nombre_pais_destinatario": "Guatemala",
      "provincia_destinatario": "1536",
      "nombre_provincia_destinatario": "Quiche",
      "ciudad_destinatario": "64504",
      "nombre_ciudad_destinatario": "Chiche (Trinidad)",
      "direccion_destinatario": "Avenida 3 # 45-67",
      "telefonos_destinatario": "3001234567",
      "transportadora": "7",
      "nombre_transportadora": "CARGO EXPRESO GT | CON RECAUDO | FLETE CRÉDITO",
      "transportadora_efficommerce": "14",
      "nombre_transportadora_efficommerce": "CARGO EXPRESO",
      "guia": "1234567890",
      "guia_adicional": null,
      "id_t_servicio": "1",
      "servicio": "Paquetería (1Kg-45Kg)",
      "peso_total": "1.00",
      "cant_paquetes": "1",
      "t_forma_pago": "1",
      "forma_pago": "Crédito",
      "contenido": "Paquete de ejemplo",
      "t_trans_ref": null,
      "tipo_trans_ref": null,
      "sucursal_ref": null,
      "prefijo_ref": null,
      "id_ref": null,
      "transaccion_dropshipping": null,
      "convenio_dropshipping": null,
      "nombre_convenio_dropshipping": null,
      "est_transaccion_dropshipping": null,
      "estado_dropshipping": null,
      "empresa_proveedor": null,
      "nombre_empresa_proveedor": null,
      "t_trans_venta_proveedor": null,
      "tipo_trans_venta_proveedor": null,
      "sucursal_venta_proveedor": null,
      "prefijo_venta_proveedor": null,
      "id_venta_proveedor": null,
      "empresa_distribuidor": null,
      "nombre_empresa_distribuidor": null,
      "t_trans_venta_distribuidor": null,
      "tipo_trans_venta_distribuidor": null,
      "sucursal_venta_distribuidor": null,
      "prefijo_venta_distribuidor": null,
      "id_venta_distribuidor": null,
      "divisa": "GTQ",
      "valor_declarado": "189.00",
      "recaudo": "1",
      "valor_recaudo": "189.00",
      "costo_flete_api_calculado": "29.50",
      "costo_manejo_api_calculado": "0.00",
      "costo_otros_api_calculado": "7.56",
      "valor_flete": "37.06",
      "descuento": "25.00",
      "est_guia": "1",
      "estado": "Sin Recolectar",
      "est_guia_efficommerce": "1",
      "estado_efficommerce": "Generada",
      "est_guia_adicional": null,
      "estado_adicional": null,
      "est_guia_adicional_efficommerce": null,
      "estado_adicional_efficommerce": null,
      "empresa_relacion_despacho": null,
      "nombre_empresa_relacion_despacho": null,
      "sucursal_relacion_despacho": null,
      "prefijo_relacion_despacho": null,
      "id_relacion_despacho": null,
      "responsable": "usuario@empresa.com",
      "nombre_responsable": "Laura Martínez",
      "liquidacion_efficommerce": "0",
      "recaudo_efficommerce": "0",
      "sin_recaudo_efficommerce": "0",
      "devolucion_efficommerce": "0",
      "indemnizacion_efficommerce": "0",
      "alistamiento_efficommerce": "0",
      "logistica_efficommerce": "0",
      "recaudo_efficommerce_transportadora": "0",
      "vigente": "1"
    },
    {
      "id": "61",
      "prefijo": "",
      "id_transaccion": "61",
      "empresa": "7225",
      "nombre_empresa": "Comercializadora Andina S.A.S.",
      "fecha_trans": "2026-09-18 23:33:46",
      "fecha_envio": "2025-02-15",
      "fecha_entrega_esperada": "2025-02-15",
      "fecha_guia_adicional": null,
      "fecha_estado_final": null,
      "fecha_estado_final_guia_adicional": null,
      "fecha_anular": null,
      "sucursal": "1",
      "nombre_sucursal": "Principal",
      "centro_costos": "1",
      "nombre_centro_costos": "Principal",
      "ubicacion_venta": null,
      "nombre_ubicacion_venta": null,
      "remitente": "1",
      "nombre_remitente": "Comercializadora Andina S.A.S.",
      "dni_remitente": "48",
      "abreviacion_remitente": "NIT",
      "id_remitente": "900123456",
      "pais_remitente": "90",
      "nombre_pais_remitente": "Guatemala",
      "provincia_remitente": "1529",
      "nombre_provincia_remitente": "Guatemala",
      "ciudad_remitente": "59951",
      "nombre_ciudad_remitente": "Santa Catarina Pinula (El Prado)",
      "direccion_remitente": "Calle 10 # 20-30",
      "telefonos_remitente": "3001234567",
      "destinatario": "3",
      "nombre_destinatario": "Carlos Gómez",
      "dni_destinatario": "48",
      "abreviacion_destinatario": "NIT",
      "id_destinatario": "1030405060",
      "pais_destinatario": "90",
      "nombre_pais_destinatario": "Guatemala",
      "provincia_destinatario": "1536",
      "nombre_provincia_destinatario": "Quiche",
      "ciudad_destinatario": "64504",
      "nombre_ciudad_destinatario": "Chiche (Trinidad)",
      "d
```

---

## <a id="hist_est_guia_transporte"></a>GET `api/hist_est_guia_transporte` — Consultar cambios de estado de guías de transporte

Devuelve el histórico de cambios de estado de las guías de transporte de la empresa asociada a la API key: cada registro es UN cambio de estado (fecha, nuevo estado de la transportadora, nuevo estado global Effi, observación, foto y usuario que lo registró) con los datos de su guía tal como los muestra la tabla de consulta del web (fechas de cambio de estado y de creación, ubicación, identificador visible y números de guía inicial y de devolución, remitente y destinatario con identificación, dígito de verificación, ubicación y contacto, transportadora propia y transportadora Effi, servicio, forma de pago del flete, moneda y valores, documento de venta de referencia, datos de dropshipping y contenido) más las columnas de los filtros; cada id de otra tabla va seguido de su nombre. La misma guía aparece tantas veces como cambios de estado tenga en el rango consultado. Es una tabla muy pesada: el parámetro cambio_estado_desde es obligatorio; si no se envía cambio_estado_hasta se asume hoy (fin del día en la zona horaria de la empresa) y el rango entre ambos no puede superar 31 días calendario; si falta el desde, las fechas no son válidas, el hasta es anterior al desde o el rango supera 31 días, responde 400. Igual que en el web, además de las guías propias se listan las guías de distribuidores en las que la empresa es el proveedor dropshipping. La clave de una guía es empresa + sucursal + id (el id se repite entre sucursales): combine siempre sucursal e id. Se listan del cambio de estado más reciente al más antiguo. Los filtros son los mismos del bloque de búsqueda del histórico de cambios de estado del web (se llaman igual que las columnas); los filtros de marca (1/0) se aplican solo si se envían: no envíe el parámetro vacío. Si no se envía vigente se listan vigentes y anuladas (como el web con "Seleccionar..."); vigente=1 lista solo las vigentes y vigente=0 solo las anuladas. Requiere permiso de consulta sobre la función: Cambios de estado de guías de transporte.

Ejemplo: `GET api/hist_est_guia_transporte?cambio_estado_desde=2026-08-04&cambio_estado_hasta=2026-09-03&pagina=1&por_pagina=100`

### Parámetros

| Nombre | Tipo | Req. | Descripción |
|---|---|---|---|
| `cambio_estado_desde` | date | sí | OBLIGATORIO. Fecha del cambio de estado (fecha_hist_est) mayor o igual a la indicada. Formato YYYY-MM-DD o YYYY-MM-DD HH:MM:SS, interpretada en la zona horaria de la empresa. El rango hasta cambio_estado_hasta no puede superar 31 días calendario. |
| `cambio_estado_hasta` | date |  | Fecha del cambio de estado (fecha_hist_est) menor o igual a la indicada. Formato YYYY-MM-DD o YYYY-MM-DD HH:MM:SS, interpretada en la zona horaria de la empresa. Si no se envía se asume hoy (fin del día). No puede ser anterior a cambio_estado_desde ni superar 31 días calendario desde ella. |
| `guia_inicial_adicional` | integer |  | Filtrar por el tipo de guía a la que pertenece el cambio de estado: 1 guía inicial. Igual que en el web, el valor 0 (guía devolución) no aplica el filtro porque el modelo lo evalúa con !empty. Valores: `1` Guía inicial, `0` Guía devolución |
| `est_guia_new` | integer |  | Filtrar por el id del nuevo estado de la guía según la transportadora (est_guia_transportadora; los ids dependen de cada transportadora; máximo 13 dígitos). |
| `estado_new` | string |  | Filtrar por el nombre del nuevo estado (coincidencia parcial, sin distinguir mayúsculas; máximo 60 caracteres). |
| `est_guia_new_efficommerce` | integer |  | Filtrar por el id del nuevo estado global Effi de la guía (ver api/est_guia_efficommerce). En el web es una lista desplegable dinámica. |
| `responsable_cambio_estado` | string |  | Filtrar por el usuario (correo) que registró el cambio de estado (columna responsable de hist_est_guia_transporte; en la respuesta va como responsable_cambio). En el web es una lista desplegable dinámica de los usuarios de la empresa. |
| `sucursal` | integer |  | Filtrar por el id de la sucursal de la guía (ver api/sucursal). En el web es una lista desplegable dinámica. |
| `ubicacion_venta` | integer |  | Filtrar por el id de la ubicación de venta de la guía (ver api/ubicacion_venta). Lista desplegable dinámica en el web (se carga al elegir la sucursal). |
| `id` | integer |  | Filtrar por el id interno de la guía (máximo 13 dígitos). El id se repite entre sucursales (la clave es empresa + sucursal + id): combínelo con sucursal. |
| `guia` | string |  | Filtrar por el número exacto de la guía inicial asignado por la transportadora (máximo 20 caracteres). |
| `existe_guia` | integer |  | Filtrar por si la guía ya tiene número asignado por la transportadora: 1 con número; 0 sin número. Solo se aplica si se envía. Valores: `1` Si, `0` No |
| `id_ref` | integer |  | Filtrar por el id del documento de venta de referencia de la guía (columna id_ref; en la respuesta va con t_trans_ref, sucursal_ref y prefijo_ref). |
| `centro_costos` | integer |  | Filtrar por el id del centro de costos (ver api/centro_costos). En el web es una lista desplegable dinámica. |
| `transportadora_efficommerce` | integer |  | Filtrar por el id de la transportadora Effi (ver api/transportadora_efficommerce). En el web es una lista desplegable dinámica. Solo se aplica si se envía (no enviar vacío). |
| `transportadora` | integer |  | Filtrar por el id de la transportadora de la empresa (ver api/transportadora). En el web es una lista desplegable dinámica. |
| `t_servicio` | integer |  | Filtrar por el id del tipo de servicio de la transportadora (columna t_servicio de la guía). Lista desplegable dinámica en el web (se carga al elegir la transportadora). |
| `t_forma_pago_flete` | integer |  | Filtrar por el id de la forma de pago del flete (columna t_forma_pago de la guía). El modelo lo evalúa aunque el bloque de búsqueda del web no lo muestra. |
| `est_guia` | integer |  | Filtrar por el id del estado ACTUAL de la guía inicial según la transportadora (columna est_guia de la guía; los ids dependen de cada transportadora). Lista desplegable dinámica en el web (se carga al elegir la transportadora). |
| `est_guia_efficommerce` | integer |  | Filtrar por el id del estado global Effi ACTUAL de la guía inicial (ver api/est_guia_efficommerce). En el web es una lista desplegable dinámica. |
| `remitente` | integer |  | Filtrar por el código del remitente (columna codigo de api/remitente). En el web es una lista desplegable dinámica. |
| `destinatario` | integer |  | Filtrar por el código del tercero destinatario (columna destinatario). En el web se elige con el buscador de terceros. |
| `relacion_despacho` | integer |  | Filtrar por si la guía está incluida en una relación de despacho: 1 sí (id_relacion_despacho no nulo); 0 no. Solo se aplica si se envía. Valores: `1` Si, `0` No |
| `responsable` | string |  | Filtrar por el usuario (correo) que creó la guía. En el web es una lista desplegable dinámica de los usuarios de la empresa. |
| `desde` | date |  | Fecha de creación de la guía (fecha_trans) mayor o igual a la indicada. Formato YYYY-MM-DD o YYYY-MM-DD HH:MM:SS, interpretada en la zona horaria de la empresa. |
| `hasta` | date |  | Fecha de creación de la guía (fecha_trans) menor o igual a la indicada. Formato YYYY-MM-DD o YYYY-MM-DD HH:MM:SS, interpretada en la zona horaria de la empresa. |
| `envio_desde` | date |  | Fecha de envío (fecha_envio) mayor o igual a la indicada (YYYY-MM-DD; se compara tal cual contra el valor almacenado). |
| `envio_hasta` | date |  | Fecha de envío (fecha_envio) menor o igual a la indicada (YYYY-MM-DD; se compara tal cual contra el valor almacenado). |
| `entrega_esperada_desde` | date |  | Fecha de entrega esperada (fecha_entrega_esperada) mayor o igual a la indicada (YYYY-MM-DD). |
| `entrega_esperada_hasta` | date |  | Fecha de entrega esperada (fecha_entrega_esperada) menor o igual a la indicada (YYYY-MM-DD). |
| `id_remitente` | string |  | Filtrar por el número de documento de identidad del remitente (columna id_remitente; máximo 13 caracteres). |
| `pais_remitente` | integer |  | Filtrar por el id del país del remitente (ver api/pais). En el web es una lista desplegable dinámica. |
| `provincia_remitente` | integer |  | Filtrar por el id del departamento/provincia del remitente (ver api/provincia). Lista desplegable dinámica en el web (se carga al elegir el país). |
| `ciudad_remitente` | integer |  | Filtrar por el id de la ciudad del remitente (ver api/ciudad). Lista desplegable dinámica en el web (se carga al elegir el departamento). |
| `direccion_remitente` | string |  | Filtrar por la dirección de recogida del remitente (coincidencia parcial, sin distinguir mayúsculas). |
| `recaudo` | integer |  | Filtrar por la marca de recaudo contra entrega: 1 con recaudo; 0 sin recaudo. Solo se aplica si se envía. Valores: `1` Si, `0` No |
| `id_destinatario` | string |  | Filtrar por el número de documento de identidad del destinatario (columna id_destinatario; máximo 13 caracteres). |
| `pais_destinatario` | integer |  | Filtrar por el id del país del destinatario (ver api/pais). En el web es una lista desplegable dinámica. |
| `provincia_destinatario` | integer |  | Filtrar por el id del departamento/provincia del destinatario (ver api/provincia). Lista desplegable dinámica en el web (se carga al elegir el país). |
| `ciudad_destinatario` | integer |  | Filtrar por el id de la ciudad del destinatario (ver api/ciudad). Lista desplegable dinámica en el web (se carga al elegir el departamento). |
| `direccion_destinatario` | string |  | Filtrar por la dirección de entrega del destinatario (coincidencia parcial, sin distinguir mayúsculas). |
| `convenio_efficommerce` | integer |  | Filtrar por el tipo de transportadora: 1 guías de transportadoras con convenio Effi; 0 guías de transportadoras propias. Solo se aplica si se envía. Valores: `1` Si, `0` No |
| `liquidacion_efficommerce` | integer |  | Filtrar por la marca de liquidación definitiva Efficommerce: 1 liquidada; 0 no. Solo se aplica si se envía. En el web solo aparece si la empresa tiene transportadoras Effi o convenios dropshipping vigentes. Valores: `1` Si, `0` No |
| `recaudo_efficommerce` | integer |  | Filtrar por la marca de liquidación con recaudo Efficommerce: 1 sí; 0 no. Solo se aplica si se envía. Valores: `1` Si, `0` No |
| `sin_recaudo_efficommerce` | integer |  | Filtrar por la marca de liquidación sin recaudo Efficommerce: 1 sí; 0 no. Solo se aplica si se envía. Valores: `1` Si, `0` No |
| `devolucion_efficommerce` | integer |  | Filtrar por la marca de liquidación de devolución Efficommerce: 1 sí; 0 no. Solo se aplica si se envía. Valores: `1` Si, `0` No |
| `indemnizacion_efficommerce` | integer |  | Filtrar por la marca de liquidación de indemnización Efficommerce: 1 sí; 0 no. Solo se aplica si se envía. Valores: `1` Si, `0` No |
| `alistamiento_efficommerce` | integer |  | Filtrar por la marca de liquidación de alistamiento Efficommerce: 1 sí; 0 no. Solo se aplica si se envía. Valores: `1` Si, `0` No |
| `convenio_dropshipping` | integer |  | Filtrar por el código del convenio dropshipping de la transacción (codigo_convenio). Lista desplegable dinámica en el web (solo visible si la empresa tiene convenios o es empresa Effi). |
| `dropshipping` | integer |  | Filtrar por si la guía pertenece a una transacción dropshipping: 1 sí; 0 no. Solo se aplica si se envía. Valores: `1` Si, `0` No |
| `dropshipping_proveedor` | integer |  | Filtrar por guías en las que la empresa de la API key actúa como proveedor dropshipping: 1 sí; 0 las demás. Solo se aplica si se envía. Valores: `1` Si, `0` No |
| `dropshipping_distribuidor` | integer |  | Filtrar por guías en las que la empresa de la API key actúa como distribuidor dropshipping: 1 sí; 0 las demás. Solo se aplica si se envía. Valores: `1` Si, `0` No |
| `est_transaccion_dropshipping` | integer |  | Filtrar por el id del estado de la transacción dropshipping (1 = Pendiente de aprobación, 2 = Aprobada, 3 = Rechazada). En el web es una lista desplegable dinámica. |
| `id_est_guia` | integer |  | Filtrar por el id del estado actual de la guía inicial según la transportadora (columna est_guia) escribiéndolo directamente, sin elegir transportadora. En el web solo aparece para empresas Effi. |
| `logistica_efficommerce` | integer |  | Filtrar por la marca de bodega Efficommerce (fulfillment): 1 guías despachadas desde bodega Efficommerce; 0 las demás. Solo se aplica si se envía. En el web solo aparece para empresas Effi. Valores: `1` Si, `0` No |
| `vigente` | integer |  | Vigencia de la guía. Si no se envía se listan vigentes y anuladas (como el web con "Seleccionar..."). Enviar vigente=1 para listar solo las vigentes o vigente=0 para listar solo las anuladas. Valores: `1` Vigente, `0` Anulada |
| `pagina` | integer |  | Número de página. Por defecto 1. |
| `por_pagina` | integer |  | Registros por página. Por defecto 100, máximo 100. |

### Campos de respuesta

| Campo | Descripción |
|---|---|
| `id` | Identificador interno de la guía a la que pertenece el cambio de estado. Se repite entre sucursales: la clave única es empresa + sucursal + id. |
| `prefijo` | Prefijo de la guía en la sucursal (vacío si la sucursal no usa prefijo). |
| `id_transaccion` | Identificador visible prefijo-id de la guía, como en el ERP. |
| `fecha_hist_est` | Fecha y hora del cambio de estado, en UTC tal como está almacenada en la base de datos. |
| `fecha_trans` | Fecha y hora de creación de la guía, en UTC tal como está almacenada en la base de datos. |
| `est_guia_new` | Id del nuevo estado de la guía según la transportadora (est_guia_transportadora). |
| `estado_new` | Nombre del nuevo estado según la transportadora (texto de est_guia_new). |
| `est_guia_new_efficommerce` | Id del nuevo estado global Effi de la guía (ver api/est_guia_efficommerce; null si el estado no tiene equivalente global). |
| `estado_new_efficommerce` | Nombre del nuevo estado global Effi (texto de est_guia_new_efficommerce). |
| `observacion_hist_est` | Observación registrada con el cambio de estado (null si no tiene). |
| `url_foto` | URL de la foto o evidencia adjunta al cambio de estado (null si no tiene). |
| `sucursal` | Id de la sucursal de la guía. |
| `nombre_sucursal` | Nombre de la sucursal (texto de sucursal). |
| `centro_costos` | Id del centro de costos de la guía. |
| `nombre_centro_costos` | Nombre del centro de costos (texto de centro_costos). |
| `ubicacion_venta` | Id de la ubicación de venta (null si no aplica). |
| `nombre_ubicacion_venta` | Nombre de la ubicación de venta (texto de ubicacion_venta). |
| `guia_inicial_adicional` | 1 si el cambio de estado es de la guía inicial; 0 si es de la guía de devolución (reemplazatoria). |
| `guia` | Número de la guía inicial asignado por la transportadora (null o vacío si aún no tiene). |
| `guia_adicional` | Número de la guía de devolución (reemplazatoria) asignado por la transportadora (null si no tiene). |
| `remitente` | Código del remitente (codigo de api/remitente). |
| `nombre_remitente` | Nombre del remitente (texto de remitente). |
| `dni_remitente` | Id del tipo de documento de identidad del remitente (t_dni). |
| `abreviacion_remitente` | Abreviatura del tipo de documento del remitente (texto de dni_remitente), ej. NIT, CC. |
| `id_remitente` | Número de identificación del remitente. |
| `dv_remitente` | Dígito de verificación del NIT del remitente, calculado como en el web; null cuando el tipo de documento no es NIT. |
| `pais_remitente` | Id del país del remitente. |
| `nombre_pais_remitente` | Nombre del país del remitente (texto de pais_remitente). |
| `provincia_remitente` | Id del departamento/provincia del remitente. |
| `nombre_provincia_remitente` | Nombre del departamento/provincia del remitente (texto de provincia_remitente). |
| `ciudad_remitente` | Id de la ciudad del remitente. |
| `nombre_ciudad_remitente` | Nombre de la ciudad del remitente (texto de ciudad_remitente). |
| `direccion_remitente` | Dirección de recogida del remitente. |
| `telefonos_remitente` | Teléfonos del remitente. |
| `destinatario` | Código del tercero destinatario. |
| `nombre_destinatario` | Nombre del destinatario (texto de destinatario). |
| `dni_destinatario` | Id del tipo de documento de identidad del destinatario (t_dni). |
| `abreviacion_destinatario` | Abreviatura del tipo de documento del destinatario (texto de dni_destinatario), ej. NIT, CC. |
| `id_destinatario` | Número de identificación del destinatario. |
| `dv_destinatario` | Dígito de verificación del NIT del destinatario, calculado como en el web; null cuando el tipo de documento no es NIT. |
| `pais_destinatario` | Id del país del destinatario. |
| `nombre_pais_destinatario` | Nombre del país del destinatario (texto de pais_destinatario). |
| `provincia_destinatario` | Id del departamento/provincia del destinatario. |
| `nombre_provincia_destinatario` | Nombre del departamento/provincia del destinatario (texto de provincia_destinatario). |
| `ciudad_destinatario` | Id de la ciudad del destinatario. |
| `nombre_ciudad_destinatario` | Nombre de la ciudad del destinatario (texto de ciudad_destinatario). |
| `direccion_destinatario` | Dirección de entrega del destinatario. |
| `telefonos_destinatario` | Teléfonos del destinatario. |
| `transportadora` | Id de la transportadora de la empresa (api/transportadora). |
| `nombre_transportadora` | Nombre de la transportadora (texto de transportadora). |
| `transportadora_efficommerce` | Id de la transportadora Effi (null si es una transportadora propia). |
| `nombre_transportadora_efficommerce` | Nombre de la transportadora Effi (texto de transportadora_efficommerce). |
| `t_servicio` | Id del tipo de servicio de la transportadora. |
| `servicio` | Nombre del tipo de servicio (texto de t_servicio), ej. Mercancía Premiere (1Kg-50Kg). |
| `t_forma_pago` | Id de la forma de pago del flete. |
| `forma_pago` | Nombre de la forma de pago del flete (texto de t_forma_pago), ej. Crédito, Contado. |
| `divisa` | Código ISO de la moneda de los valores de la guía. |
| `simbolo_moneda` | Símbolo de la moneda (texto de divisa), ej. $. |
| `valor_flete` | Valor total del flete de la guía. |
| `valor_declarado` | Valor declarado de la mercancía. |
| `recaudo` | 1 si la guía tiene recaudo contra entrega; 0 si no. |
| `valor_recaudo` | Valor a recaudar contra entrega. |
| `t_trans_ref` | Id del tipo de documento de venta de referencia (1 = Factura de venta, 4 = Nota de remisión de venta; null si la guía no se generó desde un documento). |
| `tipo_trans_ref` | Nombre del tipo de documento de referencia (texto de t_trans_ref). |
| `sucursal_ref` | Sucursal del documento de venta de referencia. |
| `prefijo_ref` | Prefijo del documento de venta de referencia. |
| `id_ref` | Id del documento de venta de referencia. |
| `transaccion_dropshipping` | Id de la transacción dropshipping asociada (null si no es dropshipping). |
| `convenio_dropshipping` | Código del convenio dropshipping de la transacción. |
| `nombre_convenio_dropshipping` | Nombre del convenio dropshipping (texto de convenio_dropshipping). |
| `est_transaccion_dropshipping` | Id del estado de la transacción dropshipping (1 = Pendiente de aprobación, 2 = Aprobada, 3 = Rechazada). |
| `estado_dropshipping` | Nombre del estado de la transacción dropshipping (texto de est_transaccion_dropshipping). |
| `empresa_proveedor` | Id de la empresa proveedora en la transacción dropshipping. |
| `nombre_empresa_proveedor` | Nombre de la empresa proveedora (texto de empresa_proveedor). |
| `t_trans_venta_proveedor` | Id del tipo de documento de venta generado al proveedor dropshipping. |
| `tipo_trans_venta_proveedor` | Nombre del tipo de documento de venta del proveedor (texto de t_trans_venta_proveedor). |
| `sucursal_venta_proveedor` | Sucursal del documento de venta del proveedor. |
| `prefijo_venta_proveedor` | Prefijo del documento de venta del proveedor. |
| `id_venta_proveedor` | Id del documento de venta del proveedor. |
| `empresa_distribuidor` | Id de la empresa distribuidora en la transacción dropshipping. |
| `nombre_empresa_distribuidor` | Nombre de la empresa distribuidora (texto de empresa_distribuidor). |
| `t_trans_venta_distribuidor` | Id del tipo de documento de venta del distribuidor dropshipping. |
| `tipo_trans_venta_distribuidor` | Nombre del tipo de documento de venta del distribuidor (texto de t_trans_venta_distribuidor). |
| `sucursal_venta_distribuidor` | Sucursal del documento de venta del distribuidor. |
| `prefijo_venta_distribuidor` | Prefijo del documento de venta del distribuidor. |
| `id_venta_distribuidor` | Id del documento de venta del distribuidor. |
| `contenido` | Descripción del contenido del envío impresa en la guía. |
| `est_guia` | Id del estado ACTUAL de la guía inicial según la transportadora (est_guia_transportadora). |
| `estado` | Nombre del estado actual de la guía inicial según la transportadora (texto de est_guia). |
| `est_guia_efficommerce` | Id del estado global Effi ACTUAL de la guía inicial (ver api/est_guia_efficommerce). |
| `estado_efficommerce` | Nombre del estado global Effi actual de la guía inicial (texto de est_guia_efficommerce). |
| `fecha_envio` | Fecha de envío de la guía (YYYY-MM-DD). |
| `fecha_entrega_esperada` | Fecha de entrega esperada (YYYY-MM-DD). |
| `empresa_relacion_despacho` | Id de la empresa de la relación de despacho que incluye la guía (null si no está en una relación). |
| `nombre_empresa_relacion_despacho` | Nombre de la empresa de la relación de despacho (texto de empresa_relacion_despacho). |
| `sucursal_relacion_despacho` | Sucursal de la relación de despacho. |
| `prefijo_relacion_despacho` | Prefijo de la relación de despacho. |
| `id_relacion_despacho` | Id de la relación de despacho. |
| `responsable` | Usuario (correo) que creó la guía. |
| `nombre_responsable` | Nombres y apellidos del usuario que creó la guía (texto de responsable). |
| `responsable_cambio` | Usuario (correo) que registró el cambio de estado (columna responsable de hist_est_guia_transporte; filtro responsable_cambio_estado). |
| `nombre_responsable_cambio` | Nombres y apellidos del usuario que registró el cambio de estado (texto de responsable_cambio). |
| `liquidacion_efficommerce` | 1 si la guía ya tiene liquidación definitiva Efficommerce; 0 si no. |
| `recaudo_efficommerce` | 1 si la guía fue liquidada con recaudo por Efficommerce; 0 si no. |
| `sin_recaudo_efficommerce` | 1 si la guía fue liquidada sin recaudo por Efficommerce; 0 si no. |
| `devolucion_efficommerce` | 1 si la devolución fue liquidada por Efficommerce; 0 si no. |
| `indemnizacion_efficommerce` | 1 si la indemnización fue liquidada por Efficommerce; 0 si no. |
| `alistamiento_efficommerce` | 1 si el alistamiento fue liquidado por Efficommerce; 0 si no. |
| `logistica_efficommerce` | 1 si la guía se despachó desde una bodega Efficommerce (fulfillment); 0 si no. |
| `vigente` | 1 si la guía está vigente; 0 si está anulada. |

### Ejemplo de respuesta

```json
{
  "ok": true,
  "data": [
    {
      "id": "136",
      "prefijo": "",
      "id_transaccion": "136",
      "fecha_hist_est": "2026-08-28 04:25:12",
      "fecha_trans": "2026-08-28 04:25:10",
      "est_guia_new": "96",
      "estado_new": "Generada Effi",
      "est_guia_new_efficommerce": "1",
      "estado_new_efficommerce": "Generada",
      "observacion_hist_est": null,
      "url_foto": null,
      "sucursal": "1",
      "nombre_sucursal": "Principal",
      "centro_costos": "1",
      "nombre_centro_costos": "Principal",
      "ubicacion_venta": null,
      "nombre_ubicacion_venta": null,
      "guia_inicial_adicional": "1",
      "guia": null,
      "guia_adicional": null,
      "remitente": "1",
      "nombre_remitente": "Comercializadora Andina S.A.S.",
      "dni_remitente": "2",
      "abreviacion_remitente": "CC",
      "id_remitente": "1020304050",
      "dv_remitente": null,
      "pais_remitente": "63",
      "nombre_pais_remitente": "Ecuador",
      "provincia_remitente": "1040",
      "nombre_provincia_remitente": "Pichincha",
      "ciudad_remitente": "56431",
      "nombre_ciudad_remitente": "Quito",
      "direccion_remitente": "Calle 10 # 20-30",
      "telefonos_remitente": "3001234567",
      "destinatario": "3",
      "nombre_destinatario": "Ana Pérez",
      "dni_destinatario": "2",
      "abreviacion_destinatario": "CC",
      "id_destinatario": "1020304051",
      "dv_destinatario": null,
      "pais_destinatario": "63",
      "nombre_pais_destinatario": "Ecuador",
      "provincia_destinatario": "1022",
      "nombre_provincia_destinatario": "Azuay",
      "ciudad_destinatario": "62232",
      "nombre_ciudad_destinatario": "Ricaurte (Cuenca)",
      "direccion_destinatario": "Carrera 5 # 12-34",
      "telefonos_destinatario": "3009876543",
      "transportadora": "9",
      "nombre_transportadora": "Transportadora de ejemplo",
      "transportadora_efficommerce": "8",
      "nombre_transportadora_efficommerce": "SERVIENTREGA",
      "t_servicio": "2",
      "servicio": "Mercancía Premiere (1Kg-50Kg)",
      "t_forma_pago": "2",
      "forma_pago": "Crédito",
      "divisa": "USD",
      "simbolo_moneda": "$",
      "valor_flete": "0.00",
      "valor_declarado": "100.00",
      "recaudo": "1",
      "valor_recaudo": "100.00",
      "t_trans_ref": null,
      "tipo_trans_ref": null,
      "sucursal_ref": null,
      "prefijo_ref": null,
      "id_ref": null,
      "transaccion_dropshipping": null,
      "convenio_dropshipping": null,
      "nombre_convenio_dropshipping": null,
      "est_transaccion_dropshipping": null,
      "estado_dropshipping": null,
      "empresa_proveedor": null,
      "nombre_empresa_proveedor": null,
      "t_trans_venta_proveedor": null,
      "tipo_trans_venta_proveedor": null,
      "sucursal_venta_proveedor": null,
      "prefijo_venta_proveedor": null,
      "id_venta_proveedor": null,
      "empresa_distribuidor": null,
      "nombre_empresa_distribuidor": null,
      "t_trans_venta_distribuidor": null,
      "tipo_trans_venta_distribuidor": null,
      "sucursal_venta_distribuidor": null,
      "prefijo_venta_distribuidor": null,
      "id_venta_distribuidor": null,
      "contenido": "Producto de ejemplo",
      "est_guia": "96",
      "estado": "Generada Effi",
      "est_guia_efficommerce": "1",
      "estado_efficommerce": "Generada",
      "fecha_envio": "2023-01-05",
      "fecha_entrega_esperada": "2023-01-05",
      "empresa_relacion_despacho": null,
      "nombre_empresa_relacion_despacho": null,
      "sucursal_relacion_despacho": null,
      "prefijo_relacion_despacho": null,
      "id_relacion_despacho": null,
      "responsable": "usuario@empresa.com",
      "nombre_responsable": "Laura Martínez",
      "responsable_cambio": "usuario@empresa.com",
      "nombre_responsable_cambio": "Laura Martínez",
      "liquidacion_efficommerce": "0",
      "recaudo_efficommerce": "0",
      "sin_recaudo_efficommerce": "0",
      "devolucion_efficommerce": "0",
      "indemnizacion_efficommerce": "0",
      "alistamiento_efficommerce": "0",
      "logistica_efficommerce": "0",
      "vigente": "0"
    },
    {
      "id": "135",
      "prefijo": "",
      "id_transaccion": "135",
      "fecha_hist_est": "2026-08-28 04:24:18",
      "fecha_trans": "2026-08-28 04:24:14",
      "est_guia_new": "96",
      "estado_new": "Generada Effi",
      "est_guia_new_efficommerce": "1",
      "estado_new_efficommerce": "Generada",
      "observacion_hist_est": null,
      "url_foto": null,
      "sucursal": "1",
      "nombre_sucursal": "Principal",
      "centro_costos": "1",
      "nombre_centro_costos": "Principal",
      "ubicacion_venta": null,
      "nombre_ubicacion_venta": null,
      "guia_inicial_adicional": "1",
      "guia": null,
      "guia_adicional": null,
      "remitente": "1",
      "nombre_remitente": "Comercializadora Andina S.A.S.",
      "dni_remitente": "2",
      "abreviacion_remitente": "CC",
      "id_remitente": "1020304050",
      "dv_remitente": null,
      "pais_remitente": "63",
      "nombre_pais_remitente": "Ecuador",
      "provincia_remitente": "1040",
      "nombre_provincia_remitente": "Pichincha",
      "ciudad_remitente": "56431",
      "nombre_ciudad_remitente": "Quito",
      "direccion_remitente": "Calle 10 # 20-30",
      "telefonos_remitente": "3001234567",
      "destinatario": "3",
      "nombre_destinatario": "Ana Pérez",
      "dni_destinatario": "2",
      "abreviacion_destinatario": "CC",
      "id_destinatario": "1020304051",
      "dv_destinatario": null,
      "pais_destinatario": "63",
      "nombre_pais_destinatario": "Ecuador",
      "provincia_destinatario": "1022",
      "nombre_provincia_destinatario": "Azuay",
      "ciudad_destinatario": "62232",
      "nombre_ciudad_destinatario": "Ricaurte (Cuenca)",
      "direccion_destinatario": "Carrera 5 # 12-34",
      "telefonos_destinatario": "3009876543",
      "transportadora": "9",
      "nombre_transportadora": "Transportadora de 
```

---

## <a id="novedad_guia_transporte"></a>GET `api/novedad_guia_transporte` — Consultar novedades de guías

Devuelve las novedades de guías de transporte de la empresa asociada a la API key con las mismas columnas de la tabla de consulta del web (Novedad, Guía, Remitente, Destinatario) más las columnas de los filtros: id de la novedad, empresa dueña, número de guía con novedad, si es de la guía inicial o de la devolución, estado y tipo de la novedad, transportadora Effi, novedad reportada (con su nombre) y aclaración, cantidad de gestiones, fechas (reporte de la transportadora, creación en Effi, última gestión, solución), foto, datos de la guía (sucursal, prefijo, id interno e identificador visible id_transaccion_guia, números de guía, fechas, sucursal, centro de costos, ubicación de venta, transportadora, servicio, forma de pago, valores, contenido, estado de la transportadora y vigencia de la guía), remitente y destinatario con su identificación, ubicación y contacto, responsable y vigencia de la novedad; cada id de otra tabla va seguido de su nombre. Igual que en el web: las empresas cliente solo ven novedades vigentes de la guía inicial, y las novedades de Envía Colvanes se ven 6 horas después de reportadas; las empresas Effi ven las novedades de las transportadoras que administran (por eso se exponen empresa y nombre_empresa). Si no se envía t_novedad se listan solo las del tipo 2 (Requiere solución de la empresa), el valor por defecto del select Tipo novedad del web. Si no llega ningún filtro, el modelo aplica el mismo tope del web: solo las novedades creadas en los últimos 5 días (empresas cliente) o del día actual (empresas Effi); se recomienda enviar siempre desde y hasta. Se listan ordenadas por estado de la novedad y fecha de reporte de la transportadora. Los filtros son los mismos del bloque de búsqueda del módulo Novedades de guías de transporte del web (se llaman igual que las columnas). Si no se envía vigente se listan vigentes y anuladas (como el web con "Seleccionar..."); vigente=1 lista solo las vigentes y vigente=0 solo las anuladas (con un token de empresa cliente, vigente=0 devuelve 0 registros porque el modelo solo deja ver novedades vigentes). Requiere permiso de consulta sobre la función: Novedades de guías de transporte.

Ejemplo: `GET api/novedad_guia_transporte?desde=2026-01-01&hasta=2026-12-31&pagina=1&por_pagina=100`

### Parámetros

| Nombre | Tipo | Req. | Descripción |
|---|---|---|---|
| `guia_inicial_adicional` | integer |  | Filtrar por el tipo de guía de la novedad: 1 novedad de la guía inicial; 0 novedad de la guía de devolución. Igual que en el web, el valor 0 no filtra (el modelo lo evalúa con !empty) y las empresas cliente solo ven novedades de la guía inicial. Valores: `1` Novedad de guía inicial, `0` Novedad de guía devolución |
| `id` | integer |  | Filtrar por el id de la novedad (máximo 13 dígitos). |
| `transportadora_efficommerce` | integer |  | Filtrar por el id de la transportadora Effi que reportó la novedad (ver api/transportadora_efficommerce). En el web es una lista desplegable dinámica. |
| `id_novedad` | integer |  | Filtrar por el id de la novedad del catálogo de la transportadora Effi (novedad_transportadora_efficommerce; los ids dependen de cada transportadora). Lista desplegable dinámica en el web (se carga al elegir la transportadora Effi). |
| `t_novedad` | integer |  | Filtrar por el id del tipo de novedad (1 = Operativa de la transportadora, 2 = Requiere solución de la empresa). Si no se envía se listan solo las del tipo 2, igual que el valor por defecto del web. En el web es una lista desplegable dinámica. |
| `est_novedad` | integer |  | Filtrar por el id del estado de la novedad (1 = Pendiente de solución, 2 = Pendiente de aprobación de solución, 3 = Solucionada, 4 = Cerrada por estado final de guía, 5 = Cerrada por nueva novedad ingresada, 6 = Cerrada por nuevo estado sin novedad). En el web es una lista desplegable dinámica. |
| `desde` | date |  | Fecha de creación de la novedad en Effi (fecha_trans) mayor o igual a la indicada. Formato YYYY-MM-DD o YYYY-MM-DD HH:MM:SS, interpretada en la zona horaria de la empresa. Recomendado enviarlo siempre: sin ningún filtro solo se listan las de los últimos 5 días (día actual para empresas Effi). |
| `hasta` | date |  | Fecha de creación de la novedad en Effi (fecha_trans) menor o igual a la indicada. Formato YYYY-MM-DD o YYYY-MM-DD HH:MM:SS, interpretada en la zona horaria de la empresa. |
| `desde_transportadora` | date |  | Fecha de reporte de la novedad por la transportadora (fecha_trans_transportadora) mayor o igual a la indicada (YYYY-MM-DD o YYYY-MM-DD HH:MM:SS; se compara tal cual contra el valor almacenado). |
| `hasta_transportadora` | date |  | Fecha de reporte de la novedad por la transportadora (fecha_trans_transportadora) menor o igual a la indicada (YYYY-MM-DD o YYYY-MM-DD HH:MM:SS; se compara tal cual contra el valor almacenado). |
| `sucursal` | integer |  | Filtrar por el id de la sucursal de la guía (ver api/sucursal). En el web es una lista desplegable dinámica. |
| `ubicacion_venta` | integer |  | Filtrar por el id de la ubicación de venta de la guía (ver api/ubicacion_venta). Lista desplegable dinámica en el web (se carga al elegir la sucursal). |
| `centro_costos` | integer |  | Filtrar por el id del centro de costos de la guía (ver api/centro_costos). En el web es una lista desplegable dinámica. |
| `id_guia` | integer |  | Filtrar por el id interno de la guía (máximo 13 dígitos; se repite entre sucursales: combínelo con sucursal). |
| `guia` | string |  | Filtrar por el número exacto de la guía inicial asignado por la transportadora (máximo 20 caracteres). |
| `guia_adicional` | string |  | Filtrar por el número exacto de la guía de devolución asignado por la transportadora (máximo 20 caracteres). |
| `transportadora` | integer |  | Filtrar por el id de la transportadora de la empresa de la guía (ver api/transportadora). En el web es una lista desplegable dinámica. |
| `remitente` | integer |  | Filtrar por el código del remitente de la guía (columna codigo de api/remitente). En el web es una lista desplegable dinámica. |
| `destinatario` | integer |  | Filtrar por el código del tercero destinatario de la guía (columna destinatario). En el web se elige con el buscador de terceros. |
| `guia_desde` | date |  | Fecha de creación de la guía (fecha_trans de la guía) mayor o igual a la indicada. Formato YYYY-MM-DD o YYYY-MM-DD HH:MM:SS, interpretada en la zona horaria de la empresa. |
| `guia_hasta` | date |  | Fecha de creación de la guía (fecha_trans de la guía) menor o igual a la indicada. Formato YYYY-MM-DD o YYYY-MM-DD HH:MM:SS, interpretada en la zona horaria de la empresa. |
| `vigente` | integer |  | Si no se envía se listan vigentes y anuladas (como el web con "Seleccionar..."). Enviar vigente=1 para listar solo las vigentes o vigente=0 para listar solo las anuladas (con un token de empresa cliente, vigente=0 devuelve 0 registros porque el modelo solo deja ver novedades vigentes). Valores: `1` Vigente, `0` Anulada |
| `pagina` | integer |  | Número de página. Por defecto 1. |
| `por_pagina` | integer |  | Registros por página. Por defecto 100, máximo 100. |

### Campos de respuesta

| Campo | Descripción |
|---|---|
| `id` | Identificador de la novedad (clave empresa + id). |
| `empresa` | Id de la empresa dueña de la guía con novedad (puede ser distinta de la del token en empresas Effi). |
| `nombre_empresa` | Nombre de la empresa dueña (texto de empresa). |
| `guia_novedad` | Número de la guía sobre la que se reportó la novedad (la inicial o la de devolución). |
| `guia_inicial_adicional` | 1 si la novedad es de la guía inicial; 0 si es de la guía de devolución. |
| `est_novedad` | Id del estado de la novedad (1 = Pendiente de solución, 2 = Pendiente de aprobación de solución, 3 = Solucionada, 4 = Cerrada por estado final de guía, 5 = Cerrada por nueva novedad ingresada, 6 = Cerrada por nuevo estado sin novedad). |
| `estado_novedad` | Nombre del estado de la novedad (texto de est_novedad). |
| `t_novedad` | Id del tipo de novedad (1 = Operativa de la transportadora, 2 = Requiere solución de la empresa). |
| `tipo_novedad` | Nombre del tipo de novedad (texto de t_novedad). |
| `transportadora_efficommerce` | Id de la transportadora Effi que reportó la novedad. |
| `nombre_transportadora_efficommerce` | Nombre de la transportadora Effi (texto de transportadora_efficommerce). |
| `id_novedad` | Id de la novedad en el catálogo de la transportadora Effi (novedad_transportadora_efficommerce). |
| `nombre_novedad` | Nombre de la novedad reportada (texto de id_novedad), ej. Coordinar la entrega. |
| `aclaracion` | Aclaración o detalle de la novedad reportada por la transportadora. |
| `cant_gestion` | Cantidad de gestiones (soluciones) registradas para la novedad. |
| `fecha_trans_transportadora` | Fecha y hora en que la transportadora reportó la novedad. |
| `fecha_trans` | Fecha y hora de creación de la novedad en Effi, en UTC tal como está almacenada en la base de datos. |
| `fecha_ultima_gestion` | Fecha y hora de la última gestión registrada (null si no tiene). |
| `fecha_solucion` | Fecha y hora en que se solucionó la novedad (null si está pendiente). |
| `url_foto` | URL de la foto adjunta a la novedad (null si no tiene). |
| `sucursal_guia` | Id de la sucursal de la guía con novedad. |
| `prefijo` | Prefijo de la guía en su sucursal (la novedad no tiene prefijo propio). |
| `id_guia` | Id interno de la guía con novedad (clave empresa + sucursal_guia + id_guia). |
| `id_transaccion_guia` | Identificador visible de la guía prefijo-id_guia, como la columna ID guía del ERP. |
| `guia` | Número de la guía inicial asignado por la transportadora. |
| `guia_adicional` | Número de la guía de devolución (null si no tiene). |
| `fecha_trans_guia` | Fecha y hora de creación de la guía, en UTC tal como está almacenada en la base de datos. |
| `fecha_estado_proceso` | Fecha y hora en que la guía pasó a estado en proceso (null si no aplica). |
| `sucursal` | Id de la sucursal de la guía (igual que sucursal_guia). |
| `nombre_sucursal` | Nombre de la sucursal (texto de sucursal). |
| `centro_costos` | Id del centro de costos de la guía. |
| `nombre_centro_costos` | Nombre del centro de costos (texto de centro_costos). |
| `ubicacion_venta` | Id de la ubicación de venta de la guía (null si no aplica). |
| `nombre_ubicacion_venta` | Nombre de la ubicación de venta (texto de ubicacion_venta). |
| `transportadora` | Id de la transportadora de la empresa (api/transportadora). |
| `nombre_transportadora` | Nombre de la transportadora (texto de transportadora). |
| `servicio` | Nombre del tipo de servicio de la guía. |
| `forma_pago` | Forma de pago del flete de la guía, ej. Crédito. |
| `valor_flete` | Valor del flete de la guía. |
| `valor_declarado` | Valor declarado de la mercancía. |
| `recaudo` | 1 si la guía tiene recaudo contra entrega; 0 si no. |
| `valor_recaudo` | Valor a recaudar contra entrega. |
| `contenido` | Descripción del contenido del envío. |
| `est_guia` | Id del estado de la guía según la transportadora (est_guia_transportadora). |
| `estado` | Nombre del estado de la guía según la transportadora (texto de est_guia). |
| `vigente_guia` | 1 si la guía está vigente; 0 si está anulada. |
| `remitente` | Código del remitente de la guía (codigo de api/remitente). |
| `nombre_remitente` | Nombre del remitente (texto de remitente). |
| `dni_remitente` | Id del tipo de documento de identidad del remitente (t_dni). |
| `abreviacion_remitente` | Abreviatura del tipo de documento del remitente (texto de dni_remitente), ej. NIT, CC. |
| `id_remitente` | Número de identificación del remitente. |
| `pais_remitente` | Id del país del remitente. |
| `nombre_pais_remitente` | Nombre del país del remitente (texto de pais_remitente). |
| `provincia_remitente` | Id del departamento/provincia del remitente. |
| `nombre_provincia_remitente` | Nombre del departamento/provincia del remitente (texto de provincia_remitente). |
| `ciudad_remitente` | Id de la ciudad del remitente. |
| `nombre_ciudad_remitente` | Nombre de la ciudad del remitente (texto de ciudad_remitente). |
| `direccion_remitente` | Dirección del remitente. |
| `telefonos_remitente` | Teléfonos del remitente. |
| `destinatario` | Código del tercero destinatario de la guía. |
| `nombre_destinatario` | Nombre del destinatario (texto de destinatario). |
| `dni_destinatario` | Id del tipo de documento de identidad del destinatario (t_dni). |
| `abreviacion_destinatario` | Abreviatura del tipo de documento del destinatario (texto de dni_destinatario), ej. NIT, CC. |
| `id_destinatario` | Número de identificación del destinatario. |
| `pais_destinatario` | Id del país del destinatario. |
| `nombre_pais_destinatario` | Nombre del país del destinatario (texto de pais_destinatario). |
| `provincia_destinatario` | Id del departamento/provincia del destinatario. |
| `nombre_provincia_destinatario` | Nombre del departamento/provincia del destinatario (texto de provincia_destinatario). |
| `ciudad_destinatario` | Id de la ciudad del destinatario. |
| `nombre_ciudad_destinatario` | Nombre de la ciudad del destinatario (texto de ciudad_destinatario). |
| `direccion_destinatario` | Dirección de entrega del destinatario. |
| `telefonos_destinatario` | Teléfonos del destinatario. |
| `responsable_crear` | Usuario (correo) que creó la novedad (el usuario del sistema cuando la reporta la integración con la transportadora). |
| `nombre_responsable` | Nombres y apellidos del usuario que creó la novedad (texto de responsable_crear). |
| `vigente` | 1 si la novedad está vigente; 0 si está anulada. |

### Ejemplo de respuesta

```json
{
  "ok": true,
  "data": [
    {
      "id": "1128",
      "empresa": "55",
      "nombre_empresa": "Comercializadora Andina S.A.S.",
      "guia_novedad": "1234567890",
      "guia_inicial_adicional": "1",
      "est_novedad": "1",
      "estado_novedad": "Pendiente de solución",
      "t_novedad": "2",
      "tipo_novedad": "Requiere solución de la empresa",
      "transportadora_efficommerce": "1",
      "nombre_transportadora_efficommerce": "ENVÍA COLVANES",
      "id_novedad": "48",
      "nombre_novedad": "Pedido cancelado",
      "aclaracion": "Aclaración de ejemplo de la novedad",
      "cant_gestion": "0",
      "fecha_trans_transportadora": "2021-08-17 00:00:00",
      "fecha_trans": "2021-08-18 10:22:25",
      "fecha_ultima_gestion": null,
      "fecha_solucion": null,
      "url_foto": null,
      "sucursal_guia": "1",
      "prefijo": "",
      "id_guia": "11552",
      "id_transaccion_guia": "11552",
      "guia": "1234567890",
      "guia_adicional": null,
      "fecha_trans_guia": "2023-08-13 21:00:59",
      "fecha_estado_proceso": null,
      "sucursal": "1",
      "nombre_sucursal": "Principal",
      "centro_costos": "2",
      "nombre_centro_costos": "Mercancía Propia",
      "ubicacion_venta": "6",
      "nombre_ubicacion_venta": "Envía Con Recaudo",
      "transportadora": "1",
      "nombre_transportadora": "ENVÍA EFFICOMMERCE | VENTA CR | FLETE CRÉDITO",
      "servicio": "Paquete Terrestre (0Kg-8Kg)",
      "forma_pago": "Crédito",
      "valor_flete": "12157.00",
      "valor_declarado": "10000.00",
      "recaudo": "1",
      "valor_recaudo": "119900.00",
      "contenido": "Contenido de ejemplo",
      "est_guia": "8",
      "estado": "EN NOVEDAD POR BOGOTA",
      "vigente_guia": "1",
      "remitente": "1",
      "nombre_remitente": "Comercializadora Andina S.A.S.",
      "dni_remitente": "2",
      "abreviacion_remitente": "CC",
      "id_remitente": "900123456",
      "pais_remitente": "47",
      "nombre_pais_remitente": "Colombia",
      "provincia_remitente": "776",
      "nombre_provincia_remitente": "Antioquia",
      "ciudad_remitente": "12619",
      "nombre_ciudad_remitente": "Sabaneta",
      "direccion_remitente": "Calle 10 # 20-30",
      "telefonos_remitente": "3001234567",
      "destinatario": "12423",
      "nombre_destinatario": "Ana Pérez",
      "dni_destinatario": "2",
      "abreviacion_destinatario": "CC",
      "id_destinatario": "1020304050",
      "pais_destinatario": "47",
      "nombre_pais_destinatario": "Colombia",
      "provincia_destinatario": "789",
      "nombre_provincia_destinatario": "Cundinamarca",
      "ciudad_destinatario": "13097",
      "nombre_ciudad_destinatario": "Madrid",
      "direccion_destinatario": "Avenida 3 # 45-67",
      "telefonos_destinatario": "3001234567",
      "responsable_crear": "usuario@empresa.com",
      "nombre_responsable": "Laura Martínez",
      "vigente": "1"
    },
    {
      "id": "1144",
      "empresa": "55",
      "nombre_empresa": "Comercializadora Andina S.A.S.",
      "guia_novedad": "1234567891",
      "guia_inicial_adicional": "1",
      "est_novedad": "1",
      "estado_novedad": "Pendiente de solución",
      "t_novedad": "2",
      "tipo_novedad": "Requiere solución de la empresa",
      "transportadora_efficommerce": "1",
      "nombre_transportadora_efficommerce": "ENVÍA COLVANES",
      "id_novedad": "81",
      "nombre_novedad": "Coordinar la entrega",
      "aclaracion": "Aclaración de ejemplo de la novedad",
      "cant_gestion": "0",
      "fecha_trans_transportadora": "2021-08-18 00:00:00",
      "fecha_trans": "2021-08-18 23:43:41",
      "fecha_ultima_gestion": null,
      "fecha_solucion": null,
      "url_foto": null,
      "sucursal_guia": "1",
      "prefijo": "",
      "id_guia": "11436",
      "id_transaccion_guia": "11436",
      "guia": "1234567891",
      "guia_adicional": null,
      "fecha_trans_guia": "2023-08-11 21:14:43",
      "fecha_estado_proceso": null,
      "sucursal": "1",
      "nombre_sucursal": "Principal",
      "centro_costos": "2",
      "nombre_centro_costos": "Mercancía Propia",
      "ubicacion_venta": "6",
      "nombre_ubicacion_venta": "Envía Con Recaudo",
      "transportadora": "1",
      "nombre_transportadora": "ENVÍA EFFICOMMERCE | VENTA CR | FLETE CRÉDITO",
      "servicio": "Paquete Terrestre (0Kg-8Kg)",
      "forma_pago": "Crédito",
      "valor_flete": "12544.00",
      "valor_declarado": "10000.00",
      "recaudo": "1",
      "valor_recaudo": "132000.00",
      "contenido": "Contenido de ejemplo",
      "est_guia": "8",
      "estado": "EN NOVEDAD POR BOGOTA",
      "vigente_guia": "1",
      "remitente": "1",
      "nombre_remitente": "Comercializadora Andina S.A.S.",
      "dni_remitente": "2",
      "abreviacion_remitente": "CC",
      "id_remitente": "900123456",
      "pais_remitente": "47",
      "nombre_pais_remitente": "Colombia",
      "provincia_remitente": "776",
      "nombre_provincia_remitente": "Antioquia",
      "ciudad_remitente": "12619",
      "nombre_ciudad_remitente": "Sabaneta",
      "direccion_remitente": "Calle 10 # 20-30",
      "telefonos_remitente": "3001234567",
      "destinatario": "15554",
      "nombre_destinatario": "Carlos Gómez",
      "dni_destinatario": "2",
      "abreviacion_destinatario": "CC",
      "id_destinatario": "1030405060",
      "pais_destinatario": "47",
      "nombre_pais_destinatario": "Colombia",
      "provincia_destinatario": "789",
      "nombre_provincia_destinatario": "Cundinamarca",
      "ciudad_destinatario": "13078",
      "nombre_ciudad_destinatario": "Girardot",
      "direccion_destinatario": "Carrera 45 # 12-34",
      "telefonos_destinatario": "3109876543",
      "responsable_crear": "usuario@empresa.com",
      "nombre_responsable": "Laura Martínez",
      "vigente": "1"
    }
  ],
  "paginacion": {
    "pagina": 1,
    "por_pagina": 100,
    "total": 794,
    "total_paginas": 8
  }
}
```

---

## <a id="gestion_novedad_guia_transporte"></a>GET `api/gestion_novedad_guia_transporte` — Consultar soluciones de novedades de guías de transporte

Devuelve las soluciones (gestiones) registradas sobre las novedades de guías de transporte de la empresa asociada a la API key con las mismas columnas de la tabla de consulta del web (Solución, Novedad, Guía, Remitente, Destinatario) más las columnas de los filtros: cada registro es UNA gestión (llave: empresa dueña de la novedad + id de la novedad + id_gestion; el web la muestra como "ID solución: id-id_gestion") con su estado, descripción, solución elegida, datos de la nueva entrega, comentario de rechazo, respuesta de la API de la transportadora, responsables y fechas de creación, aprobación y rechazo; los datos de la novedad (número de guía, tipo y estado, transportadora Effi, novedad reportada, aclaración, antigüedad en días, cantidad de gestiones, fechas); los datos de la guía (sucursal, prefijo, id interno e identificador visible id_transaccion_guia, números de guía, fechas, centro de costos, ubicación de venta, transportadora, servicio, forma de pago, valores, contenido, estado y vigencia de la guía) y remitente y destinatario con su identificación, ubicación y contacto; cada id de otra tabla va seguido de su nombre. Igual que en el web: solo gestiones de novedades vigentes; las empresas cliente ven las de sus guías y las empresas Effi las de las transportadoras que administran (por eso se exponen empresa y nombre_empresa). Si no llega ningún filtro, el modelo aplica el mismo tope del web: solo las gestiones creadas en los últimos 5 días (empresas cliente) o del día actual (empresas Effi); se recomienda enviar siempre desde y hasta. Los filtros son los mismos del bloque de búsqueda del módulo Soluciones de novedades del web (se llaman igual que las columnas); el filtro empresa del web (solo empresas Effi) no se expone. El filtro vigente es de la GUÍA: si no se envía se listan guías vigentes y anuladas; vigente=1 solo vigentes y vigente=0 solo anuladas. Requiere permiso de consulta sobre la función: Gestión de novedades de guías de transporte.

Ejemplo: `GET api/gestion_novedad_guia_transporte?desde=2026-01-01&hasta=2026-12-31&pagina=1&por_pagina=100`

### Parámetros

| Nombre | Tipo | Req. | Descripción |
|---|---|---|---|
| `id_gestion` | integer |  | Filtrar por el id de la gestión dentro de la novedad (máximo 13 dígitos; la llave es empresa + id de la novedad + id_gestion). |
| `est_gestion` | integer |  | Filtrar por el id del estado de la gestión (1 = Pendiente de revisión, 2 = Aprobada, 3 = Rechazada, 4 = Pendiente de envío a transportadora). En el web es una lista desplegable dinámica. |
| `responsable` | string |  | Filtrar por el usuario (correo) que creó la gestión. En el web es una lista desplegable dinámica de los usuarios de la empresa. |
| `desde` | date |  | Fecha de creación de la gestión (fecha_trans_gestion) mayor o igual a la indicada. Formato YYYY-MM-DD o YYYY-MM-DD HH:MM:SS, interpretada en la zona horaria de la empresa. Recomendado enviarlo siempre: sin ningún filtro solo se listan las de los últimos 5 días (día actual para empresas Effi). |
| `hasta` | date |  | Fecha de creación de la gestión (fecha_trans_gestion) menor o igual a la indicada. Formato YYYY-MM-DD o YYYY-MM-DD HH:MM:SS, interpretada en la zona horaria de la empresa. |
| `id` | integer |  | Filtrar por el id de la novedad gestionada (máximo 13 dígitos; campo id de GET api/novedad_guia_transporte). |
| `transportadora_efficommerce` | integer |  | Filtrar por el id de la transportadora Effi que reportó la novedad (ver api/transportadora_efficommerce). En el web es una lista desplegable dinámica. Solo se aplica si se envía (no enviar vacío). |
| `id_novedad` | integer |  | Filtrar por el id de la novedad del catálogo de la transportadora Effi (los ids dependen de cada transportadora). Lista desplegable dinámica en el web (se carga al elegir la transportadora Effi). |
| `t_novedad` | integer |  | Filtrar por el id del tipo de novedad (1 = Operativa de la transportadora, 2 = Requiere solución de la empresa). En el web es una lista desplegable dinámica. |
| `est_novedad` | integer |  | Filtrar por el id del estado de la novedad (1 = Pendiente de solución, 2 = Pendiente de aprobación de solución, 3 = Solucionada, 4 = Cerrada por estado final de guía, 5 = Cerrada por nueva novedad ingresada, 6 = Cerrada por nuevo estado sin novedad). En el web es una lista desplegable dinámica. |
| `novedad_desde` | date |  | Fecha de reporte de la novedad por la transportadora (fecha_trans_transportadora) mayor o igual a la indicada (YYYY-MM-DD o YYYY-MM-DD HH:MM:SS; se compara tal cual contra el valor almacenado). |
| `novedad_hasta` | date |  | Fecha de reporte de la novedad por la transportadora (fecha_trans_transportadora) menor o igual a la indicada (YYYY-MM-DD o YYYY-MM-DD HH:MM:SS; se compara tal cual contra el valor almacenado). |
| `sucursal` | integer |  | Filtrar por el id de la sucursal de la guía (ver api/sucursal). En el web es una lista desplegable dinámica. |
| `ubicacion_venta` | integer |  | Filtrar por el id de la ubicación de venta de la guía (ver api/ubicacion_venta). Lista desplegable dinámica en el web (se carga al elegir la sucursal). |
| `centro_costos` | integer |  | Filtrar por el id del centro de costos de la guía (ver api/centro_costos). En el web es una lista desplegable dinámica. |
| `id_guia` | integer |  | Filtrar por el id interno de la guía (máximo 13 dígitos; se repite entre sucursales: combínelo con sucursal). |
| `guia` | string |  | Filtrar por el número exacto de la guía inicial asignado por la transportadora (máximo 20 caracteres). |
| `guia_adicional` | string |  | Filtrar por el número exacto de la guía de devolución asignado por la transportadora (máximo 20 caracteres). |
| `transportadora` | integer |  | Filtrar por el id de la transportadora de la empresa de la guía (ver api/transportadora). En el web es una lista desplegable dinámica. |
| `remitente` | integer |  | Filtrar por el código del remitente de la guía (columna codigo de api/remitente). En el web es una lista desplegable dinámica. |
| `destinatario` | integer |  | Filtrar por el código del tercero destinatario de la guía (columna destinatario). En el web se elige con el buscador de terceros. |
| `guia_desde` | date |  | Fecha de creación de la guía (fecha_trans_guia) mayor o igual a la indicada. Formato YYYY-MM-DD o YYYY-MM-DD HH:MM:SS, interpretada en la zona horaria de la empresa. |
| `guia_hasta` | date |  | Fecha de creación de la guía (fecha_trans_guia) menor o igual a la indicada. Formato YYYY-MM-DD o YYYY-MM-DD HH:MM:SS, interpretada en la zona horaria de la empresa. |
| `vigente` | integer |  | Vigencia de la GUÍA (no de la gestión). Si no se envía se listan guías vigentes y anuladas (como el web con "Seleccionar..."). Enviar vigente=1 para listar solo las vigentes o vigente=0 para listar solo las anuladas. Valores: `1` Vigente, `0` Anulada |
| `pagina` | integer |  | Número de página. Por defecto 1. |
| `por_pagina` | integer |  | Registros por página. Por defecto 100, máximo 100. |

### Campos de respuesta

| Campo | Descripción |
|---|---|
| `empresa` | Id de la empresa dueña de la novedad (parte de la llave: empresa + id + id_gestion). |
| `nombre_empresa` | Nombre de la empresa dueña de la novedad (texto de empresa). |
| `id` | Id de la novedad gestionada (campo id de GET api/novedad_guia_transporte). |
| `id_gestion` | Consecutivo de la gestión dentro de la novedad. El web muestra la llave como "id-id_gestion". |
| `est_gestion` | Id del estado de la gestión (1 = Pendiente de revisión, 2 = Aprobada, 3 = Rechazada, 4 = Pendiente de envío a transportadora). |
| `estado_gestion` | Nombre del estado de la gestión (texto de est_gestion). |
| `solucion` | 1 si la gestión es una solución definitiva de la novedad; 0 si es una gestión parcial. |
| `gestion` | Descripción de la gestión registrada. |
| `id_solucion` | Id de la solución elegida en el catálogo de la transportadora Effi (p. ej. 1 Volver a ofrecer, 2 Redireccionar en la misma ciudad, 3 Devolver a remitente inicial; depende de cada transportadora). |
| `nombre_solucion` | Nombre de la solución (texto de id_solucion). |
| `fecha_nueva_entrega` | Fecha de la nueva entrega acordada (YYYY-MM-DD; null en devoluciones). |
| `destinatario_gestion` | Nombre del destinatario para la nueva entrega (null si no aplica). |
| `direccion_gestion` | Dirección de la nueva entrega (null si no aplica). |
| `telefonos_gestion` | Teléfonos de contacto para la nueva entrega (null si no aplica). |
| `ciudad_gestion` | Id de la ciudad de la nueva entrega (null si no aplica). |
| `comentario_rechazar` | Comentario con que la transportadora Effi rechazó la gestión (null si no fue rechazada). |
| `response_api` | Respuesta de la API de la transportadora al enviarle la gestión (null si no se ha enviado). |
| `fecha_trans_gestion` | Fecha y hora de creación de la gestión, en UTC tal como está almacenada en la base de datos. |
| `responsable_crear_gestion` | Usuario (correo) que creó la gestión. |
| `nombre_responsable_crear` | Nombres y apellidos del usuario que creó la gestión (texto de responsable_crear_gestion). |
| `fecha_aprobar_gestion` | Fecha y hora de aprobación de la gestión, en UTC (null si no está aprobada). |
| `responsable_aprobar` | Usuario (correo) que aprobó la gestión (null si no está aprobada). |
| `nombre_responsable_aprobar` | Nombres y apellidos del usuario que aprobó (texto de responsable_aprobar). |
| `fecha_rechazar_gestion` | Fecha y hora de rechazo de la gestión, en UTC (null si no fue rechazada). |
| `responsable_rechazar` | Usuario (correo) que rechazó la gestión (null si no fue rechazada). |
| `nombre_responsable_rechazar` | Nombres y apellidos del usuario que rechazó (texto de responsable_rechazar). |
| `guia_novedad` | Número de guía de la transportadora sobre el que se reportó la novedad. |
| `guia_inicial_adicional` | 1 si la novedad es de la guía inicial; 0 si es de la guía de devolución. |
| `fecha_trans_transportadora` | Fecha y hora en que la transportadora reportó la novedad. |
| `antiguedad` | Días transcurridos desde que la transportadora reportó la novedad, calculados como en el web (número entero). |
| `transportadora_efficommerce` | Id de la transportadora Effi que reportó la novedad (ver api/transportadora_efficommerce). |
| `nombre_transportadora_efficommerce` | Nombre de la transportadora Effi (texto de transportadora_efficommerce). |
| `id_novedad` | Id de la novedad en el catálogo de la transportadora Effi. |
| `nombre_novedad` | Nombre de la novedad (texto de id_novedad). |
| `t_novedad` | Id del tipo de novedad (1 = Operativa de la transportadora, 2 = Requiere solución de la empresa). |
| `tipo_novedad` | Nombre del tipo de novedad (texto de t_novedad). |
| `est_novedad` | Id del estado de la novedad (1 = Pendiente de solución, 2 = Pendiente de aprobación de solución, 3 = Solucionada, 4 = Cerrada por estado final de guía, 5 = Cerrada por nueva novedad ingresada, 6 = Cerrada por nuevo estado sin novedad). |
| `estado_novedad` | Nombre del estado de la novedad (texto de est_novedad). |
| `aclaracion` | Aclaración de la novedad reportada por la transportadora. |
| `cant_gestion` | Cantidad de gestiones registradas sobre la novedad. |
| `fecha_trans` | Fecha y hora de creación de la novedad en Effi, en UTC tal como está almacenada en la base de datos. |
| `fecha_ultima_gestion` | Fecha y hora de la última gestión de la novedad, en UTC (null si no tiene). |
| `fecha_solucion` | Fecha y hora en que se solucionó la novedad, en UTC (null si sigue abierta). |
| `sucursal_guia` | Id de la sucursal de la guía. |
| `prefijo` | Prefijo de la guía en la sucursal. |
| `id_guia` | Id interno de la guía (se repite entre sucursales: la clave es empresa + sucursal_guia + id_guia). |
| `id_transaccion_guia` | Identificador visible prefijo-id de la guía, como en el ERP. |
| `guia` | Número de la guía inicial asignado por la transportadora. |
| `guia_adicional` | Número de la guía de devolución (null si no tiene). |
| `fecha_trans_guia` | Fecha y hora de creación de la guía, en UTC. |
| `fecha_envio` | Fecha de envío de la guía (YYYY-MM-DD). |
| `nombre_sucursal` | Nombre de la sucursal de la guía (texto de sucursal_guia). |
| `centro_costos` | Id del centro de costos de la guía. |
| `nombre_centro_costos` | Nombre del centro de costos (texto de centro_costos). |
| `ubicacion_venta` | Id de la ubicación de venta de la guía (null si no aplica). |
| `nombre_ubicacion_venta` | Nombre de la ubicación de venta (texto de ubicacion_venta). |
| `transportadora` | Id de la transportadora de la empresa (ver api/transportadora). |
| `nombre_transportadora` | Nombre de la transportadora (texto de transportadora). |
| `servicio` | Nombre del tipo de servicio de la transportadora. |
| `forma_pago` | Nombre de la forma de pago del flete. |
| `valor_flete` | Valor del flete de la guía. |
| `valor_declarado` | Valor declarado de la mercancía. |
| `recaudo` | 1 si la guía tiene recaudo contra entrega; 0 si no. |
| `valor_recaudo` | Valor a recaudar contra entrega. |
| `contenido` | Contenido declarado de la guía. |
| `est_guia` | Id del estado actual de la guía según la transportadora. |
| `estado` | Nombre del estado de la guía (texto de est_guia). |
| `vigente_guia` | 1 si la guía está vigente; 0 si está anulada. |
| `remitente` | Código del remitente (codigo de api/remitente). |
| `nombre_remitente` | Nombre del remitente (texto de remitente). |
| `dni_remitente` | Id del tipo de documento de identidad del remitente (t_dni). |
| `abreviacion_remitente` | Abreviatura del tipo de documento del remitente (texto de dni_remitente). |
| `id_remitente` | Número de identificación del remitente. |
| `pais_remitente` | Id del país del remitente. |
| `nombre_pais_remitente` | Nombre del país del remitente (texto de pais_remitente). |
| `provincia_remitente` | Id del departamento/provincia del remitente. |
| `nombre_provincia_remitente` | Nombre del departamento del remitente (texto de provincia_remitente). |
| `ciudad_remitente` | Id de la ciudad del remitente. |
| `nombre_ciudad_remitente` | Nombre de la ciudad del remitente (texto de ciudad_remitente). |
| `direccion_remitente` | Dirección de recogida del remitente. |
| `telefonos_remitente` | Teléfonos del remitente. |
| `destinatario` | Código del tercero destinatario. |
| `nombre_destinatario` | Nombre del destinatario (texto de destinatario). |
| `dni_destinatario` | Id del tipo de documento de identidad del destinatario (t_dni). |
| `abreviacion_destinatario` | Abreviatura del tipo de documento del destinatario (texto de dni_destinatario). |
| `id_destinatario` | Número de identificación del destinatario. |
| `pais_destinatario` | Id del país del destinatario. |
| `nombre_pais_destinatario` | Nombre del país del destinatario (texto de pais_destinatario). |
| `provincia_destinatario` | Id del departamento/provincia del destinatario. |
| `nombre_provincia_destinatario` | Nombre del departamento del destinatario (texto de provincia_destinatario). |
| `ciudad_destinatario` | Id de la ciudad del destinatario. |
| `nombre_ciudad_destinatario` | Nombre de la ciudad del destinatario (texto de ciudad_destinatario). |
| `direccion_destinatario` | Dirección de entrega del destinatario. |
| `telefonos_destinatario` | Teléfonos del destinatario. |
| `responsable_crear` | Usuario (correo) que creó la novedad en Effi. |
| `nombre_responsable` | Nombres y apellidos del usuario que creó la novedad (texto de responsable_crear). |
| `vigente` | Vigencia de la novedad: siempre 1 (solo se listan gestiones de novedades vigentes). |

### Ejemplo de respuesta

```json
{
  "ok": true,
  "data": [
    {
      "empresa": "1",
      "nombre_empresa": "Comercializadora Andina S.A.S.",
      "id": "40",
      "id_gestion": "1",
      "est_gestion": "2",
      "estado_gestion": "Aprobada",
      "solucion": "1",
      "gestion": "Devolver al remitente, el cliente desiste de la compra",
      "id_solucion": "3",
      "nombre_solucion": "Devolver a remitente inicial",
      "fecha_nueva_entrega": null,
      "destinatario_gestion": null,
      "direccion_gestion": null,
      "telefonos_gestion": null,
      "ciudad_gestion": null,
      "comentario_rechazar": null,
      "response_api": null,
      "fecha_trans_gestion": "2026-10-16 03:18:26",
      "responsable_crear_gestion": "usuario@empresa.com",
      "nombre_responsable_crear": "Ana Pérez",
      "fecha_aprobar_gestion": "2026-10-16 03:18:26",
      "responsable_aprobar": "usuario@empresa.com",
      "nombre_responsable_aprobar": "Ana Pérez",
      "fecha_rechazar_gestion": null,
      "responsable_rechazar": null,
      "nombre_responsable_rechazar": null,
      "guia_novedad": "123456789012",
      "guia_inicial_adicional": "1",
      "fecha_trans_transportadora": "2026-10-14 10:00:00",
      "antiguedad": 2,
      "transportadora_efficommerce": "10",
      "nombre_transportadora_efficommerce": "SWAYP",
      "id_novedad": "8",
      "nombre_novedad": "Dirección incorrecta",
      "t_novedad": "2",
      "tipo_novedad": "Requiere solución de la empresa",
      "est_novedad": "3",
      "estado_novedad": "Solucionada",
      "aclaracion": "La dirección de destino no existe",
      "cant_gestion": "1",
      "fecha_trans": "2026-10-14 10:05:12",
      "fecha_ultima_gestion": "2026-10-16 03:18:26",
      "fecha_solucion": "2026-10-16 03:18:26",
      "sucursal_guia": "1",
      "prefijo": "PPAL",
      "id_guia": "677",
      "id_transaccion_guia": "PPAL-677",
      "guia": "123456789012",
      "guia_adicional": null,
      "fecha_trans_guia": "2026-10-13 17:44:40",
      "fecha_envio": "2026-10-13",
      "nombre_sucursal": "Principal",
      "centro_costos": "1",
      "nombre_centro_costos": "Principal",
      "ubicacion_venta": null,
      "nombre_ubicacion_venta": null,
      "transportadora": "90",
      "nombre_transportadora": "SWAYP | Con recaudo | Flete crédito",
      "servicio": "Última milla rápida (1Kg-8Kg)",
      "forma_pago": "Crédito",
      "valor_flete": "11100.00",
      "valor_declarado": "10000.00",
      "recaudo": "1",
      "valor_recaudo": "20000.00",
      "contenido": "Producto de ejemplo",
      "est_guia": "6",
      "estado": "Novedad",
      "vigente_guia": "1",
      "remitente": "1",
      "nombre_remitente": "Comercializadora Andina S.A.S.",
      "dni_remitente": "1",
      "abreviacion_remitente": "NIT",
      "id_remitente": "900123456",
      "pais_remitente": "47",
      "nombre_pais_remitente": "Colombia",
      "provincia_remitente": "776",
      "nombre_provincia_remitente": "Antioquia",
      "ciudad_remitente": "12601",
      "nombre_ciudad_remitente": "Medellín",
      "direccion_remitente": "Calle 10 # 20-30",
      "telefonos_remitente": "3001234567",
      "destinatario": "5877",
      "nombre_destinatario": "Distribuidora del Pacífico S.A.",
      "dni_destinatario": "1",
      "abreviacion_destinatario": "NIT",
      "id_destinatario": "1020304050",
      "pais_destinatario": "47",
      "nombre_pais_destinatario": "Colombia",
      "provincia_destinatario": "776",
      "nombre_provincia_destinatario": "Antioquia",
      "ciudad_destinatario": "12601",
      "nombre_ciudad_destinatario": "Medellín",
      "direccion_destinatario": "Carrera 45 # 12-34",
      "telefonos_destinatario": "3109876543",
      "responsable_crear": "usuario@empresa.com",
      "nombre_responsable": "Nombre Apellido",
      "vigente": "1"
    },
    {
      "empresa": "1",
      "nombre_empresa": "Comercializadora Andina S.A.S.",
      "id": "41",
      "id_gestion": "1",
      "est_gestion": "1",
      "estado_gestion": "Pendiente de revisión",
      "solucion": "0",
      "gestion": "Cliente confirma que recibe el 17; volver a ofrecer",
      "id_solucion": "1",
      "nombre_solucion": "Volver a ofrecer",
      "fecha_nueva_entrega": "2026-10-17",
      "destinatario_gestion": "Ana Pérez",
      "direccion_gestion": "Calle 10 # 20-30",
      "telefonos_gestion": "3001234567",
      "ciudad_gestion": "12601",
      "comentario_rechazar": null,
      "response_api": null,
      "fecha_trans_gestion": "2026-10-16 03:25:10",
      "responsable_crear_gestion": "usuario@empresa.com",
      "nombre_responsable_crear": "Ana Pérez",
      "fecha_aprobar_gestion": null,
      "responsable_aprobar": null,
      "nombre_responsable_aprobar": null,
      "fecha_rechazar_gestion": null,
      "responsable_rechazar": null,
      "nombre_responsable_rechazar": null,
      "guia_novedad": "123456789013",
      "guia_inicial_adicional": "1",
      "fecha_trans_transportadora": "2026-10-15 09:30:00",
      "antiguedad": 1,
      "transportadora_efficommerce": "10",
      "nombre_transportadora_efficommerce": "SWAYP",
      "id_novedad": "3",
      "nombre_novedad": "Destinatario ausente",
      "t_novedad": "2",
      "tipo_novedad": "Requiere solución de la empresa",
      "est_novedad": "2",
      "estado_novedad": "Pendiente de aprobación de solución",
      "aclaracion": "No se encontró a nadie en la dirección",
      "cant_gestion": "1",
      "fecha_trans": "2026-10-15 09:35:00",
      "fecha_ultima_gestion": "2026-10-16 03:25:10",
      "fecha_solucion": null,
      "sucursal_guia": "1",
      "prefijo": "PPAL",
      "id_guia": "680",
      "id_transaccion_guia": "PPAL-680",
      "guia": "123456789013",
      "guia_adicional": null,
      "fecha_trans_guia": "2026-10-14 11:20:05",
      "fecha_envio": "2026-10-14",
      "nombre_sucursal": "Principal",
      "centro_costos": "1",
      "nombre_centro_costos": "Principal",
      "ubicacion_venta": null,
      "nombre_ubicacion_venta"
```

---

## <a id="movimiento_dinero_effi"></a>GET `api/movimiento_dinero_effi` — Consultar movimientos de wallets

Devuelve los movimientos de las Wallets Effi (cuentas Effi) de la empresa asociada a la API key con las mismas columnas de la tabla de consulta y de "Ver más detalles" del web más las columnas de los filtros: id, fecha de origen y de creación, empresa y wallet con su titular e identificación, sucursal y centro de costos, tipo de movimiento, detalle, valor con su moneda, empresa Effi responsable, movimiento de reversión, guía inicial o adicional que lo originó con su transacción de venta de referencia y transportadora Effi, cuenta bancaria del retiro, solicitud de retiro o transferencia entre wallets asociada, tipo de origen, responsable, datos de anulación y vigencia; cada id de otra tabla va seguido de su nombre. Solo consulta: los movimientos los generan las liquidaciones, retiros y transferencias de Effi. Igual que en el web, una empresa solo ve los movimientos de sus propias wallets; la tabla no tiene filtro de vigencia en el web: se listan vigentes y revertidos. Es una tabla muy pesada: el parámetro fecha_desde es obligatorio; si no se envía fecha_hasta se asume hoy (fin del día en la zona horaria de la empresa) y el rango entre ambos no puede superar 31 días calendario; si falta el desde, las fechas no son válidas, el hasta es anterior al desde o el rango supera 31 días, responde 400. Si fecha_hasta llega solo con fecha (YYYY-MM-DD) se completa con 23:59:59. Los filtros son los mismos del bloque de búsqueda del módulo Movimientos de wallets del web (se llaman igual que las columnas); no se exponen empresa (siempre la de la API key), detalle (texto largo) ni los alias id_wallet/id_sucursal/id_centro_costos/id_cuenta bancaria del web, que duplican cuenta_effi, sucursal, centro_costos y cuenta. Requiere permiso de consulta sobre la función: Movimientos de Wallets.

Ejemplo: `GET api/movimiento_dinero_effi?fecha_desde=2026-10-01&fecha_hasta=2026-10-31&pagina=1&por_pagina=100`

### Parámetros

| Nombre | Tipo | Req. | Descripción |
|---|---|---|---|
| `fecha_desde` | date | sí | OBLIGATORIO. Fecha de creación del movimiento (fecha_trans) mayor o igual a la indicada. Formato YYYY-MM-DD o YYYY-MM-DD HH:MM:SS, interpretada en la zona horaria de la empresa. El rango hasta fecha_hasta no puede superar 31 días calendario. |
| `fecha_hasta` | date |  | Fecha de creación del movimiento (fecha_trans) menor o igual a la indicada. Formato YYYY-MM-DD (se completa con 23:59:59) o YYYY-MM-DD HH:MM:SS, interpretada en la zona horaria de la empresa. Si no se envía se asume hoy (fin del día). No puede ser anterior a fecha_desde ni superar 31 días calendario desde ella. |
| `id` | integer |  | Filtrar por el id del movimiento (máximo 13 dígitos). |
| `cuenta_effi` | integer |  | Filtrar por el id de la wallet (cuenta Effi) de la empresa. En el web es una lista desplegable dinámica. Solo se aplica si se envía (no enviar vacío). |
| `empresa_responsable` | integer |  | Filtrar por el id de la empresa Effi responsable del movimiento (Effisystems, Efficommerce...). En el web es una lista desplegable dinámica. |
| `t_movimiento` | integer |  | Filtrar por el id del tipo de movimiento de wallet (tabla t_movimiento_dinero_effi, p. ej. 1 Recaudo de venta, 18 Retiro de dinero de cuenta, 40 Transferencia enviada, 41 Transferencia recibida). En el web es una lista desplegable dinámica. |
| `cuenta` | integer |  | Filtrar por el id de la cuenta bancaria destino del retiro (ver api/cuenta). En el web es una lista desplegable dinámica. |
| `credito_debito` | integer |  | Filtrar por el sentido del movimiento: 1 ingresos (valor positivo); 0 egresos (valor negativo). Solo se aplica si se envía. Valores: `1` Ingreso, `0` Egreso |
| `sucursal` | integer |  | Filtrar por el id de la sucursal del movimiento (ver api/sucursal). En el web es una lista desplegable dinámica. |
| `centro_costos` | integer |  | Filtrar por el id del centro de costos (ver api/centro_costos). En el web es una lista desplegable dinámica. |
| `guia_inicial` | string |  | Filtrar por el número exacto de la guía inicial de la transportadora que originó el movimiento (máximo 20 caracteres). |
| `guia_adicional` | string |  | Filtrar por el número exacto de la guía adicional (devolución) que originó el movimiento (máximo 20 caracteres). |
| `transportadora_efficommerce` | integer |  | Filtrar por el id de la transportadora Effi (ver api/transportadora_efficommerce). En el web es una lista desplegable dinámica. Solo se aplica si se envía (no enviar vacío). |
| `divisa` | string |  | Filtrar por el código ISO de la moneda del movimiento (ver api/moneda). En el web es una lista desplegable dinámica. |
| `valor_desde` | decimal |  | Valor absoluto del movimiento mayor o igual al indicado (rango numérico; combinar con valor_hasta). Enviar solo cuando se use. |
| `valor_hasta` | decimal |  | Valor absoluto del movimiento menor o igual al indicado (rango numérico; combinar con valor_desde). Enviar solo cuando se use. |
| `fecha_origen_desde` | date |  | Fecha de origen del movimiento (fecha_origen) mayor o igual a la indicada. Formato YYYY-MM-DD o YYYY-MM-DD HH:MM:SS, interpretada en la zona horaria de la empresa. |
| `fecha_origen_hasta` | date |  | Fecha de origen del movimiento (fecha_origen) menor o igual a la indicada. Formato YYYY-MM-DD o YYYY-MM-DD HH:MM:SS, interpretada en la zona horaria de la empresa. |
| `t_origen` | integer |  | Filtrar por el id del tipo de origen del movimiento (tabla t_origen_movimiento_dinero_effi, p. ej. 1 Transacción manual, 8 Liquidación automática, 15 Transacción de empresa Effisystems). En el web es una lista desplegable dinámica. |
| `responsable` | string |  | Filtrar por el usuario (correo) que registró el movimiento. |
| `pagina` | integer |  | Número de página. Por defecto 1. |
| `por_pagina` | integer |  | Registros por página. Por defecto 100, máximo 100. |

### Campos de respuesta

| Campo | Descripción |
|---|---|
| `id` | Identificador del movimiento de wallet. |
| `fecha_origen` | Fecha y hora de origen del movimiento (fecha del hecho que lo generó), en UTC. |
| `fecha_trans` | Fecha y hora de creación del movimiento, en UTC tal como está almacenada en la base de datos. |
| `empresa` | Id de la empresa dueña de la wallet (la de la API key). |
| `nombre_empresa` | Nombre de la empresa (texto de empresa). |
| `cuenta_effi` | Id de la wallet (cuenta Effi) dentro de la empresa. |
| `titular` | Titular de la wallet (texto de cuenta_effi). |
| `abreviacion` | Abreviatura del tipo de documento del titular (NIT, CC...). |
| `id_titular` | Número de identificación del titular de la wallet. |
| `sucursal` | Id de la sucursal del movimiento (null si no aplica). |
| `nombre_sucursal` | Nombre de la sucursal (texto de sucursal). |
| `centro_costos` | Id del centro de costos (null si no aplica). |
| `nombre_centro_costos` | Nombre del centro de costos (texto de centro_costos). |
| `t_movimiento` | Id del tipo de movimiento de wallet (t_movimiento_dinero_effi). |
| `tipo_movimiento` | Nombre del tipo de movimiento (texto de t_movimiento). |
| `detalle` | Detalle del movimiento. |
| `valor` | Valor del movimiento (positivo ingreso, negativo egreso). |
| `divisa` | Código ISO de la moneda del movimiento. |
| `simbolo_moneda` | Símbolo de la moneda (texto de divisa). |
| `nombre_moneda` | Nombre de la moneda (texto de divisa). |
| `empresa_responsable` | Id de la empresa Effi responsable del movimiento. |
| `nombre_empresa_responsable` | Nombre de la empresa Effi responsable (texto de empresa_responsable). |
| `movimiento_dinero_effi_reversion` | Id del movimiento que reversa a este (null si no fue revertido). |
| `guia_inicial` | Número de la guía inicial que originó el movimiento (null si no aplica). |
| `guia_adicional` | Número de la guía adicional (devolución) que originó el movimiento (null si no aplica). |
| `empresa_guia` | Id de la empresa de la guía (null si no aplica). |
| `sucursal_guia` | Sucursal de la guía. |
| `prefijo_guia` | Prefijo de la guía. |
| `id_guia` | Id interno de la guía. |
| `t_trans_ref` | Id del tipo de transacción de venta de referencia de la guía (null si no aplica). |
| `nombre_t_trans` | Nombre del tipo de transacción (texto de t_trans_ref). |
| `sucursal_ref` | Sucursal de la transacción de referencia. |
| `prefijo_ref` | Prefijo de la transacción de referencia. |
| `id_ref` | Id de la transacción de referencia. |
| `transportadora_efficommerce` | Id de la transportadora Effi (null si no aplica). |
| `nombre_transportadora_efficommerce` | Nombre de la transportadora Effi (texto de transportadora_efficommerce). |
| `cuenta` | Id de la cuenta bancaria destino del retiro (null si no aplica). |
| `nombre_banco` | Nombre del banco de la cuenta (texto de cuenta). |
| `tipo_cuenta` | Tipo de la cuenta bancaria (Ahorros, Corriente...). |
| `numero_cuenta` | Número de la cuenta bancaria. |
| `titular_cuenta` | Titular de la cuenta bancaria. |
| `solicitud_retiro` | Id de la solicitud de retiro asociada (ver api/solicitud_retiro_cuenta_effi; null si no aplica). |
| `transferencia_cuenta_effi` | Id de la transferencia entre wallets asociada (ver api/transferencia_cuenta_effi; null si no aplica). |
| `t_origen` | Id del tipo de origen del movimiento (tabla t_origen_movimiento_dinero_effi: 1 Transacción manual, 2 Liquidación con recaudo, 3 Liquidación sin recaudo, 4 Liquidación devolución, 5 Liquidación indemnización de mercancía, 6 Liquidación alistamiento, 7 Liquidación con recaudo de transportadora, 8 Liquidación automática, 9 Revertir liquidación, 10 Revertir manual, 11 Rechazar solicitud de retiro de Wallet, 12 Liquidación indemnización de flete, 13 Solicitud de retiro de Wallet, 14 Transferencia entre Wallets, 15 Transacción de empresa Effisystems; no es el canal por el que se creó la transacción). |
| `tipo_origen` | Nombre del tipo de origen (texto de t_origen en t_origen_movimiento_dinero_effi). |
| `responsable` | Usuario (correo) que registró el movimiento. |
| `nombre_responsable` | Nombres y apellidos del usuario (texto de responsable). |
| `fecha_anular` | Fecha y hora de reversión/anulación, en UTC (null si está vigente). |
| `observacion_anular` | Observación de la anulación (null si está vigente). |
| `responsable_anular` | Usuario (correo) que anuló (null si está vigente). |
| `nombre_responsable_anular` | Nombres y apellidos del usuario que anuló (texto de responsable_anular). |
| `vigente` | 1 si el movimiento está vigente; 0 si fue revertido/anulado. |

### Ejemplo de respuesta

```json
{
  "ok": true,
  "data": [
    {
      "id": "5519",
      "fecha_origen": "2026-10-16 01:00:53",
      "fecha_trans": "2026-10-16 01:00:53",
      "empresa": "1",
      "nombre_empresa": "Comercializadora Andina S.A.S.",
      "cuenta_effi": "1",
      "titular": "Comercializadora Andina S.A.S.",
      "abreviacion": "NIT",
      "id_titular": "900123456",
      "sucursal": null,
      "nombre_sucursal": null,
      "centro_costos": null,
      "nombre_centro_costos": null,
      "t_movimiento": "1",
      "tipo_movimiento": "Recaudo de venta",
      "detalle": "Recaudo guía 123456789 - Pedido 1001",
      "valor": "150000.00",
      "divisa": "COP",
      "simbolo_moneda": "$",
      "nombre_moneda": "Peso Colombiano",
      "empresa_responsable": "170",
      "nombre_empresa_responsable": "EFFICOMMERCE S.A.S.",
      "movimiento_dinero_effi_reversion": null,
      "guia_inicial": "123456789",
      "guia_adicional": null,
      "empresa_guia": "1",
      "sucursal_guia": "1",
      "prefijo_guia": "PPAL",
      "id_guia": "250",
      "t_trans_ref": "1",
      "nombre_t_trans": "FACTURA DE VENTA",
      "sucursal_ref": "1",
      "prefijo_ref": "PPAL",
      "id_ref": "1001",
      "transportadora_efficommerce": "6",
      "nombre_transportadora_efficommerce": "Coordinadora",
      "cuenta": null,
      "nombre_banco": null,
      "tipo_cuenta": null,
      "numero_cuenta": null,
      "titular_cuenta": null,
      "solicitud_retiro": null,
      "transferencia_cuenta_effi": null,
      "t_origen": "8",
      "tipo_origen": "Liquidación automática",
      "responsable": "usuario@empresa.com",
      "nombre_responsable": "Nombre Apellido",
      "fecha_anular": null,
      "observacion_anular": null,
      "responsable_anular": null,
      "nombre_responsable_anular": null,
      "vigente": "1"
    },
    {
      "id": "5518",
      "fecha_origen": "2026-10-15 16:20:10",
      "fecha_trans": "2026-10-15 16:20:10",
      "empresa": "1",
      "nombre_empresa": "Comercializadora Andina S.A.S.",
      "cuenta_effi": "1",
      "titular": "Comercializadora Andina S.A.S.",
      "abreviacion": "NIT",
      "id_titular": "900123456",
      "sucursal": null,
      "nombre_sucursal": null,
      "centro_costos": null,
      "nombre_centro_costos": null,
      "t_movimiento": "18",
      "tipo_movimiento": "Retiro de dinero de cuenta",
      "detalle": "Retiro a cuenta bancaria 00123456789",
      "valor": "-1500000.00",
      "divisa": "COP",
      "simbolo_moneda": "$",
      "nombre_moneda": "Peso Colombiano",
      "empresa_responsable": "170",
      "nombre_empresa_responsable": "EFFICOMMERCE S.A.S.",
      "movimiento_dinero_effi_reversion": null,
      "guia_inicial": null,
      "guia_adicional": null,
      "empresa_guia": null,
      "sucursal_guia": null,
      "prefijo_guia": null,
      "id_guia": null,
      "t_trans_ref": null,
      "nombre_t_trans": null,
      "sucursal_ref": null,
      "prefijo_ref": null,
      "id_ref": null,
      "transportadora_efficommerce": null,
      "nombre_transportadora_efficommerce": null,
      "cuenta": "2",
      "nombre_banco": "Banco Ejemplo",
      "tipo_cuenta": "Ahorros",
      "numero_cuenta": "00123456789",
      "titular_cuenta": "Comercializadora Andina S.A.S.",
      "solicitud_retiro": "18",
      "transferencia_cuenta_effi": null,
      "t_origen": "1",
      "tipo_origen": "Transacción manual",
      "responsable": "usuario@empresa.com",
      "nombre_responsable": "Nombre Apellido",
      "fecha_anular": null,
      "observacion_anular": null,
      "responsable_anular": null,
      "nombre_responsable_anular": null,
      "vigente": "1"
    }
  ],
  "paginacion": {
    "pagina": 1,
    "por_pagina": 100,
    "total": 2,
    "total_paginas": 1
  }
}
```

---

## <a id="solicitud_retiro_cuenta_effi"></a>GET `api/solicitud_retiro_cuenta_effi` — Consultar solicitudes de retiro de wallet

Devuelve las solicitudes de retiro de saldo de las Wallets Effi de la empresa asociada a la API key con las mismas columnas de la tabla de consulta y de "Ver más detalles" del web más las columnas de los filtros: id y empresa Effi responsable del pago (la llave es empresa_responsable + id; id_solicitud es el identificador visible "empresa_responsable-id", como en el web), fechas de creación y confirmación, referencia, empresa y wallet con su titular, identificación y contacto, cuenta bancaria destino con titular, banco, país, SWIFT, tipo, moneda y número, valor solicitado y moneda, valor recibido y tasa pactada cuando hubo conversión, estado, observación de confirmación y responsables; cada id de otra tabla va seguido de su nombre. Solo consulta: la solicitud se crea y confirma en el ERP con OTP y contrato de mandato. Igual que en el web, una empresa solo ve las solicitudes de sus propias wallets. La tabla no tiene columna vigente: el estado es est_solicitud. No se exponen secretos ni archivos (códigos OTP, IP, contrato de mandato, certificado bancario) ni saldos internos. Si fecha_hasta llega solo con fecha (YYYY-MM-DD) se completa con 23:59:59. Los filtros son los mismos del bloque de búsqueda del módulo Solicitudes de retiro de wallet del web (se llaman igual que las columnas); no se exponen empresa_cuenta_effi (siempre la de la API key), id_cuenta_effi (duplica cuenta_effi), url_certificado ni id_titular, t_cuenta y cuenta_bancaria (en el modelo del web producen error o filtran otra columna). Requiere permiso de consulta sobre la función: Solicitudes de retiro de Wallet.

Ejemplo: `GET api/solicitud_retiro_cuenta_effi?fecha_desde=2026-01-01&fecha_hasta=2026-12-31&pagina=1&por_pagina=100`

### Parámetros

| Nombre | Tipo | Req. | Descripción |
|---|---|---|---|
| `id` | integer |  | Filtrar por el consecutivo de la solicitud (máximo 13 dígitos). El consecutivo es por empresa Effi responsable: combínelo con empresa_responsable. |
| `cuenta_effi` | integer |  | Filtrar por el id de la wallet (cuenta Effi) de la empresa. En el web es una lista desplegable dinámica. Solo se aplica si se envía (no enviar vacío). |
| `empresa_responsable` | string |  | Filtrar por el id de la empresa Effi responsable del pago; admite varios ids separados por coma (cumple al menos uno). En el web es una lista desplegable dinámica de selección múltiple. |
| `est_solicitud` | string |  | Filtrar por el id del estado de la solicitud (1 = En proceso, 2 = Aprobada, 3 = Rechazada); admite varios ids separados por coma. En el web es una lista desplegable dinámica de selección múltiple. |
| `pais_banco` | integer |  | Filtrar por el id del país del banco de la cuenta destino (ver api/pais). En el web es una lista desplegable dinámica. |
| `nombre_banco` | string |  | Filtrar por el nombre del banco de la cuenta destino (coincidencia parcial, sin distinguir mayúsculas; máximo 80 caracteres). |
| `numero_cuenta` | string |  | Filtrar por el número de la cuenta bancaria destino (coincidencia parcial; máximo 40 caracteres). |
| `divisa_cuenta` | string |  | Filtrar por el código ISO de la moneda de la cuenta bancaria destino (ver api/moneda). En el web es una lista desplegable dinámica. |
| `fecha_desde` | date |  | Fecha de creación de la solicitud (fecha_trans) mayor o igual a la indicada. Formato YYYY-MM-DD o YYYY-MM-DD HH:MM:SS, interpretada en la zona horaria de la empresa. |
| `fecha_hasta` | date |  | Fecha de creación de la solicitud (fecha_trans) menor o igual a la indicada. Formato YYYY-MM-DD (se completa con 23:59:59) o YYYY-MM-DD HH:MM:SS, interpretada en la zona horaria de la empresa. |
| `valor_desde` | decimal |  | Valor solicitado mayor o igual al indicado (rango numérico; combinar con valor_hasta). Enviar solo cuando se use. |
| `valor_hasta` | decimal |  | Valor solicitado menor o igual al indicado (rango numérico; combinar con valor_desde). Enviar solo cuando se use. |
| `divisa_valor` | string |  | Filtrar por el código ISO de la moneda del valor solicitado (la de la wallet; ver api/moneda). En el web es una lista desplegable dinámica. |
| `url_contrato_mandato` | integer |  | Filtrar por si la solicitud tiene adjunto el contrato de mandato: 1 adjunto; 0 pendiente. Solo se aplica si se envía. Valores: `1` Adjunto, `0` Pendiente |
| `cuenta_effi_cuenta` | integer |  | Filtrar por si la cuenta bancaria destino está inscrita en Effi: 1 inscrita; 0 pendiente. Solo se aplica si se envía. Valores: `1` Inscrita, `0` Pendiente |
| `pagina` | integer |  | Número de página. Por defecto 1. |
| `por_pagina` | integer |  | Registros por página. Por defecto 100, máximo 100. |

### Campos de respuesta

| Campo | Descripción |
|---|---|
| `id` | Consecutivo de la solicitud dentro de la empresa Effi responsable (la llave es empresa_responsable + id). |
| `empresa_responsable` | Id de la empresa Effi responsable del pago del retiro. |
| `nombre_empresa_responsable` | Nombre de la empresa Effi responsable (texto de empresa_responsable). |
| `id_solicitud` | Identificador visible "empresa_responsable-id", como en el ERP. |
| `fecha_trans` | Fecha y hora de creación de la solicitud, en UTC tal como está almacenada en la base de datos. |
| `fecha_confirmar` | Fecha y hora de confirmación (aprobación o rechazo), en UTC (null si está en proceso). |
| `referencia` | Referencia o concepto del retiro. |
| `empresa_cuenta_effi` | Id de la empresa dueña de la wallet (la de la API key). |
| `nombre_empresa_cuenta_effi` | Nombre de la empresa dueña de la wallet (texto de empresa_cuenta_effi). |
| `cuenta_effi` | Id de la wallet (cuenta Effi) de la que se retira. |
| `titular_cuenta_effi` | Titular de la wallet (texto de cuenta_effi). |
| `t_dni_titular_cuenta_effi` | Id del tipo de documento del titular de la wallet (t_dni). |
| `abreviacion_cuenta_effi` | Abreviatura del tipo de documento del titular de la wallet (texto de t_dni_titular_cuenta_effi). |
| `id_titular_cuenta_effi` | Número de identificación del titular de la wallet. |
| `celular_cuenta_effi` | Celular de contacto de la wallet. |
| `email_cuenta_effi` | Correo de contacto de la wallet. |
| `cuenta_bancaria` | Id de la cuenta bancaria destino dentro de la empresa. |
| `titular_cuenta_bancaria` | Titular de la cuenta bancaria destino. |
| `t_dni_titular_cuenta_bancaria` | Id del tipo de documento del titular de la cuenta bancaria (t_dni). |
| `abreviacion_cuenta_bancaria` | Abreviatura del tipo de documento del titular de la cuenta bancaria (texto de t_dni_titular_cuenta_bancaria). |
| `id_titular_cuenta_bancaria` | Número de identificación del titular de la cuenta bancaria. |
| `banco` | Id del banco de la cuenta destino. |
| `nombre_banco` | Nombre del banco (texto de banco). |
| `pais_banco` | Id del país del banco. |
| `nombre_pais_banco` | Nombre del país del banco (texto de pais_banco). |
| `swift_banco` | Código SWIFT del banco (null si no aplica). |
| `direccion_banco` | Dirección del banco (null si no aplica). |
| `t_cuenta` | Id del tipo de cuenta bancaria. |
| `tipo_cuenta` | Nombre del tipo de cuenta bancaria (texto de t_cuenta): Ahorros, Corriente... |
| `divisa_cuenta` | Código ISO de la moneda de la cuenta bancaria. |
| `simbolo_moneda_cuenta` | Símbolo de la moneda de la cuenta (texto de divisa_cuenta). |
| `numero_cuenta` | Número de la cuenta bancaria destino. |
| `cuenta_inscrita_effi` | 1 si la cuenta bancaria está inscrita en Effi; 0 si está pendiente. |
| `valor` | Valor solicitado, en la moneda de la wallet. |
| `divisa_valor` | Código ISO de la moneda del valor solicitado. |
| `simbolo_moneda_valor` | Símbolo de la moneda del valor (texto de divisa_valor). |
| `valor_recibido` | Valor recibido en la moneda de la cuenta bancaria cuando hubo conversión (null si no aplica o no se ha confirmado). |
| `trm_calculada` | Tasa de cambio pactada cuando hubo conversión de divisa (null si no aplica). |
| `est_solicitud` | Id del estado de la solicitud (1 = En proceso, 2 = Aprobada, 3 = Rechazada). |
| `estado_solicitud` | Nombre del estado (texto de est_solicitud). |
| `observacion_confirmar` | Observación registrada al confirmar la solicitud (null si está en proceso). |
| `responsable` | Usuario (correo) que creó la solicitud. |
| `nombre_responsable` | Nombres y apellidos del usuario que creó la solicitud (texto de responsable). |
| `responsable_confirmar` | Usuario (correo) de Effi que confirmó la solicitud (null si está en proceso). |
| `nombre_responsable_confirmar` | Nombres y apellidos del usuario que confirmó (texto de responsable_confirmar). |

### Ejemplo de respuesta

```json
{
  "ok": true,
  "data": [
    {
      "id": "18",
      "empresa_responsable": "170",
      "nombre_empresa_responsable": "EFFICOMMERCE S.A.S.",
      "id_solicitud": "170-18",
      "fecha_trans": "2026-10-06 07:57:13",
      "fecha_confirmar": null,
      "referencia": "Pago de proveedores",
      "empresa_cuenta_effi": "1",
      "nombre_empresa_cuenta_effi": "Comercializadora Andina S.A.S.",
      "cuenta_effi": "1",
      "titular_cuenta_effi": "Comercializadora Andina S.A.S.",
      "t_dni_titular_cuenta_effi": "1",
      "abreviacion_cuenta_effi": "NIT",
      "id_titular_cuenta_effi": "900123456",
      "celular_cuenta_effi": "3001234567",
      "email_cuenta_effi": "usuario@empresa.com",
      "cuenta_bancaria": "2",
      "titular_cuenta_bancaria": "Comercializadora Andina S.A.S.",
      "t_dni_titular_cuenta_bancaria": "1",
      "abreviacion_cuenta_bancaria": "NIT",
      "id_titular_cuenta_bancaria": "900123456",
      "banco": "15",
      "nombre_banco": "Banco Ejemplo",
      "pais_banco": "47",
      "nombre_pais_banco": "Colombia",
      "swift_banco": null,
      "direccion_banco": null,
      "t_cuenta": "1",
      "tipo_cuenta": "Ahorros",
      "divisa_cuenta": "COP",
      "simbolo_moneda_cuenta": "$",
      "numero_cuenta": "00123456789",
      "cuenta_inscrita_effi": "0",
      "valor": "1500000.00",
      "divisa_valor": "COP",
      "simbolo_moneda_valor": "$",
      "valor_recibido": null,
      "trm_calculada": null,
      "est_solicitud": "1",
      "estado_solicitud": "En proceso",
      "observacion_confirmar": null,
      "responsable": "usuario@empresa.com",
      "nombre_responsable": "Nombre Apellido",
      "responsable_confirmar": null,
      "nombre_responsable_confirmar": null
    },
    {
      "id": "17",
      "empresa_responsable": "170",
      "nombre_empresa_responsable": "EFFICOMMERCE S.A.S.",
      "id_solicitud": "170-17",
      "fecha_trans": "2026-09-28 14:10:40",
      "fecha_confirmar": "2026-09-29 09:15:02",
      "referencia": "Retiro de recaudos septiembre",
      "empresa_cuenta_effi": "1",
      "nombre_empresa_cuenta_effi": "Comercializadora Andina S.A.S.",
      "cuenta_effi": "1",
      "titular_cuenta_effi": "Comercializadora Andina S.A.S.",
      "t_dni_titular_cuenta_effi": "1",
      "abreviacion_cuenta_effi": "NIT",
      "id_titular_cuenta_effi": "900123456",
      "celular_cuenta_effi": "3001234567",
      "email_cuenta_effi": "usuario@empresa.com",
      "cuenta_bancaria": "2",
      "titular_cuenta_bancaria": "Comercializadora Andina S.A.S.",
      "t_dni_titular_cuenta_bancaria": "1",
      "abreviacion_cuenta_bancaria": "NIT",
      "id_titular_cuenta_bancaria": "900123456",
      "banco": "15",
      "nombre_banco": "Banco Ejemplo",
      "pais_banco": "47",
      "nombre_pais_banco": "Colombia",
      "swift_banco": null,
      "direccion_banco": null,
      "t_cuenta": "1",
      "tipo_cuenta": "Ahorros",
      "divisa_cuenta": "COP",
      "simbolo_moneda_cuenta": "$",
      "numero_cuenta": "00123456789",
      "cuenta_inscrita_effi": "1",
      "valor": "2000000.00",
      "divisa_valor": "COP",
      "simbolo_moneda_valor": "$",
      "valor_recibido": "2000000.00",
      "trm_calculada": null,
      "est_solicitud": "2",
      "estado_solicitud": "Aprobada",
      "observacion_confirmar": "Transferencia realizada",
      "responsable": "usuario@empresa.com",
      "nombre_responsable": "Nombre Apellido",
      "responsable_confirmar": "usuario@empresa.com",
      "nombre_responsable_confirmar": "Laura Martínez"
    }
  ],
  "paginacion": {
    "pagina": 1,
    "por_pagina": 100,
    "total": 18,
    "total_paginas": 1
  }
}
```

---

## <a id="transferencia_cuenta_effi"></a>GET `api/transferencia_cuenta_effi` — Consultar transferencias entre wallets

Devuelve las transferencias de saldo entre Wallets Effi ENVIADAS por la empresa asociada a la API key con las mismas columnas de la tabla de consulta y de "Ver más detalles" del web más las columnas de los filtros: id (consecutivo real) e identificador cifrado que muestra el ERP (id_transferencia), fecha, referencia, wallet de origen y de destino con su empresa, titular e identificación y la empresa Effi responsable de cada una, valor enviado con su moneda, valor recibido con su moneda, tasa pactada cuando las divisas son distintas, responsable, datos de anulación y vigencia; cada id de otra tabla va seguido de su nombre. Solo consulta: la transferencia se crea en el ERP con OTP y cotización de tasa. Igual que en el web, una empresa solo ve las transferencias que envió; la empresa destinataria ve el crédito en GET api/movimiento_dinero_effi (t_movimiento 41). No se exponen secretos ni márgenes (códigos OTP, IP, markup de la tasa). Si fecha_hasta llega solo con fecha (YYYY-MM-DD) se completa con 23:59:59. Los filtros son los mismos del bloque de búsqueda del módulo Transferencias entre wallets del web (se llaman igual que las columnas); el filtro id recibe el consecutivo real (campo id de la respuesta) y no el cifrado; no se expone empresa_cuenta_effi_origen (siempre la de la API key). Si no se envía vigente se listan vigentes y anuladas (como el web con "Seleccionar..."); vigente=1 lista solo las vigentes y vigente=0 solo las anuladas. Requiere permiso de consulta sobre la función: Transferencias entre Wallets.

Ejemplo: `GET api/transferencia_cuenta_effi?fecha_desde=2026-01-01&fecha_hasta=2026-12-31&pagina=1&por_pagina=100`

### Parámetros

| Nombre | Tipo | Req. | Descripción |
|---|---|---|---|
| `id` | integer |  | Filtrar por el consecutivo real de la transferencia (campo id de la respuesta). En el web se escribe el identificador cifrado; la API recibe el consecutivo y lo convierte. |
| `empresa_responsable_origen` | string |  | Filtrar por el id de la empresa Effi responsable de la wallet de origen; admite varios ids separados por coma. En el web es una lista desplegable dinámica de selección múltiple. |
| `empresa_responsable_destino` | string |  | Filtrar por el id de la empresa Effi responsable de la wallet de destino; admite varios ids separados por coma. En el web es una lista desplegable dinámica de selección múltiple. |
| `vigente` | integer |  | Si no se envía se listan vigentes y anuladas (como el web con "Seleccionar..."). Enviar vigente=1 para listar solo las vigentes o vigente=0 para listar solo las anuladas. Valores: `1` Vigente, `0` Anulada |
| `divisa_origen` | string |  | Filtrar por el código ISO de la moneda de la wallet de origen (ver api/moneda). En el web es una lista desplegable dinámica. |
| `divisa_destino` | string |  | Filtrar por el código ISO de la moneda de la wallet de destino (ver api/moneda). En el web es una lista desplegable dinámica. |
| `valor_desde` | decimal |  | Valor enviado (valor_origen) mayor o igual al indicado (rango numérico; combinar con valor_hasta). Enviar solo cuando se use. |
| `valor_hasta` | decimal |  | Valor enviado (valor_origen) menor o igual al indicado (rango numérico; combinar con valor_desde). Enviar solo cuando se use. |
| `fecha_desde` | date |  | Fecha de creación (fecha_trans) mayor o igual a la indicada. Formato YYYY-MM-DD o YYYY-MM-DD HH:MM:SS, interpretada en la zona horaria de la empresa. |
| `fecha_hasta` | date |  | Fecha de creación (fecha_trans) menor o igual a la indicada. Formato YYYY-MM-DD (se completa con 23:59:59) o YYYY-MM-DD HH:MM:SS, interpretada en la zona horaria de la empresa. |
| `cuenta_effi_origen` | integer |  | Filtrar por el id de la wallet de origen dentro de la empresa de la API key (máximo 13 dígitos). |
| `empresa_cuenta_effi_destino` | integer |  | Filtrar por el id de la empresa dueña de la wallet de destino (máximo 7 dígitos). |
| `cuenta_effi_destino` | integer |  | Filtrar por el id de la wallet de destino dentro de su empresa (máximo 13 dígitos). |
| `id_titular_origen` | string |  | Filtrar por el número de identificación del titular de la wallet de origen (máximo 20 caracteres). |
| `id_titular_destino` | string |  | Filtrar por el número de identificación del titular de la wallet de destino (máximo 20 caracteres). |
| `pagina` | integer |  | Número de página. Por defecto 1. |
| `por_pagina` | integer |  | Registros por página. Por defecto 100, máximo 100. |

### Campos de respuesta

| Campo | Descripción |
|---|---|
| `id` | Consecutivo real de la transferencia (el mismo que referencia movimiento_dinero_effi.transferencia_cuenta_effi). |
| `id_transferencia` | Identificador cifrado de la transferencia que muestra el ERP ("ID transferencia" de la tabla del web). |
| `fecha_trans` | Fecha y hora de creación, en UTC tal como está almacenada en la base de datos. |
| `referencia` | Referencia o concepto de la transferencia. |
| `empresa_cuenta_effi_origen` | Id de la empresa dueña de la wallet de origen (la de la API key). |
| `nombre_empresa_cuenta_effi_origen` | Nombre de la empresa de origen (texto de empresa_cuenta_effi_origen). |
| `cuenta_effi_origen` | Id de la wallet de origen dentro de su empresa. |
| `t_dni_titular_origen` | Id del tipo de documento del titular de la wallet de origen (t_dni). |
| `abreviacion_titular_origen` | Abreviatura del tipo de documento del titular de origen (texto de t_dni_titular_origen). |
| `id_titular_origen` | Número de identificación del titular de la wallet de origen. |
| `titular_origen` | Titular de la wallet de origen (texto de cuenta_effi_origen). |
| `empresa_responsable_origen` | Id de la empresa Effi responsable de la wallet de origen. |
| `nombre_empresa_responsable_origen` | Nombre de la empresa Effi responsable de origen (texto de empresa_responsable_origen). |
| `empresa_cuenta_effi_destino` | Id de la empresa dueña de la wallet de destino. |
| `nombre_empresa_cuenta_effi_destino` | Nombre de la empresa de destino (texto de empresa_cuenta_effi_destino). |
| `cuenta_effi_destino` | Id de la wallet de destino dentro de su empresa. |
| `t_dni_titular_destino` | Id del tipo de documento del titular de la wallet de destino (t_dni). |
| `abreviacion_titular_destino` | Abreviatura del tipo de documento del titular de destino (texto de t_dni_titular_destino). |
| `id_titular_destino` | Número de identificación del titular de la wallet de destino. |
| `titular_destino` | Titular de la wallet de destino (texto de cuenta_effi_destino). |
| `empresa_responsable_destino` | Id de la empresa Effi responsable de la wallet de destino. |
| `nombre_empresa_responsable_destino` | Nombre de la empresa Effi responsable de destino (texto de empresa_responsable_destino). |
| `divisa_origen` | Código ISO de la moneda de la wallet de origen. |
| `simbolo_moneda_origen` | Símbolo de la moneda de origen (texto de divisa_origen). |
| `valor_origen` | Valor enviado, en la moneda de origen. |
| `divisa_destino` | Código ISO de la moneda de la wallet de destino. |
| `simbolo_moneda_destino` | Símbolo de la moneda de destino (texto de divisa_destino). |
| `valor_destino` | Valor recibido, en la moneda de destino. |
| `trm_calculada` | Tasa de cambio pactada cuando las divisas son distintas (null si son iguales). |
| `responsable_crear` | Usuario (correo) que creó la transferencia. |
| `nombre_responsable` | Nombres y apellidos del usuario que creó la transferencia (texto de responsable_crear). |
| `fecha_anular` | Fecha y hora de anulación, en UTC (null si está vigente). |
| `observacion_anular` | Observación de anulación (null si está vigente). |
| `responsable_anular` | Usuario (correo) que anuló (null si está vigente). |
| `nombre_responsable_anular` | Nombres y apellidos del usuario que anuló (texto de responsable_anular). |
| `vigente` | 1 si la transferencia está vigente; 0 si está anulada. |

### Ejemplo de respuesta

```json
{
  "ok": true,
  "data": [
    {
      "id": "19",
      "id_transferencia": "aBcDeFgHiJkLmNoPqRsTuV==",
      "fecha_trans": "2026-10-06 08:13:48",
      "referencia": "Traslado de saldo a filial",
      "empresa_cuenta_effi_origen": "1",
      "nombre_empresa_cuenta_effi_origen": "Comercializadora Andina S.A.S.",
      "cuenta_effi_origen": "1",
      "t_dni_titular_origen": "1",
      "abreviacion_titular_origen": "NIT",
      "id_titular_origen": "900123456",
      "titular_origen": "Comercializadora Andina S.A.S.",
      "empresa_responsable_origen": "170",
      "nombre_empresa_responsable_origen": "EFFICOMMERCE S.A.S.",
      "empresa_cuenta_effi_destino": "187",
      "nombre_empresa_cuenta_effi_destino": "Distribuidora del Pacífico S.A.",
      "cuenta_effi_destino": "1",
      "t_dni_titular_destino": "1",
      "abreviacion_titular_destino": "NIT",
      "id_titular_destino": "1020304050",
      "titular_destino": "Distribuidora del Pacífico S.A.",
      "empresa_responsable_destino": "5427",
      "nombre_empresa_responsable_destino": "EFFICOMMERCE ECUADOR",
      "divisa_origen": "COP",
      "simbolo_moneda_origen": "$",
      "valor_origen": "320234.87",
      "divisa_destino": "USD",
      "simbolo_moneda_destino": "$",
      "valor_destino": "100.00",
      "trm_calculada": "0.0003122708",
      "responsable_crear": "usuario@empresa.com",
      "nombre_responsable": "Nombre Apellido",
      "fecha_anular": null,
      "observacion_anular": null,
      "responsable_anular": null,
      "nombre_responsable_anular": null,
      "vigente": "1"
    },
    {
      "id": "18",
      "id_transferencia": "XyZaBcDeFgHiJkLmNoPqRs==",
      "fecha_trans": "2026-10-01 10:02:15",
      "referencia": "Pago a aliado logístico",
      "empresa_cuenta_effi_origen": "1",
      "nombre_empresa_cuenta_effi_origen": "Comercializadora Andina S.A.S.",
      "cuenta_effi_origen": "1",
      "t_dni_titular_origen": "1",
      "abreviacion_titular_origen": "NIT",
      "id_titular_origen": "900123456",
      "titular_origen": "Comercializadora Andina S.A.S.",
      "empresa_responsable_origen": "170",
      "nombre_empresa_responsable_origen": "EFFICOMMERCE S.A.S.",
      "empresa_cuenta_effi_destino": "190",
      "nombre_empresa_cuenta_effi_destino": "Logística del Norte S.A.S.",
      "cuenta_effi_destino": "1",
      "t_dni_titular_destino": "1",
      "abreviacion_titular_destino": "NIT",
      "id_titular_destino": "800987654",
      "titular_destino": "Logística del Norte S.A.S.",
      "empresa_responsable_destino": "170",
      "nombre_empresa_responsable_destino": "EFFICOMMERCE S.A.S.",
      "divisa_origen": "COP",
      "simbolo_moneda_origen": "$",
      "valor_origen": "500000.00",
      "divisa_destino": "COP",
      "simbolo_moneda_destino": "$",
      "valor_destino": "500000.00",
      "trm_calculada": null,
      "responsable_crear": "usuario@empresa.com",
      "nombre_responsable": "Nombre Apellido",
      "fecha_anular": "2026-10-02 08:00:00",
      "observacion_anular": "Transferencia duplicada",
      "responsable_anular": "usuario@empresa.com",
      "nombre_responsable_anular": "Nombre Apellido",
      "vigente": "0"
    }
  ],
  "paginacion": {
    "pagina": 1,
    "por_pagina": 100,
    "total": 19,
    "total_paginas": 1
  }
}
```

---

## <a id="orden_v"></a>GET `api/orden_v` — Consultar órdenes de venta

Devuelve las órdenes de venta de la empresa asociada a la API key con las mismas columnas de la tabla de consulta del web: id, prefijo e identificador visible (id_transaccion), fechas de creación y de entrega, sucursal, centro de costos, bodega, ubicación de venta, integración ecommerce, cliente (con su tipo y número de identificación, teléfono, país, departamento, ciudad y dirección), vendedor, tercero (con sus datos de identificación y marcas de contacto/cliente/proveedor/empleado/socio), valores (bruto, descuento, subtotal, impuestos, retenciones, propina y total), estado de la orden, remisión y factura generadas a partir de la orden (con su total), ruta logística del cliente, responsable, observación, garantía, datos de la venta ecommerce y vigencia; cada id de otra tabla va seguido de su nombre. La clave de una orden es empresa + sucursal + id: el id se repite entre sucursales, así que para identificar una orden combine siempre sucursal e id. Igual que en el web, solo se listan las órdenes de las sucursales autorizadas al usuario de la API key, de clientes cuya ruta logística tenga autorizada y, si el usuario tiene activada la marca "restringir clientes", solo las de sus clientes asignados. Igual que en el web, si la petición no trae ningún parámetro en la URL el modelo acota la consulta a las órdenes creadas en el mes actual: se recomienda enviar siempre desde y hasta. Los filtros son los mismos del bloque de búsqueda del módulo Órdenes de venta del web (se llaman igual que las columnas): sucursal, bodega, centro_costos, ubicacion_venta, id, sucursal_ruta_logistica, ruta_logistica, pais, provincia, ciudad, desde, hasta, cliente, est_orden_v, est_facturacion, total_desde, total_hasta, articulo, marca, categoria, vendedor, tercero, responsable, entrega_desde, entrega_hasta, garantia, ecommerce, id_ecommerce, id_venta_ecommerce, name_venta_ecommerce, transaction_status y vigente; además permite paginar. Si no se envía vigente se listan vigentes y anuladas (como el web con "Seleccionar..."); vigente=1 lista solo las vigentes y vigente=0 solo las anuladas. Requiere permiso de consulta sobre la función: Órdenes de venta.

Ejemplo: `GET api/orden_v?desde=2026-01-01&hasta=2026-12-31&pagina=1&por_pagina=100`

### Parámetros

| Nombre | Tipo | Req. | Descripción |
|---|---|---|---|
| `sucursal` | integer |  | Filtrar por el id de la sucursal (ver api/sucursal). Solo se listan las sucursales autorizadas al usuario de la API key. En el web es una lista desplegable dinámica. |
| `bodega` | integer |  | Filtrar por el id de la bodega (ver api/bodega). En el web es una lista desplegable dinámica que depende de la sucursal. |
| `centro_costos` | integer |  | Filtrar por el id del centro de costos (ver api/centro_costos). En el web es una lista desplegable dinámica. |
| `ubicacion_venta` | integer |  | Filtrar por el id de la ubicación de venta (ver api/ubicacion_venta). En el web es una lista desplegable dinámica que depende de la sucursal. |
| `id` | integer |  | Filtrar por el id de una orden específica. El id se repite entre sucursales (la clave es empresa + sucursal + id): combínelo con sucursal. |
| `sucursal_ruta_logistica` | integer |  | Sucursal de la ruta logística del cliente por la que se filtra (ver api/ruta_logistica). Se envía junto con ruta_logistica: el filtro solo aplica cuando llegan los dos parámetros. En el web los dos valores salen de una sola lista desplegable dinámica. |
| `ruta_logistica` | integer |  | Id de la ruta logística del cliente en la sucursal indicada en sucursal_ruta_logistica (ver api/ruta_logistica; la clave de una ruta es sucursal + id). Solo filtra cuando se envían los dos parámetros. En el web es una lista desplegable dinámica. |
| `pais` | integer |  | Filtrar por el id del país del cliente (columna pais_cliente; ver api/pais). |
| `provincia` | integer |  | Filtrar por el id del departamento/provincia del cliente (columna provincia_cliente; ver api/provincia). |
| `ciudad` | integer |  | Filtrar por el id de la ciudad del cliente (columna ciudad_cliente; ver api/ciudad). |
| `desde` | date |  | Fecha de creación (fecha_trans) mayor o igual a la indicada. Formato YYYY-MM-DD o YYYY-MM-DD HH:MM:SS, interpretada en la zona horaria de la empresa. Si la petición no trae ningún parámetro, el modelo acota al mes actual (igual que el web). |
| `hasta` | date |  | Fecha de creación (fecha_trans) menor o igual a la indicada. Formato YYYY-MM-DD o YYYY-MM-DD HH:MM:SS, interpretada en la zona horaria de la empresa. |
| `cliente` | integer |  | Filtrar por el id del tercero cliente (columna cliente). En el web se elige con el buscador de clientes. |
| `est_orden_v` | integer |  | Filtrar por el id del estado de la orden de venta (catálogo propio de la empresa; ver api/est_orden_v). En el web es una lista desplegable dinámica. |
| `est_facturacion` | integer |  | Filtrar por el estado de facturación de la orden según las transacciones generadas a partir de ella: 1 sin remisión ni factura; 2 con remisión de venta; 3 con factura de venta. Es solo un filtro: no se devuelve como campo (ver id_remision_v e id_factura_v). Valores: `1` Pendiente, `2` Remisionada, `3` Facturada |
| `total_desde` | decimal |  | Total mayor o igual al indicado (rango numérico; combinar con total_hasta). |
| `total_hasta` | decimal |  | Total menor o igual al indicado (rango numérico; combinar con total_desde). |
| `articulo` | integer |  | Filtrar por el id de un artículo incluido en los conceptos de la orden (ver api/articulo). Es solo un filtro: no se devuelve como campo. |
| `marca` | integer |  | Filtrar por el id de la marca de algún artículo incluido en los conceptos de la orden (ver api/marca_articulo). Es solo un filtro: no se devuelve como campo. En el web es una lista desplegable dinámica. |
| `categoria` | integer |  | Filtrar por el id de la categoría de algún artículo incluido en los conceptos de la orden (ver api/categoria_articulo). Es solo un filtro: no se devuelve como campo. En el web es una lista desplegable dinámica. |
| `vendedor` | integer |  | Filtrar por el id del tercero vendedor (columna vendedor). En el web es una lista desplegable dinámica. |
| `tercero` | integer |  | Filtrar por el id del tercero asociado (columna tercero). En el web se elige con el buscador de terceros. |
| `responsable` | string |  | Filtrar por el usuario (correo) que creó la orden. En el web es una lista desplegable dinámica de los usuarios de la empresa. |
| `entrega_desde` | date |  | Fecha de entrega (fecha_entrega) mayor o igual a la indicada. Formato YYYY-MM-DD. |
| `entrega_hasta` | date |  | Fecha de entrega (fecha_entrega) menor o igual a la indicada. Formato YYYY-MM-DD. |
| `garantia` | string |  | Filtrar por una palabra clave contenida en el texto de garantía (coincidencia parcial, sin distinguir mayúsculas). |
| `ecommerce` | integer |  | Filtrar por origen ecommerce: 1 solo órdenes provenientes de una integración ecommerce; 0 solo órdenes sin integración ecommerce. Valores: `1` Si, `0` No |
| `id_ecommerce` | integer |  | Filtrar por el id de la integración ecommerce de la que proviene la orden (columna ecommerce; ver api/ecommerce). En el web es una lista desplegable dinámica. |
| `id_venta_ecommerce` | string |  | Filtrar por el id de la venta en la plataforma ecommerce (coincidencia exacta). |
| `name_venta_ecommerce` | string |  | Filtrar por el nombre/número de la venta en la plataforma ecommerce (coincidencia por terminación: el valor enviado debe ser el final del nombre, ej. 1014 encuentra #1014). |
| `transaction_status` | string |  | Filtrar por el estado del pago en la plataforma ecommerce (coincidencia exacta: success, pending, failure, error). |
| `vigente` | integer |  | Si no se envía se listan vigentes y anuladas (como el web con "Seleccionar..."). Enviar vigente=1 para listar solo las vigentes o vigente=0 para listar solo las anuladas. Valores: `1` Vigente, `0` Anulada |
| `pagina` | integer |  | Número de página. Por defecto 1. |
| `por_pagina` | integer |  | Registros por página. Por defecto 100, máximo 100. |

### Campos de respuesta

| Campo | Descripción |
|---|---|
| `id` | Identificador de la orden de venta. Se repite entre sucursales: la clave única es empresa + sucursal + id. |
| `prefijo` | Prefijo de la transacción en la sucursal. |
| `id_transaccion` | Identificador visible prefijo-id, como en el ERP. |
| `fecha_trans` | Fecha y hora de creación de la orden, en UTC tal como está almacenada en la base de datos. |
| `fecha_entrega` | Fecha de entrega acordada (YYYY-MM-DD). |
| `sucursal` | Id de la sucursal que emitió la orden. |
| `nombre_sucursal` | Nombre de la sucursal (texto de sucursal). |
| `centro_costos` | Id del centro de costos. |
| `nombre_centro_costos` | Nombre del centro de costos (texto de centro_costos). |
| `bodega` | Id de la bodega. |
| `nombre_bodega` | Nombre de la bodega (texto de bodega). |
| `ubicacion_venta` | Id de la ubicación de venta (null si no aplica). |
| `nombre_ubicacion_venta` | Nombre de la ubicación de venta (texto de ubicacion_venta). |
| `ecommerce` | Id de la integración ecommerce de la que proviene la orden (null si no es venta ecommerce; ver api/ecommerce). |
| `nombre_ecommerce` | Nombre de la integración ecommerce (texto de ecommerce). |
| `cliente` | Id del tercero cliente. |
| `nombre_cliente` | Nombre del cliente (texto de cliente). |
| `dni_cliente` | Id del tipo de documento de identidad del cliente (t_dni). |
| `abreviacion` | Abreviatura del tipo de documento del cliente (texto de dni_cliente), ej. NIT, CC. |
| `id_cliente` | Número de identificación del cliente. |
| `telefono_cliente` | Teléfono del cliente. |
| `pais_cliente` | Id del país del cliente. |
| `nombre_pais` | Nombre del país (texto de pais_cliente). |
| `provincia_cliente` | Id del departamento/provincia del cliente. |
| `nombre_provincia` | Nombre del departamento/provincia (texto de provincia_cliente). |
| `ciudad_cliente` | Id de la ciudad del cliente. |
| `nombre_ciudad` | Nombre de la ciudad (texto de ciudad_cliente). |
| `direccion_cliente` | Dirección del cliente. |
| `vendedor` | Id del tercero vendedor (null si no tiene). |
| `nombre_vendedor` | Nombre del vendedor (texto de vendedor). |
| `tercero` | Id del tercero asociado a la orden (null si no tiene). |
| `nombre_tercero` | Nombre del tercero (texto de tercero). |
| `nombre_comercial_tercero` | Nombre comercial del tercero (texto de tercero; null si no tiene). |
| `id_tercero` | Número de identificación del tercero (null si no tiene). |
| `contacto_tercero` | 1 si el tercero es contacto; 0 si no (null si no tiene tercero). |
| `cliente_tercero` | 1 si el tercero es cliente; 0 si no (null si no tiene tercero). |
| `proveedor_tercero` | 1 si el tercero es proveedor; 0 si no (null si no tiene tercero). |
| `empleado_tercero` | 1 si el tercero es empleado; 0 si no (null si no tiene tercero). |
| `socio_tercero` | 1 si el tercero es socio; 0 si no (null si no tiene tercero). |
| `bruto` | Valor bruto de la orden de venta (suma de los conceptos antes de descuentos e impuestos). |
| `descuento` | Valor del descuento de la orden de venta. |
| `subtotal` | Valor subtotal de la orden de venta (bruto menos descuento). |
| `impuestos` | Valor de los impuestos de la orden de venta. |
| `retefuente` | Valor de las retenciones de la orden de venta. |
| `propina` | Valor de la propina de la orden de venta. |
| `total` | Valor total de la orden de venta. |
| `est_orden_v` | Id del estado de la orden de venta (catálogo propio de la empresa; ver api/est_orden_v). |
| `estado` | Nombre del estado de la orden (texto de est_orden_v). |
| `sucursal_remision_v` | Sucursal de la remisión de venta generada a partir de la orden (null si no se ha remisionado). |
| `prefijo_remision_v` | Prefijo de la remisión de venta generada (null si no se ha remisionado). |
| `id_remision_v` | Id de la remisión de venta generada a partir de la orden (null si no se ha remisionado). |
| `total_remision_ref` | Valor total de la remisión de venta generada (null si no se ha remisionado). |
| `sucursal_factura_v` | Sucursal de la factura de venta generada a partir de la orden (null si no se ha facturado). |
| `prefijo_factura_v` | Prefijo de la factura de venta generada (null si no se ha facturado). |
| `id_factura_v` | Id de la factura de venta generada a partir de la orden (null si no se ha facturado). |
| `total_factura_ref` | Valor total de la factura de venta generada (null si no se ha facturado). |
| `sucursal_ruta_logistica` | Sucursal de la ruta logística del cliente (null si no tiene). |
| `ruta_logistica` | Id de la ruta logística del cliente (null si no tiene). |
| `nombre_ruta_logistica` | Nombre de la ruta logística (texto de ruta_logistica). |
| `responsable` | Usuario (correo) que creó la orden. |
| `nombre_responsable` | Nombres y apellidos del usuario que creó la orden (texto de responsable). |
| `observacion` | Observación de la orden. |
| `garantia` | Texto de garantía de la orden. |
| `id_venta_ecommerce` | Id de la venta en la plataforma ecommerce (null si no aplica). |
| `name_venta_ecommerce` | Nombre/número de la venta en la plataforma ecommerce (null si no aplica). |
| `transaction_status` | Estado del pago en la plataforma ecommerce: success, pending, failure, error (null si no aplica). |
| `vigente` | 1 si la orden está vigente; 0 si está anulada. |

### Ejemplo de respuesta

```json
{
  "ok": true,
  "data": [
    {
      "id": "210",
      "prefijo": "PPAL",
      "id_transaccion": "PPAL-210",
      "fecha_trans": "2026-09-08 02:17:57",
      "fecha_entrega": "2026-09-07",
      "sucursal": "1",
      "nombre_sucursal": "Principal",
      "centro_costos": "4",
      "nombre_centro_costos": "Centro de costos ejemplo",
      "bodega": "1",
      "nombre_bodega": "Principal",
      "ubicacion_venta": "1",
      "nombre_ubicacion_venta": "Ubicación de venta ejemplo",
      "ecommerce": null,
      "nombre_ecommerce": null,
      "cliente": "1519",
      "nombre_cliente": "Comercializadora Andina S.A.S.",
      "dni_cliente": "1",
      "abreviacion": "NIT",
      "id_cliente": "900123456",
      "telefono_cliente": "3001234567",
      "pais_cliente": "47",
      "nombre_pais": "Colombia",
      "provincia_cliente": "776",
      "nombre_provincia": "Antioquia",
      "ciudad_cliente": "12601",
      "nombre_ciudad": "Medellín",
      "direccion_cliente": "Calle 10 # 20-30",
      "vendedor": "268",
      "nombre_vendedor": "Carlos Gómez",
      "tercero": null,
      "nombre_tercero": null,
      "nombre_comercial_tercero": null,
      "id_tercero": null,
      "contacto_tercero": null,
      "cliente_tercero": null,
      "proveedor_tercero": null,
      "empleado_tercero": null,
      "socio_tercero": null,
      "bruto": "1200.0000",
      "descuento": "1200.0000",
      "subtotal": "0.0000",
      "impuestos": "0.0000",
      "retefuente": "0.0000",
      "propina": "0.0000",
      "total": "0.0000",
      "est_orden_v": "1",
      "estado": "Generada",
      "sucursal_remision_v": null,
      "prefijo_remision_v": null,
      "id_remision_v": null,
      "total_remision_ref": null,
      "sucursal_factura_v": null,
      "prefijo_factura_v": null,
      "id_factura_v": null,
      "total_factura_ref": null,
      "sucursal_ruta_logistica": null,
      "ruta_logistica": null,
      "nombre_ruta_logistica": null,
      "responsable": "usuario@empresa.com",
      "nombre_responsable": "Laura Martínez",
      "observacion": "",
      "garantia": "",
      "id_venta_ecommerce": null,
      "name_venta_ecommerce": null,
      "transaction_status": null,
      "vigente": "1"
    },
    {
      "id": "209",
      "prefijo": "PPAL",
      "id_transaccion": "PPAL-209",
      "fecha_trans": "2026-08-30 14:53:41",
      "fecha_entrega": "2026-08-30",
      "sucursal": "1",
      "nombre_sucursal": "Principal",
      "centro_costos": "4",
      "nombre_centro_costos": "Centro de costos ejemplo",
      "bodega": "1",
      "nombre_bodega": "Principal",
      "ubicacion_venta": "1",
      "nombre_ubicacion_venta": "Ubicación de venta ejemplo",
      "ecommerce": null,
      "nombre_ecommerce": null,
      "cliente": "1519",
      "nombre_cliente": "Distribuidora del Norte Ltda.",
      "dni_cliente": "1",
      "abreviacion": "NIT",
      "id_cliente": "900654321",
      "telefono_cliente": "3109876543",
      "pais_cliente": "47",
      "nombre_pais": "Colombia",
      "provincia_cliente": "776",
      "nombre_provincia": "Antioquia",
      "ciudad_cliente": "12601",
      "nombre_ciudad": "Medellín",
      "direccion_cliente": "Carrera 45 # 12-34",
      "vendedor": "268",
      "nombre_vendedor": "Carlos Gómez",
      "tercero": null,
      "nombre_tercero": null,
      "nombre_comercial_tercero": null,
      "id_tercero": null,
      "contacto_tercero": null,
      "cliente_tercero": null,
      "proveedor_tercero": null,
      "empleado_tercero": null,
      "socio_tercero": null,
      "bruto": "200000.0000",
      "descuento": "0.0000",
      "subtotal": "200000.0000",
      "impuestos": "38000.0000",
      "retefuente": "0.0000",
      "propina": "0.0000",
      "total": "238000.0000",
      "est_orden_v": "1",
      "estado": "Generada",
      "sucursal_remision_v": "1",
      "prefijo_remision_v": "PPAL",
      "id_remision_v": "267",
      "total_remision_ref": "238000.0000",
      "sucursal_factura_v": null,
      "prefijo_factura_v": null,
      "id_factura_v": null,
      "total_factura_ref": null,
      "sucursal_ruta_logistica": null,
      "ruta_logistica": null,
      "nombre_ruta_logistica": null,
      "responsable": "usuario@empresa.com",
      "nombre_responsable": "Laura Martínez",
      "observacion": "",
      "garantia": "",
      "id_venta_ecommerce": null,
      "name_venta_ecommerce": null,
      "transaction_status": null,
      "vigente": "0"
    }
  ],
  "paginacion": {
    "pagina": 1,
    "por_pagina": 100,
    "total": 45,
    "total_paginas": 1
  }
}
```

---

## <a id="remision_v"></a>GET `api/remision_v` — Consultar remisiones de venta

Devuelve las remisiones de venta de la empresa asociada a la API key con las mismas columnas de la tabla de consulta del web: id, prefijo e identificador visible (id_transaccion), fechas de creación y de entrega, sucursal, centro de costos, bodega, ubicación de venta, convenio dropshipping, integración ecommerce, cliente (con su tipo y número de identificación, teléfono, país, departamento, ciudad y dirección), vendedor, tercero (con sus datos de identificación y marcas de contacto/cliente/proveedor/empleado/socio), valores (bruto, descuento, subtotal, impuestos, retenciones, propina, total, saldo pendiente de cobro y devolución), estado de facturación y factura generada, estado de la cuenta por cobrar, forma de pago, días y valor de mora, tipo de cliente, ruta logística, estado contable, responsable, observación, garantía, impresión, guía de transporte, relación de despacho, marcas de Datacrédito, datos de dropshipping, datos de la venta ecommerce y vigencia; cada id de otra tabla va seguido de su nombre. La clave de una remisión es empresa + sucursal + id: el id se repite entre sucursales, así que para identificar una remisión combine siempre sucursal e id. Igual que en el web, solo se listan las remisiones de las sucursales autorizadas al usuario de la API key, de clientes cuya ruta logística tenga autorizada y, si el usuario tiene activada la marca "restringir clientes", solo las de sus clientes asignados. Los filtros son los mismos del bloque de búsqueda del módulo Remisiones de venta del web (se llaman igual que las columnas): sucursal, centro_costos, bodega, ubicacion_venta, id, desde, hasta, cliente, sucursal_ruta_logistica, ruta_logistica, t_cliente, pais, provincia, ciudad, t_forma_pago, t_medio_pago, est_c_x_c, est_remision_v, est_contable, total_desde, total_hasta, articulo, marca, categoria, vendedor, tercero, responsable, entrega_desde, entrega_hasta, garantia, impresion, guia_transporte, relacion_despacho, datacredito, datacredito_negativo, devolucion, dropshipping_proveedor, dropshipping_distribuidor, convenio_dropshipping, est_transaccion_dropshipping, ecommerce, id_ecommerce, id_venta_ecommerce, name_venta_ecommerce, transaction_status y vigente; además permite paginar. Si no se envía vigente se listan vigentes y anuladas (como el web con "Seleccionar..."); vigente=1 lista solo las vigentes y vigente=0 solo las anuladas. Resumen agregado (agrupar_por): enviando agrupar_por=<dimensión> el servicio NO devuelve el listado paginado sino las filas agregadas de un GROUP BY sobre las mismas remisiones filtradas (misma empresa, sucursales autorizadas y filtros de cabecera), sin tope de días: data = [{clave, nombre, cantidad, total, subtotal, impuestos, descuento, devolucion, total_neto, costo, pdte_cobro}] ordenadas por total descendente (dia/mes/anio en orden cronológico) y resumen = {agrupar_por, limite, grupos, totales}. Dimensiones: vendedor, cliente, sucursal, centro_costos, forma_pago, pais, provincia, ciudad, divisa, dia, mes, anio, articulo y t_origen (origen propio de la remisión según la tabla t_origen_remision_v: nueva, desde cotización, desde orden de venta, devolución o liquidación de alquiler, dropshipping; no es el canal por el que se creó la transacción: Web, API, Effi AI...). En el resumen solo se suman las remisiones vigentes salvo que se envíe vigente, y aplican únicamente los filtros sucursal, centro_costos, bodega, ubicacion_venta, desde, hasta, cliente, sucursal_ruta_logistica + ruta_logistica, t_cliente, pais, provincia, ciudad, est_c_x_c, est_remision_v, vendedor, tercero, responsable, ecommerce, id_ecommerce y vigente (los demás se ignoran). Es la vía recomendada para rankings y totales por periodo (p. ej. ventas por vendedor del año, sumando con el resumen de api/factura_v) en lugar de recorrer páginas. Requiere permiso de consulta sobre la función: Notas de remisión de venta.

Ejemplo: `GET api/remision_v?desde=2026-01-01&hasta=2026-12-31&pagina=1&por_pagina=100`

### Parámetros

| Nombre | Tipo | Req. | Descripción |
|---|---|---|---|
| `agrupar_por` | string |  | Dimensión del resumen agregado. Si se envía, la respuesta cambia: data trae una fila por grupo {clave (id de la dimensión; YYYY-MM-DD, YYYY-MM o YYYY en dia/mes/anio), nombre (texto de la dimensión), cantidad (remisiones), total, subtotal, impuestos, descuento, devolucion, total_neto (total menos devolucion), costo, pdte_cobro} y resumen trae {agrupar_por, limite, grupos, totales}; no hay paginación y no aplica el tope de días. forma_pago (1:N) solo devuelve cantidad y total (valor asignado a esa forma de pago); articulo devuelve cantidad (remisiones), unidades y total (valor neto sin impuestos de los conceptos del artículo). t_origen agrupa por el origen propio de la remisión (clave = id de la tabla t_origen_remision_v, nombre = su texto; p. ej. cuántas remisiones se crearon desde órdenes de venta = clave 3); no es el canal por el que se creó la transacción (Web, API, Effi AI...), que este recurso no expone. Combínelo con desde y hasta para acotar el periodo. Un valor fuera de la lista responde 400 con las dimensiones válidas. Valores: `vendedor` Vendedor, `cliente` Cliente, `sucursal` Sucursal, `centro_costos` Centro de costos, `forma_pago` Forma de pago, `pais` País del cliente, `provincia` Departamento del cliente, `ciudad` Ciudad del cliente, `divisa` Divisa, `dia` Día (YYYY-MM-DD), `mes` Mes (YYYY-MM), `anio` Año (YYYY), `articulo` Artículo (conceptos), `t_origen` Origen de la remisión (t_origen_remision_v: 1 Nueva remisión, 2 Cotización, 3 Orden de venta, 5 Devolución de alquiler, 6 Liquidación parcial de alquiler, 7 Venta de Dropshipping de distribuidor) |
| `limite` | integer |  | Solo con agrupar_por: máximo de grupos (filas) del resumen, ordenados por total descendente. Por defecto 500, máximo 1000. |
| `sucursal` | integer |  | Filtrar por el id de la sucursal (ver api/sucursal). Solo se listan las sucursales autorizadas al usuario de la API key. En el web es una lista desplegable dinámica. |
| `centro_costos` | integer |  | Filtrar por el id del centro de costos (ver api/centro_costos). En el web es una lista desplegable dinámica. |
| `bodega` | integer |  | Filtrar por el id de la bodega (ver api/bodega). En el web es una lista desplegable dinámica que depende de la sucursal. |
| `ubicacion_venta` | integer |  | Filtrar por el id de la ubicación de venta (ver api/ubicacion_venta). En el web es una lista desplegable dinámica que depende de la sucursal. |
| `id` | integer |  | Filtrar por el id de una remisión específica. El id se repite entre sucursales (la clave es empresa + sucursal + id): combínelo con sucursal. |
| `desde` | date |  | Fecha de creación (fecha_trans) mayor o igual a la indicada. Formato YYYY-MM-DD o YYYY-MM-DD HH:MM:SS, interpretada en la zona horaria de la empresa. |
| `hasta` | date |  | Fecha de creación (fecha_trans) menor o igual a la indicada. Formato YYYY-MM-DD o YYYY-MM-DD HH:MM:SS, interpretada en la zona horaria de la empresa. |
| `cliente` | integer |  | Filtrar por el id del tercero cliente (columna cliente). En el web se elige con el buscador de clientes. |
| `sucursal_ruta_logistica` | integer |  | Sucursal de la ruta logística del cliente por la que se filtra (ver api/ruta_logistica). Se envía junto con ruta_logistica: el filtro solo aplica cuando llegan los dos parámetros. En el web los dos valores salen de una sola lista desplegable dinámica. |
| `ruta_logistica` | integer |  | Id de la ruta logística del cliente en la sucursal indicada en sucursal_ruta_logistica (ver api/ruta_logistica; la clave de una ruta es sucursal + id). Solo filtra cuando se envían los dos parámetros. En el web es una lista desplegable dinámica. |
| `t_cliente` | integer |  | Filtrar por el id del tipo de cliente del cliente de la remisión (se evalúa sobre la ficha del cliente). En el web es una lista desplegable dinámica. |
| `pais` | integer |  | Filtrar por el id del país del cliente (columna pais_cliente; ver api/pais). |
| `provincia` | integer |  | Filtrar por el id del departamento/provincia del cliente (columna provincia_cliente; ver api/provincia). |
| `ciudad` | integer |  | Filtrar por el id de la ciudad del cliente (columna ciudad_cliente; ver api/ciudad). |
| `t_forma_pago` | string |  | Filtrar por el id de la forma de pago (ver api/forma_pago). Admite varios ids separados por coma (ej. 1,2): se listan las remisiones que cumplan al menos una. En el web es una lista desplegable dinámica de selección múltiple. |
| `t_medio_pago` | string |  | Filtrar por el id del medio de pago usado en la remisión (ver api/medio_pago). Admite varios ids separados por coma (ej. 1,3): se listan las remisiones que cumplan al menos una. Es solo un filtro: no se devuelve como campo. En el web es una lista desplegable dinámica de selección múltiple. |
| `est_c_x_c` | integer |  | Filtrar por el estado de la cuenta por cobrar. Enviar 0 para listar las que tienen saldo pendiente de cobro (pdte_cobro mayor a 0); otro valor filtra por el id del estado (1 = Pago total, 2 = Pendiente de cobro al día, 3 = Pendiente de cobro en mora, 4 = Pendiente de cobro dudoso recaudo). Valores: `0` Pendiente de cobro, `1` Pago total, `2` Pendiente de cobro al día, `3` Pendiente de cobro en mora, `4` Pendiente de cobro dudoso recaudo |
| `est_remision_v` | integer |  | Filtrar por el id del estado de facturación de la remisión. En el web es una lista desplegable dinámica (1 = Pendiente de facturar, 2 = Facturada). |
| `est_contable` | integer |  | Filtrar por el id del estado contable de la remisión. En el web es una lista desplegable dinámica (1 = Sin comprobante contable, 2 = Comprobante contable en proceso, 3 = Comprobante contable exitoso, 4 = Comprobante contable fracasado, 5 = Comprobante contable anulado). |
| `total_desde` | decimal |  | Total mayor o igual al indicado (rango numérico; combinar con total_hasta). |
| `total_hasta` | decimal |  | Total menor o igual al indicado (rango numérico; combinar con total_desde). |
| `articulo` | integer |  | Filtrar por el id de un artículo incluido en los conceptos de la remisión (ver api/articulo). Es solo un filtro: no se devuelve como campo. |
| `marca` | integer |  | Filtrar por el id de la marca de algún artículo incluido en los conceptos de la remisión (ver api/marca_articulo). Es solo un filtro: no se devuelve como campo. En el web es una lista desplegable dinámica. |
| `categoria` | integer |  | Filtrar por el id de la categoría de algún artículo incluido en los conceptos de la remisión (ver api/categoria_articulo). Es solo un filtro: no se devuelve como campo. En el web es una lista desplegable dinámica. |
| `vendedor` | integer |  | Filtrar por el id del tercero vendedor (columna vendedor). En el web es una lista desplegable dinámica. |
| `tercero` | integer |  | Filtrar por el id del tercero asociado (columna tercero). En el web se elige con el buscador de terceros. |
| `responsable` | string |  | Filtrar por el usuario (correo) que creó la remisión. En el web es una lista desplegable dinámica de los usuarios de la empresa. |
| `entrega_desde` | date |  | Fecha de entrega (fecha_entrega) mayor o igual a la indicada. Formato YYYY-MM-DD. |
| `entrega_hasta` | date |  | Fecha de entrega (fecha_entrega) menor o igual a la indicada. Formato YYYY-MM-DD. |
| `garantia` | string |  | Filtrar por una palabra clave contenida en el texto de garantía (coincidencia parcial, sin distinguir mayúsculas). |
| `impresion` | integer |  | Filtrar por la marca de impresión: 1 solo remisiones ya impresas; 0 solo remisiones sin imprimir. Valores: `1` Si, `0` No |
| `guia_transporte` | integer |  | Filtrar por guía de transporte asociada: 1 solo remisiones con guía de transporte; 0 solo remisiones sin guía. Valores: `1` Si, `0` No |
| `relacion_despacho` | integer |  | Filtrar por relación de despacho asociada: 1 solo remisiones incluidas en una relación de despacho; 0 solo remisiones sin relación de despacho. Valores: `1` Si, `0` No |
| `datacredito` | integer |  | Filtrar por la marca de reporte a Datacrédito: 1 activado; 0 desactivado. Valores: `1` Activado, `0` Desactivado |
| `datacredito_negativo` | integer |  | Filtrar por la marca de reporte negativo a Datacrédito: 1 activado; 0 desactivado. Valores: `1` Activado, `0` Desactivado |
| `devolucion` | integer |  | Filtrar por el estado de devolución de la remisión comparando el valor devuelto (devolucion) con el total: 1 sin devolución; 2 sin devolución o devolución parcial; 3 con devolución parcial o total; 4 devolución parcial; 5 devolución total. Valores: `1` Sin devolución, `2` Sin devolución o devolución parcial, `3` Con devolución parcial o total, `4` Devolución parcial, `5` Devolución total |
| `dropshipping_proveedor` | integer |  | Filtrar por participación dropshipping como proveedor: 1 solo remisiones cuya transacción dropshipping tiene a la empresa como proveedora; 0 solo las que no. En el web este bloque solo aparece si la empresa tiene convenios dropshipping. Valores: `1` Si, `0` No |
| `dropshipping_distribuidor` | integer |  | Filtrar por participación dropshipping como distribuidor: 1 solo remisiones cuya transacción dropshipping tiene a la empresa como distribuidora; 0 solo las que no. En el web este bloque solo aparece si la empresa tiene convenios dropshipping. Valores: `1` Si, `0` No |
| `convenio_dropshipping` | string |  | Filtrar por el código del convenio dropshipping de la transacción dropshipping asociada. En el web es una lista desplegable dinámica. |
| `est_transaccion_dropshipping` | integer |  | Filtrar por el id del estado de la transacción dropshipping asociada. En el web es una lista desplegable dinámica (1 = Pendiente de aprobación, 2 = Aprobada, 3 = Rechazada). |
| `ecommerce` | integer |  | Filtrar por origen ecommerce: 1 solo remisiones provenientes de una integración ecommerce; 0 solo remisiones sin integración ecommerce. Valores: `1` Si, `0` No |
| `id_ecommerce` | integer |  | Filtrar por el id de la integración ecommerce de la que proviene la remisión (columna ecommerce; ver api/ecommerce). En el web es una lista desplegable dinámica. |
| `id_venta_ecommerce` | string |  | Filtrar por el id de la venta en la plataforma ecommerce (coincidencia exacta). |
| `name_venta_ecommerce` | string |  | Filtrar por el nombre/número de la venta en la plataforma ecommerce (coincidencia por terminación: el valor enviado debe ser el final del nombre, ej. 1014 encuentra #1014). |
| `transaction_status` | string |  | Filtrar por el estado del pago en la plataforma ecommerce (coincidencia exacta: success, pending, failure, error). |
| `vigente` | integer |  | Si no se envía se listan vigentes y anuladas (como el web con "Seleccionar..."). Enviar vigente=1 para listar solo las vigentes o vigente=0 para listar solo las anuladas. Valores: `1` Vigente, `0` Anulada |
| `pagina` | integer |  | Número de página. Por defecto 1. |
| `por_pagina` | integer |  | Registros por página. Por defecto 100, máximo 100. |

### Campos de respuesta

| Campo | Descripción |
|---|---|
| `id` | Identificador de la remisión de venta. Se repite entre sucursales: la clave única es empresa + sucursal + id. |
| `prefijo` | Prefijo de la transacción en la sucursal. |
| `id_transaccion` | Identificador visible prefijo-id, como en el ERP. |
| `fecha_trans` | Fecha y hora de creación de la remisión, en UTC tal como está almacenada en la base de datos. |
| `fecha_entrega` | Fecha de entrega (YYYY-MM-DD). |
| `sucursal` | Id de la sucursal que emitió la remisión. |
| `nombre_sucursal` | Nombre de la sucursal (texto de sucursal). |
| `centro_costos` | Id del centro de costos. |
| `nombre_centro_costos` | Nombre del centro de costos (texto de centro_costos). |
| `bodega` | Id de la bodega. |
| `nombre_bodega` | Nombre de la bodega (texto de bodega). |
| `ubicacion_venta` | Id de la ubicación de venta (null si no aplica). |
| `nombre_ubicacion_venta` | Nombre de la ubicación de venta (texto de ubicacion_venta). |
| `convenio_dropshipping` | Código del convenio dropshipping (null si no aplica). |
| `nombre_convenio_dropshipping` | Nombre del convenio dropshipping (texto de convenio_dropshipping). |
| `ecommerce` | Id de la integración ecommerce de la que proviene la remisión (null si no es venta ecommerce; ver api/ecommerce). |
| `nombre_ecommerce` | Nombre de la integración ecommerce (texto de ecommerce). |
| `cliente` | Id del tercero cliente. |
| `nombre_cliente` | Nombre del cliente (texto de cliente). |
| `dni_cliente` | Id del tipo de documento de identidad del cliente (t_dni). |
| `abreviacion` | Abreviatura del tipo de documento del cliente (texto de dni_cliente), ej. NIT, CC. |
| `id_cliente` | Número de identificación del cliente. |
| `telefono_cliente` | Teléfono del cliente. |
| `pais_cliente` | Id del país del cliente. |
| `nombre_pais` | Nombre del país (texto de pais_cliente). |
| `provincia_cliente` | Id del departamento/provincia del cliente. |
| `nombre_provincia` | Nombre del departamento/provincia (texto de provincia_cliente). |
| `ciudad_cliente` | Id de la ciudad del cliente. |
| `nombre_ciudad` | Nombre de la ciudad (texto de ciudad_cliente). |
| `direccion_cliente` | Dirección del cliente. |
| `vendedor` | Id del tercero vendedor (null si no tiene). |
| `nombre_vendedor` | Nombre del vendedor (texto de vendedor). |
| `tercero` | Id del tercero asociado a la remisión (null si no tiene). |
| `nombre_tercero` | Nombre del tercero (texto de tercero). |
| `nombre_comercial_tercero` | Nombre comercial del tercero (texto de tercero; null si no tiene). |
| `id_tercero` | Número de identificación del tercero (null si no tiene). |
| `contacto_tercero` | 1 si el tercero es contacto; 0 si no (null si no tiene tercero). |
| `cliente_tercero` | 1 si el tercero es cliente; 0 si no (null si no tiene tercero). |
| `proveedor_tercero` | 1 si el tercero es proveedor; 0 si no (null si no tiene tercero). |
| `empleado_tercero` | 1 si el tercero es empleado; 0 si no (null si no tiene tercero). |
| `socio_tercero` | 1 si el tercero es socio; 0 si no (null si no tiene tercero). |
| `bruto` | Valor bruto de la remisión de venta (suma de los conceptos antes de descuentos e impuestos). |
| `descuento` | Valor del descuento de la remisión de venta. |
| `subtotal` | Valor subtotal de la remisión de venta (bruto menos descuento). |
| `impuestos` | Valor de los impuestos de la remisión de venta. |
| `retefuente` | Valor de las retenciones de la remisión de venta. |
| `propina` | Valor de la propina de la remisión de venta. |
| `total` | Valor total de la remisión de venta. |
| `pdte_cobro` | Valor del saldo pendiente de cobro de la remisión. |
| `devolucion` | Valor devuelto de la remisión (0 si no tiene devoluciones). |
| `est_remision_v` | Id del estado de facturación de la remisión (1 = Pendiente de facturar, 2 = Facturada). |
| `estado` | Nombre del estado de facturación (texto de est_remision_v). |
| `sucursal_factura_v` | Sucursal de la factura de venta generada a partir de la remisión (null si no se ha facturado). |
| `prefijo_factura_v` | Prefijo de la factura de venta generada (null si no se ha facturado). |
| `id_factura_v` | Id de la factura de venta generada a partir de la remisión (null si no se ha facturado). |
| `est_c_x_c` | Id del estado de la cuenta por cobrar (1 = Pago total, 2 = Pendiente de cobro al día, 3 = Pendiente de cobro en mora, 4 = Pendiente de cobro dudoso recaudo). |
| `estado_c_x_c` | Nombre del estado de la cuenta por cobrar (texto de est_c_x_c). |
| `t_forma_pago` | Id de la forma de pago (ver api/forma_pago). |
| `nombre_t_forma_pago` | Nombre de la forma de pago (texto de t_forma_pago). |
| `dias_mora` | Días de mora de la cuenta por cobrar (0 si está al día o pagada). |
| `valor_mora` | Valor en mora de la cuenta por cobrar (0 si está al día o pagada). |
| `t_cliente` | Id del tipo de cliente (de la ficha del cliente). |
| `tipo_cliente` | Nombre del tipo de cliente (texto de t_cliente). |
| `sucursal_ruta_logistica` | Sucursal de la ruta logística del cliente (null si no tiene). |
| `ruta_logistica` | Id de la ruta logística del cliente (null si no tiene). |
| `nombre_ruta_logistica` | Nombre de la ruta logística (texto de ruta_logistica). |
| `est_contable` | Id del estado contable (1 = Sin comprobante contable, 2 = Comprobante contable en proceso, 3 = Comprobante contable exitoso, 4 = Comprobante contable fracasado, 5 = Comprobante contable anulado). |
| `estado_contable` | Nombre del estado contable (texto de est_contable). |
| `responsable` | Usuario (correo) que creó la remisión. |
| `nombre_responsable` | Nombres y apellidos del usuario que creó la remisión (texto de responsable). |
| `observacion` | Observación de la remisión. |
| `garantia` | Texto de garantía de la remisión. |
| `impresion` | 1 si la remisión ya fue impresa; 0 si no. |
| `sucursal_guia_transporte` | Sucursal de la guía de transporte asociada (null si no tiene). |
| `prefijo_guia_transporte` | Prefijo de la guía de transporte asociada (null si no tiene). |
| `id_guia_transporte` | Id de la guía de transporte asociada (null si no tiene). |
| `guia` | Número de guía de la transportadora (null si no tiene). |
| `sucursal_relacion_despacho` | Sucursal de la relación de despacho en la que está incluida la remisión (null si no tiene). |
| `prefijo_relacion_despacho` | Prefijo de la relación de despacho (null si no tiene). |
| `id_relacion_despacho` | Id de la relación de despacho (null si no tiene). |
| `empresa_relacion_despacho` | Id de la empresa de la relación de despacho (null si no tiene). |
| `nombre_empresa_relacion_despacho` | Nombre de la empresa de la relación de despacho (texto de empresa_relacion_despacho). |
| `datacredito` | 1 si tiene activado el reporte a Datacrédito; 0 si no. |
| `datacredito_negativo` | 1 si tiene activado el reporte negativo a Datacrédito; 0 si no. |
| `transaccion_dropshipping` | Id de la transacción dropshipping asociada (null si no aplica). |
| `empresa_proveedor` | Id de la empresa proveedora en la transacción dropshipping (null si no aplica). |
| `nombre_empresa_proveedor` | Nombre de la empresa proveedora (texto de empresa_proveedor). |
| `empresa_distribuidor` | Id de la empresa distribuidora en la transacción dropshipping (null si no aplica). |
| `nombre_empresa_distribuidor` | Nombre de la empresa distribuidora (texto de empresa_distribuidor). |
| `est_transaccion_dropshipping` | Id del estado de la transacción dropshipping (1 = Pendiente de aprobación, 2 = Aprobada, 3 = Rechazada; null si no aplica). |
| `estado_dropshipping` | Nombre del estado de la transacción dropshipping (texto de est_transaccion_dropshipping). |
| `id_venta_ecommerce` | Id de la venta en la plataforma ecommerce (null si no aplica). |
| `name_venta_ecommerce` | Nombre/número de la venta en la plataforma ecommerce (null si no aplica). |
| `transaction_status` | Estado del pago en la plataforma ecommerce: success, pending, failure, error (null si no aplica). |
| `vigente` | 1 si la remisión está vigente; 0 si está anulada. |

### Ejemplo de respuesta

```json
{
  "ok": true,
  "data": [
    {
      "id": "269",
      "prefijo": "PPAL",
      "id_transaccion": "PPAL-269",
      "fecha_trans": "2026-09-02 14:14:49",
      "fecha_entrega": "2026-09-02",
      "sucursal": "1",
      "nombre_sucursal": "Principal",
      "centro_costos": "4",
      "nombre_centro_costos": "Centro de costos ejemplo",
      "bodega": "1",
      "nombre_bodega": "Principal",
      "ubicacion_venta": "1",
      "nombre_ubicacion_venta": "Ubicación de venta ejemplo",
      "convenio_dropshipping": null,
      "nombre_convenio_dropshipping": null,
      "ecommerce": null,
      "nombre_ecommerce": null,
      "cliente": "1519",
      "nombre_cliente": "Comercializadora Andina S.A.S.",
      "dni_cliente": "1",
      "abreviacion": "NIT",
      "id_cliente": "900123456",
      "telefono_cliente": "3001234567",
      "pais_cliente": "47",
      "nombre_pais": "Colombia",
      "provincia_cliente": "776",
      "nombre_provincia": "Antioquia",
      "ciudad_cliente": "12601",
      "nombre_ciudad": "Medellín",
      "direccion_cliente": "Calle 10 # 20-30",
      "vendedor": "10",
      "nombre_vendedor": "Carlos Gómez",
      "tercero": null,
      "nombre_tercero": null,
      "nombre_comercial_tercero": null,
      "id_tercero": null,
      "contacto_tercero": null,
      "cliente_tercero": null,
      "proveedor_tercero": null,
      "empleado_tercero": null,
      "socio_tercero": null,
      "bruto": "200000.0000",
      "descuento": "0.0000",
      "subtotal": "200000.0000",
      "impuestos": "38000.0000",
      "retefuente": "0.0000",
      "propina": "0.0000",
      "total": "238000.0000",
      "pdte_cobro": "0.00",
      "devolucion": "0.0000",
      "est_remision_v": "1",
      "estado": "Pendiente de facturar",
      "sucursal_factura_v": null,
      "prefijo_factura_v": null,
      "id_factura_v": null,
      "est_c_x_c": "1",
      "estado_c_x_c": "Pago total",
      "t_forma_pago": "1",
      "nombre_t_forma_pago": "Contado",
      "dias_mora": "0",
      "valor_mora": "0.00",
      "t_cliente": "3",
      "tipo_cliente": "Cliente desertor",
      "sucursal_ruta_logistica": null,
      "ruta_logistica": null,
      "nombre_ruta_logistica": null,
      "est_contable": "2",
      "estado_contable": "Comprobante contable en proceso",
      "responsable": "usuario@empresa.com",
      "nombre_responsable": "Laura Martínez",
      "observacion": "",
      "garantia": "",
      "impresion": "0",
      "sucursal_guia_transporte": null,
      "prefijo_guia_transporte": null,
      "id_guia_transporte": null,
      "guia": null,
      "sucursal_relacion_despacho": null,
      "prefijo_relacion_despacho": null,
      "id_relacion_despacho": null,
      "empresa_relacion_despacho": null,
      "nombre_empresa_relacion_despacho": null,
      "datacredito": "0",
      "datacredito_negativo": "0",
      "transaccion_dropshipping": null,
      "empresa_proveedor": null,
      "nombre_empresa_proveedor": null,
      "empresa_distribuidor": null,
      "nombre_empresa_distribuidor": null,
      "est_transaccion_dropshipping": null,
      "estado_dropshipping": null,
      "id_venta_ecommerce": null,
      "name_venta_ecommerce": null,
      "transaction_status": null,
      "vigente": "0"
    },
    {
      "id": "268",
      "prefijo": "PPAL",
      "id_transaccion": "PPAL-268",
      "fecha_trans": "2026-08-30 14:54:08",
      "fecha_entrega": "2026-08-30",
      "sucursal": "1",
      "nombre_sucursal": "Principal",
      "centro_costos": "4",
      "nombre_centro_costos": "Centro de costos ejemplo",
      "bodega": "1",
      "nombre_bodega": "Principal",
      "ubicacion_venta": "1",
      "nombre_ubicacion_venta": "Ubicación de venta ejemplo",
      "convenio_dropshipping": null,
      "nombre_convenio_dropshipping": null,
      "ecommerce": null,
      "nombre_ecommerce": null,
      "cliente": "1519",
      "nombre_cliente": "Distribuidora del Norte Ltda.",
      "dni_cliente": "1",
      "abreviacion": "NIT",
      "id_cliente": "900654321",
      "telefono_cliente": "3109876543",
      "pais_cliente": "47",
      "nombre_pais": "Colombia",
      "provincia_cliente": "776",
      "nombre_provincia": "Antioquia",
      "ciudad_cliente": "12601",
      "nombre_ciudad": "Medellín",
      "direccion_cliente": "Carrera 45 # 12-34",
      "vendedor": "10",
      "nombre_vendedor": "Carlos Gómez",
      "tercero": null,
      "nombre_tercero": null,
      "nombre_comercial_tercero": null,
      "id_tercero": null,
      "contacto_tercero": null,
      "cliente_tercero": null,
      "proveedor_tercero": null,
      "empleado_tercero": null,
      "socio_tercero": null,
      "bruto": "200000.0000",
      "descuento": "0.0000",
      "subtotal": "200000.0000",
      "impuestos": "38000.0000",
      "retefuente": "0.0000",
      "propina": "0.0000",
      "total": "238000.0000",
      "pdte_cobro": "0.00",
      "devolucion": "0.0000",
      "est_remision_v": "2",
      "estado": "Facturada",
      "sucursal_factura_v": "1",
      "prefijo_factura_v": "PPAL",
      "id_factura_v": "9063",
      "est_c_x_c": "1",
      "estado_c_x_c": "Pago total",
      "t_forma_pago": "1",
      "nombre_t_forma_pago": "Contado",
      "dias_mora": "0",
      "valor_mora": "0.00",
      "t_cliente": "3",
      "tipo_cliente": "Cliente desertor",
      "sucursal_ruta_logistica": null,
      "ruta_logistica": null,
      "nombre_ruta_logistica": null,
      "est_contable": "2",
      "estado_contable": "Comprobante contable en proceso",
      "responsable": "usuario@empresa.com",
      "nombre_responsable": "Laura Martínez",
      "observacion": "",
      "garantia": "",
      "impresion": "0",
      "sucursal_guia_transporte": null,
      "prefijo_guia_transporte": null,
      "id_guia_transporte": null,
      "guia": null,
      "sucursal_relacion_despacho": null,
      "prefijo_relacion_despacho": null,
      "id_relacion_despacho": null,
      "empresa_relacion_despacho": null,
      "nombr
```

---

## <a id="factura_v"></a>GET `api/factura_v` — Consultar facturas de venta

Devuelve las facturas de venta de la empresa asociada a la API key con las mismas columnas de la tabla de consulta del web: id interno, prefijo e identificador visible (id_transaccion), fechas de creación y de entrega, sucursal, centro de costos, bodega, ubicación de venta, convenio dropshipping, integración ecommerce, numeración de transacción (con su nombre y el número de facturación prefijo_id_facturacion), datos del documento electrónico (ebill, CUFE, proveedor de facturación electrónica, clave de acceso y estados SRI, QR), cliente (con su tipo y número de identificación, teléfono, país, departamento, ciudad y dirección), vendedor, tercero (con sus datos de identificación y marcas de contacto/cliente/proveedor/empleado/socio), divisa y TRM, valores (bruto, descuento, subtotal, impuestos, retenciones, propina, total, total en divisa, saldo pendiente de cobro y devolución), estado de la cuenta por cobrar, forma de pago, días y valor de mora, relación de despacho, responsable, datos de dropshipping, guía de transporte, observación, garantía, estado contable, datos de la venta ecommerce y vigencia; cada id de otra tabla va seguido de su nombre. La clave de una factura es empresa + sucursal + id: el id se repite entre sucursales, así que para identificar una factura combine siempre sucursal e id (o use prefijo_id_facturacion, que es el número de factura). Igual que en el web, solo se listan las facturas de las sucursales autorizadas al usuario de la API key, de clientes cuya ruta logística tenga autorizada y, si el usuario tiene activada la marca "restringir clientes", solo las de sus clientes asignados. Igual que en el web, si la petición no trae ningún parámetro en la URL el modelo acota la consulta a las facturas creadas desde el día anterior: se recomienda enviar siempre desde y hasta. Los filtros son los mismos del bloque de búsqueda del módulo Facturas de venta del web (se llaman igual que las columnas): id, res_facturacion, id_facturacion, desde, hasta, centro_costos, cliente, t_cliente, pais, provincia, ciudad, t_forma_pago, t_medio_pago, est_c_x_c, articulo, marca, categoria, vendedor, tercero, entrega_desde, entrega_hasta, sucursal, bodega, ubicacion_venta, relacion_despacho, devolucion, responsable, dropshipping_proveedor, dropshipping_distribuidor, convenio_dropshipping, est_transaccion_dropshipping, guia_transporte, total_desde, total_hasta, vigente, garantia, ebill, cufe, est_contable, ecommerce, id_ecommerce, id_venta_ecommerce y name_venta_ecommerce; además permite paginar. Si no se envía vigente se listan vigentes y anuladas (como el web con "Seleccionar..."); vigente=1 lista solo las vigentes y vigente=0 solo las anuladas. Resumen agregado (agrupar_por): enviando agrupar_por=<dimensión> el servicio NO devuelve el listado paginado sino las filas agregadas de un GROUP BY sobre las mismas facturas filtradas (misma empresa, sucursales autorizadas y filtros de cabecera), sin tope de días: data = [{clave, nombre, cantidad, total, subtotal, impuestos, descuento, devolucion, total_neto, costo, pdte_cobro}] ordenadas por total descendente (dia/mes/anio en orden cronológico) y resumen = {agrupar_por, limite, grupos, totales}. Dimensiones: vendedor, cliente, sucursal, centro_costos, forma_pago, pais, provincia, ciudad, divisa, dia, mes, anio, articulo y t_origen (origen propio de la factura según la tabla t_origen_factura_v: nueva, desde cotización, desde orden de venta, desde remisión de venta, devolución o liquidación de alquiler, dropshipping; no es el canal por el que se creó la transacción: Web, API, Effi AI...). En el resumen solo se suman las facturas vigentes salvo que se envíe vigente, y aplican únicamente los filtros sucursal, centro_costos, bodega, ubicacion_venta, desde, hasta, cliente, t_cliente, pais, provincia, ciudad, res_facturacion, est_c_x_c, vendedor, tercero, responsable, ebill, cufe, ecommerce, id_ecommerce y vigente (los demás se ignoran). Es la vía recomendada para rankings y totales por periodo (p. ej. ventas por vendedor del año) en lugar de recorrer páginas. Requiere permiso de consulta sobre la función: Facturas de venta.

Ejemplo: `GET api/factura_v?desde=2026-01-01&hasta=2026-12-31&pagina=1&por_pagina=100`

### Parámetros

| Nombre | Tipo | Req. | Descripción |
|---|---|---|---|
| `agrupar_por` | string |  | Dimensión del resumen agregado. Si se envía, la respuesta cambia: data trae una fila por grupo {clave (id de la dimensión; YYYY-MM-DD, YYYY-MM o YYYY en dia/mes/anio), nombre (texto de la dimensión), cantidad (facturas), total, subtotal, impuestos, descuento, devolucion, total_neto (total menos devolucion), costo, pdte_cobro} y resumen trae {agrupar_por, limite, grupos, totales}; no hay paginación y no aplica el tope de días. forma_pago (1:N) solo devuelve cantidad y total (valor asignado a esa forma de pago); articulo devuelve cantidad (facturas), unidades y total (valor neto sin impuestos de los conceptos del artículo). t_origen agrupa por el origen propio de la factura (clave = id de la tabla t_origen_factura_v, nombre = su texto; p. ej. cuántas facturas se crearon desde remisiones de venta = clave 4); no es el canal por el que se creó la transacción (Web, API, Effi AI...), que este recurso no expone. Combínelo con desde y hasta para acotar el periodo. Un valor fuera de la lista responde 400 con las dimensiones válidas. Valores: `vendedor` Vendedor, `cliente` Cliente, `sucursal` Sucursal, `centro_costos` Centro de costos, `forma_pago` Forma de pago, `pais` País del cliente, `provincia` Departamento del cliente, `ciudad` Ciudad del cliente, `divisa` Divisa, `dia` Día (YYYY-MM-DD), `mes` Mes (YYYY-MM), `anio` Año (YYYY), `articulo` Artículo (conceptos), `t_origen` Origen de la factura (t_origen_factura_v: 1 Nueva factura, 2 Cotización, 3 Orden de venta, 4 Remisión de venta, 5 Devolución de alquiler, 6 Liquidación parcial de alquiler, 7 Venta Dropshipping de distribuidor) |
| `limite` | integer |  | Solo con agrupar_por: máximo de grupos (filas) del resumen, ordenados por total descendente. Por defecto 500, máximo 1000. |
| `id` | integer |  | Filtrar por el id interno de una factura específica. El id se repite entre sucursales (la clave es empresa + sucursal + id): combínelo con sucursal. No es el número de factura (ver id_facturacion). |
| `res_facturacion` | string |  | Filtrar por el id de la numeración de transacción (ver api/res_facturacion). Admite varios ids separados por coma (ej. 19,20): se listan las facturas que cumplan al menos una. Enviar null para listar las facturas sin numeración. En el web es una lista desplegable dinámica de selección múltiple. Valores: `null` Ninguna |
| `id_facturacion` | integer |  | Filtrar por el número consecutivo de la factura dentro de su numeración de transacción (combinar con res_facturacion). |
| `desde` | date |  | Fecha de creación (fecha_trans) mayor o igual a la indicada. Formato YYYY-MM-DD o YYYY-MM-DD HH:MM:SS, interpretada en la zona horaria de la empresa. Si la petición no trae ningún parámetro, el modelo acota a las facturas creadas desde el día anterior (igual que el web). |
| `hasta` | date |  | Fecha de creación (fecha_trans) menor o igual a la indicada. Formato YYYY-MM-DD o YYYY-MM-DD HH:MM:SS, interpretada en la zona horaria de la empresa. |
| `centro_costos` | integer |  | Filtrar por el id del centro de costos (ver api/centro_costos). En el web es una lista desplegable dinámica. |
| `cliente` | integer |  | Filtrar por el id del tercero cliente (columna cliente). En el web se elige con el buscador de clientes. |
| `t_cliente` | integer |  | Filtrar por el id del tipo de cliente del cliente de la factura (se evalúa sobre la ficha del cliente). Es solo un filtro: no se devuelve como campo. En el web es una lista desplegable dinámica. |
| `pais` | integer |  | Filtrar por el id del país del cliente (columna pais_cliente; ver api/pais). |
| `provincia` | integer |  | Filtrar por el id del departamento/provincia del cliente (columna provincia_cliente; ver api/provincia). |
| `ciudad` | integer |  | Filtrar por el id de la ciudad del cliente (columna ciudad_cliente; ver api/ciudad). |
| `t_forma_pago` | string |  | Filtrar por el id de la forma de pago (ver api/forma_pago). Admite varios ids separados por coma (ej. 1,2): se listan las facturas que cumplan al menos una. En el web es una lista desplegable dinámica de selección múltiple. |
| `t_medio_pago` | string |  | Filtrar por el id del medio de pago usado en la factura (ver api/medio_pago). Admite varios ids separados por coma (ej. 1,3): se listan las facturas que cumplan al menos una. Es solo un filtro: no se devuelve como campo. En el web es una lista desplegable dinámica de selección múltiple. |
| `est_c_x_c` | integer |  | Filtrar por el estado de la cuenta por cobrar. Enviar 0 para listar las que tienen saldo pendiente de cobro (pdte_cobro mayor a 0); otro valor filtra por el id del estado (1 = Pago total, 2 = Pendiente de cobro al día, 3 = Pendiente de cobro en mora, 4 = Pendiente de cobro dudoso recaudo). Valores: `0` Pendiente de cobro, `1` Pago total, `2` Pendiente de cobro al día, `3` Pendiente de cobro en mora, `4` Pendiente de cobro dudoso recaudo |
| `articulo` | integer |  | Filtrar por el id de un artículo incluido en los conceptos de la factura (ver api/articulo). Es solo un filtro: no se devuelve como campo. |
| `marca` | integer |  | Filtrar por el id de la marca de algún artículo incluido en los conceptos de la factura (ver api/marca_articulo). Es solo un filtro: no se devuelve como campo. En el web es una lista desplegable dinámica. |
| `categoria` | integer |  | Filtrar por el id de la categoría de algún artículo incluido en los conceptos de la factura (ver api/categoria_articulo). Es solo un filtro: no se devuelve como campo. En el web es una lista desplegable dinámica. |
| `vendedor` | integer |  | Filtrar por el id del tercero vendedor (columna vendedor). En el web es una lista desplegable dinámica. |
| `tercero` | integer |  | Filtrar por el id del tercero asociado (columna tercero). En el web se elige con el buscador de terceros. |
| `entrega_desde` | date |  | Fecha de entrega (fecha_entrega) mayor o igual a la indicada. Formato YYYY-MM-DD. |
| `entrega_hasta` | date |  | Fecha de entrega (fecha_entrega) menor o igual a la indicada. Formato YYYY-MM-DD. |
| `sucursal` | integer |  | Filtrar por el id de la sucursal (ver api/sucursal). Solo se listan las sucursales autorizadas al usuario de la API key. En el web es una lista desplegable dinámica. |
| `bodega` | integer |  | Filtrar por el id de la bodega (ver api/bodega). En el web es una lista desplegable dinámica que depende de la sucursal. |
| `ubicacion_venta` | integer |  | Filtrar por el id de la ubicación de venta (ver api/ubicacion_venta). En el web es una lista desplegable dinámica que depende de la sucursal. |
| `relacion_despacho` | integer |  | Filtrar por relación de despacho asociada: 1 solo facturas incluidas en una relación de despacho; 0 solo facturas sin relación de despacho. Valores: `1` Si, `0` No |
| `devolucion` | integer |  | Filtrar por el estado de devolución de la factura comparando el valor devuelto (devolucion) con el total: 1 sin devolución; 2 sin devolución o devolución parcial; 3 con devolución parcial o total; 4 devolución parcial; 5 devolución total. Valores: `1` Sin devolución, `2` Sin devolución o devolución parcial, `3` Con devolución parcial o total, `4` Devolución parcial, `5` Devolución total |
| `responsable` | string |  | Filtrar por el usuario (correo) que creó la factura. En el web es una lista desplegable dinámica de los usuarios de la empresa. |
| `dropshipping_proveedor` | integer |  | Filtrar por participación dropshipping como proveedor: 1 solo facturas cuya transacción dropshipping tiene a la empresa como proveedora; 0 solo las que no. Valores: `1` Si, `0` No |
| `dropshipping_distribuidor` | integer |  | Filtrar por participación dropshipping como distribuidor: 1 solo facturas cuya transacción dropshipping tiene a la empresa como distribuidora; 0 solo las que no. Valores: `1` Si, `0` No |
| `convenio_dropshipping` | string |  | Filtrar por el código del convenio dropshipping de la transacción dropshipping asociada. En el web es una lista desplegable dinámica. |
| `est_transaccion_dropshipping` | integer |  | Filtrar por el id del estado de la transacción dropshipping asociada. En el web es una lista desplegable dinámica (1 = Pendiente de aprobación, 2 = Aprobada, 3 = Rechazada). |
| `guia_transporte` | integer |  | Filtrar por guía de transporte asociada: 1 solo facturas con guía de transporte; 0 solo facturas sin guía. Valores: `1` Si, `0` No |
| `total_desde` | decimal |  | Total mayor o igual al indicado (rango numérico; combinar con total_hasta). |
| `total_hasta` | decimal |  | Total menor o igual al indicado (rango numérico; combinar con total_desde). |
| `vigente` | integer |  | Si no se envía se listan vigentes y anuladas (como el web con "Seleccionar..."). Enviar vigente=1 para listar solo las vigentes o vigente=0 para listar solo las anuladas. Valores: `1` Vigente, `0` Anulada |
| `garantia` | string |  | Filtrar por una palabra clave contenida en el texto de garantía (coincidencia parcial, sin distinguir mayúsculas). |
| `ebill` | integer |  | Filtrar por la marca de documento electrónico: 1 solo facturas electrónicas; 0 solo facturas no electrónicas. Valores: `1` Si, `0` No |
| `cufe` | integer |  | Filtrar por autorización electrónica: 1 solo facturas con CUFE (documento electrónico autorizado); 0 solo facturas sin CUFE. Valores: `1` Si, `0` No |
| `est_contable` | integer |  | Filtrar por el id del estado contable de la factura. En el web es una lista desplegable dinámica (1 = Sin comprobante contable, 2 = Comprobante contable en proceso, 3 = Comprobante contable exitoso, 4 = Comprobante contable fracasado, 5 = Comprobante contable anulado). |
| `ecommerce` | integer |  | Filtrar por origen ecommerce: 1 solo facturas provenientes de una integración ecommerce; 0 solo facturas sin integración ecommerce. Valores: `1` Si, `0` No |
| `id_ecommerce` | integer |  | Filtrar por el id de la integración ecommerce de la que proviene la factura (columna ecommerce; ver api/ecommerce). En el web es una lista desplegable dinámica. |
| `id_venta_ecommerce` | string |  | Filtrar por el id de la venta en la plataforma ecommerce (coincidencia exacta). |
| `name_venta_ecommerce` | string |  | Filtrar por el nombre/número de la venta en la plataforma ecommerce (coincidencia por terminación: el valor enviado debe ser el final del nombre, ej. 1014 encuentra #1014). |
| `pagina` | integer |  | Número de página. Por defecto 1. |
| `por_pagina` | integer |  | Registros por página. Por defecto 100, máximo 100. |

### Campos de respuesta

| Campo | Descripción |
|---|---|
| `id` | Identificador interno de la factura. Se repite entre sucursales: la clave única es empresa + sucursal + id. No es el número de factura (ver prefijo_id_facturacion). |
| `prefijo` | Prefijo de la transacción en la sucursal. |
| `id_transaccion` | Identificador visible prefijo-id, como en el ERP. |
| `fecha_trans` | Fecha y hora de creación de la factura, en UTC tal como está almacenada en la base de datos. |
| `fecha_entrega` | Fecha de entrega (YYYY-MM-DD). |
| `sucursal` | Id de la sucursal que emitió la factura. |
| `nombre_sucursal` | Nombre de la sucursal (texto de sucursal). |
| `centro_costos` | Id del centro de costos. |
| `nombre_centro_costos` | Nombre del centro de costos (texto de centro_costos). |
| `bodega` | Id de la bodega. |
| `nombre_bodega` | Nombre de la bodega (texto de bodega). |
| `ubicacion_venta` | Id de la ubicación de venta (null si no aplica). |
| `nombre_ubicacion_venta` | Nombre de la ubicación de venta (texto de ubicacion_venta). |
| `convenio_dropshipping` | Código del convenio dropshipping (null si no aplica). |
| `nombre_convenio_dropshipping` | Nombre del convenio dropshipping (texto de convenio_dropshipping). |
| `ecommerce` | Id de la integración ecommerce de la que proviene la factura (null si no es venta ecommerce; ver api/ecommerce). |
| `nombre_ecommerce` | Nombre de la integración ecommerce (texto de ecommerce). |
| `res_facturacion` | Id de la numeración de transacción con la que se emitió la factura (null si no tiene; ver api/res_facturacion). |
| `nombre_res_facturacion` | Nombre de la numeración de transacción (texto de res_facturacion). |
| `prefijo_id_facturacion` | Número de facturación con prefijo y separador, como en el ERP, p. ej. FE-164 (null si no tiene numeración). |
| `ebill` | 1 si la factura es un documento electrónico; 0 si no. |
| `cufe` | CUFE o clave de acceso del documento electrónico autorizado (null si no tiene). |
| `t_ebill` | Id del proveedor de facturación electrónica de la empresa (null si no tiene). |
| `tipo_ebill` | Nombre del proveedor de facturación electrónica (texto de t_ebill). |
| `clave_acceso_sri` | Clave de acceso del comprobante electrónico en el SRI (Ecuador; null si no aplica). |
| `est_autorizacion_sri` | Estado de autorización del comprobante electrónico en el SRI (Ecuador) o número DTE (Guatemala); null si no aplica. |
| `est_validacion_sri` | Estado de validación del comprobante electrónico en el SRI (Ecuador) o serie del DTE (Guatemala); null si no aplica. |
| `data_qr_ebill` | URL o datos del código QR del documento electrónico (null si no aplica). |
| `cliente` | Id del tercero cliente. |
| `nombre_cliente` | Nombre del cliente (texto de cliente). |
| `dni_cliente` | Id del tipo de documento de identidad del cliente (t_dni). |
| `abreviacion` | Abreviatura del tipo de documento del cliente (texto de dni_cliente), ej. NIT, CC. |
| `id_cliente` | Número de identificación del cliente. |
| `telefono_cliente` | Teléfono del cliente. |
| `pais_cliente` | Id del país del cliente. |
| `nombre_pais` | Nombre del país (texto de pais_cliente). |
| `provincia_cliente` | Id del departamento/provincia del cliente. |
| `nombre_provincia` | Nombre del departamento/provincia (texto de provincia_cliente). |
| `ciudad_cliente` | Id de la ciudad del cliente. |
| `nombre_ciudad` | Nombre de la ciudad (texto de ciudad_cliente). |
| `direccion_cliente` | Dirección del cliente. |
| `vendedor` | Id del tercero vendedor (null si no tiene). |
| `nombre_vendedor` | Nombre del vendedor (texto de vendedor). |
| `tercero` | Id del tercero asociado a la factura (null si no tiene). |
| `nombre_tercero` | Nombre del tercero (texto de tercero). |
| `nombre_comercial_tercero` | Nombre comercial del tercero (texto de tercero; null si no tiene). |
| `id_tercero` | Número de identificación del tercero (null si no tiene). |
| `contacto_tercero` | 1 si el tercero es contacto; 0 si no (null si no tiene tercero). |
| `cliente_tercero` | 1 si el tercero es cliente; 0 si no (null si no tiene tercero). |
| `proveedor_tercero` | 1 si el tercero es proveedor; 0 si no (null si no tiene tercero). |
| `empleado_tercero` | 1 si el tercero es empleado; 0 si no (null si no tiene tercero). |
| `socio_tercero` | 1 si el tercero es socio; 0 si no (null si no tiene tercero). |
| `divisa` | Código ISO de la divisa de la factura (ej. COP, USD). |
| `trm` | Tasa de cambio aplicada entre la divisa de la factura y la moneda de la empresa (1 si es la misma moneda). |
| `bruto` | Valor bruto de la factura de venta (suma de los conceptos antes de descuentos e impuestos). |
| `descuento` | Valor del descuento de la factura de venta. |
| `subtotal` | Valor subtotal de la factura de venta (bruto menos descuento). |
| `impuestos` | Valor de los impuestos de la factura de venta. |
| `retefuente` | Valor de las retenciones de la factura de venta. |
| `propina` | Valor de la propina de la factura de venta. |
| `total` | Valor total de la factura de venta. |
| `total_divisa` | Valor total de la factura expresado en su divisa. |
| `pdte_cobro` | Valor del saldo pendiente de cobro de la factura. |
| `devolucion` | Valor devuelto de la factura mediante notas crédito (0 si no tiene devoluciones). |
| `est_c_x_c` | Id del estado de la cuenta por cobrar (1 = Pago total, 2 = Pendiente de cobro al día, 3 = Pendiente de cobro en mora, 4 = Pendiente de cobro dudoso recaudo). |
| `estado` | Nombre del estado de la cuenta por cobrar (texto de est_c_x_c). |
| `t_forma_pago` | Id de la forma de pago (ver api/forma_pago). |
| `nombre_t_forma_pago` | Nombre de la forma de pago (texto de t_forma_pago). |
| `dias_mora` | Días de mora de la cuenta por cobrar (0 si está al día o pagada). |
| `valor_mora` | Valor en mora de la cuenta por cobrar (0 si está al día o pagada). |
| `sucursal_relacion_despacho` | Sucursal de la relación de despacho en la que está incluida la factura (null si no tiene). |
| `prefijo_relacion_despacho` | Prefijo de la relación de despacho (null si no tiene). |
| `id_relacion_despacho` | Id de la relación de despacho (null si no tiene). |
| `empresa_relacion_despacho` | Id de la empresa de la relación de despacho (null si no tiene). |
| `nombre_empresa_relacion_despacho` | Nombre de la empresa de la relación de despacho (texto de empresa_relacion_despacho). |
| `responsable` | Usuario (correo) que creó la factura. |
| `nombre_responsable` | Nombres y apellidos del usuario que creó la factura (texto de responsable). |
| `transaccion_dropshipping` | Id de la transacción dropshipping asociada (null si no aplica). |
| `empresa_proveedor` | Id de la empresa proveedora en la transacción dropshipping (null si no aplica). |
| `nombre_empresa_proveedor` | Nombre de la empresa proveedora (texto de empresa_proveedor). |
| `empresa_distribuidor` | Id de la empresa distribuidora en la transacción dropshipping (null si no aplica). |
| `nombre_empresa_distribuidor` | Nombre de la empresa distribuidora (texto de empresa_distribuidor). |
| `est_transaccion_dropshipping` | Id del estado de la transacción dropshipping (1 = Pendiente de aprobación, 2 = Aprobada, 3 = Rechazada; null si no aplica). |
| `estado_dropshipping` | Nombre del estado de la transacción dropshipping (texto de est_transaccion_dropshipping). |
| `sucursal_guia_transporte` | Sucursal de la guía de transporte asociada (null si no tiene). |
| `prefijo_guia_transporte` | Prefijo de la guía de transporte asociada (null si no tiene). |
| `id_guia_transporte` | Id de la guía de transporte asociada (null si no tiene). |
| `guia` | Número de guía de la transportadora (null si no tiene). |
| `observacion` | Observación de la factura. |
| `garantia` | Texto de garantía de la factura. |
| `est_contable` | Id del estado contable (1 = Sin comprobante contable, 2 = Comprobante contable en proceso, 3 = Comprobante contable exitoso, 4 = Comprobante contable fracasado, 5 = Comprobante contable anulado). |
| `estado_contable` | Nombre del estado contable (texto de est_contable). |
| `id_venta_ecommerce` | Id de la venta en la plataforma ecommerce (null si no aplica). |
| `name_venta_ecommerce` | Nombre/número de la venta en la plataforma ecommerce (null si no aplica). |
| `vigente` | 1 si la factura está vigente; 0 si está anulada. |

### Ejemplo de respuesta

```json
{
  "ok": true,
  "data": [
    {
      "id": "9067",
      "prefijo": "PPAL",
      "id_transaccion": "PPAL-9067",
      "fecha_trans": "2026-08-30 15:59:50",
      "fecha_entrega": "2026-08-30",
      "sucursal": "1",
      "nombre_sucursal": "Principal",
      "centro_costos": "4",
      "nombre_centro_costos": "Centro de costos ejemplo",
      "bodega": "1",
      "nombre_bodega": "Principal",
      "ubicacion_venta": "1",
      "nombre_ubicacion_venta": "Ubicación de venta ejemplo",
      "convenio_dropshipping": null,
      "nombre_convenio_dropshipping": null,
      "ecommerce": null,
      "nombre_ecommerce": null,
      "res_facturacion": "19",
      "nombre_res_facturacion": "FACTURA DE VENTA",
      "prefijo_id_facturacion": "FE-164",
      "ebill": "0",
      "cufe": null,
      "t_ebill": null,
      "tipo_ebill": null,
      "clave_acceso_sri": null,
      "est_autorizacion_sri": null,
      "est_validacion_sri": null,
      "data_qr_ebill": null,
      "cliente": "1519",
      "nombre_cliente": "Comercializadora Andina S.A.S.",
      "dni_cliente": "1",
      "abreviacion": "NIT",
      "id_cliente": "900123456",
      "telefono_cliente": "3001234567",
      "pais_cliente": "47",
      "nombre_pais": "Colombia",
      "provincia_cliente": "776",
      "nombre_provincia": "Antioquia",
      "ciudad_cliente": "12601",
      "nombre_ciudad": "Medellín",
      "direccion_cliente": "Calle 10 # 20-30",
      "vendedor": "267",
      "nombre_vendedor": "Carlos Gómez",
      "tercero": null,
      "nombre_tercero": null,
      "nombre_comercial_tercero": null,
      "id_tercero": null,
      "contacto_tercero": null,
      "cliente_tercero": null,
      "proveedor_tercero": null,
      "empleado_tercero": null,
      "socio_tercero": null,
      "divisa": "COP",
      "trm": "1.0000",
      "bruto": "300000.0000",
      "descuento": "0.0000",
      "subtotal": "300000.0000",
      "impuestos": "57000.0000",
      "retefuente": "0.0000",
      "propina": "0.0000",
      "total": "357000.0000",
      "total_divisa": "357000.0000",
      "pdte_cobro": "0.00",
      "devolucion": "0.0000",
      "est_c_x_c": "1",
      "estado": "Pago total",
      "t_forma_pago": "1",
      "nombre_t_forma_pago": "Contado",
      "dias_mora": "0",
      "valor_mora": "0.00",
      "sucursal_relacion_despacho": null,
      "prefijo_relacion_despacho": null,
      "id_relacion_despacho": null,
      "empresa_relacion_despacho": null,
      "nombre_empresa_relacion_despacho": null,
      "responsable": "usuario@empresa.com",
      "nombre_responsable": "Laura Martínez",
      "transaccion_dropshipping": null,
      "empresa_proveedor": null,
      "nombre_empresa_proveedor": null,
      "empresa_distribuidor": null,
      "nombre_empresa_distribuidor": null,
      "est_transaccion_dropshipping": null,
      "estado_dropshipping": null,
      "sucursal_guia_transporte": null,
      "prefijo_guia_transporte": null,
      "id_guia_transporte": null,
      "guia": null,
      "observacion": "",
      "garantia": "",
      "est_contable": "2",
      "estado_contable": "Comprobante contable en proceso",
      "id_venta_ecommerce": null,
      "name_venta_ecommerce": null,
      "vigente": "1"
    },
    {
      "id": "9066",
      "prefijo": "PPAL",
      "id_transaccion": "PPAL-9066",
      "fecha_trans": "2026-08-30 15:36:13",
      "fecha_entrega": "2026-08-30",
      "sucursal": "1",
      "nombre_sucursal": "Principal",
      "centro_costos": "4",
      "nombre_centro_costos": "Centro de costos ejemplo",
      "bodega": "1",
      "nombre_bodega": "Principal",
      "ubicacion_venta": "1",
      "nombre_ubicacion_venta": "Ubicación de venta ejemplo",
      "convenio_dropshipping": null,
      "nombre_convenio_dropshipping": null,
      "ecommerce": null,
      "nombre_ecommerce": null,
      "res_facturacion": "19",
      "nombre_res_facturacion": "FACTURA DE VENTA",
      "prefijo_id_facturacion": "FE-163",
      "ebill": "0",
      "cufe": null,
      "t_ebill": null,
      "tipo_ebill": null,
      "clave_acceso_sri": null,
      "est_autorizacion_sri": null,
      "est_validacion_sri": null,
      "data_qr_ebill": null,
      "cliente": "1519",
      "nombre_cliente": "Distribuidora del Norte Ltda.",
      "dni_cliente": "1",
      "abreviacion": "NIT",
      "id_cliente": "900654321",
      "telefono_cliente": "3109876543",
      "pais_cliente": "47",
      "nombre_pais": "Colombia",
      "provincia_cliente": "776",
      "nombre_provincia": "Antioquia",
      "ciudad_cliente": "12601",
      "nombre_ciudad": "Medellín",
      "direccion_cliente": "Carrera 45 # 12-34",
      "vendedor": "268",
      "nombre_vendedor": "Carlos Gómez",
      "tercero": null,
      "nombre_tercero": null,
      "nombre_comercial_tercero": null,
      "id_tercero": null,
      "contacto_tercero": null,
      "cliente_tercero": null,
      "proveedor_tercero": null,
      "empleado_tercero": null,
      "socio_tercero": null,
      "divisa": "COP",
      "trm": "1.0000",
      "bruto": "150000.0000",
      "descuento": "0.0000",
      "subtotal": "150000.0000",
      "impuestos": "28500.0000",
      "retefuente": "0.0000",
      "propina": "0.0000",
      "total": "178500.0000",
      "total_divisa": "178500.0000",
      "pdte_cobro": "0.00",
      "devolucion": "0.0000",
      "est_c_x_c": "1",
      "estado": "Pago total",
      "t_forma_pago": "1",
      "nombre_t_forma_pago": "Contado",
      "dias_mora": "0",
      "valor_mora": "0.00",
      "sucursal_relacion_despacho": null,
      "prefijo_relacion_despacho": null,
      "id_relacion_despacho": null,
      "empresa_relacion_despacho": null,
      "nombre_empresa_relacion_despacho": null,
      "responsable": "usuario@empresa.com",
      "nombre_responsable": "Laura Martínez",
      "transaccion_dropshipping": null,
      "empresa_proveedor": null,
      "nombre_empresa_proveedor": null,
      "empresa_distribuidor": null,
      "nombre_empresa_distribuidor": nul
```

---

## <a id="devolucion_v"></a>GET `api/devolucion_v` — Consultar devoluciones de venta

Devuelve las devoluciones de venta (sobre remisiones de venta) de la empresa asociada a la API key con las mismas columnas de la tabla de consulta del web: id interno, prefijo e identificador visible (id_transaccion), fechas de creación y de devolución, sucursal, centro de costos y bodega, cliente de la remisión asociada (con su tipo y número de identificación, teléfono, país, departamento, ciudad y dirección), divisa y TRM, valores (bruto, descuento, subtotal, impuestos, retenciones, total, total en divisa y saldo pendiente de pago al cliente), estado de la cuenta por pagar con días y valor de mora, remisión de venta asociada (sucursal, prefijo e id), destinación del valor total y anticipo de cliente generado automáticamente cuando aplica, responsable, observación, estado contable, datos de anulación y vigencia; cada id de otra tabla va seguido de su nombre. Las devoluciones de venta no son documentos electrónicos. La clave de una devolución es empresa + sucursal + id: el id se repite entre sucursales, así que para identificarla combine siempre sucursal e id. Igual que en el web, solo se listan las devoluciones de las sucursales autorizadas al usuario de la API key, de clientes cuya ruta logística tenga autorizada y, si el usuario tiene activada la marca "restringir clientes", solo las de sus clientes asignados. Los filtros son los mismos del bloque de búsqueda del módulo Devoluciones de venta del web (se llaman igual que las columnas): id, sucursal, bodega, ubicacion_venta, centro_costos, articulo, desde, hasta, cliente, pais, provincia, ciudad, est_c_x_p, est_contable, total_desde, total_hasta, responsable y vigente; además permite paginar. No se expone el filtro observacion (texto largo secundario). Si no se envía vigente se listan vigentes y anuladas (como el web con "Seleccionar..."); vigente=1 lista solo las vigentes y vigente=0 solo las anuladas. Requiere permiso de consulta sobre la función: Devoluciones de venta.

Ejemplo: `GET api/devolucion_v?desde=2026-01-01&hasta=2026-12-31&pagina=1&por_pagina=100`

### Parámetros

| Nombre | Tipo | Req. | Descripción |
|---|---|---|---|
| `id` | integer |  | Filtrar por el id interno de la devolución de venta. El id se repite entre sucursales (la clave es empresa + sucursal + id): combínelo con sucursal. |
| `sucursal` | integer |  | Filtrar por el id de la sucursal de la devolución de venta (ver api/sucursal). Solo se listan las sucursales autorizadas al usuario de la API key. En el web es una lista desplegable dinámica. |
| `bodega` | integer |  | Filtrar por el id de la bodega (ver api/bodega). En el web es una lista desplegable dinámica que depende de la sucursal. |
| `ubicacion_venta` | integer |  | Filtrar por el id de la ubicación de venta de la factura asociada (ver api/ubicacion_venta). Es solo un filtro: no se devuelve como campo. En el web es una lista desplegable dinámica que depende de la sucursal. |
| `centro_costos` | integer |  | Filtrar por el id del centro de costos (ver api/centro_costos). En el web es una lista desplegable dinámica. |
| `articulo` | integer |  | Filtrar por el id de un artículo incluido en los conceptos de la devolución de venta (ver api/articulo). Es solo un filtro: no se devuelve como campo. |
| `desde` | date |  | Fecha de creación (fecha_trans) mayor o igual a la indicada. Formato YYYY-MM-DD o YYYY-MM-DD HH:MM:SS, interpretada en la zona horaria de la empresa. |
| `hasta` | date |  | Fecha de creación (fecha_trans) menor o igual a la indicada. Formato YYYY-MM-DD o YYYY-MM-DD HH:MM:SS, interpretada en la zona horaria de la empresa. |
| `cliente` | integer |  | Filtrar por el código del tercero cliente (columna cliente; campo tercero de api/cliente). En el web se elige con el buscador de clientes. |
| `pais` | integer |  | Filtrar por el id del país del cliente (columna pais_cliente; ver api/pais). |
| `provincia` | integer |  | Filtrar por el id del departamento/provincia del cliente (columna provincia_cliente; ver api/provincia). |
| `ciudad` | integer |  | Filtrar por el id de la ciudad del cliente (columna ciudad_cliente; ver api/ciudad). |
| `est_c_x_p` | integer |  | Filtrar por el id del estado de la cuenta por pagar al cliente (saldo de la devolución de venta pendiente de aplicar). Valores: `1` Pago total, `2` Pendiente de pago al día, `3` Pendiente de pago vencido |
| `est_contable` | integer |  | Filtrar por el id del estado contable de la devolución de venta. En el web es una lista desplegable dinámica (1 = Sin comprobante contable, 2 = Comprobante contable en proceso, 3 = Comprobante contable exitoso, 4 = Comprobante contable fracasado, 5 = Comprobante contable anulado). |
| `total_desde` | decimal |  | Total mayor o igual al indicado (rango numérico; combinar con total_hasta). |
| `total_hasta` | decimal |  | Total menor o igual al indicado (rango numérico; combinar con total_desde). |
| `responsable` | string |  | Filtrar por el usuario (correo) que creó la devolución de venta. En el web es una lista desplegable dinámica de los usuarios de la empresa. |
| `vigente` | integer |  | Si no se envía se listan vigentes y anuladas (como el web con "Seleccionar..."). Enviar vigente=1 para listar solo las vigentes o vigente=0 para listar solo las anuladas. Valores: `1` Vigente, `0` Anulada |
| `pagina` | integer |  | Número de página. Por defecto 1. |
| `por_pagina` | integer |  | Registros por página. Por defecto 100, máximo 100. |

### Campos de respuesta

| Campo | Descripción |
|---|---|
| `id` | Identificador interno de la devolución de venta. Se repite entre sucursales: la clave única es empresa + sucursal + id. |
| `prefijo` | Prefijo de la transacción en la sucursal. |
| `id_transaccion` | Identificador visible prefijo-id, como en el ERP. |
| `fecha_trans` | Fecha y hora de creación de la devolución, en UTC tal como está almacenada en la base de datos. |
| `fecha_inicio_deuda` | Fecha de devolución (YYYY-MM-DD): fecha del documento desde la que se cuenta la deuda con el cliente. |
| `sucursal` | Id de la sucursal. |
| `nombre_sucursal` | Nombre de la sucursal (texto de sucursal). |
| `centro_costos` | Id del centro de costos. |
| `nombre_centro_costos` | Nombre del centro de costos (texto de centro_costos). |
| `bodega` | Id de la bodega. |
| `nombre_bodega` | Nombre de la bodega (texto de bodega). |
| `cliente` | Código del tercero cliente (campo tercero de api/cliente). |
| `nombre_cliente` | Nombre del cliente (texto de cliente). |
| `dni_cliente` | Id del tipo de documento de identidad del cliente (t_dni). |
| `abreviacion` | Abreviatura del tipo de documento del cliente (texto de dni_cliente), ej. NIT, CC. |
| `id_cliente` | Número de identificación del cliente. |
| `telefono_cliente` | Teléfono del cliente. |
| `pais_cliente` | Id del país del cliente (null si no tiene dirección). |
| `nombre_pais` | Nombre del país (texto de pais_cliente). |
| `provincia_cliente` | Id del departamento/provincia del cliente. |
| `nombre_provincia` | Nombre del departamento/provincia (texto de provincia_cliente). |
| `ciudad_cliente` | Id de la ciudad del cliente. |
| `nombre_ciudad` | Nombre de la ciudad (texto de ciudad_cliente). |
| `direccion_cliente` | Dirección del cliente. |
| `divisa` | Código ISO de la divisa de la devolución de venta (ej. COP, USD). |
| `trm` | Tasa de cambio aplicada entre la divisa de la devolución de venta y la moneda de la empresa (1 si es la misma moneda). |
| `bruto` | Valor bruto de la devolución de venta (suma de los conceptos antes de descuentos e impuestos). |
| `descuento` | Valor del descuento de la devolución de venta. |
| `subtotal` | Valor subtotal de la devolución de venta (bruto menos descuento). |
| `impuestos` | Valor de los impuestos de la devolución de venta. |
| `retefuente` | Valor de las retenciones de la devolución de venta. |
| `total` | Valor total de la devolución de venta en la moneda de la empresa. |
| `total_divisa` | Valor total de la devolución de venta expresado en su divisa. |
| `pdte_pago` | Saldo pendiente de pago al cliente de la devolución de venta (0 cuando el valor ya fue abonado, convertido en anticipo o devuelto en dinero). |
| `est_c_x_p` | Id del estado de la cuenta por pagar (1 = Pago total, 2 = Pendiente de pago al día, 3 = Pendiente de pago vencido). |
| `estado` | Nombre del estado de la cuenta por pagar (texto de est_c_x_p). |
| `dias_mora` | Días de mora de la cuenta por pagar (0 si está al día o pagada). |
| `valor_mora` | Valor en mora de la cuenta por pagar (0 si está al día o pagada). |
| `sucursal_remision_v` | Sucursal de la remisión de venta asociada. |
| `nombre_sucursal_remision_v` | Nombre de la sucursal de la remisión asociada (texto de sucursal_remision_v). |
| `prefijo_remision_v` | Prefijo de la remisión de venta asociada. |
| `id_remision_v` | Id interno de la remisión de venta asociada (campo id de GET api/remision_v; la clave es empresa + sucursal + id). |
| `t_destinacion` | Id de la destinación del valor total (1 = Abono en la remisión de venta asociada, 2 = Anticipo a favor del cliente, 3 = Devolución de dinero al cliente). |
| `tipo_destinacion` | Nombre de la destinación (texto de t_destinacion). |
| `sucursal_anticipo_cliente` | Sucursal del anticipo de cliente generado automáticamente cuando la destinación es 2 (null en las demás). |
| `prefijo_anticipo_cliente` | Prefijo del anticipo de cliente generado (null si no aplica). |
| `id_anticipo_cliente` | Id del anticipo de cliente generado (ver api/anticipo_cliente; null si no aplica). |
| `responsable` | Usuario (correo) que creó la devolución de venta. |
| `nombre_responsable` | Nombres y apellidos del usuario que creó la devolución de venta (texto de responsable). |
| `observacion` | Observación de la devolución. |
| `est_contable` | Id del estado contable (1 = Sin comprobante contable, 2 = Comprobante contable en proceso, 3 = Comprobante contable exitoso, 4 = Comprobante contable fracasado, 5 = Comprobante contable anulado). |
| `estado_contable` | Nombre del estado contable (texto de est_contable). |
| `fecha_anular` | Fecha y hora de anulación, en UTC tal como está almacenada en la base de datos (null si está vigente). |
| `observacion_anular` | Observación registrada al anular (null si está vigente). |
| `responsable_anular` | Usuario (correo) que anuló la devolución de venta (null si está vigente). |
| `nombre_responsable_anular` | Nombres y apellidos del usuario que anuló la devolución de venta (texto de responsable_anular). |
| `vigente` | 1 si la devolución de venta está vigente; 0 si está anulada. |

### Ejemplo de respuesta

```json
{
  "ok": true,
  "data": [
    {
      "id": "26",
      "prefijo": "PPAL",
      "id_transaccion": "PPAL-26",
      "fecha_trans": "2026-10-16 03:17:37",
      "fecha_inicio_deuda": "2026-10-16",
      "sucursal": "1",
      "nombre_sucursal": "Principal",
      "centro_costos": "4",
      "nombre_centro_costos": "Centro de costos ejemplo",
      "bodega": "1",
      "nombre_bodega": "Principal",
      "cliente": "6447",
      "nombre_cliente": "Carlos Gómez",
      "dni_cliente": "2",
      "abreviacion": "CC",
      "id_cliente": "1030405060",
      "telefono_cliente": "3109876543",
      "pais_cliente": "47",
      "nombre_pais": "Colombia",
      "provincia_cliente": "789",
      "nombre_provincia": "Cundinamarca",
      "ciudad_cliente": "12688",
      "nombre_ciudad": "Bogotá D.C.",
      "direccion_cliente": "Carrera 15 # 93-60",
      "divisa": "COP",
      "trm": "1.0000",
      "bruto": "30000.0000",
      "descuento": "0.0000",
      "subtotal": "30000.0000",
      "impuestos": "5700.0000",
      "retefuente": "0.0000",
      "total": "35700.0000",
      "total_divisa": "35700.0000",
      "pdte_pago": "0.00",
      "est_c_x_p": "1",
      "estado": "Pago total",
      "dias_mora": "0",
      "valor_mora": "0.00",
      "sucursal_remision_v": "1",
      "nombre_sucursal_remision_v": "Principal",
      "prefijo_remision_v": "PPAL",
      "id_remision_v": "259",
      "t_destinacion": "1",
      "tipo_destinacion": "Abono en la remisión de venta asociada",
      "sucursal_anticipo_cliente": null,
      "prefijo_anticipo_cliente": null,
      "id_anticipo_cliente": null,
      "responsable": "usuario@empresa.com",
      "nombre_responsable": "Laura Martínez",
      "observacion": "Devolución de mercancía",
      "est_contable": "2",
      "estado_contable": "Comprobante contable en proceso",
      "fecha_anular": null,
      "observacion_anular": null,
      "responsable_anular": null,
      "nombre_responsable_anular": null,
      "vigente": "1"
    },
    {
      "id": "25",
      "prefijo": "PPAL",
      "id_transaccion": "PPAL-25",
      "fecha_trans": "2026-10-05 16:48:02",
      "fecha_inicio_deuda": "2026-10-05",
      "sucursal": "1",
      "nombre_sucursal": "Principal",
      "centro_costos": "4",
      "nombre_centro_costos": "Centro de costos ejemplo",
      "bodega": "1",
      "nombre_bodega": "Principal",
      "cliente": "7371",
      "nombre_cliente": "Ana Pérez",
      "dni_cliente": "2",
      "abreviacion": "CC",
      "id_cliente": "1020304050",
      "telefono_cliente": "3001234567",
      "pais_cliente": "47",
      "nombre_pais": "Colombia",
      "provincia_cliente": "776",
      "nombre_provincia": "Antioquia",
      "ciudad_cliente": "12601",
      "nombre_ciudad": "Medellín",
      "direccion_cliente": "Calle 10 # 20-30",
      "divisa": "COP",
      "trm": "1.0000",
      "bruto": "12000.0000",
      "descuento": "0.0000",
      "subtotal": "12000.0000",
      "impuestos": "2280.0000",
      "retefuente": "0.0000",
      "total": "14280.0000",
      "total_divisa": "14280.0000",
      "pdte_pago": "0.00",
      "est_c_x_p": "1",
      "estado": "Pago total",
      "dias_mora": "0",
      "valor_mora": "0.00",
      "sucursal_remision_v": "1",
      "nombre_sucursal_remision_v": "Principal",
      "prefijo_remision_v": "PPAL",
      "id_remision_v": "250",
      "t_destinacion": "1",
      "tipo_destinacion": "Abono en la remisión de venta asociada",
      "sucursal_anticipo_cliente": null,
      "prefijo_anticipo_cliente": null,
      "id_anticipo_cliente": null,
      "responsable": "usuario@empresa.com",
      "nombre_responsable": "Laura Martínez",
      "observacion": "Talla equivocada",
      "est_contable": "2",
      "estado_contable": "Comprobante contable en proceso",
      "fecha_anular": "2026-10-16 03:18:07",
      "observacion_anular": "Devolución registrada por error",
      "responsable_anular": "usuario@empresa.com",
      "nombre_responsable_anular": "Laura Martínez",
      "vigente": "0"
    }
  ],
  "paginacion": {
    "pagina": 1,
    "por_pagina": 100,
    "total": 26,
    "total_paginas": 1
  }
}
```

---

## <a id="nota_credito_v"></a>GET `api/nota_credito_v` — Consultar notas crédito de venta

Devuelve las notas crédito de venta de la empresa asociada a la API key con las mismas columnas de la tabla de consulta del web: id interno, prefijo e identificador visible (id_transaccion), fechas de creación y de devolución, sucursal, centro de costos y bodega, numeración de transacción (con el número prefijo_id_transaccion), datos del documento electrónico (ebill, CUDE, proveedor de facturación electrónica, clave de acceso y estados SRI, QR), cliente (con su tipo y número de identificación, teléfono, país, departamento, ciudad y dirección), divisa y TRM, valores (bruto, descuento, subtotal, impuestos, retenciones, total, total en divisa y saldo pendiente de pago al cliente), estado de la cuenta por pagar con días y valor de mora, factura de venta asociada (tipo, sucursal, prefijo, id y número de facturación), destinación del valor total y anticipo de cliente generado automáticamente cuando aplica, responsable, observación, estado contable, datos de anulación y vigencia; cada id de otra tabla va seguido de su nombre. La clave de una nota crédito es empresa + sucursal + id: el id se repite entre sucursales, así que para identificarla combine siempre sucursal e id. Igual que en el web, solo se listan las notas crédito de las sucursales autorizadas al usuario de la API key, de clientes cuya ruta logística tenga autorizada y, si el usuario tiene activada la marca "restringir clientes", solo las de sus clientes asignados. Los filtros son los mismos del bloque de búsqueda del módulo Notas crédito de venta del web (se llaman igual que las columnas): id, sucursal, bodega, centro_costos, desde, hasta, cliente, pais, provincia, ciudad, est_c_x_p, articulo, marca, categoria, cufe, est_contable, total_desde, total_hasta, responsable y vigente; además permite paginar. No se expone el filtro observacion (texto largo secundario). Si no se envía vigente se listan vigentes y anuladas (como el web con "Seleccionar..."); vigente=1 lista solo las vigentes y vigente=0 solo las anuladas. Requiere permiso de consulta sobre la función: Notas crédito de venta.

Ejemplo: `GET api/nota_credito_v?desde=2026-01-01&hasta=2026-12-31&pagina=1&por_pagina=100`

### Parámetros

| Nombre | Tipo | Req. | Descripción |
|---|---|---|---|
| `id` | integer |  | Filtrar por el id interno de la nota crédito de venta. El id se repite entre sucursales (la clave es empresa + sucursal + id): combínelo con sucursal. |
| `sucursal` | integer |  | Filtrar por el id de la sucursal de la nota crédito de venta (ver api/sucursal). Solo se listan las sucursales autorizadas al usuario de la API key. En el web es una lista desplegable dinámica. |
| `bodega` | integer |  | Filtrar por el id de la bodega (ver api/bodega). En el web es una lista desplegable dinámica que depende de la sucursal. |
| `centro_costos` | integer |  | Filtrar por el id del centro de costos (ver api/centro_costos). En el web es una lista desplegable dinámica. |
| `desde` | date |  | Fecha de creación (fecha_trans) mayor o igual a la indicada. Formato YYYY-MM-DD o YYYY-MM-DD HH:MM:SS, interpretada en la zona horaria de la empresa. |
| `hasta` | date |  | Fecha de creación (fecha_trans) menor o igual a la indicada. Formato YYYY-MM-DD o YYYY-MM-DD HH:MM:SS, interpretada en la zona horaria de la empresa. |
| `cliente` | integer |  | Filtrar por el código del tercero cliente (columna cliente; campo tercero de api/cliente). En el web se elige con el buscador de clientes. |
| `pais` | integer |  | Filtrar por el id del país del cliente (columna pais_cliente; ver api/pais). |
| `provincia` | integer |  | Filtrar por el id del departamento/provincia del cliente (columna provincia_cliente; ver api/provincia). |
| `ciudad` | integer |  | Filtrar por el id de la ciudad del cliente (columna ciudad_cliente; ver api/ciudad). |
| `est_c_x_p` | integer |  | Filtrar por el id del estado de la cuenta por pagar al cliente (saldo de la nota crédito de venta pendiente de aplicar). Valores: `1` Pago total, `2` Pendiente de pago al día, `3` Pendiente de pago vencido |
| `articulo` | integer |  | Filtrar por el id de un artículo incluido en los conceptos de la nota crédito de venta (ver api/articulo). Es solo un filtro: no se devuelve como campo. |
| `marca` | integer |  | Filtrar por el id de la marca de algún artículo incluido en los conceptos (ver api/marca_articulo). Es solo un filtro: no se devuelve como campo. En el web es una lista desplegable dinámica. |
| `categoria` | integer |  | Filtrar por el id de la categoría de algún artículo incluido en los conceptos (ver api/categoria_articulo). Es solo un filtro: no se devuelve como campo. En el web es una lista desplegable dinámica. |
| `cufe` | integer |  | Filtrar por autorización electrónica: 1 solo documentos con CUFE/CUDE (documento electrónico autorizado); 0 solo documentos sin CUFE. Valores: `1` Si, `0` No |
| `est_contable` | integer |  | Filtrar por el id del estado contable de la nota crédito de venta. En el web es una lista desplegable dinámica (1 = Sin comprobante contable, 2 = Comprobante contable en proceso, 3 = Comprobante contable exitoso, 4 = Comprobante contable fracasado, 5 = Comprobante contable anulado). |
| `total_desde` | decimal |  | Total mayor o igual al indicado (rango numérico; combinar con total_hasta). |
| `total_hasta` | decimal |  | Total menor o igual al indicado (rango numérico; combinar con total_desde). |
| `responsable` | string |  | Filtrar por el usuario (correo) que creó la nota crédito de venta. En el web es una lista desplegable dinámica de los usuarios de la empresa. |
| `vigente` | integer |  | Si no se envía se listan vigentes y anuladas (como el web con "Seleccionar..."). Enviar vigente=1 para listar solo las vigentes o vigente=0 para listar solo las anuladas. Valores: `1` Vigente, `0` Anulada |
| `pagina` | integer |  | Número de página. Por defecto 1. |
| `por_pagina` | integer |  | Registros por página. Por defecto 100, máximo 100. |

### Campos de respuesta

| Campo | Descripción |
|---|---|
| `id` | Identificador interno de la nota crédito de venta. Se repite entre sucursales: la clave única es empresa + sucursal + id. |
| `prefijo` | Prefijo de la transacción en la sucursal. |
| `id_transaccion` | Identificador visible prefijo-id, como en el ERP. |
| `fecha_trans` | Fecha y hora de creación de la nota crédito, en UTC tal como está almacenada en la base de datos. |
| `fecha_inicio_deuda` | Fecha de devolución (YYYY-MM-DD): fecha del documento desde la que se cuenta la deuda con el cliente. |
| `sucursal` | Id de la sucursal. |
| `nombre_sucursal` | Nombre de la sucursal (texto de sucursal). |
| `centro_costos` | Id del centro de costos. |
| `nombre_centro_costos` | Nombre del centro de costos (texto de centro_costos). |
| `bodega` | Id de la bodega. |
| `nombre_bodega` | Nombre de la bodega (texto de bodega). |
| `res_transaccion` | Id de la numeración de transacción con la que se emitió la nota (null si no tiene; ver api/res_facturacion). |
| `prefijo_id_transaccion` | Número de la nota según su numeración, con prefijo, separador y ceros, como en el ERP, p. ej. NC-15 (null si no tiene numeración). |
| `ebill` | 1 si la nota es un documento electrónico; 0 si no. |
| `cufe` | CUDE del documento electrónico autorizado (null si no tiene). |
| `t_ebill` | Id del proveedor de facturación electrónica de la empresa (null si no tiene). |
| `clave_acceso_sri` | Clave de acceso del comprobante electrónico en el SRI (Ecuador; null si no aplica). |
| `est_autorizacion_sri` | Estado de autorización del comprobante electrónico en el SRI (Ecuador) o número DTE (Guatemala); null si no aplica. |
| `est_validacion_sri` | Estado de validación del comprobante electrónico en el SRI (Ecuador) o serie del DTE (Guatemala); null si no aplica. |
| `data_qr_ebill` | URL o datos del código QR del documento electrónico (null si no aplica). |
| `cliente` | Código del tercero cliente (campo tercero de api/cliente). |
| `nombre_cliente` | Nombre del cliente (texto de cliente). |
| `dni_cliente` | Id del tipo de documento de identidad del cliente (t_dni). |
| `abreviacion` | Abreviatura del tipo de documento del cliente (texto de dni_cliente), ej. NIT, CC. |
| `id_cliente` | Número de identificación del cliente. |
| `telefono_cliente` | Teléfono del cliente. |
| `pais_cliente` | Id del país del cliente (null si no tiene dirección). |
| `nombre_pais` | Nombre del país (texto de pais_cliente). |
| `provincia_cliente` | Id del departamento/provincia del cliente. |
| `nombre_provincia` | Nombre del departamento/provincia (texto de provincia_cliente). |
| `ciudad_cliente` | Id de la ciudad del cliente. |
| `nombre_ciudad` | Nombre de la ciudad (texto de ciudad_cliente). |
| `direccion_cliente` | Dirección del cliente. |
| `divisa` | Código ISO de la divisa de la nota crédito de venta (ej. COP, USD). |
| `trm` | Tasa de cambio aplicada entre la divisa de la nota crédito de venta y la moneda de la empresa (1 si es la misma moneda). |
| `bruto` | Valor bruto de la nota crédito de venta (suma de los conceptos antes de descuentos e impuestos). |
| `descuento` | Valor del descuento de la nota crédito de venta. |
| `subtotal` | Valor subtotal de la nota crédito de venta (bruto menos descuento). |
| `impuestos` | Valor de los impuestos de la nota crédito de venta. |
| `retefuente` | Valor de las retenciones de la nota crédito de venta. |
| `total` | Valor total de la nota crédito de venta en la moneda de la empresa. |
| `total_divisa` | Valor total de la nota crédito de venta expresado en su divisa. |
| `pdte_pago` | Saldo pendiente de pago al cliente de la nota crédito de venta (0 cuando el valor ya fue abonado, convertido en anticipo o devuelto en dinero). |
| `est_c_x_p` | Id del estado de la cuenta por pagar (1 = Pago total, 2 = Pendiente de pago al día, 3 = Pendiente de pago vencido). |
| `estado` | Nombre del estado de la cuenta por pagar (texto de est_c_x_p). |
| `dias_mora` | Días de mora de la cuenta por pagar (0 si está al día o pagada). |
| `valor_mora` | Valor en mora de la cuenta por pagar (0 si está al día o pagada). |
| `t_trans_ref` | Id del tipo de documento de venta asociado (1 = Factura de venta). |
| `tipo_trans_ref` | Nombre del tipo de documento asociado (texto de t_trans_ref). |
| `sucursal_ref` | Sucursal de la factura de venta asociada. |
| `nombre_sucursal_ref` | Nombre de la sucursal de la factura asociada (texto de sucursal_ref). |
| `prefijo_ref` | Prefijo de la factura de venta asociada. |
| `id_trans_ref` | Id interno de la factura de venta asociada (campo id de GET api/factura_v; la clave es empresa + sucursal + id). |
| `id_facturacion` | Número consecutivo de la factura asociada dentro de su numeración. |
| `prefijo_id_facturacion` | Número de facturación de la factura asociada con prefijo y separador, como en el ERP, p. ej. FE-154. |
| `t_destinacion` | Id de la destinación del valor total (1 = Abono en el documento de venta asociado, 2 = Anticipo a favor del cliente, 3 = Devolución de dinero al cliente). |
| `tipo_destinacion` | Nombre de la destinación (texto de t_destinacion). |
| `sucursal_anticipo_cliente` | Sucursal del anticipo de cliente generado automáticamente cuando la destinación es 2 (null en las demás). |
| `prefijo_anticipo_cliente` | Prefijo del anticipo de cliente generado (null si no aplica). |
| `id_anticipo_cliente` | Id del anticipo de cliente generado (ver api/anticipo_cliente; null si no aplica). |
| `responsable` | Usuario (correo) que creó la nota crédito de venta. |
| `nombre_responsable` | Nombres y apellidos del usuario que creó la nota crédito de venta (texto de responsable). |
| `observacion` | Observación de la nota crédito. |
| `est_contable` | Id del estado contable (1 = Sin comprobante contable, 2 = Comprobante contable en proceso, 3 = Comprobante contable exitoso, 4 = Comprobante contable fracasado, 5 = Comprobante contable anulado). |
| `estado_contable` | Nombre del estado contable (texto de est_contable). |
| `fecha_anular` | Fecha y hora de anulación, en UTC tal como está almacenada en la base de datos (null si está vigente). |
| `observacion_anular` | Observación registrada al anular (null si está vigente). |
| `responsable_anular` | Usuario (correo) que anuló la nota crédito de venta (null si está vigente). |
| `nombre_responsable_anular` | Nombres y apellidos del usuario que anuló la nota crédito de venta (texto de responsable_anular). |
| `vigente` | 1 si la nota crédito de venta está vigente; 0 si está anulada. |

### Ejemplo de respuesta

```json
{
  "ok": true,
  "data": [
    {
      "id": "345",
      "prefijo": "PPAL",
      "id_transaccion": "PPAL-345",
      "fecha_trans": "2026-10-16 03:17:31",
      "fecha_inicio_deuda": "2026-10-16",
      "sucursal": "1",
      "nombre_sucursal": "Principal",
      "centro_costos": "4",
      "nombre_centro_costos": "Centro de costos ejemplo",
      "bodega": "1",
      "nombre_bodega": "Principal",
      "res_transaccion": null,
      "prefijo_id_transaccion": null,
      "ebill": "0",
      "cufe": null,
      "t_ebill": null,
      "clave_acceso_sri": null,
      "est_autorizacion_sri": null,
      "est_validacion_sri": null,
      "data_qr_ebill": null,
      "cliente": "7371",
      "nombre_cliente": "Ana Pérez",
      "dni_cliente": "2",
      "abreviacion": "CC",
      "id_cliente": "1020304050",
      "telefono_cliente": "3001234567",
      "pais_cliente": "47",
      "nombre_pais": "Colombia",
      "provincia_cliente": "776",
      "nombre_provincia": "Antioquia",
      "ciudad_cliente": "12601",
      "nombre_ciudad": "Medellín",
      "direccion_cliente": "Calle 10 # 20-30",
      "divisa": "COP",
      "trm": "1.0000",
      "bruto": "20000.0000",
      "descuento": "0.0000",
      "subtotal": "20000.0000",
      "impuestos": "3800.0000",
      "retefuente": "0.0000",
      "total": "23800.0000",
      "total_divisa": "23800.0000",
      "pdte_pago": "0.00",
      "est_c_x_p": "1",
      "estado": "Pago total",
      "dias_mora": "0",
      "valor_mora": "0.00",
      "t_trans_ref": "1",
      "tipo_trans_ref": "FACTURA DE VENTA",
      "sucursal_ref": "1",
      "nombre_sucursal_ref": "Principal",
      "prefijo_ref": "PPAL",
      "id_trans_ref": "9057",
      "id_facturacion": "154",
      "prefijo_id_facturacion": "FE-154",
      "t_destinacion": "1",
      "tipo_destinacion": "Abono en el documento de venta asociado",
      "sucursal_anticipo_cliente": null,
      "prefijo_anticipo_cliente": null,
      "id_anticipo_cliente": null,
      "responsable": "usuario@empresa.com",
      "nombre_responsable": "Laura Martínez",
      "observacion": "Devolución parcial",
      "est_contable": "2",
      "estado_contable": "Comprobante contable en proceso",
      "fecha_anular": null,
      "observacion_anular": null,
      "responsable_anular": null,
      "nombre_responsable_anular": null,
      "vigente": "1"
    },
    {
      "id": "344",
      "prefijo": "PPAL",
      "id_transaccion": "PPAL-344",
      "fecha_trans": "2026-10-09 15:02:10",
      "fecha_inicio_deuda": "2026-10-09",
      "sucursal": "1",
      "nombre_sucursal": "Principal",
      "centro_costos": "4",
      "nombre_centro_costos": "Centro de costos ejemplo",
      "bodega": "1",
      "nombre_bodega": "Principal",
      "res_transaccion": null,
      "prefijo_id_transaccion": null,
      "ebill": "0",
      "cufe": null,
      "t_ebill": null,
      "clave_acceso_sri": null,
      "est_autorizacion_sri": null,
      "est_validacion_sri": null,
      "data_qr_ebill": null,
      "cliente": "6447",
      "nombre_cliente": "Carlos Gómez",
      "dni_cliente": "2",
      "abreviacion": "CC",
      "id_cliente": "1030405060",
      "telefono_cliente": "3109876543",
      "pais_cliente": "47",
      "nombre_pais": "Colombia",
      "provincia_cliente": "789",
      "nombre_provincia": "Cundinamarca",
      "ciudad_cliente": "12688",
      "nombre_ciudad": "Bogotá D.C.",
      "direccion_cliente": "Carrera 15 # 93-60",
      "divisa": "COP",
      "trm": "1.0000",
      "bruto": "50000.0000",
      "descuento": "0.0000",
      "subtotal": "50000.0000",
      "impuestos": "9500.0000",
      "retefuente": "0.0000",
      "total": "59500.0000",
      "total_divisa": "59500.0000",
      "pdte_pago": "0.00",
      "est_c_x_p": "1",
      "estado": "Pago total",
      "dias_mora": "0",
      "valor_mora": "0.00",
      "t_trans_ref": "1",
      "tipo_trans_ref": "FACTURA DE VENTA",
      "sucursal_ref": "1",
      "nombre_sucursal_ref": "Principal",
      "prefijo_ref": "PPAL",
      "id_trans_ref": "9040",
      "id_facturacion": "140",
      "prefijo_id_facturacion": "FE-140",
      "t_destinacion": "1",
      "tipo_destinacion": "Abono en el documento de venta asociado",
      "sucursal_anticipo_cliente": null,
      "prefijo_anticipo_cliente": null,
      "id_anticipo_cliente": null,
      "responsable": "usuario@empresa.com",
      "nombre_responsable": "Laura Martínez",
      "observacion": "Producto con garantía",
      "est_contable": "2",
      "estado_contable": "Comprobante contable en proceso",
      "fecha_anular": "2026-10-16 03:18:07",
      "observacion_anular": "Devolución registrada por error",
      "responsable_anular": "usuario@empresa.com",
      "nombre_responsable_anular": "Laura Martínez",
      "vigente": "0"
    }
  ],
  "paginacion": {
    "pagina": 1,
    "por_pagina": 100,
    "total": 345,
    "total_paginas": 4
  }
}
```

---

## <a id="est_orden_v_empresa"></a>GET `api/est_orden_v` — Consultar estados de orden de venta

Devuelve los estados de orden de venta vigentes de la empresa asociada a la API key (id, estado y vigencia). Permite filtrar por id, por estado, por vigente y paginar. Los nombres de los filtros son los mismos de las columnas, igual que en el web. Por defecto solo se listan los vigentes; enviando vigente=0 se listan los anulados. Requiere permiso de consulta sobre la función: Tablas maestras.

Ejemplo: `GET api/est_orden_v?pagina=1&por_pagina=100`

### Parámetros

| Nombre | Tipo | Req. | Descripción |
|---|---|---|---|
| `id` | integer |  | Filtrar por el id de un estado específico. |
| `estado` | string |  | Filtrar por coincidencia parcial del nombre del estado, sin distinguir mayúsculas (ej. "confirm" devuelve los estados de confirmación). |
| `vigente` | integer |  | Si no se envía se listan solo los estados vigentes. Enviar vigente=0 para listar los anulados. Valores: `1` Vigente, `0` Anulada |
| `pagina` | integer |  | Número de página. Por defecto 1. |
| `por_pagina` | integer |  | Registros por página. Por defecto 100, máximo 100. |

### Campos de respuesta

| Campo | Descripción |
|---|---|
| `id` | Identificador del estado de orden de venta (propio de la empresa). |
| `estado` | Nombre del estado (ej. Confirmación exitosa, Confirmación rechazada). |
| `vigente` | 1 si el estado está vigente; 0 si está anulado. |

### Ejemplo de respuesta

```json
{
  "ok": true,
  "data": [
    {
      "id": "6",
      "estado": "Confirmación rechazada",
      "vigente": "1"
    },
    {
      "id": "5",
      "estado": "Confirmación exitosa",
      "vigente": "1"
    }
  ],
  "paginacion": {
    "pagina": 1,
    "por_pagina": 100,
    "total": 6,
    "total_paginas": 1
  }
}
```

---

## <a id="est_guia_efficommerce"></a>GET `api/est_guia_efficommerce` — Consultar estados de guía Efficommerce

Devuelve la lista de estados de guía Efficommerce (tabla global, no depende de la empresa de la API key): id, nombre del estado y si es un estado final. Permite filtrar por id, por estado, por estado_final y paginar. Los nombres de los filtros son los mismos de las columnas, igual que en el web. No existe filtro vigente porque la tabla no tiene esa columna: se devuelven todos los estados. Requiere permiso de consulta sobre la función: Tablas maestras.

Ejemplo: `GET api/est_guia_efficommerce?pagina=1&por_pagina=100`

### Parámetros

| Nombre | Tipo | Req. | Descripción |
|---|---|---|---|
| `id` | integer |  | Filtrar por el id de un estado de guía específico. |
| `estado` | string |  | Filtrar por coincidencia parcial del nombre del estado, sin distinguir mayúsculas (ej. "entre" devuelve Entregada a destino). |
| `estado_final` | integer |  | Filtrar por la marca de estado final de la guía: estado_final=1 lista solo los estados finales y estado_final=0 solo los no finales. Si no se envía se listan todos. Valores: `1` Si, `0` No |
| `pagina` | integer |  | Número de página. Por defecto 1. |
| `por_pagina` | integer |  | Registros por página. Por defecto 100, máximo 100. |

### Campos de respuesta

| Campo | Descripción |
|---|---|
| `id` | Identificador del estado de guía Efficommerce. |
| `estado` | Nombre del estado de la guía. |
| `estado_final` | 1 si es un estado final de la guía; 0 si no. |

### Ejemplo de respuesta

```json
{
  "ok": true,
  "data": [
    {
      "id": "1",
      "estado": "Generada",
      "estado_final": "0"
    },
    {
      "id": "2",
      "estado": "En transito",
      "estado_final": "0"
    }
  ],
  "paginacion": {
    "pagina": 1,
    "por_pagina": 100,
    "total": 9,
    "total_paginas": 1
  }
}
```

---

## <a id="transportadora_efficommerce"></a>GET `api/transportadora_efficommerce` — Consultar transportadoras Efficommerce

Devuelve la lista de transportadoras Efficommerce vigentes (tabla global, no depende de la empresa de la API key): id, nombre, país, divisa y vigencia. Permite filtrar por id, por nombre, por pais, por divisa, por vigente y paginar. Los nombres de los filtros son los mismos de las columnas, igual que en el web. Por defecto solo se listan las vigentes; enviando vigente=0 se listan las anuladas. Requiere permiso de consulta sobre la función: Tablas maestras.

Ejemplo: `GET api/transportadora_efficommerce?pais=47&pagina=1&por_pagina=100`

### Parámetros

| Nombre | Tipo | Req. | Descripción |
|---|---|---|---|
| `id` | integer |  | Filtrar por el id de una transportadora específica. |
| `nombre` | string |  | Filtrar por coincidencia parcial del nombre de la transportadora, sin distinguir mayúsculas (ej. "coord" devuelve COORDINADORA). |
| `pais` | integer |  | Filtrar las transportadoras de un país (id del país, ver api/pais). En el web es una lista desplegable de países. |
| `divisa` | string |  | Filtrar las transportadoras que operan en una divisa (código ISO de la moneda, coincidencia exacta, ej. COP, CRC, DOP). En el web es una lista desplegable de monedas. |
| `vigente` | integer |  | Si no se envía se listan solo las transportadoras vigentes. Enviar vigente=0 para listar las anuladas. Valores: `1` Vigente, `0` Anulada |
| `pagina` | integer |  | Número de página. Por defecto 1. |
| `por_pagina` | integer |  | Registros por página. Por defecto 100, máximo 100. |

### Campos de respuesta

| Campo | Descripción |
|---|---|
| `id` | Identificador de la transportadora Efficommerce. |
| `nombre` | Nombre de la transportadora. |
| `pais` | Id del país en el que opera la transportadora. |
| `nombre_pais` | Nombre del país (texto de pais). |
| `divisa` | Código ISO de la moneda en la que opera la transportadora (ej. COP). |
| `nombre_divisa` | Nombre de la moneda (texto de divisa). |
| `vigente` | 1 si la transportadora está vigente; 0 si está anulada. |

### Ejemplo de respuesta

```json
{
  "ok": true,
  "data": [
    {
      "id": "13",
      "nombre": "TCC",
      "pais": "47",
      "nombre_pais": "Colombia",
      "divisa": "COP",
      "nombre_divisa": "Peso Colombiano",
      "vigente": "1"
    },
    {
      "id": "6",
      "nombre": "COORDINADORA",
      "pais": "47",
      "nombre_pais": "Colombia",
      "divisa": "COP",
      "nombre_divisa": "Peso Colombiano",
      "vigente": "1"
    }
  ],
  "paginacion": {
    "pagina": 1,
    "por_pagina": 100,
    "total": 7,
    "total_paginas": 1
  }
}
```

---

## <a id="transportadora"></a>GET `api/transportadora` — Consultar transportadoras

Devuelve las transportadoras configuradas en la empresa asociada a la API key (propias o con convenio Effi) con las mismas columnas de la tabla de consulta del web: id, nombre, transportadora Effi asociada (con su nombre; null si es una transportadora propia) y vigencia, y al final de cada transportadora tres listas con su configuración: estados (los estados de guía de la transportadora con su estado global Effi equivalente), t_servicio (tipos de servicio) y t_forma_pago (formas de pago del flete). Nunca se devuelven las credenciales de integración (url, cuenta, usuario, contraseña, api key). Se listan de la más reciente a la más antigua por fecha de creación (las anuladas, por fecha de anulación). Los filtros son los mismos del bloque de búsqueda del módulo Transportadoras del web (se llaman igual que las columnas): id, nombre, transportadora_efficommerce y vigente; además permite paginar. Por defecto solo se listan las vigentes; enviando vigente=0 se listan las anuladas. Requiere permiso de consulta sobre la función: Transportadoras.

Ejemplo: `GET api/transportadora?pagina=1&por_pagina=100`

### Parámetros

| Nombre | Tipo | Req. | Descripción |
|---|---|---|---|
| `id` | integer |  | Filtrar por el id de la transportadora (máximo 7 dígitos). |
| `nombre` | string |  | Filtrar por coincidencia parcial del nombre de la transportadora, sin distinguir mayúsculas (máximo 40 caracteres). |
| `transportadora_efficommerce` | integer |  | Filtrar por el id de la transportadora Effi asociada (ver api/transportadora_efficommerce). En el web es una lista desplegable dinámica. |
| `vigente` | integer |  | Si no se envía se listan solo las transportadoras vigentes. Enviar vigente=0 para listar las anuladas. Valores: `1` Vigente, `0` Anulada |
| `pagina` | integer |  | Número de página. Por defecto 1. |
| `por_pagina` | integer |  | Registros por página. Por defecto 100, máximo 100. |

### Campos de respuesta

| Campo | Descripción |
|---|---|
| `id` | Identificador de la transportadora en la empresa (clave empresa + id). |
| `nombre` | Nombre de la transportadora. |
| `transportadora_efficommerce` | Id de la transportadora Effi asociada (convenio Effi); null si es una transportadora propia. |
| `nombre_transportadora_efficommerce` | Nombre de la transportadora Effi (texto de transportadora_efficommerce). |
| `vigente` | 1 si la transportadora está vigente; 0 si está anulada. |
| `estados` | Lista de los estados de guía configurados en la transportadora (est_guia_transportadora). Cada elemento: id (id del estado en la transportadora, el que llega en los cambios de estado de guía), estado (nombre), estado_final (1 si el estado cierra la guía; 0 si no), est_guia_efficommerce (id del estado global Effi equivalente) y estado_guia_efficommerce (nombre del estado global Effi, texto de est_guia_efficommerce). |
| `t_servicio` | Lista de los tipos de servicio de la transportadora (t_servicio_transportadora). Cada elemento: id (id del servicio en la transportadora, el que se usa en t_servicio de las guías) y tipo (nombre del servicio). |
| `t_forma_pago` | Lista de las formas de pago del flete de la transportadora (t_forma_pago_transportadora). Cada elemento: id (el que se usa en t_forma_pago de las guías) y tipo (nombre de la forma de pago). |

### Ejemplo de respuesta

```json
{
  "ok": true,
  "data": [
    {
      "id": "137",
      "nombre": "LOGÍSTICA EFFI | CON RECAUDO | FLETE CRÉDITO",
      "transportadora_efficommerce": "2",
      "nombre_transportadora_efficommerce": "LOGÍSTICA EFFICOMMERCE",
      "vigente": "1",
      "estados": [
        {
          "id": "1",
          "estado": "Generada",
          "estado_final": "0",
          "est_guia_efficommerce": "1",
          "estado_guia_efficommerce": "Generada"
        },
        {
          "id": "2",
          "estado": "En alistamiento",
          "estado_final": "0",
          "est_guia_efficommerce": "1",
          "estado_guia_efficommerce": "Generada"
        },
        {
          "id": "8",
          "estado": "Entregada",
          "estado_final": "1",
          "est_guia_efficommerce": "4",
          "estado_guia_efficommerce": "Entregada"
        }
      ],
      "t_servicio": [
        {
          "id": "1",
          "tipo": "Paquete terrestre local (1Kg-3Kg)"
        },
        {
          "id": "3",
          "tipo": "Mercancía terrestre local (4Kg-50Kg)"
        }
      ],
      "t_forma_pago": [
        {
          "id": "1",
          "tipo": "Crédito"
        }
      ]
    },
    {
      "id": "136",
      "nombre": "LOGÍSTICA EFFI | SIN RECAUDO | FLETE CRÉDITO",
      "transportadora_efficommerce": "2",
      "nombre_transportadora_efficommerce": "LOGÍSTICA EFFICOMMERCE",
      "vigente": "1",
      "estados": [
        {
          "id": "1",
          "estado": "Generada",
          "estado_final": "0",
          "est_guia_efficommerce": "1",
          "estado_guia_efficommerce": "Generada"
        },
        {
          "id": "8",
          "estado": "Entregada",
          "estado_final": "1",
          "est_guia_efficommerce": "4",
          "estado_guia_efficommerce": "Entregada"
        }
      ],
      "t_servicio": [
        {
          "id": "1",
          "tipo": "Paquete terrestre local (1Kg-3Kg)"
        }
      ],
      "t_forma_pago": [
        {
          "id": "1",
          "tipo": "Crédito"
        }
      ]
    }
  ],
  "paginacion": {
    "pagina": 1,
    "por_pagina": 100,
    "total": 15,
    "total_paginas": 1
  }
}
```

---

## <a id="cliente"></a>GET `api/cliente` — Consultar clientes

Devuelve los clientes de la empresa asociada a la API key (tabla cliente junto con los datos del tercero) con las mismas columnas de la tabla de consulta del web: código del tercero, sucursal, foto, nombre, tipo y número de identificación con su dígito de verificación (solo NIT), teléfonos, celular, WhatsApp, FaceTime, correo, forma de pago, tarifa de precios, cupo de crédito, saldo pendiente de cobro, tipo de marketing, responsable asignado, vendedor, fecha de nacimiento, género, tipo de persona, régimen tributario, tipo de cliente, actividad económica, moneda, ruta logística, fecha de creación y vigencia; cada id de otra tabla va seguido de su nombre. La clave de un cliente es empresa + tercero: id es el número de identificación, no un consecutivo. Igual que en el web, solo se listan los clientes de sucursales y rutas logísticas autorizadas al usuario de la API key y, si el usuario tiene restringir clientes, solo sus clientes asignados. Al final de cada cliente se devuelve el array direcciones con todas sus direcciones registradas (direccion_tercero, relación 1:N: id, id_pais, pais, id_provincia, provincia, id_ciudad, ciudad, direccion, referencia); el array es solo de consulta: los POST api/orden_v, api/remision_v, api/factura_v y api/guia_transporte nunca reciben el id de una dirección, reciben la dirección como datos (país, departamento/provincia, ciudad, dirección y referencia) y la reutilizan si el tercero ya la tiene registrada o la crean en sus direcciones. No se devuelven adjuntos, observación, responsables ni la relación con empresas de Effi. Se listan por código de tercero descendente (los anulados, por fecha de anulación). Los filtros son los mismos del bloque de búsqueda del módulo Clientes del web (se llaman igual que las columnas): t_dni, numero, nombre, t_marketing, responsable_asignado, vendedor, telefono1, telefono2, celular, whatsapp, fecha_nacimiento, fecha_nacimiento_hasta, pais, provincia y ciudad (sobre las direcciones del cliente), genero, t_persona, t_regimen_iva, ciiu, t_forma_pago, divisa, sucursal, ruta_logistica, t_precio, desde, hasta y vigente; además permite paginar. Por defecto solo se listan los vigentes; enviando vigente=0 se listan los anulados. Requiere permiso de consulta sobre la función: Clientes.

Ejemplo: `GET api/cliente?pagina=1&por_pagina=100`

### Parámetros

| Nombre | Tipo | Req. | Descripción |
|---|---|---|---|
| `t_dni` | integer |  | Filtrar por el id del tipo de documento de identidad (t_dni). En el web es una lista desplegable dinámica (ej. 1 = NIT, 2 = Cédula de ciudadanía, 3 = Pasaporte). |
| `numero` | string |  | Número de identificación exacto (columna id del tercero), máximo 20 caracteres. |
| `nombre` | string |  | Palabras clave separadas por espacio; cada palabra debe estar contenida en el nombre o razón social (máximo 60 caracteres). |
| `t_marketing` | integer |  | Filtrar por el id del tipo de marketing (ver api/t_marketing). En el web es una lista desplegable dinámica. |
| `responsable_asignado` | string |  | Filtrar por el usuario (correo) responsable asignado al cliente. En el web es una lista desplegable dinámica de los usuarios de la empresa. |
| `vendedor` | integer |  | Filtrar por el código del tercero (empleado) vendedor asignado al cliente. En el web es una lista desplegable dinámica de los empleados vendedores. |
| `telefono1` | string |  | Coincidencia parcial sobre el teléfono 1 (telefono_1), máximo 15 caracteres. |
| `telefono2` | string |  | Coincidencia parcial sobre el teléfono 2 (telefono_2), máximo 15 caracteres. |
| `celular` | string |  | Coincidencia parcial sobre el celular, máximo 15 caracteres. |
| `whatsapp` | string |  | Coincidencia parcial sobre el número de WhatsApp (solo dígitos), máximo 15 caracteres. |
| `fecha_nacimiento` | string |  | Cumpleaños desde: mes y día de la fecha de nacimiento (formato MM-DD, sin año) mayor o igual al indicado. Combinar con fecha_nacimiento_hasta para listar los cumpleaños de un rango. |
| `fecha_nacimiento_hasta` | string |  | Cumpleaños hasta: mes y día de la fecha de nacimiento (formato MM-DD, sin año) menor o igual al indicado. Combinar con fecha_nacimiento. |
| `pais` | integer |  | Filtrar por el id del país de alguna de las direcciones del cliente (ver api/pais). En el web es una lista desplegable dinámica. |
| `provincia` | integer |  | Filtrar por el id del departamento/provincia de alguna de las direcciones del cliente (ver api/provincia). En el web depende del país seleccionado. |
| `ciudad` | integer |  | Filtrar por el id de la ciudad de alguna de las direcciones del cliente (ver api/ciudad). En el web depende del departamento seleccionado. Igual que en el web, se compara por coincidencia parcial del id, por lo que conviene combinarlo con provincia. |
| `genero` | string |  | Filtrar por el género del cliente. Valores: `F` Femenino, `M` Masculino |
| `t_persona` | integer |  | Filtrar por el id del tipo de persona (1 = Física (natural), 2 = Jurídica (moral)). En el web es una lista desplegable dinámica. |
| `t_regimen_iva` | integer |  | Filtrar por el id del régimen tributario. En el web es una lista desplegable dinámica (ej. 4 = Régimen ordinario Responsable de IVA, 5 = Régimen ordinario No responsable de IVA). |
| `ciiu` | string |  | Filtrar por el código CIIU de la actividad económica (columna ciiu). En el web es una lista desplegable dinámica. |
| `t_forma_pago` | integer |  | Filtrar por el id de la forma de pago por defecto (ver api/forma_pago). En el web es una lista desplegable dinámica. |
| `divisa` | string |  | Código ISO de la moneda (ej. COP, USD). En el web es una lista desplegable dinámica. |
| `sucursal` | integer |  | Filtrar por el id de la sucursal asociada al cliente (ver api/sucursal). En el web es una lista desplegable dinámica. |
| `ruta_logistica` | integer |  | Filtrar por el id de la ruta logística asignada al cliente (ver api/ruta_logistica); combinar con sucursal porque la clave de la ruta es sucursal + id. En el web depende de la sucursal seleccionada. |
| `t_precio` | integer |  | Filtrar por el id de la tarifa de precios asignada (ver api/tarifa_precio). En el web es una lista desplegable dinámica. |
| `desde` | date |  | Fecha de creación (fecha_trans) mayor o igual a la indicada. Formato YYYY-MM-DD o YYYY-MM-DD HH:MM:SS, interpretada en la zona horaria de la empresa. |
| `hasta` | date |  | Fecha de creación (fecha_trans) menor o igual a la indicada. Formato YYYY-MM-DD o YYYY-MM-DD HH:MM:SS, interpretada en la zona horaria de la empresa. |
| `vigente` | integer |  | Si no se envía se listan solo los vigentes. Enviar vigente=0 para listar los anulados. Valores: `1` Vigente, `0` Anulado |
| `pagina` | integer |  | Número de página. Por defecto 1. |
| `por_pagina` | integer |  | Registros por página. Por defecto 100, máximo 100. |

### Campos de respuesta

| Campo | Descripción |
|---|---|
| `tercero` | Código interno del tercero en la empresa (clave empresa + tercero). Es el valor que reciben los filtros cliente/tercero de los demás recursos. |
| `sucursal` | Id de la sucursal a la que está asociado el cliente (null si no está restringido a una sucursal). |
| `nombre_sucursal` | Nombre de la sucursal (texto de sucursal). |
| `url_foto` | URL de la foto del cliente (null si no tiene). |
| `nombre` | Nombre o razón social del cliente. |
| `t_dni` | Id del tipo de documento de identidad (t_dni). |
| `tipo_dni` | Nombre del tipo de documento (texto de t_dni). |
| `abreviacion` | Abreviatura del tipo de documento (texto de t_dni), ej. NIT, CC. |
| `id` | Número de identificación del cliente (no es un consecutivo; la clave es empresa + tercero). |
| `dv` | Dígito de verificación del NIT, calculado como en el web (no es una columna); null cuando el tipo de documento no es NIT. Se devuelve como número. |
| `telefono_1` | Teléfono 1. |
| `ref_tel_1` | Referencia o descripción del teléfono 1. |
| `telefono_2` | Teléfono 2. |
| `ref_tel_2` | Referencia o descripción del teléfono 2. |
| `celular` | Número de celular. |
| `whatsapp` | Número de WhatsApp. |
| `facetime` | Contacto de FaceTime. |
| `email` | Correo(s) electrónico(s), separados por coma si hay varios. |
| `t_forma_pago` | Id de la forma de pago por defecto (ver api/forma_pago; null si no se asignó). |
| `nombre_t_forma_pago` | Nombre de la forma de pago (texto de t_forma_pago). |
| `t_precio` | Id de la tarifa de precios asignada (ver api/tarifa_precio). |
| `nombre_t_precio` | Nombre de la tarifa de precios (texto de t_precio). |
| `cupo_credito` | Cupo de crédito autorizado (null si no se ha definido). |
| `pdte_cobro` | Saldo pendiente de cobro del cliente. |
| `t_marketing` | Id del tipo de marketing (ver api/t_marketing; null si no se asignó). |
| `nombre_t_marketing` | Nombre del tipo de marketing (texto de t_marketing). |
| `responsable_asignado` | Usuario (correo) responsable asignado al cliente (null si no tiene). |
| `nombre_responsable_asignado` | Nombres y apellidos del responsable asignado (texto de responsable_asignado). |
| `vendedor` | Código del tercero (empleado) vendedor asignado al cliente (null si no tiene). |
| `nombre_vendedor` | Nombre del vendedor (texto de vendedor). |
| `fecha_nacimiento` | Fecha de nacimiento (YYYY-MM-DD; null si no se registró). |
| `genero` | Género: F = femenino, M = masculino (null si no se registró). |
| `t_persona` | Id del tipo de persona (1 = Física (natural), 2 = Jurídica (moral)). |
| `nombre_t_persona` | Nombre del tipo de persona (texto de t_persona). |
| `t_regimen_iva` | Id del régimen tributario. |
| `nombre_t_regimen_iva` | Nombre del régimen tributario (texto de t_regimen_iva). |
| `t_cliente` | Id del tipo de cliente. |
| `nombre_t_cliente` | Nombre del tipo de cliente (texto de t_cliente), ej. Comprador. |
| `ciiu` | Código CIIU de la actividad económica (null si no se asignó). |
| `nombre_ciiu` | Nombre de la actividad económica (texto de ciiu). |
| `divisa` | Código ISO de la moneda. |
| `nombre_divisa` | Nombre de la moneda (texto de divisa). |
| `ruta_logistica` | Id de la ruta logística asignada (clave sucursal + id; ver api/ruta_logistica; null si no tiene). |
| `nombre_ruta_logistica` | Nombre de la ruta logística (texto de ruta_logistica). |
| `fecha_trans` | Fecha y hora de creación del cliente, en UTC tal como está almacenada en la base de datos. |
| `vigente` | 1 si el cliente está vigente; 0 si está anulado. |
| `direcciones` | Lista de todas las direcciones registradas del cliente (direccion_tercero), solo para consulta: los POST nunca reciben el id de una dirección; POST api/orden_v, api/remision_v y api/factura_v reciben la dirección del cliente como datos (id_pais_cliente, id_provincia_cliente, id_ciudad_cliente, direccion_cliente, referencia_cliente) y POST api/guia_transporte la dirección de entrega (id_pais_destinatario, id_provincia_destinatario, id_ciudad_destinatario, direccion_destinatario, referencia_destinatario), y la reutilizan si ya está registrada o la crean. Cada elemento: id (id de la dirección dentro del tercero), id_pais (id del país), pais (nombre del país, texto de id_pais), id_provincia (id del departamento/provincia), provincia (nombre del departamento, texto de id_provincia), id_ciudad (id de la ciudad), ciudad (nombre de la ciudad, texto de id_ciudad), direccion (dirección) y referencia (referencia o indicaciones adicionales de la dirección). Array vacío si el cliente no tiene direcciones registradas. |

### Ejemplo de respuesta

```json
{
  "ok": true,
  "data": [
    {
      "tercero": "5",
      "sucursal": null,
      "nombre_sucursal": null,
      "url_foto": "https://ejemplo.com/foto.jpg",
      "nombre": "Comercializadora Andina S.A.S.",
      "t_dni": "1",
      "tipo_dni": "Número de Identificación Tributaria CO",
      "abreviacion": "NIT",
      "id": "900123456",
      "dv": 8,
      "telefono_1": "3001234567",
      "ref_tel_1": "",
      "telefono_2": "3001234567",
      "ref_tel_2": "",
      "celular": "",
      "whatsapp": "3001234567",
      "facetime": "",
      "email": "usuario@empresa.com",
      "t_forma_pago": null,
      "nombre_t_forma_pago": null,
      "t_precio": "1",
      "nombre_t_precio": "Tarifa normal",
      "cupo_credito": null,
      "pdte_cobro": "269524.50",
      "t_marketing": null,
      "nombre_t_marketing": null,
      "responsable_asignado": null,
      "nombre_responsable_asignado": null,
      "vendedor": null,
      "nombre_vendedor": null,
      "fecha_nacimiento": "2015-06-20",
      "genero": "F",
      "t_persona": "2",
      "nombre_t_persona": "Jurídica (moral)",
      "t_regimen_iva": "4",
      "nombre_t_regimen_iva": "Régimen ordinario Responsable de IVA",
      "t_cliente": "1",
      "nombre_t_cliente": "Comprador",
      "ciiu": null,
      "nombre_ciiu": null,
      "divisa": "COP",
      "nombre_divisa": "Peso Colombiano",
      "ruta_logistica": null,
      "nombre_ruta_logistica": null,
      "fecha_trans": "2018-03-17 01:19:57",
      "vigente": "1",
      "direcciones": [
        {
          "id": "1",
          "id_pais": "47",
          "pais": "Colombia",
          "id_provincia": "776",
          "provincia": "Antioquia",
          "id_ciudad": "12601",
          "ciudad": "Medellín",
          "direccion": "Calle 10 # 20-30",
          "referencia": "Edificio Centro, oficina 201"
        },
        {
          "id": "2",
          "id_pais": "47",
          "pais": "Colombia",
          "id_provincia": "789",
          "provincia": "Cundinamarca",
          "id_ciudad": "12688",
          "ciudad": "Bogotá D.C.",
          "direccion": "Carrera 15 # 93-60",
          "referencia": "Local 3"
        }
      ]
    },
    {
      "tercero": "1",
      "sucursal": null,
      "nombre_sucursal": null,
      "url_foto": null,
      "nombre": "Carlos Gómez",
      "t_dni": "2",
      "tipo_dni": "Cédula de ciudadanía",
      "abreviacion": "CC",
      "id": "1030405060",
      "dv": null,
      "telefono_1": "",
      "ref_tel_1": "",
      "telefono_2": "",
      "ref_tel_2": "",
      "celular": "",
      "whatsapp": "",
      "facetime": "",
      "email": "",
      "t_forma_pago": "1",
      "nombre_t_forma_pago": "Contado",
      "t_precio": "1",
      "nombre_t_precio": "Tarifa normal",
      "cupo_credito": null,
      "pdte_cobro": "0.00",
      "t_marketing": null,
      "nombre_t_marketing": null,
      "responsable_asignado": null,
      "nombre_responsable_asignado": null,
      "vendedor": null,
      "nombre_vendedor": null,
      "fecha_nacimiento": null,
      "genero": null,
      "t_persona": "1",
      "nombre_t_persona": "Física (natural)",
      "t_regimen_iva": "5",
      "nombre_t_regimen_iva": "Régimen ordinario No responsable de IVA",
      "t_cliente": "1",
      "nombre_t_cliente": "Comprador",
      "ciiu": null,
      "nombre_ciiu": null,
      "divisa": "COP",
      "nombre_divisa": "Peso Colombiano",
      "ruta_logistica": null,
      "nombre_ruta_logistica": null,
      "fecha_trans": "2019-11-05 04:38:39",
      "vigente": "1",
      "direcciones": [
        {
          "id": "1",
          "id_pais": "47",
          "pais": "Colombia",
          "id_provincia": "789",
          "provincia": "Cundinamarca",
          "id_ciudad": "12688",
          "ciudad": "Bogotá D.C.",
          "direccion": "Carrera 15 # 93-60",
          "referencia": "Local 3"
        }
      ]
    }
  ],
  "paginacion": {
    "pagina": 1,
    "por_pagina": 100,
    "total": 3107,
    "total_paginas": 32
  }
}
```

---

## <a id="proveedor"></a>GET `api/proveedor` — Consultar proveedores

Devuelve los proveedores de la empresa asociada a la API key (tabla proveedor junto con los datos del tercero) con las mismas columnas de la tabla de consulta del web: código del tercero, sucursal, nombre o razón social, tipo y número de identificación con su dígito de verificación (solo NIT), teléfonos, celular, WhatsApp, FaceTime, correo, forma de pago, tipo de persona, régimen tributario, actividad económica, moneda, fecha de nacimiento y vigencia; cada id de otra tabla va seguido de su nombre. La clave de un proveedor es empresa + tercero: id es el número de identificación, no un consecutivo. Al final de cada proveedor se devuelve el array direcciones con todas sus direcciones registradas (direccion_tercero, relación 1:N: id, id_pais, pais, id_provincia, provincia, id_ciudad, ciudad, direccion, referencia); el id de cada dirección es el valor que recibe direccion_destinatario[] en POST api/guia_transporte, por eso es vital para las integraciones que crean guías. No se devuelven adjuntos, observación ni responsables. Se listan del más reciente al más antiguo por fecha de creación (los anulados, por fecha de anulación). Los filtros son los mismos del bloque de búsqueda del módulo Proveedores del web (se llaman igual que las columnas): t_dni, numero, nombre, sucursal, telefono1, telefono2, celular, whatsapp, fecha_nacimiento, fecha_nacimiento_hasta, t_persona, t_regimen_iva, ciiu, t_forma_pago, divisa y vigente; además permite paginar. Por defecto solo se listan los vigentes; enviando vigente=0 se listan los anulados. Requiere permiso de consulta sobre la función: Proveedores.

Ejemplo: `GET api/proveedor?pagina=1&por_pagina=100`

### Parámetros

| Nombre | Tipo | Req. | Descripción |
|---|---|---|---|
| `t_dni` | integer |  | Filtrar por el id del tipo de documento de identidad (t_dni). En el web es una lista desplegable dinámica (ej. 1 = NIT, 2 = Cédula de ciudadanía, 3 = Pasaporte). |
| `numero` | string |  | Número de identificación exacto (columna id del tercero), máximo 20 caracteres. |
| `nombre` | string |  | Palabras clave separadas por espacio; cada palabra debe estar contenida en el nombre o razón social (máximo 60 caracteres). |
| `sucursal` | integer |  | Filtrar por el id de la sucursal asociada al proveedor (ver api/sucursal). En el web es una lista desplegable dinámica. |
| `telefono1` | string |  | Coincidencia parcial sobre el teléfono 1 (telefono_1), máximo 15 caracteres. |
| `telefono2` | string |  | Coincidencia parcial sobre el teléfono 2 (telefono_2), máximo 15 caracteres. |
| `celular` | string |  | Coincidencia parcial sobre el celular, máximo 15 caracteres. |
| `whatsapp` | string |  | Coincidencia parcial sobre el número de WhatsApp (solo dígitos), máximo 15 caracteres. |
| `fecha_nacimiento` | string |  | Cumpleaños desde: mes y día de la fecha de nacimiento (formato MM-DD, sin año) mayor o igual al indicado. Combinar con fecha_nacimiento_hasta para listar los cumpleaños de un rango. |
| `fecha_nacimiento_hasta` | string |  | Cumpleaños hasta: mes y día de la fecha de nacimiento (formato MM-DD, sin año) menor o igual al indicado. Combinar con fecha_nacimiento. |
| `t_persona` | integer |  | Filtrar por el id del tipo de persona (1 = Física (natural), 2 = Jurídica (moral)). En el web es una lista desplegable dinámica. |
| `t_regimen_iva` | integer |  | Filtrar por el id del régimen tributario. En el web es una lista desplegable dinámica (ej. 4 = Régimen ordinario Responsable de IVA, 5 = Régimen ordinario No responsable de IVA). |
| `ciiu` | string |  | Filtrar por el código CIIU de la actividad económica (columna ciiu). En el web es una lista desplegable dinámica. |
| `t_forma_pago` | integer |  | Filtrar por el id de la forma de pago por defecto (ver api/forma_pago). En el web es una lista desplegable dinámica. |
| `divisa` | string |  | Código ISO de la moneda (ej. COP, USD). En el web es una lista desplegable dinámica. |
| `vigente` | integer |  | Si no se envía se listan solo los vigentes. Enviar vigente=0 para listar los anulados. Valores: `1` Vigente, `0` Anulado |
| `pagina` | integer |  | Número de página. Por defecto 1. |
| `por_pagina` | integer |  | Registros por página. Por defecto 100, máximo 100. |

### Campos de respuesta

| Campo | Descripción |
|---|---|
| `tercero` | Código interno del tercero en la empresa (clave empresa + tercero). Es el valor que reciben los filtros tercero/proveedor de los demás recursos. |
| `sucursal` | Id de la sucursal a la que está asociado el proveedor (null si no está restringido a una sucursal). |
| `nombre_sucursal` | Nombre de la sucursal (texto de sucursal). |
| `nombre` | Nombre o razón social del proveedor. |
| `t_dni` | Id del tipo de documento de identidad (t_dni). |
| `abreviacion` | Abreviatura del tipo de documento (texto de t_dni), ej. NIT, CC. |
| `tipo_dni` | Nombre del tipo de documento (texto de t_dni). |
| `id` | Número de identificación del proveedor (no es un consecutivo; la clave es empresa + tercero). |
| `dv` | Dígito de verificación del NIT, calculado como en el web (no es una columna); null cuando el tipo de documento no es NIT. Se devuelve como número. |
| `telefono_1` | Teléfono 1. |
| `ref_tel_1` | Referencia o descripción del teléfono 1. |
| `telefono_2` | Teléfono 2. |
| `ref_tel_2` | Referencia o descripción del teléfono 2. |
| `celular` | Número de celular. |
| `whatsapp` | Número de WhatsApp. |
| `facetime` | Contacto de FaceTime. |
| `email` | Correo(s) electrónico(s), separados por coma si hay varios. |
| `t_forma_pago` | Id de la forma de pago por defecto (ver api/forma_pago; null si no se asignó). |
| `nombre_t_forma_pago` | Nombre de la forma de pago (texto de t_forma_pago). |
| `t_persona` | Id del tipo de persona (1 = Física (natural), 2 = Jurídica (moral)). |
| `nombre_t_persona` | Nombre del tipo de persona (texto de t_persona). |
| `t_regimen_iva` | Id del régimen tributario. |
| `nombre_t_regimen_iva` | Nombre del régimen tributario (texto de t_regimen_iva). |
| `ciiu` | Código CIIU de la actividad económica (null si no se asignó). |
| `nombre_ciiu` | Nombre de la actividad económica (texto de ciiu). |
| `divisa` | Código ISO de la moneda. |
| `nombre_divisa` | Nombre de la moneda (texto de divisa). |
| `fecha_nacimiento` | Fecha de nacimiento (YYYY-MM-DD; null si no se registró). |
| `vigente` | 1 si el proveedor está vigente; 0 si está anulado. |
| `direcciones` | Lista de todas las direcciones registradas del proveedor (direccion_tercero), solo para consulta: POST api/guia_transporte recibe la dirección de entrega como datos (id_pais_destinatario, id_provincia_destinatario, id_ciudad_destinatario, direccion_destinatario, referencia_destinatario), nunca el id de la dirección, y la reutiliza si ya está registrada o la crea. Cada elemento: id (id de la dirección dentro del tercero), id_pais (id del país), pais (nombre del país, texto de id_pais), id_provincia (id del departamento/provincia), provincia (nombre del departamento, texto de id_provincia), id_ciudad (id de la ciudad), ciudad (nombre de la ciudad, texto de id_ciudad), direccion (dirección) y referencia (referencia o indicaciones adicionales de la dirección). Array vacío si el proveedor no tiene direcciones registradas. |

### Ejemplo de respuesta

```json
{
  "ok": true,
  "data": [
    {
      "tercero": "6504",
      "sucursal": null,
      "nombre_sucursal": null,
      "nombre": "Ana Pérez",
      "t_dni": "3",
      "abreviacion": "PSPT",
      "tipo_dni": "Pasaporte",
      "id": "PA1234567",
      "dv": null,
      "telefono_1": "3001234567",
      "ref_tel_1": "Oficina",
      "telefono_2": "3109876543",
      "ref_tel_2": "Casa",
      "celular": "3001234567",
      "whatsapp": "3001234567",
      "facetime": "",
      "email": "usuario@empresa.com",
      "t_forma_pago": "2",
      "nombre_t_forma_pago": "Contado a 1 día",
      "t_persona": "1",
      "nombre_t_persona": "Física (natural)",
      "t_regimen_iva": "5",
      "nombre_t_regimen_iva": "Régimen ordinario No responsable de IVA",
      "ciiu": null,
      "nombre_ciiu": null,
      "divisa": "COP",
      "nombre_divisa": "Peso Colombiano",
      "fecha_nacimiento": "1990-05-12",
      "vigente": "1",
      "direcciones": [
        {
          "id": "1",
          "id_pais": "47",
          "pais": "Colombia",
          "id_provincia": "776",
          "provincia": "Antioquia",
          "id_ciudad": "12601",
          "ciudad": "Medellín",
          "direccion": "Calle 10 # 20-30",
          "referencia": "Edificio Centro, oficina 201"
        },
        {
          "id": "2",
          "id_pais": "47",
          "pais": "Colombia",
          "id_provincia": "789",
          "provincia": "Cundinamarca",
          "id_ciudad": "12688",
          "ciudad": "Bogotá D.C.",
          "direccion": "Carrera 15 # 93-60",
          "referencia": "Local 3"
        }
      ]
    },
    {
      "tercero": "6477",
      "sucursal": null,
      "nombre_sucursal": null,
      "nombre": "Suministros Industriales del Valle S.A.S.",
      "t_dni": "1",
      "abreviacion": "NIT",
      "tipo_dni": "Número de Identificación Tributaria CO",
      "id": "901234567",
      "dv": 7,
      "telefono_1": "",
      "ref_tel_1": null,
      "telefono_2": null,
      "ref_tel_2": null,
      "celular": "3001234567",
      "whatsapp": "",
      "facetime": null,
      "email": "",
      "t_forma_pago": null,
      "nombre_t_forma_pago": null,
      "t_persona": "2",
      "nombre_t_persona": "Jurídica (moral)",
      "t_regimen_iva": "4",
      "nombre_t_regimen_iva": "Régimen ordinario Responsable de IVA",
      "ciiu": null,
      "nombre_ciiu": null,
      "divisa": "COP",
      "nombre_divisa": "Peso Colombiano",
      "fecha_nacimiento": null,
      "vigente": "1",
      "direcciones": [
        {
          "id": "1",
          "id_pais": "47",
          "pais": "Colombia",
          "id_provincia": "789",
          "provincia": "Cundinamarca",
          "id_ciudad": "12688",
          "ciudad": "Bogotá D.C.",
          "direccion": "Carrera 15 # 93-60",
          "referencia": "Local 3"
        }
      ]
    }
  ],
  "paginacion": {
    "pagina": 1,
    "por_pagina": 100,
    "total": 434,
    "total_paginas": 5
  }
}
```

---

## <a id="articulo"></a>GET `api/articulo` — Consultar artículos

Devuelve los artículos de la empresa asociada a la API key con las mismas columnas de la tabla de consulta del módulo Artículos del web: id, URL de la foto, nombre (descripcion), referencia, códigos de barras (GTIN y otros), marcas de compras, ventas, alquiler y mandato, tipo de artículo, categoría, categoría y subcategoría dropshipping, marca (cada uno con su nombre), datos de depreciación (costo inicial, valor residual, valor depreciado, vida útil, fechas de inicio y fin de depreciación y de baja), cuentas contables de ingreso por venta, devolución de ingreso por venta, activo, costo de venta, gasto por depreciación y depreciación acumulada (cada una con su código segmentado y nombre), costos (p_costo, p_costo_promedio, p_costo_ultimo), precio mínimo de venta, precios de venta por tarifa, impuestos, gestión de stock (con su nombre), stock de la empresa, stock mínimo y stock en órdenes de compra, descripción detallada, sucursal principal y responsable (cada uno con su nombre), los campos auxiliares multipropósito (valor, porcentaje, número y texto), marcas de descuento y dropshipping proveedor, los ids del producto en las integraciones ecommerce, la vigencia y, al final de cada artículo, el array stock_bodegas con el stock en cada bodega vigente de la empresa (sucursal, nombre_sucursal, bodega, nombre_bodega, stock), ordenado por sucursal y bodega. Igual que en el web, los costos (p_costo, p_costo_promedio, p_costo_ultimo) solo se devuelven si el perfil tiene permiso de consulta sobre la función 155 (Artículos - Costos y depreciación) y el stock (stock_empresa, stock_empresa_orden_c) solo con permiso de consulta sobre la función 156 (Artículos - Stock disponible); sin ese permiso esos campos no aparecen en la respuesta. stock_bodegas se devuelve siempre, pero sin permiso sobre la función 156 solo incluye las bodegas autorizadas al usuario de la API key (igual que el web); los combos (t_articulo 8), los artículos sin gestión de stock (gestion_stock 0, p. ej. servicios) y los artículos sin registro de stock en bodegas traen stock_bodegas vacío ([]). Se listan de mayor a menor id, igual que en el web. Los filtros son los mismos del bloque de búsqueda del módulo Artículos del web (se llaman igual que las columnas): id, id_desde, id_hasta, referencia, ref_desde, ref_hasta, descripcion, categoria, marca, compras, ventas, t_articulo, gestion_stock, valor_ref, porcentaje_ref, numero_ref, texto_ref, sucursal, descuento, dropshipping_proveedor, dropshipping_distribuidor, alquiler, responsable, nivel_stock, gtin, c_barras, existe_vinculacion, articulo_ecommerce, manifiesto y vigente; además permite paginar. Por defecto solo se listan los vigentes; enviando vigente=0 se listan los anulados. Requiere permiso de consulta sobre la función: Artículos.

Ejemplo: `GET api/articulo?pagina=1&por_pagina=100`

### Parámetros

| Nombre | Tipo | Req. | Descripción |
|---|---|---|---|
| `id` | integer |  | Filtrar por el id de un artículo específico. |
| `id_desde` | integer |  | Filtrar por id mayor o igual al indicado (rango de ids; combinar con id_hasta). |
| `id_hasta` | integer |  | Filtrar por id menor o igual al indicado (rango de ids; combinar con id_desde). |
| `referencia` | string |  | Filtrar por la referencia del artículo. Coincidencia exacta; agregue % para búsqueda parcial (ej. ABC% devuelve las referencias que empiezan por ABC), igual que en el web. |
| `ref_desde` | string |  | Filtrar por referencia mayor o igual a la indicada (rango de referencias; combinar con ref_hasta). |
| `ref_hasta` | string |  | Filtrar por referencia menor o igual a la indicada (rango de referencias; combinar con ref_desde). |
| `descripcion` | string |  | Filtrar por el nombre del artículo por palabras clave separadas por espacio: todas deben estar contenidas en el nombre, sin distinguir mayúsculas. |
| `categoria` | integer |  | Filtrar por el id de la categoría del artículo (ver api/categoria_articulo). Enviar -1 para listar los artículos sin categoría. En el web es una lista desplegable dinámica. Valores: `-1` - Vacía - |
| `marca` | integer |  | Filtrar por el id de la marca del artículo (ver api/marca_articulo). Enviar -1 para listar los artículos sin marca. En el web es una lista desplegable dinámica. Valores: `-1` - Vacía - |
| `compras` | integer |  | Filtrar por la marca de transacciones de compra: 1 permitidas; 0 prohibidas. Valores: `1` Permitido, `0` Prohibido |
| `ventas` | integer |  | Filtrar por la marca de transacciones de venta: 1 permitidas; 0 prohibidas. Valores: `1` Permitido, `0` Prohibido |
| `t_articulo` | integer |  | Filtrar por el id del tipo de artículo (ver api/t_articulo). En el web es una lista desplegable dinámica (1 = Materia prima, 2 = Producto en proceso, 3 = Producto terminado, 4 = Servicio, 5 = Activo fijo (Propiedad, planta y equipo), 6 = Activo intangible, 7 = Activo de inversión, 8 = Producto terminado combo, 9 = Cuenta contable, 10 = Servicio de transporte de productos). |
| `gestion_stock` | integer |  | Filtrar por el id del tipo de gestión de stock (t_gestion_stock). En el web es una lista desplegable dinámica (0 = Sin trazabilidad, 1 = Trazabilidad por cantidad - Sin control de stock, 2 = Trazabilidad por cantidad - Control por empresa, 3 = Trazabilidad por cantidad - Control por bodega, 4 = Trazabilidad por lote - Control por bodega, 5 = Trazabilidad por serie - Control por bodega). |
| `valor_ref` | decimal |  | Filtrar por el valor auxiliar multipropósito del artículo (coincidencia exacta). |
| `porcentaje_ref` | decimal |  | Filtrar por el porcentaje auxiliar multipropósito del artículo (coincidencia exacta). |
| `numero_ref` | integer |  | Filtrar por el número auxiliar multipropósito del artículo (coincidencia exacta). |
| `texto_ref` | string |  | Filtrar por el texto auxiliar multipropósito por palabras clave separadas por espacio: todas deben estar contenidas en el texto, sin distinguir mayúsculas. |
| `sucursal` | integer |  | Filtrar por el id de la sucursal principal del artículo (ver api/sucursal). En el web es una lista desplegable dinámica. |
| `descuento` | integer |  | Filtrar por la marca de descuento en ventas: 1 permitido; 0 prohibido. Valores: `1` Permitido, `0` Prohibido |
| `dropshipping_proveedor` | integer |  | Filtrar por la marca dropshipping del artículo (columna dropshipping): 1 compartido con distribuidores; 0 no compartido. Valores: `1` Compartido, `0` No compartido |
| `dropshipping_distribuidor` | integer |  | Filtrar por vinculación dropshipping como distribuidor: 1 solo artículos vinculados a un proveedor dropshipping; 0 solo artículos sin vinculación. Es solo un filtro: no se devuelve como campo. Valores: `1` Vinculado, `0` No vinculado |
| `alquiler` | integer |  | Filtrar por la marca de alquiler: 1 permitido; 0 prohibido. Valores: `1` Permitido, `0` Prohibido |
| `responsable` | string |  | Filtrar por el usuario (correo) que creó el artículo. En el web es una lista desplegable dinámica de los usuarios de la empresa. |
| `nivel_stock` | integer |  | Filtrar por el nivel de stock total del artículo frente a su stock mínimo (solo artículos con gestión de stock mayor a 0). Es solo un filtro: no se devuelve como campo. Valores: `1` Stock óptimo, `2` Stock agotado, `3` Stock diferente de cero, `4` Stock cero |
| `gtin` | string |  | Filtrar por el código de barras GTIN del artículo (coincidencia exacta). |
| `c_barras` | string |  | Filtrar por otro código de barras asociado al artículo (coincidencia exacta sobre los códigos adicionales, que se devuelven en codigos_barras). |
| `existe_vinculacion` | integer |  | Filtrar por vinculación con integraciones ecommerce: 1 solo artículos vinculados a un producto ecommerce; 0 solo artículos sin vinculación. Valores: `1` Si, `0` No |
| `articulo_ecommerce` | string |  | Filtrar por coincidencia parcial del id del producto en la plataforma ecommerce (Shopify, Woocommerce...). |
| `manifiesto` | integer |  | Filtrar por pertenencia a un manifiesto de artículos vigente: 1 solo artículos en algún manifiesto; 0 solo artículos sin manifiesto. Es solo un filtro: no se devuelve como campo. Valores: `1` Si, `0` No |
| `vigente` | integer |  | Si no se envía se listan solo los artículos vigentes. Enviar vigente=0 para listar los anulados. Valores: `1` Vigente, `0` Anulado |
| `pagina` | integer |  | Número de página. Por defecto 1. |
| `por_pagina` | integer |  | Registros por página. Por defecto 100, máximo 100. |

### Campos de respuesta

| Campo | Descripción |
|---|---|
| `id` | Identificador del artículo (propio de la empresa). |
| `url_foto` | URL de la foto principal del artículo (null o vacío si no tiene). |
| `descripcion` | Nombre del artículo. |
| `referencia` | Referencia del artículo. |
| `gtin` | Código de barras GTIN del artículo. |
| `codigos_barras` | Otros códigos de barras del artículo, separados por coma (null si no tiene). |
| `compras` | 1 si el artículo se permite en transacciones de compra; 0 si no. |
| `ventas` | 1 si el artículo se permite en transacciones de venta; 0 si no. |
| `alquiler` | 1 si el artículo se permite en alquiler; 0 si no. |
| `mandato` | 1 si el artículo se vende bajo mandato (a nombre de un tercero); 0 si no. |
| `t_articulo` | Id del tipo de artículo. |
| `tipo_articulo` | Nombre del tipo de artículo (texto de t_articulo), ej. Materia prima, Producto terminado, Servicio. |
| `categoria` | Id de la categoría del artículo (null si no tiene). |
| `nombre_categoria` | Nombre de la categoría (texto de categoria). |
| `categoria_dropshipping` | Id de la categoría dropshipping del artículo (null si no tiene). |
| `nombre_categoria_dropshipping` | Nombre de la categoría dropshipping (texto de categoria_dropshipping). |
| `subcategoria_dropshipping` | Id de la subcategoría dropshipping del artículo (null si no tiene). |
| `nombre_subcategoria_dropshipping` | Nombre de la subcategoría dropshipping (texto de subcategoria_dropshipping). |
| `marca` | Id de la marca del artículo (null si no tiene). |
| `nombre_marca` | Nombre de la marca (texto de marca). |
| `costo_inicial` | Valor del costo inicial del activo para depreciación (null si no aplica). |
| `valor_residual` | Valor residual del activo al final de su vida útil (null si no aplica). |
| `valor_depreciado` | Valor depreciado acumulado del activo (null si no aplica). |
| `vida_util_meses` | Vida útil del activo en meses (null si no aplica). |
| `fecha_inicio_depreciacion` | Fecha de inicio de la depreciación del activo (YYYY-MM-DD; null si no aplica). |
| `fecha_fin_depreciacion` | Fecha de fin de la depreciación del activo (YYYY-MM-DD; null si no aplica). |
| `fecha_baja` | Fecha de baja del activo (YYYY-MM-DD; null si no aplica). |
| `cuenta_contable_ingreso_venta` | Código de la cuenta contable de ingreso por venta (null si no tiene). |
| `codigo_segmentado_ingreso_venta` | Código segmentado de la cuenta contable de ingreso por venta (texto de cuenta_contable_ingreso_venta). |
| `nombre_cuenta_contable_ingreso_venta` | Nombre de la cuenta contable de ingreso por venta (texto de cuenta_contable_ingreso_venta). |
| `cuenta_contable_devolucion_ingreso_venta` | Código de la cuenta contable de devolución de ingreso por venta (null si no tiene). |
| `codigo_segmentado_devolucion_ingreso_venta` | Código segmentado de la cuenta contable de devolución de ingreso por venta (texto de cuenta_contable_devolucion_ingreso_venta). |
| `nombre_cuenta_contable_devolucion_ingreso_venta` | Nombre de la cuenta contable de devolución de ingreso por venta (texto de cuenta_contable_devolucion_ingreso_venta). |
| `cuenta_contable_activo` | Código de la cuenta contable de activo (inventario) (null si no tiene). |
| `codigo_segmentado_activo` | Código segmentado de la cuenta contable de activo (inventario) (texto de cuenta_contable_activo). |
| `nombre_cuenta_contable_activo` | Nombre de la cuenta contable de activo (inventario) (texto de cuenta_contable_activo). |
| `cuenta_contable_costo_venta` | Código de la cuenta contable de costo de venta (null si no tiene). |
| `codigo_segmentado_costo_venta` | Código segmentado de la cuenta contable de costo de venta (texto de cuenta_contable_costo_venta). |
| `nombre_cuenta_contable_costo_venta` | Nombre de la cuenta contable de costo de venta (texto de cuenta_contable_costo_venta). |
| `cuenta_contable_depreciacion_gasto` | Código de la cuenta contable de gasto por depreciación (null si no tiene). |
| `codigo_segmentado_depreciacion_gasto` | Código segmentado de la cuenta contable de gasto por depreciación (texto de cuenta_contable_depreciacion_gasto). |
| `nombre_cuenta_contable_depreciacion_gasto` | Nombre de la cuenta contable de gasto por depreciación (texto de cuenta_contable_depreciacion_gasto). |
| `cuenta_contable_depreciacion_acumulada` | Código de la cuenta contable de depreciación acumulada (null si no tiene). |
| `codigo_segmentado_depreciacion_acumulada` | Código segmentado de la cuenta contable de depreciación acumulada (texto de cuenta_contable_depreciacion_acumulada). |
| `nombre_cuenta_contable_depreciacion_acumulada` | Nombre de la cuenta contable de depreciación acumulada (texto de cuenta_contable_depreciacion_acumulada). |
| `p_costo` | Valor del costo del artículo. Solo se devuelve si el perfil tiene permiso de consulta sobre la función 155 (Artículos - Costos y depreciación); si no, el campo no aparece en la respuesta. |
| `p_costo_promedio` | Valor del costo promedio del artículo. Solo se devuelve si el perfil tiene permiso de consulta sobre la función 155 (Artículos - Costos y depreciación); si no, el campo no aparece en la respuesta. |
| `p_costo_ultimo` | Valor del último costo de compra del artículo. Solo se devuelve si el perfil tiene permiso de consulta sobre la función 155 (Artículos - Costos y depreciación); si no, el campo no aparece en la respuesta. |
| `p_min_venta` | Valor del precio mínimo de venta del artículo. |
| `precios_venta` | Precios por tarifa en texto 'Nombre tarifa: precio; ...' (tarifas de precio vigentes de la empresa, ver api/tarifa_precio). |
| `impuesto` | Etiquetas de los impuestos del artículo; cuando tiene varios van separados por <hr class="margin-5"> (mismo separador HTML de la tabla del web). null si no tiene impuestos. |
| `gestion_stock` | Id del tipo de gestión de stock del artículo (0 = sin trazabilidad). |
| `tipo_gestion_stock` | Nombre del tipo de gestión de stock (texto de gestion_stock). |
| `stock_empresa` | Stock total del artículo en la empresa. Solo se devuelve si el perfil tiene permiso de consulta sobre la función 156 (Artículos - Stock disponible); si no, el campo no aparece en la respuesta. |
| `stock_minimo` | Stock mínimo del artículo. |
| `stock_empresa_orden_c` | Cantidad del artículo pendiente de recibir en órdenes de compra. Solo se devuelve si el perfil tiene permiso de consulta sobre la función 156 (Artículos - Stock disponible); si no, el campo no aparece en la respuesta. |
| `descripcion_detallada` | Descripción detallada del artículo. |
| `sucursal` | Id de la sucursal principal del artículo (null si no tiene). |
| `nombre_sucursal` | Nombre de la sucursal principal (texto de sucursal). |
| `responsable` | Usuario (correo) que creó el artículo. |
| `nombre_responsable` | Nombres y apellidos del usuario que creó el artículo (texto de responsable). |
| `valor_ref` | Valor auxiliar multipropósito del artículo. |
| `porcentaje_ref` | Porcentaje auxiliar multipropósito del artículo. |
| `numero_ref` | Número auxiliar multipropósito del artículo. |
| `texto_ref` | Texto auxiliar multipropósito del artículo. |
| `descuento` | 1 si el artículo permite descuento en ventas; 0 si no. |
| `dropshipping` | 1 si el artículo está compartido como proveedor dropshipping; 0 si no (columna detrás del filtro dropshipping_proveedor). |
| `articulos_ecommerce` | Ids del producto en las integraciones ecommerce vinculadas, separados por coma (null si no está vinculado). |
| `vigente` | 1 si el artículo está vigente; 0 si está anulado. |
| `stock_bodegas` | Array con el stock del artículo en cada bodega vigente de la empresa (una fila por bodega registrada en articulo_x_bodega, ordenadas por sucursal y bodega). Cada elemento trae: sucursal (id de la sucursal; ver api/sucursal), nombre_sucursal (texto de sucursal), bodega (id de la bodega dentro de la sucursal; ver api/bodega), nombre_bodega (texto de bodega) y stock (unidades disponibles en esa bodega, con los decimales reales del inventario; puede ser 0 o negativo). Con permiso de consulta sobre la función 156 (Artículos - Stock disponible) incluye todas las bodegas vigentes; sin ese permiso solo las bodegas autorizadas al usuario de la API key, igual que la columna de stock por bodega del web. Vacío ([]) en combos (t_articulo 8), en artículos sin gestión de stock (gestion_stock 0, p. ej. servicios) y en artículos sin registro de stock en ninguna bodega. |

### Ejemplo de respuesta

```json
{
  "ok": true,
  "data": [
    {
      "id": "972",
      "url_foto": null,
      "descripcion": "Producto de ejemplo A",
      "referencia": "REF-001",
      "gtin": null,
      "codigos_barras": null,
      "compras": "1",
      "ventas": "1",
      "alquiler": "1",
      "mandato": "0",
      "t_articulo": "2",
      "tipo_articulo": "Producto en proceso",
      "categoria": "1",
      "nombre_categoria": "Categoría de ejemplo",
      "categoria_dropshipping": null,
      "nombre_categoria_dropshipping": null,
      "subcategoria_dropshipping": null,
      "nombre_subcategoria_dropshipping": null,
      "marca": null,
      "nombre_marca": null,
      "costo_inicial": null,
      "valor_residual": null,
      "valor_depreciado": null,
      "vida_util_meses": null,
      "fecha_inicio_depreciacion": null,
      "fecha_fin_depreciacion": null,
      "fecha_baja": null,
      "cuenta_contable_ingreso_venta": null,
      "codigo_segmentado_ingreso_venta": null,
      "nombre_cuenta_contable_ingreso_venta": null,
      "cuenta_contable_devolucion_ingreso_venta": null,
      "codigo_segmentado_devolucion_ingreso_venta": null,
      "nombre_cuenta_contable_devolucion_ingreso_venta": null,
      "cuenta_contable_activo": null,
      "codigo_segmentado_activo": null,
      "nombre_cuenta_contable_activo": null,
      "cuenta_contable_costo_venta": null,
      "codigo_segmentado_costo_venta": null,
      "nombre_cuenta_contable_costo_venta": null,
      "cuenta_contable_depreciacion_gasto": null,
      "codigo_segmentado_depreciacion_gasto": null,
      "nombre_cuenta_contable_depreciacion_gasto": null,
      "cuenta_contable_depreciacion_acumulada": null,
      "codigo_segmentado_depreciacion_acumulada": null,
      "nombre_cuenta_contable_depreciacion_acumulada": null,
      "p_costo": "700.0000",
      "p_costo_promedio": "0.0000",
      "p_costo_ultimo": "0.0000",
      "p_min_venta": "1100.0000",
      "precios_venta": "Tarifa normal: 1200.0000; pagina web: 1300.0000; Prueba 50: 0.0000",
      "impuesto": "IVA 19% D",
      "gestion_stock": "3",
      "tipo_gestion_stock": "Trazabilidad por cantidad - Control por bodega",
      "stock_empresa": "0.0000",
      "stock_minimo": "0",
      "stock_empresa_orden_c": "370.0000",
      "descripcion_detallada": "",
      "sucursal": "1",
      "nombre_sucursal": "Principal",
      "responsable": "usuario@empresa.com",
      "nombre_responsable": "Laura Martínez",
      "valor_ref": "0.00",
      "porcentaje_ref": "0.00",
      "numero_ref": "0",
      "texto_ref": null,
      "descuento": "1",
      "dropshipping": "0",
      "articulos_ecommerce": null,
      "vigente": "1",
      "stock_bodegas": [
        {
          "sucursal": "1",
          "nombre_sucursal": "Principal",
          "bodega": "1",
          "nombre_bodega": "Principal",
          "stock": "0.0000"
        },
        {
          "sucursal": "1",
          "nombre_sucursal": "Principal",
          "bodega": "2",
          "nombre_bodega": "Mayoristas",
          "stock": "1000.0000"
        },
        {
          "sucursal": "2",
          "nombre_sucursal": "Sucursal Norte",
          "bodega": "1",
          "nombre_bodega": "Auxiliar",
          "stock": "25.5000"
        }
      ]
    },
    {
      "id": "971",
      "url_foto": "",
      "descripcion": "Producto de ejemplo B",
      "referencia": "REF-002",
      "gtin": "7701234567890",
      "codigos_barras": "1234567",
      "compras": "1",
      "ventas": "1",
      "alquiler": "1",
      "mandato": "0",
      "t_articulo": "2",
      "tipo_articulo": "Producto en proceso",
      "categoria": "1",
      "nombre_categoria": "Categoría de ejemplo",
      "categoria_dropshipping": null,
      "nombre_categoria_dropshipping": null,
      "subcategoria_dropshipping": null,
      "nombre_subcategoria_dropshipping": null,
      "marca": null,
      "nombre_marca": null,
      "costo_inicial": null,
      "valor_residual": null,
      "valor_depreciado": null,
      "vida_util_meses": null,
      "fecha_inicio_depreciacion": null,
      "fecha_fin_depreciacion": null,
      "fecha_baja": null,
      "cuenta_contable_ingreso_venta": null,
      "codigo_segmentado_ingreso_venta": null,
      "nombre_cuenta_contable_ingreso_venta": null,
      "cuenta_contable_devolucion_ingreso_venta": null,
      "codigo_segmentado_devolucion_ingreso_venta": null,
      "nombre_cuenta_contable_devolucion_ingreso_venta": null,
      "cuenta_contable_activo": null,
      "codigo_segmentado_activo": null,
      "nombre_cuenta_contable_activo": null,
      "cuenta_contable_costo_venta": null,
      "codigo_segmentado_costo_venta": null,
      "nombre_cuenta_contable_costo_venta": null,
      "cuenta_contable_depreciacion_gasto": null,
      "codigo_segmentado_depreciacion_gasto": null,
      "nombre_cuenta_contable_depreciacion_gasto": null,
      "cuenta_contable_depreciacion_acumulada": null,
      "codigo_segmentado_depreciacion_acumulada": null,
      "nombre_cuenta_contable_depreciacion_acumulada": null,
      "p_costo": "700.0000",
      "p_costo_promedio": "0.0000",
      "p_costo_ultimo": "0.0000",
      "p_min_venta": "1100.0000",
      "precios_venta": "Tarifa normal: 1200.0000; pagina web: 1300.0000; Prueba 50: 0.0000",
      "impuesto": "IVA 19% D",
      "gestion_stock": "0",
      "tipo_gestion_stock": "Sin trazabilidad",
      "stock_empresa": "0.0000",
      "stock_minimo": "0",
      "stock_empresa_orden_c": "0.0000",
      "descripcion_detallada": "",
      "sucursal": "1",
      "nombre_sucursal": "Principal",
      "responsable": "usuario@empresa.com",
      "nombre_responsable": "Laura Martínez",
      "valor_ref": "0.00",
      "porcentaje_ref": "0.00",
      "numero_ref": "0",
      "texto_ref": "",
      "descuento": "1",
      "dropshipping": "1",
      "articulos_ecommerce": null,
      "vigente": "1",
      "stock_bodegas": []
    }
  ],
  "paginacion": {
    "pagina": 1,
    "por_pagina": 100,
    "total": 963,
    "t
```

---

## <a id="centro_costos"></a>GET `api/centro_costos` — Consultar centros de costos

Devuelve los centros de costos de la empresa asociada a la API key: id, código, nombre, número de nivel, padre (con su nombre), marca de ingresos, cantidad de hijos vigentes y vigencia. Los centros de costos son un árbol: igual que en el web, se listan solo los hijos directos del centro de costos indicado en padre; si padre no se envía (o viene vacío) se lista el nivel raíz (centros de costos sin padre, con padre y nombre_padre null). La paginación aplica sobre los hijos del padre consultado. Permite filtrar por padre, por vigente y paginar. Por defecto solo se listan los vigentes; enviando vigente=0 se listan los anulados. Requiere permiso de consulta sobre la función: Centros de costos.

Ejemplo: `GET api/centro_costos?pagina=1&por_pagina=100`

### Parámetros

| Nombre | Tipo | Req. | Descripción |
|---|---|---|---|
| `padre` | integer |  | Id del centro de costos padre cuyos hijos directos se listan. Vacío o sin enviar: nivel raíz (centros de costos sin padre). No existe en el bloque de filtros del web (el árbol se despliega por nivel). |
| `vigente` | integer |  | Si no se envía se listan solo los centros de costos vigentes. Enviar vigente=0 para listar los anulados. Valores: `1` Vigente, `0` Anulado |
| `pagina` | integer |  | Número de página. Por defecto 1. |
| `por_pagina` | integer |  | Registros por página. Por defecto 100, máximo 100. |

### Campos de respuesta

| Campo | Descripción |
|---|---|
| `id` | Identificador del centro de costos (propio de la empresa). |
| `codigo` | Código del centro de costos. |
| `nombre` | Nombre del centro de costos. |
| `nivel` | Número de nivel en el árbol (1 = centro de costos principal; 2 en adelante = subcentro). |
| `padre` | Id del centro de costos padre (null en el nivel raíz). |
| `nombre_padre` | Nombre del centro de costos padre (texto de padre; null en el nivel raíz). |
| `ingresos` | 1 si el centro de costos permite registrar ingresos; 0 si no. Igual que en el web, solo aplica cuando cant_hijos_vigentes es 0. |
| `cant_hijos_vigentes` | Cantidad de subcentros de costos vigentes que dependen directamente de este centro de costos. |
| `vigente` | 1 si el centro de costos está vigente; 0 si está anulado. |

### Ejemplo de respuesta

```json
{
  "ok": true,
  "data": [
    {
      "id": "1",
      "codigo": "1",
      "nombre": "Sede Medellín",
      "nivel": "1",
      "padre": null,
      "nombre_padre": null,
      "ingresos": "1",
      "cant_hijos_vigentes": "1",
      "vigente": "1"
    },
    {
      "id": "2",
      "codigo": "2",
      "nombre": "Gastos compartidos de sede",
      "nivel": "1",
      "padre": null,
      "nombre_padre": null,
      "ingresos": "0",
      "cant_hijos_vigentes": "0",
      "vigente": "1"
    }
  ],
  "paginacion": {
    "pagina": 1,
    "por_pagina": 100,
    "total": 6,
    "total_paginas": 1
  }
}
```

---

## <a id="sucursal"></a>GET `api/sucursal` — Consultar sucursales

Devuelve las sucursales de la empresa asociada a la API key: id, nombre, prefijo de transacciones, país, departamento/provincia y ciudad (cada uno con su nombre), dirección, teléfonos, marcas de sucursal principal, nómina electrónica y contabilidad automática, estado y vigencia. Permite filtrar por pais, por provincia, por ciudad, por est_sucursal, por principal, por nomina_ebill, por contabilidad_automatica, por vigente y paginar. Los nombres de los filtros son los mismos de las columnas, igual que en el web. Por defecto solo se listan las vigentes; enviando vigente=0 se listan las anuladas. Requiere permiso de consulta sobre la función: Sucursales.

Ejemplo: `GET api/sucursal?pagina=1&por_pagina=100`

### Parámetros

| Nombre | Tipo | Req. | Descripción |
|---|---|---|---|
| `pais` | integer |  | Filtrar por el id del país de la sucursal (ej. 47 = Colombia; ver api/pais). En el web es una lista desplegable dinámica. |
| `provincia` | integer |  | Filtrar por el id del departamento/provincia de la sucursal (ver api/provincia). En el web es una lista desplegable dinámica que depende del país. |
| `ciudad` | integer |  | Filtrar por el id de la ciudad de la sucursal (ver api/ciudad). En el web es una lista desplegable dinámica que depende del departamento. |
| `est_sucursal` | integer |  | Filtrar por el id del estado de la sucursal (est_sucursal). En el web es una lista desplegable dinámica (ej. 1 = Activa, 2 = Cerrada). |
| `principal` | integer |  | Filtrar por la marca de sucursal principal (1 o 0). Valores: `1` Si, `0` No |
| `nomina_ebill` | integer |  | Filtrar por la marca de nómina electrónica (1 o 0). Valores: `1` Si, `0` No |
| `contabilidad_automatica` | integer |  | Filtrar por la marca de contabilidad automática (1 o 0). Valores: `1` Si, `0` No |
| `vigente` | integer |  | Si no se envía se listan solo las sucursales vigentes. Enviar vigente=0 para listar las anuladas. Valores: `1` Vigente, `0` Anulada |
| `pagina` | integer |  | Número de página. Por defecto 1. |
| `por_pagina` | integer |  | Registros por página. Por defecto 100, máximo 100. |

### Campos de respuesta

| Campo | Descripción |
|---|---|
| `id` | Identificador de la sucursal (propio de la empresa). |
| `nombre` | Nombre de la sucursal. |
| `prefijo_trans` | Prefijo con el que se identifican las transacciones de la sucursal (ej. PPAL). |
| `pais` | Id del país de la sucursal. |
| `nombre_pais` | Nombre del país (texto de pais). |
| `provincia` | Id del departamento/provincia de la sucursal. |
| `nombre_provincia` | Nombre del departamento/provincia (texto de provincia). |
| `ciudad` | Id de la ciudad de la sucursal. |
| `nombre_ciudad` | Nombre de la ciudad (texto de ciudad). |
| `direccion` | Dirección de la sucursal. |
| `telefonos` | Teléfonos de la sucursal. |
| `principal` | 1 si es la sucursal principal de la empresa; 0 si no. |
| `nomina_ebill` | 1 si la sucursal emite nómina electrónica; 0 si no. |
| `contabilidad_automatica` | 1 si la sucursal tiene contabilidad automática; 0 si no. |
| `est_sucursal` | Id del estado de la sucursal. |
| `estado` | Nombre del estado de la sucursal (texto de est_sucursal): Activa o Cerrada. |
| `vigente` | 1 si la sucursal está vigente; 0 si está anulada. |

### Ejemplo de respuesta

```json
{
  "ok": true,
  "data": [
    {
      "id": "7",
      "nombre": "Bogotá",
      "prefijo_trans": "BGTA",
      "pais": "47",
      "nombre_pais": "Colombia",
      "provincia": "789",
      "nombre_provincia": "Cundinamarca",
      "ciudad": "12688",
      "nombre_ciudad": "Bogotá D.C.",
      "direccion": "Calle 10 # 20-30",
      "telefonos": "",
      "principal": "0",
      "nomina_ebill": "1",
      "contabilidad_automatica": "1",
      "est_sucursal": "1",
      "estado": "Activa",
      "vigente": "1"
    },
    {
      "id": "5",
      "nombre": "Nómina NO electrónica",
      "prefijo_trans": "NONO",
      "pais": "47",
      "nombre_pais": "Colombia",
      "provincia": "776",
      "nombre_provincia": "Antioquia",
      "ciudad": "12601",
      "nombre_ciudad": "Medellín",
      "direccion": "Carrera 45 # 12-34",
      "telefonos": "",
      "principal": "0",
      "nomina_ebill": "0",
      "contabilidad_automatica": "0",
      "est_sucursal": "1",
      "estado": "Activa",
      "vigente": "1"
    }
  ],
  "paginacion": {
    "pagina": 1,
    "por_pagina": 100,
    "total": 6,
    "total_paginas": 1
  }
}
```

<!-- empresa: no encontrado -->

<!-- usuario: no encontrado -->
