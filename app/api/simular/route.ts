import type { NextRequest } from "next/server";
import { ClaudeAgent } from "@/lib/agent";
import { crearSimulacion } from "@/lib/simulador";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

let sim: ReturnType<typeof crearSimulacion> | null = null;

/** En tu compu siempre anda. En Vercel solo si cargaste SIMULADOR_CLAVE y la mandás. */
function permitido(req: NextRequest, clave?: string) {
  if (process.env.NODE_ENV !== "production") return true;
  const esperada = process.env.SIMULADOR_CLAVE;
  return Boolean(esperada) && clave === esperada;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    local?: "centro" | "perico";
    de?: string;
    texto?: string;
    tipo?: string;
    reiniciar?: boolean;
    clave?: string;
  };
  if (!permitido(req, body.clave)) {
    return Response.json({ error: "Simulador deshabilitado. Cargá SIMULADOR_CLAVE en Vercel." }, { status: 403 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "Falta ANTHROPIC_API_KEY en las variables de entorno." }, { status: 500 });
  }
  if (body.reiniciar || !sim) sim = crearSimulacion(new ClaudeAgent());
  if (body.reiniciar) return Response.json({ ok: true });

  const inicio = Date.now();
  const r = await sim.enviar({
    local: body.local === "perico" ? "perico" : "centro",
    de: (body.de || "5493884000000").replace(/\D/g, ""),
    texto: body.texto,
    tipo: body.tipo,
  });
  return Response.json({ ...r, ms: Date.now() - inicio });
}
