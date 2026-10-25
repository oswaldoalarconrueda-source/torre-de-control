import { Logo } from "@/components/ui";
import { RegistroForm } from "./registro-form";

// Link público para pedir acceso a la Torre: socios, empleados y proveeduría se registran aquí y el dueño los aprueba.
export default function RegistroPage() {
  return (
    <main className="min-h-dvh flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 justify-center mb-6">
          <Logo />
          <span className="font-display text-lg font-semibold tracking-tight">Torre de Control</span>
        </div>
        <div className="card card-glow p-6 sm:p-7">
          <h1 className="font-display text-2xl font-semibold tracking-tight">Solicitar acceso</h1>
          <p className="text-sm text-muted mt-1">El administrador revisa tu registro y te da acceso a tu tienda o sociedad.</p>
          <RegistroForm />
        </div>
      </div>
    </main>
  );
}
