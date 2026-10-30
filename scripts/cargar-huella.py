#!/usr/bin/env python3
"""Huella del cliente (Excel "Huella effi - lucid", una hoja: Teléfono, Total guías, Guías entregadas, Guías devolución)
→ public.huella_matriz en Supabase. Reemplaza toda la matriz del país con la función huella_cargar, que exige el token
de sincronización. Lee NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY y EFFI_SYNC_TOKEN del .env (nunca los
imprime).

Uso: python3 -I scripts/cargar-huella.py "<archivo.xlsx>" GT "Huella effi - lucid a agosto 2026"
"""
import json, os, re, sys, urllib.request, zipfile
import xml.etree.ElementTree as ET

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
INDICATIVO = {"GT": "502", "CR": "506", "EC": "593", "CO": "57"}
LARGO = {"GT": 8, "CR": 8}
TANDA = 5000


def columna(ref):
    n = 0
    for ch in re.match(r"[A-Z]+", ref).group(0):
        n = n * 26 + ord(ch) - 64
    return n - 1


def filas(xlsx):
    """Filas de la primera hoja, leídas en flujo (el archivo trae ~800 mil filas), sin librerías externas."""
    z = zipfile.ZipFile(xlsx)
    ss = []
    if "xl/sharedStrings.xml" in z.namelist():
        for _, el in ET.iterparse(z.open("xl/sharedStrings.xml")):
            if el.tag == NS + "si":
                ss.append("".join(t.text or "" for t in el.iter(NS + "t")))
                el.clear()
    hoja = sorted(n for n in z.namelist() if re.match(r"xl/worksheets/sheet\d+\.xml$", n))[0]
    for _, el in ET.iterparse(z.open(hoja)):
        if el.tag != NS + "row":
            continue
        out = {}
        for c in el.findall(NS + "c"):
            v, t = c.find(NS + "v"), c.get("t")
            if t == "inlineStr":
                out[columna(c.get("r"))] = "".join(x.text or "" for x in c.iter(NS + "t"))
            elif v is not None:
                out[columna(c.get("r"))] = ss[int(v.text)] if t == "s" else v.text
        el.clear()
        if out:
            yield [out.get(i, "") for i in range(max(out) + 1)]


def telefono(valor, pais):
    """Solo dígitos; en Guatemala y Costa Rica, los 8 del número (sin el indicativo del país)."""
    d = re.sub(r"\D", "", str(valor or ""))
    ind, largo = INDICATIVO.get(pais, ""), LARGO.get(pais)
    if largo and len(d) == largo + len(ind) and d.startswith(ind):
        d = d[len(ind):]
    return d


def env():
    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    vals = {}
    for linea in open(os.path.join(raiz, ".env")):
        m = re.match(r"^([A-Z_]+)=(.*)$", linea.strip())
        if m:
            vals[m.group(1)] = m.group(2).strip().strip('"')
    return vals["NEXT_PUBLIC_SUPABASE_URL"], vals["NEXT_PUBLIC_SUPABASE_ANON_KEY"], vals["EFFI_SYNC_TOKEN"]


def pedir(url, llave, cuerpo):
    req = urllib.request.Request(url, method="POST", data=json.dumps(cuerpo).encode(), headers={
        "apikey": llave, "Authorization": "Bearer " + llave, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read() or b"0")


def main(xlsx, pais, fuente):
    it = filas(xlsx)
    next(it)  # encabezado
    datos, sin_tel = {}, 0
    for f in it:
        t = telefono(f[0], pais)
        if not t:
            sin_tel += 1
            continue
        n, e, d = (int(float(x or 0)) for x in (f + ["", "", ""])[1:4])
        ya = datos.get(t)  # mismo teléfono escrito de dos formas: se suman
        datos[t] = (ya[0] + n, ya[1] + e, ya[2] + d) if ya else (n, e, d)
    filas_json = [{"t": t, "n": v[0], "e": v[1], "d": v[2]} for t, v in datos.items()]
    url, llave, token = env()
    funcion = url.rstrip("/") + "/rest/v1/rpc/huella_cargar"
    cargadas = 0
    for i in range(0, len(filas_json), TANDA):
        cargadas += pedir(funcion, llave, {"p_token": token, "p_pais": pais, "p_fuente": fuente,
                                           "p_filas": filas_json[i:i + TANDA], "p_borrar": i == 0})
    print(json.dumps({"telefonos": len(filas_json), "cargadas": cargadas, "sin_telefono": sin_tel,
                      "guias": sum(v[0] for v in datos.values())}, ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3])
