import { Logo } from "./ui";
import { Salir } from "./salir";

// Pantalla para quien entró pero aún no tiene acceso: solicitud pendiente de aprobación, rechazada o desactivada.
export function SinAcceso({ motivo, nombre, email }: { motivo: "pendiente" | "sin_acceso"; nombre: string | null; email: string }) {
  return (
    <main className="min-h-dvh flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md text-center">
        <div className="flex items-center gap-2.5 justify-center mb-6">
          <Logo />
          <span className="font-display text-lg font-semibold tracking-tight">Torre de Control</span>
        </div>
        <div className="card card-glow p-7">
          <div className="text-4xl mb-3">{motivo === "pendiente" ? "⏳" : "🔒"}</div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {motivo === "pendiente" ? "Tu solicitud está en revisión" : "No tienes acceso por ahora"}
          </h1>
          <p className="text-sm text-muted mt-2">
            {motivo === "pendiente"
              ? `Hola${nombre ? `, ${nombre.split(" ")[0]}` : ""}. El administrador revisará tu registro y te dará acceso a tu tienda o sociedad. Vuelve a entrar más tarde con el mismo correo y clave.`
              : "Tu cuenta no tiene permisos activos. Si crees que es un error, habla con el administrador."}
          </p>
          <div className="mt-6 flex justify-center"><Salir email={email} /></div>
        </div>
      </div>
    </main>
  );
}
