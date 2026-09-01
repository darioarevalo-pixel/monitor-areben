# Ingresos (lo que entró) — ficha de sección

Sección `recepciones`, área `compras`. **Las órdenes de compra que el sistema de Ingresos confirma
como recibidas**: proveedor, artículos, unidades pedidas contra contadas, las diferencias renglón
por renglón y el cumplimiento acumulado de cada proveedor.

⛔ **No es «Ingresos proyectados»** (`docs/secciones/ingresos.md`), que es la importación de fundas
*que viene* —sólo BDI, en el KV de bdi-catalogo—. Ésta es la que *llegó*, para las dos marcas, y no
se carga a mano: **entra sola por webhook**.

🔑 **Nadie escribe acá desde la pantalla.** No hay alta, ni edición, ni borrado. Lo único que
escribe estas tablas es `api/_oc-webhook.js`. Si un dato está mal se corrige del otro lado y se
vuelve a confirmar la OC: el evento nuevo pisa la fila.

## Dónde vive

`components/recepciones/` (`Recepciones.tsx` la lista, `DetalleOC.tsx` una orden) ·
`lib/recepciones/core.ts` (lo derivado, puro) · `lib/recepciones/webhook.core.js` (el contrato del
webhook, puro) · `lib/recepciones/cliente.ts` · handlers `api/_oc-webhook.js` (escribe, **abierto**)
y `api/_recepciones.js` (lee, con sesión) · tablas en `sql/migrate-recepciones.sql`
(`scripts/apply-recepciones.mjs`) · tests: `tests/recepciones-webhook.test.ts`,
`tests/oc-webhook-handler.test.ts`, `tests/recepciones.test.ts`.

**Ninguna función nueva de Vercel**: los dos handlers entran por `api/datos.js` con `?recurso=`.
Siguen siendo **7 de 12**.

## La URL y el secreto

```
POST https://monitor.arebensrl.com/api/datos?recurso=oc-webhook
```

Es exactamente lo que tiene cargado el emisor. ⚠️ **Renombrar el recurso apaga el envío** sin que
falle nada de este lado: el emisor empieza a recibir 400 y a los seis reintentos marca fallido.

El secreto compartido va en la variable **`INGRESO_WEBHOOK_SECRET`** de Vercel (base64, con o sin
el prefijo `whsec_`). **Sin ella el endpoint contesta 503**, que es a propósito: el 503 hace que el
emisor reintente, y sus reintentos cubren casi 17 horas — o sea que cargar la variable tarde no
pierde los eventos de ese rato. Un 401 los habría perdido.

## ⛔ Lo que hay que saber antes de tocar

- 🔴 **`_oc-webhook.js` NO pide sesión, y por eso está solo en su archivo.** Es el mismo criterio que
  `disenos-rondas`/`votacion` y `reclamos`/`reclamo`: un verbo abierto no convive con verbos con
  login en el mismo archivo, que es como se cuela el que se olvidó de pedir la sesión. La lectura
  vive en `_recepciones.js`, que sí exige usuario y el permiso `recepciones`.
- 🔴 **El cuerpo se lee del STREAM, no de `req.body`.** La firma es sobre los bytes exactos:
  parsear y volver a serializar la rompe, y falla con «firma inválida», que no se parece en nada a
  su causa. Se puede leer aunque el runtime ya lo haya consumido porque `@vercel/node` lo **repone**
  con un `PassThrough` parcheando `req.on('data')`/`req.on('end')` — por eso `leerCrudo` usa esos
  dos eventos y ⛔ **no** `for await (const c of req)`, que va por `on('readable')` y ese no está
  parcheado. Lo fija `tests/oc-webhook-handler.test.ts`, donde el `req` falso trae un `req.body`
  **distinto** del cuerpo: un handler que leyera de ahí no valida nunca.
- 🔴 **Los tres códigos de rechazo significan cosas distintas para el emisor** y no son
  intercambiables: `400` mensaje viejo o mal formado (reintentar no lo arregla), `401` firma
  inválida (hay dos secretos distintos), `503` no tenemos secreto cargado (**el reintento sí
  sirve**). Y un **tipo de evento desconocido se acepta con 200**: el emisor no puede arreglar
  reintentando que su evento no nos interese, y serían 17 horas de ruido.
- 🔑 **La idempotencia cuelga de `webhook_id`, que es la clave primaria del evento.** Un reintento
  trae el mismo id, choca y se contesta 200 sin reprocesar. ⚠️ **Salvo si el evento anterior quedó
  en `error`**: ése sí se reprocesa, porque si no el reintento —que es justo lo que arreglaría una
  caída de la base— chocaría con la fila del intento fallido y se perdería para siempre.
- 🔑 **La clave de la OC es `(store, oc_id)`, no el evento.** Una orden que se vuelve a confirmar
  **pisa** su fila y sus renglones se reemplazan enteros: son la foto del último conteo, no un
  historial. El `delete` de renglones va **antes** del `insert`.
- 🔑 **Las tres tablas viven en UNA sola base (la de BDI) con columna `store`**, al revés que
  `pedidos_clientes`. Un webhook no puede elegir base: si la credencial de una marca no estuviera
  cargada, el POST daría 500, el emisor reintentaría 17 horas y después marcaría fallido — **y no
  hay quién lo vuelva a mandar**. El espejo de GN sí se lee de la base de cada marca, pero eso pasa
  después de guardar y su falla no se lleva puesto el evento.

## La fecha de la lista

La primera columna es **cuándo entró**, y sale de `fechaDeIngreso` (núcleo, con tests), que elige en
este orden: `fecha_ingreso` → `confirmada_at` → `recibido_en`.

- 🔴 **`recibido_en` NO es la fecha del ingreso: es cuándo lo agarró el monitor.** Las 79 del
  backfill entraron en el mismo minuto, así que la columna mostraba **27/8/2026 en 62 órdenes que
  eran de junio y julio**. Con la fecha como primera columna, eso pasaba de detalle a mentira de
  portada.
- 🔑 **La fecha sola se parte a mano y ⛔ no pasa por `new Date`**: `new Date('2026-08-25')` es
  medianoche **UTC**, o sea el 24 a las 21:00 en Argentina — formatearla corre todas las fechas un
  día para atrás.
- ⚠️ El **orden** de la lista sigue siendo `confirmada_at desc` en el servidor, que ⛔ no es lo
  mismo que lo que muestra la columna: una OC con `fecha_ingreso` cargada a mano puede mostrar una
  fecha y ordenarse por otra.

## Reglas que el código no dice

- 🔴 **`diferencia_unidades` es un NETO y un neto esconde el caso caro.** 2 de menos en un talle y 2
  de más en otro dan cero, y no es cero. Por eso se guardan `unidades_faltantes` y
  `unidades_sobrantes` por separado, sumadas renglón por renglón.
- 🔴 **La diferencia de cada renglón se RECALCULA, no se copia.** Es un derivado de otros dos datos
  del mismo renglón: si las tres no cierran, gana la que se puede verificar. Copiarla dejaría un
  renglón que se contradice a sí mismo.
- 🔑 **El cruce con GN tiene TRES estados, no dos**: está / no está / **no se pudo preguntar**
  (`null`). Colapsar el tercero en «no está» convierte un espejo caído en una lista de altas
  pendientes inventada. Por eso `espejo_consultado` es una columna y no se deduce del conteo.
- 🔑 **El cruce guardado es una FOTO y la pantalla lo rehace en vivo.** El caso normal de una
  importación es que el producto todavía no exista en Gestión Nube — se da de alta después. Sin el
  segundo cruce, la lista de «falta darlo de alta» no se vaciaría nunca y en una semana no la
  miraría nadie.
- ⚠️ **Que los totales del evento no cierren contra sus renglones NO es un error del webhook.** Se
  guarda igual, con `totales_coinciden` en false, y la pantalla lo dice. Rechazar el POST lo pondría
  a reintentar 17 horas por algo que no se arregla reintentando. Y sólo se compara **si vinieron
  todos los renglones** (`lineas_recibidas` vs `totales.lineas`): un emisor que los recorta no está
  mintiendo en los totales, y marcarle discrepancia haría que todas las OC se vean rotas.
- ⛔ **Un cumplimiento sin nada pedido es `null`, no 0 ni 100%.** El cero afirma.
- 🔑 **El agregado por proveedor suma UNIDADES, no promedia los porcentajes de cada OC.** Un
  promedio le da el mismo peso a una orden de 4 unidades que a una de 900, y el proveedor que falla
  en las grandes sale mejor que el que falla en una chica.
- 🔑 **El renglón «último evento» va aunque la lista esté vacía.** Una lista vacía sin él afirma «no
  entró ninguna orden», cuando lo que puede estar pasando es que el envío nunca se prendió — dos
  problemas distintos, de dos personas distintas.

## Las fotos (1-sep-2026)

Cada renglón puede traer **`imagen_url`** (la grande) y **`imagen_thumb_url`** (la de la grilla), y
las dos se guardan en `recepcion_linea`. La pantalla dibuja la chica y enlaza a la grande, en dos
lugares: una grilla arriba —«Lo que entró»— y una miniatura en cada fila de la tabla.

- 🔑 **No hubo que pedirle NADA al emisor: ya las mandaba y las tirábamos.** Las 9 OC del 1-sep
  llegaron dos veces —11:56–14:00 sin fotos, 14:41 con las fotos— y `normalizarEvento` no las
  copiaba. Mismo caso que `confirmada_at`. El dato estaba de este lado, en
  `recepcion_evento.payload`, y por eso el histórico se completó con
  `scripts/backfill-fotos-recepciones.mjs` en vez de un reenvío.
- ⚠️ **Las 79 OC del backfill del 27-ago NO tienen foto** y no la van a tener: son anteriores a que
  Gerardo prendiera las imágenes. Por eso la pantalla **no dibuja un placeholder** cuando falta —
  una grilla de recuadros vacíos se lee como «se rompieron las fotos», que es otro problema. Y en
  el 1-sep faltaban 2 de 80 renglones (OC-0470): que falte una foto suelta es normal.
- 🔴 **La URL se filtra por esquema en el núcleo** (`urlDe`): sólo `http`/`https`. Termina en el
  `src` de un `<img>`, y el que la manda es otro sistema.
- 🔴 **Apretar la foto abre el `Lightbox` del kit; ⛔ NO es un `<a href>` a la imagen.** Con el
  enlace, el clic **descargaba el archivo** en vez de mostrarlo: Ingresos sirve los `.webp` como
  `application/octet-stream` y el navegador, **navegando**, ante ese content-type descarga.
  ⚠️ Adentro de un `<img>` el mismo byte se dibuja igual —lo sniffea—, así que la miniatura se veía
  perfecta y nada anticipaba lo que iba a hacer el clic: **esto sólo se encuentra apretándola**.
- ⛔ **La chica no se deriva de la grande.** Los dos nombres de archivo los elige el emisor;
  sacar uno del otro con un `replace` se rompe callado el día que los cambie.
- 📌 Las fotos las sirve **`ingreso2.arebensrl.com`**, no el monitor: abren sin login (medido, 200)
  y si ese servidor se cae o mueve los archivos, el `onError` deja el renglón sin foto en vez del
  ícono de imagen rota. ⚠️ No se copian a nuestro lado: si allá se borran, acá desaparecen.

## 🆕 Se puede entrar directo a UNA orden: `?oc=` (1-sep-2026)

Pedido de Bruno mirando la Agenda: *«si apretás la OC, que vaya a la OC para ver los productos»*. Los
renglones que un ingreso siembra en la Agenda nombran la orden, y hasta acá ese nombre era texto: para
ver qué vino había que salir, entrar a Ingresos y buscarla en la lista.

`router.push('/recepciones?oc=<id-o-rótulo>')` y la pantalla abre el detalle de esa orden.

- 🔑 **El valor inicial se lee con `useSearchParams()` y ⛔ no de `window.location.search`.** Se llega
  con un `push` del router y **no está garantizado que el History haya corrido** cuando esta sección
  monta: leyendo la URL a mano, a veces se cae en el listado. Es exactamente el bug que ya pagó
  `useCampaniaAbierta` con `?liq=` (`components/liquidacion/`), y la misma salida. Escribir sí va con
  `history.replaceState`: abrir y cerrar una orden ⛔ no tiene por qué hacer navegar a Next.
- 🔑 **Resuelve por el ID o por el RÓTULO** (`ocPorRef`, en el núcleo y con test), porque de cada lado
  hay uno distinto: la pregunta de la puerta guarda el id (`store:oc_id`) y un renglón sembrado antes
  de hoy sólo tiene el rótulo metido en su título. Aceptar los dos es lo que evitó **migrar cien
  clones ya sembrados**. 🔴 **El id va primero**: es el único de los dos que la base garantiza único,
  y con el rótulo primero un duplicado abriría la orden equivocada sin decir nada.
- 🔴 **«No está» ⛔ NO es «entonces mostrá la lista».** Se llegó apretando una orden concreta; caer
  callado en el listado se lee como que el link está roto. Se nombran **los dos motivos posibles**
  —la otra marca, o fuera de la ventana de días— porque la acción es distinta: una se arregla en el
  encabezado y la otra abriendo el filtro, que queda ahí mismo.
- 🔴 **Mientras carga ⛔ no se dice que no está.** La lista llega por red: dibujar «no la encontré»
  durante ese segundo es afirmar algo falso, y quien lo lee se va.
- ⚠️ **Del otro lado el link ⛔ no se dibuja sin el permiso `recepciones`**: llevar a un 403 es peor
  que no llevar. Ver `docs/secciones/agenda.md` § «El tilde AFUERA del número».

## Quién la ve, y quién ve a los PROVEEDORES

El permiso es `recepciones` (área Compras). Además de los admin, al 1-sep-2026: **Lorena Reyes** y
las tres de marketing —**Candela Luis, Sofia Facello y Camila Budek**— en las dos marcas
(`scripts/permiso-recepciones-marketing.mjs`). ⚠️ **«Cami» es Camila BUDEK**, ⛔ no
`camilaquintana`, que es de local.

🔴 **De quién vino cada orden es un permiso APARTE: el sub `recepciones.proveedores`.** Sin él la
sección se ve entera —fechas, órdenes, artículos, fotos, lo que faltó— pero **sin el nombre del
proveedor y sin el panel «Por proveedor»**. Pedido de Bruno el 1-sep: *«no tiene sentido que la
gente de adentro vea los proveedores»*.

- 🔴 🔑 **El corte está en el SERVIDOR** (`sinProveedor` en `_recepciones.js`), ⛔ no en la
  pantalla: esconder la columna en el componente deja el nombre viajando en la respuesta, y eso se
  lee abriendo la pestaña de red del navegador. **Un dato que no se puede ver es un dato que no se
  manda.** Lo fija `tests/recepciones-handler.test.ts`, cuyo oráculo es el JSON serializado.
- ⚠️ **Se borra también `proveedor_id`**: solo, ya agrupa las órdenes por proveedor. Y dejarlo haría
  que el panel «Por proveedor» siguiera armando filas, todas con el nombre vacío.
- 🔑 **Un sub ⛔ NUNCA lo trae la función**: ni la de Dirección. O lo tiene el admin, o se tilda a
  mano en Config → «Además puede…». Al 1-sep **no lo tiene nadie tildado**: lo ven sólo Bruno y
  Darío, por admin.
- 🔑 **La respuesta trae `puede.proveedores`** y la pantalla ⛔ no lo deduce de que el campo venga
  vacío: hay órdenes que de verdad llegaron sin proveedor, y son dos cosas distintas que decir.

## Qué NO viaja

El costo con IVA, los descuentos, el flete y el margen **se quedan del lado de Ingresos**, por
decisión del emisor. Si algún día hacen falta, se agregan allá y se avisa antes: no aparecen solos.
⚠️ Y si aparecieran, esta tabla pasaría a tener plata adentro y el permiso de la sección dejaría de
alcanzar — hoy no la tiene, y por eso `recepciones` es un permiso de Compras a secas.

## Cómo se prueba

```bash
npx vitest run tests/recepciones-webhook.test.ts --reporter=dot   # firma, ventana, normalización
npx vitest run tests/oc-webhook-handler.test.ts --reporter=dot    # el handler entero: bytes → base
npx vitest run tests/recepciones.test.ts --reporter=dot           # lo que deriva la pantalla
node scripts/apply-recepciones.mjs                                # ejerce los candados de la base
node scripts/caminar-oc-webhook.mjs                               # el handler contra la base REAL
```

La última no es un test: **invoca el handler tal cual —firma, stream, cruce con el espejo— contra
la base de BDI**, con un secreto de prueba propio, y el oráculo es la base leída por otro camino.
Siembra la OC `bdi:999999901`, que no puede chocar con una real, y la borra al final verificando
que los tres contadores vuelvan a donde estaban. Caminada el 26-ago-2026: **34 de 34**.

**El oráculo de la firma en los tests es el emisor, no nosotros**: se firma con `node:crypto`
siguiendo el estándar y se verifica con el núcleo. Si las dos puntas usaran la misma función, el
test no probaría nada.

## Pendiente

- ✅ 🏁 **EL POST REAL FIRMADO YA LLEGÓ, Y ⛔ NADIE LO ANOTÓ** (medido contra producción el
  30-ago-2026). Los dos pendientes de arriba —el evento firmado en el runtime de verdad y la
  primera OC confirmada— **se cerraron el 27-ago a las 11:08 hora de acá**, y este archivo se
  commiteó **37 minutos después** todavía diciendo que faltaban.
  **Lo que hay en la base**: **79 órdenes de compra** (18 de BDI, 61 de Zattia), cada una con su
  `evento_id` de Standard Webhooks (`msg_…`), **0 eventos rotos**, y `confirmada_at` en **79 de
  79** — la única de las tres fechas que el emisor manda siempre. ⇒ el contrato del `data` ⛔ ya no
  sale de la documentación: salió de 79 mensajes que llegaron.
  🔑 **Y lo que lo cerró ⛔ no fue un test ni una caminata: fue mirar la base.** Un pendiente que
  se cierra solo, del otro lado y sin avisar, sólo se entera el que lo va a buscar.
- ▶️ 🔴 **Lo que sigue abierto es OTRA cosa: que el emisor mande EN VIVO.** Las 79 entraron en una
  sola tanda de trece minutos (27-ago, 14:00–14:13 UTC) — un **backfill** del historial — y desde
  entonces ⛔ no llegó ninguna. `OC-0412` se **confirmó el 26** y llegó igual en esa tanda del 27,
  o sea que ⛔ **ninguna OC llegó todavía el día que se confirmó**.
  📌 **El tripwire es `eventos.ultimo`**, que la propia sección devuelve en el GET: hoy está clavado
  en `2026-08-27T14:13`. La próxima OC que confirme Gerardo lo mueve, o no, y eso lo contesta.
- ✅ 🏁 **ESTE WEBHOOK YA PRENDE EL DISPARADOR DEL INGRESO** (30-ago-2026). El hecho «llegó
  mercadería» entraba acá firmado mientras el disparador de la Agenda esperaba por una segunda
  puerta con un segundo secreto (`INGRESO_SECRETO`) que nadie cargó, y sembraba **cero**.
  🔴 **El evento ⛔ no trae el TIPO DE INGRESO** —manda proveedor, líneas, pedidas y contadas y nada
  más— y sin él el disparador contesta 400 a propósito: dos de sus seis renglones cambian de dueña
  con la puerta. ⇒ en vez de adivinarla (30 proveedores distintos en las 79 OCs), **cada OC
  confirmada deja UN pendiente que arrastra y la pregunta**, y contestarlo siembra los seis.
  El relato entero está en `docs/secciones/agenda.md` § «La pregunta de la puerta»; acá sólo lo que
  toca a este archivo:
  - `abrirPreguntaDePuerta` corre **después** de guardar la OC —una pregunta sobre un ingreso que no
    está no le sirve a nadie— y es **mejor esfuerzo**: si la Agenda no contesta, la OC se guarda
    igual y el emisor recibe 200. Perder el evento es definitivo; perder la pregunta no.
  - ⚠️ **Pero lo que pasó viaja en la respuesta**, en el campo `agenda`: «no se abrió ninguna
    pregunta» sin motivo se lee como que el disparador está roto.
  - 🔴 **Cuelga de `confirmada_at` y ⛔ no de `recibido_en`**: un backfill pone `recibido_en` en hoy
    para todo el historial, así que con él las 79 habrían abierto 79 preguntas viejas de una vez.
- ▶️ **Reprocesar un evento en `error`**: hoy se ve en la pantalla y se arregla volviendo a
  confirmar la OC del otro lado. El botón que lo re-corre desde `recepcion_evento.payload` no está
  hecho — la tabla ya guarda todo lo que hace falta.
