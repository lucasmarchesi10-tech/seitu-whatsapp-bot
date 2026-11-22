# Bot de WhatsApp de SEI TU

Atiende solo los WhatsApp de **SEI TU Centro** y **SEI TU Perico**, como si fuera alguien del equipo:

- **Helados**: responde amable y pasa el link de pedidos `https://seitu-pedidos.vercel.app`.
- **Cafetería**: contesta con la carta (`data/carta.json`). Nunca inventa productos ni precios.
- **Saludos o mensajes ambiguos**: saluda y pregunta si busca helados o cafetería.
- **Reclamos, proveedores, eventos, tortas, trabajo, "quiero hablar con alguien" o algo que no sabe**: dice que una persona le responde enseguida, **te avisa al celular** y deja de contestarle a ese cliente por **12 horas**.
- Audios, fotos y stickers: responde que por ahora solo lee texto.

> Este README está pensado para alguien sin experiencia técnica. Seguí los pasos en orden. Lleva entre 1 y 2 horas la primera vez, más lo que tarde Meta en aprobar el nombre del número y la plantilla.

---

## Índice

0. [Antes de empezar: qué pasa con los WhatsApp que ya usás](#0-antes-de-empezar-qué-pasa-con-los-whatsapp-que-ya-usás)
1. [Cargar precios y medios de pago](#1-cargar-precios-y-medios-de-pago)
2. [Probar el bot en tu compu (sin WhatsApp)](#2-probar-el-bot-en-tu-compu-sin-whatsapp)
3. [Crear la clave de Claude](#3-crear-la-clave-de-claude)
4. [Crear la app en Meta for Developers](#4-crear-la-app-en-meta-for-developers)
5. [Crear el token permanente](#5-crear-el-token-permanente)
6. [Publicar el bot en Vercel](#6-publicar-el-bot-en-vercel)
7. [Configurar el webhook en Meta](#7-configurar-el-webhook-en-meta)
8. [Plantilla para los avisos al dueño](#8-plantilla-para-los-avisos-al-dueño)
9. [Conectar los números reales de los locales](#9-conectar-los-números-reales-de-los-locales)
10. [Probar con WhatsApp de verdad](#10-probar-con-whatsapp-de-verdad)
11. [Uso diario: derivaciones y comandos](#11-uso-diario-derivaciones-y-comandos)
12. [Si algo no anda](#12-si-algo-no-anda)

---

## 0. Antes de empezar: qué pasa con los WhatsApp que ya usás

El bot usa la **API oficial de WhatsApp de Meta (Cloud API)**. Es la forma segura: no arriesga que bloqueen el número. Hoy tus dos locales seguramente usan la **app WhatsApp Business** en un celular. Hay tres caminos:

| Camino | Qué pasa con el celular del local | Cuándo conviene |
|---|---|---|
| **A. Coexistencia** (recomendado si está disponible) | El número sigue funcionando en la app del celular **y** además se conecta a la API. El bot responde y el equipo puede contestar desde el celular como siempre. | Si Meta lo ofrece para tu número. Es lo ideal para cuando el bot deriva a una persona. |
| **B. Migrar el número a la API** | El número **deja de funcionar en la app del celular**. Hay que borrar la cuenta de WhatsApp Business de ese celular antes de conectarlo. Se pierden los chats de la app. | Si no hay coexistencia y querés que el bot atienda ese número igual. |
| **C. Número nuevo** | No tocás los números actuales. | Para probar primero, o si querés una línea separada para el bot. |

**Recomendación:** empezá con el **número de prueba gratuito que da Meta** (paso 4) para ver el bot funcionando sin tocar nada. Después decidí A o B para cada local (paso 9).

**Sobre la coexistencia:** Meta la ofrece para números que ya usan la app WhatsApp Business (versión actualizada, con uso reciente), y se activa escaneando un código QR desde la app durante el registro. La disponibilidad depende del país y de cómo hagas el alta: en algunos casos solo aparece a través de un proveedor oficial de WhatsApp (BSP). Al conectar el número en el paso 9, si te aparece la opción de "conectar tu app WhatsApp Business existente", usala. Si no aparece, preguntale a un proveedor oficial o usá el camino B.

**Con el camino B, ¿cómo contesta una persona?** El celular ya no sirve para ese número. Por eso el bot trae un modo para que atiendas desde tu celular personal: poné `REENVIAR_AL_DUENIO=si` y el bot te reenvía lo que escribe el cliente derivado; vos le contestás escribiéndole al número del local `r 5493884123456 tu mensaje` (ver paso 11).

---

## 1. Cargar precios y medios de pago

La carta que mandaste **no tiene precios**, así que están todos vacíos. Mientras un precio esté vacío, el bot **no lo dice**: contesta que alguien del equipo se lo confirma y te deriva la consulta. En cuanto cargues los precios, los responde solo.

- **Carta y precios:** archivo `data/carta.json`. Buscá el producto y cambiá `null` por el número, sin `$` ni puntos:
  ```json
  { "nombre": "Café con Leche", "precios": { "Doble": 3200, "Jarrito": 3800 } }
  { "nombre": "Medialunas", "descripcion": "Clásicas de manteca.", "precio": 900 }
  ```
  Ahí mismo podés agregar, quitar o renombrar productos. La carta es la misma para los dos locales.
- **Medios de pago, envíos y locales:** archivo `data/negocio.json`.
  - `"medios_de_pago": null` → cambialo por ejemplo por `["Efectivo", "Transferencia", "Mercado Pago", "Débito y crédito"]`.
  - `"zona_y_costo": null` → por ejemplo `"Envíos dentro de San Salvador de Jujuy, costo según la zona"`.
  - Horarios y direcciones ya están cargados.

Si el código está en GitHub, podés editar estos archivos desde la página de GitHub (ícono del lápiz → "Commit changes"). Vercel publica el cambio solo en un minuto.

---

## 2. Probar el bot en tu compu (sin WhatsApp)

Necesitás [Node.js](https://nodejs.org) versión 20 o más nueva (bajá la versión "LTS") y la clave de Claude del paso 3.

1. Abrí una terminal en la carpeta del proyecto.
2. Instalá lo necesario:
   ```bash
   npm install
   ```
3. Copiá `.env.example` como `.env.local` y completá **solo** `ANTHROPIC_API_KEY` (lo demás no hace falta para probar).
4. Arrancá el bot:
   ```bash
   npm run dev
   ```
5. Abrí **http://localhost:3000/simulador**. Escribí como si fueras un cliente, o tocá los botones con los 8 casos de prueba. Los avisos que te llegarían a vos aparecen en amarillo.

### Pruebas automáticas

- Los 8 casos pedidos contra Claude de verdad (gasta centavos):
  ```bash
  npm run probar
  ```
  Muestra la respuesta del bot a "hola", "quiero 1 kilo de helado", "¿qué sabores tienen?", "¿tienen café con leche?", "pasame la carta", "quiero hacer un reclamo", "¿hacen tortas para cumpleaños?" y "quiero hablar con alguien", con ✅ o ❌ según lo esperado.
- Las pruebas de la lógica (deduplicación, pausa de 12 h, avisos, firma de Meta, etc.), sin gastar nada:
  ```bash
  npm test
  ```

---

## 3. Crear la clave de Claude

1. Entrá a **https://console.anthropic.com** y creá una cuenta.
2. En **Billing**, cargá crédito (con US$5 alcanza para empezar).
3. En **API Keys** → **Create Key**. Copiala: es tu `ANTHROPIC_API_KEY`.

**Costo aproximado:** el bot usa `claude-haiku-5-5`, el modelo más barato. Cada respuesta cuesta del orden de una vigésima de centavo de dólar: unos US$0,50 cada mil mensajes. Revisá los precios vigentes en la consola de Anthropic.

---

## 4. Crear la app en Meta for Developers

1. Si no tenés, creá una cuenta comercial en **https://business.facebook.com** (Meta Business Suite) a nombre de SEI TU.
2. Entrá a **https://developers.facebook.com** → **Mis apps** → **Crear app**.
3. Caso de uso: **"Conectarte con clientes a través de WhatsApp"** (o tipo **Negocios**, según cómo te lo muestre). Elegí la cuenta comercial de SEI TU.
4. Dentro de la app, en **WhatsApp → Configuración de la API** (o "API Setup"), Meta te da:
   - un **número de prueba** gratis,
   - el **Identificador del número de teléfono** (Phone number ID) → guardalo como `WHATSAPP_PHONE_NUMBER_ID_CENTRO` para probar,
   - el **Identificador de la cuenta de WhatsApp Business** (WABA ID) → anotalo, sirve en el paso 7,
   - un campo **"Para"**: agregá tu celular personal para poder escribirle al número de prueba.
5. En **Configuración de la app → Básica**, copiá la **Clave secreta de la app** → es `WHATSAPP_APP_SECRET`.
   En esa misma pantalla, en "URL de la política de privacidad", poné `https://TU-APP.vercel.app/privacidad` (la página ya viene incluida; la URL la tenés después del paso 6).

---

## 5. Crear el token permanente

El token que muestra la pantalla de "Configuración de la API" vence en 24 h. Para producción hace falta uno permanente:

1. En **https://business.facebook.com/settings** → **Usuarios** → **Usuarios del sistema** → **Agregar**. Nombre: `bot-seitu`, rol: **Administrador**.
2. Con ese usuario elegido: **Asignar activos** → **Apps** → tu app (control total) y **Cuentas de WhatsApp** → la cuenta de SEI TU (control total).
3. **Generar token** → elegí tu app → caducidad **Nunca** → permisos `whatsapp_business_messaging` y `whatsapp_business_management`.
4. Copialo: es `WHATSAPP_TOKEN`. Guardalo bien, no se vuelve a mostrar.

---

## 6. Publicar el bot en Vercel

1. Subí esta carpeta a un repositorio de GitHub (privado).
2. En **https://vercel.com** → **Add New… → Project** → importá el repositorio → **Deploy**. Vercel detecta que es Next.js, no hay que tocar nada.
3. **Base de datos:** en el proyecto de Vercel → **Storage** → **Create Database** / **Marketplace** → **Upstash for Redis** (plan gratis) → conectalo al proyecto. Esto carga solas las variables de la base (`KV_REST_API_URL` y `KV_REST_API_TOKEN`, o `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`; el bot acepta cualquiera de los dos pares).
4. **Variables:** **Settings → Environment Variables**, cargá una por una las de `.env.example`:
   - `WHATSAPP_TOKEN`, `WHATSAPP_VERIFY_TOKEN` (inventá una clave larga, ej. `seitu-2026-xyz`), `WHATSAPP_APP_SECRET`
   - `WHATSAPP_PHONE_NUMBER_ID_CENTRO` (y `_PERICO` cuando lo tengas)
   - `OWNER_PHONE` (tu celular: `549` + característica sin 0 + número sin 15. Ej: `5493884123456`)
   - `ANTHROPIC_API_KEY`
   - `CARTA_IMAGEN_URL` = `https://TU-APP.vercel.app/carta-seitu.jpeg` (así, cuando piden la carta, también manda la foto)
   - `OWNER_ALERT_TEMPLATE` = `aviso_derivacion` (cuando esté aprobada, paso 8)
5. **Deployments** → los tres puntitos del último → **Redeploy**, para que tome las variables.
6. Abrí `https://TU-APP.vercel.app`: tiene que decir "El bot está funcionando".

> El simulador también funciona en Vercel (`/simulador`) si cargás `SIMULADOR_CLAVE` y la escribís en el campo "Clave".

---

## 7. Configurar el webhook en Meta

El webhook es la dirección a la que Meta le avisa al bot cada vez que llega un mensaje.

1. En tu app de Meta → **WhatsApp → Configuración** (Configuration) → **Webhook** → **Editar**.
   - **URL de devolución de llamada:** `https://TU-APP.vercel.app/api/webhook`
   - **Token de verificación:** el mismo `WHATSAPP_VERIFY_TOKEN` que cargaste en Vercel.
   - **Verificar y guardar.** Si da error, revisá que el token sea idéntico y que hayas hecho el Redeploy.
2. En **Campos del webhook** → **Administrar**, suscribite a **`messages`**. Si usás coexistencia, también a **`smb_message_echoes`** (así el bot se calla cuando alguien del equipo contesta desde el celular).
3. Para números reales, la app tiene que estar **publicada** (arriba en la app: modo **"Activo"/"Live"** en vez de "Desarrollo"). Pide la URL de privacidad del paso 4.
4. Si con un número real no llegan mensajes, suscribí la app a la cuenta de WhatsApp con este comando (reemplazá los valores; se puede correr desde la terminal):
   ```bash
   curl -X POST "https://graph.facebook.com/v23.0/TU_WABA_ID/subscribed_apps" \
     -H "Authorization: Bearer TU_WHATSAPP_TOKEN"
   ```

---

## 8. Plantilla para los avisos al dueño

Cuando el bot deriva una conversación, te avisa por WhatsApp desde el número del local a tu celular (`OWNER_PHONE`).

Regla de WhatsApp: un negocio solo puede mandar mensajes libres a alguien que le escribió en las **últimas 24 horas**. El bot lo resuelve así:

- Si le escribiste al número del local en las últimas 24 h (cualquier cosa, un "hola"), el aviso va como **mensaje normal**, con todo el detalle.
- Si no, lo manda usando una **plantilla aprobada**. Y si un aviso normal igual rebota, lo reintenta con la plantilla.

Para crear la plantilla:

1. **https://business.facebook.com/wa/manage/message-templates** → **Crear plantilla**.
2. Categoría: **Utilidad**. Nombre: `aviso_derivacion`. Idioma: **Español (ARG)** (`es_AR`).
3. Cuerpo (copiá tal cual, con las tres variables):
   ```
   Aviso de {{1}}: el cliente {{2}} necesita que lo atienda una persona. Motivo: {{3}}. El bot no le va a responder por 12 horas.
   ```
   Ejemplos para la revisión: `SEI TU Centro`, `Juan (+5493884123456)`, `reclamo por un pedido`.
4. Enviá a revisión (suele tardar minutos u horas). Cuando esté **Aprobada**, cargá `OWNER_ALERT_TEMPLATE=aviso_derivacion` en Vercel.

Si usás otro nombre o idioma, cambiá `OWNER_ALERT_TEMPLATE` y `OWNER_ALERT_TEMPLATE_LANG`. Las plantillas fuera de la ventana de 24 h tienen un costo chico por mensaje que cobra Meta: hace falta cargar un medio de pago en WhatsApp Manager.

---

## 9. Conectar los números reales de los locales

Hacé esto con cada local (Centro y Perico) cuando ya probaste con el número de prueba.

1. Decidí el camino (paso 0): **coexistencia** o **migración**.
   - **Migración (B):** en el celular del local, abrí WhatsApp Business → **Configuración → Cuenta → Eliminar mi cuenta**. Hacé backup antes si querés guardar chats. Esperá unos minutos.
2. En la app de Meta → **WhatsApp → Configuración de la API** → **Agregar número de teléfono** (o desde WhatsApp Manager → Números de teléfono).
   - Nombre visible: `SEI TU Centro` / `SEI TU Perico` (Meta lo revisa).
   - Verificá el número con el código por SMS o llamada.
   - Si te ofrece conectar la app WhatsApp Business existente (coexistencia), seguí esos pasos y escaneá el QR desde el celular del local.
3. Copiá el **Identificador del número de teléfono** de cada local y cargalo en Vercel:
   - `WHATSAPP_PHONE_NUMBER_ID_CENTRO`
   - `WHATSAPP_PHONE_NUMBER_ID_PERICO`
4. Si Meta pide un **PIN de verificación en dos pasos** para registrar el número, elegí uno de 6 dígitos y anotalo.
5. **Redeploy** en Vercel.

El bot sabe qué local es por el número que recibió el mensaje: el de Perico responde como SEI TU Perico, con su dirección y horario, y si le preguntan por el otro local, da esos datos.

---

## 10. Probar con WhatsApp de verdad

Desde tu celular personal, escribile al número (el de prueba o el del local) los 8 casos:

| Mensaje | Qué tiene que pasar |
|---|---|
| `hola` | Saluda y pregunta si buscás helados o cafetería |
| `quiero 1 kilo de helado` | Pasa el link de pedidos |
| `¿qué sabores tienen?` | Pasa el link de pedidos (no inventa sabores) |
| `¿tienen café con leche?` | Dice que sí (Doble o Jarrito). Si preguntás el precio y no está cargado, deriva |
| `pasame la carta` | Manda la carta en texto y la foto |
| `quiero hacer un reclamo` | Dice que una persona responde, **te llega el aviso** y se calla 12 h |
| `¿hacen tortas para cumpleaños?` | Deriva |
| `quiero hablar con alguien` | Deriva siempre |

Ojo: si probás desde el mismo celular que está en `OWNER_PHONE`, te va a llegar el aviso a vos mismo. Para la parte de derivación, conviene probar desde otro celular. Para seguir probando después de una derivación, mandá `bot on TU_NUMERO` (paso 11).

---

## 11. Uso diario: derivaciones y comandos

Cuando el bot deriva, ese cliente queda **12 horas sin respuestas automáticas** para que lo atienda una persona. Después de las 12 h el bot vuelve a atenderlo solo.

Desde el celular de `OWNER_PHONE`, escribiéndole **al número del local**, podés mandar:

| Comando | Qué hace |
|---|---|
| `bot on 5493884123456` | El bot vuelve a atender a ese cliente ya |
| `bot off 5493884123456` | El bot no le contesta a ese cliente por 12 h |
| `bot estado 5493884123456` | Te dice si está en pausa y cuánto falta |
| `r 5493884123456 Hola! Ya lo vemos` | Le manda ese mensaje al cliente desde el número del local (útil en el camino B) |

Con coexistencia (camino A) no necesitás los comandos: contestá desde el celular del local como siempre, y el bot se calla solo con ese cliente.

---

## 12. Si algo no anda

- **Meta no verifica el webhook:** el `WHATSAPP_VERIFY_TOKEN` de Vercel y el de Meta tienen que ser idénticos, y hay que hacer Redeploy después de cargar variables.
- **El bot no responde:** en Vercel → tu proyecto → **Logs**. Buscá líneas `[webhook]` o `[bot]`.
  - `firma inválida`: revisá `WHATSAPP_APP_SECRET`.
  - `WhatsApp API 401`: el `WHATSAPP_TOKEN` venció o le faltan permisos (paso 5).
  - `#131030 Recipient phone number not in allowed list`: con el número de prueba solo podés escribirle a los números agregados en "Para" (paso 4).
  - No aparece nada en los logs: la app no está en modo Live o falta suscribir la app (paso 7.4).
- **No me llegan los avisos:** revisá `OWNER_PHONE` (sin `+`, sin 0, sin 15) y que la plantilla esté aprobada, o mandá un "hola" al número del local desde tu celular para abrir la ventana de 24 h.
- **El bot dice un precio raro:** no puede: solo usa los de `data/carta.json`. Revisá ese archivo.
- **Responde lento:** el objetivo es menos de 5 segundos. Si tarda más, mirá en los logs si hay errores de Claude o de la base.

---

## Para quien mantenga el código

- Next.js (App Router) en Vercel. `app/api/webhook/route.ts`: verificación GET y POST con firma `X-Hub-Signature-256`. Responde 200 al instante y procesa con `after()`.
- `lib/bot.ts`: lógica principal (deduplicación por message id, historial de 10 mensajes, pausa de 12 h, avisos con ventana de 24 h y plantilla de respaldo, comandos del dueño, coexistencia con `smb_message_echoes`, mensajes que llegan seguidos).
- `lib/agent.ts`: Claude (`claude-haiku-5-5`, esfuerzo `low`, salida JSON estructurada, system prompt cacheado). `lib/prompt.ts`: reglas, locales y carta.
- `lib/store.ts`: Upstash Redis o memoria local. `lib/whatsapp.ts`: Cloud API.
- `lib/simulador.ts` + `app/simulador`: simulador sin WhatsApp. `scripts/probar-casos.ts`: los 8 casos contra Claude. `tests/`: Vitest.
