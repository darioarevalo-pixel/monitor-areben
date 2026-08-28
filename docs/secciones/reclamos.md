# Reclamos y Cambios — ficha de sección

Secciones `reclamos` y `cambios`, área Administración / Local. Todo lo que sale mal después de la
venta: llegó fallado, faltó algo, llegó otra cosa, nunca llegó, no era lo que esperaba, no le entró
el talle, se arrepintió, o no teníamos el producto. Reemplazó a **Fallas-con-envío** y a
**Devoluciones**, que eran dos pantallas con dos motores.

**Un registro, dos pantallas.** Cambios sigue siendo su propia pantalla porque es una operación de
mostrador, pero escribe sobre la misma tabla: **un cambio no es un tipo de caso, es un caso con
`compensacion='otro_producto'`**. Por eso no hay tabla `cambios`.

📄 **Auditoría de punta a punta del 28-ago-2026: `docs/postventa-auditoria-2026-08-28.md`.**
La matriz **estado × rol** (qué ve, qué aprieta y qué mensaje tiene cada uno en cada momento) y **18
cosas que no cierran**, ordenadas por lo que cuesta plata o deja a un cliente sin respuesta. ⛔ No es
una ficha: es una foto con fecha, y lo que se arregle se tacha allá y se cuenta acá.

## El chasis: inicio común · **el escenario** · final común

El módulo está armado como tres bandas, y saber en cuál cae lo que se va a tocar ahorra la mitad
del trabajo:

- **El inicio** es igual en los once casos: qué venta, qué caso, sobre qué productos, qué pide.
- **El centro** es lo único distinto en cada uno: **una** pregunta que decide y su **lista cerrada
  de escenarios** (`lib/reclamos/casos.core.js`). Es el nivel que hasta el 25-ago-2026 no existía:
  se iba del caso a la decisión de una, sin dejar registrado qué se había encontrado.
- **El final** es igual en los once: resolución → movimientos (`efectos.core.js`) → cierre
  (`faltantesParaCerrar`).

🔴 **EL ESCENARIO NO ES UN DATO PARA EL INFORME: ES LO QUE DETERMINA LA PLATA.** Tres casos no se
pueden resolver mirando el caso:

| Caso | Lo decide el escenario |
|---|---|
| `no_como_publicado` | El error es nuestro **sólo si la diferencia es objetiva** ⇒ ahí va el envío de ida |
| `demora` | Es nuestra **sólo si quedó parada en preparación** ⇒ ahí va un cupón; si fue del transporte va el **reclamo al transportista** |
| `arrepentimiento` | Si el pedido todavía no salió es una **cancelación**: no salió, no recibió nada, y **no hay producto en juego** |

⇒ Por eso **el escenario es un parámetro obligatorio** de todo lo que decide plata o stock
(`perfilDe`, `devuelveElEnvioDeIda`, `compensacionesDe`, `destinoDe`, `puedeVolverLaPrenda`,
`ofreceRetencion`). Aunque valga `null`: un llamador que no lo pase estaría contestando con el
default seguro **sin enterarse de que le falta el dato**.

🔑 **El final puede quedar VACÍO, y eso no es un caso a medio resolver.** Una demora no genera
ningún movimiento: la tercera pregunta física del perfil (`productoEnJuego`) contesta que no hay
producto, y `decidir` deja de exigir un destino. Hasta el 25-ago-2026 lo exigía siempre, así que
una demora **no se podía cerrar nunca**.

⚠️ **El escenario se contesta al DECIDIR, no en el alta**: la pregunta se contesta con la evidencia
delante (las fotos, las fechas del envío) y en el alta todavía no hay ninguna. El alta muestra cuál
va a ser la pregunta, nada más.

⚠️ **En la falla el escenario ES la gravedad** (`util`/`inutil`, las mismas claves de
`GRAVEDAD_DEF`): eran el mismo dato y la gravedad se moría al cerrar el modal.

## Dónde vive

`components/reclamos/` (`Reclamos.tsx` 44k · `ArmarCambio.tsx` 50k · `DecidirReclamo.tsx` 31k ·
`ReclamoPublico.tsx`) · `components/postventa/` (Fallas, otra cosa: el ledger) ·
`lib/reclamos/tipos.ts` (**1.4k líneas, leer por rango**) · `lib/reclamos/casos.core.js` ·
`lib/reclamos/efectos.core.js` · `lib/reclamos/mensajes.ts` · `lib/reclamos/cliente.ts`.
⚠️ `DecidirReclamo.tsx` **está en tres pestañas desde el 27-ago-2026 y el orden es la regla** — ver
«La pantalla de decidir» más abajo antes de mover un bloque de lugar.

Handler `api/_reclamos.js` (entra por `api/postventa.js`) y el portal público `api/_reclamo.js`.
La venta en Gestión Nube la crea `api/crear-venta.js`, **que corre en PROD también desde localhost**
(los tokens de ventas viven ahí).

Tabla `devoluciones` (`sql/migrate-devoluciones*.sql`, `sql/migrate-reclamos-efectos.sql`,
`sql/migrate-reclamos-escenario.sql`). Tests: `tests/reclamos.test.ts` (1.2k líneas),
`tests/reclamos-escenarios.test.ts`, `tests/reclamos-mensajes.test.ts`, `tests/reclamo-publico.test.ts`,
`tests/reclamos-decidir-pestanas.test.tsx` (jsdom, monta el modal).

## ⛔ Lo que comparte con otras secciones

- **`lib/reclamos/efectos.core.js` lo lee el handler Y la app.** Va en `.js` plano por lo mismo que
  `lib/permisos.core.js`. La cara tipada está en `tipos.ts` — ⛔ no duplicar la derivación en ningún
  otro lado: ése es exactamente el bug que arregló.
- **Las fallas que nacen de un reclamo van al ledger de Post-venta** (`falla_ids`). Tocar cómo se
  valúa una falla acá mueve esa sección.
- **`/reclamo/<token>` es un portal ABIERTO**, sin sesión, resuelto antes del guard de permisos. Es
  lo único de este módulo expuesto a internet.
- 🆕 **`lib/notificaciones/derivar.ts` importa de acá** (`alertasDe`, `estaAbierto`, `MOTIVO_LABEL`,
  `numeroReclamo`): es el aviso del sidebar. ⇒ **tocar `alertasDe` o `DIAS_ALERTA` mueve también el
  contador de avisos de todo el equipo de Administración**, no sólo esta pantalla.

## Reglas que el código no dice

- 🔴 **Gestión Nube no anula ventas por API y no acepta stock negativo.** Por eso `stock_estado` y
  `reingreso_estado` son **trazas de un paso a mano**, no efectos que el sistema ejecute. Todo lo
  demás que se pueda generar desde Monitor, se genera desde Monitor.
- 🔴 **El envío de ida se devuelve cuando el error fue NUESTRO** (falla, faltante, producto
  equivocado, falta de stock), y también cuando el cliente no recibió nada. Si se arrepintió o no le
  gustó, va sólo el producto: el envío prestó su servicio. El de vuelta lo pagamos siempre nosotros.
  🔑 Son **dos preguntas del perfil, no una**: `errorPropio` y `recibioAlgo`. `no_llego` entra por
  la segunda —el error es del transportista— y eso es lo que deja reclamarle esa plata al correo sin
  dejar de devolvérsela al cliente.
- 🔴 **Un cambio es lista contra lista y el cliente conserva el descuento de la compra original.** Si
  la diferencia queda a su favor, lo devuelto se re-valúa a lo que pagó: **nunca sale más plata de
  la que entró**.
- 🔑 **`faltante` y `sin_stock` mueven el stock al REVÉS.** En `faltante` la unidad **está** en el
  depósito y se reingresa; en `sin_stock` **no existe** y se da de baja. Mismo "nunca salió",
  movimiento opuesto → `hayUnidadFisica()`.
- 🔑 **`sin_stock` no puede reenviar** —es lo único que no tenemos— y es **el único caso donde decide
  el cliente**. Si elige otro producto se **edita la venta original** en GN, no se crea una nueva.
- 🔑 **`talle`, `arrepentimiento` y `no_esperaba` son el mismo flujo con tres etiquetas**, separados
  a propósito: cada uno mide otra cosa (la guía de talles, nada, la ficha de producto). Fusionarlos
  ahorra una línea y pierde el dato.
- 🔑 **El motivo de un cambio es opcional de verdad**: cambiar es un derecho del comprador. El select
  arranca vacío a propósito — cuando arrancaba en `talle` se guardaba `talle` sin que nadie lo
  eligiera, y eso ensuciaba la única señal que el campo da.
- ⚠️ **`tn_stock_estado` ya no tiene nada que ver con Tienda Nube**: es la baja en GN. Se reusó la
  columna en vez de migrar. Escribir stock en TN no sirve — GN lo pisa en el próximo sync.
- ⚠️ **La venta $0 de una falla va DESPUÉS de tildar la anulación**, si no descuenta dos veces.

## Lo que ya se rompió acá

- 🔴 **Los pendientes se derivaban con dos condiciones a mano dentro de `decidir`, y tres de las
  siete resoluciones no estaban en ellas.** `reenvio`, `cupon` y `ninguna` encendían "devolver la
  plata" y "anular la venta en GN" — pendientes que nadie podía tildar nunca. El comentario del
  código ya decía que el cupón no debía generarlos; la condición nunca lo incluyó. **Es el modo de
  falla característico de esta sección: la regla repartida en dos listas.** Arreglado con
  `EFECTOS_RESOLUCION` → `lib/reclamos/efectos.core.js`.
- 🔴 **Una falla o un pedido mal armado se devolvían SIN el envío de ida** hasta el 24-ago-2026:
  `devuelveElEnvioDeIda()` miraba sólo si el cliente había recibido algo, y no si el error había sido
  nuestro. Medido con un producto de $10.000 y envío de $3.000: se devolvían $10.000 en vez de
  $13.000. Antes de eso era un checkbox libre y el mismo caso salía distinto según quién lo tocara.
- 🔴 **Un cambio no cierra con las condiciones de una devolución.** Se le exigía anular la venta
  original y devolver plata: quedaba trabado para siempre → `faltantesParaCerrar()`.
- ⚠️ **Los pendientes nacían en `pendiente` al crear el reclamo**, así que la fila decía "anular la
  venta · devolver la plata" desde el minuto cero, antes de que hubiera ninguna decisión. Hoy nacen
  en `no_aplica` y los deriva `decidir`.
- 🔴 🔑 **«El link quedó copiado» se decía SIN haber copiado nada** (27-ago-2026). El alta hacía
  `navigator.clipboard?.writeText(link).catch(() => {})` y cantaba el éxito abajo, pasara lo que
  pasara. El portapapeles se rechaza más seguido de lo que parece —no hay contexto seguro, o el
  navegador consideró que se perdió el gesto del usuario en un `await`— y las dos formas de fallar
  son mudas: una promesa que no cumple, o un `undefined` que con el `?.` ni lo intenta. **Lo caro no
  es que no copie: es lo que la persona hace después** — pega en WhatsApp **lo que hubiera antes en
  el portapapeles**, que puede ser el link de OTRO cliente, y del lado del que lo recibe se ve
  igual que «me mandaron un link que no anda». Ahora los dos que copian —el alta y el `CopyButton`
  del kit— pasan por `lib/portapapeles.ts`, que **nunca deja a la persona sin el texto** (si no
  copia, se lo muestra para copiarlo a mano) y **devuelve si lo hizo solo**, para que el cartel diga
  lo que pasó. `tests/portapapeles.test.ts` lo prueba de comportamiento y además impide que vuelva a
  aparecer un `navigator.clipboard` suelto en esos dos archivos.
  ⚠️ **Ese test tuvo que sacar los comentarios antes de contar**: el comentario que explica el
  defecto escribe `navigator.clipboard` textual y hacía fallar al test sobre su propia explicación.
- ⚠️ **Y en el portal las fotos ya subidas tampoco se podían mirar** (27-ago-2026, misma tanda):
  recortes de 84 px, que alcanzan para contarlas y no para que la persona confirme que **se ve lo
  que quiso mostrar** — lo único que puede revisar antes de mandar, porque después el link no vuelve
  a abrir. Mismo `Lightbox` del kit. 🔑 **Es la única excepción al «estilos propios» del portal**, y
  tiene razón: una foto a pantalla completa sobre fondo negro no se parece a un panel de
  administración, que es de lo que huía esa regla. Se importa **derecho y no por el barrel**
  (`@/components/ui`), que arrastraría el kit entero al chunk de una pantalla que se abre con datos
  móviles; `.mo-lightbox` vive en `kit.css`, que carga el layout raíz, así que ahí también está.
- 🔴 🔑 **La evidencia se miraba a 96 px recortados** (27-ago-2026). Las fotos que carga el cliente
  se pintaban en `DecidirReclamo` como miniaturas de 96×96 con `object-fit: cover` y **no se podían
  agrandar**, en la única pantalla donde hay que elegir el escenario —o sea donde se decide la
  plata— mirando justamente eso. Una raspadura no se ve en un recorte cuadrado. Ahora cada foto es
  un `<button>` que abre el `Lightbox` **que ya estaba en el kit** (`components/ui/Lightbox.tsx`,
  `z-index` 3000, por encima del modal): cero componentes nuevos. Pedido de Bruno.
  🔑 **Su test es el único de una pantalla del repo que MONTA el componente y aprieta el botón**, y
  no por gusto: `Modal` usa un portal y `renderToStaticMarkup` —el oráculo del resto— tira
  *«Portals are not currently supported by the server renderer»*. De paso fija lo que importa, que
  no es que exista un `<Lightbox>` en el JSX sino que **el click abra la foto que se tocó** (el
  error fácil acá es mostrar siempre `fotos[0]`). Ver `tests/reclamos-foto-ampliada.test.tsx`.
- 🔴 🔑 **El portal del cliente forzaba la CÁMARA y escondía la galería** (27-ago-2026). El
  `<input type="file">` de `ReclamoPublico.tsx` llevaba `capture="environment"`. **`capture` no es
  una preferencia que el navegador pueda ignorar: es una orden de abrir la cámara y saltear el
  selector**, así que en Android no había forma de adjuntar una foto que ya estuviera sacada — y la
  foto de una falla casi nunca se saca en el momento en que se abre el link: ya la tenía sacada, o
  se la mandó otra persona desde otro teléfono. Reportado por la primera persona del equipo que lo
  usó de verdad: *«no se podía adjuntar fotos desde otro celular, solo abre la cámara»*.
  Sacar el atributo **no quita la cámara: agrega la galería** (iOS ofrece «Fototeca / Sacar foto /
  Elegir archivo»; Android, el selector con la cámara adentro). Amarrado en
  `tests/reclamo-publico-galeria.test.tsx`, que **monta el portal** y mira el atributo en el DOM
  real. (Nació como texto contra texto porque el `<input>` recién existe después del `useEffect` y
  `renderToStaticMarkup` no corre efectos; se pasó a montar el 27-ago, junto con el lightbox.)
  🔑 **La lección para todo el módulo: nada de lo que hace el portal se prueba desde acá.** Ni un
  test ni un `curl` ven lo que abre el sistema operativo del cliente. Este defecto no lo encontró la
  suite ni un review: **lo encontró una persona con un teléfono**, y estuvo en producción desde el
  día uno del módulo — la clienta de `R-0022` subió su foto igual porque la sacó en el momento.
- 🔴 **`imgAThumb` no avisaba cuando no podía LEER el archivo, y colgaba la pantalla**
  (`lib/imagenes.ts`, arreglado el 27-ago-2026 junto con lo de arriba). Tenía `img.onerror` —el
  archivo que no se puede decodificar— pero no `reader.onerror` —el que no se puede leer—. El que
  llama prende su contador antes de leer y lo apaga en el callback o en el `onError`: si el
  `FileReader` moría en silencio no pasaba ninguna de las dos cosas y el botón quedaba en
  «Subiendo 1…» **para siempre**, sin cartel y sin forma de reintentar. Era casi inalcanzable
  mientras el portal forzara la cámara; **abrir la galería lo vuelve alcanzable**, porque de ahí
  sale cualquier cosa (un HEIC, un archivo de la nube que no bajó, uno sin permiso). Del lado del
  cliente eso se ve exactamente igual que «el link no anda».
- ⚠️ **En GN el descuento a nivel venta es `discount_amount`, NO `discount`** — `discount` se ignora
  en el POST aunque al leer aparezca poblado. Verificado con probes en prod.

## Pendiente

- ✅ **La nota de la venta técnica ya lleva la lista entera** (26-ago-2026, `lib/reclamos/nota.ts`).
  Era el *«la nota llevando TODA la información»* que Bruno había dejado dicho el 24-ago y que
  faltaba volver una lista.

  🔑 **Por qué importa acá y no en una venta común:** las cuatro ventas técnicas van al MISMO
  cliente genérico de Gestión Nube —«Reclamo BDI», «Falla», «Cambio»—, así que `client_name` dice
  siempre lo mismo y en GN una venta técnica es indistinguible de otra. **La nota es el único lugar
  donde sobrevive el dato.** Es el mismo problema que ya había resuelto el sync de Tienda Nube, y
  por eso `notaVentaTecnica` copia el mecanismo de `notaTnImport` (`lib/sync-tn/nota.core.js`) y
  **reusa su `recorte`** ⛔ en vez de copiarlo — en este repo ya pasó que dos copias de un helper
  dejaran los tests en verde mirando cada una la suya.

  Los campos, en orden, porque **los topes son POR CAMPO y el primero es el último que se pierde**:
  número de reclamo + qué salida es · orden de TN · el cliente de verdad · el motivo con su detalle ·
  la EM cuando hay paquete saliendo · la etiqueta del depósito de fallas (sólo en la salida `falla`) ·
  quién lo decidió · `(Monitor)`. ⛔ **Los productos no van**: son los renglones de la venta, y
  repetirlos gastaría el lugar de lo que GN no puede mostrar de ninguna otra forma. La nota más
  larga posible da ~270 caracteres contra el recorte a 500 de `api/crear-venta.js`, que es la red y
  no el mecanismo.

  🔴 **Y los tests van sobre la LLAMADA, no sólo sobre la función** (`tests/reclamos-venta-tecnica.test.ts`,
  con `fetch` stubeado): es donde vivía el defecto de `destinoDe` que se pudo cambiar sin poner
  nada en rojo. Se mira el cuerpo del pedido a `crear-venta` — a qué cliente de GN va y qué dice la
  nota. **7 mutantes, 7 muertos**, entre ellos «la regalada vuelve al cliente FALLA» y «la regalada
  dice fallada en la nota».
- ✅ **El descuento ya está partido en dos** (26-ago-2026). Bruno creó los dos clientes de Gestión
  Nube que faltaban —**«Reclamo BDI» `652720` (n°14231)** y **«Reclamo Zattia» `652718`**— y con eso
  se pudo separar lo que era un solo destino sobrecargado:

  | destino | qué significa | a dónde va la venta técnica |
  |---|---|---|
  | `falla` | la unidad **es** una falla | cliente FALLA + ledger de Post-venta, valuada a PVP feria |
  | `regalada` 🆕 | la unidad está **sana** y se la queda el cliente | cliente RECLAMO, ⛔ **no entra a Fallas** |

  🔑 **Lo que arregla:** para sacar del stock un producto impecable había que darlo de alta en
  Fallas, o sea afirmar dos cosas falsas sobre él —que está fallado y que se revende como tal— y
  ensuciar con eso el único ledger que dice cuánta plata se pierde en fallas. `destinoDe` contestaba
  `'falla'` para **todos** los casos en que el producto no vuelve, no sólo el excedente.

  🔴 **Y se construyó en verde: `destinoDe(motivo, false, …)` no lo assertaba ningún test.** Cambiar
  la línea de `'falla'` a `'regalada'` no puso una sola prueba en rojo. El agujero era de cobertura,
  y justo en la rama que decide a qué cliente de GN va la plata → `tests/reclamos-unidades.test.ts`,
  bloque «el descuento se parte en dos».

  - ⛔ **Sin migración**: el sello viaja en el jsonb (`ItemReclamo.baja_at` + `baja_venta`), y va por
    **unidad** por lo mismo que `destino` y `recibida_at` — un reclamo donde uno vuelve a stock y el
    otro se lo queda el cliente no lo puede decir una columna sola.
  - 🔑 **Cerrar lo exige**: `faltantesParaCerrar` no deja cerrar mientras una regalada siga contada
    en GN. Ése es el "siempre" de la decisión — antes el descuento dependía de que alguien apretara
    «Pasar a Fallas».
  - Handler: acción **`descontado`** (⛔ no está en `DE_ADMIN`: es una traza, igual que `falla`,
    `gn-baja` y `reingreso`). La venta la crea `descontarRegaladas` contra `api/crear-venta.js` con
    `proposito:'reclamo'`, **una por reclamo** con todas las unidades que falten.
  - ⚠️ **El id de Zattia no se pudo verificar**: su token de lectura de GN está vencido (lo mismo que
    ya anota `CAMBIO_CHANNEL`). El de BDI sí, contra `/clientes` de GN. ⇒ **la primera venta técnica
    de un reclamo de Zattia hay que mirarla en GN.**
- ✅ **Y salió un defecto de la misma línea: una DEMORA contaba el costo entero de la mercadería como
  perdida.** `costoDelCaso` no aceptaba `destino: null`, así que la pantalla tapaba el hueco mandando
  `'falla'` fijo cuando no se pedía el retorno — y en una demora el cliente recibió lo que compró, lo
  pagó y es suyo. Ahora `null` ("no hay producto en juego") vale cero.
- ✅ **El `vuelve` del handler era una COPIA de `laUnidadVuelve`**, sobreviviente de la mudanza del
  25-ago. Con `regalada` contestaba bien de casualidad. Ya llama al núcleo.
- ✅ **El excedente que salió de OTRA venta ya deja rastro** (26-ago-2026). Era lo que la partición
  del descuento no resolvía, y el agujero no era de stock sino **del otro cliente**.

  🔑 **Es el único caso del módulo que toca DOS ventas.** Al cliente de acá le llegó un producto que
  no compró; del otro lado hay una venta a la que le falta ese producto y **alguien que todavía no
  reclamó**. El escenario `otra_venta` decía textual *«se guarda cuál y se avisa»* y ⛔ **no se
  guardaba nada**: era una etiqueta. El faltante de la otra venta dependía de que alguien se
  acordara — o de que el otro cliente llamara, que es el único camino por el que esto se
  descubría.

  - El número va **por unidad** en el jsonb (`ItemReclamo.otra_orden`), ⛔ **sin migración**, por lo
    mismo que `destino` y `baja_at`: dos productos de más pueden venir de dos ventas distintas.
  - 🔑 **Cerrar lo exige** (`faltantesParaCerrar`), que es lo que lo vuelve «siempre» y no «si
    alguien se acuerda». El handler **exige el número** (`action: 'otra-venta'`, ⛔ fuera de
    `DE_ADMIN`: es una traza) por la misma razón que el cupón exige el código — es lo único que
    prueba que alguien fue a mirar la otra venta.
  - ⚠️ **Sólo `otra_venta`.** En `sin_identificar` no se puede saber cuál es —para eso está ese
    escenario— y exigirlo sería **el pendiente que nadie puede tildar nunca**, que es el modo de
    falla propio de esta sección. En `de_nadie` no hay otra venta.
  - ▶️ **Abrir el faltante de esa otra venta lo sigue haciendo una persona**, y ahora tiene el
    número anotado y un pendiente que no la deja cerrar sin hacerlo.
- ✅ **La oferta de retención ya deja rastro** (25-ago-2026). Se guardan `retencion_monto` y
  `retencion_respuesta` (`acepto` / `rechazo`), y la regla entera vive en `registroDeRetencion`
  (`lib/reclamos/casos.core.js`), que la aplican la pantalla y el handler. **Las dos mitades van
  juntas o no va ninguna**: media oferta —un monto sin respuesta, o una respuesta sin monto— es lo
  que después hace mentir la cuenta. ⚠️ **Vacío ⛔ no es "no se le ofreció": es SIN REGISTRAR**, y
  por eso el resumen no dibuja la línea cuando no hay respuesta. 🔑 Lo que faltaba era **la
  rechazada**: la aceptada se adivinaba por la resolución (termina en `plata_parcial` o `cupon`),
  así que sin registrar el "no" existía el numerador y no el denominador. 🔑 **Aceptar apaga el
  pedido de retorno** —si se lo queda, no vuelve nada— y el handler rechaza la combinación: tenerla
  prendida contaba el producto dos veces, esperándolo en la bandeja de retornos y en poder del
  cliente.
- ✅ **La bandeja de retornos ya existe**: es la sección `retornos` (Depósito y Local) →
  `docs/secciones/retornos.md`. Lo que se espera que vuelva **no se mira más desde acá**, y el
  botón "Volvió" de esta pantalla llama a la misma acción (`recibir`) que la bandeja.
- ✅ **`no_esperaba` ya está separado**: "la publicación está mal" salió a `no_como_publicado`
  (25-ago-2026). Los dos arrancan en `errorPropio: false` y en el segundo **lo sube el escenario**,
  cuando la diferencia es objetiva — afirmarlo por default regalaría el envío en cada caso que en
  realidad era una expectativa.
- ✅ **El cupón ya es un pendiente** (25-ago-2026). La resolución `cupon` deja `cupon_estado` en
  `pendiente` —una pregunta más de `EFECTOS_RESOLUCION`, no un `if` suelto— y cerrar lo pide.
  Se tilda con la acción `cupon-emitido`, que **exige el código**: es lo único que prueba que el
  cupón existe en la tienda. Antes `cupon_codigo` se tipeaba suelto y nada avisaba si nunca se
  había creado, así que el reclamo se cerraba "con cupón" y el cliente descubría en la próxima
  compra que el código no anda.
- ✅ **"Despachar lo que se le manda" ya se puede tildar** (25-ago-2026, acción `despachado`, ⛔ sin
  `esAdmin`: despacha Depósito). El pendiente existía desde el 24-ago y **no tenía botón**: el
  cambio, la reposición y el reenvío quedaban trabados sin poder cerrarse — el mismo agujero que
  este módulo ya había tenido con los pendientes mal derivados, ahora al revés.
- ✅ **El destino ya es del PRODUCTO** (25-ago-2026, `lib/reclamos/unidades.core.js`). Cada ítem
  puede llevar su `destino`; **ausente = el del reclamo**, que es el default explícito (mismo patrón
  que el `disparador` de Solicitudes). La pantalla lo pregunta sólo cuando hay **dos o más**: con
  uno, el destino del reclamo ya ES el del producto. Viaja como **mapa índice → destino** y ⛔ los
  productos no se reenvían — salen de la orden de Tienda Nube. 🔴 Medido antes de construirlo:
  **3 de los 10 reclamos de BDI tienen dos productos**, así que uno solo para los dos no era un
  caso de borde.

## 🆕 El aviso del sidebar (26-ago-2026)

🔴 **Era el aviso que le faltaba a todo el post-venta.** Las cuatro alertas de `alertasDe` —la plata
que no sale, el cliente que no responde, el paquete que no llega, la decisión que nadie toma— ya
existían con sus plazos y sus relojes, y se dibujaban **sólo adentro de esta pantalla, que es de
Administración**. O sea: para enterarse de que un reclamo estaba durmiendo había que entrar a
mirarlo. **Es la tercera vuelta del agujero propio de este módulo** (el pendiente sin gesto, y
después el botón del lado equivocado de la puerta): *una regla que nadie ve se lee igual que una
que nadie escribió.*

- **`avisosDeReclamo` (`lib/notificaciones/derivar.ts`) ⛔ no inventa ninguna regla**: es el acarreo.
  Los plazos siguen en `DIAS_ALERTA` y el orden en `alertasDe` ⇒ un plazo se cambia en un solo lado.
- **Uno por reclamo, una alerta por reclamo** (la primera, la misma que muestra la fila). Agrupar
  escondería que son clientes distintos esperando platas distintas.
- 🔑 **`AlertaReclamo.ts` es cuándo la alerta EMPEZÓ a existir** (`referencia + plazo`), ⛔ no la
  fecha del reclamo. `contarNuevos` compara contra el "visto hasta": con la fecha de creación, un
  reclamo que se duerme hoy pero se abrió la semana pasada **nacería ya marcado como visto**, o sea
  que el badge no se prendería nunca justo para el caso que la alerta existe para mostrar.
- 🔴 **Sólo los abiertos** → `ESTADOS_ABIERTOS` / `estaAbierto`, que se mudaron de `Reclamos.tsx` al
  núcleo: un `anulado` con un pendiente viejo sin tildar sigue cumpliendo la condición de la alerta
  de plata y avisaría **para siempre** de algo que ya no existe. La lista es **una**: dos copias es
  el modo de falla de esta sección.
- **El aviso lleva a `/postventa?tab=reclamos`**, y para eso la pestaña de Post-venta se mudó de
  `useState` a la URL (`useFiltroUrl`). 🔴 **Sin eso el aviso dejaba a la persona en el ledger de
  Fallas**, que se lee igual que un aviso que nadie miró — es el mismo defecto que ya se le arregló
  a Canjes. `tabDeLaUrl` valida lo que viene de afuera: un `?tab=cualquiera` titulaba
  *«undefined llega más adelante»*.
- 🔑 **Baja por una puerta angosta, `vista=avisos`**, que **recorta columnas y ⛔ no estados** (quién
  sigue vivo lo contesta el núcleo). Medido sobre las 10 filas de BDI: **1.925 bytes por fila con
  `COLS` contra 344 con éstas, 5,6×** — y esto lo pide cada admin cada 3 minutos. Sin `cliente` y
  sin un solo monto: un aviso dice que algo duerme, no cuánto ni de quién.
- **Lo ve quien puede abrir `postventa`.** El local abre reclamos pero no los resuelve; mandarlo a
  una pantalla que no puede abrir es exactamente el defecto de la vuelta anterior.
- ⚠️ **El acarreo en `store/useAvisos.ts` no lo mira ningún test** (como el de fallas y el de
  canjes): lo que está fijado son las dos puntas —el derivador y la pantalla— y el invariante de que
  la URL que pone el aviso es la que abre Reclamos.

## 🆕 La quinta alerta: el reclamo abierto y nunca enviado (26-ago-2026)

🔴 **`borrador` era el único estado ABIERTO sin ningún reloj** — y es el estado en el que el reclamo
**nace**. Las cuatro alertas de arriba cubren `esperando_cliente`, `en_revision`, `en_transito` y la
plata; un reclamo cargado y nunca mandado no aparecía **en ninguna parte nunca más**, ni en la fila
ni en el sidebar. Y es el que más duele: del otro lado hay alguien que ya se quejó y no recibió una
sola respuesta.

**`borrador` quiere decir literalmente *«ni lo miré»***. La fila pasa a `esperando_cliente` recién
cuando alguien **copia el mensaje** —copiarlo *es* escribirle, de ahí va derecho a WhatsApp—, y ese
gesto ya existía justamente *«para poder perseguir los que están durmiendo»*. Lo que faltaba era el
perseguidor.

- 🔑 **Cuenta desde `created_at`, ⛔ no desde el último toque.** Acá es lo que más importa:
  `updated_at` lo pisa **cualquier** edición del borrador, y editarlo ⛔ no es escribirle ⇒ abrirlo a
  corregir una coma apagaría la alarma de que nadie le escribió. Es el defecto que este módulo ya
  tuvo dos veces (`updated_at` en tránsito, y el último evento en el despacho), con la diferencia de
  que **`created_at` no lo puede pisar nadie**.
- ⚠️ 🔑 **`borrador` significa DOS cosas, y por eso el guard mira `compensacion`.** Un **cambio ya
  decidido vuelve a `borrador`** a esperar que el cliente pague (`decidir` lo deja ahí a propósito, y
  tiene su propia pestaña «Borradores» en Armar cambio): ése ⛔ no está olvidado, es una espera
  legítima. Sin decisión no hay compensación ⇒ `!d.compensacion` **separa las dos poblaciones por el
  dato que las distingue**, y no por una lista de motivos que después hay que mantener. Meterlas en
  la misma alerta sería otro *número que existe y no significa*.
- **`sinMandar: 2` días, tono `danger`.** ⚠️ Como `despacho: 2`, el número ⛔ no salió de la
  operación sino de una propuesta —contestarle a quien se quejó no espera una semana— y se cambia en
  `DIAS_ALERTA`, que sigue siendo el único lado. `danger` porque es **nuestro**: la regla del módulo
  es que lo que depende de nosotros va en rojo y lo que depende del cliente en amarillo.
- **Llega al sidebar sin tocar nada más**: `borrador` ya estaba en `ESTADOS_ABIERTOS` y
  `compensacion` ya estaba en `COLS_AVISO` ⇒ la puerta angosta no se ensanchó.
- ⚠️ **El orden dentro de `alertasDe` es inobservable acá**: un `borrador` sin compensación no puede
  cumplir ninguna de las otras cuatro (la plata pide `compensacion`, las otras tres piden otro
  estado). Mover este `push` de lugar es un **mutante equivalente**, y está anotado para que la
  próxima tanda no lo persiga.

**Se construyó recién ahora a propósito**: hasta hoy la base tenía **10 reclamos de prueba**, 7 en
`borrador` desde el 28-jul, y la alerta habría nacido gritando sobre filas falsas. Las 10 se
borraron el 26-ago (respaldo en `~/Documents/devoluciones-bdi-respaldo-26ago2026.json`) ⇒ **BDI y
Zattia arrancan en cero**, y el primer aviso de éstos va a ser de un reclamo real.

**9 mutantes, 9 muertos** (el estado, el guard de `compensacion`, `created_at`→`updated_at`, `>=`→`>`,
el plazo 2→3 y 2→1, el tono, el `ts` desde `ahora`, y `dias` fijo).

## 🆕 La pantalla de decidir: tres pestañas, y el orden ES la regla (27-ago-2026)

Lo encontró Bruno decidiendo el **primer reclamo real de BDI**: *«esta sección no la entiendo»*. La
caja «¿Intentamos que se lo quede?» mostraba **$0**, los dos botones apagados, y abajo un aviso en
rojo pidiendo anotar qué contestó el cliente — retando por no registrar lo que no dejaba registrar.

### 🔴 El defecto de fondo: el dato se pedía DESPUÉS de la cuenta que lo usa

`DecidirReclamo` era una tira de 19 bloques, y **tres flechas iban de abajo hacia arriba**: el
`Envío de vuelta` y el `PVP de feria` —que fijan el techo de la retención— se cargaban 150 líneas
más abajo de esa caja, y el botón «Que vuelva» daba vuelta la etiqueta «se espera de vuelta» que
estaba arriba. Con los campos vacíos el techo era **siempre 0**.

⇒ **Las pestañas están ordenadas por el flujo del dato, ⛔ no por tema.** Antes de mover un bloque
de pestaña, mirar de dónde salen sus insumos:

| | qué contiene, en orden |
|---|---|
| **① Qué pasó** | fotos + `Lightbox` · relato · **la pregunta que decide** (en la falla, los botones de gravedad: *son* el escenario) · reclasificar · qué esperaba · alcance de la parcial · «¿qué recibió realmente?» de `mal_armado` |
| **② El producto** | los tres números → veredicto del retorno → **la oferta de retención** → «que vuelva / se lo queda» + la vía → **el destino de cada producto** |
| **③ El cliente** | la salida y sus ramas · «stock a corregir» de `mal_armado` · el aviso del envío de ida · el resumen |

⚠️ **«Stock a corregir» vive en ③ y ⛔ no al lado del buscador de ②**: su último insumo es la
`compensacion`, que se elige en ③. Donde estaba, mostraba una nota que todavía no podía ser cierta.

### 🔑 La oferta de retención se contesta sola

Adentro de esa caja hay **dos preguntas y sólo una es de la persona**:

| pregunta | quién |
|---|---|
| ¿Conviene ofrecer, y hasta cuánto? | **el sistema** — tiene precio, PVP de feria, envío y motivo |
| ¿Qué contestó el cliente? | **la persona** — es un hecho del mundo, no sale de ningún número |

El título dejó de preguntar (`Ofrecele que se lo quede` / `No conviene ofrecerle que se lo quede`).
⇒ **El veredicto vive en el núcleo**: `cuentaDescuento` devuelve `conviene` y `falta`, y la pantalla
⛔ no lo infiere mirando si el techo es cero. `falta` separa las **dos causas** de un
`conviene: false` —no hay nada que perder, o falta el PVP de feria—, porque sin eso «no conviene» se
lee como veredicto cuando en realidad es «todavía no se sabe».

Cuando no conviene, el campo y los botones **no están**, y con ellos se va el aviso en rojo. Queda
un link **«Se lo ofrecí igual»** que los revela: ⛔ la oferta que no se anota rompe la cuenta de
cuántas veces funciona la retención, que es para lo que existe la columna.

### 🔴 El cero que afirma, en el bloque de arriba

Mismo defecto, encontrado **mirando la pantalla renderizada** y no leyendo el código: con el envío
sin cargar, `convieneRetorno` compara lo recuperable contra **0** y contesta *«Conviene pedirlo»*
siempre. Ahora, con el campo vacío, no hay veredicto. ⚠️ **Un 0 TIPEADO sí es un dato** —es «la trae
al local»—, así que se mira `''` y ⛔ no `<= 0`: el `NumberField` guarda esa diferencia a propósito.

### La validación de cliente, y qué NO va en ella

`guardar` no tenía **un solo `if`**: mandaba y dejaba que el servidor rechazara por toast, sin decir
dónde. Ahora `faltantesDeLaDecision` (`tipos.ts`) contesta qué falta y **en qué pestaña**, y
`Confirmar` te lleva ahí. ⛔ El botón **no** se deshabilita: un botón apagado sin decir por qué es
el defecto que este módulo ya tuvo dos veces.

🔴 **⛔ NO agregarle los obligatorios del servidor.** Medido leyendo los dos lados: los dos que exige
`api/_reclamos.js:338-339` **son inalcanzables desde esta pantalla** — `compensacion` se deriva con
fallback a `opciones[0]` y nunca queda vacía, y `destinoDe` devuelve `null` sólo cuando no hay
producto en juego, que es justo el caso donde el servidor tampoco lo pide. Serían dos avisos que
nadie puede ver nunca.

Traban sólo dos cosas, las que dejan una fila incoherente: **media oferta de retención** (el texto
sale de `registroDeRetencion`, ⛔ no se reescribe) y una **parcial de $0**. El resto avisa.

### ⚠️ Una pestaña vacía ⛔ no es una pestaña incompleta

En una demora o una cancelación no hay producto en juego: ② lleva chip `—` y **no** «falta», y
**queda clickeable** — adentro está el porqué. Deshabilitarla escondería la única explicación de por
qué faltan campos, y un `title=` no se ve en un teléfono. Marcarla en rojo empuja a inventar un
destino con tal de cerrar, que es el defecto que este módulo ya tuvo: hasta el 25-ago-2026 **una
demora no se podía cerrar nunca**.

### Lo que quedó pendiente

- ▶️ **`PISO_RETORNO` está en `null`** (`tipos.ts`), o sea que se comporta como antes. Es un número
  de **política** —por debajo de cuánto no vale la pena traer un producto de vuelta— y lo tiene que
  dar Bruno, por marca. ⛔ Ponerlo desde acá sería inventar política.
- ▶️ **`cuentaDescuento` acepta `costoOperativo` y la pantalla nunca se lo pasa**, así que en todo
  caso sano el techo depende sólo del envío de vuelta. Subirlo **agranda las ofertas posibles**: no
  es un arreglo silencioso, se decide con Bruno.
- ⛔ **El archivo NO se partió en sub-componentes** (repo compartido, `AGENTS.md` pide coordinar los
  refactors grandes): las pestañas envuelven los bloques que ya estaban.

## 🆕 La retención ahora puede ser plata **o** cupón (27-ago-2026)

🔴 **VA CON MIGRACIÓN, y la migración va ANTES del deploy**:
`sql/migrate-reclamos-retencion-forma.sql`, en el Supabase de **BDI y el de ZATTIA**. `decidir`
escribe `retencion_forma` y sin la columna el `update` falla entero — o sea que no se podría decidir
**ningún** reclamo.

**Por qué hace falta la columna.** Hasta hoy la oferta era siempre plata, así que el monto alcanzaba.
Con dos formas, **un `acepto` por $6.500 en efectivo y uno por $6.500 en cupón salen iguales de la
base** y cuestan cosas distintas: la plata sale de la caja **hoy**, el cupón sale **sólo si el
cliente vuelve a comprar**. 🔑 Es el mismo agujero que `retencion_respuesta` tapó el 25-ago —
**existía el numerador y no el denominador**—, entrando por otra puerta.

⚠️ **NULL ⛔ no es «fue plata»: es SIN REGISTRAR.** 📊 Medido antes: BDI tiene 2 reclamos y Zattia 0,
y **ninguno** tiene retención registrada ⇒ no hay una sola oferta vieja ambigua.

### 🔴 Lo que destapó construirlo: aceptar un cupón caía en `plata_parcial`

`salidaAlAceptarRetencion(forma)` — en el núcleo, ⛔ no en la pantalla, porque de la resolución
cuelga `EFECTOS_RESOLUCION`. Con `plata_parcial` fijo, aceptar un cupón hacía **dos cosas mal a la
vez**:

1. **sacaba de la caja una plata que nunca salió** (`reintegro_estado: 'pendiente'`), y
2. **cerraba el reclamo sin que el cupón existiera** — `cupon` es la única resolución que deja
   `cupon_estado: 'pendiente'`, o sea el pendiente de **crearlo en la tienda**. Sin eso el cliente
   se entera en la próxima compra de que el código no anda.

Es el agujero de la promesa del cupón que el módulo ya tuvo, por otra puerta. El caso lo fija por la
**contracara**: sólo una de las dos formas pide emitir el cupón, y sólo la otra saca plata.

### En la pantalla

`Chips` para elegir la forma (el mismo control del alta). ⚠️ **Cambiar la forma con una respuesta ya
marcada la BORRA**: la respuesta era a la *otra* oferta, y dejarla puesta diría que aceptó algo que
no se le ofreció.

⚠️ **El default es `'plata'` y eso ⛔ no inventa nada**: es lo que la pantalla venía haciendo sin
decirlo. Y la forma **sola no registra**: sin respuesta, `registroDeRetencion` no escribe — si no,
cada reclamo que alguien abre y cierra quedaría con una oferta que nunca existió.

### ▶️ Lo que queda SIN definir, a propósito

**Cuánto vale el cupón frente al reembolso.** El resumen de la reunión decía ×2 ($6.500 contra
$13.000); Bruno lo dejó abierto — *«habría que definirlo según análisis económico»*. Hasta entonces
el monto **lo tipea la persona** y ⛔ no lo deriva nadie.

⚠️ **El costo de eso, dicho:** un número sin regla **no se puede medir**. Con el monto libre se puede
decir cuántas veces se ofreció cada forma y cuántas funcionó, pero ⛔ **no si el monto era el
correcto**. La columna es lo que va a permitir calcular la regla cuando se junten los casos.

## 🆕 Los destinos que no aplican, la logística y la preselección (27-ago-2026)

### `destinosDe`: la pantalla ofrecía los CINCO siempre

Se podía marcar **«Se perdió en el transporte»** sobre un producto que el cliente tenía en la mano,
o **«Nunca salió del depósito»** sobre uno que llegó. 🔑 La regla vive en `casos.core.js` con el
escenario **obligatorio**, como todo lo que deriva plata o stock — ⛔ no en el JSX:

```
sin producto en juego      → []                          (demora, cancelación)
la unidad nunca salió      → ['no_salio']                 (faltante, mal armado, sin stock)
salió y no llegó           → ['perdida']                  (no llegó nunca)
el cliente la tiene        → ['stock', 'falla', 'regalada']
```

🔴 **El invariante que lo ata a la realidad**: lo que sugiere `destinoDe` está **siempre** entre lo
que ofrece `destinosDe`. Hay un caso que lo recorre **motivo por motivo y escenario por escenario**,
con y sin retorno — si no, el desplegable arrancaría en un destino que él mismo no lista, que es el
defecto espejo del duplicado que se arregló esta mañana.

🔴 **`MOTIVOS_SIN_FALLA` es POLÍTICA, ⛔ no derivación**: ninguna bandera del perfil dice «acá no hay
defecto». En `arrepentimiento`, `no_esperaba` y `talle` el producto está sano por definición, y
ofrecer «Fallado» mete una unidad impecable en el ledger de Fallas valuada a PVP de feria — ensucia
el único número que dice cuánta plata se pierde en fallas de verdad. ⚠️ Si además vino con un
defecto, el camino es **`reclasificar`**, que conserva número, fotos e historial: esconder la opción
es lo que empuja a usarlo.

### La logística: quedan Correo y Andreani

`VIAS_VIGENTES` ⛔ **no es lo mismo que `VIA_LABEL`**: el mapa conserva las cuatro para que una fila
vieja se siga leyendo, y la lista es lo que se puede elegir hoy. 📊 **Medido antes de sacarlas: 0
filas** usaban `cadete` o `presencial`, en BDI y en Zattia.

⚠️ **Tiene una consecuencia y hay que saberla:** `presencial` era lo único que hacía que el reclamo
dijera *«Esperando que lo traiga»* en vez de inventar un envío. Sin ella **todo retorno cuesta
envío**, y el que quiere acercarse al local se resuelve como cambio de mostrador, fuera del circuito
de retornos. El código de las dos vías sigue vivo: volver a ofrecerlas es agregarlas a la lista.

⚠️ Y el desplegable **agrega la vía que ya tenía la fila** si dejó de ofrecerse, rotulada «(ya no se
ofrece)»: sin eso un reclamo viejo abre en blanco y el primer toque en otro campo se lo pisa sin que
nadie lo haya elegido. **Borrar una opción ⛔ no puede borrar el dato.**

⚠️ El ⓘ dejó de explicar «La trae al local»: un texto de ayuda que describe una opción que no está
es la forma más rápida de que nadie lea el resto.

▶️ **`VIAS_CAMBIO` (`ArmarCambio.tsx`) quedó como estaba** —`andreani`, `correo`, `cadete`—: un
cambio se arma en el mostrador y ahí el cadete existe. Falta que Bruno confirme si también sale.

### La preselección del alta

`preseleccionDelAlta(cuantos)`: con **uno** viene tildado, con **dos o más** hay que elegir. Venía
todo tildado siempre con la regla «casi siempre se devuelve todo» — cierta con un producto, y apenas
hay dos el default convierte **«no leí la lista» en «el cliente devuelve las dos cosas»**, que
después se paga o se anula en Gestión Nube. ⛔ No toca los casos de venta completa, donde los tildes
están bloqueados igual.

## 🆕 La vista del local: recorta, ⛔ no miente (27-ago-2026)

Lo más pedido en la revisión. 🔑 **El patrón ya existía y ⛔ no hizo falta inventar nada**: un
componente motor con `modo` y exports finos que la key de sección elige (`Devoluciones` /
`ReclamosLocal`). `DecidirReclamo` **ya era sólo de admin**, así que lo que había que recortar es el
alta y la lista, ⛔ no el modal.

**Qué deja de ver el local**

| se va | por qué |
|---|---|
| la columna **A devolver** | no decide cuánto vuelve, y el número delante invita a prometerlo en el mostrador |
| las tres líneas de plata del resumen | ídem: lo que se devuelve, la oferta de retención y lo que nos costó |
| **Qué se encontró** (el escenario) | es la mitad de lo que decide la plata; verlo invita a discutir el veredicto con el cliente |

⚠️ **Lo que queda alcanza para contestarle al cliente**: el caso, qué recibe, qué pasa con el
producto, si se pidió que vuelva. Recortar eso también dejaría la pantalla sin servir para lo único
que el local hace con ella.

🔑 **`resumenDeLoDecidido(d, quien)` — el segundo parámetro es OBLIGATORIO**, igual que el escenario
en `decidir`. Con default seguro el llamador contesta sin enterarse de que le faltaba el dato, y acá
el dato decide si en la pantalla del local aparece cuánta plata perdimos. Volverlo obligatorio hizo
que el compilador listara solo el punto que había que decidir.

⚠️ **Recortar ⛔ no es poner en cero**: un `$0` afirmaría que el caso no costó nada. Las líneas no
están.

**«¿Qué esperaba?» pasa a botones.** `Chips` **ya estaba en el kit** — cero componentes nuevos, 5ª
vez que el pedido ya estaba construido. ⚠️ Las opciones siguen saliendo de `expectativasDe(motivo)`
y ⛔ **no** son una lista fija: ofrecer «el mismo producto en buen estado» en un arrepentimiento no
significa nada, y eso ya se arregló una vez.

🔴 **Un caso nació verde por vacío.** El primer intento del test del escenario usaba
`motivo: 'falla'` con `escenario: 'coincide'`, que ⛔ no es escenario de ese caso ⇒ `escenarioDe`
daba `null` y la línea nunca existía: el `not.toContain` pasaba sin probar nada. Lo cazó el mutante.
Ahora el caso lleva **el control por el otro lado** (mirado por Administración, la línea SÍ está).

## 🆕 Rótulos y orden de pestañas (27-ago-2026, revisión con Administración)

**Post-venta ahora abre en Reclamos.** El orden pasó a **Reclamos → Fallas → Cambios → Canjes**, y
🔑 **el aterrizaje sale del orden** (`ABRE_POR_DEFECTO = TABS[0].key`): tenerlo escrito aparte era
cómo el primer tab y el que abre podían quedar diciendo cosas distintas. ⚠️ `?tab=fallas` sigue
funcionando — dejó de ser el default, ⛔ no dejó de existir. Los cuatro casos de
`tests/postventa-tab.test.ts` y `tests/postventa-pantalla.test.tsx` se tocaron **a propósito**.
🔴 El invariante que ⛔ no se rompe: la URL que arma el aviso del sidebar (`?tab=reclamos`) es la que
la pantalla abre.

**Los rótulos.** Los viejos describían el circuito; los nuevos dicen **en qué estado queda**:

| clave | antes | ahora |
|---|---|---|
| `stock` | Vuelve y se revende | **Disponible para venta** |
| `falla` | Vuelve como falla (no se revende) | **Fallado** |
| `regalada` | Se la queda el cliente — sana, sale del stock | **Sale de stock** |

🔴 **Sin género ni sujeto**: «Se **la** queda el cliente» y la clave `regalada` son femeninos por
«prenda», y en BDI son fundas.

Y en los casos: `Sin stock` · `No recibido` · `Demoras` · `Excedente en el pedido` · `Mal armado` ·
`Faltante` · `Fallado` · `Talle`.

🔴 **`DESTINO_LABEL` es sólo presentación; `MOTIVO_LABEL` NO.** El motivo se escribe literal en dos
lugares que quedan fuera de este repo: la nota que viaja a Gestión Nube como `comments` de la venta
técnica (`nota.ts`), y el `historial` de la fila al reclasificar. ⇒ Renombrar ⛔ no toca lo ya
escrito: las notas viejas conservan el rótulo viejo.

🔑 **`sin_stock` va en ROJO en la lista** (`MOTIVOS_EN_ROJO`, en `tipos.ts` y ⛔ no en el JSX). Es el
único caso del repertorio que ⛔ no lo trae el cliente ni el transporte: **le vendimos algo que no
teníamos**. Los otros diez son cosas que pasan; éste es un error nuestro y evitable.

⚠️ **Ningún test fija el TEXTO de los rótulos, a propósito.** Un test que compara la cadena es un
candado, no un oráculo: se pone rojo cuando alguien mejora la redacción y no dice nada cuando el
rótulo deja de significar lo que dice. El caso del resumen mira **la línea entera**
(`'El producto: ' + DESTINO_LABEL.falla`), o sea que el resumen cuente qué pasó con el producto.

## 🆕 «Volver a decidir» se cierra con el primer pendiente ejecutado (27-ago-2026)

El 27-ago salió «Volver a decidir» para destrabar una decisión apurada, y salió **sin ningún
freno**: `puedeRehacerseLaDecision` decía que sí para *cualquier* reclamo ya decidido, y `decidir`
(`api/_reclamos.js`) ⛔ no tenía guard de estado. O sea que una decisión **en curso** se podía pisar.

🔴 **Por qué importa:** rehacer vuelve a pasar por `pendientesDe`, así que **un pendiente tildado
vuelve a `pendiente`**. La plata que ya se devolvió aparece otra vez como si no se hubiera devuelto,
y la venta que ya se anuló en Gestión Nube vuelve a pedir que la anulen. Nadie se entera: son
columnas, no plata que se mueve.

**La regla, y dónde vive.** `loEjecutado` (`lib/reclamos/efectos.core.js`) devuelve **en criollo** lo
que la decisión ya mandó a hacer y alguien hizo. Vacío ⇒ se puede rehacer.

| qué mira | por qué |
|---|---|
| las **seis** columnas que `pendientesDe` pisa | son exactamente las que rehacer destildaría |
| el producto que **ya volvió** (`recibida_at`) | pasó en el mundo, no en la fila |
| el que **ya se descontó** de GN (`baja_at`) | idem |

⛔ **`tn_stock_estado` y `reclamo_correo_estado` NO entran.** La primera se decide en el alta; la
segunda corre en paralelo y `decidir` ya respeta su `'hecho'` a propósito ⇒ **rehacer no las pierde**,
así que ninguna de las dos puede cerrar la puerta. Meterlas sería congelar decisiones por algo que
rehacerlas no rompe. Hay un caso de test que se pone rojo si alguna se cuela.

🔑 **El invariante que se testea**: `loEjecutado` cubre **todas** las claves que devuelve
`pendientesDe`, ni una de menos. Agregar una columna allá y olvidarla acá reabre el agujero — es el
mismo modo de falla de las dos listas escritas a mano que `EFECTOS_RESOLUCION` vino a reemplazar.

🔑 **El botón se va, pero DICE por qué.** En su lugar queda *«ya no se puede rehacer: ya se le
devolvió la plata»*. Un botón que desaparece callado es el defecto que este módulo ya tuvo dos veces.

🔴 **Y el freno está en el SERVIDOR, no sólo en la pantalla.** `decidir` responde **409** con la
lista. Una pantalla que esconde un botón no es una regla: es una sugerencia.

## 🆕 🔴 Rehacer una decisión: el bucle de R-0022 (27-ago-2026)

Bruno, con el reclamo real ya decidido: *«pongo volver a decidir, confirmo el primer paso, y cuando
salgo sigue diciendo volver a decidir»*.

**La pantalla no estaba rota, y ése es el punto.** R-0022 quedó decidido como **cambio**, y un
cambio decidido vuelve a `borrador` a propósito (lo termina el POS). Al reabrirlo, `pasoGuardado`
miraba `compensacion != null` y marcaba **«El cliente» con un ✓**: el único paso que decide se leía
como **ya hecho**. La única pestaña en rojo era «El producto». O sea que confirmar esa pestaña y
salir era **literalmente lo que la pantalla estaba pidiendo** — y `Confirmar paso` escribe por
`editar`, que ⛔ no decide. La fila salía igual que entró, con su botón intacto. Otra vuelta, y otra.

🔑 **La regla que lo cierra: el ✓ sale de lo que ESTE recorrido escribió.** Los pasos ① y ② los
reescribe «Confirmar paso», así que su tilde sigue siendo cierto al rehacer — el valor de la base es
el mismo que se está por reguardar. El ③ ⛔ **no lo escribe nadie más que «Confirmar la decisión»**.
Por eso `pasoGuardado` pide un tercer parámetro **obligatorio**, `rehaciendo`: sin default, un
llamador que no lo conteste no puede volver a caer en el mismo agujero sin enterarse.

| lo que cambió | por qué |
|---|---|
| el ✓ de «El cliente» ⛔ no sale de la decisión vieja | era el motor del bucle |
| un aviso arriba de las TRES pestañas | el defecto fue que nunca llegó a la tercera |
| el aviso **nombra** la resolución que sigue valiendo | «ya está decidido» solo ⛔ no dice cómo |
| el toast de «Confirmar paso» al rehacer | decía *«podés salir y seguir después»*: cierto en una decisión nueva, engañoso al rehacer |
| el botón final se llama «Volver a decidir» | la persona vino a rehacerla, ⛔ no a confirmarla |

⚠️ **Lo que el aviso también dice, y hay que seguir diciendo:** los pasos ① y ② **sí escriben en la
fila**. Salir a la mitad ⛔ no pierde lo cargado, pero tampoco reemplaza la resolución — y sin esa
mitad, «guardado» y «decidido» se leen igual.

🔴 **Y el mismo día, medio centímetro al lado: `retencion_forma` viajaba en el núcleo pero ⛔ en
ninguno de los dos payloads.** `registroDeRetencion` la volvió obligatoria (la tercera mitad de la
oferta) y ni `confirmarPaso` ni `guardar` la mandaban ⇒ **cualquier reclamo con una oferta
registrada iba a volver 400** al confirmar el paso y al confirmar la decisión. Los 288 tests del
módulo pasaban: los dos payloads se arman **en el componente**, y ningún test los miraba. El de
ahora ⛔ no compara la clave contra una lista escrita a mano — le pasa el payload a
`registroDeRetencion`, **la misma función que corre en el servidor**.

## 🆕 🔴 El paso ② se dio vuelta: la pregunta antes que la calculadora (27-ago-2026)

Segunda tanda del mismo día, y las tres cosas que se arreglaron son **la misma**: *la pantalla
elegía por la persona y después le pedía que confirmara lo que ella no eligió*.

### «No puedo salir del envío»

Con el envío de vuelta sin cargar, `convieneRetorno` compara lo recuperable contra **0** y contesta
«conviene pedirlo» **siempre**. Y el default del retorno salía de ahí
(`pedirRetorno ?? cuenta.conviene`) ⇒ la pantalla llegaba a la pregunta **con la respuesta ya
puesta en «que vuelva»**, mostraba la vía, pedía el envío, y la pestaña quedaba en «falta» para
siempre. No había forma de salir sin desarmar a mano un pedido de retorno que nadie pidió.

🔑 **El default correcto es el otro, y es una regla del negocio, ⛔ no una cuenta**: *«aunque el
producto esté bien y pueda venderse, también es un quilombo de logística»* (Bruno). La sugerencia de
`convieneRetorno` se sigue mostrando —el pill «va contra la sugerencia»— y se sigue guardando en
`retorno_sugerido`, que es el registro de cuándo se fue en contra. Lo que dejó de hacer es elegir.

⚠️ **Efecto de borde:** `destino` sale de `destinoDe(motivo, retorno, escenario)`, así que el destino
por defecto pasó de `stock` a `regalada`. Es lo correcto —decir «vuelve a stock» sobre algo que se
queda el cliente cuenta la unidad dos veces— y está fijado en el caso de punta a punta.

### El orden nuevo, y por qué el comentario viejo ya no aplica

```
¿Qué pasa con el producto?   [ Se lo queda ]  [ Que vuelva ]
  ├─ Se lo queda → Calculadora de retención  (el envío se pregunta ACÁ ADENTRO,
  │                como «¿cuánto nos saldría traerlo?»)
  └─ Que vuelva  → ¿Cómo vuelve? + Envío de vuelta + el veredicto de la cuenta
```

🔑 **`envioVuelta` es el MISMO estado en las dos ramas**; lo que cambia es el rótulo, porque cambia
para qué se pregunta: en una es **el techo de lo que se le puede ofrecer**, en la otra es **plata
que se va a gastar**.

Hasta hoy la caja de la oferta tenía que ir **debajo** de los números sueltos, y estaba comentado:
puesta encima, su techo daba siempre 0. Meter el insumo adentro de la calculadora **vuelve ese
defecto imposible por construcción** ⇒ el comentario se reescribió, ⛔ no se borró, y el test que
fijaba «el envío ARRIBA de la caja» se reemplazó por la invariante nueva (**la pregunta arriba de la
calculadora**).

### La salida vieja ⛔ no viene cargada

`compensacionElegida` arrancaba en `reclamo.compensacion`, así que al rehacer **el botón del pie la
re-confirmaba sola**: apretar el botón que promete cambiar la decisión la dejaba donde estaba.
Bruno: *«no puede tener una opción predeterminada cargada, porque sino ponemos confirmar y no se
eligió»*.

Es la **misma regla** que ya regía para las decisiones nuevas (la opción vacía deliberada), entrando
por la otra puerta. El dato ⛔ no se pierde: la salida de hoy se muestra **como texto** al lado del
desplegable. **Mostrarla es informar; dejarla cargada en el control es elegir por la persona.**

### Dos más, chicas y del mismo día

- **El modal abre en el primer paso que NO está guardado** (`pasoGuardado`), y en `'cliente'` si
  están los tres — es donde quiere estar quien entró a rehacer.
- 🔴 **El botón del pie dejó de llamarse «Volver a decidir»**, que es el nombre del botón de la
  **fila**. Con los dos iguales, se apretaba el de la lista, se abría el modal y parecía hecho:
  *«aprieto volver a decidir y sigue apareciendo volver a decidir»*. La regresión la había
  introducido esta misma mañana el renombre *«para que se llame como el gesto»* — el gesto es
  **abrir**; el del pie **guarda**. Ahora dice **«Guardar la nueva decisión»**.

### «Piso» salió de la pantalla

Estaba en `null` en BDI y en Zattia **desde que existe**, o sea que nunca cambió una cuenta; lo que
sí hacía era ocupar un campo vacío que nadie sabía qué era (*«¿Qué es Piso?»*). La regla sigue viva
en el núcleo (`PISO_RETORNO` + su rama en `convieneRetorno`, con sus tests): es política —por debajo
de cuánto no vale la pena traer un producto— y la tiene que dar Bruno, por marca.

⚠️ Y el «falta» del envío pasó a decir **para qué es** el número
(*«cuánto saldría traerlo (define hasta cuánto podés ofrecerle)»*): sigue en `bloquea: false` —
nunca trabó el guardado— pero con el rótulo viejo un chip naranja permanente se leía como un
impedimento.

## 🆕 🔴 «Volver a decidir» ahora SUELTA la decisión (27-ago-2026)

Tercera tanda del mismo día, y la que cierra el bucle de verdad.

**El problema no era el botón: faltaba un estado.** «Volver a decidir» sólo abría la pantalla. La
resolución vieja seguía en la fila, el reclamo seguía en Cambios, y el botón seguía diciendo
«Volver a decidir» ⇒ **apretarlo se veía exactamente igual que no apretarlo nunca**. Bruno lo dio
tres veces con R-0022 y concluyó, con razón, que no funcionaba: *«si volvés a decidir, que quede
libre la decisión»*.

Y al lado, el segundo pedido, que es la otra mitad de lo mismo: *«a veces el análisis puede ser
parcial, puede ser que termine el primer paso, pero después sigo más tarde»*. **Una decisión a
medio hacer es un estado real del negocio y el sistema no lo representaba en ningún lado.**

### `liberar-decision` (`api/_reclamos.js`)

🔑 **Suelta la RESOLUCIÓN, ⛔ no el análisis.** Se van `compensacion` y los seis pendientes que
cuelgan de ella; se quedan el escenario, el costo de traerlo, los destinos por producto, los montos
y la oferta de retención. Eso es exactamente lo que permite soltar hoy y seguir mañana.

🔴 **Los pendientes se apagan con `pendientesDe({ compensacion: null })`, ⛔ no a mano.** Es la
misma función que los prende. Apagarlos a mano sería la segunda lista escrita a mano que
`EFECTOS_RESOLUCION` vino a eliminar: el día que se agregue un pendiente nuevo, soltar la decisión
lo dejaría encendido colgando de una resolución borrada, y nadie podría tildarlo nunca. Hay un test
que se pone rojo si las claves de las dos llamadas dejan de coincidir.

🔴 **Y el mismo freno que `decidir`**: si `loEjecutado` no está vacía, responde **409**. Soltar una
decisión cuya plata ya salió dejaría el reintegro hecho colgando de algo que ya no existe.

⚠️ **Vuelve a `en_revision`, ⛔ no a `borrador`.** La evidencia ya está; lo que falta es decidir. Y
es el estado que enciende el reloj de «esperando una decisión» a los 3 días — que es justo lo que
corresponde para una decisión soltada y no terminada.

### El botón de la fila dice DÓNDE ESTÁ EL TRABAJO

| situación | botón |
|---|---|
| sin decidir, nada cargado | **Decidir** |
| sin decidir, con pasos guardados | **Continuar — 2 de 3** |
| decidido | **Volver a decidir** (suelta y abre) |

`botonDecidir` (`tipos.ts`) cuenta pasos **guardados** con `pasoGuardado`, que es lo único que se
puede afirmar mirando la fila. ⚠️ Pasa `rehaciendo: false` a propósito: un reclamo sin decidir ⛔ no
está rehaciendo nada, y con `true` el paso que decide no contaría nunca y el botón se quedaría
clavado en «2 de 3».

⇒ Apretar «Volver a decidir» ahora **cambia la fila a la vista**: sale de Cambios y el botón pasa a
«Continuar». Que era, literalmente, lo único que Bruno pedía para saber que había pasado algo.

🔑 **`PASOS_DECISION` es la fuente única del orden**, porque ahora lo leen dos lugares: la pantalla
(las pestañas y dónde abrir) y `botonDecidir` (para contar). Estaba escrito dos veces.

⚠️ Al abrir después de soltar, la pantalla recibe la fila **ya liberada** (`compensacion: null`), no
la de antes: si no, mostraría *«este reclamo ya está decidido»* sobre algo que se acaba de soltar.

## 🆕 🔴 Confirmar un paso afirma lo que la pantalla MUESTRA (27-ago-2026)

`confirmarPaso` escribía `retorno_decidido` **sólo si alguien apretaba uno de los dos botones**
(`if (pedirRetorno !== null)`). Mientras el default salía de la cuenta eso pasaba desapercibido; con
el default en **«se lo queda»** tiene una consecuencia silenciosa y cara:

1. La pantalla muestra «Se lo queda» y la persona lo acepta sin tocarlo.
2. Guarda el paso ⇒ se escribe `envio_costo`, **⛔ no `retorno_decidido`**.
3. Al reabrir, `pedirRetorno` se restaura de la fila —que ahora tiene `envio_costo` cargado— y ahí
   gana el `retorno_decidido: true` de la **decisión vieja**.
4. La pantalla vuelve a decir «Que vuelva», y el envío se suma al costo del caso.

📊 Medido en R-0022: el caso pasó a costar **$27.182** (los $20.682 que pagó más $6.500 de envío)
sobre una resolución donde el producto ⛔ no vuelve.

🔑 **La regla: un default que nadie contradijo ES una respuesta.** Confirmar un paso es afirmar lo
que está en pantalla; dejar sin escribir lo que no se tocó es exactamente lo que hace que la fila
diga una cosa y la pantalla otra. Es el mismo modo de falla que el ✓ que salía de la decisión vieja
y que la Salida que venía preseleccionada — **tres veces el mismo día, por tres puertas distintas**.

⚠️ El test tiene las dos mitades: que el default aceptado se guarde como `false`, y que elegir «Que
vuelva» guarde `true` con su vía. Sin la segunda, guardar `false` a ciegas pasaría igual.

## 🆕 🔴 Sin resolución no sale mercadería del depósito (27-ago-2026)

«Descontar lo que se queda» —el botón que **crea la venta técnica en GN y saca el producto del
depósito**— aparecía sobre reclamos **todavía sin decidir**.

📊 **Medido** contra `unidades.core.js` con la fila real de R-0022:

```
compensacion: null            → ["TEMPLADO","CHELSEA"]   ← el botón aparecía
compensacion: 'plata_parcial' → ["TEMPLADO","CHELSEA"]
```

🔑 **Por qué se rompió justo ese día, y por qué el gate viejo no era un descuido.** La condición
miraba `loQueFaltaDescontar`, que necesita `destino_prenda: 'regalada'` — y ese campo lo escribía
**sólo `decidir`**. O sea que *«tener el destino»* y *«estar decidido»* eran lo mismo, y pedir las
dos cosas habría sido redundante. Ese día «Confirmar paso» empezó a guardar el destino por `editar`,
para poder analizar un reclamo en varias sentadas ⇒ **el campo pasó a existir antes que la
decisión**, y el botón se adelantó.

⇒ **La regla que queda escrita:** *un botón que mueve algo del mundo real —stock, plata, un envío—
se gatea por la RESOLUCIÓN, ⛔ nunca por un campo que la decisión todavía no confirmó.* Es la misma
familia que el ✓ que salía de la decisión vieja y la Salida preseleccionada: **un dato que existe
⛔ no es una decisión tomada.**

### Dónde vive cada mitad, y por qué ⛔ no en el mismo lugar

- **El freno** está en `descontado` (`api/_reclamos.js`): **409** si no hay `compensacion`. Una
  pantalla que esconde un botón es una sugerencia, no una regla.
- **`loQueFaltaDescontar` ⛔ NO se tocó**, y hay un test que lo fija. Es una pregunta de
  **inventario** —qué quedó en poder del cliente sin descontar— y la leen cuatro lugares con
  sentidos distintos: el botón, `faltantesParaCerrar`, el sellado de las bajas y el propio guard.
  Meterle la resolución adentro cambiaría en silencio el significado de los otros tres, y
  `faltantesParaCerrar` pasaría a decir que no falta descontar nada.

## Cómo se prueba

`npx vitest run tests/reclamos.test.ts --reporter=dot` — es el único lugar del módulo con tests
exhaustivos, porque **acá vive la plata** y un error no rompe ninguna pantalla: se ve recién en la
caja o en el stock.

`npx vitest run tests/reclamos-redecidir.test.tsx` — **rehacer** una decisión. Incluye **el
recorrido de R-0022 de punta a punta**, que es la única prueba que verifica que la pantalla, tal
como abre, deje llegar a `decidir` con la resolución acordada: cada paso del test es un click real,
en el mismo orden. Monta la pantalla
dentro de un `ToastProvider` **de verdad**: fuera de él `useToast` es un no-op, así que un test del
aviso sin proveedor pasaría verde contra una pantalla que no dice nada. El fixture es la **fila real
de producción** (R-0022, copiada de la base): un inventado no habría tenido lo que arma el bucle
—`escenario` cargado, `envio_costo` en null y `compensacion` puesta—.

`npx vitest run tests/reclamos-decidir-pestanas.test.tsx` — la pantalla de decidir. **Monta el
componente de verdad** (`createRoot` + `act`) y ⛔ no usa `renderToStaticMarkup`: `Modal` usa un
portal y el renderer de servidor tira *«Portals are not currently supported by the server
renderer»*. El oráculo de qué pestaña está abierta es `aria-selected="true"`. Fija, entre otras
cosas, que **el envío de vuelta esté ARRIBA de la caja de la oferta** (`compareDocumentPosition`):
si alguien invierte el orden otra vez, ese test es el que se pone rojo.

`npx vitest run tests/notificaciones.test.ts tests/postventa-tab.test.ts tests/postventa-pantalla.test.tsx --reporter=dot`
— el aviso del sidebar. ⚠️ `postventa-pantalla` es de los pocos `.tsx` del repo y **el único en
`jsdom`**: `useFiltroUrl` lee `window.location.search`, y sin `window` devolvería siempre el inicial
y el test no podría distinguir el arreglo del defecto.

Lo que los tests **no** cubren y hay que ejercer a mano:

- **Crear la venta en GN.** `api/crear-venta.js` pega a PROD. Se prueba con una venta real y se
  borra después; las de prueba viejas de BDI están anotadas en la memoria del proyecto.
- **El portal del cliente** (`/reclamo/<token>`): que el link llegue, que suba fotos, y que el token
  venza. Nada de eso pasa por la app logueada.
- **Los pendientes en la pantalla.** Los tests fijan `pendientesDe()`; que la columna los muestre y
  que tildarlos escriba (acción `pendiente` del handler) se camina en Reclamos con una fila real.

## 🆕 Los mensajes de la fila salen de una regla, ⛔ no de condiciones sueltas (27-ago-2026)

Bruno, con el módulo ya en uso: *«tiene que haber un mensaje para cada estado, y tienen que dejar de
estar botones que no sirven en cada estado»*, y el motivo es más grande que el orden de la pantalla:
*«para que pueda ejecutar la comunicación el local sin pensar o preguntar»*.

**El caso concreto**: en `en_revision` —que significa literalmente *«el cliente ya cargó las
fotos»*— el único botón que le aparecía al local era **«Msj: pedir fotos»**, sobre alguien que ya
las había mandado. *«Si ya cargó fotos, y estamos en la parte de decisión, no hay más fotos que
cargar»*.

**Dónde vive ahora**: `lib/reclamos/botones.ts` → `mensajesDeLaFila(d)`, que devuelve la **lista
cerrada** de qué mensajes corresponden en ese momento (`pedir_fotos · mas_fotos · resolucion ·
etiqueta · plata_enviada`). `Reclamos.tsx` sólo dibuja lo que esa lista dice. Ahí se mudó también
`ESTADOS_CON_LINK`, que era una const local de la pantalla.

🔑 **El criterio de aceptación ⛔ no es «que exista el mensaje»**: es que en cada momento estén
**exactamente los que corresponden, ni uno de más**. Un botón que no aplica cuesta lo mismo que uno
que falta — los dos obligan a decidir a alguien que no tendría que estar decidiendo nada. Por eso
los tests se escriben **por momento** y afirman las dos mitades, qué hay y qué ⛔ no
(`tests/reclamos-mensajes-por-momento.test.ts`, comparando la lista entera y no con `toContain`).

**Las tres preguntas de `pedir_fotos`**, y las tres hacían falta:

1. **El link vivo Y el reclamo sin decidir.** ⛔ No son lo mismo: fuera de los tres estados abiertos
   el portal contesta 404, pero **un cambio decidido vuelve a `borrador` a propósito** (lo termina
   el POS) ⇒ mirando sólo el estado, el caso ya resuelto **volvía a ofrecer el link del cliente**.
2. **Que el caso pida fotos** (`pideFotos`). El alta ya avisaba *«acá no hacen falta fotos»* en
   `no_llego`, `demora` y `sin_stock`, y la lista lo contradecía ofreciendo el mensaje igual.
3. **Que no haya llegado ninguna.** Con fotos adentro, el pedido ya se cumplió.

🔑 **La escapatoria se resolvió, ⛔ no se ignoró**: a veces sí hacen falta más fotos. Eso es
`mas_fotos`, y vive **en el detalle de la fila** —el mismo link y el mismo mensaje—, que es adonde
va quien está mirando las que hay y concluye que no alcanzan. La columna de acciones es la de «qué
toca ahora»; el pedido de más fotos es una decisión, y va donde se toma.

⚠️ **Dos tests, y el segundo es el que este módulo ya perdió dos veces**:
`reclamos-mensajes-por-momento` fija la regla (4 mutantes probados, 4 muertos) y
**`tests/reclamos-lista-mensajes.test.tsx` fija el CABLE**: monta la lista con filas mockeadas y
mira los rótulos **dibujados**. Sin él, alguien puede volver a escribir la condición a mano en el
JSX con la regla y sus tests en verde — que es exactamente de donde salió el defecto.

### 🔴 Querer un cambio ⛔ ya no apaga el pedido de fotos (corrección de Bruno, mismo día)

*«La de que quiere cambiar la prenda, si es con envío, sí necesitamos fotos para ver el estado de la
prenda»*. `pideFotos` tenía escrita la premisa contraria —*«si lo quiere cambiar, lo trae al
mostrador y se ve ahí»*— y es **falsa para esta lista**: por Reclamos entran **órdenes online**, o
sea que la prenda **viaja** igual; el cambio de mostrador se arma en la pestaña Cambios y ⛔ nunca
llama a esta función. 🔴 **Era el único camino por el que una prenda volvía sin que nadie la hubiera
visto.**

- `pideFotos` pasa a mirar **sólo el motivo**: `PERFIL_MOTIVO[m].fotos !== 'nunca'`.
- ⚠️ Con eso **`si_quiere_plata` quedó equivalente a `siempre`**, y se deja en los perfiles a
  propósito: la distinción vuelve a tener sentido el día que exista *«la trae al local»*, y ese día
  se decide **por la VÍA del retorno, ⛔ no por la expectativa** — la expectativa nunca dijo si la
  prenda viaja.
- **El alta también cambió**: con `otro_producto` el cartel mandaba a Cambios **en vez** de copiar
  el link. Ahora copia el link igual y lo de Cambios lo dice **además**, ⛔ no en lugar de.
- ⚠️ **El test viejo afirmaba la premisa vieja** (`tests/reclamos.test.ts`, bloque `pideFotos`:
  *«talle y arrepentimiento: sólo si quiere la plata»*). Una premisa escrita y nunca medida se
  defiende sola hasta que alguien que usa la app la contradice.

🏁 **El mensaje de la propuesta ya existe** (28-ago-2026) — abajo, en su propia sección.

## 🔴 Cómo verificar un deploy de ESTA sección (27-ago-2026)

**Los 18 chunks que trae `/postventa` ⛔ NO incluyen el de Reclamos.** `Devoluciones` entra por
`dynamic()`, así que su chunk se pide recién al abrir la pestaña: buscar una cadena de
`Reclamos.tsx` o de `DecidirReclamo.tsx` en la lista inicial da **«no está» siempre**, deployado o
no. Pasó el 27-ago y casi manda a re-deployar algo que ya estaba.

Lo que sirve, en tres pasos:

1. Bajar los 18 chunks que **sí** vienen en el HTML de `/postventa`.
2. Sacar de adentro de ellos las **rutas** de chunk que referencian y bajarlas también, en cascada
   hasta que no aparezcan nuevas: son **118** en total, y ahí está el de Reclamos.
3. Buscar el oráculo **y una cadena de CONTROL que ya estaba en prod**, y verificar que la del
   oráculo sea **única contra `<commit>^`** (`git grep -c -F "…" <commit>^`).

🔴 **Dos detalles del paso 2 que costaron dos corridas en falso el 27-ago**, las dos con el mismo
síntoma —«0 chunks, no está deployado»— sobre un deploy que **ya estaba**:

- La carpeta es **`/_next/static/immutable/chunks/`**, ⛔ no `/_next/static/chunks/`.
- Las referencias son **rutas** (`static/immutable/chunks/xxx.js`), ⛔ no nombres sueltos
  entrecomillados, y los nombres llevan `-` y `.`. La regex que sirve:
  `/static\/immutable\/chunks\/[a-zA-Z0-9_.-]+\.js/g`.

🔑 **Y por eso el CONTROL ⛔ no es opcional**: las dos veces el oráculo dio 0, y las dos veces la que
avisó de que el crawl no había llegado a ningún lado fue la cadena de control, que también daba 0.
Sin ella se re-deploya algo que ya está, o peor: se da por bueno un negativo que no significa nada.
El crawl que anduvo quedó en `scripts/verificar-deploy-reclamos.mjs`.

⚠️ Un cambio que sólo toca `lib/reclamos/tipos.ts` **sí** cae en un chunk eager (ahí vive también
`efectos.core.js`), pero sólo si agrega una **cadena**: los comentarios se minifican y no sirven de
oráculo.

## 🆕 «Le ofrecí y todavía no contestó» pasó a ser un ESTADO (27-ago-2026)

🔴 **VA CON MIGRACIÓN, y la migración va ANTES del deploy**:
`sql/migrate-reclamos-retencion-at.sql` (`node scripts/apply-devoluciones.mjs`), en el Supabase de
**BDI y el de ZATTIA**. `retencion_at` entró en `COLS`, o sea en el `select` que **lista** los
reclamos: sin la columna PostgREST contesta 42703 y **la pantalla de Postventa queda vacía entera**.
Es lo mismo que pasó con `retencion_forma` esta misma mañana.

**El bloqueo que saca.** `registroDeRetencion` (`casos.core.js`) exigía monto, forma y respuesta
**las tres juntas**, así que *«le ofrecí $13.491 y todavía no sé qué dijo»* era un **error de
validación**: con la propuesta mandada, la decisión ⛔ no se podía guardar hasta que el cliente
contestara. Y ése es el momento en el que el reclamo pasa la mayor parte del tiempo — Administración
arma la propuesta, el local la manda, la respuesta llega al día siguiente y capaz la trae otra
persona.

🔑 **La regla vieja confundía dos cosas**, y por eso se rompía justo ahí:

| | qué significa | qué se guarda |
|---|---|---|
| nada registrado | ⛔ no sabemos si hubo oferta | `{}` — ⛔ no se toca nada |
| **oferta hecha, sin respuesta** | se la mandamos y esperamos | monto + forma + `retencion_at`, respuesta en `null` |
| oferta contestada | `acepto` / `rechazo` | las tres, y la fecha de cuando se hizo |

El denominador de «cuántas veces funciona» sale de la **oferta HECHA**, ⛔ no de la contestada:
registrar la que todavía no volvió no ensucia la cuenta, la completa. Lo que **sigue** siendo error
es la mitad de al lado: una respuesta **sin** monto («no aceptó» ⛔ qué).

### La oferta hay que AFIRMARLA: es un botón, ⛔ no un default

En la calculadora hay un tercer botón, **«Se la mandé: esperando»**, al lado de «Aceptó» y «No
aceptó». ⛔ No se deduce de que haya un monto en la caja: `montoOferta` **arranca en lo que sugiere
la cuenta**, así que abrir la calculadora ya deja un número en pantalla, y guardarlo como oferta
hecha registraría propuestas que nadie mandó — que después se cuentan en el denominador. Es la misma
clase de defecto que la salida preseleccionada de esta mañana: *una pantalla que no pregunta igual
afirma*.

### `retencion_at`: el reloj se cuenta desde el EVENTO

Al poder existir una oferta esperando, aparece la pregunta que antes no existía: **hace cuánto**.

- 🔴 **`updated_at` ⛔ no la contesta.** Lo pisa cualquier toque, y el toque más probable sobre una
  oferta que no vuelve es ir a ver por qué no vuelve ⇒ **ocuparse del caso apagaría la alarma**. Es
  el mismo defecto que ya tuvo la alerta de tránsito y que arregló `desdeQueEsta`.
- 🔑 **Se sella UNA sola vez** (`retencionAt || ahora`): volver a guardar el paso, rehacer la
  decisión o **subir el monto** ⛔ no reinician el reloj. Lo que se mide es hace cuánto que se
  espera una respuesta, ⛔ no hace cuánto que se dijo el último número.
- ⚠️ Una oferta **sin fecha** (fila anterior a la columna) se ve en el resumen y en la lista pero
  ⛔ no dispara el reloj: `diasEsperandoLaOferta` devuelve 0. Inventarle `created_at` sería afirmar
  una espera que nadie midió.
- ⚠️ **`ahora: null` = sólo estoy validando**, y es lo que manda la pantalla desde
  `faltantesDeLaDecision`. La clave ⛔ no viaja nunca en `null`: un `update` con
  `retencion_at: null` **borraría** la fecha de la oferta que estaba esperando.

**La alerta nueva** (`alertasDe`) es el único reloj del módulo que corre sobre un reclamo que puede
estar **ya decidido**: se ofreció, se guardó la salida por si dice que no, y el caso queda quieto.
`sinDecidir` y `plata` ⛔ no lo agarran, porque desde su punto de vista está todo hecho.
▶️ **`DIAS_ALERTA.oferta = 3` es propuesta, ⛔ no medida** —lo mismo que `despacho` y `sinMandar`—:
lo confirma Bruno con los primeros casos reales.

### ▶️ Lo que esto habilita y todavía no está

- ~~**El mensaje de la propuesta**~~ 🏁 **hecho el 28-ago-2026** — su sección está abajo.
- ~~**Los botones «Aceptó» / «No aceptó» en la fila**~~ 🏁 **hechos el 28-ago-2026** — abajo.

## 🆕 El mensaje de la propuesta: el quinto momento (28-ago-2026)

`mensajePropuesta` (`lib/reclamos/mensajes.ts`) + `'propuesta'` en `mensajesDeLaFila`
(`lib/reclamos/botones.ts`) + el botón **«Msj: la propuesta»** en la fila.

**Por qué era el que faltaba.** De los cinco momentos de la conversación había texto para cuatro, y
el que no lo tenía es **el que más dura**: Administración arma la oferta de que se lo quede, el
local la manda, la respuesta llega uno o tres días después. El de la clienta de `R-0022` hubo que
escribirlo a mano — o sea, exactamente lo que `mensajes.ts` existe para evitar: *cada versión
distinta del mismo mensaje es una promesa distinta, y después el cliente reclama sobre lo que le
dijeron.*

🔴 🔑 **La propuesta REEMPLAZA a la resolución mientras la oferta espera, ⛔ no se le suma.** Es la
mitad del cambio que ⛔ no es "agregar un botón". Un reclamo con una oferta esperando **ya tiene una
resolución guardada** —la salida *«por si dice que no»*, que se decide antes de mandar la oferta— así
que sin esta regla la columna ofrece los dos mensajes juntos, y son **dos promesas distintas sobre
el mismo reclamo**: *«te devolvemos todo»* y *«quedátelo por una parte»*. La que salga primero es la
que el cliente va a reclamar después. Por el mismo motivo se calla `pedir_fotos`: quien ya armó una
propuesta tiene la evidencia que necesitaba.

⚠️ **Los HECHOS ⛔ no se callan**, y ahí está la línea: `etiqueta` y `plata_enviada` avisan algo que
**ya ocurrió en el mundo**; los otros tres son **promesas**. Un hecho ⛔ no se contradice con una
propuesta, y esconderlo dejaría al cliente sin el seguimiento.

| momento | qué ofrece la columna |
|---|---|
| abierto, sin fotos | `pedir_fotos` |
| con fotos, sin decidir | `mas_fotos` (en el detalle) |
| **oferta mandada, sin respuesta** | **`propuesta`** — ⛔ ni `resolucion` ni `pedir_fotos` |
| contestada (acepte o no) | `resolucion` |
| con etiqueta / con la plata afuera | + `etiqueta` / `plata_enviada` |

**Tres decisiones del texto, y las tres son de plata:**

- 🔑 **La forma se lee con la MISMA regla que `salidaAlAceptarRetencion`** —`cupon` o, cualquier
  otra cosa, plata—, ⛔ no con una condición propia. Es la regla que decide en qué **termina** el
  reclamo si acepta: prometer un cupón y ejecutar plata (o al revés) se descubre en la caja o en la
  próxima compra del cliente, ⛔ nunca en una pantalla. Por eso una fila **sin** `retencion_forma`
  (las anteriores a esa columna) promete plata: es lo que se va a ejecutar.
- 🔑 **La alternativa ⛔ no se inventa: sale de lo GUARDADO.** Con el reclamo decidido, la
  resolución de la fila **es** la salida «si dice que no»; recién si no se decidió todavía se cae en
  lo que el cliente PIDIÓ (`expectativa`). Y sin ninguno de los dos se nombran **las dos** («el
  cambio o la devolución»): elegir una sería una promesa salida de la nada. Las dos son listas
  cerradas (`ALTERNATIVA_POR_RESOLUCION` / `ALTERNATIVA_POR_EXPECTATIVA`).
- 🔑 **Es el único de los cinco que PREGUNTA.** Los otros avisan algo ya decidido. Sin pedir la
  respuesta explícitamente, el cliente contesta cualquier cosa y quien atiende no sabe si eso fue un
  sí. ⚠️ Y dice el **monto**, ⛔ no la cuenta de la que sale: explicar la cuenta invita a discutirla.

✅ **9 mutantes, 9 muertos** — los tres de la regla (que la propuesta no aparezca; que la resolución
⛔ no se calle; que `pedir_fotos` ⛔ no se calle), cinco del texto (la forma vacía cayendo en cupón,
la precedencia de la alternativa invertida, la salida genérica eligiendo una, la pregunta borrada,
el monto leído de `monto_total` en vez de la oferta) y **el del CABLE**: sacar el botón del JSX pone
en rojo `tests/reclamos-lista-mensajes.test.tsx`. Ese último es el que este módulo ya perdió dos
veces — *los dos lados bien y el bug en la pregunta del medio*.

⚠️ **El fixture del test de texto tiene la expectativa DISTINTA de la resolución a propósito**: con
las dos iguales, invertir la precedencia de la alternativa no rompe nada y la regla queda sin fijar.

## 🆕 La respuesta del cliente cierra la rama, y mueve el caso al momento siguiente (28-ago-2026)

Pedido de Bruno: *«el local toca "Aceptó" y el sistema cierra la rama»* y, la mitad más grande,
*«si está definido lo de acepto, que cada caso tenga el mensaje correspondiente… o que cambie el
estado, y por ende que cambie el mensaje: ej, si no acepta y se procede a la devolución, le mandamos
que apenas tengamos la etiqueta se la estamos enviando para que pueda despachar el paquete»*.

### 1. `camposAlContestarLaOferta` — y por qué esto ⛔ NO es «el local decidiendo plata»

Acción **`retencion-respuesta`** de `api/_reclamos.js`, **fuera de `DE_ADMIN`**, con los botones
**«Aceptó» / «No aceptó»** en la fila, en el mismo momento en que se ofrece el mensaje de la
propuesta.

🔑 **Cuando la oferta salió, Administración ya decidió LAS DOS RAMAS**: el monto, la forma —que es
la que determina en qué termina el reclamo— y la salida *«por si dice que no»*, que es la resolución
que **ya está guardada en la fila**. Lo único que agrega el cliente es **cuál de las dos pasó** ⇒ el
gesto del local es el mismo que `descontado` o `gn-baja`: **anotar un paso que ya ocurrió en el
mundo**. Por eso el body lleva **sólo la respuesta**: el monto y la forma se leen de la fila, y
mandarlos desde la pantalla dejaría que el local los pise sin querer.

🔴 **Las dos respuestas ⛔ no son simétricas**, y ahí está el defecto que se evitó:

| | qué se escribe |
|---|---|
| `rechazo` | **sólo la respuesta.** Lo decidido ya era la salida «si dice que no»: pisarlo sería rehacer una decisión que nadie rehizo, y volvería a poner en `pendiente` plata que capaz ya salió |
| `acepto` | la respuesta **y la rama**: resolución, `monto_total`, destino, el retorno apagado, `estado` y los pendientes |

🔑 **Las tres derivaciones salen del núcleo** —`salidaAlAceptarRetencion`, `destinoDe`,
`pendientesDe`—: acá ⛔ no se reescribe ninguna. Duplicar esa derivación es el bug que este módulo ya
tuvo dos veces. Y **aceptar APAGA el pedido de retorno**: tenerlo prendido contaba el producto dos
veces, en la bandeja de Depósito y en poder del cliente.

🔴 🔑 **`destinoDe` se mudó de `tipos.ts` a `casos.core.js`** — mismo arreglo que `perfilDe` y que
`permisos.core.js`. Mientras vivía en TypeScript el único que podía derivar el destino era la
pantalla, y **un handler que ⛔ no puede aplicar la regla termina recibiéndola por el body**, o sea
confiando en que la pantalla la aplicó bien. `tipos.ts` conserva la cara tipada.

⚠️ **El freno de «ya está contestada» vive en el servidor** (409): aceptar dos veces reescribiría la
resolución y **destildaría los pendientes ya ejecutados**, que es exactamente lo que `loEjecutado`
frena en `decidir`.

### 2. «Falta mandarle la etiqueta»: el paso que existía en la realidad y ⛔ no en la pantalla

Al decidir con retorno la fila pasa a `en_transito` — pero **por correo o Andreani el cliente ⛔
todavía no puede despachar nada**: le falta la etiqueta, que se carga después. O sea que «En camino
de vuelta» afirmaba un paquete viajando **antes de que nadie lo despachara**. 🔴 Es exactamente la
mentira que ya se había corregido para el `presencial`, entrando por la otra puerta — y el test
**afirmaba la premisa vieja** (`andreani` → «En camino de vuelta»), otra vez
[[feedback_areben_premisa_escrita_nunca_medida]].

🔑 **Sin columna nueva y sin estado nuevo: el dato ya estaba.** Que la etiqueta exista lo dice
`seguimiento_vuelta`. `en_transito` sigue siendo **un solo estado** —la bandeja de Depósito filtra
por ahí y ⛔ no se tocó—: lo que cambia es **cómo se lee** (`faltaMandarLaEtiqueta`, usado por
`estadoEnCriollo` **y** por `mensajesDeLaFila`, ⛔ una sola vez).

Y su mensaje, `mensajeEtiquetaEnCamino`: *«la estamos generando y te la mandamos apenas la tengamos;
hasta entonces no tenés que hacer nada»*. 🔑 **Decir que ⛔ no tiene que hacer nada es para lo que el
mensaje existe**: sin eso el cliente vuelve a escribir, o peor —el paquete no sale y el reloj de
«hace N días que no llega» arranca sobre una espera que **nunca fue de él**. ⚠️ ⛔ No promete fecha:
la etiqueta la emite el transporte.

🔑 **`etiqueta_en_camino` y `etiqueta` son EXCLUYENTES, y el que los separa es el DATO**: el mismo
`seguimiento_vuelta` que enciende el segundo apaga el primero.

### La cadena completa, que es lo que pidió Bruno

| lo que pasa | estado que ve Administración | mensaje que ofrece la fila |
|---|---|---|
| oferta mandada, sin respuesta | el de siempre + ⏱ «no contestó hace N días» | **la propuesta** (⛔ ni resolución ni fotos) |
| **aceptó** | `resuelto` | **la resolución** — ya dice «quedátelo», y con cupón queda el pendiente de crearlo |
| **no aceptó**, con retorno por correo | **«Falta mandarle la etiqueta»** | la resolución + **«la etiqueta va en camino»** |
| se cargó el seguimiento | «En camino de vuelta» | la resolución + **«Msj: etiqueta»** |

✅ **12 mutantes, 12 muertos** en esta tanda —los seis de la regla nueva (rechazar pisando la
resolución, aceptar sin apagar el retorno, el destino derivado como si volviera, el cupón acordando
plata, contestar una oferta que no existe, ofrecerla en un caso que no corresponde), dos de
`faltaMandarLaEtiqueta`, el del momento, el del texto y **los dos del CABLE**— y **21 en el día**.

⚠️ **Un mutante puede pegarle a la función equivocada**: `if (!ofreceRetencion(motivo, escenario))`
existe **dos veces** en `casos.core.js` (acá y en `registroDeRetencion`), y el primer reemplazo cayó
en la otra. Salió verde y parecía un test que faltaba. **El ancla de un mutante se verifica única**
(`s.count(v) == 1`), igual que la cadena de un oráculo de deploy.

✅ **Caminado EN VIVO contra BDI de producción, 25 de 25** (`scripts/caminar-contestar-oferta.mjs`),
con **4 filas sembradas y borradas** y las reales intactas. 🔑 **El oráculo viene por otro camino que
el hecho**: se escribe por la API de prod y se lee la fila cruda por PostgREST con la service key —
los tests fijan la regla pura, y esto ejerce el camino entero (handler, permisos, PostgREST), que es
donde este módulo ya se rompió dos veces con la regla en verde. Lo que quedó ejercido a mano: el
rechazo que ⛔ no pisa nada, el 409 de contestar dos veces, las dos ramas de aceptar (plata y cupón,
con sus pendientes distintos) y el 409 de una fila sin oferta.

### 3. El reloj de la etiqueta, y por qué «falta» ⛔ no es «debida»

🔴 **La demora NUESTRA y la AJENA eran el mismo reloj.** `transito` (15 días, «hace N días que no
llega») corría sobre `en_transito` **desde que se decidió**, o sea desde antes de que la etiqueta
existiera ⇒ a los 15 días acusaba a un transporte que **nunca recibió el paquete**, porque el
cliente ⛔ no tenía con qué despacharlo. Y **a quién hay que ir a buscar es justo lo que un aviso
tiene que decir**: por eso los dos plazos y los dos tonos son distintos —lo nuestro es `danger` a
los **2** días (`DIAS_ALERTA.etiqueta`), lo del transporte `warning` a los 15— y `transito` ahora
exige que la etiqueta **exista**.

🔴 🔑 **Y apareció la distinción que le faltaba al módulo: «falta» ⛔ no es «debida».**

| | qué pregunta | de qué cuelga |
|---|---|---|
| `faltaMandarLaEtiqueta` | ¿la etiqueta **falta**? — un hecho de la fila | **el rótulo del estado** |
| `laEtiquetaEstaDebida` | ¿es **nuestro turno**? = falta **y** ⛔ no hay oferta esperando | **el mensaje y el reloj** |

Con una oferta esperando respuesta, la etiqueta ⛔ **todavía no corresponde**: se le propuso que se
lo quede, y mandársela antes de que conteste es **dar por hecho que dijo que no**. La espera, ahí,
es **del cliente** ⇒ ⛔ no se arranca un reloj contra nosotros por una espera que es de otro. Es la
misma lección que `desdeQueEsta`, una vuelta más arriba.

⚠️ **El `presencial` y el cadete siguen entrando por `transito`**: ahí ⛔ no hay etiqueta que mandar
y «no llega» es lo que efectivamente pasa.

🔴 **Y esto destapó un defecto de ayer mismo**: `etiqueta_en_camino` es una **promesa**, así que cae
del lado de los que se callan — con una oferta esperando salían **los dos**, *«¿te lo querés quedar
por $13.491?»* y *«te mando la etiqueta para que lo devuelvas»*, en la misma columna. **La regla
estaba escrita en el docblock de `mensajesDeLaFila` y el código no la cumplía** ⇒
[[feedback_areben_invariante_escrito_no_frena]], por tercera vez en este módulo.

✅ **5 mutantes, 5 muertos** (la oferta que no frena el reloj, el reloj apagado, `transito` sin
partir, el tono, y el mensaje sin callarse) — **26 en el día**.

⚠️ **`DIAS_ALERTA.etiqueta = 2` es propuesta, ⛔ no medida**, lo mismo que `oferta`, `despacho` y
`sinMandar`: lo confirma Bruno con los primeros casos reales.
