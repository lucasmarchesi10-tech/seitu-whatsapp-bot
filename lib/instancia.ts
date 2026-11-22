import { ClaudeAgent } from "@/lib/agent";
import { Bot } from "@/lib/bot";
import { getStore } from "@/lib/store";
import { CloudApiClient } from "@/lib/whatsapp";

let bot: Bot | null = null;

/** El bot de producción: Redis + WhatsApp Cloud API + Claude. */
export function botProduccion(): Bot {
  bot ??= new Bot({ store: getStore(), wa: new CloudApiClient(), agente: new ClaudeAgent() });
  return bot;
}
