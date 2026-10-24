"use client";

import { useState } from "react";
import { FlujoWallet } from "@/components/charts";
import { dinero } from "@/lib/formato";
import { infoCuenta } from "@/lib/paises";

export function FlujoDinero({ filas, cuentas }: { filas: { fecha: string; cuenta: string; grupo: string; total: number }[]; cuentas: string[] }) {
  const [cuenta, setCuenta] = useState(cuentas[0]);
  return (
    <>
      <div className="flex gap-1.5 mb-3">
        {cuentas.map((c) => (
          <button
            key={c}
            onClick={() => setCuenta(c)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${c === cuenta ? "border-blue/50 bg-blue/15 text-text" : "border-line text-muted hover:text-text"}`}
          >
            {infoCuenta(c).bandera} {infoCuenta(c).nombre}
          </button>
        ))}
      </div>
      <FlujoWallet filas={filas.filter((f) => f.cuenta === cuenta)} moneda={(v) => dinero(v, cuenta, true)} />
    </>
  );
}
