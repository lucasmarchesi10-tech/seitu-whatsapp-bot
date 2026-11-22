"use client";

import { useState } from "react";

interface Enviado {
  desde: string;
  para: string;
  tipo: string;
  texto: string;
}
interface Burbuja {
  quien: "cliente" | "bot" | "aviso" | "sistema";
  texto: string;
}

const CASOS = [
  "hola",
  "quiero 1 kilo de helado",
  "¿qué sabores tienen?",
  "¿tienen café con leche?",
  "pasame la carta",
  "quiero hacer un reclamo",
  "¿hacen tortas para cumpleaños?",
  "quiero hablar con alguien",
];

const azul = "#13294b";

export default function Simulador() {
  const [local, setLocal] = useState<"centro" | "perico">("centro");
  const [numero, setNumero] = useState("5493884000000");
  const [clave, setClave] = useState("");
  const [texto, setTexto] = useState("");
  const [chat, setChat] = useState<Burbuja[]>([]);
  const [cargando, setCargando] = useState(false);
  const [pausado, setPausado] = useState(false);

  async function llamar(body: Record<string, unknown>) {
    const res = await fetch("/api/simular", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, clave }),
    });
    return res.json();
  }

  async function enviar(t: string, tipo = "text") {
    if (tipo === "text" && !t.trim()) return;
    setChat((c) => [...c, { quien: "cliente", texto: tipo === "text" ? t : `[${tipo}]` }]);
    setTexto("");
    setCargando(true);
    try {
      const r = await llamar({ local, de: numero, texto: t, tipo });
      if (r.error) {
        setChat((c) => [...c, { quien: "sistema", texto: r.error }]);
        return;
      }
      const nuevas: Burbuja[] = (r.respuestas as Enviado[]).map((e) => ({
        quien: e.para === numero.replace(/\D/g, "") ? "bot" : "aviso",
        texto: e.tipo === "texto" ? e.texto : `[${e.tipo}] ${e.texto}`,
      }));
      if (!nuevas.length) nuevas.push({ quien: "sistema", texto: "(el bot no respondió: la conversación está derivada a una persona)" });
      nuevas.push({ quien: "sistema", texto: `${r.ms} ms${r.pausado ? " · derivado a humano (12 h)" : ""}` });
      setPausado(r.pausado);
      setChat((c) => [...c, ...nuevas]);
    } finally {
      setCargando(false);
    }
  }

  async function reiniciar() {
    await llamar({ reiniciar: true });
    setChat([]);
    setPausado(false);
  }

  const estilo: Record<Burbuja["quien"], React.CSSProperties> = {
    cliente: { alignSelf: "flex-end", background: "#d9fdd3" },
    bot: { alignSelf: "flex-start", background: "#fff" },
    aviso: { alignSelf: "flex-start", background: "#fff4d6", border: "1px dashed #c9a13b" },
    sistema: { alignSelf: "center", background: "transparent", color: "#667", fontSize: 12, boxShadow: "none" },
  };

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}>
      <h1 style={{ color: azul, marginBottom: 4 }}>Simulador del bot SEI TU</h1>
      <p style={{ marginTop: 0, color: "#556" }}>
        Escribí como si fueras un cliente. Usa a Claude de verdad pero no manda nada por WhatsApp. Los avisos al dueño
        aparecen en amarillo.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <label>
          Local{" "}
          <select value={local} onChange={(e) => setLocal(e.target.value as "centro" | "perico")}>
            <option value="centro">Centro</option>
            <option value="perico">Perico</option>
          </select>
        </label>
        <label>
          Número del cliente <input value={numero} onChange={(e) => setNumero(e.target.value)} style={{ width: 140 }} />
        </label>
        <label>
          Clave (solo en Vercel){" "}
          <input value={clave} onChange={(e) => setClave(e.target.value)} type="password" style={{ width: 110 }} />
        </label>
        <button onClick={reiniciar}>Reiniciar</button>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {CASOS.map((c) => (
          <button key={c} disabled={cargando} onClick={() => enviar(c)} style={{ fontSize: 12 }}>
            {c}
          </button>
        ))}
        <button disabled={cargando} onClick={() => enviar("", "audio")} style={{ fontSize: 12 }}>
          🎤 mandar audio
        </button>
      </div>

      <div
        style={{
          background: "#efeae2",
          borderRadius: 12,
          padding: 12,
          minHeight: 320,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {chat.map((b, i) => (
          <div
            key={i}
            style={{
              maxWidth: "85%",
              padding: "6px 10px",
              borderRadius: 8,
              whiteSpace: "pre-wrap",
              boxShadow: "0 1px 1px rgba(0,0,0,.1)",
              ...estilo[b.quien],
            }}
          >
            {b.quien === "aviso" && <b>Aviso al dueño: </b>}
            {b.texto}
          </div>
        ))}
        {cargando && <div style={{ color: "#667", fontSize: 12 }}>escribiendo…</div>}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          enviar(texto);
        }}
        style={{ display: "flex", gap: 8, marginTop: 8 }}
      >
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={pausado ? "Derivado a humano: el bot no va a responder" : "Escribí un mensaje…"}
          style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid #ccd" }}
        />
        <button disabled={cargando} type="submit" style={{ padding: "0 16px" }}>
          Enviar
        </button>
      </form>
    </main>
  );
}
