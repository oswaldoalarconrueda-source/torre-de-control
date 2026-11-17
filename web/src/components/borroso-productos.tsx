"use client";

import { useEffect } from "react";

// 🎬 Modo demostración (pedido del dueño, 17-nov-2026): los productos no se muestran. Todo texto que nombre un producto
// (contenido de guías, artículos de las órdenes, campañas de Meta, correos) se ve borroso, en cualquier pantalla y también
// lo que aparece después (tablas que se recargan, filtros, gráficas). Para agregar un producto nuevo, sumarlo a la lista.
const PRODUCTOS = /(DREN|LINFAT|AGUAJE|BERBERIN|MAYAVERRA|ZOO+NE|OFTALMIEL|CLOROFIL|MULLEIN|GORDOLOBO|PRIVADO (ALI|SN)|BREATY|STONE DISOLVER|CANDELA CREAM|ROMPECALCULO|NIPPORI|DEBLOAT|CURCUMA|FUNRICH|VITALDROP|AMUA|BEEVANA|PIERDPESO|ERODUS)/;
// La otra plataforma tampoco se nombra (17-nov): sus cifras van sumadas, pero los textos que la mencionan se limpian.
const PLATAFORMA = /otra p\b|dropi/i;
const sinPlataforma = (t: string) => t
  .replace(/Effi\s+[\d.,]+\s*·\s*Otra P\s+[\d.,]+/gi, "")
  .replace(/\s*·\s*Otra P[^·]*/gi, "")
  .replace(/\s+y precio de proveedor Otra P/gi, " y precio de proveedor")
  .replace(/Effi y Otra P/gi, "Effi")
  .replace(/Comisi[oó]n Otra P/gi, "Comisión de plataforma")
  .replace(/Otra P|Dropi/gi, "la plataforma")
  .trim();
const normal = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

function borrar(raiz: Node) {
  const recorrido = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  for (let n = recorrido.nextNode(); n; n = recorrido.nextNode()) {
    const el = n.parentElement;
    // Nunca dentro de scripts ni estilos: ahí viajan los datos de la página y cambiarlos la rompe.
    if (!el || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(el.tagName)) continue;
    // Etiqueta de plataforma "Ambas" (estado de resultados): también se esconde.
    if (/^\s*ambas\s*$/i.test(n.textContent ?? "") && el.tagName === "SPAN") { el.style.display = "none"; continue; }
    if (el && PLATAFORMA.test(n.textContent ?? "")) {
      // Etiqueta suelta ("Otra P"): se esconde; frase: se reescribe sin nombrarla.
      if (/^\s*(otra p|dropi)\s*$/i.test(n.textContent ?? "")) el.style.display = "none";
      else n.textContent = sinPlataforma(n.textContent ?? "");
    }
    if (!el || el.dataset.borroso || !PRODUCTOS.test(normal(n.textContent ?? ""))) continue;
    el.dataset.borroso = "1";
    el.style.filter = "blur(6px)";
    el.style.userSelect = "none";
  }
  // Campos de texto y opciones de listas con el nombre del producto, y el recuadro que sale al pasar el mouse (title).
  if (raiz instanceof Element) {
    [raiz, ...raiz.querySelectorAll<HTMLElement>("[title]")].forEach((e) => {
      const t = e.getAttribute("title");
      if (t && PRODUCTOS.test(normal(t))) e.setAttribute("title", "Producto oculto en la demostración");
      else if (t && PLATAFORMA.test(t)) { const limpio = sinPlataforma(t); if (limpio) e.setAttribute("title", limpio); else e.removeAttribute("title"); }
    });
    raiz.querySelectorAll<HTMLInputElement | HTMLOptionElement>("input, option, textarea").forEach((c) => {
      if (!c.dataset.borroso && PRODUCTOS.test(normal(c.value ?? c.textContent ?? ""))) {
        c.dataset.borroso = "1";
        c.style.filter = "blur(6px)";
      }
    });
  }
}

export function BorrosoProductos() {
  useEffect(() => {
    borrar(document.body);
    const obs = new MutationObserver((cambios) => {
      for (const c of cambios) {
        if (c.type === "characterData" && c.target.parentElement) { delete c.target.parentElement.dataset.borroso; borrar(c.target.parentElement); }
        c.addedNodes.forEach((n) => borrar(n));
      }
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => obs.disconnect();
  }, []);
  return null;
}
