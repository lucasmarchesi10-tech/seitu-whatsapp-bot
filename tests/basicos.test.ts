import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { mensajesParaClaude } from "@/lib/agent";
import { localPorPhoneNumberId } from "@/lib/config";
import { carta, cartaParaWhatsApp, lineaPrecio, partirMensaje, tienePrecio } from "@/lib/negocio";
import { systemPromptFijo } from "@/lib/prompt";
import { firmaValida, limpiarParametro } from "@/lib/whatsapp";

describe("firma de Meta", () => {
  const secreto = "s3cr3t";
  const body = '{"hola":"mundo"}';
  const firma = "sha256=" + crypto.createHmac("sha256", secreto).update(body).digest("hex");
  it("acepta la firma correcta", () => expect(firmaValida(body, firma, secreto)).toBe(true));
  it("rechaza firma incorrecta o ausente", () => {
    expect(firmaValida(body + " ", firma, secreto)).toBe(false);
    expect(firmaValida(body, null, secreto)).toBe(false);
    expect(firmaValida(body, "sha256=abc", secreto)).toBe(false);
    expect(firmaValida(body, firma, "")).toBe(false);
  });
});

describe("carta", () => {
  it("entra en un mensaje de WhatsApp e incluye todos los productos", () => {
    const texto = cartaParaWhatsApp();
    for (const p of partirMensaje(texto)) expect(p.length).toBeLessThanOrEqual(4096);
    for (const cat of carta.categorias) for (const i of cat.items) expect(texto).toContain(i.nombre);
  });
  it("muestra los precios cargados", () => {
    expect(cartaParaWhatsApp()).toContain("Café con Leche — Doble $4.000 / Jarrito $3.500");
  });
  it("el prompt tiene la carta con precios y los dos locales", () => {
    const p = systemPromptFijo(localPorPhoneNumberId("x", {}));
    expect(p).toContain("Café con Leche");
    expect(p).toContain("Doble: $4.000 / Jarrito: $3.500");
    expect(p).toContain("Patricias Argentinas 352");
    expect(p).toContain("Belgrano 352");
  });
});

describe("locales", () => {
  it("elige el local según el número que recibió el mensaje", () => {
    const env = { WHATSAPP_PHONE_NUMBER_ID_CENTRO: "111", WHATSAPP_PHONE_NUMBER_ID_PERICO: "222", OWNER_PHONE: "+54 9 388 400-0000" };
    expect(localPorPhoneNumberId("222", env).id).toBe("perico");
    expect(localPorPhoneNumberId("111", env).id).toBe("centro");
    expect(localPorPhoneNumberId("111", env).ownerPhone).toBe("5493884000000");
  });
  it("WHATSAPP_PHONE_NUMBER_ID sirve como el de Centro", () => {
    expect(localPorPhoneNumberId("999", { WHATSAPP_PHONE_NUMBER_ID: "999" }).id).toBe("centro");
  });
});

describe("mensajes para Claude", () => {
  it("une mensajes seguidos y arranca/termina con el cliente", () => {
    const m = mensajesParaClaude([
      { rol: "bot", texto: "viejo" },
      { rol: "cliente", texto: "hola" },
      { rol: "cliente", texto: "¿está?" },
      { rol: "bot", texto: "¡Hola!" },
      { rol: "cliente", texto: "quiero helado" },
    ]);
    expect(m.map((x) => x.role)).toEqual(["user", "assistant", "user"]);
    expect(m[0].content).toBe("hola\n¿está?");
  });
});

describe("precios", () => {
  it("todos los productos tienen precio cargado", () => {
    for (const cat of carta.categorias) for (const i of cat.items) expect(tienePrecio(i), i.nombre).toBe(true);
  });
  it("si falta un precio, el prompt dice 'precio a confirmar'", () => {
    expect(lineaPrecio({ nombre: "X", precio: null })).toBe("precio a confirmar");
  });
});

describe("plantillas", () => {
  it("limpia saltos de línea", () => expect(limpiarParametro("a\nb\t c")).toBe("a b  c"));
});
