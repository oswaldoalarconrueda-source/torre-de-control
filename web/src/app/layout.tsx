import type { Metadata } from "next";
import { Inter, Space_Grotesk, Space_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const grotesk = Space_Grotesk({ variable: "--font-grotesk", subsets: ["latin"], display: "swap" });
const mono = Space_Mono({ variable: "--font-space-mono", subsets: ["latin"], weight: ["400", "700"], display: "swap" });

export const metadata: Metadata = {
  title: "Torre de Control",
  description: "Guías, estados, novedades y dinero de Effi en vivo.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${inter.variable} ${grotesk.variable} ${mono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Modo claro u oscuro de cada empleado (SelectorTema): se aplica antes de pintar para que no haya destello. */}
        <script dangerouslySetInnerHTML={{ __html: `try{if(localStorage.getItem("torre-tema")==="light")document.documentElement.dataset.theme="light"}catch(e){}` }} />
      </head>
      <body className="glow-bg min-h-full">{children}</body>
    </html>
  );
}
