import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { config, type LocalConfig } from "@/lib/config";
import { contextoDelMomento, systemPromptFijo } from "@/lib/prompt";

export const Decision = z.object({
  tema: z.enum(["helados", "cafeteria", "saludo", "info_local", "otro"]),
  respuesta: z.string(),
  enviar_carta: z.boolean(),
  derivar: z.boolean(),
  motivo: z.string(),
});
export type Decision = z.infer<typeof Decision>;

export interface Turno {
  rol: "cliente" | "bot";
  texto: string;
}

export interface Agente {
  decidir(input: { local: LocalConfig; historial: Turno[]; ahora: Date }): Promise<Decision>;
}

/** Arma los mensajes para Claude: alterna cliente/bot, empieza y termina con el cliente. */
export function mensajesParaClaude(historial: Turno[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const t of historial) {
    const role = t.rol === "cliente" ? "user" : "assistant";
    const last = out[out.length - 1];
    if (last && last.role === role) {
      last.content = `${last.content as string}\n${t.texto}`;
    } else {
      out.push({ role, content: t.texto });
    }
  }
  while (out.length && out[0].role !== "user") out.shift();
  while (out.length && out[out.length - 1].role !== "user") out.pop();
  return out;
}

export class ClaudeAgent implements Agente {
  private client: Anthropic;
  constructor(
    client?: Anthropic,
    private model = config().model,
  ) {
    // Timeout corto: el cliente de WhatsApp no puede esperar. Un reintento si falla la red.
    this.client = client ?? new Anthropic({ timeout: 12_000, maxRetries: 1 });
  }

  async decidir({ local, historial, ahora }: { local: LocalConfig; historial: Turno[]; ahora: Date }) {
    const messages = mensajesParaClaude(historial);
    if (!messages.length) throw new Error("Historial vacío");

    const response = await this.client.messages.parse({
      model: this.model,
      max_tokens: 2048,
      // Esfuerzo bajo: respuestas rápidas y baratas, alcanza para atención al cliente.
      output_config: { effort: "low", format: zodOutputFormat(Decision) },
      system: [
        // La parte grande y fija va primero y se cachea (más rápido y más barato).
        { type: "text", text: systemPromptFijo(local), cache_control: { type: "ephemeral" } },
        { type: "text", text: contextoDelMomento(ahora) },
      ],
      messages,
    });

    if (response.stop_reason === "refusal" || !response.parsed_output) {
      throw new Error(`Respuesta no utilizable de Claude (stop_reason=${response.stop_reason})`);
    }
    return response.parsed_output;
  }
}
