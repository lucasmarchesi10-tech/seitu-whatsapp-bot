export default function Home() {
  return (
    <main style={{ maxWidth: 560, margin: "48px auto", padding: "0 16px", lineHeight: 1.5 }}>
      <h1>SEI TU · Bot de WhatsApp</h1>
      <p>El bot está funcionando. Meta le manda los mensajes a <code>/api/webhook</code>.</p>
      <p>
        Para probarlo sin WhatsApp, entrá al <a href="/simulador">simulador</a>.
      </p>
    </main>
  );
}
