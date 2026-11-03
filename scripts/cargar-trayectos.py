#!/usr/bin/env python3
"""Matrices de cobertura de Colombia (Excel de Efficommerce) → public.auto_trayectos en Supabase.

Carga el tipo de trayecto de Envía, Inter, Servientrega (con recaudo) y Coordinadora desde cada ciudad donde hay un
remitente. Envía e Inter solo tienen matriz por centro: Floridablanca usa la de Bucaramanga y Sabaneta la de Medellín.
Reemplaza cada origen con la función auto_trayectos_cargar, que exige el token de sincronización. Lee
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY y EFFI_SYNC_TOKEN del .env (nunca los imprime).

Uso: python3 -I scripts/cargar-trayectos.py "<archivo.xlsx>"
"""
import json, os, re, sys, unicodedata, urllib.request, zipfile
import xml.etree.ElementTree as ET

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
ENVIA, INTER, SERVIENTREGA, COORDINADORA = 1, 4, 6, 10
# Origen → (columna de la hoja ENVIA, Inter, Servientrega, Coordinadora).
ORIGENES = {
    "BOGOTA": ("F", "BOGOTA", "BOGOTA", "BOGOTA (C/MARCA)"),
    "BUCARAMANGA": ("H", "BUCARAMANGA", "BUCARAMANGA", "BUCARAMANGA (STDER)"),
    "FLORIDABLANCA": ("H", "BUCARAMANGA", "FLORIDABLANCA", "FLORIDABLANCA (STDER)"),
    "SABANETA": ("N", "MEDELLIN", "SABANETA", "SABANETA (ANT)"),
}
DPTOS = {
    "C/MARCA": "CUNDINAMARCA", "CUND": "CUNDINAMARCA", "ANT": "ANTIOQUIA", "ANT.": "ANTIOQUIA", "BOY": "BOYACA", "BOYA": "BOYACA",
    "TOL": "TOLIMA", "TOLI": "TOLIMA", "NAR": "NARINO", "NARI": "NARINO", "STDER": "SANTANDER", "SANT": "SANTANDER", "S/DER.": "SANTANDER",
    "VALL": "VALLE", "VALLE DEL CAUCA": "VALLE", "CAU": "CAUCA", "CAUC": "CAUCA", "BOL": "BOLIVAR", "BOLI": "BOLIVAR", "CDAS": "CALDAS", "CALD": "CALDAS",
    "HLA": "HUILA", "HUIL": "HUILA", "CORD": "CORDOBA", "MG/LENA": "MAGDALENA", "MAGD": "MAGDALENA", "MAGD.": "MAGDALENA", "CES": "CESAR", "CESA": "CESAR",
    "ATL": "ATLANTICO", "ATLA": "ATLANTICO", "N/STDER": "NORTE DE SANTANDER", "NORT": "NORTE DE SANTANDER", "NORTE SANTANDER": "NORTE DE SANTANDER",
    "NORTE DE S/DER.": "NORTE DE SANTANDER", "NORTE SANT.": "NORTE DE SANTANDER", "C/NARE": "CASANARE", "CASA": "CASANARE", "CHOC": "CHOCO", "SUCR": "SUCRE",
    "P/MAYO": "PUTUMAYO", "PUTU": "PUTUMAYO", "GUAJ": "GUAJIRA", "LA GUAJIRA": "GUAJIRA", "RS": "RISARALDA", "RISA": "RISARALDA", "QDIO": "QUINDIO", "QUIN": "QUINDIO",
    "CAQ": "CAQUETA", "CAQU": "CAQUETA", "ARAU": "ARAUCA", "VICH": "VICHADA", "S/ANDRES": "SAN ANDRES", "ARCH": "SAN ANDRES", "AMAZ": "AMAZONAS",
    "G/VIARE": "GUAVIARE", "GUAV": "GUAVIARE", "V/PES": "VAUPES", "VAUP": "VAUPES", "GUAI": "GUAINIA",
}
VALIDOS = set(DPTOS.values()) | {"META"}
NOMBRES_DPTO = VALIDOS | {"VALLE DEL CAUCA", "LA GUAJIRA"}


def norm(t):
    t = unicodedata.normalize("NFD", t or "")
    return re.sub(r"\s+", " ", "".join(c for c in t if unicodedata.category(c) != "Mn").upper()).strip()


def dpto(t):
    n = norm(t)
    n = DPTOS.get(n, n)
    return n if n in VALIDOS else ""


def destino_inter(nombre, columna):
    """Inter pega el departamento o el municipio al nombre: ARMENIA_QUINDIO, GRANADA META, EL BORDO PATIA, LA HORMIGA /VALLE DEL GUAMUEZ."""
    n = norm(nombre.split("/")[0].replace("_", " "))
    dp = dpto(columna)
    if n == "PUERTO BOYACA":
        return n, "BOYACA"
    for sufijo in sorted(NOMBRES_DPTO, key=len, reverse=True):
        # "SAN JUAN DEL CESAR" y "CIUDAD BOLIVAR" (Antioquia) son el nombre del pueblo, no su departamento.
        if n.endswith(" " + sufijo) and not re.search(r"\b(DE|DEL|LA)$", n[: -len(sufijo)].strip()) and dp in ("", dpto(sufijo)):
            n, dp = n[: -len(sufijo)].strip(), dpto(sufijo)
            break
    return {"EL BORDO PATIA": "EL BORDO", "PAEZ BELALCAZAR": "PAEZ"}.get(n, n), dp


class Libro:
    def __init__(self, xlsx):
        self.z = zipfile.ZipFile(xlsx)
        self.ss = []
        with self.z.open("xl/sharedStrings.xml") as f:
            for _, el in ET.iterparse(f):
                if el.tag == NS + "si":
                    self.ss.append("".join(t.text or "" for t in el.iter(NS + "t")))
                    el.clear()
        wb = ET.fromstring(self.z.read("xl/workbook.xml"))
        rels = {r.get("Id"): r.get("Target") for r in ET.fromstring(self.z.read("xl/_rels/workbook.xml.rels"))}
        self.hojas = {}
        for s in wb.find(NS + "sheets"):
            t = rels[s.get(REL + "id")].lstrip("/")
            self.hojas[s.get("name")] = t if t.startswith("xl/") else "xl/" + t

    def filas(self, hoja):
        """Cada fila de datos (el encabezado está en la 2) como {columna: texto}."""
        with self.z.open(self.hojas[hoja]) as f:
            for _, el in ET.iterparse(f):
                if el.tag != NS + "row":
                    continue
                d = {}
                for c in el.findall(NS + "c"):
                    v = c.find(NS + "v")
                    if v is not None:
                        d[re.match(r"[A-Z]+", c.get("r")).group()] = (self.ss[int(v.text)] if c.get("t") == "s" else v.text).strip()
                r = int(el.get("r"))
                el.clear()
                if r > 2:
                    yield d


def entre_parentesis(t):
    m = re.search(r"\((.*?)\)", t or "")
    return m.group(1).strip() if m else ""


def leer(libro):
    salida = {o: [] for o in ORIGENES}
    for d in libro.filas("ENVIA"):
        for o, (columna, *_) in ORIGENES.items():
            if d.get(columna) and d.get("A"):
                salida[o].append({"transportadora": ENVIA, "destino": d["A"], "dpto": dpto(entre_parentesis(d["A"])), "tipo": d[columna], "recaudo": bool(d.get("B"))})
    inter = {v[1]: o for o, v in ORIGENES.items()}
    for d in libro.filas("INTER RAPIDISIMO"):
        origen = norm(d.get("A"))
        if origen in inter and d.get("B"):
            destino, dp = destino_inter(d["B"], d.get("D"))
            fila = {"transportadora": INTER, "destino": destino, "dpto": dp, "tipo": norm(d.get("E")), "recaudo": norm(d.get("F")) != "NO"}
            for o, v in ORIGENES.items():
                if v[1] == origen:
                    salida[o].append(fila)
    servi = {v[2]: o for o, v in ORIGENES.items()}
    for d in libro.filas("SERVIENTREGA CON RECAUDO"):
        o = servi.get(norm(d.get("B")))
        if o and norm(d.get("A")) == {"BOGOTA": "CUNDINAMARCA", "SABANETA": "ANTIOQUIA"}.get(o, "SANTANDER") and d.get("D"):
            salida[o].append({"transportadora": SERVIENTREGA, "destino": d["D"], "dpto": dpto(d.get("C")), "tipo": norm(d.get("F")), "recaudo": True})
    coord = {v[3]: o for o, v in ORIGENES.items()}
    for d in libro.filas("COORDINADORA"):
        o = coord.get(norm(d.get("A")))
        if o and d.get("B"):
            salida[o].append({"transportadora": COORDINADORA, "destino": d["B"], "dpto": dpto(entre_parentesis(d["B"])), "tipo": norm(d.get("C")), "recaudo": None})
    return salida


def env():
    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    vals = {}
    for linea in open(os.path.join(raiz, ".env")):
        m = re.match(r"^([A-Z_]+)=(.*)$", linea.strip())
        if m:
            vals[m.group(1)] = m.group(2).strip().strip('"')
    return vals["NEXT_PUBLIC_SUPABASE_URL"], vals["NEXT_PUBLIC_SUPABASE_ANON_KEY"], vals["EFFI_SYNC_TOKEN"]


def main(xlsx):
    url, llave, token = env()
    funcion = url.rstrip("/") + "/rest/v1/rpc/auto_trayectos_cargar"
    resumen = {}
    for origen, filas in leer(Libro(xlsx)).items():
        insertadas = 0
        for i in range(0, len(filas), 1000):
            req = urllib.request.Request(funcion, method="POST", data=json.dumps({"p_token": token, "p_origen": origen, "p_filas": filas[i:i + 1000], "p_borrar": i == 0}).encode(), headers={
                "apikey": llave, "Authorization": "Bearer " + llave, "Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=120) as r:
                insertadas += json.load(r)
        resumen[origen] = {"leidas": len(filas), "cargadas": insertadas}
    print(json.dumps(resumen, ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv[1])
