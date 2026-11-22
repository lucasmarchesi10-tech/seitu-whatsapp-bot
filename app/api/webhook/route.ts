import { after, type NextRequest } from "next/server";
import { config } from "@/lib/config";
import { botProduccion } from "@/lib/instancia";
import { firmaValida } from "@/lib/whatsapp";
import type { WebhookPayload } from "@/lib/bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Verificación del webhook: Meta llama una vez con hub.challenge al configurarlo. */
export function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const { verifyToken } = config();
  if (p.get("hub.mode") === "subscribe" && verifyToken && p.get("hub.verify_token") === verifyToken) {
    return new Response(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

/** Mensajes entrantes. Respondemos 200 enseguida y procesamos después (after). */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!firmaValida(raw, req.headers.get("x-hub-signature-256"), config().appSecret)) {
    console.warn("[webhook] firma inválida, descarto");
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("OK", { status: 200 });
  }

  after(() => botProduccion().procesarWebhook(payload));
  return new Response("OK", { status: 200 });
}
