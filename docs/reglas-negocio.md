# Reglas de negocio — Effi contraentrega

Estas reglas vienen de los skills `effi-dashboard`, `dashboard-ecommerce-contraentrega` y `naturalfitt-precierre-gt`. Son la **única definición** que usa `lib/metrics/`. Si una regla cambia, se cambia aquí y en sus tests.

## 1. Estados unificados de guía
| Estado Effi (texto) | Estado unificado |
|---|---|
| Entregada a destino | ENTREGADO |
| En transito, En reparto, Recolectado | EN_TRANSITO |
| Devolución a origen | DEVOLUCION |
| Novedad | NOVEDAD |
| Generada, Pendiente | PENDIENTE |
| Disponible para retiro en oficina | EN_OFICINA |
| Indemnización | INDEMNIZACION |
| Cancelada, Rechazada, Cancelada por transportadora | EXCLUIDA (fuera de todo cálculo) |

- Las guías **cerradas** son ENTREGADO y DEVOLUCION.
- Las **abiertas** son EN_TRANSITO, NOVEDAD, PENDIENTE y EN_OFICINA.
- **El wallet manda:** si existe un movimiento "Recaudo de venta" para la guía, la guía cuenta como ENTREGADO aunque su estado nominal diga otra cosa.

## 2. Métricas de guías
- **Efectividad** = entregadas / (entregadas + devueltas). Solo cuenta guías cerradas; INDEMNIZACION no entra.
- **% devolución por transportadora** = devueltas / total de guías de esa transportadora.
- **Promedio por guía** = Σ valor de recaudo / número de guías contraentrega. Se segmenta por cuenta, transportadora y periodo.
- **Recaudo potencial** = Σ recaudo de todas las guías. **Recaudo efectivo** = Σ recaudo de las guías ENTREGADO.
- **Guía estancada:** guía abierta sin cambio de estado en más de N días (N configurable, 5 por defecto).
- **Entrega en oficina:** la dirección del destinatario coincide con `/oficina|inter\s*rapid|interrapid|recoge|punto de/i`.
- **Nombres de transportadora:** INTERRAPIDISIMO → INTER RAPIDÍSIMO; ENVIA → ENVÍA COLVANES.

## 3. Novedades
- Una guía puede tener varias novedades; los conteos son por guía única.
- **Recuperada:** guía con novedad que termina ENTREGADO.
- **Devuelta por novedad:** estado `/cerrado|devoluci|incidencia/`.
- **% recuperación** = recuperadas / guías con novedad.

## 4. Dinero (wallet)
| Movimiento | Línea | Tratamiento |
|---|---|---|
| Recaudo de venta | Ingreso | PyG |
| Entrada por garantía / indemnización | Ingreso | PyG |
| Compra de mercancía (dropshipping a proveedor) | Costo de mercancía | PyG (solo guías ENTREGADO) |
| Flete crédito con recaudo | Flete con recaudo | PyG |
| Flete crédito devolución | Flete devolución | PyG (valor real del wallet) |
| Flete sin recaudo | Flete sin recaudo | PyG |
| Servicio de Fulfillment | Fulfillment | PyG |
| 4xmil, comisión por retiro, cruce de factura | Otros | PyG |
| Débito revertido / Crédito revertido | Línea propia | PyG |
| Retiro de dinero, transferencias entre wallets, recargas | Caja | **Fuera del PyG** |

- **Guías sin liquidar:** guía ENTREGADO sin "Recaudo de venta" acreditado. Hay que reclamarla.
- **Días entrega → pago** = fecha del movimiento "Recaudo de venta" − fecha de estado ENTREGADO.
- **Costo de mercancía = 0** en devoluciones.
- **Ganancia por guía** = venta − costo − flete − otros. Solo aplica a ENTREGADO.
- **Devoluciones proyectadas:** las guías abiertas se proyectan como devolución, con el flete de devolución promedio real del país y sin costo de mercancía.
- **Montos:** la API devuelve `valor` en pesos, con signo (créditos +, débitos −); confirmado el 2026-10-23. Solo los exportes HTML viejos venían en centavos (÷100).

## 5. Semáforos por país (% devolución)
| País | Moneda | Verde | Amarillo | Rojo | Flete dev. promedio (ref.) | Transportadoras |
|---|---|---|---|---|---|---|
| Colombia | COP (0 dec) | ≤25% | 25–32% | >32% | Effi $18.000 | Inter Rapidísimo, Envía, Servientrega, Coordinadora |
| Ecuador | USD (2 dec) | ≤25% | ≤35% | >35% | $5,36 | Gintracom, Servientrega, LaarCourier |
| Guatemala | GTQ (0 dec) | ≤22% | ≤30% | >30% | Q29,13 | Forza, Cargo Expreso |
| Costa Rica | CRC | ≤25% | ≤35% | >35% | por definir | por definir |
| Honduras | HNL | ≤25% | ≤35% | >35% | por definir | por definir |

Para Costa Rica y Honduras se usan los umbrales de Ecuador hasta tener datos reales.

**Efectividad por ciudad:** verde ≥70%, amarillo ≥50%, rojo por debajo.

## 6. Proveeduría
- El **cliente** es el distribuidor o dropshipper que despacha productos de la proveeduría. Columnas Effi: `Nombre Distribuidor` y `Nombre Proveedor`.
- **Rankings:**
  - Clientes por guías, por venta y por efectividad.
  - Productos por unidades y por venta.
  - % de devolución por cliente y por producto.
- **Fulfillment:** quién lo paga se decide por `Dirección remitente`, no por `Nombre Proveedor`.
