# Clientes (CRM) y el panel de WhatsApp — ficha de sección

Sección `clientes`, área `clientes`. Es el CRM mayorista: quién compró, cuándo, cuánto, cuándo hay
que volver a hablarle y qué se le dijo. Reemplazó una libreta y una planilla. Desde ago-2026 tiene
una segunda cara, **el panel de WhatsApp** (`/panel/<telefono>`), que es la misma información
mostrada de a un cliente adentro de un iframe al costado del chat.

## Dónde vive

- Pantalla: `components/crm/` (`CRM.tsx` la tabla, `ClienteModal.tsx` la ficha, `Leads.tsx`,
  `Metricas.tsx`, `GuiaTrabajo.tsx`, `useCRM.ts` la carga).
- Panel: `components/panel/PanelWhatsApp.tsx` + `lib/crm/panel.ts`. La ruta la resuelve la
  catch-all (`app/[[...seccion]]/page.tsx`, rama `esPanel`), **no** es un archivo de ruta propio.
- Dominio: `lib/crm/` — `core.ts` (agregado RFM, 485 líneas), `seguimiento.ts` (las escrituras),
  `leads.ts`, `metricas.ts`, `tipos.ts`, `telefono.core.js`.
- Servidor: `api/_crm.js`, por la puerta `api/datos?recurso=crm`. Cuatro acciones: padrón (sin
  `action`), `detalles`, `ventas` y `panel`.
- Datos: Supabase `clientes` / `ventas` / `venta_detalles` (**bdi-only por esquema**: esas tablas
  no existen en Zattia) + cuatro mapas del KV de bdi-catalogo: `crmseg`, `crmtel`, `crmleads`.
- Extensión de Chrome: `extension/` (no se despliega; se carga a mano en el navegador).
- Tests: `tests/crm-*.test.ts`. El del panel es `tests/crm-panel.test.ts`.

## ⛔ Lo que comparte con otras secciones

- **`lib/crm/telefono.core.js`** (`normalizeArgPhone`) lo usan Envíos, Canjes y el portal del
  cadete. Es JS plano porque `api/_crm.js` lo importa desde Node; `core.ts` sólo lo re-exporta.
  Cambiarle la regla mueve a quién se le puede mandar un WhatsApp en cuatro secciones.
- **`components/crm/temperatura.ts`** (`TEMP_UI`) lo dibujan la tabla y el panel. Vive aparte para
  que el mismo cliente no se vea 🔥 en una pantalla y ámbar en la otra.
- **`lib/kv/cliente.ts`** es de las 7 secciones que escriben en el KV, no del CRM.

## Reglas que el código no dice

- 🔴 **La clave `crm:seg:bdi` no tiene backup en ningún lado.** Son 305 clientes, 274 ★ y las notas
  cargadas a mano, y **cada guardado reescribe el mapa entero**. Por eso `guardarMapa` exige el
  flag `cargado` y por eso el panel, además, **relee justo antes de escribir**
  (`guardarConRelectura`): se queda abierto horas al costado de WhatsApp mientras la sección, en
  otra pestaña, toca la misma clave. Sin la relectura, un clic en el panel a las 6 de la tarde
  pisaría todo lo que se hizo en el CRM desde la mañana.
- 🔑 **El panel NO baja el CRM.** La sección baja 27.990 ventas y 12.485 clientes (~6 s, 5 MB)
  porque muestra una tabla de todos; el panel se rearma en cada cambio de chat, así que pide la
  consulta puntual (`action:'panel'`). Es la única razón por la que esa acción existe.
- 🔑 **Los números y el resumen de compras del panel salen de `lib/crm/core.ts`**, el mismo módulo
  que la ficha grande. Si el panel recalculara por su cuenta, un día las dos pantallas dirían
  cosas distintas del mismo cliente y no habría forma de saber cuál miente.
- 🔑 **El cruce por teléfono se hace de este lado, no en PostgREST.** El padrón guarda el teléfono
  **como se cargó en Gestión Nube** (con 0, con 15, con guiones), así que no hay consulta que lo
  encuentre: se normalizan los 12.500 y se compara normalizado contra normalizado. El índice queda
  en memoria de la función 10 minutos (`TTL_INDICE`), contra un padrón que se sincroniza una vez
  por día.
- 🔴 **Con dos candidatos, el panel pregunta.** El segundo intento del cruce compara los últimos 8
  dígitos y por eso puede traer más de uno; elegir el primero significa **anotar el contacto en la
  ficha de otra persona**, en silencio y sin forma de enterarse.
- 🔑 **Un cliente descartado igual muestra ficha en el panel.** Sale de la tabla a propósito, pero
  si te está escribiendo existe: mostrarlo como desconocido llevaría a cargarlo otra vez como lead.
- ⚠️ **`es_mayorista` no es cosmético**: arma la consulta de ventas. El KV se lee SIEMPRE antes que
  las ventas, y un `Promise.all` "de sentido común" hace desaparecer a los 274 clientes ★ en
  silencio (está comentado en `useCRM.ts`, pero se pierde de vista al refactorizar).
- ⚠️ **La sesión del panel es aparte.** Adentro de un iframe de otro sitio, Chrome le da al monitor
  un `localStorage` particionado: hay que entrar una vez más ahí adentro, aunque el monitor esté
  abierto en otra pestaña. No es un bug y no se puede evitar sin cookies de terceros.
- ⚠️ **No reponer el botón de WhatsApp en la tabla.** Bruno tiene a todos los clientes agendados y
  los busca por nombre. Este panel es justamente la dirección contraria: trae el monitor a donde ya
  se trabaja.

## Lo que ya se rompió acá

- El padrón entero se leía desde el navegador con la anon key: nombre, mail, teléfono y ciudad de
  12.523 personas a disposición de cualquiera. Cerrado en la Fase S → `api/_crm.js`, docblock.
- PostgREST corta en 1.000 filas sin avisar y el legacy no paginaba: 445 ventas y $12,5 M sin
  contar (f8977ca). Hoy se pagina con `id` de desempate en el `order` → `api/_crm.js:paginar`.
- El upsert de clientes de los syncs de ventas pisaba el teléfono bueno con vacío. Arreglado el
  23-ago-2026 con `ignoreDuplicates` + `scripts/sync-clientes.js`; de ahí salieron los 463
  teléfonos que hicieron viable el panel (722 de 785 mayoristas tienen teléfono usable).

## Pendiente

- ▶️ **Falta probarlo en WhatsApp Web de verdad**: la extensión se cargó pero nadie la ejerció
  contra un chat real. Lo primero que puede fallar es `numeroDelChat()` (`extension/content.js`).
- ▶️ Del diseño acordado, la versión mínima dejó afuera: **guiones** de la guía de ventas que
  escriben en el cuadro de WhatsApp, la **pestaña con la lista del día**, "**pidió y no teníamos**",
  el tilde de **difusión** y el **de dónde salió** del lead.
- ▶️ "Abrir la ficha completa" lleva a `/clientes` a secas: **la sección no tiene deep link** a un
  cliente. Es una línea de estado en `CRM.tsx` (`modalId`) leída de la URL.
- ⚠️ Los contactos registrados **todavía no se muestran en ningún lado**: el embudo de la Parte 9
  (contactados → respondieron → compraron) hay que sumarlo a la pestaña Métricas. Hasta que eso
  pase, el dato se junta pero no se lee.
- ⚠️ El monitor **no manda `X-Frame-Options` ni `frame-ancestors`**, o sea que cualquier sitio lo
  puede embeber. Hoy eso es lo que hace posible el panel; el día que se acote, hay que dejar
  entrar al origen de la extensión.
- ⚠️ 3 clientes con el teléfono mal cargado en GN (Mariano Borgiattino, Octavio Passarini, Julieta
  Sosa) y 63 sin ficha. Al de la característica de más lo rescata el segundo intento del cruce; a
  los otros no.

## Cómo se prueba

    npx vitest run tests/crm-panel.test.ts --reporter=dot

Lo que los tests **no** cubren y hay que ejercer a mano:

- El cruce contra el padrón real. Se hace desde el navegador, logueado, con
  `fetch('/api/datos?recurso=crm',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"action":"panel","tel":"549..."}'})`.
  ⚠️ La **primera** llamada después de un rato arma el índice de 12.500 teléfonos: si tarda más de
  3-4 s, hay que mirar cuánto pesa esa consulta antes de tocar otra cosa.
- La extensión entera. `chrome://extensions` → Modo de desarrollador → Cargar descomprimida sobre
  `extension/`. Ver `extension/README.md`.
- El guardado. Se verifica como todo lo que toca el KV del CRM: **el diff contra el dump tiene que
  ser exactamente el cliente tocado** (`scripts/crm-kv.mjs --dump`).
