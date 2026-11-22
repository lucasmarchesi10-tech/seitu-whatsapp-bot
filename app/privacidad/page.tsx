export const metadata = { title: "Política de privacidad · SEI TU" };

export default function Privacidad() {
  return (
    <main style={{ maxWidth: 680, margin: "48px auto", padding: "0 16px", lineHeight: 1.6 }}>
      <h1>Política de privacidad</h1>
      <p>
        SEI TU (cafetería y heladería, San Salvador de Jujuy y Perico) usa un asistente automático para responder los
        mensajes que nos mandás por WhatsApp.
      </p>
      <h2>Qué datos usamos</h2>
      <p>
        Tu número de WhatsApp, tu nombre de perfil y el texto de tus mensajes. Guardamos solo los últimos mensajes de
        cada conversación, por hasta 7 días, para poder responderte con contexto.
      </p>
      <h2>Para qué</h2>
      <p>
        Únicamente para responder tus consultas y pedidos. Los mensajes se procesan con un servicio de inteligencia
        artificial (Anthropic) para generar las respuestas. No vendemos ni compartimos tus datos con fines
        publicitarios.
      </p>
      <h2>Tus derechos</h2>
      <p>
        Podés pedirnos que borremos tu conversación escribiéndonos por WhatsApp o acercándote a cualquiera de nuestros
        locales: Patricias Argentinas 352 (San Salvador de Jujuy) o Belgrano 352 (Perico).
      </p>
    </main>
  );
}
