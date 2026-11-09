// Sugerencia de producto para una campaña sin identificar, por las palabras del nombre: "MELAXIN PEEL SHOT HN" →
// "Dr. Melaxin Peel Shot". Solo sugiere; el dueño o un socio la acepta con un clic.
//
// Cada palabra del producto (sin las genéricas) que aparece completa en la campaña vale 2 (las de 3 letras, como ORO o
// NAD, solo si están como palabra suelta); si una palabra de la campaña empieza con sus primeras 4 letras
// (BEEVCBO → Beevana), vale 1, pero eso solo no alcanza cuando el producto tiene varias palabras. Gana el puntaje más
// alto; si empatan, el que tenga más palabras encontradas en proporción y luego el más vendido. Con un empate total
// entre productos distintos no sugiere.
// "segura": encontró todas las palabras del producto o al menos dos completas, y además cada palabra propia de la
// campaña está en el producto (así "FUNDA FIBRA DE CARBONO" no se toma por "Cinta Fibra De Carbono"). Solo las seguras
// entran en "Aceptar todas"; las demás se muestran para revisar una por una.

const GENERICAS = new Set([
  "PARA", "CON", "SIN", "POR", "LOS", "LAS", "DEL", "UNA", "UNO", "TODO", "TODA", "ENVIO", "GRATIS", "PRIORITARIO",
  "ORIGINAL", "PACK", "CAPS", "CAPSULAS", "GOTAS", "CREMA", "SPRAY", "PROFESIONAL", "PORTATIL", "CAP", "MTS", "MAX",
  "LIBRA", "PRODUCTO", "PROMO", "OFERTA", "NUEVO", "NUEVA", "VIDEO", "IMAGEN", "LANDING", "CAMPANA", "TESTEO", "VENTAS",
  "PRO", "WSP", "TESTING", "TEST", "COPIA", "PRUEBA", "WHATSAPP", "WHATSAAP", "INTERACCION", "TRAFICO", "ESCALADO",
]);

const limpiar = (t: string) =>
  t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();

const palabras = (producto: string) =>
  [...new Set(limpiar(producto).split(" ").filter((p) => p.length >= 3 && !GENERICAS.has(p) && !/\d/.test(p)))];

export type Sugerible = { producto: string; guias: number };

export type Sugerencia = { producto: string; segura: boolean };

export function sugerirProducto(campana: string, productos: Sugerible[]): Sugerencia | null {
  const c = limpiar(campana);
  const cJunta = c.replace(/ /g, "");
  const cPal = c.split(" ");
  let mejor: { producto: string; puntos: number; prop: number; guias: number } | null = null;
  let empate = false;
  for (const p of productos) {
    const ws = palabras(p.producto);
    if (!ws.length) continue;
    let puntos = 0, halladas = 0;
    for (const w of ws) {
      if (w.length === 3 ? cPal.includes(w) : c.includes(w) || cJunta.includes(w)) { puntos += 2; halladas++; }
      else if (w.length >= 5 && cPal.some((x) => x.startsWith(w.slice(0, 4)))) { puntos += 1; halladas++; }
    }
    if (!puntos || (puntos === 1 && ws.length > 1)) continue;
    const cand = { producto: p.producto, puntos, prop: halladas / ws.length, guias: Number(p.guias) || 0 };
    if (!mejor || cand.puntos > mejor.puntos || (cand.puntos === mejor.puntos && cand.prop > mejor.prop)) {
      mejor = cand; empate = false;
    } else if (cand.puntos === mejor.puntos && cand.prop === mejor.prop) {
      if (cand.guias > mejor.guias) { mejor = cand; empate = false; }
      else if (cand.guias === mejor.guias) empate = true;
    }
  }
  if (!mejor || empate) return null;
  const prodPal = limpiar(mejor.producto).split(" ").filter((x) => x.length >= 3);
  const cubre = palabras(campana).filter((w) => w.length >= 4)
    .every((w) => prodPal.some((x) => x.startsWith(w) || w.startsWith(x) || (w.length >= 5 && x.startsWith(w.slice(0, 4)))));
  return { producto: mejor.producto, segura: (mejor.prop === 1 || mejor.puntos >= 4) && cubre };
}
