"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fechaHora } from "@/lib/formato";
import { CUENTAS, ORDEN_CUENTAS } from "@/lib/paises";
import { Panel, Vacio } from "./ui";

// Extractos bancarios y cobros de Meta en CSV o PDF: se guarda el archivo original en un almacén privado, por tienda, tipo y mes.
// Todavía no se leen sus cifras: cada banco trae un formato distinto.
export type Documento = {
  id: number; tipo: "extracto_bancario" | "cobros_meta"; cuenta: string; mes: string; nota: string | null;
  archivo: string; ruta: string; bytes: number; subido_por: string | null; creado_en: string;
};
type Item = {
  key: string; archivo: File; tipo: Documento["tipo"]; cuenta: string; mes: string; nota: string;
  estado: "leido" | "subiendo" | "listo" | "error"; mensaje?: string;
};

const BUCKET = "documentos-financieros";
const MAX_BYTES = 20 * 1024 * 1024;
const NOMBRE: Record<Documento["tipo"], string> = { extracto_bancario: "Extracto bancario", cobros_meta: "Cobros de Meta" };
const campo = "w-full rounded-lg border border-line bg-transparent px-2 py-1.5 text-base sm:text-sm";

const mesAnterior = () => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const peso = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`);
const nombreMes = (mes: string) => new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${mes.slice(0, 7)}-15T12:00:00Z`));

async function huella(f: File) {
  const hash = await crypto.subtle.digest("SHA-256", await f.arrayBuffer());
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function DocumentosCarga({ documentos, usuario }: { documentos: Documento[]; usuario: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [arrastrando, setArrastrando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [confirmar, setConfirmar] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cambiar = (key: string, cambio: Partial<Item>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...cambio } : x)));

  function agregar(lista: FileList | File[]) {
    const nuevos = [...lista].map((archivo): Item => {
      const valido = /\.(csv|pdf)$/i.test(archivo.name);
      const pesado = archivo.size > MAX_BYTES;
      return {
        key: `${archivo.name}-${archivo.size}-${archivo.lastModified}`, archivo,
        tipo: /meta|facebook/i.test(archivo.name) ? "cobros_meta" : "extracto_bancario",
        cuenta: "TIENDA_CO", mes: mesAnterior(), nota: "",
        estado: valido && !pesado ? "leido" : "error",
        mensaje: !valido ? "Aquí solo se aceptan .csv y .pdf." : pesado ? "Pesa más de 20 MB." : undefined,
      };
    });
    setItems((xs) => [...xs.filter((x) => !nuevos.some((n) => n.key === x.key)), ...nuevos]);
  }

  async function guardar() {
    setSubiendo(true);
    const supabase = createClient();
    for (const it of items.filter((x) => x.estado === "leido")) {
      cambiar(it.key, { estado: "subiendo", mensaje: undefined });
      const esPdf = /\.pdf$/i.test(it.archivo.name);
      const limpio = it.archivo.name.normalize("NFD").replace(/[^\w.-]+/g, "_");
      const ruta = `${it.cuenta}/${it.tipo}/${it.mes}/${crypto.randomUUID()}-${limpio}`;
      try {
        const sha256 = await huella(it.archivo);
        const { data: repetido } = await supabase.from("app_documentos").select("id").eq("tipo", it.tipo).eq("cuenta", it.cuenta).eq("sha256", sha256).maybeSingle();
        if (repetido) { cambiar(it.key, { estado: "error", mensaje: "Este mismo archivo ya estaba subido para esa tienda." }); continue; }
        const subida = await supabase.storage.from(BUCKET).upload(ruta, it.archivo, { contentType: esPdf ? "application/pdf" : "text/csv" });
        if (subida.error) throw new Error(subida.error.message);
        const { error: e } = await supabase.from("app_documentos").insert({
          tipo: it.tipo, cuenta: it.cuenta, mes: `${it.mes}-01`, nota: it.nota.trim() || null, archivo: it.archivo.name, ruta,
          bytes: it.archivo.size, sha256, subido_por: usuario,
        });
        if (e) { await supabase.storage.from(BUCKET).remove([ruta]); throw new Error(e.message); }
        cambiar(it.key, { estado: "listo", mensaje: "Guardado" });
      } catch (e) {
        cambiar(it.key, { estado: "error", mensaje: (e as Error).message });
      }
    }
    setSubiendo(false);
    router.refresh();
  }

  async function abrir(d: Documento) {
    setError(null);
    const { data, error: e } = await createClient().storage.from(BUCKET).createSignedUrl(d.ruta, 300, { download: d.archivo });
    if (e || !data) { setError(e?.message ?? "No se pudo abrir el archivo"); return; }
    window.location.assign(data.signedUrl);
  }
  async function borrar(d: Documento) {
    setConfirmar(null); setError(null);
    const supabase = createClient();
    const { error: e } = await supabase.storage.from(BUCKET).remove([d.ruta]);
    if (e) { setError(e.message); return; }
    const { error: e2 } = await supabase.from("app_documentos").delete().eq("id", d.id);
    if (e2) setError(e2.message); else router.refresh();
  }

  const pendientes = items.filter((x) => x.estado === "leido").length;
  return (
    <Panel titulo="Extractos y cobros de Meta" detalle="CSV o PDF, hasta 20 MB. Se guarda el archivo original en un almacén privado que solo ve el dueño; todavía no se leen sus cifras.">
      <div className="space-y-3">
        <label
          onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastrando(false); agregar(e.dataTransfer.files); }}
          className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed p-6 text-center cursor-pointer transition-colors ${arrastrando ? "border-blue bg-blue/10" : "border-line hover:border-muted"}`}
        >
          <FileUp className="size-6 text-blue-2" aria-hidden />
          <div className="text-sm font-semibold">Arrastra aquí los extractos o los cobros de Meta, o haz clic para elegirlos</div>
          <input id="documentos-carga" ref={input} type="file" multiple accept=".csv,.pdf" className="sr-only"
            onChange={(e) => { if (e.target.files) agregar(e.target.files); e.target.value = ""; }} />
        </label>

        {items.map((it) => (
          <div key={it.key} className="rounded-xl border border-line p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate font-semibold" title={it.archivo.name}>{it.archivo.name}</span>
              <span className={`text-xs ${it.estado === "listo" ? "text-green" : it.estado === "error" ? "text-red" : "text-muted"}`}>
                {it.estado === "subiendo" ? <span className="inline-flex items-center gap-1 text-blue-2"><Loader2 className="size-3 animate-spin" />Subiendo</span> : it.mensaje ?? peso(it.archivo.size)}
              </span>
            </div>
            {(it.estado === "leido" || it.estado === "subiendo") && (
              <div className="grid gap-2 sm:grid-cols-4">
                <label className="text-[11px] text-muted">Tipo
                  <select value={it.tipo} disabled={it.estado !== "leido"} onChange={(e) => cambiar(it.key, { tipo: e.target.value as Documento["tipo"] })} className={`${campo} mt-0.5 text-text`}>
                    {Object.entries(NOMBRE).map(([k, v]) => <option key={k} value={k} className="bg-bg">{v}</option>)}
                  </select>
                </label>
                <label className="text-[11px] text-muted">Tienda
                  <select value={it.cuenta} disabled={it.estado !== "leido"} onChange={(e) => cambiar(it.key, { cuenta: e.target.value })} className={`${campo} mt-0.5 text-text`}>
                    {ORDEN_CUENTAS.map((c) => <option key={c} value={c} className="bg-bg">{CUENTAS[c].bandera} {CUENTAS[c].nombre}</option>)}
                  </select>
                </label>
                <label className="text-[11px] text-muted">Mes
                  <input type="month" value={it.mes} disabled={it.estado !== "leido"} onChange={(e) => cambiar(it.key, { mes: e.target.value })} className={`${campo} mt-0.5 text-text`} />
                </label>
                <label className="text-[11px] text-muted">Nota (opcional)
                  <input type="text" maxLength={120} placeholder="Banco o cuenta" value={it.nota} disabled={it.estado !== "leido"} onChange={(e) => cambiar(it.key, { nota: e.target.value })} className={`${campo} mt-0.5 text-text`} />
                </label>
              </div>
            )}
          </div>
        ))}
        {items.length > 0 && (
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={() => setItems([])} disabled={subiendo} className="text-sm text-muted hover:text-text">Limpiar lista</button>
            <button type="button" onClick={guardar} disabled={subiendo || !pendientes || items.some((x) => x.estado === "leido" && !x.mes)}
              className="rounded-xl bg-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
              {subiendo ? "Guardando…" : `Guardar ${pendientes} archivo${pendientes === 1 ? "" : "s"}`}
            </button>
          </div>
        )}
        {error && <p className="text-sm text-red">{error}</p>}

        {documentos.length ? (
          <ul className="divide-y divide-line border-t border-line">
            {documentos.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 py-2.5 text-sm">
                <div className="min-w-0 flex-1 basis-64">
                  <div className="truncate font-semibold" title={d.archivo}>{d.archivo}</div>
                  <div className="text-[11px] text-muted">
                    {NOMBRE[d.tipo]} · {CUENTAS[d.cuenta]?.bandera} {CUENTAS[d.cuenta]?.nombre ?? d.cuenta} · {nombreMes(d.mes)}{d.nota ? ` · ${d.nota}` : ""} · {peso(d.bytes)}
                  </div>
                  <div className="text-[11px] text-muted">{d.subido_por ?? "—"} · {fechaHora(d.creado_en)}</div>
                </div>
                <div className="flex items-center gap-2">
                  {confirmar === d.id ? (
                    <>
                      <span className="text-xs text-muted">¿Borrar este archivo?</span>
                      <button type="button" onClick={() => borrar(d)} className="rounded-full bg-red px-3 py-1 text-xs font-bold text-white">Sí, borrar</button>
                      <button type="button" onClick={() => setConfirmar(null)} className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-muted hover:text-text">No</button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => abrir(d)} className="rounded-full border border-line px-3 py-1 text-xs font-semibold hover:border-muted">Descargar</button>
                      <button type="button" onClick={() => setConfirmar(d.id)} className="rounded-full border border-red/40 px-3 py-1 text-xs font-semibold text-red hover:bg-red/10">Borrar</button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : <Vacio>Todavía no hay extractos ni cobros de Meta.</Vacio>}
      </div>
    </Panel>
  );
}
