import crypto from "node:crypto";
import { config } from "@/lib/config";

/** Lo que el bot necesita para hablar con WhatsApp. En el simulador y en los tests se reemplaza. */
export interface WhatsAppClient {
  sendText(phoneNumberId: string, to: string, body: string): Promise<string | null>;
  sendImage(phoneNumberId: string, to: string, link: string, caption?: string): Promise<string | null>;
  sendTemplate(
    phoneNumberId: string,
    to: string,
    name: string,
    lang: string,
    bodyParams: string[],
  ): Promise<string | null>;
  markReadAndTyping(phoneNumberId: string, messageId: string): Promise<void>;
}

/** Valida la firma X-Hub-Signature-256 que Meta manda con cada POST. */
export function firmaValida(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!appSecret || !header?.startsWith("sha256=")) return false;
  const esperada = crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const recibida = header.slice("sha256=".length);
  const a = Buffer.from(esperada, "hex");
  const b = Buffer.from(recibida, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Los parámetros de plantilla no aceptan saltos de línea, tabs ni más de 4 espacios seguidos. */
export function limpiarParametro(s: string, max = 900): string {
  return s.replace(/[\n\r\t]+/g, " ").replace(/ {4,}/g, "   ").trim().slice(0, max) || "-";
}

export class CloudApiClient implements WhatsAppClient {
  constructor(
    private token = config().whatsappToken,
    private version = config().graphVersion,
  ) {}

  private async post(phoneNumberId: string, payload: unknown): Promise<string | null> {
    const res = await fetch(`https://graph.facebook.com/${this.version}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: unknown };
    if (!res.ok) {
      console.error("[whatsapp] error al enviar", res.status, JSON.stringify(json.error ?? json));
      throw new Error(`WhatsApp API ${res.status}`);
    }
    return json.messages?.[0]?.id ?? null;
  }

  sendText(phoneNumberId: string, to: string, body: string) {
    return this.post(phoneNumberId, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { body, preview_url: true },
    });
  }

  sendImage(phoneNumberId: string, to: string, link: string, caption?: string) {
    return this.post(phoneNumberId, {
      messaging_product: "whatsapp",
      to,
      type: "image",
      image: caption ? { link, caption } : { link },
    });
  }

  sendTemplate(phoneNumberId: string, to: string, name: string, lang: string, bodyParams: string[]) {
    return this.post(phoneNumberId, {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name,
        language: { code: lang },
        components: [
          { type: "body", parameters: bodyParams.map((t) => ({ type: "text", text: limpiarParametro(t) })) },
        ],
      },
    });
  }

  async markReadAndTyping(phoneNumberId: string, messageId: string) {
    try {
      await this.post(phoneNumberId, {
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
        typing_indicator: { type: "text" },
      });
    } catch {
      // No es crítico: si falla, seguimos igual.
    }
  }
}
