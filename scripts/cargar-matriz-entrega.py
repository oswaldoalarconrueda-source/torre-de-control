#!/usr/bin/env python3
"""Matriz de entrega de Colombia (Excel "cvs cobertura") → public.auto_matriz_entrega en Supabase.

El Excel trae una sola columna con líneas CSV: Pais, Ciudad destino, Transportadora, % Entregada, % Devolucion,
% Exposicion, Flete entregado, Flete devolucion. Solo se cargan las transportadoras que usa el agente (sin Domina ni
TCC). Reemplaza toda la matriz del país con la función auto_matriz_cargar, que exige el token de sincronización.
Lee NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY y EFFI_SYNC_TOKEN del .env (nunca los imprime).

Uso: python3 -I scripts/cargar-matriz-entrega.py "<archivo.xlsx>"
"""
import csv, io, json, os, re, sys, unicodedata, urllib.request, zipfile
import xml.etree.ElementTree as ET

TRANSPORTADORAS = {"ENVIA": 1, "INTER RAPIDISIMO": 4, "SERVIENTREGA": 6, "COORDINADORA": 10}
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def norm(t):
    t = unicodedata.normalize("NFD", t or "")
    return "".join(c for c in t if unicodedata.category(c) != "Mn").upper().strip()


def lineas(xlsx):
    """Primera columna de la primera hoja, sin librerías externas."""
    z = zipfile.ZipFile(xlsx)
    ss = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS):
            ss.append("".join(t.text or "" for t in si.iter("{%s}t" % NS["m"])))
    hoja = sorted(n for n in z.namelist() if re.match(r"xl/worksheets/sheet\d+\.xml$", n))[0]
    for row in ET.fromstring(z.read(hoja)).iter("{%s}row" % NS["m"]):
        c = row.find("m:c", NS)
        v = c.find("m:v", NS) if c is not None else None
        if v is None:
            continue
        yield ss[int(v.text)] if c.get("t") == "s" else v.text


def env():
    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    vals = {}
    for linea in open(os.path.join(raiz, ".env")):
        m = re.match(r"^([A-Z_]+)=(.*)$", linea.strip())
        if m:
            vals[m.group(1)] = m.group(2).strip().strip('"')
    return vals["NEXT_PUBLIC_SUPABASE_URL"], vals["NEXT_PUBLIC_SUPABASE_ANON_KEY"], vals["EFFI_SYNC_TOKEN"]


def pedir(metodo, url, llave, cuerpo=None):
    req = urllib.request.Request(url, method=metodo, data=json.dumps(cuerpo).encode() if cuerpo is not None else None, headers={
        "apikey": llave, "Authorization": "Bearer " + llave, "Content-Type": "application/json", "Prefer": "return=minimal"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.status


def num(x):
    return float(x) if x not in (None, "") else None


def main(xlsx):
    filas = list(csv.DictReader(io.StringIO("\n".join(lineas(xlsx)))))
    datos, omitidas = [], {}
    for f in filas:
        t = TRANSPORTADORAS.get(norm(f["Transportadora"]))
        if t is None:
            omitidas[f["Transportadora"]] = omitidas.get(f["Transportadora"], 0) + 1
            continue
        datos.append({
            "pais": f["Pais"].strip(), "destino": f["Ciudad destino"].strip(),
            "transportadora": t, "nombre": f["Transportadora"].strip(),
            "entrega": num(f["% Entregada"]) or 0, "devol": num(f["% Devolucion"]) or 0, "exposicion": num(f["% Exposicion"]),
            "flete_entregado": int(num(f["Flete entregado"])) if num(f["Flete entregado"]) is not None else None,
            "flete_devolucion": int(num(f["Flete devolucion"])) if num(f["Flete devolucion"]) is not None else None,
        })
    # Pueblos con el mismo nombre en distintos departamentos (Bolívar, Colón…) solo se distinguen por la tilde y la
    # matriz no trae departamento: queda el dato más prudente (menor % de entrega) entre los que tienen flete.
    unicos = {}
    for d in datos:
        k = (d["pais"], norm(d["destino"]), d["transportadora"])
        ya = unicos.get(k)
        con_datos = d["flete_entregado"] is not None
        if ya is None or (con_datos and (ya["flete_entregado"] is None or d["entrega"] < ya["entrega"])):
            unicos[k] = d
    repetidas = len(datos) - len(unicos)
    datos = list(unicos.values())
    paises = sorted({d["pais"] for d in datos})
    url, llave, token = env()
    funcion = url.rstrip("/") + "/rest/v1/rpc/auto_matriz_cargar"
    for p in paises:
        del_pais = [{k: v for k, v in d.items() if k != "pais"} for d in datos if d["pais"] == p]
        for i in range(0, len(del_pais), 1000):
            pedir("POST", funcion, llave, {"p_token": token, "p_pais": p, "p_filas": del_pais[i:i + 1000], "p_borrar": i == 0})
    print(json.dumps({"filas": len(filas), "cargadas": len(datos), "omitidas": omitidas, "repetidas": repetidas, "paises": paises}, ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv[1])
