"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { dinero } from "@/lib/formato";

const TIPOS = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];
const MAX = 10 * 1024 * 1024;

// Registrar el pago de un periodo: buzón para la foto del soporte, valor y fecha. Primero sube el soporte y luego guarda el pago.
export function BuzonLiquidacion({ cuenta, desde, hasta, hoy, sugerido, periodo, tipo = "drop" }: {
  cuenta: string; desde: string; hasta: string; hoy: string; sugerido: number; periodo: string; tipo?: "drop" | "mayor";
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [vista, setVista] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [monto, setMonto] = useState(sugerido > 0 ? sugerido.toFixed(2) : "");
  const [fecha, setFecha] = useState(hoy);
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Vista previa solo de lo que el navegador puede dibujar (no PDF ni HEIC).
  useEffect(() => {
    if (!archivo || !/^image\/(jpeg|png|webp)$/.test(archivo.type)) return setVista(null);
    const url = URL.createObjectURL(archivo);
    setVista(url);
    return () => URL.revokeObjectURL(url);
  }, [archivo]);

  function elegir(f: File | undefined) {
    if (!f) return;
    if (!TIPOS.includes(f.type)) return setError("Sube una foto (JPG, PNG, WEBP o HEIC) o un PDF.");
    if (f.size > MAX) return setError("El soporte pesa más de 10 MB.");
    setError(null);
    setArchivo(f);
  }

  async function registrar() {
    const valor = Number(monto);
    if (!archivo) return setError("Falta la foto del soporte.");
    if (!(valor > 0)) return setError("Escribe el valor pagado.");
    if (!fecha || fecha > hoy) return setError("Revisa la fecha de pago: no puede ser futura.");
    setGuardando(true);
    setError(null);
    const supabase = createClient();
    const ext = (archivo.name.match(/\.([a-z0-9]{2,5})$/i)?.[1] ?? "jpg").toLowerCase();
    const ruta = `${cuenta}/${tipo === "mayor" ? "mayor_" : ""}${desde}_${hasta}_${crypto.randomUUID()}.${ext}`;
    const subida = await supabase.storage.from("comisiones-soportes").upload(ruta, archivo, { contentType: archivo.type });
    if (subida.error) { setGuardando(false); return setError(`No se pudo subir el soporte: ${subida.error.message}`); }
    const { error: e } = await supabase.rpc("prov_liquidacion_registrar", {
      p_cuenta: cuenta, p_desde: desde, p_hasta: hasta, p_monto: valor, p_fecha_pago: fecha, p_nota: nota, p_soporte: ruta, p_soporte_nombre: archivo.name, p_tipo: tipo,
    });
    setGuardando(false);
    if (e) return setError(`El soporte subió, pero el pago no se guardó: ${e.message}`);
    router.refresh();
  }

  const campo = "w-full rounded-xl border border-line bg-tinte/[0.03] px-3 py-2 text-sm text-text outline-none focus:border-blue/60";
  return (
    <section className="card min-w-0 p-4 sm:p-5">
      <h2 className="font-display text-base font-semibold tracking-tight">{tipo === "mayor" ? "Registrar pago por mayor" : "Registrar pago"}</h2>
      <p className="mt-0.5 text-xs text-muted">{periodo}. Queda en el histórico con los totales de hoy y su soporte.</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          {archivo ? (
            <div className="flex items-center gap-3 rounded-xl border border-line p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {vista ? <img src={vista} alt="Vista previa del soporte" className="size-16 shrink-0 rounded-lg object-cover" /> : <div className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-tinte/[0.05] text-[11px] text-muted">Archivo</div>}
              <span className="min-w-0 flex-1 truncate text-sm" title={archivo.name}>{archivo.name}</span>
              <button type="button" onClick={() => { setArchivo(null); if (input.current) input.current.value = ""; }} aria-label="Quitar el soporte" className="rounded-lg p-2 text-muted hover:text-text"><X size={16} /></button>
            </div>
          ) : (
            <button type="button" onClick={() => input.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }} onDragLeave={() => setArrastrando(false)}
              onDrop={(e) => { e.preventDefault(); setArrastrando(false); elegir(e.dataTransfer.files[0]); }}
              className={`flex h-full min-h-32 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center text-sm transition-colors ${arrastrando ? "border-blue-2 bg-blue/10 text-text" : "border-line text-muted hover:border-blue/50 hover:text-text"}`}>
              <Upload size={20} aria-hidden />
              Arrastra aquí la foto del soporte o toca para elegirla
              <span className="text-[11px]">JPG, PNG, WEBP, HEIC o PDF, hasta 10 MB</span>
            </button>
          )}
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf" className="hidden" aria-label="Foto del soporte" onChange={(e) => elegir(e.target.files?.[0])} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-muted">Valor pagado
            <input type="number" inputMode="decimal" min="0" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} className={`${campo} num mt-1`} />
            {sugerido > 0 && <span className="mt-1 block text-[11px]">Por pagar: {dinero(sugerido, cuenta)}</span>}
          </label>
          <label className="text-xs text-muted">Fecha de pago
            <input type="date" max={hoy} value={fecha} onChange={(e) => setFecha(e.target.value)} className={`${campo} mt-1`} />
          </label>
          <label className="text-xs text-muted sm:col-span-2">Nota (opcional)
            <input value={nota} maxLength={300} onChange={(e) => setNota(e.target.value)} className={`${campo} mt-1`} />
          </label>
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-red" role="alert">{error}</p>}
      <div className="mt-4 flex justify-end">
        <button type="button" onClick={registrar} disabled={guardando} className="btn-primary inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 max-sm:w-full max-sm:justify-center">
          {guardando && <Loader2 size={15} className="animate-spin" aria-hidden />}
          {guardando ? "Guardando…" : "Registrar pago"}
        </button>
      </div>
    </section>
  );
}
