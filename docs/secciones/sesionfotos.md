# Sesión de fotos — ficha de sección

Sección `sesion-fotos`, área `marketing`. Marketing pide productos para fotografiar: se eligen las
variantes, el sistema decide depósito o local, se crea la venta en Gestión Nube (que **separa** el
stock), se retira, se fotografía y **vuelve**. El eje es que el retiro es reversible: cada ítem se
cuenta dos veces —preparado y devuelto— y la solicitud no cierra hasta que GN confirma que la venta
se anuló. Reemplazó a la pantalla `sfXxx` del `index.html` legacy, de la que es un port literal.

⚠️ **Ya no es una entrada del menú.** La absorbió `solicitudes` (la vista unificada de estado); a
esta pantalla se llega por el botón «Ver» de ahí, o por el puente de Marketing. Ver `DETALLE_DE` y
`ALIAS_COMPAT` en `lib/permisos.core.js:121-152`, que explican por qué el permiso viaja solo.

## Dónde vive

| qué | dónde |
|---|---|
| pantalla | `components/sesionfotos/SesionFotos.tsx` (**1.820 líneas** — leer por rango) + `useSesionFotos.ts` |
| lógica pura | `lib/sesionfotos/` (10 archivos, 1.781): `core` `draft` `escaneo` `combinada` `ventas` `pdf` `ticket` `puente` `cfg` `tipos` |
| motor compartido | `components/solicitudes/useHistorialSolicitudes.ts` · `components/solicitudes/preset.ts` |
| dónde se guarda | tabla `solicitudes` por `lib/solicitudes/cajon.ts` → `api/_solicitudes.js`, que entra por la puerta **`/api/postventa?recurso=solicitudes`** (límite de 12 funciones de Vercel) |
| escritura irreversible | `lib/sesionfotos/ventas.ts` → `api/crear-venta.js` (GN) |
| tests | `tests/sesionfotos-{core,draft,escaneo,ventas}.test.ts` + `tests/legacy-sesionfotos.ts` (paridad) + `tests/solicitudes-cajon.test.ts` |

`tests/blob-upload-sesion.test.ts` **no es de acá** (es la sesión del Monitor, en piezas de Meta).

## ⛔ Lo que comparte con otras secciones

🔴 **`lib/sesionfotos/` no es de Sesión de fotos: es el motor de las solicitudes.** Un cambio ahí
toca **seis** lugares, y ninguno tiene su propia copia de la cuenta:

- **Solicitudes internas** (`components/solicitudes-internas/`, `lib/solicitudes-internas/`) monta
  **el mismo componente** (`SolicitudesInner`, que vive en `components/sesionfotos/SesionFotos.tsx`)
  y **el mismo hook** con otro `preset`. Eran dos gemelos byte por byte hasta la convergencia; hoy
  difieren solo en `kind`, el `comments` de GN y el estado post-venta.
  🔑 **Medido el 16-ago: `components/solicitudes-internas/` son 60 líneas y las dos son wiring** —
  no hay una sola copia de la cuenta. ⇒ **«¿este arreglo toca también a internas?» no es una
  decisión: es el mismo código.** La única forma de arreglar uno sin el otro sería duplicar.
- **Solicitudes** (`components/solicitudes/`) — la vista unificada, y el alta que rutea por motivo.
- **Inicio** y **Marketing** empujan por los tres puentes de `lib/sesionfotos/puente.ts`.
- **Gerencial** y **Notificaciones** (`lib/notificaciones/derivar.ts`) leen `salio`/`faltantes`.

⇒ Antes de tocar `core.ts`, `escaneo.ts` o `ventas.ts`, correr **los dos** juegos de tests
(`sesionfotos-*` y `solicitudes-internas-*`): la mitad de las funciones son genéricas con la
variante de internas pasada por parámetro.

## Lo que ya está comentado, y hay que leer antes de tocar

- El modelo entero, en 10 líneas → `lib/sesionfotos/tipos.ts:1`; el enum es la **unión** de los dos
  ciclos → `:26`; **venta creada = SEPARADO, no retirado** → `:108` y `:113`.
- La regla que parte el ciclo en dos mitades (`esperadoEn`) → `lib/sesionfotos/core.ts:64`.
- «Salió sin que nadie escanee» y por qué un **`0` explícito no es una ausencia** →
  `lib/sesionfotos/core.ts:23` y `:41`.
- El recorte por sector del historial (Local ve lo de local) → `lib/sesionfotos/core.ts:189`.
- El único choke point contra GN, y por qué el payload se verifica offline →
  `lib/sesionfotos/ventas.ts:1`; el `estado` que pasó a ir con sesión → `:129`.
- Asignación de origen (prioridad + fallback por stock) → `lib/sesionfotos/draft.ts:194`.
- El escáner que se come el cero de adelante → `lib/sesionfotos/escaneo.ts:23`.
- Los manuales **no** se agregan entre solicitudes → `lib/sesionfotos/combinada.ts:1`.
- Los dos ejes del modelo nuevo, MOTIVO vs DESTINO → `components/solicitudes/preset.ts:4`.
- Las dos disciplinas del guardado (`cargado`, re-leer fresco) →
  `components/solicitudes/useHistorialSolicitudes.ts:12`; el diff por solicitud →
  `lib/solicitudes/cajon.ts:108`.
- El autoguardado con debounce + flush al desmontar → `components/sesionfotos/SesionFotos.tsx:291`.

## Reglas que el código no dice

- 🔴 **`ventas.ts` pega a `https://monitorareben.vercel.app/api/crear-venta` por URL ABSOLUTA.**
  Desde `localhost` o desde un preview, crear una venta **crea una venta REAL en Gestión Nube de
  producción**. No hay entorno de prueba: la única forma de ejercerlo sin ensuciar es el test con
  `fetch` mockeado. Su CORS abierto es a propósito y no se puede sacar (Reclamos y Fallas también
  le pegan absoluto).
- 🔑 **La venta sale por lo PREPARADO, no por lo pedido — decisión de Bruno.** Se piden 10, se
  encuentran 7, la venta va por 7 y la devolución espera 7. Lo no encontrado no se vende, así que
  tampoco se devuelve.
- 🔴 **La prioridad de retiro sale de OTRO repo** (`bdi-catalogo/api/reposicion`, la config de
  Reposición). Ese endpoint exige la sesión del Monitor —**medido el 16-ago: sin sesión contesta
  403**— y `leerPrioridadRetiro` se traga cualquier error y **cae a `deposito` en silencio**. Si la
  cadena de logins se cortó, el banner dice «Depósito primero» y el armado asigna depósito sin que
  nada avise. Es el mismo patrón del 403 leído como «sin datos».
- ⚠️ **El escaneo depende del ETL.** El mapa código-de-barras → vid se arma de `allVariantes`; hasta
  que el catálogo baja, el escaneo va deshabilitado, no fallado.
- ⚠️ **Los ítems «nuevo» y «a mano» no generan venta ni tocan stock.** Un producto que todavía no
  está en GN viaja por código de barras (`bc_`) y el «a mano» por descripción (`man_`): salen de la
  solicitud pero no del sistema.

## Lo que ya se rompió acá

- **La devolución pedía lo que se había pedido, no lo que salió** (`8d8265e`, 26-jul). La lógica
  pura ya estaba bien; el render había quedado atrás. Se unificó en `esperadoEn`. 🔑 **La regla
  estaba escrita tres veces en tres archivos** — por eso hoy vive una sola.
- **El reporte PDF cortaba nombre y variante por cantidad de caracteres** y con `'…Pro Max'` el
  color desaparecía **entero, sin puntos suspensivos**: cinco fundas de cinco colores salían
  impresas idénticas. 1.578 de 6.765 filas del inventario de BDI. → `lib/sesionfotos/pdf.ts:48`.
- **Dos puertas al mismo dato con criterios distintos**: por `/sesion-fotos` se veían TODAS las
  solicitudes de la marca y por `/solicitudes` solo las del sector. → `core.ts:189`.
- **La lista se veía pero la pantalla rebotaba a Inicio sin decir nada** (Depósito y Administración
  entraban por `solicitudes` pero el detalle pedía `sesion-fotos`). → `permisos.core.js:132`.
- 🔴 **Hasta el 13-ago cualquier cuenta válida del Monitor leía y borraba las solicitudes de las dos
  marcas**, puestos compartidos incluidos: el control terminaba en `exigirUsuario`. →
  `api/_solicitudes.js:65`.
- 🔴 **`escanearCombi` quedó afuera de la unificación de `8d8265e` y la vista combinada aceptaba
  devolver más de lo que salió** (arreglado el 16-ago). La regla se había llevado a `esperadoEn` y
  aplicado en cuatro de los cinco lugares; acá seguía topeando contra `it.qty`, lo PEDIDO. Con 10
  pedidos, 7 salidos y 7 devueltos, el detalle rebotaba el 8º escaneo y la combinada lo aceptaba; y
  un ítem que nunca salió se devolvía por la combinada aunque `agregarCombinada` ni lo mostrara.
  🔑 **Sobrevivió tres semanas porque los tres tests que cubrían `escanearCombi` eran todos de fase
  `retiro`, y ahí `esperadoEn` ES `i.qty`**: el defecto sólo existe en la otra mitad del ciclo. La
  lección no es «faltaba un test» sino **«faltaba ejercer la fase»**.
  🔑 **El tope es por SOLICITUD, no por ítem**: dos solicitudes con el mismo ítem pueden haber
  sacado cantidades distintas, así que se recalcula en cada vuelta del loop.
  🔑 **Medido contra las dos bases: no ensució ningún dato.** 335 ítems, 301 con devolución, **0**
  con `devuelto` mayor a lo que salió. El agujero era real y nunca se materializó.
## Pendiente

- ▶️ **El select de prioridad de retiro está DESHABILITADO para siempre**
  (`SesionFotos.tsx:350`), con el cartel «Disponible al completar la migración» — que terminó el
  **31-jul**. Hoy la prioridad solo se cambia en Reposición, en `bdi-catalogo`.
- ▶️ Las claves viejas del KV (`sesionfotos:<marca>`) quedaron **intactas como respaldo** y nadie
  las lee desde el 31-jul (`MIGRACION_LISTA = true`). Volver atrás es poner el flag en false.

- ✅ 🔑 **Stunned tiene su sesión de fotos (22-ago-2026).** La pantalla lleva selector de línea
  —`Zattia · Stunned`, arranca en Zattia— y sus solicitudes son **filas propias** (`store='stunned'`
  en la misma tabla de la base de Zattia; la clave ya era `store,id`). Es la **única** operativa con
  selector, y el motivo no es mirar: el ciclo **termina subiendo la foto a una Tienda Nube**, y ésa
  es la única cosa que Stunned no comparte con Zattia.

  🔴 **Lo que la ficha decía antes estaba mal en su premisa.** Decía que la trababa
  `api/_solicitudes.js:63`, y medido el 22-ago **nadie chocaba contra esa puerta**: el catálogo de la
  pantalla es `datos.allProductos` de Zattia, y los 28 STU estaban adentro, así que la ropa **ya se
  podía pedir** desde Zattia. La prueba está en la base: de las 14 solicitudes de fotos de Zattia,
  **2 tienen ítems STU** y una de ellas es **13 de 13 STU** (8-jul-2026) — una sesión de Stunned
  hecha por el camino de Zattia. Lo que faltaba eran **los dos extremos**: ver qué falta fotografiar
  y subir la foto.

  Cómo quedó, y qué NO se toca:
  - **El catálogo se corta con la línea.** Con las dos mezcladas se podría meter una prenda de Zattia
    en una solicitud de Stunned, cuyas fotos van a la otra tienda. ⚠️ El precio: una sesión que
    fotografía las dos líneas son **dos solicitudes**.
  - **La venta de GN sigue saliendo como Zattia, byte-idéntica.** 🔴 `store:'stunned'` en
    `api/crear-venta.js` **no falla**: su `SF_CFG.stunned` existe sólo para `tn_import` y tiene
    `client_id: null`, así que la venta saldría **sin cliente**. El par lo nombra `destinosDe`.
  - **El historial viejo no se movió.** Las 2 solicitudes mixtas están **cerradas** (8-jul y 16-jul) y
    se dibujan con lo que guardan adentro (`ItemSolicitud` trae `nombre`, `variante` y `sku`), así
    que el corte del catálogo no las vacía. Ninguna abierta quedó partida.
  - **Solicitudes internas NO lleva selector**: se piden sobre la mercadería del local, que es una
    sola, y su ciclo no termina en ninguna tienda.
  - 🔴 **El aviso también se arregló**, y era la mitad que faltaba: `store/useAvisos.ts` pedía el
    cajón por marca, o sea que una solicitud de Stunned **no aparecía en `/solicitudes`** —de donde
    el local saca qué preparar—. Una solicitud que no aparece ahí no se prepara nunca.

  Los dos extremos, en su lugar: **Marketing** (la cola de qué falta fotografiar, con el puente a
  esta pantalla) y **Tienda Nube › Carga de imágenes** llevan el mismo selector, y
  `bdi-catalogo/api/tn-subir-imagen.js` ya conoce `stunned`. Detalle en `docs/lineas.md`.

## De dónde viene la sesión: el tercer eje (24-ago-2026)

Una sesión de fotos **no se pide sola**: la dispara un proceso. Hasta el 24-ago la app ya sabía
cuál —Marketing dejaba pids en `ponerPuenteFotos`, el aviso de ingreso sembraba los pasos en la
Agenda, la cola de faltantes está por existir— y **lo tiraba**: los tres caminos terminaban en el
mismo borrador anónimo. El campo `disparador` (`lib/solicitudes/disparador.ts`) lo anota.

| eje | qué contesta | quién lo decide | qué gobierna |
|---|---|---|---|
| `motivo` | para qué sale | quien pide | 🔴 **el CAJÓN** (`presetPorMotivo`) y con él el cliente de GN |
| `tipo` (destino) | si vuelve | quien pide | la aprobación (`necesitaAprobacion`) |
| `disparador` | **de dónde viene** | **la puerta** | 🆕 **de quién es cada paso** de la sesión en la Agenda (29-ago-2026) |

Los tres valores: `ingreso` (llegó mercadería y hay que publicarla) · `campania` (Marketing arma
una producción) · `faltante` (un producto ya a la venta no tiene foto).

- 🔴 **Por qué NO son tres motivos más.** `presetPorMotivo` rutea comparando contra el string
  exacto `'Sesión de fotos'`. Meterlos en `MOTIVOS` habría mandado **toda sesión nueva** al cajón
  de Solicitudes internas, en silencio y con la venta de GN a nombre de otro cliente. Son ejes
  distintos y viven en campos distintos; hay un test que lo fija
  (`tests/solicitudes-disparador.test.ts`).
- 🔑 **El disparador vive en la solicitud Y en el ítem.** El del ítem es opcional y ausente
  significa «el de la solicitud». Existe para el caso que antes no se podía escribir: el
  **faltante que se suma a una sesión ya armada** por un ingreso o una campaña. Por eso el filtro
  del historial mira los ítems y no sólo la cabecera — si mirara sólo la cabecera, mentiría por
  omisión justo en ese caso.
- 🔴 **La puerta que no sabe devuelve `null`, no un default.** El botón «mandar a Sesión de fotos»
  de Marketing sirve igual para una campaña que para tapar un faltante ⇒ `disparadorPorPuerta`
  contesta `null` y la pantalla **pregunta**. Y una solicitud sin disparador se muestra como
  **«sin origen»**, no se esconde: es un dato que falta, no un origen.
- ⚠️ Sin migración: la solicitud entera vive en el jsonb/KV. Las **30 solicitudes anteriores** no
  tienen disparador y no se les inventa uno.
- 🆕 🏁 **La cola de fotos ya es una puerta que lo llena sola** (24-ago): «Pedir una sesión de fotos»
  en la auditoría de fotos de Tienda Nube manda `disparador: 'faltante'`, los productos cruzados a
  GN y **las variantes sin foto tildadas** — ver `docs/secciones/tncat.md`. El puente ahora lleva
  `{pids, vids, disparador}` (`SeleccionFotos`) en vez de sólo `pids`; Marketing manda
  `{pids, vids: [], disparador: null}`, que es «este producto, elegí vos los talles».
- ▶️ **Falta que la del INGRESO lo llene sola.** El paso «foto» del molde de ingreso todavía no llama a
  `disparadorPorPuerta('ingreso')`. En las altas que no vienen de la cola, el valor lo pone a mano
  quien arma la sesión.
- ⚠️ **La dueña de cada disparador (Cande / Sofi) NO está en el código, a propósito**: la gente
  cambia y eso se carga como molde en la Agenda, igual que los pasos del ingreso.
- 🆕 🔴 🔑 **Y desde el 29-ago-2026 el origen dejó de ser sólo un dato: CREAR LA SESIÓN SIEMBRA SUS
  PASOS EN LA AGENDA**, y el origen es el que decide de quién es cada uno. Es el 2º disparador de la
  Agenda (el 1º es el ingreso) y el relato entero está en `docs/secciones/agenda.md`. Lo que hay que
  saber parado acá:
  - **El hecho es el guardado de una solicitud de `sesionfotos` que todavía no existía**, en
    `api/_solicitudes.js`. ⛔ **Editar no siembra**: la pantalla guarda la solicitud entera en cada
    cambio, y sembrar siempre le tiraría los nueve pendientes encima a tres personas cada vez que
    alguien agrega una prenda. Y **el lote tampoco**: ése es el camino de la migración del KV.
  - ⛔ **Sin origen no siembra** —y la pantalla lo dice al lado del selector—, porque de quién es el
    primer renglón lo decide de dónde viene: sembrar «igual» pondría la dueña equivocada.
  - 🔑 **La clave de idempotencia es el ID de la solicitud**, así que **moverle la fecha a la sesión
    ⛔ no la vuelve a sembrar** (y tampoco mueve los pendientes ya sembrados: eso es una mano).
  - 🔴 **Sembrar ⛔ no puede voltear el guardado**: si no hay moldes cargados o la base no contesta,
    la sesión se guarda igual y el error viaja en la respuesta (`sembrado`).
  - ⚠️ **De los nueve renglones del manual se cargan siete (+2 por origen)**: «armar el pedido» ⛔ no
    va —es el hecho que dispara esto— y «devolver la ropa contada» tampoco: **el cierre de la
    sección ya lo controla punta a punta**, y dos lugares que dicen lo mismo terminan diciendo cosas
    distintas.

## Qué se fotografió: el resultado, que no se registraba (24-ago-2026)

🔴 **El módulo entero seguía la LOGÍSTICA y no sabía nada del RESULTADO.** Sabía qué se pidió
(`items`), qué se preparó (`verif`), qué salió (`salioEfectivo`) y qué volvió (`devuelto`) — y con
eso una solicitud podía llegar a **`cerrada`**, el estado que se lee como «terminó bien», **sin una
sola foto sacada** y sin que quedara registro. Cerrar significaba «volvió la mercadería».

Ahora hay un mapa `fotos` por vid (`lib/sesionfotos/fotografiado.ts`). Sin migración: la solicitud
entera vive en el jsonb/KV.

- 🔑 **TRES respuestas, no dos: sí · no · SIN CONTESTAR.** No es un lujo, es forzado. Con un mapa de
  «fotografiados», las 30 solicitudes viejas dirían que **no fotografiaron nada**; con uno de «no
  fotografiados», dirían que **fotografiaron todo**. Las dos formas hacen que la ausencia de dato
  afirme algo que nadie escribió. La tercera respuesta es lo único que deja que la pantalla diga
  «esto todavía no lo contestó nadie» — mismo criterio que el `no_se` del «¿rindió?» de un canje, y
  la razón por la que `resumenFotos` **no suma `sinContestar` a `no`**.
- ⛔ **No confundir con `faltantes()`**, que es lo que salió y NO VOLVIÓ. Son dos ejes y se cruzan de
  las cuatro maneras: se puede fotografiar algo que no volvió, y devolver algo que no se fotografió.
  Hay un bloque de tests que fija justamente eso.
- 🔴 **Sólo se pregunta por lo que SALIÓ** (`fotografiables` filtra por `salioEfectivo > 0`): pedir
  que se conteste por lo que nunca salió del depósito ensuciaría el «sin contestar» con renglones
  que nadie puede contestar. Es el mismo criterio con que `esperadoEn` calcula la devolución.
- 🔑 **Contestar por error no es irreversible**: volver a apretar la respuesta elegida la devuelve a
  «sin contestar» (`conRespuestaFoto(..., null)`). Si marcar fuera definitivo, la única salida sería
  mentir en el otro sentido.
- ⛔ **El atajo «el resto sí» NO pisa lo ya contestado.** Sólo toca lo que está sin contestar: si
  borrara un «este no se pudo», el atajo estaría destruyendo el dato más caro de la pantalla.
- 🔑 **El motivo del «no» es texto libre con sugerencias de placeholder** (`MOTIVOS_SIN_FOTO`), no un
  catálogo cerrado: nadie caminó todavía una sesión anotando por qué no se pudo, y fijar la lista
  ahora sería inventar el vocabulario del trabajo antes de escucharlo.
- 🔑 **Lo no fotografiado vuelve a la cola SOLO**, y por eso este mapa no es una lista de tareas: la
  cola de fotos sale del estado de Tienda Nube (el color sigue sin foto), no de un pendiente que
  haya que crear. Lo que este mapa agrega es lo que la cola **no** puede saber: que ya se intentó,
  y por qué falló.
- ⚠️ **La fila del historial ahora dice el resultado** («3 de 8 fotografiadas · 2 sin contestar»).
  Sin eso, una sesión cerrada sin una sola foto se ve igual que una que salió perfecta: las dos
  dicen «cerrada». Se calcula en el componente y **no** en `filaHistorial` porque `resumenFotos`
  importa de `core` y sería un ciclo.
- ▶️ **Nadie lo contestó todavía en una sesión real**: las 30 solicitudes existentes arrancan las 30
  en «sin contestar», que es exactamente lo que la pantalla debe decir.

## La modelo y su talle (3-sep-2026, pedido de Bruno)

> «Dinámica sesión de fotos con talle de la modelo — para luego cargar el talle que usa la modelo en
> la descripción del producto.»

Es el dato que la clienta pregunta antes de comprar —*¿qué talle tiene puesto?*— y que hasta hoy ⛔
no estaba escrito en ningún lado: lo sabía quien estuvo en la sesión, y cuando alguien redacta la
ficha —días después, otra persona— ya no se puede preguntar.

**Dónde vive:** `lib/sesionfotos/modelo.ts` (núcleo puro) · `Solicitud.modelo` en `tipos.ts` ·
la ficha en `SesionFotos.tsx` (`FichaModelo`) · `tests/sesionfotos-modelo.test.ts`.

🔴 **La normalización del talle y de la altura ya ⛔ no vive acá: se mudó a `lib/modelos/core.core.js`**
el mismo 3-sep, cuando nació el padrón de modelos (`docs/secciones/modelos.md`). Desde que hay DOS
lugares donde se escribe el talle de una modelo —su ficha y esta sesión—, la misma regla escrita dos
veces se lee como un descuido. Acá se **re-exporta**, así que `SesionFotos.tsx` y `gen-desc` no se
enteraron, y `tests/modelos-core.test.ts` fija con un `toBe` que son **la misma función**.
🏁 **Y desde el 3-sep-2026 la modelo se ELIGE del padrón** (`Del padrón`, arriba de los tres campos).
Elegirla trae su talle y su altura **y deja el `id` de su ficha en la sesión** — que es lo único con
lo que después se puede contestar *«cuántas sesiones hizo cada modelo y cómo vendió lo que
fotografió»*, el análisis que Bruno pidió en el mismo dictado. **Tipear el nombre ⛔ no engancha
nada**, y la pantalla lo dice en chico cuando se tipea a mano en vez de elegir.

- ⚠️ **Los tres campos siguen libres**: la modelo que está parada en el estudio y ⛔ no tiene ficha se
  anota como siempre. El selector es un atajo, ⛔ no una puerta — y con el padrón vacío ⛔ no se
  dibuja, pero la pantalla explica por qué en vez de dejar el hueco.
- 🔑 **La ficha PISA lo tipeado, pero un dato que la ficha ⛔ NO tiene no pisa nada**: elegir a alguien
  cuyo talle todavía no se sabe ⛔ no borra el talle que ya estaba escrito (`desdeFicha`).
- 🔴 **El padrón se pide por MARCA y ⛔ nunca por línea.** Esta pantalla se mira por línea y `stunned`
  es una línea de Zattia: pedirlo con la línea contesta **403 sin decir por qué**.
- 🔴 **Quien carga una sesión ⛔ puede no tener la sección Modelos**, y el selector igual tiene que
  andar: el handler abre `?modo=elegibles` a `sesion-fotos` y ahí viajan **cuatro campos** —id,
  nombre, talle, altura—. El teléfono, el mail, la agencia, la nota y **escribir** siguen pidiendo
  `modelos`. Es un tipo aparte (`ModeloElegible`) y ⛔ no la ficha con campos en `null`: un `null` ahí
  **afirmaría** que no tiene Instagram.
▶️ **Falta caminarlo**: cargar una ficha en Modelos, elegirla en una sesión real y ver que quede.

- 🔑 **Es de la SESIÓN, ⛔ no de la prenda.** Lo eligió Bruno entre tres formas: una sesión es una
  modelo y su talle es el mismo en las 30 prendas. Anotarlo prenda por prenda sería 30 veces el
  mismo dato, y 30 lugares donde escribirlo distinto.
- ⚠️ **`talle` es lo obligatorio; `nombre` NO.** Al revés de lo que parece: el talle es lo que va a la
  descripción, y exigir el nombre —que en el momento no siempre se sabe cómo se escribe— perdería el
  dato que sirve por el que no. **Sin talle se borra la ficha entera**, y ése es el gesto de deshacer.
- 🔴 **El talle ⛔ no sale de una lista cerrada, pero se NORMALIZA a mayúsculas.** En Zattia conviven
  dos alfabetos (`S/M/L` y `38/40/42`) y encima se escribe `Talle M`, `m`, `M`. Cerrar la lista
  dejaría afuera al primer `ÚNICO` que aparezca — y una sesión sin el dato es el único fracaso que
  este campo no puede permitirse. Las sugerencias del campo salen de **las variantes de esa misma
  sesión**: son los talles que la modelo tuvo en la mano.
- 🔴 **La altura que no parsea se DESCARTA, ⛔ no se guarda cruda**: `170`, `1.70`, `1,70` y `1,70 m`
  son la misma persona y se guardan `1,70 m`, porque ese texto sale tal cual a una ficha que lee una
  clienta. Fuera de 1,20–2,20 no es una altura.
- 🔴 **El puente con «Descripción y medidas» es el SKU, ⛔ no el id del producto**: la sesión arma sus
  ítems con el catálogo de Gestión Nube y la ficha se escribe sobre el de TiendaNube — dos
  numeraciones. 📌 **Medido antes de escribirlo**: de los **79 SKU** distintos de las sesiones de BDI,
  **79 cruzan** con un SKU de variante de TiendaNube. ⚠️ En Zattia —la única marca donde corre
  `gen-desc`— ⛔ no se pudo medir desde afuera: `solicitudes` tiene RLS y la clave pública no entra.
- 🔴 **Una prenda contestada «no se fotografió» ⛔ NO hereda la modelo.** Ahí la respuesta explícita
  dice que no se la puso. Las que **nadie contestó** sí: salieron con la sesión, y `sin-contestar`
  significa «nadie lo anotó», ⛔ no «no pasó» (la misma regla de tres respuestas de arriba).

▶️ **Lo que falta, y es una decisión de Bruno**: hoy el talle **se muestra** en la ficha del producto
y ⛔ **no se publica solo**. El párrafo ⛔ no puede nombrar un talle —lo rechaza `validarParrafo`
desde el 27-ago por decisión suya, porque los talles del PRODUCTO se desactualizan— así que la frase
tiene que salir como **un bloque compuesto**, al lado de los bullets y de la tabla de medidas. Ese
bloque todavía no existe. Ver `docs/secciones/gen-desc.md`.

## Lo que se midió, y lo que nunca se ejerció (16-ago-2026)

Contra las dos bases, no contra la memoria: **BDI 10 solicitudes** (todas de fotos, 1-jul → 28-jul,
9 cerradas + 1 devuelta) · **Zattia 20** (14 de fotos + 6 internas, 30-jun → **13-ago**, con una
`cargada` del 11-ago todavía abierta). Zattia es donde la sección se usa.

Sobre esas 30 filas:

- 🔴 **El destino `consumo` NUNCA se usó**: 30 de 30 son `retornable` ⇒ la aprobación, el rechazo y
  `necesitaAprobacion` —toda la mitad de la Fase 2— están en prod **sin ejercer una sola vez**.
- 🔴 **Las bolsas numeradas nunca se usaron**: 0 ítems con `bolsa` en las dos marcas. El armado por
  bolsas, la etiqueta 5×2,5 y el reporte por bolsa se construyeron enteros y no se estrenaron.
- ⚠️ El historial de cambios de la Fase C tiene **un** uso (BDI); `eliminados`, dos (Zattia).
- ⚠️ **19 de 30 no tienen `motivo`**: son anteriores a la Fase 2 y el catálogo viejo tenía otras
  opciones. Abrir una vieja no le cambia el motivo por mirarla, y eso es a propósito
  (`SesionFotos.tsx:1288`). Los que sí hay: Moldería 5, Sesión de fotos 5, Video/contenido 1.
- ⚠️ **30 de 30 sin `disparador`**: el campo nació el 24-ago-2026 y arranca vacío en todas. La
  pantalla las muestra como «sin origen» — una lista de «sin origen» se lee como «falta cargarlo»,
  que es lo cierto, y no como «no vienen de ningún lado».

## Cómo se prueba

```bash
npx vitest run tests/sesionfotos-core.test.ts --reporter=dot   # y draft / escaneo / ventas
npx vitest run tests/solicitudes-disparador.test.ts --reporter=dot   # el tercer eje: de dónde viene
npx vitest run tests/sesionfotos-fotografiado.test.ts --reporter=dot # el resultado: qué se fotografió
```

- 🔴 **Verde no dice nada sobre la venta.** Los tests de `ventas.ts` verifican que el **payload** sea
  byte-idéntico al del legacy con `fetch` mockeado (cero POST). Que GN acepte el pedido, que el
  stock se separe y que la anulación se detecte **solo se sabe ejerciéndolo a mano en prod**.
- **La tabla `solicitudes` no se puede mirar con la anon.** Medido el 16-ago: RLS prendido y **cero
  políticas** en las dos bases, con `GRANT SELECT` a `anon` ⇒ la consulta devuelve **`[]` con 200**,
  que se lee como «no hay solicitudes». En local se mira con `psql "$DATABASE_URL_BDI"` (o
  `_ZATTIA`), o con `SUPABASE_SERVICE_KEY`; **la service key de Zattia no está en el `.env`**.
- **Lo que hay que ejercer a mano**: el lector de código de barras (el mapa contempla el cero
  inicial comido, pero eso se ve con el lector puesto), el **ticket 80 mm en la térmica real**, y
  la hoja de compartir del reporte de faltantes, que solo existe en el teléfono.
- El mutante que hay que ver caer al tocar la cuenta de la devolución: poner `i.qty` en lugar de
  `esperadoEn(...)` en `escaneo.ts` o `combinada.ts` tiene que romper `sesionfotos-core` y
  `sesionfotos-escaneo`. **Los cinco lugares están cubiertos desde el 16-ago**, `escanearCombi`
  incluido (4 mutantes, uno por caso).
- 🔑 **Un test de escaneo que no dice la fase está probando `retiro`, y `retiro` no distingue nada**
  (`esperadoEn` devuelve `i.qty`). Todo caso nuevo sobre topes va **en devolución** o no mide.

## Los OUTFITS: la Fase 1 del octavo (4-sep-2026)

Lo pidió Bruno el 3-sep: *«eso tiene que generar un banco de productos de la sesión, donde se
realiza una clasificación rápida y se generan outfits digitales con distintos productos de arriba y
abajo»*. Esta es la **primera de las cinco fases** del plan que está en el `PENDIENTES.md`, y la
que contesta la queja **sin evento, sin tabla y sin banco**: vive adentro de la solicitud de hoy.

🔑 **El outfit ⛔ no es un objeto nuevo: es la BOLSA que ya existía** (`ItemSolicitud.bolsa`,
construida el 16-ago y nunca estrenada). Lo único que se sumó es **qué es cada prenda** y el aviso.

La regla, dictada por él: **un outfit es arriba + abajo, o una prenda entera** (un vestido o un mono
ocupa las dos ranuras).

### 🔴 La medición que dio vuelta el plan: la categoría ⛔ no podía contestar

El plan decía envolver `familiaDe`, que lee las categorías de **TiendaNube**. Se midió antes de
escribir una línea —4-sep-2026, contra las dos bases por `pg` directo— y no servía:

| | BDI | Zattia |
|---|---|---|
| productos con stock | 223 | 501 |
| cruzan con una familia | **0 (0%)** | **36 (7,2%)** |
| sin categoría en Gestión Nube | 1 | **400 (79,8%)** |

- 🔴 **La categoría de GN dejó de llenarse.** De lo dado de alta **desde julio-2026** con stock en
  Zattia, **el 100% viene sin categoría** (35/35 en julio, 50/50 en agosto, 67/67 en septiembre). Y
  lo que una sesión de fotos pide es, justamente, **lo que acaba de entrar**.
- 🔑 **En GN `category` ⛔ no es una categoría: es una lista separada por comas** (`'NEW IN, DAY,
  DENIM'`). La primera pasada de la medición la trató como una cadena sola y dio «casi nada cruza»;
  partida por coma, Zattia pasó de 9,9% a 24,1% sobre el catálogo entero. `catsDeGN` la parte.
- 🔴 **En BDI el 0% ⛔ no es un defecto: no vende ropa.** Son fundas, cables y vidrios templados.

⇒ **la zona sale del NOMBRE**, que está siempre y es un vocabulario cerrado (`TOP` 131, `SHORT` 40,
`MINI` 34, `BABY` 31…). La categoría queda de **segunda fuente**, para los productos viejos que sí
la tienen.

### Caminado contra el catálogo real, ⛔ no sólo contra el test

Pasando `zonaSugerida` por las dos bases el 4-sep:

- **Zattia, 501 con stock**: 322 arriba · 137 abajo · 22 enteras = **481 con zona (96,0%)**. De los
  20 restantes, **19 son accesorios que el vocabulario reconoce** (cintos, fajas, pañuelos,
  `MINI BAG`, `MINI CLUTCH`) y **una sola prenda** queda sin poder decirse: `FADE #002`.
  ⇒ de prendas de verdad, **481 de 482**.
- **BDI, 223 con stock**: **223 sin zona, y está bien.** Ahí el bloque entero desaparece.

🔴 **Lo que la caminata cazó y el test no podía**: `zonaSugerida` devolvía `null` igual para un
accesorio conocido que para una prenda desconocida ⇒ la pantalla iba a pedir que alguien
**clasificara un cinto**. Los separa `esPrendaDeOutfit`, y es lo que mira `sinZona`.

🔴 **Y en BDI eso todavía no alcanzaba**: `fueraDeAlcance` sólo conoce `ACCESORIOS`/`BAGS`, así que
una funda quedaba como «prenda sin clasificar» y una sesión de BDI habría mostrado **223 pendientes**.
Por eso existe `aplicaOutfits`: **si la solicitud ⛔ no tiene una sola prenda, el módulo entero se
calla**. Es la misma forma que `alertasDe`, que ⛔ no reclama sobre una bolsa sin nada clasificado.

### Las trampas del vocabulario, que salieron de mirar los nombres reales

- **`MINI BAG` y `MINI CLUTCH` son carteras**, ⛔ no polleras ⇒ las frases de dos palabras se
  prueban **antes** que la primera palabra. Sin eso, cuatro carteras entraban al outfit.
- **`BABY TEE` es una remera** (31 productos), ⛔ no ropa de bebé. Lo mismo `LONG TEE`.
- **El bikini es un outfit**: `CORPIÑO` va arriba y `BOMBACHA` abajo. Los nombres vienen con y sin
  tilde en la misma familia, así que la Ñ y los acentos se normalizan.
- **`FAJA` en Zattia es un accesorio** (categoría `ACCESORIOS`), ⛔ no ropa interior.

### Lo que se guarda, y lo que ⛔ no

`Solicitud.clasifOutfits?: Record<vid, ZonaPrenda>` guarda **sólo la corrección a mano**. La
propuesta se recalcula cada vez que se dibuja: 🔑 **si mañana el vocabulario aprende una palabra
nueva, las sesiones viejas la aprovechan solas.** Guardar la propuesta las dejaría congeladas en lo
que el sistema sabía el día que se armaron.

Y **soltar una corrección BORRA la clave**, ⛔ no la deja en `null`: con la clave puesta en null la
prenda quedaría «decidida como nada», y lo que se quiere es que vuelva a valer la propuesta.

⛔ **Sin migración**: `clasifOutfits` viaja adentro de `datos` (jsonb) y el cajón guarda el
documento entero sin lista blanca (`filaDe`), igual que `modelo` el día anterior.

### Cómo se camina

```bash
npx vitest run tests/sesionfotos-outfits.test.ts --reporter=dot
```

▶️ 🔴 **Nadie abrió la pantalla todavía.** Lo que hay que ejercer a mano, con una sesión de Zattia:
abrir una solicitud con prendas de arriba y de abajo, asignarles bolsa, **ver la zona propuesta**,
**corregir una** y comprobar que la bolsa con sólo «arriba» avisa y **deja de avisar** al sumarle el
abajo. Un verde ⛔ no dice que guardar ande: hay que **salir y volver a entrar** a ver que la
corrección quedó.
⚠️ Y abrir una de **BDI**: ahí ⛔ no tiene que aparecer ni el selector, ni el aviso, ni el renglón
de «faltan clasificar».
