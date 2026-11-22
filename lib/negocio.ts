import cartaJson from "@/data/carta.json";
import negocioJson from "@/data/negocio.json";

export type Precio = number | null;

export interface ItemCarta {
  nombre: string;
  descripcion?: string;
  precio?: Precio;
  /** Para productos con tamaños (ej: Doble / Jarrito). */
  precios?: Record<string, Precio>;
  destacado?: boolean;
  nota?: string;
}

export interface CategoriaCarta {
  nombre: string;
  items: ItemCarta[];
}

export interface Carta {
  categorias: CategoriaCarta[];
}

export interface Local {
  id: string;
  nombre: string;
  direccion: string;
  ciudad: string;
  horarios: string[];
}

export interface Negocio {
  nombre: string;
  rubro: string;
  link_pedidos_helado: string;
  medios_de_pago: string[] | string | null;
  envios: {
    hay_envios: boolean;
    detalle: string;
    zona_y_costo: string | null;
    como_pedir_cafeteria: string;
  };
  locales: Local[];
}

export const carta = cartaJson as unknown as Carta;
export const negocio = negocioJson as unknown as Negocio;

const fmt = new Intl.NumberFormat("es-AR");

export function formatearPrecio(p: Precio | undefined): string {
  return typeof p === "number" ? `$${fmt.format(p)}` : "precio a confirmar";
}

/** Una línea de precio para el prompt del agente ("Doble $3.500 / Jarrito precio a confirmar"). */
export function lineaPrecio(item: ItemCarta): string {
  if (item.precios) {
    return Object.entries(item.precios)
      .map(([tam, p]) => `${tam}: ${formatearPrecio(p)}`)
      .join(" / ");
  }
  return formatearPrecio(item.precio);
}

export function tienePrecio(item: ItemCarta): boolean {
  if (item.precios) return Object.values(item.precios).some((p) => typeof p === "number");
  return typeof item.precio === "number";
}

/**
 * La carta lista para mandar por WhatsApp. Se arma desde data/carta.json, así que
 * nunca puede tener productos ni precios inventados. Solo muestra precios cargados.
 */
export function cartaParaWhatsApp(): string {
  const partes: string[] = ["☕ *Carta de cafetería SEI TU*"];
  for (const cat of carta.categorias) {
    const lineas = cat.items.map((item) => {
      let precio = "";
      if (item.precios) {
        const conPrecio = Object.entries(item.precios).filter(([, p]) => typeof p === "number");
        if (conPrecio.length) precio = " — " + conPrecio.map(([t, p]) => `${t} ${formatearPrecio(p)}`).join(" / ");
        else precio = ` (${Object.keys(item.precios).join(" / ")})`;
      } else if (typeof item.precio === "number") {
        precio = ` — ${formatearPrecio(item.precio)}`;
      }
      return `• ${item.nombre}${item.destacado ? " ⭐" : ""}${precio}`;
    });
    partes.push(`*${cat.nombre}*\n${lineas.join("\n")}`);
  }
  partes.push("Si querés el detalle de algún producto, preguntame.");
  return partes.join("\n\n");
}

/** WhatsApp corta en 4096 caracteres: partimos por bloques si hace falta. */
export function partirMensaje(texto: string, max = 3900): string[] {
  if (texto.length <= max) return [texto];
  const bloques = texto.split("\n\n");
  const out: string[] = [];
  let actual = "";
  for (const b of bloques) {
    if (actual && actual.length + b.length + 2 > max) {
      out.push(actual);
      actual = b;
    } else {
      actual = actual ? `${actual}\n\n${b}` : b;
    }
  }
  if (actual) out.push(actual);
  return out;
}
