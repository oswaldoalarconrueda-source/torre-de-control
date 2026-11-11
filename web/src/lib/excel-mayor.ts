// Lee el Excel de comisiones por mayor que el equipo arma y revisa a mano a partir del reporte de remisiones de Effi. Sirve el
// reporte por remisión (columnas "Total bruto" y "Costo manual") y el de detalle por artículo ("Precio bruto total" y "Costo manual
// total"), que se suma por remisión. Entran las filas del centro de costos por mayor con la cuenta por cobrar en "Pago total".
// Los valores se toman tal como vienen en el Excel: es el archivo ya revisado.

export type FilaMayorExcel = { id: number; subtotal: number; costo: number };
export type LecturaMayor = { filas: FilaMayorExcel[]; tasa: number | null; descartadas: { otroCentro: number; sinPago: number } };

const normal = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

const numero = (v: unknown) => {
  if (typeof v === "number") return v;
  const s = String(v ?? "").replace(/[^\d,.-]/g, "");
  if (!s) return NaN;
  // 1.234,56 → 1234.56 ; 1,234.56 → 1234.56
  const coma = s.lastIndexOf(","), punto = s.lastIndexOf(".");
  return Number(coma > punto ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, ""));
};

export function leerExcelMayor(filas: unknown[][]): LecturaMayor {
  const iCab = filas.findIndex((r) => r.some((c) => normal(c) === "id remision"));
  if (iCab < 0) throw new Error("No encuentro la columna «ID remisión»: sube el Excel de comisiones por mayor (reporte de remisiones de Effi).");
  const cab = filas[iCab].map(normal);
  const col = (...nombres: string[]) => { for (const n of nombres) { const i = cab.indexOf(n); if (i >= 0) return i; } return -1; };
  const iId = col("id remision");
  const iCentro = col("centro de costos");
  const iCxc = col("estado cxc");
  const iVenta = col("precio bruto total", "total bruto", "subtotal");
  const iCosto = col("costo manual total", "costo manual");
  if (iVenta < 0 || iCosto < 0) throw new Error("No encuentro las columnas de venta («Total bruto» o «Precio bruto total») y costo («Costo manual»).");

  const porId = new Map<number, FilaMayorExcel>();
  let otroCentro = 0, sinPago = 0;
  for (const r of filas.slice(iCab + 1)) {
    const id = Number(String(r[iId] ?? "").match(/(\d+)\s*$/)?.[1]);
    if (!id) continue;
    if (iCentro >= 0 && !normal(r[iCentro]).includes("mayor")) { otroCentro++; continue; }
    if (iCxc >= 0 && normal(r[iCxc]) !== "pago total") { sinPago++; continue; }
    const venta = numero(r[iVenta]), costo = numero(r[iCosto]);
    if (!Number.isFinite(venta)) continue;
    const f = porId.get(id) ?? { id, subtotal: 0, costo: 0 };
    f.subtotal += venta;
    f.costo += Number.isFinite(costo) ? costo : 0;
    porId.set(id, f);
  }

  // El porcentaje va escrito en el Excel: en un título ("20% de Utilidad") o junto al total ("Admin 10%"). Se toma el que más se repite.
  const votos = new Map<number, number>();
  for (const r of [filas[iCab], ...filas.slice(iCab + 1).filter((x) => !String(x[iId] ?? "").trim())]) {
    for (const c of r) {
      if (typeof c !== "string") continue;
      for (const m of c.matchAll(/(\d{1,2}(?:[.,]\d+)?)\s*%/g)) {
        const t = Number(m[1].replace(",", ".")) / 100;
        if (t > 0 && t <= 0.5) votos.set(t, (votos.get(t) ?? 0) + 1);
      }
    }
  }
  const tasa = [...votos.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const redondeo = (v: number) => Math.round(v * 100) / 100;
  return {
    filas: [...porId.values()].map((f) => ({ ...f, subtotal: redondeo(f.subtotal), costo: redondeo(f.costo) })),
    tasa, descartadas: { otroCentro, sinPago },
  };
}
