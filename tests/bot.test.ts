import { describe, expect, it, vi } from "vitest";
import type { Agente, Decision, Turno } from "@/lib/agent";
import { RESPUESTA_ERROR, RESPUESTA_SOLO_TEXTO } from "@/lib/bot";
import { negocio } from "@/lib/negocio";
import { crearSimulacion, SIM_NUMERO_DUENIO } from "@/lib/simulador";

const LINK = negocio.link_pedidos_helado;

/** Agente falso con reglas fijas, para probar la lógica del bot sin llamar a Claude. */
function agenteFalso(): Agente & { llamadas: Turno[][] } {
  const llamadas: Turno[][] = [];
  return {
    llamadas,
    async decidir({ historial }) {
      llamadas.push(historial);
      const t = historial[historial.length - 1].texto.toLowerCase();
      const d = (x: Partial<Decision>): Decision => ({
        tema: "otro",
        respuesta: "",
        enviar_carta: false,
        derivar: false,
        motivo: "",
        ...x,
      });
      if (/helado|sabores/.test(t)) return d({ tema: "helados", respuesta: `Armá tu pedido acá: ${LINK}` });
      if (/carta/.test(t)) return d({ tema: "cafeteria", respuesta: "¡Ahí va la carta!", enviar_carta: true });
      if (/reclamo|alguien|torta/.test(t))
        return d({ respuesta: "Ya le aviso al equipo 🙌", derivar: true, motivo: "reclamo" });
      if (/error/.test(t)) throw new Error("boom");
      return d({ tema: "saludo", respuesta: "¡Hola! ¿Buscás helados o algo de la cafetería?" });
    },
  };
}

const CLIENTE = "5493884123456";

describe("bot", () => {
  it("responde un saludo", async () => {
    const sim = crearSimulacion(agenteFalso());
    const r = await sim.enviar({ local: "centro", de: CLIENTE, texto: "hola" });
    expect(r.respuestas).toHaveLength(1);
    expect(r.respuestas[0]).toMatchObject({ para: CLIENTE, desde: "SEI TU Centro" });
    expect(r.pausado).toBe(false);
  });

  it("pasa el link de helados", async () => {
    const sim = crearSimulacion(agenteFalso());
    const r = await sim.enviar({ local: "perico", de: CLIENTE, texto: "quiero 1 kilo de helado" });
    expect(r.respuestas[0].texto).toContain(LINK);
    expect(r.respuestas[0].desde).toBe("SEI TU Perico");
  });

  it("manda la carta desde los datos y la imagen", async () => {
    const sim = crearSimulacion(agenteFalso());
    const r = await sim.enviar({ local: "centro", de: CLIENTE, texto: "pasame la carta" });
    const textos = r.respuestas.map((e) => e.texto).join("\n");
    expect(textos).toContain("Carta de cafetería SEI TU");
    expect(textos).toContain("Café con Leche");
    expect(r.respuestas.some((e) => e.tipo === "imagen")).toBe(true);
  });

  it("deriva, avisa al dueño y deja de responder a ese número", async () => {
    const agente = agenteFalso();
    const sim = crearSimulacion(agente);
    const r1 = await sim.enviar({ local: "centro", de: CLIENTE, texto: "quiero hacer un reclamo" });
    expect(r1.pausado).toBe(true);
    const aviso = r1.respuestas.find((e) => e.para === SIM_NUMERO_DUENIO);
    expect(aviso).toBeDefined();
    expect(aviso!.texto).toContain(CLIENTE);

    const r2 = await sim.enviar({ local: "centro", de: CLIENTE, texto: "hola?" });
    expect(r2.respuestas).toHaveLength(0);
    expect(agente.llamadas).toHaveLength(1);

    // Otro cliente sigue siendo atendido.
    const r3 = await sim.enviar({ local: "centro", de: "5493887777777", texto: "hola" });
    expect(r3.respuestas).toHaveLength(1);
  });

  it("la pausa vence a las 12 h", async () => {
    vi.useFakeTimers();
    try {
      const sim = crearSimulacion(agenteFalso());
      await sim.enviar({ local: "centro", de: CLIENTE, texto: "quiero hablar con alguien" });
      vi.advanceTimersByTime(12 * 60 * 60 * 1000 + 1000);
      const r = await sim.enviar({ local: "centro", de: CLIENTE, texto: "hola" });
      expect(r.respuestas).toHaveLength(1);
      expect(r.pausado).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("el dueño reactiva el bot con 'bot on <número>'", async () => {
    const sim = crearSimulacion(agenteFalso());
    await sim.enviar({ local: "centro", de: CLIENTE, texto: "quiero hablar con alguien" });
    const c = await sim.enviar({ local: "centro", de: SIM_NUMERO_DUENIO, texto: `bot on ${CLIENTE}` });
    expect(c.respuestas[0].texto).toContain("vuelve a responder");
    const r = await sim.enviar({ local: "centro", de: CLIENTE, texto: "hola" });
    expect(r.respuestas).toHaveLength(1);
  });

  it("no responde dos veces el mismo mensaje", async () => {
    const agente = agenteFalso();
    const sim = crearSimulacion(agente);
    const payload = {
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                metadata: { display_phone_number: "5493881111111", phone_number_id: "sim-centro" },
                messages: [{ id: "wamid.repetido", from: CLIENTE, type: "text", text: { body: "hola" } }],
              },
            },
          ],
        },
      ],
    };
    await sim.bot.procesarWebhook(payload);
    await sim.bot.procesarWebhook(payload);
    expect(sim.wa.enviados).toHaveLength(1);
    expect(agente.llamadas).toHaveLength(1);
  });

  it("responde que solo lee texto ante audios, imágenes o stickers", async () => {
    const agente = agenteFalso();
    const sim = crearSimulacion(agente);
    for (const tipo of ["audio", "image", "sticker"]) {
      const r = await sim.enviar({ local: "centro", de: CLIENTE, tipo });
      expect(r.respuestas[0].texto).toBe(RESPUESTA_SOLO_TEXTO);
    }
    expect(agente.llamadas).toHaveLength(0);
  });

  it("ignora reacciones, mensajes propios y de grupos", async () => {
    const sim = crearSimulacion(agenteFalso());
    await sim.enviar({ local: "centro", de: CLIENTE, tipo: "reaction" });
    await sim.enviar({ local: "centro", de: "5493881111111", texto: "hola" }); // el propio número
    await sim.bot.procesarWebhook({
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                metadata: { display_phone_number: "5493881111111", phone_number_id: "sim-centro" },
                messages: [{ id: "g1", from: CLIENTE, type: "text", text: { body: "hola" }, group_id: "123" }],
              },
            },
          ],
        },
      ],
    });
    expect(sim.wa.enviados).toHaveLength(0);
  });

  it("guarda el historial y se lo pasa al agente (máx. 10 mensajes)", async () => {
    const agente = agenteFalso();
    const sim = crearSimulacion(agente);
    for (let i = 0; i < 7; i++) await sim.enviar({ local: "centro", de: CLIENTE, texto: `hola ${i}` });
    const ultimo = agente.llamadas[agente.llamadas.length - 1];
    expect(ultimo.length).toBe(10);
    expect(ultimo[ultimo.length - 1]).toEqual({ rol: "cliente", texto: "hola 6" });
  });

  it("si Claude falla, responde amable y deriva", async () => {
    const sim = crearSimulacion(agenteFalso());
    const r = await sim.enviar({ local: "centro", de: CLIENTE, texto: "error" });
    expect(r.respuestas[0].texto).toBe(RESPUESTA_ERROR);
    expect(r.pausado).toBe(true);
  });

  it("si llegan dos mensajes seguidos, responde una sola vez con todo el contexto", async () => {
    let soltar!: () => void;
    const espera = new Promise<void>((res) => (soltar = res));
    const base = agenteFalso();
    let primera = true;
    const agente: Agente = {
      async decidir(input) {
        if (primera) {
          primera = false;
          await espera; // el primer mensaje tarda más que el segundo
        }
        return base.decidir(input);
      },
    };
    const sim = crearSimulacion(agente);
    const p1 = sim.enviar({ local: "centro", de: CLIENTE, texto: "hola" });
    await new Promise((r) => setTimeout(r, 5));
    const p2 = sim.enviar({ local: "centro", de: CLIENTE, texto: "quiero helado" });
    await p2;
    soltar();
    await p1;
    const alCliente = sim.wa.enviados.filter((e) => e.para === CLIENTE);
    expect(alCliente).toHaveLength(1);
    expect(alCliente[0].texto).toContain(LINK);
  });
});

describe("aviso al dueño", () => {
  it("usa la plantilla si el dueño no escribió en las últimas 24 h", async () => {
    const sim = crearSimulacion(agenteFalso(), { ...process.env, OWNER_ALERT_TEMPLATE: "aviso_derivacion" });
    const r = await sim.enviar({ local: "centro", de: CLIENTE, texto: "quiero hacer un reclamo" });
    const aviso = r.respuestas.find((e) => e.para === SIM_NUMERO_DUENIO)!;
    expect(aviso.tipo).toBe("plantilla");
    expect(aviso.texto).toContain("aviso_derivacion");
  });

  it("manda mensaje normal si el dueño escribió hace poco", async () => {
    const sim = crearSimulacion(agenteFalso(), { ...process.env, OWNER_ALERT_TEMPLATE: "aviso_derivacion" });
    await sim.enviar({ local: "centro", de: SIM_NUMERO_DUENIO, texto: "hola" });
    const r = await sim.enviar({ local: "centro", de: CLIENTE, texto: "quiero hacer un reclamo" });
    const aviso = r.respuestas.find((e) => e.para === SIM_NUMERO_DUENIO)!;
    expect(aviso.tipo).toBe("texto");
  });

  it("si WhatsApp rechaza el aviso por la ventana de 24 h, reintenta con plantilla", async () => {
    const sim = crearSimulacion(agenteFalso(), { ...process.env, OWNER_ALERT_TEMPLATE: "aviso_derivacion" });
    await sim.enviar({ local: "centro", de: SIM_NUMERO_DUENIO, texto: "hola" });
    await sim.enviar({ local: "centro", de: CLIENTE, texto: "quiero hacer un reclamo" });
    const idx = sim.wa.enviados.findIndex((e) => e.para === SIM_NUMERO_DUENIO && e.tipo === "texto" && e.texto.includes("🔔"));
    const id = `wamid.sim.${idx + 1}`;
    await sim.bot.procesarWebhook({
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                metadata: { display_phone_number: "5493881111111", phone_number_id: "sim-centro" },
                statuses: [{ id, status: "failed", recipient_id: SIM_NUMERO_DUENIO, errors: [{ code: 131047 }] }],
              },
            },
          ],
        },
      ],
    });
    expect(sim.wa.enviados[sim.wa.enviados.length - 1].tipo).toBe("plantilla");
  });
});

describe("atención humana desde el celular del dueño", () => {
  it("reenvía al dueño lo que escribe el cliente derivado y el dueño contesta con 'r'", async () => {
    const sim = crearSimulacion(agenteFalso(), { ...process.env, REENVIAR_AL_DUENIO: "si" });
    await sim.enviar({ local: "centro", de: CLIENTE, texto: "quiero hacer un reclamo" });
    const r = await sim.enviar({ local: "centro", de: CLIENTE, texto: "el helado llegó derretido" });
    expect(r.respuestas).toHaveLength(1);
    expect(r.respuestas[0]).toMatchObject({ para: SIM_NUMERO_DUENIO });
    expect(r.respuestas[0].texto).toContain("llegó derretido");

    const c = await sim.enviar({ local: "centro", de: SIM_NUMERO_DUENIO, texto: `r ${CLIENTE} Perdón! Te mandamos otro ya` });
    expect(c.respuestas).toEqual([
      expect.objectContaining({ para: CLIENTE, texto: "Perdón! Te mandamos otro ya", desde: "SEI TU Centro" }),
    ]);
    expect(c.pausado).toBe(false); // (el dueño no está pausado)
    expect(await sim.bot.estaPausado(`sim-centro:${CLIENTE}`)).toBe(true);
  });
});
