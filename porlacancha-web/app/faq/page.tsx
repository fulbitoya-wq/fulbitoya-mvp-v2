import type { Metadata } from "next";
import Link from "next/link";
import { MarketingLayout, PageIntro } from "@/components/landing/MarketingLayout";

export const metadata: Metadata = { title: "FAQ" };

const faqs = [
  {
    q: "¿PorLaCancha es una apuesta?",
    a: "No. Es fútbol amateur con premio. Se juega un partido real en un predio. El premio lo anuncia quien publica el desafío. No hay cuotas ni azar de casino.",
  },
  {
    q: "¿Cómo se paga?",
    a: "Si el desafío pide inscripción, pagás con tu billetera virtual de Mercado Pago. Es el mismo flujo simple de siempre: abrís, confirmás y listo.",
  },
  {
    q: "¿Cómo recibo el premio?",
    a: "Cuando el partido se juega y se confirma el resultado, el premio se acredita según las reglas de ese desafío. No es un “pago por apostar”: es el premio del partido.",
  },
  {
    q: "¿Tengo que descargar la app?",
    a: "Sí. Esta web sirve para informarte, descargar y trámites (soporte, términos, baja de cuenta). Armar equipo, inscribirse y jugar se hace en la app.",
  },
  {
    q: "¿Puedo usar PorLaCancha si tengo un predio?",
    a: "Los jugadores usan PorLaCancha. Los predios que quieren gestionar reservas se suman por FulbitoYa. Escribí a soporte y te orientamos.",
  },
  {
    q: "¿Hace falta ser mayor de edad?",
    a: "Podés crear cuenta desde los 13 años. Reservar cancha, abrir o sumarte a partidos también desde los 13. Los desafíos por la cancha (crear, aceptar o pagar) son solo para mayores de 18 con DNI y fecha de nacimiento cargados.",
  },
];

export default function FaqPage() {
  return (
    <MarketingLayout>
      <main className="mx-auto max-w-[1440px] px-5 py-12 sm:px-8 lg:px-16 lg:py-16">
        <PageIntro
          kicker="PREGUNTAS"
          title="FAQ"
          lead="Lo corto y claro. Si no está acá, escribinos a soporte."
        />

        <dl className="mt-12 max-w-3xl space-y-4">
          {faqs.map((item) => (
            <div
              key={item.q}
              className="rounded-2xl border border-[rgba(139,201,235,0.18)] bg-[#07366D]/50 p-5 sm:p-6"
            >
              <dt className="text-lg font-extrabold text-[#F7F5EF]">{item.q}</dt>
              <dd className="mt-2 text-[15px] leading-6 text-[#B8C4D6]">{item.a}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-10 text-sm text-[#B8C4D6]">
          Más detalle en{" "}
          <Link href="/como-funciona" className="font-semibold text-[#8BC9EB] underline-offset-2 hover:underline">
            Cómo funciona
          </Link>{" "}
          o en{" "}
          <Link href="/soporte" className="font-semibold text-[#8BC9EB] underline-offset-2 hover:underline">
            Soporte
          </Link>
          .
        </p>
      </main>
    </MarketingLayout>
  );
}
