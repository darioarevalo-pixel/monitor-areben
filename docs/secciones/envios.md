# Envíos del día — ficha de sección

Sección `envios`, área `local`. En prod desde el 13-ago-2026. Reemplaza la planilla de Google
`ENVIOS ZATTIA / BDI`. Incluye el **portal público del cadete** (`/cadete/<token>`).

## Dónde vive

| qué | archivo |
|---|---|
| Pantalla interna | `components/envios/Envios.tsx` (**74 KB — leer por rango**) + `useEnvios.ts` |
| Portal del cadete | `components/envios/PortalCadete.tsx` + `lib/envios/portal.core.js` |
| **La cuenta de la puerta** | `lib/envios/reglas.core.js` |
| Lo de la pantalla | `lib/envios/core.ts` · `cliente.ts` · `tipos.ts` · `ticket.ts` (rollo de 80 mm) |
| **El mapa de zonas** | `lib/envios/zonas.core.js` — ⛔ **no traer turf**: son 30 líneas copiadas con su misma semántica, cotejadas contra él en 195.428 puntos · pantalla en `components/envios/ZonasDeReparto.tsx` (4ª pestaña) · tabla `envios_zonas` |
| **De la dirección al punto** | `lib/envios/direccion.core.js` (el limpiador y **el candado**) + `api/_georef.js` (el geocoder del Estado, por lote). Entra por `action: 'zonas-sugerir'` y **no escribe nada** |
| Handlers | `api/_envios.js` (por `datos.js?recurso=envios`) · `api/_cadete.js` (cuelga de `postventa.js`) |
| Tablas (base de **BDI**, como Canjes) | `envios_reparto` · `envios_dia` · `envios_movimientos` · `envios_portal` |
| Migraciones | `scripts/apply-envios.mjs` · `sql/migrate-envios-*.sql` |
| Tests | `tests/envios-core.test.ts` · `envios-cliente.test.ts` · `cadete-portal.test.ts` |

**Cero funciones nuevas de Vercel**: los dos handlers son `_*.js` y cuelgan de puertas existentes.

⛔ `reglas.core.js` es `.js` plano **a propósito**: la leen el handler y el portal, que no pueden
importar TypeScript. El papel, la pantalla y el teléfono salen de UNA implementación. Lo mismo vale
para `CAMPOS`, `CAMPOS_CUENTA` y `FILTRO_BANDEJA`: viven ahí porque en el handler no se pueden afirmar.

## Reglas de negocio que el código no dice

- 🔑 **La hoja del día NO tiene marca; la bandeja SÍ.** Van al revés a propósito: el cadete sale con
  BDI y Zattia en la misma mochila y la rendición es una, pero cotizar y acordar el día lo hace el
  equipo de una marca mirando su tienda. La hoja las separa con el chip de color, no con un filtro.
- 🔴 **`monto_envio` es el COSTO DEL REPARTO, siempre**, y nunca se pone en 0 para decir que no se
  cobra. Quién paga lo dicen dos tildes separadas: `envio_pagado` (plata que entró) y
  `envio_bonificado` (plata que no entró nunca). ⇒ `tarifaCadete` = `monto_envio`, punto.
- 🔑 **En el bonificado la clienta paga $0 y el cadete cobra igual** (lo decidió Bruno).
- 🔑 **El día del reparto lo confirma el CLIENTE, no la orden.** Las órdenes de TN caen en la bandeja
  «Sin fecha», que **no es una bandeja de entrada: es la lista de trabajo** (`fecha is null` OR
  `estado='no_entregado'`). `fecha` y `turno` van los dos o ninguno (check `envios_fecha_turno_juntos`).
- 🔑 **La grilla de turnos NO se valida en el servidor**: la pantalla ofrece los que existen y avisa
  si se fuerza otro. Un envío especial un sábado tiene que poder salir sin tocar código.
- 🔑 **La cuenta son MOVIMIENTOS con signo, sin columna `tipo`** — el signo va adentro del dato.
  Positivo = el cadete tiene plata nuestra. **Rinde cuando pasa**, no por día de reparto. No se
  guarda ningún total: el saldo se arrastra y un día congelado haría mentir a todos los siguientes.
- 🔑 **`cobrado: null` («no dijo nada») NO es `false` («no me pagó»)** — se saldan al revés, y todas
  las filas anteriores al portal son `null`. La tarifa se le paga igual: llevó el paquete.
- 🔴 **El envío del cadete llega de TN SIEMPRE en $0** (18 de 18 medidos). El precio no viaja en la
  orden: está escrito en el nombre de la opción, por zona. **Hoy se tipea**, pero el mapa de zonas ya
  está cargado (16 zonas en `envios_zonas`); falta **geocodificar la dirección** para poder proponer.
- 🔑 **El mapa de zonas tiene DOS fuentes y cada una manda sobre una cosa: el DIBUJO viene del mapa
  externo** (un HTML con Leaflet que vive fuera del repo, se exporta a JSON y se importa desde la
  pantalla) **y el PRECIO se edita en la app**. Re-importar actualiza el dibujo y **no pisa los
  precios** — sin esa asimetría, corregir un polígono revierte las dieciséis zonas al valor que el
  JSON tenía el día que se exportó, en silencio, y los precios se mueven seguido (entre el mapa de
  abril y el de junio hay $1.000 en todas). Una zona que está en la base y no viene en el archivo
  **no se borra**: se informa. Vive en `planDeImportacion`, y la previsualización sale del **mismo
  llamado** que la escritura (`confirmar: false`/`true`) para que no puedan divergir.
- 🔴 **El candado va ANTES del motor: sin altura no se pregunta, y sin altura en la respuesta no se
  propone.** Georef contesta igual sin número de puerta —con un punto cualquiera de la calle entera—
  y `precioSugerido` no puede distinguirlo, porque **un punto es un punto**. Medido: 66 de 100
  direcciones sin número salían con precio, y `"(2000)"` —vacía, sólo el CP— salía $4.800. Por eso la
  validación no puede vivir adentro del motor y está partida en dos mitades (`consultaDe` antes de
  gastar la consulta, `sugerenciaDePunto` después). 🔑 **Y el candado es lo que hace segura la
  escalera de variantes**: sola empeoraba todo (precisos 92→95, inventados 30→68), porque lo que más
  recupera son las calles peladas.
- 🔴 **Sin localidad no se pregunta, y la localidad rara NO se reintenta sin ella.** `"Entre esmeralda
  y chacabuco"` vino así en una orden real y hace fallar la consulta con la calle bien. Reintentar sin
  localidad recupera esa dirección y **rompe las de Funes**: la calle homónima de Rosario devuelve un
  punto **preciso** en la zona equivocada, $4.300 donde van $9.000. La fila queda sin propuesta.
- 🔑 **La escalera para en la primera forma que conteste, aunque el punto salga impreciso.** Seguir
  despojando hasta conseguir uno con altura es conseguirlo **de otra calle**: "Av San Martin 1200" sin
  altura se tipea a mano, "Martin 1200" es un punto exacto y ajeno.
- 🔴 **La `nomenclatura` de Georef trae el DEPARTAMENTO, no la localidad, y no se muestra tal cual.**
  Roldán es del departamento San Lorenzo —que además es otro pueblo, a 25 km para el lado contrario—,
  así que una dirección de Roldán bien resuelta volvía como `"TUCUMAN 963, San Lorenzo, Santa Fe"`.
  Funes, Pérez, VGG, Ibarlucea y Soldini son del departamento Rosario y volvían diciendo «Rosario».
  🔑 **Costó caro porque el texto se estaba usando para revisar**: en la confirmación del mapa se
  marcaron como equivocadas direcciones que estaban perfectas — **el cartel corrompió la medición**.
  `encontrado` se arma con `localidad_censal` (28 de 120 cambiaron); la `nomenclatura` cruda queda
  sólo para detectar la esquina.
- 🔑 **Georef contesta NADA cuando conoce la calle pero no tiene el número** (`Minetti 2682` → nada,
  `Minetti` → `PJE MINETTI`): «no se pudo ubicar» **no** quiere decir que la calle no exista, y por eso
  volver a preguntar sin la altura es exactamente la trampa.
- 🔑 **«Coordinar» NO es un precio a convenir**: el paquete se lleva y se cobra lo de la zona; lo que
  se coordina es **cuándo se va**. Por eso es una marca al lado del precio, no un tipo de zona.
- 🔑 **Lo que proponga el motor se confirma a mano** (decidido con Bruno): un precio de la zona de al
  lado no lo caza nadie, mientras que la falta de precio ya bloquea agendar. Por eso `precioSugerido`
  devuelve `ambigua` **sin precio** cuando el punto cae en dos zonas empatadas que cobran distinto, y
  por eso el **nombre** de la zona viaja al lado del precio: «Zona 7 — $4.500» no se puede revisar.
- 🔑 **`dias`/`turnos` de una zona existen por Funes**, que sale sólo martes y jueves a la mañana. Se
  guardan y se preguntan los dos aunque hoy digan lo mismo (martes y jueves son los únicos días con
  turno mañana): deducir uno del otro convierte un cambio de grilla en un paquete que no sale.
- 🔴 **El filtro del correo es NEGATIVO a propósito** y mira dos señales (nombre `Envío Nube - …` y
  tracking). La positiva («que diga cadete») falla en silencio: `shipping_option` es **texto libre
  que la tienda edita**. El 59% de lo que pasaba el filtro viejo era Correo Argentino y Andreani.
- 🔴 **LA DIRECCIÓN MANDA, NO EL NOMBRE** — lo dijo el cadete, y vale para el papel y el teléfono.
- 🔑 El **CP** avisa «fuera de zona» pero va AL LADO de la localidad, no en su lugar: hay CP 2000 de
  Rosario a 100 km. Con CP vacío no avisa nada.
- 🔴 **Mandar a un día BLOQUEA sin precio**: un paquete en la calle con un ticket que no pide nada es
  un envío que nadie cobra y un cadete al que igual hay que pagarle.
- 🔑 El portal tiene **tres barreras y ninguna alcanza sola**: token de 64 hex con vencimiento (el
  inexistente y el vencido dan el mismo 404 pelado) · PIN corto con traba a los 10 fallos, chequeado
  ANTES de armar la lista · **el día acotado a ±1 del servidor, que es la más importante**. El PIN va
  **en claro a propósito**: quien lo manda por WhatsApp tiene que poder leerlo. Rotar mata el link
  anterior en el acto (no hay sesión del otro lado) ⇒ es también la revocación. Se rota el 1º de cada mes.
- 🔴 Los días que todavía no llegaron salen **sin dirección, teléfono ni `id`** (`paraElCadeteFuturo`):
  es lo que hace que mirar la semana no multiplique por siete lo que entrega un link filtrado.

## Lo que ya se rompió acá

- 🔴 **Un throw en el render NO deja un cartel: MATA la pestaña.** Pasó 3 veces en prod (`<input
  type="date">` pasa por vacío al tipear el primer dígito). El guard va en `rotuloDeDia`, **en el
  borde por donde entra lo tipeado**, no adentro de `rotuloFecha`.
- 🔴 **TN corta con HTTP 200 y `ok: true`**: no hay `throw` que lo cace. Daba tilde verde y media
  hoja. Lo que falta **se cuenta restando** (`ordenesQueNoLlegaron`), no leyendo `fallidas`.
- 🔴 **TN usa el MISMO 404 para «no hay más páginas» y «ese campo no existe»** — los separa la
  `description`, y la regla quedó positiva: sólo «Last page…» es el final.
- 🔴 **La columna existía, la escribía el portal y faltaba en el `select` del handler** ⇒ llegaba
  `undefined` y **nada fallaba**. Es el modo de falla que ningún test de lógica caza.
- 🔴 **El día en UTC dejaba al cadete sin hoja de 21:00 a 24:00.** Ahora `diaArgentino(ahoraMs)` con
  offset fijo UTC−3, no `toLocaleDateString` (un runtime sin la tabla de husos cambia el formato en
  silencio). La ventana está partida en **dos funciones**, leer (hoy−1 a hoy+7) y escribir (±1), no
  en un parámetro: un flag mal pasado dejaría marcar entregada la semana entera.
- 🔴 **Que la ORDEN esté paga no quiere decir que el ENVÍO esté pago.** Con `estado_pago === 'paid'`
  a secas la fila nacía PAGADO con el precio sin cargar. Se pide además `envio_costo_cliente > 0`.
- ⚠️ **Una migración se aplicó ANTES de deployar y prod comparte la base**: la pantalla vieja quedó
  leyendo una tabla que no existía. **El orden es deployar primero, migrar después.**
- ⚠️ **Al verificar en prod, confirmar primero que el bundle nuevo YA se sirve** (buscar una cadena
  nueva en los chunks): dos crashes se diagnosticaron contra el bundle viejo.
- 🔑 **Los ensayos se cazan mutando.** `textoDePlata` y `resumenDeTraida` están separadas del dibujo
  y del toast justo para poder mutarlas: un test que sólo verifique que el PDF se generó da verde con
  el bloque de plata afuera del papel. En el ticket el assert es `plata.y + plata.alto <= alto`.

## Pendiente

- ✅ **El precio por zona, tanda 4: EN LA PANTALLA** (16-ago-2026). En la bandeja «Sin fecha» hay un
  botón **«Sugerir precios (N)»** que manda **sólo las filas sin cotizar**, en un llamado, y deja al
  lado de cada una «Zona 7 · $4.500 — usar» o el motivo por el que no hay precio. **No escribe nada**:
  «usar» guarda con `action: 'costo'`, de a una, como siempre. Las propuestas viven en el estado de
  `Pendientes` y mueren al recargar — no son un dato de la fila, son la respuesta a una pregunta sobre
  la dirección de ese momento, y la dirección se corrige seguido.
  ✅ **Ejercido contra prod y contra Georef vivo** (no sólo con tests): las 16 zonas de la base y las 7
  filas de la bandeja → **5 con precio, 2 que se niegan** (`Garay Bis 47`, por la localidad rara, y
  `Minetti 2682`, que Georef no tiene numerada) en 307 ms. Y sobre 60 direcciones reales de clientas:
  **25 con precio, 27 frenadas por el candado sin gastar una sola consulta**, 8 sin ubicar, **0
  inventadas**. 🔑 Los 11 mutantes del candado caen (`tests/envios-direccion.test.ts`).
- ✅ **EL CONTRASTE, HECHO: 82 direcciones confirmadas y CERO equivocadas** (16-ago-2026, lo confirmó
  Bruno a ojo sobre el mapa). 🔑 **La idea de cómo hacerlo es de él y cambió el costo del problema**:
  en vez de cotizar 20 a mano —o de esperar la planilla vieja de OneDrive, que era el plan—, **ver los
  puntos dibujados sobre las zonas y confirmar mirando**. La herramienta es
  `~/Downloads/ConfirmarZonasAreben.html`, un visor **aparte y de sólo lectura** (las 16 zonas salen de
  la base, no del `localStorage` del mapa editable, y no tiene con qué dibujar ni exportar), con 120
  direcciones reales **repartidas por zona** y voto con B/M/N que salta solo al siguiente.
  Confirmadas 12/16 zonas, incluidas Roldán ($12.000) y Fisherton 1 ($5.600).
  🔴 **Lo que quedó sin confirmar y hay que decirlo: Funes ($9.000) y Villa Gobernador Gálvez
  ($7.500), las dos más caras después de Roldán**, porque sus votos se borraron al corregir el cartel
  del departamento. Y **20 de las 23 «afuera del mapa»**, que son las que dirían si falta dibujar una
  zona (Alvear y La Carolina son las candidatas).
  🔴 **Lo que este contraste NO puede ver**: la clienta de Funes que escribió «Rosario» en la orden.
  Se geocodifica sobre la calle homónima de Rosario, el punto cae sobre una calle **real**, se ve
  perfecto en el mapa y sale $4.300 en vez de $9.000. Aparece cuando el cadete llega, no antes.
- 📎 **La medición que fundó todo esto** (tanda 3, 16-ago-2026, 200 direcciones reales de `clientes`,
  scripts en `~/.claude/plans/envios-zonas-tanda3/`):
  - **El geocoder es Georef** (`apis.datos.gob.ar`, del Estado, gratis y sin clave). 🔴 **Nominatim
    quedó descartado en la primera prueba**: para `Rodriguez 1062, Rosario` devolvió una casa en
    **Álvarez, a 60 km**, con cara de resultado bueno.
  - 🔴 **HACE FALTA UN CANDADO ANTES DEL MOTOR: sin ALTURA (o esquina), no hay precio.** Georef
    contesta igual sin número de puerta, con un punto cualquiera de la calle entera — y
    `precioSugerido` no puede distinguirlo, porque un punto es un punto. Medido: de las **100
    direcciones sin número, 66 salen con precio** si no se las frena, y **`"(2000)"` —una dirección
    vacía, sólo el CP— sale $4.800** porque Georef la matchea a `PJE 2007`. Con el candado, 0.
  - 🔑 **Y afinar el geocoder EMPEORA eso**: al agregar reintentos, los puntos precisos subieron de
    92 a 95 y los precios inventados de 30 a 68. La escalera recupera sobre todo calles peladas.
  - ✅ **Cuando la dirección trae calle + número —que es lo que manda TN— resuelve el 95%** (95 de
    100; 93 con zona y precio, 2 `sin_zona` correctos, 3 que **se niegan** en vez de inventar). El
    candado además atajó dos donde Georef devolvió **otra calle** (`Calle 1331 2983` → `CALLE 1335`).
  - 🔑 **El string sucio hay que limpiarlo antes**: mandado tal cual resuelve 47,5%, cortado en
    `calle + altura` sube a 82,5%. ⚠️ El corte **no puede ser «el primer número»**: en Rosario hay
    calles que empiezan con número (9 de Julio, 27 de Febrero) y quedarían como calle «9».
  - 🔑 **Georef es caprichoso y hay que probarle variantes**: `Av Pellegrini` resuelve y
    `Av San Martin` no; `Moreno 1192` sí y `Mariano Moreno 1192` no; `Alem 1517` sí y
    `Leandro N. Alem 1517` no ⇒ los nombres de pila se sacan **de a uno**, no sólo el primero.
  - 🔴 **La `localidad` de TN rompe la consulta aunque la calle esté bien**: `Garay Bis 47` resuelve
    sola y falla con `localidad = "Entre esmeralda y chacabuco"` (que es lo que vino en la orden).
  - 🔴 **Los «~20 envíos ya cotizados» de la premisa no existen**: en prod hay 5 filas con precio a
    mano y **dos de esas cinco son de prueba** ($1.000). De ahí sale que el contraste esté abierto.
- ▶️ **Lo que falta en el mapa externo** (lo dibuja Bruno, entra por «Importar»): estirar Zona 8
  (Belgrano al norte, Godoy y Moderno al sur, medidos con reverse-geocoding), dibujar como
  **exclusión** las zonas tachadas del mapa de papel —incluidas **Alvear** y **La Carolina**, que hoy
  no existen como dato y por lo tanto reciben precio— y marcar los **coordinar**. Menor: renombrar
  las diez «Zona N» con su barrio.
- ▶️ **`node scripts/apply-envios.mjs --cerrar-tanda-g`** (dropea `trajo` + `pagado_aparte` detrás de
  un guard de huérfanos) y **`--cerrar-tanda-a`** (`pago_cadete`, 0 filas). Van **después** del deploy.
- ▶️ **G0 y G7, frenados por la térmica real**: extraer `lib/rollo80.ts` y el recibo imprimible en
  rollo de 80 mm, dos copias. Plan: `~/.claude/plans/envios-en-vez-de-drifting-planet.md`.
- ▶️ **Imprimir una tanda con la térmica del local.** El PDF se miró página por página con `qlmanage`
  (⚠️ `pdftoppm` no está instalado), pero **nunca salió por la impresora real**.
- 🔴 **Agujero de ida y vuelta**: si la clienta paga después, desde la pantalla interna **no hay forma
  de sacar el «no cobró»** — sólo el cadete, desde su portal. El KPI no baja solo.
- ▶️ **Medir antes de decidir el filtro de la traída** (`envio_estado='fulfilled'` / `estado_orden=
  'closed'`): TN no tiene «entregado», y si en el local marcan «despachado» al empaquetar, agregarlo
  haría que el paquete no salga y nadie se entere.
- ▶️ Ejercer a mano en prod: bonificado que imprime PAGADO, no entregado en los dos lados,
  reprogramar, el modal del pedido, y `cerrar-dia` (la sesión se cayó en el medio la última vez).
- ▶️ **Publicar la novedad**, que quedó en borrador (`n1786736641432_bgbqg9`, destino `seccion:envios`).
- ⚠️ `ESTADOS_LEGADO` quedó como red de seguridad pero la base ya rechaza `despachado` y `reintento`:
  se puede borrar. Ojo que un **preview viejo** de otra rama que intente escribirlos recibe un error.
- 🔴 **Hallazgo suelto, sin arreglar**: `bdi-catalogo/api/tiendanube-audit?orden=N` **no exige
  usuario** — contesta nombre, ítems y totales a cualquiera que sepa un número de orden. Sus dos
  consumidores (Reclamos y Canjes) le pegan con `fetch` pelado: ponerle el guard rompe las dos.
  Por eso la dirección y el teléfono viajan **sólo** con `conDireccion`, que pide `?ordenes=1`.
- **Datos que faltan y los tiene Bruno**: qué significa la columna `SHW`, la lista de vendedoras, y
  cuánto se le paga al cadete por turno.

## Cómo se prueba

- **El portal sin tipear el PIN**: las tres barreras se ejercen con `curl`
  (`?recurso=cadete&token=…&pin=…`, y el POST con `fecha`); para VER la pantalla alcanza con dejar el
  PIN en `localStorage['cadete.pin']` y recargar. ⚠️ Los envíos de prueba **hay que borrarlos**: uno
  agendado a un día futuro entra en la hoja real de ese día.
- **Pegarle a TN**: el token vive **sólo en Vercel** y `env pull` lo baja vacío ⇒ hay que medir desde
  el navegador logueado, o desde un endpoint deployado. Sonda permanente en `?ordenes=1`: `&campos=1`
  prueba cada `fields` solo y bisecta; `&llenado=campo,campo&pp=N` caza el campo que viene **vacío
  adentro** de una lista completa. ⚠️ **Medir de más te gana el 429**, y la respuesta degradada miente.
