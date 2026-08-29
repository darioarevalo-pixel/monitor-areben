# Clientes (CRM) y el panel de WhatsApp — ficha de sección

Sección `clientes`, área `clientes`. Es el CRM mayorista: quién compró, cuándo, cuánto, cuándo hay
que volver a hablarle y qué se le dijo. Reemplazó una libreta y una planilla. Desde ago-2026 tiene
una segunda cara, **el panel de WhatsApp** (`/panel/<telefono>`), que es la misma información
mostrada de a un cliente adentro de un iframe al costado del chat.

## Dónde vive

- Pantalla: `components/crm/` (`CRM.tsx` la tabla, `ClienteModal.tsx` la ficha, `Leads.tsx`,
  `LeadsDelDia.tsx` el bloque de leads arriba de la lista del día, `BancoMensajes.tsx` la ventana
  de los textos de WhatsApp, `Metricas.tsx`, `GuiaTrabajo.tsx`, `useCRM.ts` la carga).
- Panel: `components/panel/PanelWhatsApp.tsx` (dos solapas: Cliente y Hoy) +
  `components/panel/AgendaDelDia.tsx` (la lista del día) + `lib/crm/panel.ts` +
  `lib/crm/lista-dia.ts` (quién entra en la lista, con el KV solo). La ruta la resuelve la
  catch-all (`app/[[...seccion]]/page.tsx`, rama `esPanel`), **no** es un archivo de ruta propio.
- Dominio: `lib/crm/` — `core.ts` (agregado RFM + las dos etapas del día), `seguimiento.ts` (las
  escrituras), `leads.ts`, `mensajes.ts` (el banco), `metricas.ts`, `tipos.ts`, `telefono.core.js`.
- Servidor: `api/_crm.js`, por la puerta `api/datos?recurso=crm`. Cinco acciones: padrón (sin
  `action`), `detalles`, `ventas`, `panel` y `lista` (nombre + teléfono + total de un puñado de
  ids, para la lista del día del panel).
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
- 🔴 **El panel lee el KV SIEMPRE, haya chat abierto o no.** Estaba adentro del efecto de la
  ficha, después del `if (!telNorm) return`: con la solapa "Hoy", abrir el panel sin chat dejaba el
  mapa vacío y la lista anunciaba **"No hay nadie para contactar hoy"** con ~300 vencidos adentro.
  Un error que se lee como una buena noticia no lo reporta nadie. Hoy son dos efectos separados y
  la lista no se monta hasta que `kvListo`. ⚠️ El efecto de la ficha lee el mapa de un **ref** y no
  del estado: si dependiera de `crmSeg`, cada guardado volvería a pedirle la ficha al servidor.
- 🔑 **La lista del día del panel se arma en DOS pasos, y el orden importa.** Primero quién entra,
  con el KV solo (`lista-dia.ts`: 771 entradas, pesan nada); después el nombre, el teléfono y el
  total, de esos ~90 y no de los 12.485 del padrón (`action:'lista'`). Al revés sería bajar el CRM
  adentro de WhatsApp.
- 🔴 **El panel mira TRES lugares para saber de quién es el chat, y el tercero faltaba.** Padrón
  (servidor) → `crm:tel` → **`crm:leads`** (24-ago-2026). Sin el tercero, volver al chat de un
  prospecto ya cargado lo daba por número nuevo **y ofrecía cargarlo otra vez**: el 24-ago ya había
  **2 números duplicados** hechos así ("Maximo"/"Maximo Valdiviezo", "Ximena"/"Ximena"), y **25 de
  31 leads activos sin ninguna fecha**, porque desde el chat no se podía agendar.
  Los leads van **últimos** a propósito: si la persona ya compró, la ficha de cliente dice más.
- ⚠️ **`indexarTelefonos` NO sirve para los leads.** Descarta toda fila sin id numérico entero
  (`Number.isInteger`) y los ids de los leads son texto (`l1756…_12345`): pasarlos por ahí devuelve
  vacío **siempre, sin error y sin aviso**. `leadsPorTelefono` hace el mismo cruce de dos pasos a
  mano sobre los 40 prospectos (`cola` se exporta justo para eso). Lo cazó un test, no el navegador.
- 🔴 **DOS guardas contra el borrado en masa, y cubren cosas distintas** (la segunda, 24-ago-2026).
  `cargado` cubre **"no pude leer"**: sin lectura previa no se escribe. Lo que faltaba era
  **"leí bien y vino vacío"** — si la clave se borrara o venciera del lado del servidor, la lectura
  sale `{ok:true, dato:{}}`, un éxito indistinguible de una clave nueva, y el guardado siguiente
  escribe un mapa de un cliente encima de 771. Ahora `lib/kv/cliente.ts` **anota cuántas entradas
  llegó a ver en cada clave y rechaza la escritura que encoja a menos de la mitad** (`motivoSiEncoge`,
  piso de 20 entradas). Vale para los mapas, las listas, los cupones, el banco y las resueltas: la
  clave sin backup del CRM no es la única así.
  ⚠️ **La cuenta es por pantalla abierta**, y tiene que serlo: una clave que de verdad está vacía
  —marca nueva, sección estrenada— tiene que poder escribirse. Lo que impide es que una pantalla que
  YA vio 771 guarde 3.
  ⚠️ **No protege de borrar de a uno**: 400 clientes borrados uno por uno pasan. Para eso está la
  copia diaria, que es la otra mitad.
- 🔑 **La copia diaria corre sola en la Mac** (24-ago-2026), no en Vercel:
  `~/Library/LaunchAgents/com.bdi.respaldo-crm.plist` → `scripts/crm-kv.mjs --dump --out
  ~/Bruno/respaldos-crm --conservar 30`, todos los días 13:30. Va **fuera del repo** (un `git clean`
  se llevaría puesta una copia guardada adentro) y **fuera de Vercel** porque el dump necesita
  `MONITOR_PASS`, que en la Mac ya está en el `.env` y en Vercel habría que cargar a mano.
  ⚠️ **Si el dump sale incompleto no poda**: cambiar 30 copias buenas por una rota es peor que no
  copiar. ⛔ La contra de este camino: **si la Mac está apagada todo el día, ese día no hay copia**.
  El log de la última corrida es `~/Bruno/respaldos-crm/_ultimo.log`.
- 🔑 **La nota no es una cosa, son CUATRO** (24-ago-2026). En `crm:seg:bdi` conviven ahora
  `pendiente` (⏳ una línea, con tilde de "listo"), `tener_en_cuenta` (📌 cómo es el cliente, no
  vence), `despacho` (📦 cómo se le manda) y la bitácora `notas` de siempre. Salió de contar las
  375 notas cargadas: el ~70% es "lo que hice", dura horas, y **tapaba** a las otras dos porque
  sólo se veía la última. Las notas viejas **no se migraron** — se quedan en la bitácora, que es
  donde estaban bien.
  ⚠️ Los tres campos nuevos se guardan **sin la clave cuando están vacíos** (`conTexto` en
  `seguimiento.ts`, no `conPatch`): tres claves en `''` por 744 clientes se pagan en cada POST del
  mapa entero, y ensucian el diff contra el dump que es como se verifica que no se pisó nada.
  ⚠️ **`cumplirPendiente` devuelve el mismo mapa por identidad** si no hay pendiente cargado, para
  que la capa de arriba pueda ahorrarse un POST de 133 KB.
- ⚠️ **`NOTAS_RAPIDAS` vive en `lib/crm/seguimiento.ts`, no en cada pantalla.** Son los seis textos
  que Bruno escribe de verdad (contados sobre las 375 notas: cubren más de la mitad) y los dibujan
  **la ficha del CRM y el panel de WhatsApp**. Estaban duplicados con listas distintas. **Escriben
  en el cuadro, no guardan solas**: casi siempre hay algo que agregarle, y una nota guardada de un
  toque equivocado hay que ir a borrarla a la sección.
- ⚠️ **UNA divergencia conocida entre el panel y la sección, y es a propósito.** En la sección,
  entre dos calientes, el que más compró baja un escalón (`prioridadContacto`); eso necesita el
  total de cada uno, o sea las ventas. En el panel los calientes salen mezclados, por fecha. Los
  FRÍOS sí respetan el criterio de la sección —primero el que más compró—: son pocos y sus totales
  vienen con los nombres. `tests/crm-lista-dia.test.ts` fija lo que NO puede divergir: quién está
  vencido, con qué fecha y con cuántos días.
- 🔑 **Cambiar de chat NO recarga el panel.** La extensión le pasa el número por `postMessage` y
  adentro sólo cambia un estado. Reasignar el `src` del iframe —como se hacía— volvía a bajar el
  bundle, revalidar la sesión y releer las 771 entradas del KV **por cada cliente**. El `src` queda
  para la primera carga y para cuando el panel todavía no cargó (`load` del iframe).
- 🔑 **Desde la lista, la ficha se pide por `clienteId` y no por teléfono.** Se saltea el índice de
  12.500 números y, sobre todo, **no espera a que WhatsApp abra el chat**: el clic dispara las dos
  cosas a la vez. Cuando el chat abre, si el teléfono coincide con el pedido no se vuelve a buscar
  nada.
- 🔑 **Abrir el chat lo hace la EXTENSIÓN, no el panel.** Adentro corre el monitor en un iframe: no
  puede tocar la pestaña de WhatsApp. Manda el teléfono por `postMessage`. 🔴 El listener de
  `sidepanel.js` **filtra por origen** (`monitorareben.vercel.app`): sin eso, cualquier página
  embebida podría hacer navegar la pestaña de WhatsApp a donde quiera.
- ⛔ **Abrir el chat SIN recargar WhatsApp: probado y no se puede** (23-ago-2026). `send?phone=`
  recarga WhatsApp Web entero, ~5 s por cliente, y es lo que más se siente del circuito. Lo que se
  intentó y hasta dónde llegó, para que nadie lo repita a ciegas: el wid se arma bien
  (`createUserWidOrThrow` con sólo dígitos), la conversación se encuentra **en 0 ms**
  (`ChatCollection.get`) — pero **mostrarla falla**: `Cmd.openChatBottom`, `openChatAt` y
  `openChatFromUnread` se rompen las tres con *Cannot read properties of undefined* sobre un chat
  traído de la colección, y funcionan con `getActive()`. O sea que al modelo le falta algo que sólo
  tiene el chat ya abierto; ahí encalla y ahí habría que retomar. ⚠️ Ojo `getLatestChatForWid`:
  devuelve un REGISTRO de la base, truthy y sin `id`, así que hay que validar antes de aceptarlo —
  aceptarlo fue lo que enmascaró el problema media hora.
- 🔑 **Lo que sí compensa la demora**: la ficha no espera al chat. Se pide por `clienteId` en el
  mismo instante del clic, así que mientras WhatsApp recarga, el panel ya tiene al cliente.
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
  ⚠️ **Y la pestaña Leads NO la tenía** hasta el 29-ago-2026 — el agujero era al revés del que este
  párrafo cuidaba. Ver el bloque del final.
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
- ✅ **La lista del día ya está adentro del panel** (v0.3.0, 23-ago-2026): solapa "Hoy", 25 para
  contactar + la tanda de 10 fríos, y tocar un nombre abre su chat.
- ▶️ Del diseño acordado quedan afuera: **guiones** de la guía de ventas que escriben en el cuadro
  de WhatsApp, "**pidió y no teníamos**", el tilde de **difusión** y el **de dónde salió** del lead.
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
- ✅ **Las notas separadas en cuatro y el repaso visual del panel: hechos el 24-ago-2026.** Ver
  el bloque del final. Lo que sigue afuera del panel: el embudo en Métricas (y recién ahí bajar
  "¿Cómo te fue?" a dos botones), la ciudad y el Instagram cargables desde el panel, los
  seguidores de Instagram y el banco de mensajes.
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

## ▶️ Lo que sigue — acordado con Bruno el 23-ago-2026 (de noche)

Todo esto salió de mirar los datos reales, no de suponer. Los números están para que la próxima
sesión no tenga que volver a medirlos.

### 1. Las notas: hoy son TRES cosas en un solo renglón

Medido sobre las **375 notas** cargadas en **251 clientes**:

| Tipo | Ejemplos reales | Cuánto | Cuánto dura |
|---|---|---|---|
| **Lo que hice** | "le mandé para que entre a la comunidad" (98), "le avisé de los ingresos" (58) | ~70% | horas |
| **Lo que hay que hacer** | "🔄 preguntar por reposición" (23), "controlar recepción" (11) | ~15% | hasta que se cumple |
| **Cómo es el cliente** | "tiene 4 locales en Santiago", "es dueña de @apple_cellfree…", "la próxima enviar por otro transporte que no sea Correo", "el número de siempre no funciona" | poquísimas | **no vence nunca** |

🔴 **El problema es estructural, no de redacción**: los tres van al mismo campo y sólo se ve el
último. Como el tipo 1 es el más frecuente, **tapa a los otros dos** — una nota de junio que dice
"tiene 4 locales" queda enterrada bajo cinco "le mandé los ingresos" y no se ve nunca más.

🔑 **Qué función tiene que tener la nota**: decir, al abrir el chat, **qué tener en cuenta con esta
persona y qué quedó pendiente**. No ser el diario de lo que se hizo — eso el sistema ya lo sabe
solo (la fecha de contacto).

**Lo acordado — cuatro lugares, todos en `crm:seg:bdi`:**

1. **📦 Despacho** (siempre visible). Cómo se le manda: transporte, sucursal, a nombre de quién.
   ⚠️ **Ese dato hoy no existe en ningún lado**: la sección Envíos es del local (Tienda Nube +
   cadete), la logística mayorista se acuerda por WhatsApp y se pierde ahí. Va como **texto libre**
   —se carga más rápido y aguanta cualquier caso raro—; si algún día hay que filtrar por
   transporte, ahí se separa en campos.
2. **📌 Para tener en cuenta** (siempre visible). El tipo 3 de arriba. No vence.
3. **⏳ Pendiente para la próxima** (una línea, con tilde de "listo"). El tipo 2. **Desaparece al
   cumplirse**, que es lo que hoy no pasa.
4. **Notas** (la bitácora de siempre) + **6 botones de nota rápida**, sacados de lo que Bruno
   escribe de verdad: comunidad · ingresos · preguntar por reposición · ya compró, consultar si
   llegó bien · controlar recepción · en cierre/cotizando. Cubren **más de la mitad** de las 375.
   ▶️ Falta definir: ¿un toque guarda, o escribe en el cuadro para poder agregarle algo?

⚠️ **Cada campo nuevo se paga en cada clic**: `crm:seg:bdi` pesa **133 KB** y se reescribe entero
en cada guardado. Con esto queda en ~200 KB, que es cómodo — pero es la razón para no ir sumando
campos "por si acaso". "Cómo paga" quedó propuesto y **sin decidir**, justamente por eso.

### 2. Datos del cliente que se cargan mientras se conversa

- **Ciudad**: de los **744 clientes del CRM, 626 NO la tienen** (118 sí). El "sin ciudad" del panel
  no es un bug: Gestión Nube no la tiene. Se carga del lado del monitor, como ya se hace con los
  teléfonos (`crm:tel`), sin tocar GN.
- **Instagram**: el campo ya existe (`pagina`) y **91 de 771** lo tienen. Falta poder verlo y
  escribirlo **desde el panel**, que es donde uno se entera.
- **Lo que falta, marcado**: un "falta ciudad" apagado y clickeable que deja escribir ahí mismo.
  Suave, no alarma. Es lo que convierte la ficha en algo que se completa solo con el uso.

### 3. Métricas de Instagram (seguidores) — POSIBLE, SIN VERIFICAR

Meta tiene *Business Discovery*: dado un `@usuario`, devuelve seguidores, publicaciones, biografía
y foto. El monitor **ya habla con esa API** (`lib/meta-ads/graph.core.js`, v25.0, `META_ADS_TOKEN`).

⛔ **No probado, y hay dos riesgos reales**: funciona **sólo con cuentas de empresa/creador** (una
cuenta personal no devuelve nada), y hay que confirmar que ese token tenga los permisos de
Instagram, que son otros que los de publicidad. **`META_ADS_TOKEN` no está en el `.env` local**, así
que la prueba tiene que correr en el servidor.

▶️ **Probar ANTES de construir nada alrededor**: si la mitad de los clientes tiene cuenta personal,
no vale la pena.

### 4. El panel se ve plano — y hay algo peor que plano

🔴 **Los botones no parecen botones.** "Contestó / No contestó / Pidió precio / No le interesa" se
leen como texto suelto, y es la acción principal del panel. Idem "En 3 días / En 1 semana".

Lo acordado: botones con borde y color según el sentido; los números (pedidos/total/último) como
números y no como etiquetas; **cortar la lista de "lo último que llevó" a 3 renglones con un "ver
los 8"** (hoy un cliente grande se come media pantalla y empuja abajo lo que se usa); secciones con
cuerpo en vez de rayitas.

### 5. "¿Cómo te fue?": de cuatro botones a dos

🔑 **No hace falta marcar a los que NO contestaron**: el sistema ya sabe a cuántos se contactó ese
día (`ultimo_contacto`), así que **"no contestó" es una resta**. De los cuatro botones:

- **"Me respondió"** — se queda. Es el único dato que no se puede deducir de ninguna tabla.
- **"No le interesa"** → se queda pero como lo que es: **"Este no va"**, que lo marca frío y lo
  manda a la tanda de recuperación. No es una estadística: **cambia lo que el sistema hace**.
- **"Pidió precio"** y **"No contestó"** — se van.

⚠️ **Y el orden importa**: hasta que exista el embudo en Métricas, ese botón es un clic al vacío.
Bruno lo dijo con todas las letras — *"no entiendo qué impacto tendría"*— y tiene razón. **Primero
la pantalla que muestra el número, después el botón.**

▶️ **Idea a explorar**: "contestó" se puede deducir **sin preguntar** — la extensión puede ver si
entró un mensaje después del nuestro, sin leer el contenido de nada. Depende de las mismas puertas
internas de WhatsApp que ya nos costaron una tarde, así que va después del botón manual, no antes.

### 6. Ajustar con el uso real (no decidir antes de usarlo)

Los tres números los eligió el que escribió esto, no el que vende: **25 en la lista del día**, el
orden (calientes arriba, y dentro de cada grupo el más atrasado primero) y **qué se ve de cada
uno** (nombre · hace cuánto vence · última nota). Se revisan después de un día de uso real.

⚠️ **El orden se dio vuelta el 27-ago-2026** — ver el bloque del final. Era el más atrasado
primero; ahora es el de hoy primero. Este párrafo queda como estaba porque describe la decisión
original, y lo que la cambió fue exactamente "el uso real" que acá se anticipaba.

---

# ✅ 24-ago-2026 — las notas en cuatro lugares + el repaso visual del panel

Los puntos **1** y **4** del plan de arriba, hechos. Los otros cuatro quedan como estaban y en el
mismo orden. Lo que hay que saber y no se deduce del código:

## Lo que cambió

- **Tres campos nuevos en `crm:seg:bdi`**: `pendiente`, `tener_en_cuenta`, `despacho`. Aditivos:
  las entradas viejas no los tienen y se leen como vacío. **Nada que migrar y ninguna nota tocada.**
- **En el panel** (`components/panel/PanelWhatsApp.tsx`, `Contexto`) van **arriba de todo**, que es
  lo que se mira al abrir un chat. 🔑 **Lo cargado se ve; lo que falta es un chip de puntitos**
  (`+ 📌 Tener en cuenta`): tres cuadros vacíos esperando texto ocupan media pantalla para no decir
  nada, y la pantalla mide 350 px. El panel arranca del tamaño de lo que se sabe del cliente.
- **En la sección** (`ClienteModal.tsx`, `CampoSeg`) se ven los tres siempre: ahí hay lugar. Sin
  esto, lo cargado desde WhatsApp no se veía en el CRM.
- **El tilde del pendiente** (`cumplirPendiente`) lo borra **y deja la constancia como nota**
  (`✅ <texto>`). Borrarlo a secas perdía lo único que el sistema no reconstruye solo.
- **Visual**: cada sección es una tarjeta sobre fondo gris (antes eran rayitas de 1 px sobre el
  mismo fondo, que en una columna angosta se leen como un bloque largo); los botones pasaron de
  `ghost` a `outline` **con el tono de lo que significan** (Contestó verde, No le interesa rojo,
  Pidió precio índigo) — eran texto suelto y son la acción principal del panel; los números del
  encabezado se leen como números y no como etiquetas; **la lista de compras se corta a 3** con un
  "Ver los 8", que era lo que empujaba los botones abajo del borde en los clientes grandes.
- **Las notas ahora muestran 2 con un "Ver las 12"**, no una sola. Mostrar sólo la última es lo que
  las enterraba.
- **El cuadro de la nota se vacía SÓLO si se guardó.** Antes se borraba igual cuando el POST fallaba
  — justo cuando el cartel dice que no se guardó.

## Decisiones que se tomaron acá (y por qué)

- **Las notas rápidas escriben en el cuadro, no guardan solas.** Era la pregunta abierta del plan.
  La ficha del CRM ya lo hacía así desde antes y el motivo se sostiene: casi siempre hay algo que
  agregarle al texto base. Cambiarlo es una línea si en el uso real molesta.
- **"¿Cómo te fue?" sigue con los CUATRO botones.** Bajarlo a dos está acordado, pero **después**
  del embudo en Métricas: sacar opciones de algo que todavía no se lee en ningún lado no cambia
  nada y saca datos.
- **Las 375 notas viejas no se repartieron en los campos nuevos.** Ninguna máquina sabe si "le
  mandé los ingresos" es bitácora o pendiente, y adivinar mal llena de ruido el renglón que se
  inventó justo para que no lo tenga.

## ▶️ Lo que falta probar (no lo cubren los tests)

Los tests cubren las escrituras puras (`tests/crm-panel.test.ts`: el vacío borra la clave, el tilde
no se lleva otras notas, el mapa no se muta). Lo que hay que ejercer a mano:

1. **En el navegador**: cargar los tres campos en un cliente y verificar como siempre —
   `scripts/crm-kv.mjs --dump`, el diff tiene que ser **exactamente ese cliente**.
2. **En el panel real**, que es lo único que dice si el chip de "falta cargar" se entiende o pasa
   desapercibido.

## ✅ 24-ago-2026 (tarde) — el panel ya reconoce a los prospectos

Lo reportó Bruno usándolo: *"a los que le cargué el número, cuando vuelvo a abrirlos no tengo forma
de aplicarle cuándo lo tengo que recontactar ni poner notas"*. Dos síntomas, una causa: **el panel
nunca miraba `crm:leads`**.

- **Ficha de prospecto** (`FichaLead` en `PanelWhatsApp.tsx`): cuándo volver a hablarle (los 3
  plazos + fecha + **cadencia**, que es lo que lo hace volver solo a la lista), notas con los mismos
  botones rápidos, y los dos desenlaces que cambian lo que el sistema hace: **✓ Ya compró** /
  **✕ Este no va**. Sin resumen de compras, por el motivo obvio.
- **Cargar un lead ya no termina en un cartel**: cae derecho en su ficha. Cargarlo y agendarlo son
  el mismo momento de la conversación; mandarlo a otra pantalla para la fecha es exactamente lo que
  hacía que no se agendaran.
- **Con dos prospectos en el mismo número, pregunta** en vez de elegir — igual que con los clientes.
- `escribiHoyLead` es el gemelo de `escribiHoy` que los leads no tenían. ⚠️ El orden importa:
  `hableHoy` limpia `proximo_manual`, así que la fecha se fija DESPUÉS o se pierde.
- Guardar pasa por `guardarLeadsConRelectura`: `crm:leads:bdi` también se reescribe entera y la
  pestaña de Leads toca la misma clave.

▶️ **Lo que queda de esto:**
1. **Los 2 leads duplicados hay que unirlos a mano** (o borrar el que sobre) — el arreglo evita los
   nuevos, no limpia los viejos.
2. **Los leads todavía NO están en la solapa "Hoy" del panel.** En la sección sí
   (`LeadsDelDia.tsx`); en el panel la lista es sólo de clientes. Es lo que haría que los 25 sin
   fecha aparezcan solos.

## ✅ 24-ago-2026 (noche) — fuera "¿Cómo te fue?" y fuera la cadencia

Las dos las decidió Bruno el primer día de uso real, y las dos tienen el número al lado.

### "¿Cómo te fue?" salió del panel

*"No voy a usar por ahora el cómo te fue. Siento que es post-contacto y si no me responde no tengo
forma de usarlo."* Es el argumento bueno: **en el momento de escribir todavía no sabés qué pasó**, y
volver más tarde al chat de cada uno para marcarlo es el trabajo extra que hizo que el CRM viejo no
se usara. No se pierde nada hoy: el embudo no existe en ninguna pantalla.

- **Lo guardado NO se borró** y `registrarContacto` sigue en `lib/crm/seguimiento.ts`.
- ▶️ El día que el embudo exista, el camino es que la extensión **mire si entró un mensaje después
  del nuestro** y lo deduzca sola. El botón manual ya se probó y perdió.
- ⚠️ Con esto, **lo único que marca "le escribí hoy" son los botones de Volver a hablarle**, que
  hacen las dos cosas: anotan el contacto y corren la fecha.

### La cadencia salió del CRM entero

Medido sobre los 771 clientes: **44 la tenían cargada, 744 tienen fecha a mano —que le gana
siempre— y en 0 clientes la cadencia decidía la fecha**. Peor: **ninguna pantalla dejaba ponerla**
(las 44 venían del sistema viejo), así que el panel mostraba "Cadencia mensual (cada 30 días)" al
lado de una fecha que salía de otro lado. Un cartel que miente es peor que no tener cartel.

Sacada de **las tres fórmulas** (`estadoSeguimiento`, `estadoDe` de lista-dia, `leadEstadoSeg`) y de
**las cuatro pantallas** (panel cliente, panel prospecto, alta de lead, ficha de Leads).

- ⚠️ **No se borró nada del KV**: lo que está guardado se ignora.
- ⚠️ El estado `pendiente` **ya no se produce**: sin fecha, es `none`. Sigue en el tipo porque hay
  pantallas que todavía lo mapean.
- **Impacto real**: 1 cliente y 2 leads perdieron su fecha calculada. Los leads sin fecha **siguen
  entrando en la lista del día** como "sin agendar", que es donde se les pone una.
- `LeadsDelDia` le ponía una cadencia semanal por atrás para que "Hablé hoy" agendara algo; ahora
  usa `escribiHoyLead(…, 7)`, que era lo que esa cadencia terminaba haciendo.

### En su lugar: la sugerencia calculada (`lib/crm/ritmo.ts`)

*"Que sea todo manual, con sugerencias de en cuánto tiempo recontactar."* La diferencia es de dónde
sale el número: **no de un campo que hay que mantener, sino de lo que el cliente ya hace**.

🔑 **Y lo que se muestra no es el promedio, es cuánto falta**: "compra cada 27 días, la última fue
hace 17" ⇒ botón **"En 10 días"**. Eso contesta la pregunta que uno tiene abierta con el chat
adelante.

- **Mediana, no promedio**: un pedido raro corre el promedio y no corre la mediana.
- **Días con compra, no ventas**: dos pedidos el mismo día son una sola vez.
- **Menos de 3 compras → no dice nada.** Un número inventado se lee igual de convincente que uno
  bueno. Tope de 120 días: más allá no es "volver a hablarle".
- ⚠️ **Si ya le toca, NO hay botón, hay un dato** ("Ya le tocaba comprar"). Agendarlo para hoy lo
  dejaría en la lista de hoy después de haberle escrito.
- **Medido el 24-ago-2026 contra las 28.260 ventas reales**: sugerencia para **201 de 771 clientes**
  (133 de los 273 mayoristas). Distribución de "compra cada X días": 31-60 → 60 · 61-120 → 60 ·
  16-30 → 48 · 8-15 → 23 · 3-7 → 7 · 1-2 → 3. Los 570 restantes no llegan a 3 compras: ven los tres
  plazos de siempre y nada más.

## ✅ 24-ago-2026 — "ya es cliente mío, cambió de número" + fuera el Excel de teléfonos

Lo preguntó Bruno usándolo: *"¿qué pasa si un cliente modificó su número, qué debería hacer para
que la ficha siga abriendo?"*. La respuesta honesta era: **cambiarlo en Gestión Nube y esperar a la
madrugada** (`sync-clientes.yml` corre 07:00 UTC). En el momento de la conversación, nada.

### El botón nuevo

La pantalla de número desconocido pasó a tener **dos caminos** (`NumeroNuevo` en
`PanelWhatsApp.tsx`):

1. **Ya es cliente mío, cambió de número** → busca por nombre y engancha el número.
2. **Es alguien nuevo** → el formulario de lead de siempre.

Antes había uno solo, y el caso más común es el primero: ofrecerle "guardar como lead" a alguien
que ya compró 8 veces crea un prospecto duplicado de un cliente.

- 🔑 **Enganchar NO pisa el número viejo.** El nuevo va a `crm:tel`, el que tenga GN sigue en el
  padrón, y el panel mira el padrón primero: **los dos abren la misma ficha**. Es lo que uno quiere
  cuando alguien cambia de línea pero sigue contestando por la vieja un tiempo.
- ⚠️ **La búsqueda va sólo contra los clientes del CRM** (`action:'buscar'`, con los ids del KV que
  el panel ya tiene). El padrón tiene **14.131** personas —cada consumidor final que pasó por el
  local—; ofrecerlos todos para "es un cliente mío" es ofrecer 14.000 que no lo son.
- ⚠️ El patrón del `ilike` va como **parámetro** de supabase-js y con los `%`/`_` escapados: lo
  escribe una persona y termina en la query string de PostgREST.
- Después de enganchar, la ficha se recarga **por id**: el índice de teléfonos del servidor se
  rearma cada 6 h, así que buscar por teléfono todavía no lo encontraría.
- Sirve igual para los **66 clientes del CRM sin ningún teléfono**: la primera vez que escriben,
  quedan enganchados.

### La subida del Excel de teléfonos salió

Existía porque la API de ventas de GN no expone el celular. **Eso lo resolvió el sync del padrón**
(23-ago-2026, corre solo todas las madrugadas).

**Medido antes de sacarla**: de las **653 entradas** que el Excel dejó en `crm:tel`, **las 653 dicen
exactamente lo mismo que el padrón**. Ninguna aportaba nada — y volver a subir el archivo sólo
servía para **pisar** los números enganchados a mano, porque el merge era `{...override, ...excel}`.

- ⚠️ **`crm:tel` NO se borró y se sigue leyendo.** Cambió quién lo escribe: ahora `vincularTelefono`,
  de a un cliente por vez. Las 653 entradas redundantes se dejan (borrar la única copia de algo, por
  unos KB, no se paga).
- Se fueron con ella: `parsearTelefonos` (`lib/crm/seguimiento.ts`), `guardarTel` (`useCRM`) y sus
  tests. `crmTelOverride` se sigue leyendo — `calcularAgregado` lo usa para el teléfono de los que
  el padrón no tiene.

## ✅ 24-ago-2026 — los plazos: siete números, el calendario adelante y nada en fin de semana

Bruno después de un día de uso: *"funciona más el calendario de cuándo volver a contactar, y
necesito más opciones — mañana, 1 2 3, 7 15 21 y 30, que sea medio factor común para que no sea
grande esa sección. Y la fecha tiene que ser un día que no sea fin de semana."*

- **De tres botones a siete fichitas.** "En 1 semana" ocupaba un renglón para dar una opción; un
  título ("En cuántos días") con siete números ocupa uno solo y da siete. `PLAZOS_DIAS` vive en
  `lib/crm/core.ts` y lo usan **las tres pantallas** — panel cliente, panel prospecto y ficha del
  CRM: con listas distintas, el mismo cliente se agenda distinto según desde dónde se lo toque.
- **Cada fichita dice en qué día cae** (`title`: "En 15 días · lun 8/9"), ya corrido. Un "15" pelado
  obliga a la cuenta de cabeza, que es lo que hacía preferir el calendario.
- **El calendario pasó a ancho completo**, debajo: es lo que más se usa.
- 🔑 **`diaHabil` corre sábado y domingo al LUNES, y es regla del DATO, no del botón**: la aplican
  `escribiHoy`, `escribiHoyLead` y también `setProximoManual` (la fecha elegida a mano). Corre para
  adelante — al revés estaría contactando antes de lo pedido.
- ⚠️ **Si la fecha se corrió, el panel lo dice** ("Ese día es fin de semana: quedó el lun 31/8").
  Un cambio silencioso en el dato que se acaba de tocar es cómo se deja de creer en la pantalla.
- ⚠️ **No sabe de feriados.** Una tabla de feriados hay que mantenerla todos los años y el día que
  se desactualiza miente en silencio; un feriado se ve el día que pasa y se corre a mano.
- **Lo ya guardado no se migró**: medido, **10 de los 744 clientes** tienen fecha de fin de semana
  (y 0 de los leads). Se acomodan solas la próxima vez que se las toque. Reescribir el KV entero
  para diez fechas no se paga.

## 🔴 25-ago-2026 — "no me reconoce a Candela Martin" (dos causas, una era un bug mío)

Bruno: *"no me reconoce a Candela Martin cuando abro el chat. Y si aprieto cambió de número, no la
encuentra."* Dos síntomas distintos, y conviene no mezclarlos:

**1. No la reconoce al abrir el chat → está escribiendo desde OTRO número.** No es un bug. En el
padrón es `#648111 Candela Martin`, teléfono `1170157094`, que normaliza bien
(`5491170157094`), es único —no lo comparte con nadie ni por los últimos 8 dígitos— y el índice del
servidor cubre **los 13.696 clientes con teléfono**, no sólo los del CRM. Si estuviera escribiendo
desde ése, lo encontraría. Es exactamente el caso para el que se hizo "cambió de número".

**2. La búsqueda no la encontraba → ése SÍ era un bug, y estaba en el filtro.**
`buscarClientes` buscaba entre las claves de `crm:seg`, que **no son "los clientes del CRM" sino
"los clientes que alguien ya tocó"**. Candela compró **$146.022 el 16-ago** (canal 10) y nadie le
había puesto todavía ni una nota, así que no tenía entrada y era invisible — **justo el caso en el
que más falta hace**: el cliente nuevo, sin historia en el CRM, que cambia de número.

Ahora el filtro es la definición de verdad: **tener una venta por el canal mayorista**. Dos
consultas chicas — los nombres que coinciden, y cuáles de ésos compraron.

### Y de paso, dos trampas que aparecieron mirando esto

- 🔴 **`ilike` NO ignora los acentos**: `%martin%` no encuentra a "Martín". Se resuelve reemplazando
  las **vocales del texto buscado por `_`** (`patronBusqueda`, exportada y con tests). Es la vuelta
  barata; la de verdad, `unaccent`, es una extensión de Postgres que hay que instalar. Sin esto,
  buscar "martinez" no encontraba a "Martínez Meli" y el que busca concluye que el cliente no está
  — y termina cargándolo de nuevo.
- ⚠️ **El tope de candidatos corta en silencio.** Estaba en 120 y el filtro por "compró" saca al
  ~95%: `"martin"` daba **6** clientes del CRM con tope 120 y **12** con tope 400. Quedó en 400.

### Cómo se diagnosticó (sirve para la próxima)

Con el `SUPABASE_SERVICE_KEY` del `.env` y el dump del KV: buscar a la persona en `clientes`,
mirar si su teléfono normaliza, si es único (exacto y por cola), si tiene entrada en `crm:seg` y si
tiene ventas. ⚠️ **Ojo con concluir desde una consulta con `limit`**: la primera búsqueda de esta
sesión usó `or=(...)` con `limit=40`, no la trajo, y llevó a decir que no existía. Existía.

## ⏸️ PENDIENTE (medido, no construido) — "¿está en la comunidad mayorista?"

Bruno preguntó el 25-ago-2026 si se puede saber solo, desde el panel, si el cliente con el que está
hablando está en la comunidad. **Se midió: SE PUEDE.** Queda pendiente de construir, por decisión
suya (*"¿lo podemos dejar como algo pendiente?"*).

### Lo medido el 25-ago-2026 (no hace falta volver a medirlo)

Comunidad `BDI Accesorios Mayorista`, **458 participantes**.

| Qué | Resultado |
|---|---|
| Con teléfono directo (`@c.us`) | **0 de 458** — todos vienen con LID |
| Traducidos con `ContactCollection.get(lid).phoneNumber` | **458 de 458 (100%)** |
| Que dan algo **distinto** del LID (traducción real, no eco) | **458** |
| Con forma argentina (empiezan con 54) | **456** |
| Dígitos LID / teléfono | **14 / 13** — 13 es la forma `549…` que usa el CRM |

🔑 El 100% se sostiene porque Bruno **tiene a todos agendados**; con otra cuenta sería otro número.

⚠️ **La trampa del falso 100%**: la primera medición contó "teléfono válido" con `length >= 8`, y
el LID tiene 15 dígitos — **habría dado 100% aunque no tradujera nada**. Hubo que medir aparte que
el resultado fuera DISTINTO del LID. Vale para cualquier medición parecida.

### Cómo se lee

- `require('WAWebChatCollection').ChatCollection.getModelsArray()` → filtrar `@g.us`
- `g.groupMetadata.participants.getModelsArray()`
- `require('WAWebContactCollection').ContactCollection.get(<lid>).phoneNumber`
- ⚠️ `groupMetadata` **está vacío hasta que la comunidad se abre una vez** en esa sesión.
- ⚠️ Misma puerta interna que `getActive()`: cuando WhatsApp la cambie, se rompe con el resto.

### El diseño acordado, en dos partes

- **A. En el panel, por chat**: "✅ Está en la comunidad" / "○ No está". **No manda nada al
  servidor** — la extensión ya tiene la lista en memoria y compara el teléfono del chat abierto.
  Es por donde hay que empezar.
- **B. En el CRM, quién falta**: cruzar los 458 contra los clientes exige que el monitor reciba la
  lista una vez por día y marque `en_difusion` solo. ⚠️ **Pisa las 120 marcas manuales**, que es el
  punto: la comunidad tiene 458 y el CRM sólo 120 marcados. Y **118 de las 383 notas** dicen "le
  mandé para que entre" — esa nota registra la INVITACIÓN, no la membresía.

⛔ **Límites que hay que decir antes de construirlo**: sólo anda con WhatsApp Web abierto; la
comunidad tiene que haberse abierto una vez; y depende de la puerta interna de WhatsApp.

## ✅ 26-ago-2026 — el Instagram, en el panel

Lo pidió Bruno: *"quería ver si podíamos agregar para agendar el instagram dentro del panel, o si
está ya cargado, que se pueda ver también"*.

**Está en el encabezado de la ficha**, debajo de la ciudad, en las dos fichas — la del cliente
(`crm:seg.pagina`) y la del prospecto (`Lead.instagram`):

- **Cargado**: se ve como enlace y abre el perfil (`leadInstaHref` resuelve `@usuario` y también un
  link completo). Al lado, un "cambiar".
- **Vacío**: un chip apagado `+ Instagram`, del mismo tamaño que los de los tres campos de la nota.
  Lo que falta se ofrece, no se reclama.

🔑 **Se carga acá porque acá es donde uno se entera**: el dato aparece en la conversación —te lo
pasa el cliente, o lo ves en su perfil—, y hasta ahora había que salir del chat, abrir el CRM y
buscar la ficha. Por eso lo tenían **91 de 773** clientes y **12 de 43** leads (medido el
26-ago-2026).

⚠️ Guarda al salir del cuadro, como todo el panel: cada guardado reescribe el mapa entero del KV.
Vaciar el cuadro borra el dato.

▶️ **La gemela que quedó sin hacer: la ciudad.** Le falta a **626 de 744** y el encabezado ya dice
"sin ciudad" en un renglón que no hace nada. Es el mismo componente con otro campo.


---

# 🔴 27-ago-2026 — el orden de la lista del día, dado vuelta

Bruno: *"hay un tema de recontactos que no funciona bien, en realidad no lo estoy usando bien, y
eso me genera problemas de a quién hablarle"*.

**No lo estaba usando mal.** Lo usaba bien y la lista no le devolvía nada.

## El bug, que no es un bug sino un orden

La lista ordenaba **del más atrasado al menos**: `(a.dias ?? 1) - (b.dias ?? 1)`, con los días
negativos para lo vencido. Suena a sentido común —"primero el que hace más que espera"— y hace
justo lo contrario de lo que hace falta:

- el que se agendó **para hoy** lleva 0 días de espera → **último**;
- el que quedó colgado hace dos semanas lleva 13 → **primero**.

O sea que **cuanto mejor se usa el CRM, menos aparece la gente**. Se agenda a un cliente para el
lunes, llega el lunes, y esa persona no está en la lista. La fecha que se le promete al cliente
**no se cumple nunca**, y quien la usa deja de confiar en la lista.

## Medido contra producción ese día

- 226 en la lista, **25 lugares** en el panel.
- Los **5 agendados para hoy** caían en los puestos **222, 223, 224, 225 y 226**. Ninguno entraba.
- Los 25 que se veían eran todos del **13 y 14 de agosto**.

⚠️ **Y la pila no era basura**: los 25 habían comprado todos hace menos de un año, y arriba estaban
Manuel Sosa ($5,8M, hace 35 días), Agustín Gramajo ($4M) y Agustina Córdoba ($2,9M). El problema
nunca fue **quién** entra en la lista sino **en qué orden**.

## El arreglo: `urgenciaFecha` en `lib/crm/core.ts`

```ts
export function urgenciaFecha(dias: number | null | undefined): number {
  return dias == null ? 999 : Math.abs(dias)
}
```

🔑 **El valor absoluto es todo el arreglo.** Los grupos ya vienen separados por `seg_estado`, así
que esto sólo desempata adentro de uno, y con la misma expresión sirve para los dos casos:

- **vencidos** (días ≤ 0) → 0, 1, 2…: hoy primero, el atraso más viejo último. **Dado vuelta.**
- **"esta semana"** (días 1 a 7) → 1, 2, 3…: mañana primero. **Igual que antes.**

`null` es el `pendiente` heredado: sin fecha contra la cual medir el atraso, va al final.

⚠️ **Se cambió en los DOS lados a propósito**: `listaDelDia` (el panel) y `filtrarOrdenar` (la
sección). Es la misma regla de siempre —si divergen, el panel dice que un cliente está atrasado y
la sección que está al día, sobre el mismo dato.

## El resultado, sobre los mismos datos reales

| | Antes | Ahora |
|---|---|---|
| Los 5 agendados para hoy | puestos 222 a 226 | puestos **2 a 6** |
| Fechas de los 25 visibles | 13 y 14 de agosto | 25, 26 y **27** de agosto |

## Tests

- `crm-lista-dia.test.ts`: el orden dado vuelta, y **"el de hoy le gana al colgado aunque el tope
  corte"** — 60 atrasados y uno de hoy, el de hoy sale primero. Ése es el caso real.
- `crm-prioridad.test.ts`: el mismo vuelco en la sección, más el test de que **los futuros NO se
  dan vuelta** (mañana sigue antes que dentro de 7 días), que es lo que el valor absoluto podría
  haber roto sin que nadie lo note.


---

# 🔴 29-ago-2026 — cuatro guardados correctos borraron 327 marcas

Darío, usando el panel: *"marqué una fecha de recontacto en el panel que luego en el CRM amplio no
se cargaba"*. Investigándolo apareció algo peor que el síntoma.

## Lo que pasó, reconstruido con ocho dumps consecutivos

El 27-ago se marcaron **327 clientes como 🧊 fríos a las 14:50**. **A las 16:30 no quedaba
ninguno.** En esa ventana alguien atendió **3 o 4 clientes** desde la pestaña del CRM —notas
nuevas, fechas de recontacto, un Instagram: trabajo legítimo, guardado bien—. Pero esa pestaña
estaba abierta desde antes de las 14:50, y **cada guardado posteó el mapa entero de 773 fichas con
su foto vieja**.

🔑 **Se pudo saber qué pantalla fue**: esa foto ya tenía los 43 descartados (escritos ~13:50) y
todavía no las temperaturas (14:50), así que se cargó entre esas dos horas y siguió abierta. El
panel no podía ser: relee milisegundos antes de escribir.

⚠️ **Ningún error, ningún aviso, y el `cargado` no lo cubre**: la lectura inicial fue exitosa. Lo
que envejeció fue la copia, no el permiso para escribir.

## La asimetría que lo causaba

`guardarConRelectura` existía desde el 23-ago y el docblock decía por qué: *"el panel queda abierto
horas mientras la sección Clientes escribe sobre la misma clave"*. **Se pensó el problema en una
sola dirección.** El panel no pisaba a la sección; la sección sí al panel — y la pestaña de Leads
también.

| Pantalla | Antes | Ahora |
|---|---|---|
| Panel de WhatsApp (`crm:seg`) | relee ✅ | relee ✅ |
| Panel: alta de lead | relee, a mano | `guardarLeadsConRelectura` |
| `LeadsDelDia` | relee, a mano | `guardarLeadsConRelectura` |
| **Sección Clientes (`useCRM.guardarSeg`)** | 🔴 **posteaba su copia** | `guardarConRelectura` |
| **Pestaña Leads (`Leads.persistir`)** | 🔴 **posteaba su copia** | `guardarLeadsConRelectura` |

## El arreglo

**`lib/crm/persistencia.ts`** (nuevo): `guardarConRelectura` y `guardarLeadsConRelectura`, mudadas
desde `panel.ts`. El nombre importaba: mientras vivieran ahí, que la sección las usara se leía como
un error, y por eso nadie lo hizo.

🔑 **La firma ES el arreglo.** `guardarSeg` y `persistir` ahora reciben el **patch**, no el mapa ya
armado. Una firma que aceptara el mapa hecho volvería a abrir el agujero **y se vería igual de
bien** — que es exactamente lo que pasó: `mutar` en `CRM.tsx` ya escribía patches puros, pero los
aplicaba contra su copia antes de mandarlos.

- El optimista se aplica sobre la copia local (la tabla responde ya); lo que se **guarda** se arma
  sobre el mapa recién leído. Son dos mapas distintos a propósito.
- Al volver el POST el estado se reemplaza por el del servidor, así que **la sección se entera de
  lo que escribió el panel** sin recargar.
- ⚠️ Si falla, se revierte a la copia previa. Antes no se revertía: la tabla mostraba un cambio que
  no se había guardado.
- ⚠️ **No usar un `ref` para leer la copia local durante el render**: `react-hooks/refs` lo prohíbe
  con razón. Va como dependencia del `useCallback`.

## Tests — `tests/crm-persistencia.test.ts`

El caso del 27 reproducido: la pantalla guarda sobre el cliente 1 mientras el 2 se marcó frío en el
servidor, y el POST tiene que salir con **el cambio propio y la marca ajena**.

🔑 **Y uno de arquitectura**: recorre `components/crm/` y `components/panel/` y falla si alguna
pantalla vuelve a llamar `guardarMapa` con `kind: 'crmseg'` o `'crmleads'`. **Encontró los tres
casos que quedaban** —`Leads.tsx` con el bug, y `LeadsDelDia`/`PanelWhatsApp` con el patrón copiado
a mano—, que la revisión a ojo no había visto.

## ⚠️ Lo que este arreglo NO hace

**No recupera las 327 temperaturas**: hay que volver a aplicarlas. Y **no cambia que los fríos
queden fuera de las listas de trabajo por día** (`sinFrios` en `filtrarOrdenar`, y `listaDelDia` en
el panel): un cliente frío con fecha a mano sigue apareciendo sólo en 🧊 Recuperar. Lo acordado con
Darío es **no tocarle la temperatura a nadie al escribirle** —que le hables no lo vuelve activo, y
el dato dejaría de significar lo que dice— sino **poner filtros por tipo en el panel**
(frío/tibio/caliente/todos). Eso está sin hacer.


---

# ✅ 29-ago-2026 — los cinco botones del panel, y el techo que cortaba sin avisar

Darío: *"quiero agregarle filtros de contacto al panel: 🔥 calientes / templados / 🧊 fríos / todos.
Poder ir a buscar a quien quiera desde el panel, **sin que el sistema me cambie la temperatura del
cliente**. Que le mande un mensaje a un frío no lo vuelve tibio — la temperatura describe al
cliente, no la cola de trabajo"*.

Es la deuda que había dejado escrita el arreglo de las 327 marcas, tres bloques más arriba.

## 🔴 Lo que apareció mirándolo: `action:'lista'` se comía clientes en silencio

El handler aceptaba 300 ids y hacía **`.slice(0, TOPE_IDS_LISTA)`**. Al que se pasara no le llegaba
un error: le llegaba **una lista del día con gente faltante**, sin nada que mirar y sin forma de
notarlo. Su propio docblock decía *"hoy se piden ~90"*.

**Medido ese día: se pedían 236.** A 64 del techo. Y el número **sube solo** —cada cliente que se
marca 🧊 suma un id al pedido—, así que las 327 temperaturas todavía sin recargar lo estaban
tapando: al volver a marcarlas, se pasaba.

| | antes | ahora |
|---|---|---|
| pedido de más | recorta a 300, sin aviso | **400 con el motivo escrito** |
| quién corta | el servidor, a ciegas | el llamador, que sabe qué pide |
| cómo pide el panel | todo de un saque | de a `LOTE_IDS` = 250 y une |

`tests/crm-lista-tope.test.ts` amarra las dos mitades, incluida la única relación entre los dos
archivos que **el compilador no ve**: `LOTE_IDS ≤ TOPE_IDS_LISTA`.

## 🔑 «Templado» y «nunca lo marcaste» eran el mismo valor — y son 4 contra 340

`temperatura` del KV es **opcional** (nació en ago-2026, aditivo), pero los dos lectores la leían
con `|| TEMPERATURA_DEFAULT`. O sea que la diferencia **estaba guardada** y se perdía al leer.

Medido el 29-ago sobre los 730 activos: **8 calientes · 4 templados · 378 fríos · 340 sin marca.**
Un botón "🟡 templados" habría devuelto **344**: el más grande de los cinco y el más inútil.

Se separó **la etiqueta, no la cola**:

- `FilaListaDia.marcada` y `ClienteCRM.temperatura_marcada` dicen si la puso alguien;
- `temperatura` **sigue cayendo al default**, así que los 340 ordenan, filtran y entran en la lista
  del día exactamente como antes;
- `TEMP_UI` gana `sin_marcar` (⚪) y lo usan **la tabla y el panel**, que es para lo que ese archivo
  existe — el badge no puede decir 🟡 de un lado y ⚪ del otro sobre el mismo cliente.

⚠️ **`sin_marcar` no se guarda nunca.** Es la falta de las otras tres. Marcar sigue escribiendo
`caliente`/`templado`/`frio`, y el primer clic del badge sigue yendo a 🧊 como siempre.

`tests/crm-filtros-panel.test.ts` prueba lo segundo antes que lo primero: **que la lista del día no
se mueva**. Si separar la etiqueta hubiera sacado a esos 340 de la cola, el cambio le habría
vaciado media lista a quien la usa todos los días.

## Las tres preguntas que Darío puso antes de que se escribiera nada

**1 · ¿El filtro muestra sólo los vencidos, o todos los de ese tipo?** → **todos**, vencidos
arriba. Con el corte de la cola, de 8 calientes se verían 2, y el que fue a buscar a alguien
agendado para el mes que viene no lo encontraría. Sin tocar nada, el panel sigue mostrando lo que
vence: **ése es el default y no cambió**.

**2 · ¿Qué pasa con el tope de 25 y la tanda de 10?** El tope de 25 era el paliativo del orden roto
del 27-ago; ahora es "mostrar 25 + **ver más**", un corte que se ve. La tanda de 10 es la que
**tapaba** a los fríos: de 192 vencidos se mostraban 10 y **se tiraban 182**. Sigue siendo la dosis
diaria de la vista "Hoy", y deja de aplicar en cuanto se toca 🧊.

**3 · ¿Hace falta un buscador?** Sí, y rinde más que los botones. `buscarClientesPorNombre` ya
existía **escondido adentro de "ya es cliente mío, cambió de número"**: sólo hubo que sacarlo
arriba. 🔑 **Es lo único que alcanza a quien no está en el KV** — los botones sólo pueden mostrar a
los 730 que alguien tocó alguna vez; el buscador pregunta por los 12.485 del padrón. Por eso
conviven: no son dos caminos al mismo lugar.

## Los prospectos: el problema no era filtrar

**En el panel no aparecía ninguno.** `AgendaDelDia` recibía sólo `crmSeg`; el bloque "Leads para
contactar" vive en la sección Clientes del monitor — justo la pantalla que no se mira mientras se
atiende WhatsApp. Y los 29 activos sin fecha **sí** salen en la sección: `leadsDelDia` los incluye
a propósito desde el 23-ago.

- `leadsDelPanel` (`lib/crm/leads.ts`): vencidos + **los de HOY** + los que no tienen fecha. Lo de
  hoy es lo que `atrasados` deja afuera, y repetir ese corte acá sería el defecto del 27-ago otra
  vez, con prospectos.
- Van **abajo y aparte**, decisión de Bruno: un lead no tiene temperatura, así que no cabe adentro
  de 🔥/🟡/⚪/🧊 sin inventarle una, y mezclarlo diría que un lead y un cliente son la misma cosa.

🔴 **Y un prospecto nuevo ya nace agendado**, que era el problema de fondo — 29 de 37 sin ninguna
fecha, o sea fuera de toda cola de trabajo:

| dónde | antes | ahora |
|---|---|---|
| panel (`NuevoLead`) | guardaba sin fecha | **pide "¿en cuántos días?"**, y sin eso no guarda |
| pestaña Leads (`agregar`) | lo creaba en blanco | nace a `PLAZO_LEAD_NUEVO` = 7 días hábiles |

⚠️ **Esto NO reintroduce la cadencia**, que salió el 24-ago. No calcula un ritmo a partir de nada:
en el panel **se pregunta**, y en la pestaña —que no tiene formulario de alta, crea y abre la
ficha— se pone un plazo por defecto que queda a la vista y se corre de un toque.

## Dos bugs que aparecieron de paso

- 🔴 **`id: 0` = "cruzalo por teléfono".** Tocar un prospecto de la lista mandaba `clienteId: 0`,
  que no existe, y el panel terminaba **ofreciendo cargarlo como lead de nuevo** — el duplicado que
  ya se pagó el 24-ago. Y el teléfono que se cruza es el **del pedido**, no `telNorm`: cuando se
  toca un nombre, WhatsApp todavía no navegó y `telNorm` es el del chat anterior.
- La ficha del cliente **sin ventas** salía clavada en `templado` y `en_difusion: false` aunque el
  KV dijera otra cosa. Ese fallback es para el cliente sin ventas, no para el cliente sin
  seguimiento: uno marcado 🔥 que todavía no compró existe, y es de los que más importan.

## Lo que este trabajo NO hace

- **No recupera las 327 temperaturas.** Siguen habiendo que volver a aplicarlas. Con el filtro ⚪
  ahora al menos se ve el tamaño del agujero.
- **No cambia quién entra en la lista de trabajo.** Ni la etiqueta ⚪, ni los filtros, ni el
  buscador tocan la temperatura de nadie: escribirle a un frío lo deja frío, que es lo pedido.
- **No se probó en el navegador**: los cinco botones, el buscador, el "ver más" y el formulario de
  alta con la fecha están sin mirar por Bruno.
