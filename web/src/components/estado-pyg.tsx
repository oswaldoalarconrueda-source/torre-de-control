import { Info } from "lucide-react";
import type { Filtros } from "@/lib/filtros";
import { kpiDespacho, kpiUtilidad, type Plataforma } from "@/lib/datos";
import { PygWallet, type LineaPyg } from "./pyg-wallet";

// "Estado de PyG según movimientos de wallet" del Dashboard Joalix: wallet Effi + cartera Dropi de las
// guías y órdenes montadas en el periodo (siempre por la fecha de origen de la guía), más publicidad,
// proyección de pendientes y gastos del mes. Las casillas recalculan la utilidad en pantalla.

const INGRESOS = ["Recaudo de venta", "Entrada por garantía", "Entrada por indemnización", "Débito revertido", "Ganancia de órdenes no cargadas"];

export async function EstadoPyG({ f, plataforma }: { f: Filtros; plataforma: Plataforma }) {
  const cuenta = f.cuentas?.[0] ?? "TIENDA_CO";
  const [{ data: d }, { data: u, error }] = await Promise.all([
    kpiDespacho(cuenta, f.desde, f.hasta, plataforma),
    kpiUtilidad(cuenta, f.desde, f.hasta, plataforma),
  ]);
  if (!u || !d) return <p className="text-sm text-red">No se pudo calcular el estado de PyG: {error}</p>;

  const lineas: LineaPyg[] = [
    ...u.pyg.map((l) => ({
      key: `${l.plataforma}|${l.concepto}`, plataforma: l.plataforma, concepto: l.concepto, n: l.n, monto: Number(l.monto),
      tipo: INGRESOS.includes(l.concepto) || (l.concepto === "Transferencias entre wallets" && Number(l.monto) > 0) ? "ingreso" as const : "egreso" as const,
      excluidoInicial: l.excluido, aFlujo: l.excluido,
    })),
    { key: "Ambas|Inversión Ads", plataforma: "Ambas", concepto: "Inversión Ads (Meta)", n: null, monto: -(u.publicidad.total ?? 0), tipo: "egreso", excluidoInicial: false },
    ...(u.proyeccion.detalle ?? []).map((p) => ({
      key: `${p.plataforma}|Proyección`, plataforma: p.plataforma, concepto: "Proyección: pendientes → devolución", n: null, monto: -p.total,
      tipo: "egreso" as const, excluidoInicial: false, nota: `${p.n} pendientes`,
    })),
    { key: "Ambas|Apps", plataforma: "Ambas", concepto: "Gastos por aplicaciones", n: null, monto: -u.gastos.apps.total, tipo: "egreso", excluidoInicial: false },
    { key: "Ambas|Admin", plataforma: "Ambas", concepto: "Gastos administrativos", n: null, monto: -u.gastos.admin.total, tipo: "egreso", excluidoInicial: false },
    { key: "Ambas|Operativo", plataforma: "Ambas", concepto: "Gasto operativo", n: null, monto: -u.gastos.operativo.total, tipo: "egreso", excluidoInicial: false },
  ];

  return (
    <section className="card p-4 sm:p-5 min-w-0 mt-3">
      <header className="flex items-center gap-2 mb-4">
        <h2 className="font-display text-lg font-semibold tracking-tight">Estado de PyG según movimientos de wallet</h2>
        <span title="Wallet de Effi y cartera de las guías y órdenes montadas en el periodo: siempre por la fecha de origen de la guía. Los retiros y transferencias no son utilidad (van al Flujo de Caja). Marca o desmarca conceptos para recalcular." className="text-muted">
          <Info size={15} />
        </span>
      </header>
      <PygWallet cuenta={cuenta} lineas={lineas} despachos={d.despachado.n} entregas={d.entregado.n} variasPlataformas={!!(d.plataformas.effi && d.plataformas.dropi)} />
    </section>
  );
}
