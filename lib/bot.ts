import type { Agente, Decision, Turno } from "@/lib/agent";
import {
  config,
  localPorPhoneNumberId,
  MAX_HISTORIAL,
  PAUSA_HUMANO_SEGUNDOS,
  soloDigitos,
  VENTANA_SERVICIO_MS,
  type LocalConfig,
  type Env,
} from "@/lib/config";
import { cartaParaWhatsApp, partirMensaje } from "@/lib/negocio";
import type { Store } from "@/lib/store";
import type { WhatsAppClient } from "@/lib/whatsapp";

// ---- Tipos mínimos del webhook de Meta (solo lo que usamos) ----
interface WaMessage {
  id: string;
  from: string;
  timestamp?: string;
  type: string;
  text?: { body: string };
  interactive?: { button_reply?: { title: string }; list_reply?: { title: string } };
  button?: { text: string };
  group_id?: string;
  context?: { group_id?: string };
}
interface WaStatus {
  id: string;
  status: string;
  recipient_id: string;
  errors?: { code: number; title?: string }[];
}
interface WaValue {
  messaging_product?: string;
  metadata?: { display_phone_number: string; phone_number_id: string };
  contacts?: { wa_id: string; profile?: { name?: string } }[];
  messages?: WaMessage[];
  statuses?: WaStatus[];
  message_echoes?: { from: string; to: string; id: string }[];
}
export interface WebhookPayload {
  object?: string;
  entry?: { changes?: { field: string; value: WaValue }[] }[];
}

export const RESPUESTA_SOLO_TEXTO =
  "¡Gracias por tu mensaje! Por ahora solo puedo leer mensajes de texto 🙏 ¿Me lo escribís?";
export const RESPUESTA_ERROR =
  "¡Hola! Ya le aviso al equipo y una persona te responde a la brevedad 🙌";

const TIPOS_MULTIMEDIA = new Set(["audio", "voice", "image", "video", "sticker", "document", "location", "contacts"]);
const DIAS = 24 * 60 * 60;

const k = {
  procesado: (id: string) => `seitu:msg:${id}`,
  historial: (c: string) => `seitu:hist:${c}`,
  pausa: (c: string) => `seitu:pausa:${c}`,
  ultimo: (c: string) => `seitu:ultimo:${c}`,
  duenioEscribio: (pnid: string, owner: string) => `seitu:owner_in:${pnid}:${owner}`,
  aviso: (id: string) => `seitu:aviso:${id}`,
};

export interface BotDeps {
  store: Store;
  wa: WhatsAppClient;
  agente: Agente;
  ahora?: () => Date;
  env?: Env;
  log?: (...a: unknown[]) => void;
}

function reenviarAlDuenio(env: Env): boolean {
  return /^(si|sí|true|1)$/i.test(env.REENVIAR_AL_DUENIO ?? "");
}

export function textoDelMensaje(m: WaMessage): string | null {
  if (m.type === "text") return m.text?.body ?? null;
  if (m.type === "interactive") return m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? null;
  if (m.type === "button") return m.button?.text ?? null;
  return null;
}

export class Bot {
  private store: Store;
  private wa: WhatsAppClient;
  private agente: Agente;
  private ahora: () => Date;
  private env: Env;
  private log: (...a: unknown[]) => void;

  constructor(d: BotDeps) {
    this.store = d.store;
    this.wa = d.wa;
    this.agente = d.agente;
    this.ahora = d.ahora ?? (() => new Date());
    this.env = d.env ?? process.env;
    this.log = d.log ?? ((...a) => console.log("[bot]", ...a));
  }

  async procesarWebhook(payload: WebhookPayload): Promise<void> {
    const tareas: Promise<void>[] = [];
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const v = change.value;
        if (change.field === "messages") {
          for (const s of v.statuses ?? []) tareas.push(this.procesarEstado(v, s));
          for (const m of v.messages ?? []) tareas.push(this.procesarMensaje(v, m));
        } else if (change.field === "smb_message_echoes") {
          // Coexistencia: alguien del equipo respondió desde la app WhatsApp Business.
          for (const e of v.message_echoes ?? []) tareas.push(this.humanoRespondioDesdeApp(v, e.to));
        }
      }
    }
    const res = await Promise.allSettled(tareas);
    for (const r of res) if (r.status === "rejected") this.log("error procesando", r.reason);
  }

  // ---------------------------------------------------------------------------

  private async procesarMensaje(v: WaValue, m: WaMessage): Promise<void> {
    const pnid = v.metadata?.phone_number_id;
    if (!pnid || !m.from || !m.id) return;

    // Grupos y mensajes propios: no se responden.
    if (m.group_id || m.context?.group_id) return;
    if (soloDigitos(m.from) === soloDigitos(v.metadata?.display_phone_number)) return;

    // Deduplicar: Meta puede reenviar el mismo mensaje varias veces.
    const nuevo = await this.store.set(k.procesado(m.id), "1", { ttlSeconds: 3 * DIAS, onlyIfNew: true });
    if (!nuevo) return;

    const local = localPorPhoneNumberId(pnid, this.env);
    const cliente = m.from;
    const conv = `${pnid}:${cliente}`;
    const nombre = v.contacts?.find((c) => c.wa_id === cliente)?.profile?.name ?? "";

    // ¿Es el dueño/encargado? Guardamos que escribió (abre la ventana de 24 h para avisos)
    // y atendemos comandos "bot on/off".
    if (local.ownerPhone && soloDigitos(cliente) === local.ownerPhone) {
      await this.store.set(k.duenioEscribio(pnid, local.ownerPhone), String(this.ahora().getTime()), {
        ttlSeconds: 2 * DIAS,
      });
      const texto = textoDelMensaje(m) ?? "";
      if (await this.comandoDuenio(pnid, cliente, texto)) return;
    }

    if (m.type === "reaction" || m.type === "unsupported" || m.type === "system" || m.type === "request_welcome") {
      return;
    }

    const texto = textoDelMensaje(m);
    const descripcion = texto ?? `[mandó un mensaje de tipo ${m.type}]`;

    // Si está derivado a una persona, el bot no contesta: solo guarda el mensaje.
    if (await this.estaPausado(conv)) {
      await this.guardarTurno(conv, { rol: "cliente", texto: descripcion });
      this.log(`pausado ${conv}, no respondo`);
      if (reenviarAlDuenio(this.env) && local.ownerPhone && soloDigitos(cliente) !== local.ownerPhone) {
        const quien = nombre ? `${nombre} (+${cliente})` : `+${cliente}`;
        await this.wa
          .sendText(pnid, local.ownerPhone, `💬 ${quien}: ${descripcion}\n\nPara contestarle: r ${cliente} tu mensaje`)
          .catch((e) => this.log("no se pudo reenviar al dueño", e));
      }
      return;
    }

    void this.wa.markReadAndTyping(pnid, m.id);

    if (texto === null) {
      await this.guardarTurno(conv, { rol: "cliente", texto: descripcion });
      if (TIPOS_MULTIMEDIA.has(m.type)) await this.responder(pnid, conv, cliente, RESPUESTA_SOLO_TEXTO);
      return;
    }

    await this.guardarTurno(conv, { rol: "cliente", texto });
    await this.store.set(k.ultimo(conv), m.id, { ttlSeconds: DIAS });

    let decision: Decision;
    try {
      const historial = await this.historial(conv);
      decision = await this.agente.decidir({ local, historial, ahora: this.ahora() });
    } catch (err) {
      this.log("falló el agente, derivo", err);
      decision = {
        tema: "otro",
        respuesta: RESPUESTA_ERROR,
        enviar_carta: false,
        derivar: true,
        motivo: "el bot no pudo responder (error técnico)",
      };
    }

    // Si mientras pensábamos llegó otro mensaje del mismo cliente, contesta ese
    // (que ya tiene todo el contexto) y este no, para no mandar dos respuestas.
    if (!decision.derivar && (await this.store.get(k.ultimo(conv))) !== m.id) {
      this.log(`mensaje ${m.id} superado por uno más nuevo, no respondo`);
      return;
    }

    await this.responder(pnid, conv, cliente, decision.respuesta);

    if (decision.enviar_carta) {
      for (const parte of partirMensaje(cartaParaWhatsApp())) {
        await this.wa.sendText(pnid, cliente, parte);
      }
      const img = config(this.env).cartaImagenUrl;
      if (img) await this.wa.sendImage(pnid, cliente, img).catch((e) => this.log("no se pudo mandar la imagen", e));
    }

    if (decision.derivar) {
      await this.derivar(local, conv, cliente, nombre, decision.motivo || "necesita atención", texto);
    }
  }

  private async responder(pnid: string, conv: string, to: string, texto: string) {
    await this.wa.sendText(pnid, to, texto);
    await this.guardarTurno(conv, { rol: "bot", texto });
  }

  private async guardarTurno(conv: string, t: Turno) {
    await this.store.pushTrim(k.historial(conv), JSON.stringify(t), MAX_HISTORIAL, 7 * DIAS);
  }

  async historial(conv: string): Promise<Turno[]> {
    const raw = await this.store.list(k.historial(conv));
    return raw.map((r) => JSON.parse(r) as Turno);
  }

  async estaPausado(conv: string): Promise<boolean> {
    return (await this.store.get(k.pausa(conv))) !== null;
  }

  private async derivar(local: LocalConfig, conv: string, cliente: string, nombre: string, motivo: string, ultimo: string) {
    await this.store.set(k.pausa(conv), String(this.ahora().getTime()), { ttlSeconds: PAUSA_HUMANO_SEGUNDOS });
    this.log(`derivado ${conv}: ${motivo}`);
    await this.avisarDuenio(local, cliente, nombre, motivo, ultimo).catch((e) => this.log("no se pudo avisar al dueño", e));
  }

  /**
   * Avisa al dueño. Si escribió al número del local en las últimas 24 h, va un mensaje
   * normal; si no, WhatsApp exige una plantilla aprobada (OWNER_ALERT_TEMPLATE).
   */
  async avisarDuenio(local: LocalConfig, cliente: string, nombre: string, motivo: string, ultimo: string) {
    const owner = local.ownerPhone;
    const pnid = local.phoneNumberId;
    if (!owner || !pnid) {
      this.log("OWNER_PHONE o phone_number_id sin configurar: no aviso");
      return;
    }
    const cfg = config(this.env);
    const quien = nombre ? `${nombre} (+${cliente})` : `+${cliente}`;
    const params = [local.nombre, quien, `${motivo}. Último mensaje: "${ultimo.slice(0, 300)}"`];

    const ultimaVez = Number((await this.store.get(k.duenioEscribio(pnid, owner))) ?? 0);
    const dentroDeVentana = this.ahora().getTime() - ultimaVez < VENTANA_SERVICIO_MS;

    if (dentroDeVentana || !cfg.plantillaAviso) {
      const texto =
        `🔔 *${local.nombre}*: un cliente necesita atención.\n` +
        `Cliente: ${quien}\nMotivo: ${motivo}\nÚltimo mensaje: "${ultimo.slice(0, 500)}"\n\n` +
        `El bot no le va a responder a ese número por 12 h. Para reactivarlo antes, mandá: bot on ${cliente}`;
      const id = await this.wa.sendText(pnid, owner, texto);
      // Si WhatsApp lo rechaza por estar fuera de la ventana, se reintenta con la plantilla.
      if (id && cfg.plantillaAviso) {
        await this.store.set(k.aviso(id), JSON.stringify({ pnid, owner, params }), { ttlSeconds: 2 * DIAS });
      }
    } else {
      await this.wa.sendTemplate(pnid, owner, cfg.plantillaAviso, cfg.plantillaAvisoIdioma, params);
    }
  }

  private async procesarEstado(v: WaValue, s: WaStatus) {
    if (s.status !== "failed") return;
    const raw = await this.store.get(k.aviso(s.id));
    if (!raw) return;
    await this.store.del(k.aviso(s.id));
    const fueraDeVentana = s.errors?.some((e) => e.code === 131047 || e.code === 131026);
    const cfg = config(this.env);
    if (!fueraDeVentana || !cfg.plantillaAviso) return;
    const { pnid, owner, params } = JSON.parse(raw) as { pnid: string; owner: string; params: string[] };
    this.log("aviso fuera de ventana de 24 h, reenvío con plantilla");
    await this.wa.sendTemplate(pnid, owner, cfg.plantillaAviso, cfg.plantillaAvisoIdioma, params);
  }

  private async humanoRespondioDesdeApp(v: WaValue, cliente: string) {
    const pnid = v.metadata?.phone_number_id;
    if (!pnid || !cliente) return;
    await this.store.set(k.pausa(`${pnid}:${cliente}`), String(this.ahora().getTime()), {
      ttlSeconds: PAUSA_HUMANO_SEGUNDOS,
    });
  }

  /**
   * Comandos del dueño (escritos al número del local desde OWNER_PHONE):
   * - "r 5493884123456 texto": le manda "texto" al cliente desde el número del local.
   * - "bot on 5493884123456" reactiva el bot para ese número; "bot off ..." lo pausa 12 h. */
  private async comandoDuenio(pnid: string, owner: string, texto: string): Promise<boolean> {
    const r = texto.trim().match(/^r\s+\+?(\d{8,15})\s+([\s\S]+)$/i);
    if (r) {
      const [, numero, mensaje] = r;
      const conv = `${pnid}:${numero}`;
      try {
        await this.wa.sendText(pnid, numero, mensaje.trim());
      } catch {
        await this.wa.sendText(pnid, owner, `⚠️ No se pudo enviar a +${numero}. Si pasaron más de 24 h desde su último mensaje, WhatsApp no deja escribirle.`);
        return true;
      }
      await this.guardarTurno(conv, { rol: "bot", texto: mensaje.trim() });
      // Mientras atiende una persona, el bot sigue en pausa.
      await this.store.set(k.pausa(conv), String(this.ahora().getTime()), { ttlSeconds: PAUSA_HUMANO_SEGUNDOS });
      return true;
    }
    const m = texto.trim().toLowerCase().match(/^bot\s+(on|off|estado)\s*\+?([\d\s-]*)$/);
    if (!m) return false;
    const accion = m[1];
    const numero = soloDigitos(m[2]);
    if (!numero) {
      await this.wa.sendText(pnid, owner, "Decime el número completo, por ejemplo: bot on 5493884123456");
      return true;
    }
    const conv = `${pnid}:${numero}`;
    if (accion === "on") {
      await this.store.del(k.pausa(conv));
      await this.wa.sendText(pnid, owner, `✅ Listo, el bot vuelve a responderle a +${numero}.`);
    } else if (accion === "off") {
      await this.store.set(k.pausa(conv), String(this.ahora().getTime()), { ttlSeconds: PAUSA_HUMANO_SEGUNDOS });
      await this.wa.sendText(pnid, owner, `⏸️ El bot no le va a responder a +${numero} por 12 h.`);
    } else {
      const ttl = await this.store.ttl(k.pausa(conv));
      const estado = ttl > 0 ? `en pausa (faltan ${Math.ceil(ttl / 3600)} h)` : "activo";
      await this.wa.sendText(pnid, owner, `El bot para +${numero} está ${estado}.`);
    }
    return true;
  }
}
