"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function Salir({ email }: { email: string }) {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await createClient().auth.signOut();
        router.replace("/login");
        router.refresh();
      }}
      title={email}
      className="rounded-full border border-line px-3 py-1.5 text-xs text-muted hover:text-text transition-colors"
    >
      Salir
    </button>
  );
}
