import { Logo } from "@/components/ui";
import { NuevaClaveForm } from "./nueva-clave-form";

export default function NuevaClavePage() {
  return (
    <main className="min-h-dvh flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 justify-center mb-6">
          <Logo />
          <span className="font-display text-lg font-semibold tracking-tight">Torre de Control</span>
        </div>
        <div className="card card-glow p-6 sm:p-7">
          <h1 className="font-display text-2xl font-semibold tracking-tight">Clave nueva</h1>
          <p className="text-sm text-muted mt-1">Escríbela dos veces para confirmarla</p>
          <NuevaClaveForm />
        </div>
      </div>
    </main>
  );
}
