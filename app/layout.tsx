export const metadata = { title: "SEI TU · Bot de WhatsApp" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, sans-serif", background: "#f4f6fa", color: "#13294b" }}>
        {children}
      </body>
    </html>
  );
}
