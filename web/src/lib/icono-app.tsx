// Ícono de la app instalada en el celular (pantalla de inicio): el aro azul del logo del Centro de Control sobre fondo oscuro.
// Lo dibujan apple-icon.tsx (iPhone) y las rutas /icono-192.png y /icono-512.png (manifiesto).
export function dibujoIcono(tam: number) {
  const aro = Math.round(tam * 0.46), borde = Math.max(4, Math.round(tam * 0.075));
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#04060a" }}>
      <div style={{ width: aro * 1.6, height: aro * 1.6, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
        background: "radial-gradient(circle, rgba(47,123,255,0.28) 0%, rgba(47,123,255,0) 70%)" }}>
        <div style={{ width: aro, height: aro, borderRadius: "50%", border: `${borde}px solid #4f8cff`, borderTopColor: "transparent", transform: "rotate(45deg)" }} />
      </div>
    </div>
  );
}
