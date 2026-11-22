/**
 * Prueba los 8 casos pedidos contra Claude de verdad (sin WhatsApp).
 * Uso:  npm run probar        (necesita ANTHROPIC_API_KEY en .env.local)
 */
import { existsSync } from "node:fs";
import { ClaudeAgent } from "@/lib/agent";
import { negocio } from "@/lib/negocio";
import { crearSimulacion, SIM_NUMERO_DUENIO } from "@/lib/simulador";

for (const f of [".env.local", ".env"]) if (existsSync(f)) process.loadEnvFile(f);

const LINK = negocio.link_pedidos_helado;

interface Caso {
  texto: string;
  esperado: string;
  ok: (r: { respuesta: string; todo: string; derivado: boolean; avisoDuenio: boolean }) => boolean;
}

const casos: Caso[] = [
  {
    texto: "hola",
    esperado: "saluda y pregunta si busca helados o cafetería, sin derivar",
    ok: (r) => !r.derivado && /helad/i.test(r.respuesta) && /caf/i.test(r.respuesta),
  },
  {
    texto: "quiero 1 kilo de helado",
    esperado: "pasa el link de pedidos, sin derivar",
    ok: (r) => !r.derivado && r.respuesta.includes(LINK),
  },
  {
    texto: "¿qué sabores tienen?",
    esperado: "pasa el link de pedidos, sin inventar sabores",
    ok: (r) => !r.derivado && r.respuesta.includes(LINK),
  },
  {
    texto: "¿tienen café con leche?",
    esperado: "dice que sí, sin link de helados y sin inventar precio",
    ok: (r) => /s[ií]/i.test(r.respuesta) && !r.respuesta.includes(LINK) && !/\$\s?\d/.test(r.respuesta),
  },
  {
    texto: "pasame la carta",
    esperado: "manda la carta completa (generada desde data/carta.json)",
    ok: (r) => !r.derivado && r.todo.includes("Carta de cafetería SEI TU"),
  },
  {
    texto: "quiero hacer un reclamo",
    esperado: "avisa que lo atiende una persona, deriva y avisa al dueño",
    ok: (r) => r.derivado && r.avisoDuenio,
  },
  {
    texto: "¿hacen tortas para cumpleaños?",
    esperado: "no inventa tortas; deriva a una persona",
    ok: (r) => r.derivado && r.avisoDuenio,
  },
  {
    texto: "quiero hablar con alguien",
    esperado: "deriva siempre",
    ok: (r) => r.derivado && r.avisoDuenio,
  },
];

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Falta ANTHROPIC_API_KEY (cargala en .env.local).");
    process.exit(1);
  }
  const agente = new ClaudeAgent();
  let fallas = 0;
  for (const [i, c] of casos.entries()) {
    const sim = crearSimulacion(agente); // conversación nueva por caso
    const cliente = `54938840000${i}`;
    const t0 = Date.now();
    const r = await sim.enviar({ local: "centro", de: cliente, texto: c.texto });
    const ms = Date.now() - t0;
    const alCliente = r.respuestas.filter((e) => e.para === cliente);
    const respuesta = alCliente[0]?.texto ?? "";
    const todo = alCliente.map((e) => e.texto).join("\n");
    const avisoDuenio = r.respuestas.some((e) => e.para === SIM_NUMERO_DUENIO);
    const pasa = c.ok({ respuesta, todo, derivado: r.pausado, avisoDuenio });
    if (!pasa) fallas++;
    console.log(`\n${pasa ? "✅" : "❌"} "${c.texto}"  (${ms} ms)`);
    console.log(`   Esperado: ${c.esperado}`);
    console.log(`   Bot: ${todo.replace(/\n/g, "\n        ")}`);
    if (r.pausado) console.log(`   → derivado a humano${avisoDuenio ? " y aviso al dueño enviado" : ""}`);
  }
  console.log(`\n${casos.length - fallas}/${casos.length} casos OK`);
  process.exit(fallas ? 1 : 0);
}

main();
