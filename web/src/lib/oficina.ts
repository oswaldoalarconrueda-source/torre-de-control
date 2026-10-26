// Observaciones del CRM de oficina: lista cerrada agrupada a partir de lo que el equipo escribía en Drive.
// "retira_fecha" pide la fecha que prometió el cliente para recoger (hoy o después) y "otro" pide escribir lo que dijo
// el cliente (lo único de texto libre).

export type CodigoObs =
  | "retira_fecha" | "ya_retiro" | "sin_respuesta" | "colgo" | "no_desea"
  | "no_puede_ahora" | "numero_incorrecto" | "numero_ajeno" | "numero_no_disponible" | "otro";

export const OBSERVACIONES: Record<CodigoObs, { label: string; color: string }> = {
  retira_fecha: { label: "El cliente realizará el retiro del producto el…", color: "var(--green)" },
  ya_retiro: { label: "El cliente ya realizó el retiro del producto en la oficina", color: "var(--green)" },
  sin_respuesta: { label: "Se realizan los intentos de llamada sin respuesta del cliente", color: "var(--amber)" },
  colgo: { label: "El cliente contestó y finalizó la llamada al informarle", color: "var(--amber)" },
  no_puede_ahora: { label: "El cliente no puede retirar el producto por el momento", color: "var(--amber)" },
  no_desea: { label: "El cliente ya no desea adquirir el producto", color: "var(--red)" },
  numero_incorrecto: { label: "El número proporcionado es incorrecto", color: "#b48cff" },
  numero_ajeno: { label: "El número proporcionado no le corresponde al cliente", color: "#b48cff" },
  numero_no_disponible: { label: "Número no disponible (suspendido o fuera de área)", color: "#b48cff" },
  otro: { label: "Otro (escribir lo que dijo el cliente)", color: "#c9d3ea" },
};
export const PREFIJO_OTRO = "Otro: ";

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
// Texto que queda guardado junto al código, igual al que se usaba en Drive.
export function textoObservacion(codigo: CodigoObs, fecha: string | null, texto?: string | null) {
  if (codigo === "otro") return `${PREFIJO_OTRO}${(texto ?? "").trim()}`;
  if (codigo !== "retira_fecha" || !fecha) return OBSERVACIONES[codigo].label + ".";
  const d = new Date(`${fecha}T12:00:00Z`);
  return `El cliente realizará el retiro del producto el ${DIAS[d.getUTCDay()]} ${fecha.slice(8, 10)}/${fecha.slice(5, 7)}/${fecha.slice(0, 4)}.`;
}
