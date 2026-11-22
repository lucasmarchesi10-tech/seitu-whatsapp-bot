import type { Agente } from "@/lib/agent";
import { Bot, type WebhookPayload } from "@/lib/bot";
import type { Env } from "@/lib/config";
import { MemoryStore } from "@/lib/store";
import type { WhatsAppClient } from "@/lib/whatsapp";

export interface Enviado {
  desde: string; // local
  para: string;
  tipo: "texto" | "imagen" | "plantilla";
  texto: string;
}

/** WhatsApp falso: en vez de mandar, anota lo que se habría mandado. */
export class WhatsAppFalso implements WhatsAppClient {
  enviados: Enviado[] = [];
  private n = 0;
  constructor(private locales: Record<string, string> = {}) {}
  private id() {
    return `wamid.sim.${++this.n}`;
  }
  private local(pnid: string) {
    return this.locales[pnid] ?? pnid;
  }
  async sendText(pnid: string, to: string, body: string) {
    this.enviados.push({ desde: this.local(pnid), para: to, tipo: "texto", texto: body });
    return this.id();
  }
  async sendImage(pnid: string, to: string, link: string, caption?: string) {
    this.enviados.push({ desde: this.local(pnid), para: to, tipo: "imagen", texto: caption ? `${link} (${caption})` : link });
    return this.id();
  }
  async sendTemplate(pnid: string, to: string, name: string, lang: string, params: string[]) {
    this.enviados.push({ desde: this.local(pnid), para: to, tipo: "plantilla", texto: `[${name}/${lang}] ${params.join(" | ")}` });
    return this.id();
  }
  async markReadAndTyping() {}
}

export const SIM_NUMERO_DUENIO = "5493880000000";

/** Un bot completo pero con memoria local y WhatsApp falso, para probar sin Meta. */
export function crearSimulacion(agente: Agente, envBase: Env = process.env) {
  const env: Env = {
    ...envBase,
    WHATSAPP_PHONE_NUMBER_ID: "",
    WHATSAPP_PHONE_NUMBER_ID_CENTRO: "sim-centro",
    WHATSAPP_PHONE_NUMBER_ID_PERICO: "sim-perico",
    OWNER_PHONE: SIM_NUMERO_DUENIO,
    OWNER_PHONE_CENTRO: "",
    OWNER_PHONE_PERICO: "",
    CARTA_IMAGEN_URL: envBase.CARTA_IMAGEN_URL || "/carta-seitu.jpeg",
  };
  const store = new MemoryStore();
  const wa = new WhatsAppFalso({ "sim-centro": "SEI TU Centro", "sim-perico": "SEI TU Perico" });
  const bot = new Bot({ store, wa, agente, env, log: () => {} });
  let n = 0;

  async function enviar(opts: { local: "centro" | "perico"; de: string; texto?: string; tipo?: string; nombre?: string }) {
    const pnid = `sim-${opts.local}`;
    const tipo = opts.tipo ?? "text";
    const desde = wa.enviados.length;
    const payload: WebhookPayload = {
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: { display_phone_number: opts.local === "centro" ? "5493881111111" : "5493882222222", phone_number_id: pnid },
                contacts: [{ wa_id: opts.de, profile: { name: opts.nombre ?? "Cliente de prueba" } }],
                messages: [
                  {
                    id: `wamid.in.${Date.now()}.${++n}`,
                    from: opts.de,
                    type: tipo,
                    ...(tipo === "text" ? { text: { body: opts.texto ?? "" } } : {}),
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    await bot.procesarWebhook(payload);
    const conv = `${pnid}:${opts.de}`;
    return {
      respuestas: wa.enviados.slice(desde),
      pausado: await bot.estaPausado(conv),
    };
  }

  return { bot, wa, store, enviar };
}
