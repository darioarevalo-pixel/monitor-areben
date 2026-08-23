# Clientes (CRM) y el panel de WhatsApp — ficha de sección

Sección `clientes`, área `clientes`. Es el CRM mayorista: quién compró, cuándo, cuánto, cuándo hay
que volver a hablarle y qué se le dijo. Reemplazó una libreta y una planilla. Desde ago-2026 tiene
una segunda cara, **el panel de WhatsApp** (`/panel/<telefono>`), que es la misma información
mostrada de a un cliente adentro de un iframe al costado del chat.

## Dónde vive

- Pantalla: `components/crm/` (`CRM.tsx` la tabla, `ClienteModal.tsx` la ficha, `Leads.tsx`,
  `LeadsDelDia.tsx` el bloque de leads arriba de la lista del día, `BancoMensajes.tsx` la ventana
  de los textos de WhatsApp, `Metricas.tsx`, `GuiaTrabajo.tsx`, `useCRM.ts` la carga).
- Panel: `components/panel/PanelWhatsApp.tsx` + `lib/crm/panel.ts`. La ruta la resuelve la
  catch-all (`app/[[...seccion]]/page.tsx`, rama `esPanel`), **no** es un archivo de ruta propio.
- Dominio: `lib/crm/` — `core.ts` (agregado RFM + las dos etapas del día), `seguimiento.ts` (las
  escrituras), `leads.ts`, `mensajes.ts` (el banco), `metricas.ts`, `tipos.ts`, `telefono.core.js`.
- Servidor: `api/_crm.js`, por la puerta `api/datos?recurso=crm`. Cuatro acciones: padrón (sin
  `action`), `detalles`, `ventas` y `panel`.
- Datos: Supabase `clientes` / `ventas` / `venta_detalles` (**bdi-only por esquema**: esas tablas
  no existen en Zattia) + cuatro claves del KV de bdi-catalogo: `crmseg`, `crmtel`, `crmleads` y
  `mensajes` (esta última es un ARRAY bajo `{bank}`, no un mapa).
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
- 🔴 **Adentro del panel, el ingreso con Google da 403 y no tiene arreglo del lado nuestro.**
  `entrarConGoogle` manda la ventana entera a Google (flujo de redirección) y Google **rechaza su
  login dentro de un iframe**, por política propia. Se entra con **usuario + contraseña**, que es lo
  que el panel necesita una sola vez. El arreglo de verdad, si algún día molesta: abrir el ingreso
  en una ventana aparte (`window.open`, donde Google sí lo acepta) y que ésa le devuelva el token al
  panel por `postMessage` — las dos son del mismo origen, así que puede guardarlo en el
  `localStorage` particionado.
- ⚠️ **La sesión del panel es aparte.** Adentro de un iframe de otro sitio, Chrome le da al monitor
  un `localStorage` particionado: hay que entrar una vez más ahí adentro, aunque el monitor esté
  abierto en otra pestaña. No es un bug y no se puede evitar sin cookies de terceros.
- 🔑 **El día tiene DOS etapas, y los fríos son la segunda.** Los chips de día (Atrasados / Hoy /
  Mañana / Esta semana) sacan a los 🧊 fríos (`sinFrios`), y el chip **🧊 Recuperar** trae la
  tanda de fríos del día: `TANDA_FRIOS` = 10, los que más compraron entre los que están vencidos.
  ⚠️ **No es un descarte**: Bruno trabaja fríos todos los días y tiene buenas recuperaciones; lo
  que no funciona es tenerlos mezclados, porque entonces no se termina ninguna de las dos listas.
  Medido el 23-ago-2026: 50 de los ~300 atrasados eran fríos.
- 🔑 **La tanda rota sola y no guarda nada.** Al registrarle el contacto a un frío se le fija el
  próximo, sale de vencidos y suben los diez siguientes. Un "ya lo mostré hoy" persistido sería
  un dato más que mantener para el mismo resultado.
- 🔴 **`friosParaRecuperar` incluye el estado `none`.** `setTemperatura` **no carga ninguna
  fecha**: un cliente sin cadencia ni fecha manual que se marca frío queda en `none` y, sin esa
  línea, salía de la lista del día por frío y de la de recuperación por no tener fecha —
  desaparecía del sistema en silencio. Hoy los 67 fríos tienen fecha; el caso se abre solo la
  próxima vez que se enfríe a alguien sin seguimiento.
- 🔑 **Los contadores de los chips salen de `contarPorDia`, no de `contarKpis`.** `contarKpis` es
  paridad con el legacy y no sabe de fríos: contarlos ahí hacía que el chip dijera 302 y la tabla
  mostrara 252. La misma función cuenta y filtra.
- 🔑 **Los leads entran en la lista del día** (`leadsDelDia` + `LeadsDelDia.tsx`), como bloque
  arriba de la tabla y no como filas: la tabla tiene 5 columnas de compras y un lead no compró
  nunca. Medido el 23-ago-2026: 37 leads cargados, **4 con un contacto registrado** y 6 que igual
  compraron — no sobran, no aparecían cuando se trabaja.
- 🔴 **Un lead `none` (sin cadencia ni fecha) entra igual en Atrasados.** 25 de los 28 activos
  estaban así: vienen del CRM viejo, donde cargar un lead no obligaba a agendarlo. Con la regla
  de los clientes, el bloque habría mostrado 3 de 28 y el problema seguía intacto. Y al marcarle
  "Le escribí hoy" se le pone cadencia **semanal** si no tiene — el mismo default del formulario
  del panel —, porque si no vuelve a quedar sin fecha y reaparece para siempre.
- 🔴 **El bloque de leads relee el mapa antes de escribir.** La pestaña Leads tiene su propia
  copia en memoria y guarda el mapa entero: sin la relectura, un clic en el bloque pisaría lo que
  se acabara de hacer allá. Misma disciplina que el panel de WhatsApp.
- 🔑 **El banco de mensajes se edita desde una VENTANA, no una pestaña** (botón "Mensajes", al
  lado de "Guía de trabajo"). Se retoca cada tanto, no todos los días. **Los grupos los arma el
  que vende**: la división de fábrica (dormido / objeciones / canal) no es la de nadie. Se carga
  al abrirse, no con la sección.
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

- ✅ **Probado en WhatsApp real el 23-ago-2026** (v0.2.0): la ficha aparece al costado del chat.
  ▶️ Falta ver en el uso diario **cuántos chats cruzan bien** contra el padrón — 722 de 785
  mayoristas tienen teléfono usable, así que el resto va a caer en "número nuevo".
- ▶️ Ponerle un ícono a la extensión: hoy Chrome le pone el cuadradito gris por defecto.
- ▶️ Del diseño acordado, la versión mínima dejó afuera: **guiones** de la guía de ventas que
  escriben en el cuadro de WhatsApp, la **pestaña con la lista del día**, "**pidió y no teníamos**",
  el tilde de **difusión** y el **de dónde salió** del lead.
- ▶️ "Abrir la ficha completa" lleva a `/clientes` a secas: **la sección no tiene deep link** a un
  cliente. Es una línea de estado en `CRM.tsx` (`modalId`) leída de la URL.
- ⚠️ Los contactos registrados **todavía no se muestran en ningún lado**: el embudo de la Parte 9
  (contactados → respondieron → compraron) hay que sumarlo a la pestaña Métricas. Hasta que eso
  pase, el dato se junta pero no se lee. Medido el 23-ago-2026: `contactos[]` tiene **0 entradas**
  — el panel recién arrancó.
- ▶️ **El banco de mensajes todavía no se ve en el panel de WhatsApp.** Ya se edita desde la
  sección; falta que el panel muestre los grupos con `[Nombre]` completado (`completar`, en
  `lib/crm/mensajes.ts`) y un botón para copiar cada uno. ⚠️ Escribir el texto **adentro** del
  cuadro de WhatsApp quedó descartado por ahora: es la parte que ellos cambian seguido.
- ▶️ **`[producto]` NO se completa solo, a propósito.** En un mensaje de postventa es lo que
  compró el cliente, pero en uno de novedad es lo que acaba de llegar —igual para todos ese día—
  y eso el sistema no lo sabe. Rellenarlo con la última compra manda "¿cómo te fue con la funda?"
  a alguien que la llevó hace ocho meses.
- ▶️ La **temperatura casi no está cargada**: 7 calientes, 4 templados, 67 fríos y **693 sin
  marcar** (que se leen como templados). Hoy la única marca que filtra de verdad es la de frío.
- ⚠️ El monitor **no manda `X-Frame-Options` ni `frame-ancestors`**, o sea que cualquier sitio lo
  puede embeber. Hoy eso es lo que hace posible el panel; el día que se acote, hay que dejar
  entrar al origen de la extensión.
- ⚠️ 3 clientes con el teléfono mal cargado en GN (Mariano Borgiattino, Octavio Passarini, Julieta
  Sosa) y 63 sin ficha. Al de la característica de más lo rescata el segundo intento del cruce; a
  los otros no.

## 🔴 WhatsApp ya no publica el teléfono (23-ago-2026)

Lo primero que se probó no anduvo, y la causa no era el selector: **el dato ya no está en la
página**. Medido sobre la cuenta de BDI (WhatsApp Business, build de 2026 con el ocultamiento de
teléfonos ya migrado — `localStorage.PhoneNumberHidingThreadPromotionMigrationState === "migrated"`):

- El `data-id` de un mensaje era `false_5493834270554@c.us_3EB0…` y **ahora es sólo el id del
  mensaje** (`3EB0E65E341B647932F5`).
- **No queda un teléfono en ningún atributo de la página.** Se recorrieron todos.
- Las conversaciones se identifican con un **LID** (`###############@lid`), un número interno de 15
  dígitos que no es el teléfono de nadie. `#main` sigue existiendo; el jid, no.
- El store `lid-pn-mapping` de IndexedDB, que sonaba al puente obvio, **está vacío** (0 registros).

⇒ Ningún retoque de selectores lo arregla. El teléfono se saca de la memoria de la aplicación:
`require('WAWebChatCollection').ChatCollection.getActive()` → `chat.contact.phoneNumber`. El store
`contact` de IndexedDB (7.418 registros, `id: …@lid` → `phoneNumber: …@c.us`) sirve de respaldo y
se puede leer desde el content script, que comparte origen con la página.

🔴 **El side panel es de la VENTANA, no de la pestaña, y tiene DOS niveles.** Abierto una vez se
quedaba abierto al cambiar de pestaña, y la ficha de un cliente aparecía al costado de cualquier
sitio. Costó tres intentos (v0.2.1 → v0.2.3, 23-ago-2026); lo que hay que saber para no repetirlos:

- **Habilitarlo por pestaña NO alcanza si el manifest declara `side_panel.default_path`**: ése es
  el panel GLOBAL y gana. Fue la v0.2.1, con el código de apagado corriendo perfecto. La versión
  que anda no declara panel en el manifest: apaga el global (`setOptions({enabled:false})`, sin
  `tabId`) y cada pestaña de WhatsApp enciende el suyo con su `path`.
- **Cambiar de VENTANA no dispara `tabs.onActivated`.** Hace falta `windows.onFocusChanged`
  también, o la pestaña activa de la otra ventana nunca pasa por el ajuste.
- ⚠️ **No manejar el clic del ícono a mano.** La v0.2.2 puso `openPanelOnActionClick:false` para
  decidir en `action.onClicked`, y **el panel dejó de abrir**: `sidePanel.open()` sólo vale como
  respuesta INMEDIATA a un gesto, y consultar la pestaña antes ya rompe esa ventana. Con el
  comportamiento nativo no hace falta: lo que `setOptions` deja escrito sobrevive al service
  worker (es estado del navegador), así que la pestaña ya está habilitada cuando llega el clic.
- No pide el permiso `tabs`: sin permiso, `tab.url` viene vacío y eso ya significa "no es
  WhatsApp".

⚠️ Eso obliga a que el script corra en el **mundo de la página** (`world: "MAIN"` en el manifest);
el mundo aislado de la extensión no ve `window.require`. Por eso la extensión tiene dos scripts:
`pagina.js` (MAIN, lee) y `content.js` (aislado, habla con el panel) que se pasan el número por
`window.postMessage`.

🔑 **El cambio deja la extensión MENOS frágil que antes para el día a día**: ya no depende del HTML,
así que los rediseños de WhatsApp —que son seguidos— dejan de romperla. Lo que ahora puede cambiar
sin aviso es esa puerta interna; cuando pase, lo que hay que buscar es el reemplazo de
`getActive()` y el resto queda igual.

## Cómo se prueba

    npx vitest run tests/crm-panel.test.ts --reporter=dot

Lo que los tests **no** cubren y hay que ejercer a mano:

- El cruce contra el padrón real. Se hace desde el navegador, logueado, con
  `fetch('/api/datos?recurso=crm',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"action":"panel","tel":"549..."}'})`.
  ⚠️ La **primera** llamada después de un rato arma el índice de 12.500 teléfonos: si tarda más de
  3-4 s, hay que mirar cuánto pesa esa consulta antes de tocar otra cosa.
- La extensión entera. `chrome://extensions` → Modo de desarrollador → Cargar descomprimida sobre
  `extension/`. Ver `extension/README.md`. ⚠️ Al cambiar un archivo hay que apretar el ⟳ de la
  extensión **y recargar la pestaña de WhatsApp**: los content scripts no entran solos en las
  pestañas ya abiertas.
- La lectura del número, sin tocar ninguna conversación de un cliente: abrir el chat propio
  (`web.whatsapp.com/send?phone=<el número de la cuenta>`) y comprobar en la consola que
  `require('WAWebChatCollection').ChatCollection.getActive().contact.phoneNumber` sea ese mismo
  número. Es como se verificó el arreglo del 23-ago.
- El guardado. Se verifica como todo lo que toca el KV del CRM: **el diff contra el dump tiene que
  ser exactamente el cliente tocado** (`scripts/crm-kv.mjs --dump`).
