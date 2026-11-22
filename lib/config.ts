import { negocio, type Local } from "@/lib/negocio";

export type Env = Record<string, string | undefined>;

export const PAUSA_HUMANO_SEGUNDOS = 12 * 60 * 60;
export const MAX_HISTORIAL = 10;
/** Ventana de 24 h de WhatsApp (dejamos 30 min de margen). */
export const VENTANA_SERVICIO_MS = 23.5 * 60 * 60 * 1000;

export function soloDigitos(s: string | undefined | null): string {
  return (s ?? "").replace(/\D/g, "");
}

export interface LocalConfig extends Local {
  phoneNumberId: string | null;
  ownerPhone: string | null;
}

/**
 * Cada número de WhatsApp (phone_number_id de Meta) corresponde a un local.
 * WHATSAPP_PHONE_NUMBER_ID se toma como el de Centro si no cargaste el específico.
 */
export function localesConfigurados(env: Env = process.env): LocalConfig[] {
  return negocio.locales.map((l) => {
    const key = l.id.toUpperCase();
    const phoneNumberId =
      env[`WHATSAPP_PHONE_NUMBER_ID_${key}`] ||
      (l.id === "centro" ? env.WHATSAPP_PHONE_NUMBER_ID : undefined) ||
      null;
    const ownerPhone = soloDigitos(env[`OWNER_PHONE_${key}`] || env.OWNER_PHONE) || null;
    return { ...l, phoneNumberId, ownerPhone };
  });
}

export function localPorPhoneNumberId(phoneNumberId: string, env: Env = process.env): LocalConfig {
  const locales = localesConfigurados(env);
  return locales.find((l) => l.phoneNumberId === phoneNumberId) ?? locales[0];
}

export function localPorId(id: string, env: Env = process.env): LocalConfig {
  const locales = localesConfigurados(env);
  return locales.find((l) => l.id === id) ?? locales[0];
}

export function config(env: Env = process.env) {
  return {
    whatsappToken: env.WHATSAPP_TOKEN ?? "",
    verifyToken: env.WHATSAPP_VERIFY_TOKEN ?? "",
    appSecret: env.WHATSAPP_APP_SECRET ?? "",
    graphVersion: env.WHATSAPP_GRAPH_VERSION || "v23.0",
    model: env.CLAUDE_MODEL || "claude-haiku-5-5",
    cartaImagenUrl: env.CARTA_IMAGEN_URL || null,
    plantillaAviso: env.OWNER_ALERT_TEMPLATE || null,
    plantillaAvisoIdioma: env.OWNER_ALERT_TEMPLATE_LANG || "es_AR",
  };
}
