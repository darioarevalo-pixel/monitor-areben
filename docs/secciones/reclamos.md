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
cosas que no cierran**, ordenadas por lo que cuesta plata o deja a un cliente sin respuesta
(**una arreglada** el 28-ago: el 403 de Depósito, contado en `docs/secciones/retornos.md`). ⛔ No es
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
`lib/reclamos/efectos.core.js` · `lib/reclamos/plata.core.js` · `lib/reclamos/mensajes.ts` ·
`lib/reclamos/cliente.ts`.
`lib/reclamos/medidor.core.js` + `lib/reclamos/medidor.ts` + `components/reclamos/Medidor.tsx`
(el medidor de reclamos por venta online — ver el final de la ficha).
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
cerrada** de qué mensajes corresponden en ese momento (`pedir_fotos · mas_fotos · propuesta ·
resolucion · etiqueta_en_camino · etiqueta · despacho_hecho · plata_enviada`). `Reclamos.tsx` sólo
dibuja lo que esa lista dice. Ahí se mudó también `ESTADOS_CON_LINK`, que era una const local de la
pantalla.

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

### 🆕 🔴 El control tiene que salir del **mismo archivo** que el cambio (28-ago-2026)

Cuarta vez que este verificador miente, y esta vez **de la otra punta**: dijo *«todavía NO está»*
sobre un cambio que **ya estaba en prod**. El control era `no le mandamos la etiqueta` (de
`tipos.ts`) y el cambio, de `Reclamos.tsx` — **caen en chunks distintos**
(`21wbfynss81od` vs `1-8c9igy0lljf`), así que intersecar «el oráculo en el chunk del control» daba
**0** con todo deployado.

⇒ **La cadena de control se elige del MISMO archivo que se tocó**, ⛔ no del módulo. Y conviene que
el script **imprima en qué chunk cae cada marcador** en vez de contar: con eso la respuesta se lee
sola.

⚠️ **Y el oráculo ingenuo habría dado verde igual**: se buscaba `sin decidir`, y `tipos.ts:1135` ya
tenía *«Todavía sin decidir»* **en prod desde antes**. El que distingue es **`"sin decidir"` con las
comillas** —sólo puede salir del `placeholder` nuevo—, y se confirmó leyendo el chunk servido:

    value:(0,S.montoADevolver)(n),placeholder:"sin decidir"

🔑 Un oráculo se elige **contra lo que YA está en prod**, ⛔ no contra lo que uno escribió hoy.

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

⚠️ **Los HECHOS ⛔ no se callan**, y ahí está la línea: `etiqueta`, `despacho_hecho` y
`plata_enviada` avisan algo que **ya ocurrió en el mundo**; los otros son **promesas**. Un hecho ⛔ no
se contradice con una propuesta, y esconderlo dejaría al cliente sin el seguimiento.

| momento | qué ofrece la columna |
|---|---|
| abierto, sin fotos | `pedir_fotos` |
| con fotos, sin decidir | `mas_fotos` (en el detalle) |
| **oferta mandada, sin respuesta** | **`propuesta`** — ⛔ ni `resolucion` ni `pedir_fotos` |
| contestada (acepte o no) | `resolucion` |
| con etiqueta / con la plata afuera | + `etiqueta` / `plata_enviada` |
| **con el paquete nuestro ya en la calle** | + **`despacho_hecho`** (28-ago) |

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

## 🆕 El despacho, y las tres ramas que salían mudas o mintiendo (28-ago-2026)

Salió de la auditoría de punta a punta (`docs/postventa-auditoria-2026-08-28.md`, D5 a D8). Los
cuatro son **texto que salía a un cliente todos los días**, ⛔ no detalles de redacción.

- 🔴 **`despacho_hecho`, el hecho que ocurría y ⛔ no se contaba.** `mensajeSeguimiento(…, 'reenvio')`
  existía y estaba probado desde el 27, y **su único llamador era el test**: en las tres
  resoluciones que mandan algo —el cambio, la reposición y el reenvío— el paquete salía y el cliente
  ⛔ no se enteraba por el sistema. Es la forma de [[feedback_areben_pendiente_derivado_sin_gesto]],
  la misma del botón «Despaché». 🔑 **Se lee del pendiente que tilda Depósito**
  (`envio_nuevo_estado === 'hecho'`), ⛔ no de un campo nuevo: el hecho lo cuenta quien lo hizo.
  Y tirando del hilo, el texto también estaba mal —las tres decían *«tu reposición»*, que sobre un
  **cambio** es otra cosa que la que hay en la caja—: ahora lo nombra `QUE_SE_DESPACHO`.
- 🔴 **El cupón ⛔ ya no se promete sin existir.** Sin `cupon_codigo` el mensaje salía igual —*«te
  dejamos un cupón»*—, que es el mismo agujero que `cupon-emitido` tapó el 25-ago **entrando por la
  puerta del texto**. Ahora dice lo que sí es verdad, con la forma de la etiqueta que todavía no
  existe: *«te pasamos el código apenas lo tengamos»*.
- 🔴 **El cambio y «sin compensación» compartían el default**, *«Ya lo revisamos y te contamos cómo
  seguimos»* — que promete una novedad que ⛔ no viene, justo en el caso donde hay que decir que no.
  ⚠️ **`ninguna` ⛔ no afirma la culpa**: el motivo lo contesta el **escenario**, y decir *«fue del
  transporte»* sobre un `plazo_mal_informado` es explicarle al cliente algo que no pasó.
- 🔴 **Los asteriscos.** WhatsApp pone negrita con **uno**; salían dos (`**…**`) en el renglón que
  más importa —quién paga el envío—, así que el cliente veía los cuatro. La convención ya estaba
  bien escrita en `detalleCambioTexto`. El test ⛔ no mira la constante: mira que **ningún mensaje
  armado** contenga `**`.

✅ **16 mutantes, 16 muertos.** Los dos que sobrevivieron a la primera tanda eran reales y los dos
eran del **cable**: el orden de los hechos en la lista, y —el que importa— **un botón bien rotulado
que copiaba el texto de otro momento**. Ese se mata apretándolo con el portapapeles stubbeado
(`copiadoAlApretar`, en `tests/reclamos-lista-mensajes.test.tsx`): el rótulo dice cuál se ofrece, el
texto es lo único que llega al cliente.

⚠️ **Lo que ⛔ NO se ejerció es la pantalla**: los textos se leyeron **renderizados** (que es como se
prueban) y el botón se aprieta en el test, pero nadie abrió Reclamos en prod con un despacho hecho.

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

---

## 🆕 🔴 La cuenta de lo que costó el caso pasó a ser de TODOS (28-ago-2026)

**Salió de la auditoría, D2.** R-0022 mostraba *«Se le devuelve $13.491»* al lado de *«Lo que nos
costó $20.682»*: el número llevaba adentro $6.500 de un envío de vuelta que aceptar la oferta acababa
de apagar.

### El defecto de fondo: la cuenta no era de nadie

`costoDelCaso` vivía en `tipos.ts`, pero **las tres condiciones que deciden cuánto entra de cada
envío estaban sueltas adentro de `DecidirReclamo.tsx`**. O sea: la función era pública y **la regla
no**. Por eso el número se quedaba viejo apenas algo lo tocaba fuera de esa pantalla, y hay dos
puertas que lo tocan:

- **aceptar la oferta** (`camposAlContestarLaOferta`), que resuelve el reclamo sin pasar por Decidir;
- **`editar`**, que puede mover **seis de las siete entradas** del costo —los dos envíos, los items,
  el destino, el retorno— y ⛔ no lo movía.

### Dónde vive ahora

**`lib/reclamos/plata.core.js`** — en `.js` plano porque lo necesita `api/_reclamos.js`, que ⛔ no
puede importar TypeScript. Mismo arreglo que `destinoDe` y `permisos.core.js`.

| | qué contesta |
|---|---|
| `costoDelCaso(o)` | la suma: plata + envíos + la unidad perdida, valuada **a costo** |
| `costoDeLaFila(fila)` | **la regla**: qué entra de cada cosa, mirando la fila |
| `ENTRADAS_DEL_COSTO` | las siete columnas que lee — **su contrato, escrito una sola vez** |

Las tres condiciones de `costoDeLaFila`, y por qué:

- **el envío de vuelta entra sólo si el producto vuelve** (`retorno_decidido`): si no vuelve, esa
  etiqueta ⛔ no se paga nunca;
- **el envío de ida entra sólo en la reposición** (`otra_unidad`);
- **con cupón ⛔ no sale plata de la caja hoy**, igual que `monto_acordado` queda en `null`. Cuánto
  vale un cupón frente al reembolso sigue **sin definir a propósito** (ver más arriba).

🔑 **`ENTRADAS_DEL_COSTO` es una sola lista y se usa para dos cosas**: el `select` que trae las
columnas y la pregunta *«¿este gesto cambió el costo?»*. Con dos listas escritas a mano, agregar una
entrada y olvidarse de una de las dos deja el número viejo **sin decir nada** — el mismo defecto
entrando por la otra punta. Hay un test que compara la lista contra lo que la función realmente lee.

⚠️ **`editar` recalcula SÓLO si el reclamo ya está decidido.** Antes de la decisión `costo_caso` es
`null` a propósito y quien lo escribe al final es `decidir`: calcularlo antes sería afirmar un costo
sobre una decisión que nadie tomó — el mismo *un dato que existe ⛔ no es una decisión tomada* de la
columna «A devolver».

⚠️ **La unidad se valúa a `costo`, y si el ítem ⛔ no lo tiene cargado vale CERO.** Las dos filas
reales de BDI lo tienen en `null`, así que hoy «Lo que nos costó» cuenta **sólo la plata**. ⛔ No es
un defecto de la cuenta: es un dato que falta, y el número se mueve solo el día que se cargue.

### Y el resumen ⛔ ya no acusa a nadie

`resumenDeLoDecidido` decía *«¿Se pidió que vuelva? **No — en contra de lo que sugería la cuenta**»*
sobre un retorno que **apagó el sistema solo** al aceptar la oferta (tenerlo prendido contaría el
producto dos veces, en la bandeja de Depósito y en poder del cliente). «En contra» es alguien que
decidió distinto que la cuenta: **acusaba a Administración de una decisión que tomó el cliente.**
Ahora dice *«No — el cliente aceptó quedárselo»*, y la señal de «en contra» sigue viva para el
rechazo.

---

## 🆕 🔴 El orden entre anular la venta y la venta técnica (28-ago-2026)

**Salió de la auditoría, D1.** Bruno contestó la pregunta de fondo: *«sería como hoy, pero la venta
técnica sale de nosotros: la escribimos desde el Monitor, y sólo Admin tendría que ir a cancelarla»*
⇒ `plata_parcial` **sigue anulando la venta**, y `EFECTOS_RESOLUCION` ⛔ no se tocó.

🔑 **Los dos movimientos ⛔ no se cancelan: se necesitan los dos, y en ese orden.** Anular la venta en
GN **devuelve la unidad al stock**, y la venta técnica es la que la vuelve a sacar. Al revés,
descuenta una unidad que todavía no volvió y **el stock queda uno abajo del real**, sin ningún error
y hasta el próximo conteo.

🔴 **Eso estaba escrito, con su freno, en UNA sola de las dos puertas**: el camino de Fallas
(`aFallas`). El de la unidad **sana** —`descontarRegaladas`, que es el que está apretado hoy en
R-0022— ⛔ no lo tenía. Dos lados decidiendo sobre lo mismo, con la regla escrita en uno ⇒
[[feedback_areben_dos_lados_bien_y_la_pregunta_del_medio]].

- la regla vive en **`faltaAnularAntesDeDescontar`** (`efectos.core.js`) y **devuelve el texto**: las
  dos puertas dicen lo mismo porque es el mismo string;
- **el freno va ANTES de escribir en GN** (`pasarAFallas` y `descontarRegaladas`, en `cliente.ts`).
  ⚠️ `descontarRegaladas` crea la venta en GN y **después** sella la baja, así que un 409 del handler
  llegaría tarde: dejaría la venta hecha en GN y el reclamo sin sellar. El 409 del handler quedó
  igual, **de respaldo**, para el que entre por otra puerta;
- **sólo muerde cuando la venta se anula**: si queda en pie, la unidad nunca vuelve al stock y ⛔ no
  hay orden que respetar.

### `laFallaDescuentaStock` sale de la tabla, ⛔ ya no de una copia

Tirando de ese hilo apareció otro: la función razona —lo dice su propio docstring— *«la venta original
se anula, y al anularla la unidad vuelve al stock»*, y lo escribía como `compensacion !== 'otra_unidad'`.
Era una **copia fiel de `EFECTOS_RESOLUCION` del día en que se escribió**; el 27-ago `reenvio`, `cupon`
y `ninguna` dejaron de anular y la copia se quedó igual ⇒ **cuatro filas contestando distinto sobre el
mismo stock** (con `otro_producto`, que ya estaba mal desde antes).

Ahora sale de **`seAnulaLaVenta(compensacion)`**, con un cable que las compara **fila por fila**: la
próxima resolución ⛔ no se puede olvidar.

### Cómo se probó

**20 mutantes, 20 muertos**, y ⛔ no sólo tests: `scripts/caminar-costo-caso.mjs` corre **el handler
en proceso contra BDI de producción** —siembra su fila, la borra, y cuenta las reales antes y
después— y ejerce los tres verbos que ESCRIBEN: `retencion-respuesta`, `editar` y `descontado`.
**19 de 19.**

⚠️ **Lo caminado es el servidor, ⛔ no el botón**: nadie apretó todavía «Descontar en GN» sobre
R-0022 para ver el aviso del orden en pantalla.

---

## 🆕 🔴 Cerrar un reclamo ahora lo frena el SERVIDOR (28-ago-2026)

D10, D11, D17 y D18 de `docs/postventa-auditoria-2026-08-28.md`. Las cuatro son la misma clase de
cosa: **algo que afirmaba de más** —un número, un permiso, un rótulo— y que nadie podía desmentir
desde afuera de la pantalla.

### `faltantesParaCerrar` bajó al núcleo

Era la lista que pone gris el botón «Cerrar» en Reclamos y en Cambios, y vivía en `tipos.ts`. El
handler aceptaba `estado: 'cerrado'` viniera de donde viniera, así que **se podía cerrar un reclamo
con la plata sin devolver y la venta sin anular** — bastaba un POST. Es la regla que este módulo
tiene escrita tres veces en el mismo archivo: *una pantalla que esconde un botón es una sugerencia,
⛔ no una regla*.

El cuerpo se mudó a `lib/reclamos/casos.core.js` y en `tipos.ts` quedó **la cara tipada**, mismo
arreglo que `destinoDe`, `perfilDe` y `permisos.core.js`: `api/*.js` corre en Node sin el compilador
de Next y ⛔ no puede importar TypeScript. Ahora `action: 'estado'` con `'cerrado'` lee la fila y
contesta **409 con la lista de lo que falta**. Es **idempotente**: cerrar uno ya cerrado ⛔ no es un
error, igual que `recibir` y `despachado`.

🔴 🔑 **Cerrar ⛔ NO pide administración, y la auditoría pedía que sí.** Pedirlo le sacaría el botón
«Cerrar» al **Local** en `ArmarCambio.tsx`, que es justo lo que el encabezado del handler dice que el
Local tiene que poder hacer de punta a punta. **Lo que protege la plata ⛔ no es el rol: es que no
queden pendientes.** `anulado` sí quedó de administración: es el hermano de `eliminar` —decir que el
caso no debió existir— y hoy ⛔ ninguna pantalla lo pone.

🔑 **El modo de falla que el arreglo se trae puesto, y cómo queda tapado.** El handler lee la fila con
un `select`: un pendiente nuevo en la función y no en el select deja el freno mirando `undefined`, o
sea **dejando pasar** justo el caso que vino a frenar, callado y con todo en verde. Por eso hay
**una sola lista** —`COLUMNAS_PARA_CERRAR`, como `ENTRADAS_DEL_COSTO`— y un test que la ata a las
dos puntas: lo que la función lee (`d.x` en su cuerpo) y lo que el handler pide (que use la lista, y
que **recortar la fila al select ⛔ no cambie la respuesta**, que es lo único que cubre también lo
que leen los helpers de unidades).

### «A devolver» ⛔ ya no afirma una decisión que nadie tomó

La celda hacía `monto_total ?? monto_producto ?? 0` sin mirar si había decisión: el 28-ago mostraba
**$20.682** en la fila de R-0022 mientras el detalle del mismo reclamo decía *«todavía sin decidir»*.
Ese número ⛔ no es una promesa — es lo que el cliente pagó, y está en la fila desde el minuto cero.

La cuenta salió a **`montoADevolver`** (`lib/reclamos/plata.core.js`), que devuelve **`null` sin
decisión**, y la celda lo dibuja como **«sin decidir»**. 🔑 **El vacío ⛔ no puede ser `0`**: un `$0`
afirma lo contrario, que ya se decidió y no sale nada. El aviso de «Plata devuelta» pregunta ahora
por **ese mismo número** —antes lo calculaba por su cuenta— y encima formateado.

### Dos rótulos del historial que mandaban a buscar donde no estaba

- **Armar un cambio** apilaba un evento `'borrador'` **sin tocar la columna `estado`**: sobre un
  reclamo `en_revision` dejaba en el historial un momento en el que la fila **nunca estuvo**
  (`desdeQueEsta(d, 'borrador')` devolvía esa fecha). Ahora el evento lleva **el estado en el que la
  fila queda**.
- **`gn-baja`** anotaba *«stock corregido en TN»* cuando el movimiento es de **Gestión Nube** — la
  columna se llama `tn_stock_estado` por su primera versión. El historial es lo que se lee después:
  el nombre del sistema equivocado manda a buscar el movimiento a la tienda, donde no está.

### Cómo se probó

**12 mutantes, 12 muertos.** El freno, los dos rótulos y `montoADevolver` con el handler **corriendo
de verdad** (`tests/reclamos-servidor.test.ts`: perfil de Administración y perfil del Local, supabase
falso, y lo que se mira es **qué se escribió**), y **el cable de la celda** montando la lista
(`tests/reclamos-columna-plata.test.tsx`) — porque el defecto de D10 vivía justo en el medio: la
regla bien de un lado, el JSX con su propia cuenta del otro.

✅ **En prod** (`2539984`, 28-ago de noche): verificado por **el chunk servido**, con el control
sacado del mismo archivo (ver arriba, «El control tiene que salir del mismo archivo que el cambio»).

⚠️ **Lo verificado en prod es la CELDA**: el freno de cerrar vive en la función de `api/`, que viaja
en el mismo deploy pero ⛔ no se puede leer desde afuera. **Nadie apretó todavía «Cerrar» sobre un
reclamo real con pendientes para ver el 409 dibujado** — es la misma pantalla que sigue sin
caminarse desde la tanda de los textos.

---

## 🆕 🔴 Qué se le dijo al cliente, y cuándo (29-ago-2026 — D9)

**La columna `mensajes` existía desde el día uno, estaba en el `select` del handler, y ⛔ no la
escribía nadie.** Aparecía **una sola vez en todo el módulo** (`COLS`), y R-0022 —el primer reclamo
real de BDI— la traía `[]` después de que se le mandaron el link, la propuesta y la resolución.
El docstring de `lib/reclamos/mensajes.ts` promete desde su primer párrafo que *«queda registrado
qué se le dijo y cuándo»*: **la segunda mitad de esa frase era falsa**.

🔑 **Y lo que se perdía ⛔ no era un log: era la promesa.** De los cinco momentos el que más importa
es el de resolución —ahí se le dice al cliente cuánta plata se le devuelve y cómo— y de ése ⛔ no
quedaba absolutamente nada. Cuando el cliente vuelve a escribir *«me dijeron otra cosa»*, lo único
que había para contestarle era la memoria de quien atendió. Del único momento que quedaba rastro era
la apertura, y **de rebote**: el historial anota el cambio de estado, ⛔ no el texto.

### Copiar cuenta como decirlo, y el registro sale del copiado que FUNCIONÓ

⚠️ Lo que el sistema observa es el **copiado**, ⛔ no el envío: el mensaje se pega en WhatsApp, que
está afuera. Tratar las dos cosas como la misma **ya era la decisión de este módulo** y está escrita
en `Reclamos.tsx`, en el mensaje de apertura: *«Copiar el mensaje ES escribirle: de acá va derecho a
WhatsApp»* — es el gesto que mueve el reclamo a `esperando_cliente`. Esto sigue esa línea y ⛔ no
inventa una segunda semántica para el mismo gesto.

🔑 **El registro se apila cuando el portapapeles ACEPTÓ, ⛔ no cuando se apretó** (`onCopiado`, nuevo
en `CopyButton`). Es *«el cartel dice lo que PASÓ, no lo que se intentó»* del 27-ago: el portapapeles
falla seguido y falla callado, y anotar «se le mandó la resolución» sobre un `writeText` rechazado
escribe un hecho que no pasó **en el único lugar que existe para contestar qué se le prometió**.
⚠️ El costo elegido es que la lista puede quedar **corta** — y por eso el vacío lo explica la
pantalla en vez de dejar que se lea como «no se le dijo nada».

### Las tres reglas que ⛔ no son obvias

1. 🔴 **⛔ No toca `updated_at`.** `apilar()` lo mueve, y de ahí cuentan dos alertas: *«hace N días
   que la plata no sale»* y *«esperando una decisión hace N días»*. Copiar el mensaje de resolución
   habría **reiniciado el reloj de que la plata no salió** justo cuando se le está prometiendo al
   cliente que va a salir ⇒ el handler escribe la columna a mano.
   [[feedback_areben_updated_at_no_mide_la_espera]], que este módulo ya pagó con el reloj de «hace N
   días que no llega».
2. 🔴 **⛔ Tampoco apila en `historial`.** Ahí va el **estado** en el que la fila queda (D17) y se lee
   para saber qué pasó y desde cuándo; cinco mensajes por reclamo lo llenarían de eventos que no
   mueven nada. Los mensajes son su propia lista, al lado — «Qué pasó» cuenta los estados, «Qué se le
   dijo» cuenta las palabras.
3. 🔑 **⛔ No es de administración.** El que le habla al cliente es el Local, y los cinco botones de
   mensaje son suyos: gatearlo con `DE_ADMIN` dejaría el registro vacío justo en los reclamos que sí
   se atendieron.

### Dónde vive cada mitad

- **La regla**: `lib/reclamos/mensajes.core.js` — `MOMENTOS_DEL_MENSAJE` (lista cerrada de nueve:
  los ocho de `MensajeDeLaFila` más el ticket del cambio), `LARGO_MAXIMO_MENSAJE` y `apilarMensaje`.
  Es `.core.js` y ⛔ no `.ts` porque **lo valida el handler**, y `api/*.js` ⛔ no puede importar
  TypeScript: mismo arreglo que `permisos.core.js`, `faltantesParaCerrar` y `destinoDe`. La cara
  tipada (`MomentoDelMensaje`, `MensajeRegistrado`, `MOMENTO_MENSAJE_LABEL`) queda en `tipos.ts`.
- **El botón**: `components/reclamos/BotonMensaje.tsx`. 🔑 **Es un componente y ⛔ no una línea en
  cada botón**, porque el modo de falla del arreglo obvio es el que este módulo ya pagó cuatro
  veces: pegarle un `onCopiado` a mano a los ocho `CopyButton` deja el noveno afuera, callado y en
  verde. Acá el registro viaja **con el botón**.
- **La lectura**: `components/reclamos/QueSeLeDijo.tsx`, en el detalle de la fila.
- **El servidor**: `action: 'mensaje'` y `vista=mensajes` en `api/_reclamos.js`.

### `mensajes` salió de `COLS`, y ⛔ no es cosmético

📊 Medido sobre los 31 mensajes que arma hoy el módulo: **283 bytes de promedio, 436 el más largo**
⇒ un reclamo con sus cinco momentos son ~1,4 KB, contra los **1,925 KB que pesa hoy la fila entera**.
Meterlo en el listado lo **duplica**, y el listado baja 200 filas para dibujar una columna que ⛔ no
lo usa. Se pide de a uno por `vista=mensajes`, **mismo molde que el token**.

### 🔴 Lo que dice cuando está VACÍO, que es la mitad que importa

El registro empezó el **29-ago-2026**: todos los reclamos anteriores tienen la lista vacía, los tres
mensajes de R-0022 incluidos. Una lista vacía leída como *«no se le dijo nada»* es exactamente el
**«el cero afirma»** que este módulo viene tapando en `retencion_respuesta`, en la columna «A
devolver» y en el destino de las unidades — con la diferencia de que acá el que se equivoca es
alguien contestándole a un cliente que dice que le prometieron otra cosa. ⇒ **lo dice la pantalla**,
y ⛔ no se deduce. Y si el registro falla, **se avisa**: ⛔ no queda en un `catch {}` vacío.

### El doble click

Copiar el mismo texto dos veces con cinco minutos de diferencia **es contarle dos veces** y tiene que
quedar; copiarlo dos veces en el mismo segundo es la mano temblando sobre el botón, y dejar las dos
entradas escribe una historia falsa. `SEGUNDOS_DEL_REPETIDO = 60`, mirando **sólo el último** —
el número es arbitrario y está **elegido**, ⛔ no medido.

### Cómo se probó

- **18 mutantes, 18 muertos** (anclas verificadas únicas), incluidos los tres que importan: el botón
  que registra **el rótulo en vez del texto que salió**, el que registra **un momento fijo**, y el
  `onCopiado` disparado **antes** de que el portapapeles conteste.
- **Los dos cables**: `tests/reclamos-registro-mensajes.test.ts` lee las pantallas y exige que cada
  `tipo` esté en la lista del servidor **y que ⛔ ningún mensaje al cliente salga por un `CopyButton`
  pelado** (la mitad negativa: el defecto no vuelve por un `tipo` mal escrito, vuelve por un botón
  nuevo que copia perfecto y ⛔ no registra); `tests/reclamos-lista-mensajes.test.tsx` aprieta el
  botón y compara **lo copiado contra lo registrado**.
- **26 de 26 caminando contra la base real de BDI** (`scripts/caminar-registro-mensajes.mjs`, con el
  handler **en proceso** y el oráculo por PostgREST): la columna nace vacía, acepta el texto con sus
  saltos de línea y sus acentos, ⛔ **no mueve `updated_at`**, el doble click ⛔ no duplica, los tres
  rechazos son 400, `vista=mensajes` los trae y **el listado ⛔ no**. Una fila sembrada y borrada; las
  **2 reales, intactas**.

---

## 🆕 🔴 Los cuatro chicos de la auditoría (29-ago-2026 — D13 a D16)

Los cuatro son la misma familia: **el estado existe, el pendiente se dibuja, y el gesto que lo
cierra ⛔ no está en ninguna pantalla** ⇒ [[feedback_areben_pendiente_derivado_sin_gesto]], tercera y
cuarta vuelta en este módulo.

### D16 · El portal del cliente seguía abriendo un cambio ya decidido

**Es lo único de todo el módulo abierto a internet, y la regla de cuándo contesta estaba escrita
DOS veces.** El código lo decía: `ESTADOS_CON_LINK` (`botones.ts`) llevaba de comentario *«tiene que
ser el mismo conjunto que `ABIERTO` en `api/_reclamo.js`»*.

🔴 **Y ya habían dejado de coincidir.** La lista dejó de ofrecer el link de un cambio decidido
—`linkVivo(d) && !estaDecidido(d)`— y el servidor se quedó mirando **sólo el estado**. Y `borrador`
significa dos cosas: un **cambio decidido vuelve a `borrador` a propósito**, a esperar el pago ⇒ un
link mandado antes seguía abriendo.

🔴 🔑 **Y era peor que «abre»**: `accion: 'enviar'` escribe `estado: 'en_revision'`. Sobre un cambio
decidido eso lo **saca de la pestaña donde lo está esperando el Local y lo devuelve a la cola de los
que hay que decidir** — movido **desde afuera, sin sesión, por quien tenga el link viejo**.

⇒ La regla vive ahora sola en **`lib/reclamos/portal.core.js`** (`ESTADOS_CON_LINK`,
`COLUMNAS_DEL_PORTAL`, `elLinkSigueVivo`) y la leen los dos lados. `linkVivo` de `botones.ts` la
delega, y el `&& !estaDecidido(d)` que estaba suelto en `mensajesDeLaFila` ⛔ ya no hace falta:
estaba compensando a mano la mitad que le faltaba al servidor.

⚠️ **`compensacion` entró al `select` del portal y ⛔ no viaja**: la respuesta la arma
`paraElCliente` campo por campo, y el test le pasa una fila con `compensacion` adentro y verifica
que no salga. Entra **por `COLUMNAS_DEL_PORTAL`** y ⛔ no a mano — un `select` que se olvide de una
columna que la regla mira deja el freno viendo `undefined`, o sea **dejando pasar justo lo que vino
a frenar**. El oráculo que lo cubre es el mismo de `COLUMNAS_PARA_CERRAR`: *recortar la fila al
`select` ⛔ no cambia la respuesta*.

### D13 · `anulado` no lo podía poner ninguna pantalla

El estado estaba en la lista, en los colores y en `faltantesParaCerrar` desde el día uno, y en
post-venta **sólo había lecturas**.

🔑 **La auditoría preguntaba si sobraba el estado (§4, «ocho estados → siete»); lo que sobraba era el
hueco.** Sin él, la única forma de sacar de la lista un reclamo abierto por error, o duplicado, era
**eliminarlo** — y con él se iban el número, el historial y las fotos. Anular es la alternativa **no
destructiva**: la fila queda, deja de contar como abierta (`ESTADOS_ABIERTOS` ⛔ no lo incluye) y el
`⋯` sigue contando qué pasó.

⚠️ **⛔ No pide que no falte nada**, a diferencia de cerrar: decir que el caso no debió existir es
decir que sus pendientes tampoco. El freno de administración lo pone **el servidor** (`DE_ADMIN` no,
pero `estado: 'anulado'` sí, desde D11), ⛔ no el `esAdmin` de la pantalla.

⚠️ **Y de paso: `anular` eran DOS cosas con el mismo nombre en el mismo archivo** — la venta en
Gestión Nube y el reclamo—, con los dos botones en la misma fila. Ahora son `anularLaVentaEnGN`
(«Anulé en GN») y `anularElReclamo` («Anular el reclamo»).

### D14 · «Despaché» de un cambio necesitaba dos pantallas

Todo cambio nace con `envio_nuevo_estado: 'pendiente'` (`EFECTOS_RESOLUCION`), la columna de
pendientes de Cambios escribe *«Falta despachar lo que se le manda»*… y para tildarlo había que irse
a Reclamos o a Retornos, **con el cambio abierto adelante**.

🔑 **Es el MISMO verbo (`despachado`), ⛔ no uno nuevo.** El freno que sella sólo si el pendiente
está vive en el handler desde D3, así que esta pantalla ⛔ no puede afirmar de más aunque el botón se
muestre mal. Y pregunta antes, como `Reingresado` y `Cobré la diferencia`: es un hecho del mundo
físico que el sistema ⛔ no puede ver.

### D15 · Sin fotos no se podía registrar una oferta hecha por teléfono

🔑 **Las fotos gatean ARMAR la propuesta, ⛔ no REGISTRAR una que ya se hizo.** Una oferta por
teléfono, antes de que el cliente mandara nada, **es un hecho que pasó**: esconder la caja no lo
deshace, sólo lo deja sin registrar — y después la rechazada ⛔ no aparece en ninguna cuenta, que es
exactamente el agujero que `retencion_respuesta` vino a tapar. La escapatoria ya existía
(**«Se lo ofrecí igual»**) y vivía **adentro** de la rama que necesitaba las fotos para llegar.

🔴 **Y tapaba algo peor**: `retencion_monto` y `retencion_forma` se guardan mirando `hayOferta`,
⛔ no `mostrarRetencion` ⇒ un reclamo con la oferta **ya registrada** y sin fotos **la seguía
guardando con la caja escondida** — el dato vivo y la pantalla muda. Por eso `mostrarRetencion` es
ahora `puedeOfrecerse && (hayFotos || ofreciIgual || hayOferta)`.

### Cómo se probó

- **14 mutantes, 14 muertos** (anclas verificadas únicas). ⚠️ **Tres sobrevivieron a la primera
  tanda y los tres eran reales**, y dos de ellos por la misma razón: **el test negativo era vacío**.
  La lista abre en «Abiertos», que ⛔ no dibuja lo cerrado ni lo anulado ⇒ *«el botón no está»* se
  cumplía **porque la fila no estaba**. Ahora cada negativo comprueba primero que la fila SE VE. El
  tercero fue el `select`: el Supabase falso devuelve la fila entera, así que sacar una columna de
  `COLUMNAS_DEL_PORTAL` ⛔ no ponía nada en rojo — lo mata el oráculo *recortar la fila al select
  ⛔ no cambia la respuesta*.
- **12 de 12 caminando contra la base real de BDI** (`scripts/caminar-portal-cliente.mjs`, con el
  handler **en proceso**): el link abre sobre un reclamo vivo, ⛔ **no** sobre un cambio decidido,
  `enviar` contesta 404 y **la fila ⛔ no se mueve**, y `compensacion` ⛔ no sale en la respuesta.
  Cuatro filas sembradas y borradas; las **2 reales, intactas**.

---

## 🆕 🔴 Los dos topes que se cortaban callados (29-ago-2026 — D12)

**El aviso del sidebar bajaba las 200 filas más nuevas *de todas*, cerradas incluidas**, y el front
las filtraba con `estaAbierto`. 🔑 **Lo cerrado crece para siempre y lo abierto no**: con 200
reclamos por mes, al segundo mes esas 200 filas son casi todas cerradas ⇒ **el reclamo que duerme
deja de contar en el badge**, que es exactamente para lo que la alerta existe. El listado hacía lo
mismo, con las tres pestañas —Abiertos, Durmiendo, Todos— filtrando **en el cliente** sobre lo que
bajó.

### El filtro sale del núcleo

`ESTADOS_ABIERTOS` y `estaAbierto` **bajaron de `tipos.ts` a `casos.core.js`**, porque ahora los lee
también `api/_reclamos.js` y `api/*.js` ⛔ no puede importar TypeScript. Mismo arreglo que
`faltantesParaCerrar`, `destinoDe` y `perfilDe`; en `tipos.ts` quedó la cara tipada. ⛔ **No se copia
la lista en el handler**: es la misma que filtra el front, y una segunda copia acá se pagaría con un
`anulado` de pendiente viejo avisando para siempre de algo que ya no existe.

### 🔴 Y el orden estaba al revés de para qué sirve el aviso

Con `created_at` **descendente** el corte se lleva **los más viejos** — que son justo los que pueden
estar durmiendo. **Ascendente**, lo que queda afuera son los recién abiertos, que ⛔ todavía no
pueden tener alerta y **entran solos a la ventana al envejecer**. Con el filtro por estado y sin
esto, el defecto seguía vivo, sólo que más chico.

### 🔴 Un tope que se pasa tiene que DECIRLO

Los dos endpoints piden ahora **uno más que el tope** y devuelven `hayMas`. 🔑 Contar
`data.length === tope` ⛔ **no distingue** «entraron justos» de «se cortó», y ese empate es
exactamente el caso en que el aviso se callaría de más.

- **La lista** dibuja un cartel: *«hay más reclamos de los que entran en esta lista… los tres filtros
  trabajan sobre lo que bajó»*. Lo importante es la segunda mitad: sin ella alguien lee «Abiertos» y
  entiende que ésos son todos.
- **El sidebar suma un aviso propio**: *«hay más reclamos abiertos de los que este aviso puede
  mirar»*, en `danger`. Sin él, **el módulo cuyo valor entero es avisar se calla justo cuando más
  trabajo hay**. ⚠️ Su `ts` sale de **la fila más vieja que sí bajó** y ⛔ no de `ahora`: con `ahora`
  se «estrenaría» en cada refresco y el badge de nuevos ⛔ no se podría apagar nunca — la misma
  lección que `cuando()` en `alertasDe`.

📊 El tope del aviso quedó en **500** (`TOPE_AVISOS`): 344 bytes por fila ⇒ ~172 KB cada 3 minutos
por admin, y **500 reclamos abiertos a la vez ⛔ no es una carga de trabajo, es un incendio**. El
tope existe para que una consulta rota no baje la tabla entera, ⛔ no para recortar el trabajo real.

⚠️ **El listado sí sigue bajando lo cerrado**, y es a propósito: la pestaña «Todos» existe. El
recorte por estado es del aviso, ⛔ no de la lista.

### Cómo se probó

- **13 mutantes, 13 muertos**: el filtro que desaparece, el filtro **copiado a mano** en vez de salir
  del núcleo, el orden que vuelve a descendente, el `limit` sin el `+1` (que deja de distinguir el
  corte), el `hayMas` clavado en `false` de los dos lados, el derivador que ignora el corte, el `ts`
  con `ahora`, el aviso del corte saltándose el permiso, y **los tres del cable**: la pantalla que se
  traga el `hayMas`, la que lo grita siempre y la que ⛔ no lo lee.
- **12 de 12 caminando contra la base real de BDI** (`scripts/caminar-tope-avisos.mjs`, handler en
  proceso, dos filas sembradas y borradas, las 2 reales intactas). 🔑 **Esto ⛔ no lo puede decir
  ningún test**: el Supabase de mentira **ignora el `.in`** y devuelve la fila entera pida lo que
  pida el handler, así que un filtro mal escrito sale **verde**.

## 🆕 🔴 Los cuatro momentos que estaban mudos, y el aviso que acusaba de más (29-ago-2026)

📄 **De acá salió `docs/postventa-mapa-operativo.md`**: el recorrido de punta a punta —estado por
estado, con su mensaje y su botón— que Bruno pidió para poder analizarlo. Esta ficha sigue contando
**cómo está hecho**; el mapa cuenta **cómo se opera**.

### 🔴 El agujero más grande: tres de los once casos NACÍAN MUDOS

`demora`, `no_llego` y `sin_stock` tienen `fotos: 'nunca'` ⇒ `pideFotos` es `false` ⇒ ⛔ **no había
botón de apertura**. Y el único gesto de toda la app que saca un reclamo de `borrador` es **copiar
ese mensaje** (`Reclamos.tsx`, verificado: ⛔ no hay otro `setter` de `esperando_cliente`). Entonces:

- el local abría el reclamo y ⛔ **no tenía una sola cosa para copiarle** a un cliente que ya había
  escrito —y `no_llego` y `demora` son los dos casos donde escribió más enojado—;
- la fila ⛔ **no podía salir nunca** de `borrador` por el camino normal;
- a los 2 días saltaba un aviso en rojo: *«Abierto hace N días y todavía no se le escribió»*, y **lo
  único que lo apagaba era que Administración decidiera**.

⇒ Es [[feedback_areben_modulo_que_nace_mudo]] entrando por la puerta del texto, y de paso *el
pendiente que nadie puede tildar*, que es el modo de falla propio de esta sección.

✅ **Momento `acuse`, el complemento EXACTO de `pedir_fotos`** (donde no hay evidencia que pedir,
igual hay que contestarle), con `QUE_ESTAMOS_HACIENDO` y `COMO_SIGUE` como listas cerradas con salida
genérica, igual que `QUE_SE_DESPACHO`.

🔑 **Y el estado se mueve sólo donde la pelota pasa a ser del cliente.** En `sin_stock` el acuse le
pregunta qué prefiere ⇒ va a `esperando_cliente`. En `demora` y `no_llego` estamos esperando **al
correo**: mandarla a `esperando_cliente` afirmaría una espera que ⛔ no es suya, así que la fila se
queda donde está. Es la misma lección que `laEtiquetaEstaDebida`.

🔑 **⇒ el aviso pasa a preguntar lo que su propio texto dice: si se le escribió.** El rastro va al
`historial` con `NOTA_SE_LE_ESCRIBIO` —el **hecho**— y ⛔ **no a `mensajes`**, que son las **palabras**
y que salió de `COLS` a propósito por peso (~1,9 KB por fila): acá ⛔ no llegaría. ⚠️ Las filas viejas
⛔ no tienen la nota, así que avisan igual que antes: esto ⛔ no calla nada retroactivamente.

### Los otros tres momentos, y por qué ⛔ no son «un mensaje más»

- **`revisando`** — `en_revision` significa *«el cliente ya mandó lo suyo»*, puede durar días (el
  aviso salta a los 3) y era el **único momento abierto sin nada que decirle**: la escapatoria era
  «pedir más fotos», que vive adentro del `⋯` porque es una decisión, ⛔ no una respuesta. ⚠️ Se calla
  si se le están pidiendo las fotos: el cliente puede apretar «enviar» sin subir nada.
- **`retorno_recibido`** — el **único movimiento físico del ciclo que ⛔ no se le contaba**. El
  cliente despachó, ya no tiene ni el producto ni la plata, y nadie le decía que llegó. Sale del
  estado que sella Depósito al abrir la caja: **el hecho lo cuenta quien lo hizo**.
- **`cupon_listo`** — misma forma que D5, una vuelta más adelante: sin código la resolución promete
  *«te pasamos el código apenas lo tengamos»*, y `cupon-emitido` lo sellaba **en silencio**. Se lee de
  `cupon_estado === 'hecho'` **y** el código: tildado sin código ⛔ no avisa, porque ⛔ no hay nada que decir.

⛔ **No se agregó un mensaje de cierre**, y ⛔ no es un olvido: la resolución y los hechos posteriores
ya se lo dijeron. Un momento de más cuesta lo mismo que uno de menos.

### ⚠️ Y el test por momento afirmaba la premisa vieja

`tests/reclamos-mensajes-por-momento.test.ts` decía, con todas las letras, que en esos tres casos ⛔
no iba **ningún** mensaje. Era la premisa equivocada —no hay fotos que pedir, pero **sí hay un
cliente al que contestarle**—, y se defendió sola hasta que alguien caminó la operación entera.
📌 [[feedback_areben_premisa_escrita_nunca_medida]]. El invariante nuevo se fija en los dos sentidos:
**el acuse y el pedido de fotos ⛔ nunca conviven, y nunca faltan los dos**, recorriendo los once casos.

## 🆕 🔴 Los rótulos pasaron a infinitivo, y el glosario no tenía quién lo cuidara (29-ago-2026)

`VOCABULARIO.md` §3 dice *«Botón = verbo en infinitivo»* desde que existe, y post-venta tenía **trece
rótulos** en pasado o en tercera persona: «Despaché», «Anulé en GN», «Devolví la plata», «Cobré la
diferencia», «Aceptó», «No aceptó», «Volvió», «Llegó», «Llegaron los N», «Reingresado», «Vendida».
🔴 **Y había cinco tests que los clavaban**, así que renombrarlos ponía la suite en rojo — o sea que
la regla escrita empujaba para un lado y el repo para el otro.
📌 [[feedback_areben_invariante_escrito_no_frena]], cuarta vez en este módulo.

🔑 **La distinción que faltaba, y que ahora está escrita: el botón pide la acción, el OK confirma el
hecho.** §3.1 tiene una **cuarta voz** legítima —primera persona en pasado— y su ejemplo es
*«Sí, ya lo despaché»*: eso es el **OK de un diálogo**, que confirma algo que pasó **afuera** de la
app. El botón de la fila que abre ese diálogo ⛔ no es eso. Los ocho «Sí, ya…» se quedaron **y tienen
su propio test**, porque si alguien los "corrige" a infinitivo el cartel pasa a prometer que la app
va a despachar el pedido.

- El prefijo **`Msj:`** salió: era jerga interna abreviada (§3), y los doce quedaron como `Copiar …`,
  que además es el verbo que el módulo ya usaba para el ticket del cambio.
- 🔑 **El cable es propio y ⛔ no reusa el extractor de rótulos** (`tests/vocabulario.test.ts`): las
  seis familias prohíben **palabras**, que casi nunca significan otra cosa; ésta mira un **tiempo
  verbal**, y el pasado es medio castellano. 📌 Medido: sobre todos los rótulos daba **diez** intrusos
  y **uno solo era un botón**. ⇒ se leen los botones y nada más.
- 🔑 **La regla es del PRIMER verbo**: «Registrar que aceptó» está bien —el gesto es *registrar*—, y
  «Aceptó» a secas ⛔ no.
- ⚠️ **Los que quedaron exceptuados ⛔ no son botones: son opciones de un grupo excluyente**
  («Aceptó: se lo queda», «Se lo queda», «Que vuelva»). Están dibujados con `Button` sólo porque
  `Chips` ⛔ no acepta `disabled` ni `title` por opción, y acá los dos hacen falta. El día que los
  acepte, se mudan y la lista se vacía sola.
- ⚠️ **Canjes tiene la misma forma** («Aceptó» / «No aceptó» en `FichaCanje.tsx`) y ⛔ **no** se tocó:
  la sección se camina con su dueño antes de renombrarle los botones.

---

## 🆕 🔴 La plata ⛔ no sale hasta que el producto vuelva (30-ago-2026)

Es §1.1 del plan de post-venta, y salió de caminar el módulo entero para el mapa operativo: de los
seis verbos que mueven plata o stock, **`reintegro` era el único que escribía sin leer la fila**.
O sea que se podía devolver la plata de un reclamo `en_transito`, con el producto en la calle, y
nada preguntaba nada.

🔴 **Y era peor que un descuido, porque el gesto se tapaba a sí mismo**: tildar el reintegro pone
`reintegro_estado` en `'hecho'`, que es exactamente lo que **apaga** el aviso *«hace N días que la
plata no sale»*. Con la plata afuera y el producto todavía afuera, **el reclamo quedaba mudo**: ni
un reloj corriendo sobre lo único que faltaba.

### 🔑 ⛔ No hizo falta ninguna columna nueva

El dato **ya existía**. `laUnidadVuelve` + `retorno_decidido` contestan si algo tiene que volver, y
`loQueFaltaLlegar` dice qué falta y de qué lista sale. Lo único que faltaba era **que el verbo lo
leyera**. La regla es `faltaRecibirAntesDeDevolver` y vive en `lib/reclamos/efectos.core.js`, al
lado de `faltaAnularAntesDeDescontar` — que hasta hoy era la única regla de **orden** del módulo.

🔑 **Pregunta por UNIDAD y ⛔ no por estado.** Tres de los diez reclamos de BDI tienen dos productos:
con uno recibido y el otro no, «llegó» es falso, y el estado del reclamo es uno solo. La regla mira
`recibida_at` producto por producto, y el texto **nombra el que falta**.

⚠️ **Y vacío ⛔ no es «falta todo»: es que ⛔ no se espera nada.** Una unidad regalada, o una fallada
que el cliente se queda, ⛔ no vuelve nunca — esperar a que llegue dejaría esa plata trabada para
siempre. El cero de `loQueFaltaLlegar` acá **afirma**, y afirma bien: sale de los destinos decididos,
⛔ no de una lista vacía por falta de carga.

### La salida explicada, que ⛔ no es un agujero

`reintegro` acepta `motivo`, y **sólo con un motivo escrito** pasa con el producto sin llegar. Queda
en el `historial` con quién y por qué (*«plata devuelta ANTES de que vuelva el producto: …»*).

🔑 **Sin salida, el día que haya que pagar antes —una amenaza de reclamo formal, un monto chico que
no vale la espera— la plata sale igual, por transferencia, y en el sistema ⛔ no queda nada.** Un
freno sin válvula ⛔ no frena: manda el gesto afuera del sistema, donde no se puede medir.

⚠️ **El botón ⛔ NO se esconde**, cuarta vez que se escribe en este módulo: *una pantalla que esconde
un botón es una sugerencia, ⛔ no una regla*. El freno de verdad es el **409**; la pantalla pregunta,
con el mismo string que contesta el servidor porque **es el mismo string**.

### 🔴 El reloj nuevo, y por qué el aviso casi nace mudo

Con la salida, devolver antes pasa **a propósito** — y una excepción sin reloj es una excepción que
nadie vuelve a mirar. Se agregó a `alertasDe`: **«la plata salió hace N días y el producto todavía
no volvió»**, en rojo, contando desde **`reintegro_at`** y ⛔ no desde `updated_at` (el toque más
probable sobre un retorno que se demora es ir a ver por qué se demora).
📌 **Plazo 0 a propósito**: ⛔ no es una demora que se tolera unos días, es un **estado que no
debería existir**.

🔴 🔑 **Y acá estuvo el defecto que casi se escribe**: el aviso del sidebar baja por `COLS_AVISO`, un
`select` **escrito a mano en `api/_reclamos.js`** al lado de una regla que vive en `tipos.ts`. El
reloj nuevo pregunta por `items`, que ⛔ no estaba en la lista ⇒ **el aviso habría nacido mudo**,
callado y en verde. Ahora `COLS_AVISO` está exportado y lo ata un test con el mismo oráculo que
`COLUMNAS_PARA_CERRAR`: **recortar la fila al select ⛔ no puede cambiar las alertas**.
📌 Lo que cuesta, **medido sobre las filas reales de BDI** y ⛔ no estimado: **775 → 1.365 bytes por
fila** (el listado completo son 2.725). Las caras son `items` (503) y el `historial` que ya viajaba
(575). Se paga porque la alternativa es la regla escrita dos veces.

### Cómo se probó

- **La regla**, con las cinco formas que la rompen: el producto en la calle · ya recibido · nada que
  esperar (`regalada` y la fallada que se queda) · dos productos con uno solo recibido · el
  `mal_armado`, donde lo que vuelve es `items_correctos` y ⛔ no lo que compró.
- **El cable del servidor**: `api/_reclamos.js` corriendo de verdad — 409 sin escribir nada, 200 con
  el motivo y la nota que lo dice, 200 normal con el producto ya recibido, y 404 si no existe.
- **Las dos listas de columnas**, con el oráculo que el Supabase de mentira ⛔ no puede dar (devuelve
  la fila entera pase lo que pase): *recortar la fila al select ⛔ no cambia la respuesta*, una para
  `COLUMNAS_PARA_DEVOLVER` y otra para `COLS_AVISO`.
- **La pantalla montada**: el botón **está** aunque el producto no haya vuelto (y el positivo va
  primero, o el negativo sería vacío), apretarlo **pregunta** y manda el motivo, un motivo en blanco
  ⛔ no manda nada, y con el producto recibido vuelve a ser la confirmación del monto de siempre.
- ✅ **16 mutantes, 16 muertos.**
- 🔴 ▶️ **Lo que ⛔ no se caminó**: nadie apretó el botón sobre una fila real, y sigue sin caminarse
  Retornos con un caso de verdad. La primera vez que esto frene en producción hay que mirarlo.

---

## 🆕 El cupón, con vencimiento (30-ago-2026)

Es §1.2 del plan de post-venta. `cupon-emitido` exigía **el código** desde el 25-ago —lo único que
prueba que el cupón se creó de verdad en la tienda— y ⛔ nada más. Así que el módulo prometía *«te
dejamos un cupón»* **sin saber hasta cuándo**, y el que se enteraba de que había vencido era el
cliente, en la caja, en su próxima compra.

### 🔑 Y la razón grande ⛔ no es la cortesía: es que el breakage ⛔ no existe sin fecha

El cupón se elige sobre la plata porque ⛔ **no hay salida de caja**, se gasta **a precio de lista**,
y **una parte ⛔ no se usa nunca**. Esa última pata es el *breakage* — y **sin vencimiento ⛔ no se
puede medir**: un cupón sin fecha y sin usar ⛔ no está perdido, está **pendiente para siempre**, y
la cuenta ⛔ no cierra nunca. ⇒ el argumento con el que se decide entre cupón y plata ⛔ no era
auditable.

▶️ **Cuánto vale y cuánto tiene que durar sigue siendo de Bruno (B6).** El núcleo ⛔ **no propone
ningún plazo** —y hay un test que lo fija—: lo que cambia es que la fecha ⛔ no pueda faltar, ⛔ no
cuál es.

### La regla, y dónde vive

`leerVencimiento` en **`lib/reclamos/cupon.core.js`**, misma forma que `leerSeguimiento`: acepta
`dd/mm/aaaa` y `aaaa-mm-dd`, devuelve la fecha normalizada o **el motivo en criollo**. La aplica **el
servidor** —una pantalla que valida es una sugerencia— y `api/*.js` ⛔ no puede importar TypeScript.

- 🔴 **Una fecha ya pasada se rechaza, y ⛔ no por formato**: emitir un cupón vencido es mandarle al
  cliente un código que ⛔ no anda, con un mensaje que dice que sí. Es el defecto del código
  inventado, un paso más adelante.
- 🔑 **El día inexistente lo caza el round-trip**: `new Date('2027-02-31')` ⛔ no explota, se acomoda
  sola al 3 de marzo ⇒ el oráculo es **volver a formatear y comparar con lo que se escribió**.
- ⚠️ **El tope de 5 años ⛔ no es política: es un guard de TIPEO** (2062 por 2026 pasa todo lo demás
  y le promete al cliente treinta y seis años).

### Lo que cambió afuera del núcleo

- **`cupon-emitido` exige las dos cosas** y guarda la fecha **normalizada**; el historial anota
  *«cupón emitido: ABC123 (vence 2026-09-30)»*.
- **El mensaje al cliente dice hasta cuándo.** ⚠️ Y si la fila ⛔ no tiene fecha —las anteriores a
  hoy— **calla en vez de inventar** un plazo.
- **El resumen de lo decidido muestra el código y la fecha juntos**: leer «Cupón ABC123» sin hasta
  cuándo es exactamente la pregunta que después se contesta en la caja.
- **La pantalla pregunta dos veces**, y **cancelar la segunda ⛔ no es un error**: es «me arrepentí»,
  y por eso hay un `return` explícito en vez de dejar que el vacío caiga en la validación.
- ⛔ **⛔ No se conecta con `components/cupones/`**, aunque tenga el modelo entero: aquél lo aplica una
  persona **en el mostrador** al cobrar, y éste se usa **online**. Son dos instrumentos, y
  confundirlos es prometerle al cliente un cupón que ⛔ no va a poder usar.

### La migración

`sql/migrate-reclamos-cupon-vence.sql` — `cupon_vence date`, idempotente, **corrida en las dos
bases** y verificada **leyendo la columna** (⛔ no el script).
📊 **Medido antes**: BDI tenía 2 reclamos y ZATTIA 0; con resolución `cupon` **0**, con código
cargado **0**, con el pendiente prendido **0** ⇒ exigir la fecha ⛔ no traba ningún caso en curso ni
rompe ninguna promesa vieja. ⚠️ **NULL ⛔ no significa «no vence»: significa SIN REGISTRAR.**

### Cómo se probó

- El núcleo, con las formas que lo rompen: vacío · ya vencida · el 31 de febrero · el mes 13 · texto
  · el año mal tipeado · y que **⛔ no proponga ningún plazo**.
- El handler de verdad: 400 sin fecha (aunque el código esté), 400 sin código, 400 con una fecha
  pasada, 200 con las dos **guardando la fecha normalizada**, y `cupon_vence` en el `select` del
  listado.
- El mensaje al cliente con fecha y **sin** fecha, y el resumen de lo decidido igual.
- La pantalla montada: pregunta las dos, cancelar la segunda ⛔ no manda **ni reta**, una fecha
  pasada ⛔ no sale de la pantalla, y sin código ⛔ ni pregunta la fecha.
- ✅ **16 mutantes, 16 muertos** — uno sobrevivió por **ancla repetida** (la misma línea existe para
  el seguimiento) y otro pedía un test que mirara **el cartel** y ⛔ no lo mandado.
- 🔴 ▶️ **Lo que ⛔ no se caminó**: ⛔ no hay ningún cupón real todavía, en ninguna de las dos marcas.

---

## 🆕 🔴 «Lo que nos costó» contaba la mercadería en CERO (30-ago-2026)

Es §1.3 del plan. `unit_cost` salió del navegador en la **Fase S** —10 personas mandaban un costo
que ⛔ no veían— y `enriquecerConGN` dejó de resolverlo. De los **tres** handlers que *guardan* el
costo (`_fallas.js`, `_canjes.js` y éste), `api/_reclamos.js` era **el único que ⛔ no lo pedía** ⇒
el techo de la oferta y `costoDelCaso` calculados contra precio de lista, **con la unidad valiendo
nada**.

### Se reusa lo que ya existe

`leerCostos` de **`api/_costos.js`** —cuyo `SECCIONES_CON_COSTO` ya nombraba a `postventa`—, con el
mismo molde que `_fallas.js`: **una sola implementación**, ⛔ no una consulta nueva.

- El costo se resuelve **al crear y al decidir**, por `product_id`.
- 🔑 **Sólo si el campo está vacío**: un `0` tipeado por una persona **quiere decir cero**, y eso ⛔
  no es lo mismo que `null`.
- También en **`items_correctos`**: en un `mal_armado` lo que vuelve es esa lista, y sin completarla
  media cuenta seguía en cero.
- ⚠️ **Si Gestión Nube falla, el reclamo se crea igual.** Hay un cliente enojado del otro lado y el
  costo se completa después; ⛔ no poder abrir el reclamo es peor.

### 🔑 Y al decidir, el número de la pantalla queda viejo POR DEFINICIÓN

Si el servidor completó algún costo, el `costo_caso` que mandó la pantalla se calculó **con la
unidad en cero** ⇒ se recalcula con **`costoDeLaFila`**, la *misma* función que usa la pantalla, ⛔
no una copia. Y **si ⛔ no completó nada, se respeta lo que vino**: el servidor ⛔ no le discute un
número a la pantalla sin motivo.

### 🔴 Prender el costo destapó que la cuenta miraba la CABECERA

Con los costos en cero esto ⛔ **no cambiaba ningún número**, así que el defecto era invisible. Con
costos de verdad decide plata en **3 de cada 10 reclamos de BDI** —los de dos productos—: con un
solo destino, o se contaban **las dos** unidades como perdidas o **ninguna**. El destino por unidad
existe desde el 25-ago; **la cuenta ⛔ no se había enterado.**

🔑 Ahora `costoDelCaso` pregunta **por unidad** (`seLaQueda`), con la cabecera como **default** de la
que ⛔ no trae el suyo — el mismo patrón que el resto del módulo. Y sale de **`laUnidadVuelve`**, ⛔
no de una lista escrita al lado.

🔴 **Y de paso arregló algo que el propio docstring ya prometía**: *«si vuelve —sana o fallada— se
recuperó»*. La condición vieja contaba `'falla'` como perdida **aunque se hubiera pedido el
retorno**, y esa unidad vuelve y **se valúa en el ledger de Fallas** ⇒ **se contaba dos veces**, en
los dos únicos lugares que dicen cuánta plata se pierde.

### Cómo se probó

- La cuenta por unidad: dos productos con destinos distintos · la fallada que vuelve (⛔ no se
  cuenta) contra la que el cliente se queda (sí) · la unidad sin destino propio heredando el del
  reclamo · sin producto en juego, cero · y que `costoDeLaFila` **pase el retorno** en vez de
  perderlo en el camino.
- El handler de verdad, con `leerCostos` mockeado: completa al crear · ⛔ no pisa un `0` cargado a
  mano **ni cuando la consulta sí se hace** por otro producto · completa `items_correctos` · un
  producto que ⛔ no está en GN queda como vino · **si GN falla, el reclamo se crea igual**.
- Al decidir: completa un reclamo viejo y **recalcula** el `costo_caso`; y si ⛔ no completó nada
  respeta el de la pantalla **aunque ⛔ no coincida** (el número de prueba es uno que la cuenta ⛔ no
  daría, para que el test ⛔ no sea vacío).
- ✅ **13 mutantes, 13 muertos.** Dos sobrevivieron a la primera vuelta y **los dos eran huecos
  reales**: el filtro de afuera **tapaba** al guard de adentro (el `0` a mano), y el test del «no
  recalcules» usaba un número que **coincidía** con la cuenta.
- ✅ **Caminado EN VIVO contra prod, 7 de 7** (`scripts/caminar-costo-mercaderia.mjs`), con dos filas
  sembradas y borradas y **las 2 reales intactas**. 🔑 **Y es el único oráculo de deploy que tenía
  este cambio**: ⛔ no agrega ningún texto al bundle, así que el verificador de chunks ⛔ no sirve —
  lo que dice «esto está en prod» es **el comportamiento**. Producto de control: *ZOEY CASE*,
  costo **1.359,76**, leído de `productos` por otro camino que el hecho.
- ⚠️ **Todo lo de arriba corre con `leerCostos` MOCKEADO**: comprueba que el handler lo *pide*, ⛔ no
  que la consulta real devuelva algo. Por eso la caminata ⛔ no es opcional acá.
- 🔴 ▶️ **Lo que sigue sin caminarse**: las dos filas reales de BDI tienen los ítems **sin
  `product_id`** desde antes ⇒ su costo ⛔ no se completa solo, ni al decidir. Se llena el día que
  esos ítems se re-enriquezcan, o a mano.

## 🆕 🔴 El medidor: reclamos registrados por cada 100 ventas online (30-ago-2026 — §5)

**Antes de esto la sección ⛔ no tenía un solo número que dijera si el módulo está midiendo bien.**
El plan lo pone como lo **primero** del §5, antes que cualquiera de los cuatro diales de la válvula:
el día que el alta pública multiplique los casos hay que decidir cuál se mueve, y esa decisión sin
manómetro se toma de memoria.

Vive en `lib/reclamos/medidor.core.js` (la regla, importada por el handler),
`api/_reclamos.js` § `vista=medidor` (las tres consultas), `lib/reclamos/medidor.ts` (lo que baja el
navegador y cómo se escribe) y `components/reclamos/Medidor.tsx` (la tabla). Sale **sólo en el modo
de Administración**, debajo de los cuatro KPI.

⚠️ **Está en `medidor.ts` y ⛔ no en `cliente.ts` a propósito**: ese archivo lo estaba tocando otra
sesión (D12) y en este checkout ⛔ no hay merge.

### 🔴 El número ⛔ no es la tasa de reclamos: es lo que se REGISTRÓ

BDI tenía, al construirlo, **2 reclamos registrados contra 283 ventas online de agosto**. Esa
distancia ⛔ no es una tasa baja: **el reclamo que se resuelve en un chat de WhatsApp ⛔ no deja
fila**. El cociente mide dos cosas a la vez —cuánta gente reclama y cuánto se anota— y el formulario
público va a mover **las dos juntas**, sin que se puedan separar.

Por eso salen **seis meses juntos y ⛔ nunca un número solo**, y por eso ⛔ no entra en un `KpiCard`:
un número pelado, sin los meses de atrás al lado, **se lee como una tasa**. Es
`feedback_areben_el_espejo_mide_hoy_no_la_espera` por la otra punta — leer como «subió» el primer
mes que se conoce.

### 🔴 El cero que iba a afirmar, y cómo se lo hace callar

Marzo a julio de 2026 dan `0 / 173`, `0 / 161`, `0 / 125`, `0 / 124`. Dibujar ahí «0,0 cada 100»
**afirma que nadie reclamó** en meses en los que lo que pasaba es que **nadie registraba**: el
módulo entró en agosto. Con esos ceros puestos, el primer mes con formulario se lee como un
aumento — que es exactamente lo que el §5 pide ⛔ no dejar pasar.

⇒ La tercera consulta del handler pregunta por **el primer reclamo que registró la base, mirando la
tabla entera y ⛔ no la ventana de seis meses**. Los meses anteriores salen con
`sinNumero: 'sin-registro'` y `cada100: null`, y la pantalla escribe *«todavía no se registraban
reclamos»*. **El instrumento dice desde cuándo mide.** Preguntado adentro de la ventana, el mes más
viejo siempre parecería el primero con registro.

Lo mismo con el denominador: un mes **sin ventas online** da `null` y ⛔ nunca 0 — sin denominador
⛔ no hay cociente, y un 0 ahí afirma sobre un mes en el que ⛔ no se vendió nada.

⚠️ **Lo que un cero legítimo sigue sin poder decir**: que en un mes con registro andando ⛔ no se
haya anotado ningún reclamo ⛔ no quiere decir que no los hubo. Eso ⛔ no lo arregla ningún cálculo —
lo dice la pantalla, al lado del número.

### Las tres decisiones de qué se cuenta

1. **Arriba, el reclamo ABIERTO EN EL MES** (`created_at`), ⛔ no el que hoy sigue abierto: un stock
   dividido por un flujo da un número que ⛔ no existe.
2. **`anulado` ⛔ no cuenta**, y ⛔ no es un criterio inventado: es lo que ya dice el confirm de la
   pantalla al anular —*«queda registrado pero deja de contar»*—. Importa justo cuando el alta
   pública empiece a producir duplicados.
3. **Abajo, el canal `online`, que hoy es EXACTAMENTE «Tienda Nube»** (medido sobre las 4.694 ventas
   de BDI desde marzo: es el único nombre que cae en `online`; Mercadolibre y Whatsapp caen en
   `otro`). Tiene que ser ése: un reclamo cuelga de una **orden de Tienda Nube**, así que meter
   Mercadolibre abajo agranda la población del divisor con ventas que ⛔ no pueden aparecer arriba.
   La clasificación se **importa** de `canalDe` y ⛔ no se copia.

### 🔴 Las dos formas silenciosas de romperlo, las dos cazadas por un mutante

- **Paginar sin `order`.** Medido contra la base de BDI: pedir las ventas por páginas de 1.000 **sin
  orden** devolvió **4.694 filas con 3.554 ids únicos** —repitió unas y se comió otras— y agosto pasó
  de **283 ventas online a 89**. Un denominador chico **infla** el cociente ⇒ el modo de falla de
  este número es **exagerar el problema, callado**. Y `date_sale` ⛔ no sirve de orden: se repite
  decenas de veces por día. Las dos consultas van por `leerTodo` **ordenadas por `id`**.
- **El huso.** `created_at` es UTC y `date_sale` es una fecha ya local: cortar los dos por
  `slice(0,7)` manda al mes siguiente cada reclamo abierto **después de las 21:00 del último día del
  mes**. Y el handler corre en Vercel, o sea en UTC: entre las 21:00 y las 24:00 del 31 la ventana
  entera se corría un mes. Las dos puntas salen de `diaArgentino`, **importada**.

### Cómo se verificó

- **El instrumento se estrenó reproduciendo la medición vieja**: las ventas online de BDI de abril a
  agosto —**173 · 161 · 125 · 124 · 283**— corridas por la función de verdad contra la base real.
- **22 mutantes, 22 muertos**, y **un mutante inocuo de control que SOBREVIVIÓ** — lo único que
  prueba que el arnés ⛔ no mata todo por igual. Tres escaparon en la primera vuelta: uno por un
  **ancla mal apuntada** (⛔ no por falta de test), el del huso en el servidor y **el de la marca**
  —la tabla ⛔ no lleva la marca escrita, así que sin recargar mostraría los números de BDI abajo
  del encabezado de Zattia—; los dos últimos ⛔ no los miraba nadie y tienen su test desde entonces.
- 🔴 **Y una que el CI cazó y esta ficha ⛔ no puede omitir**: el primer push salió **rojo**.
  `npx tsc` se había corrido **antes de escribir los tests**, y el `@param` de un parámetro
  **desestructurado** escrito suelto (`@param {object[]} reclamos` en vez de `@param {object[]}
  p.reclamos`) le dice a TypeScript que el objeto ENTERO es un `object[]` ⇒ nueve llamadores
  tipados en rojo, con la función andando perfecto. El lint pedía además el `setState` **adentro
  del `await`**, ⛔ no en el cuerpo del effect. ⇒ **las cuatro puertas del CI —typecheck, lint,
  tests y build— se corren DESPUÉS del último archivo escrito, ⛔ no en el medio.**
- **La regla y el cable, los dos**: `tests/reclamos-medidor.test.ts` (la función),
  `tests/reclamos-medidor-servidor.test.ts` (el handler de verdad: qué le pide a la base) y
  `tests/reclamos-medidor-pantalla.test.tsx` (lo dibujado, montando **Reclamos entera**).

### ▶️ Lo que queda

- **Zattia ⛔ no se pudo medir desde acá**: `ZATTIA_SUPABASE_SERVICE_KEY` vive sólo en Vercel y la
  anon ⛔ no puede leer `ventas` (`permission denied`). Se verifica **abriendo la pantalla en prod
  con la marca en Zattia**. Si esa base ⛔ no tiene la tabla sincronizada, el medidor **rompe con el
  error a la vista** y ⛔ no contesta un cero — está atado por test.
- **Todavía ⛔ no hay línea de base.** El primer mes con formulario público ⛔ no se compara contra
  nada: el número que salga ⛔ no es «subió», es **el primero que se conoce**.

## 🆕 🔴 La llave del alta pública: orden + mail (30-ago-2026 — §2, paso 1)

⚠️ **El código de esto ⛔ NO está en este repo**: vive en `bdi-catalogo`
(`api/_verificacion-orden.js` + la rama `?orden=` de `api/tiendanube-audit.js`), que es el único que
habla con la API de Tienda Nube. Se anota acá porque **la sección que lo usa es ésta**.

El alta pública deja que el cliente abra su propio reclamo sin login. El número de orden **solo ⛔ no
alcanza**: es correlativo, así que tipear el de al lado es abrir el pedido de otra persona. La llave
es **el mail con el que compró** — ya está en **280 de las 283** ventas online de agosto, o sea que
⛔ no hay que pedirle un dato nuevo a nadie.

### 🔑 El dato ya llegaba, y se tiraba una línea después

La primera lectura del problema fue *«hay que traer el mail de algún lado»*, y salieron dos ideas
malas: cruzar `ventas.client_email` (que existe, pero está indexado por el **número de Gestión
Nube** —30599— y ⛔ no por el de Tienda Nube —21033—) o sincronizar una tabla nueva.

Ninguna hacía falta. `tnFetchOrden` pide la orden **completa y sin `fields`** (con `fields` el GET
por id da 404), así que **Tienda Nube ya mandaba el mail** y `mapOrdenTN` lo descartaba al quedarse
con sus 25 campos. ⇒ la comparación va **antes de mapear**, y la orden cruda ⛔ no sale nunca de esa
función: devolverla para que compare el llamador dejaría el mail a un `return` de la respuesta.

### Los dos caminos, separados por el MÉTODO

| | |
|---|---|
| `GET ?orden=N` | como siempre: la orden entera, para Cambios y Devoluciones del Monitor |
| `POST ?orden=N` body `{ mail }` | el alta pública: contesta **sólo si coincide**, y **sin un solo monto** |

Lo que sale por el camino público son **tres cosas**: `number`, `cliente` y los productos
(`product_id`, `variant_id`, `name`, `sku`, `quantity`). ⛔ Ni total, ni precios, ni forma de pago,
ni tracking, ni dirección. El alta necesita saber **qué compró**, ⛔ no cuánto pagó.

### 🔴 Falla cerrado, y las tres puertas contestan IGUAL

Deja pasar **sólo** cuando hay un mail pedido, la orden trae uno, y son el mismo. La que importa es
la tercera: **una orden que ⛔ no trae mail ⛔ NO abre**. Escrito como `if (suyo && suyo !== pedido)`
—que es como sale solo— dejaría entrar a cualquiera justo en el caso raro, que es donde nadie mira.

Y el **mismo 404** para «no existe», «sin mail» y «no coincide»: distinguirlos convierte al endpoint
en un oráculo de *«¿existe la orden N?»* sobre una numeración correlativa. Mismo criterio que el 404
pelado de `api/_reclamo.js`.

⚠️ **El mail entra SÓLO por el body, y `?mail=` en la URL se rechaza con 400.** Una query string
queda escrita en el log de acceso, en el historial del navegador y en el `Referer` de lo que la
página cargue después.

### ⛔ Lo que la comparación no hace

Normaliza espacios y mayúsculas, **nada más**. ⛔ No saca los puntos de Gmail ni el `+tag`: cada
indulgencia **ensancha el conjunto de strings que abren la puerta**. Una llave que perdona ⛔ no es
una llave.

### Cómo se verificó

- **11 mutantes, 11 muertos**, con **dos controles inocuos vivos**. Dos que escaparon en la primera
  vuelta eran agujeros de verdad: un mail que es **pedazo** del verdadero (`vic@` está adentro de
  `victoria@gmail.com` si la comparación fuera por substring) y **el empate de dos vacíos** — TN
  manda `""` y ⛔ no `null` en lo que nadie llenó, así que sin el filtro de forma `"" === ""` abría.
- 🔴 **El arnés medía el modo aviso, ⛔ no el guard.** `_auth.js` de `bdi-catalogo` arranca en
  `MODO_AVISO`: sin credencial **avisa y deja pasar**. En producción está `AUTH_MODO_AVISO=0`. El
  arnés lo fija ahora, y sin eso un `exigirUsuario` que faltara habría salido **verde**.
- **Caminado contra producción con la orden real 21033**: el mail correcto abre y sale sin mail, sin
  plata y sin dirección; **una letra cambiada da 404**; el `GET` de siempre sigue andando.
- Los arneses (`node scripts/check-verificacion-orden.mjs` y `check-orden-verificada.mjs`) **corren
  en CI** desde ahora — el repo ⛔ no tenía ninguno corriendo.

### ✅ La duda que quedaba, contestada

`?orden=N&mail_diag=1` **(con usuario del padrón)** contesta **sí o no, ⛔ nunca cuál**: existe
porque toda la llave se apoya en que TN mande `contact_email`, y eso ⛔ no se podía saber leyendo el
código — el mapper lo tiraba, así que nadie lo había mirado nunca. Medido en las dos órdenes reales
de BDI: **`tiene_mail: true` en las dos**.

### ▶️ Lo que sigue

- ✅ 🔴 **`GET ?orden=N` SE CERRÓ el 30-ago-2026** (decisión de Bruno, en el momento). Estuvo abierto
  a internet y devolvía **nombre del comprador, lo que pagó, forma de pago, cupón usado, lo que nos
  cuesta el envío, el número de seguimiento** y cada producto con SKU y precio — por un número
  **correlativo** (van por el 21.100) y con el repo **público en GitHub**.
  🔑 **No era una decisión, era un olvido**: la migración a `apiFetch` ya se había hecho y el
  encabezado de `lib/tn-audit.ts` la daba por terminada —*«el único que quedaba así»*—. Quedaban
  **dos**: `buscarOrden` (Reclamos y Cambios) y `verificarOrden` (Canjes). Y el `MODO_AVISO` de
  `_auth.js` de `bdi-catalogo`, que existe justo para esa transición, hacía que una llamada sin
  credencial **avisara y pasara** ⇒ ⛔ nada se ponía rojo de ningún lado.
  ⚠️ **El orden importó**: primero los dos llamadores mandando la credencial y **verificado el
  deploy en prod**, después el guard del servidor. Al revés rompe Reclamos, Cambios y Canjes.
  🔑 **El `POST` verificado ⛔ NO pide padrón, a propósito**: su llave es el mail del comprador, que
  es de quien reclama. Dos puertas con dos llaves distintas, y el test lo fija por las dos puntas —
  un guard que rechaza a todo el mundo también pasa el test de «rechaza».
  ✅ Caminado en prod: sin credencial **403**, con credencial del padrón **200 como siempre**, y el
  POST del cliente sigue contestando 404 sin pedir nada.
  ✅ **Y caminado EN EL NAVEGADOR por Bruno el 30-ago-2026**: `/postventa?tab=reclamos`, orden 21033,
  aparece con sus 2 productos. Era el único paso que ⛔ no se podía dar desde acá —el servidor
  aceptando la credencial y un test fijando que el front la manda ⛔ no son que **el botón se pueda
  apretar**— y es la mitad que este repo ya pagó antes
  ([[feedback_areben_deploy_llego_pero_la_puerta_no_se_aprieta]]).
- **El tope por rato** desde el mismo origen (freno 2 de los tres del §2) ⛔ no existe todavía: hoy
  el mail se puede probar sin límite.
- 🔑 **El cruce lo tiene que hacer quien ESCRIBE.** Este endpoint es la primitiva; el handler que
  cree la fila tiene que llamarlo **servidor a servidor** y ⛔ no confiar en que el navegador ya
  verificó.

## 🆕 🔴 El alta pública, paso 2: la puerta que CREA (30-ago-2026 — §2, paso 2)

El paso 1 fue la llave —orden + mail, en `bdi-catalogo`—. Esto es la puerta: el endpoint que **crea
el reclamo**, y las cinco opciones en criollo entre las que el cliente elige.

⚠️ **Falta la pantalla.** Lo que hay es el núcleo y el servidor, con sus dos tests corriendo el
handler de verdad. `components/reclamos/ReclamoPublico.tsx` —que hoy es el portal de un reclamo que
ya existe— todavía ⛔ no tiene la vista del alta.

### 🔴 🔑 Lo primero, porque es donde esto se rompe si se lo escribe cómodo

**La verificación corre en el SERVIDOR, adentro del mismo pedido que crea la fila.**

Lo natural es que el formulario llame a la verificación, muestre los productos, y después postee
*«creá el reclamo con estos productos»*. Escrito así **la llave ⛔ no sirve para nada**: el segundo
POST lo escribe cualquiera con `curl`, sin haber pasado nunca por el primero. La llave tiene que
volver a girar del lado de adentro.

⇒ `api/_reclamo.js` le pega él mismo a `bdi-catalogo` con el mail en el **body**, y de la orden que
vuelve —⛔ no del body— salen **los productos y el nombre del cliente**. El cliente manda
**índices**, ⛔ no productos: un índice sólo puede señalar algo que ya está en la orden verificada.

📌 Y por eso el alta está escrita **antes** del guard del token, que es la única acción que puede
hacerlo: todavía ⛔ no hay token que mostrar — crearlo es lo que viene a hacer.

### Las cinco opciones ⛔ no son motivos: son FAMILIAS

Adentro hay once motivos y el cliente ⛔ no puede elegir entre ellos, porque **la diferencia entre
los de una familia ⛔ no la sabe él**: si la publicación está objetivamente mal o si era una
expectativa suya lo decidimos nosotros con la ficha delante; si el paquete se perdió o sólo está
demorado lo dice el seguimiento.

| lo que ve el cliente | entra por | y puede terminar en |
|---|---|---|
| Me llegó fallado | `falla` | — |
| No es lo que esperaba | `no_esperaba` | `no_como_publicado` |
| Me quedó mal el talle | `talle` | `arrepentimiento` |
| Me falta algo, o me llegó otra cosa | `faltante` | `mal_armado` · `excedente` |
| Todavía no me llegó | `demora` | `no_llego` |

Las familias salen de `MOTIVOS_VIGENTES` y ⛔ no de una lista escrita al lado. El **cable**: todo
motivo vigente tiene puerta **o está nombrado en `SIN_PUERTA_PUBLICA` con el motivo** —hoy sólo
`sin_stock`, porque el cliente ⛔ no se enteró de que le vendimos algo que no teníamos—. Un motivo
nuevo sin puerta pone el test en rojo en vez de quedarse afuera callado.

### 🔴 Con cuál de la familia ENTRA, y por qué ⛔ no da lo mismo

**Un toque del cliente ⛔ no puede afirmar lo que él no sabe ni encender trabajo que nadie decidió.**

- 🔴 **La entrada ⛔ nunca nace con un pendiente prendido.** `crear` enciende `reclamo_correo_estado`
  en `no_llego` —el reclamo al transportista— y `tn_stock_estado` en `sin_stock`. Entrar por ahí
  sería que **apretar un botón le ponga a alguien una tarea en la lista** sobre un hecho que todavía
  no se miró. Por eso «todavía no me llegó» entra por `demora`: ⛔ no afirma que se perdió nada, y
  `no_llego` lo pone una persona cuando el seguimiento lo dice. **Está atado por test contra el
  texto de `api/_reclamos.js`**, así que si `crear` cambia de forma, avisa.
- 🔴 **La entrada ⛔ nunca es un caso en que el cliente no sea el perjudicado.** `excedente` es que le
  llegó algo **de más**: ⛔ no le falta nada, ⛔ no hay expectativa que cumplirle, y toca una
  **segunda venta** que abre una persona.
- **Entre dos de la misma familia entra la que ⛔ no afirma culpa nuestra**, porque afirmarla ya es
  plata: `no_como_publicado` con su escenario objetivo regala el envío, y el propio perfil dice que
  **la decidimos nosotros** (`decideCliente: false`).

⚠️ El camino de vuelta ya existe: `reclasificar` muda el caso conservando número, fotos e historial.
Entrar por el motivo más callado ⛔ no pierde nada.

🔑 **El ESCENARIO ⛔ no lo toca el cliente**, y ⛔ no hay una sola opción que lo escriba.

### Las fotos salen del perfil que ya existe

`fotosEnElAlta` deriva de `PERFIL_MOTIVO[entra].fotos`: `'nunca'` → ⛔ no se piden (pedirle una foto
a quien ⛔ no recibió el paquete es pedirle una foto de la nada), `'siempre'` → se exigen, el resto
→ se ofrecen.

⚠️ **«Exige» es de la PANTALLA, ⛔ no del servidor.** El alta crea la fila **sin fotos** a propósito:
entran después por `accion: 'foto'` del portal, que ya existe, tiene tope de 6 y sube al Blob.
Trabar la creación por una foto es perder el reclamo entero en el momento en que la cámara falla — y
el caso queda **afuera del sistema**, que es lo que este módulo vino a evitar.

### Los tres frenos

1. **Un reclamo abierto por orden.** Si ya hay uno, se devuelve **el token del que ya existe**. Es
   seguro —quien pregunta ya probó el mail de esa orden— y es lo único que ⛔ no deja al cliente
   golpeando una puerta cerrada, que es como termina abriendo el segundo reclamo por WhatsApp, o sea
   **afuera del sistema**.
2. **Un fusible por hora y por marca** (`TOPE_ALTAS_POR_HORA = 20`). ⚠️ ⛔ No es un antiflood por
   persona —de eso ya se encargan la llave y el freno 1—: es para el día que algo se rompa de un modo
   que nadie previó, y **deja rastro en el log** o es un freno que nadie va a mirar. 📊 El número sale
   de lo medido: BDI hizo **283 ventas online en agosto**, ~9 por día.
3. **Sin cruce, nada.** Y los dos frenos corren **después** del cruce: al revés, un «ya tenés uno
   abierto» le contestaría a cualquiera que tipee números, y ese 200 sería el oráculo de que la orden
   existe.

⛔ **Ninguna tabla nueva**: los dos leen `devoluciones`, que ya tiene el dato. Una tabla de intentos
sería un lugar más donde guardar mails de gente.

### La fila que nace

`borrador`, con `usuario: 'cliente'` —que es lo que separa el alta pública de las internas **sin una
columna nueva**— y con **los cuatro pendientes en `'no_aplica'` planos**, ⛔ no derivados como en
`crear`: los dos motivos que nacen con algo prendido ⛔ no pueden ser motivo de entrada, y eso está
atado por test. ⛔ **Ni un monto, ni escenario, ni compensación.**

### 🔴 Lo que destapó construirlo: la CUARTA copia de la regla del portal

`reemitir-token` decidía con **los tres estados escritos a mano** en un `includes`, al lado de un
`select('estado')` que ⛔ no traía `compensacion`. Pero un cambio decidido **vuelve a `borrador` a
propósito**, a esperar que el cliente pague ⇒ el verbo acuñaba un token nuevo, contestaba «listo», y
**el portal después le daba 404 al cliente**: el link regenerado ⛔ no servía y ⛔ nada lo decía. El
que se enteraba era el cliente, del otro lado de WhatsApp.

Es D16 otra vez —dos listas, una en cada lado de la puerta— con el agregado de que acá el `select` a
mano dejaba **el freno mirando `undefined`**. Ahora la pregunta (`elLinkSigueVivo`) y las columnas
(`COLUMNAS_DEL_PORTAL`) salen las dos de `portal.core.js`.

🔑 **Y el token se acuñaba a mano en dos lugares** (`crear` y `reemitir-token`), y el alta iba a ser
el tercero. `nuevoToken` y `venceElLink` bajaron a `portal.core.js`, que es donde vive la regla del
link. ⚠️ Con `globalThis.crypto` y ⛔ **no** `node:crypto`: ese archivo lo importa `botones.ts`, o sea
que **entra al bundle del navegador**.

### Cómo se probó

- **31 mutantes, 31 muertos**, con **dos controles inocuos vivos** (cambiar un texto de ayuda,
  cambiar un comentario). Los dos que escaparon en la primera vuelta eran de verdad:
  - 🔴 **el test del vencimiento leía la misma constante que estaba fijando** (`DIAS_DEL_LINK` contra
    `DIAS_DEL_LINK`) ⇒ bajarla a un día lo dejaba **verde**. El número va escrito en el test.
  - **el guard del código HTTP ⛔ no se ejercía**: el arnés hacía que un «no ok» viniera siempre con
    un cuerpo vacío, así que sacar `if (!r.ok)` ⛔ no rompía nada. El caso que lo mata es **un cuerpo
    que parece bueno con un código que no lo es**.
- **La regla y el cable, los dos**: `tests/reclamos-alta-publica.test.ts` (las opciones y las dos
  reglas duras) y `tests/reclamos-alta-publica-servidor.test.ts` (el handler corriendo: qué le pide a
  Tienda Nube, qué inserta, y que lo del body se ignore). Y `tests/reclamos-link-regenerado.test.ts`,
  que ⛔ **no existía**: `reemitir-token` ⛔ no tenía un solo test.
- ⚠️ **⛔ Sin migración**: ninguna columna nueva.
- ✅ **Caminado contra PRODUCCIÓN, 16 de 16** (`node scripts/caminar-alta-publica.mjs`), con una fila
  sembrada y borrada y **las 2 reales intactas**. 🔑 **El oráculo del deploy es el comportamiento y ⛔
  no el chunk**: el alta vive en una función serverless, que ⛔ no entra al bundle ⇒ lo que se mira es
  que un alta mal formada conteste **400** donde antes contestaba **404** (la puerta del token).
  🔑 **Y el oráculo de lo escrito viene por otro camino que el hecho**: se escribe por la API pública
  y **la fila se lee cruda por PostgREST** con la service key.
  ⚠️ **Conseguir el mail para caminarlo ⛔ no es trivial, a propósito**: `mail_diag` contesta sí o no
  y ⛔ nunca cuál. Se cruzó el nombre que devuelve el `GET` interno de la orden contra
  `ventas.client_email` — y eso ⛔ **no es la llave**, es una casualidad de tener las dos puntas.
- 🔑 **Los dos frenos se caminaron con casos reales**: la orden **21100**, que ya tiene un reclamo
  abierto, contestó **200 con el token del que ya existe** y ⛔ no creó nada (siguieron siendo 2
  filas); y el segundo alta sobre la fila recién sembrada devolvió **el mismo link**.

### ▶️ Lo que queda

- ✅ **La pantalla salió el 30-ago-2026** — ver la sección de abajo.
- **El link, ⛔ no está decidido dónde vive**: qué URL se le manda al cliente y desde dónde
  (¿el mail de la compra? ¿el pie de la web?). Es de Bruno.
- ⚠️ El alta ⛔ no toma relato: el cliente lo escribe **después**, en el portal, con `accion: 'enviar'`
  —que es el que ya existe—. Son cuatro toques y una foto, sin un solo campo de texto obligatorio.

---

## 🆕 El alta pública, paso 3: LA PANTALLA (30-ago-2026 — §2, y con esto §2 está entero)

**Por dónde se entra: `/reclamo?m=bdi`** (o `m=zattia`). Es la misma ruta del portal del cliente,
**sin token** — ⛔ no una ruta nueva: cada ruta de Next es una función serverless y el proyecto está
en el tope del plan Hobby, donde pasarse **frena todos los deploys en silencio**.

🔴 **`/reclamo` pelado ⛔ no era «un link vencido»: era la puerta que faltaba.** Hasta hoy, sin token
la pantalla contestaba *«este link ya no está disponible»*, que es exactamente lo que hay que
contestarle a un token que ⛔ no sirve **y** lo contrario de lo que hay que contestarle a alguien que
viene a abrir un reclamo. Las dos mitades viven en el mismo `if`, y por eso se prueban juntas.

### Los cuatro toques, y quién decide qué

| paso | qué ve | de dónde sale |
|---|---|---|
| ⓪ | ¿Dónde compraste? *(sólo si el link ⛔ no lo dice)* | `TIENDAS_DEL_ALTA` |
| ① | pedido #____ + el mail con el que compraste | se cruza contra Tienda Nube, **en el otro repo** |
| ② | «Hola Victoria, éste es tu pedido #21033» + los productos | **la orden verificada**, ⛔ no lo tipeado |
| ③ | ¿qué pasó? — cinco opciones en criollo | `OPCIONES_PUBLICAS`; el motivo lo decide el servidor |
| ④ | subí unas fotos | **el portal, que ya existía**: la misma pantalla sigue con el token nuevo |

🔑 **El ④ ⛔ no se escribió de nuevo, y eso es la mitad del trabajo.** Apenas la fila existe, la
pantalla se queda en el portal con el token que devolvió el alta —⛔ sin navegar a `/reclamo/<token>`
en el medio, que es donde se pierde la mitad de la gente—. Una segunda pantalla de fotos sería una
segunda regla de cuántas entran y de cuándo se puede enviar.

### 🔴 Lo que la vuelve segura, dicho una vez

- **Al alta viajan ÍNDICES, ⛔ no productos.** La pantalla muestra la orden, pero lo que postea es
  `[0,1]` y el mail: **la llave vuelve a girar del lado del servidor**, en el mismo pedido que crea
  la fila. Si viajaran los productos, verificar el mail ⛔ no serviría de nada.
- **El mail va en el body en las dos puntas**, ⛔ nunca en la query string.
- **Un «no» ⛔ no explica por qué**: el cartel es uno solo —el mismo que contesta el servidor— para
  «no existe», «no trae mail», «no coincide» y «el otro repo se cayó».
- 🔴 **Un cuerpo que parece bueno con un código que ⛔ no lo es, en las DOS llamadas.** Es el mutante
  que sobrevivió en el servidor la vez pasada, y acá volvió a aparecer **en el alta**: un
  `{ok:true, token}` con un 500 encima —un deploy a medio subir, un proxy en el medio— dejaría a la
  persona en un portal con un token que ⛔ no existe, **creyendo que cargó el reclamo**.
- ⚠️ **«Ya tenías uno abierto» ⛔ no se sigue de largo.** El servidor devuelve el token del que ya
  existe; entrar derecho al portal le mostraría un reclamo **con otros productos y otro motivo** como
  si fuera el que acaba de cargar. Se lo dice y le da el botón.
- **Sin marca en el link se PREGUNTA.** Suponer BDI le contestaría «no encontramos ese pedido» a todo
  Zattia, y ese «no» ⛔ no se distingue de la llave equivocada.

### 🔴 Lo que destapó construirla: el portal exigía una foto SIEMPRE

Y hay casos que ⛔ no tienen ninguna: en `no_llego`, `demora` y `sin_stock` el paquete no está, así
que **el botón de enviar ⛔ no se prendía nunca** y el reclamo se quedaba en `borrador` para siempre.
Del lado del cliente eso se ve igual que «el link no anda», y le pasa **al caso más caro de dejar sin
atender**. Con el alta pública dejó de ser hipotético: *«Todavía no me llegó»* es **una de las cinco
opciones** que puede tocar cualquiera.

🔑 **La regla ya existía y ⛔ no llegaba hasta ahí.** `pideFotos` vivía sólo en `tipos.ts`, o sea en
TypeScript, y `api/_reclamo.js` ⛔ no puede importar TS ⇒ bajó a `casos.core.js`
(`pideFotosAlCliente`), `tipos.ts` se quedó con la cara tipada, y **`fotosEnElAlta` dejó de comparar
el string por su cuenta**. Es la quinta vez que este módulo se rompe por la misma forma —la regla de
un lado de la puerta y una copia del otro—, y ahora hay un test que las compara motivo por motivo.

⚠️ **Lo que viaja al cliente es la RESPUESTA, ⛔ nunca el motivo**: publicar `motivo` le diría «esto
entró como demora» sobre una clasificación que todavía ⛔ no miró nadie. Y **`undefined` vale
exigir**: entre el deploy de la pantalla y el de la función serverless hay minutos en que el GET
viejo sigue contestando, y ahí el default seguro es el que la pantalla hizo siempre.

### ⚠️ STUNNED ⛔ no tiene puerta, y ⛔ no es un olvido

`bdi-catalogo` **sí** atiende `store=stunned`, así que copiar de allá las tres tiendas parece
prolijo. Pero los reclamos de Stunned vivirían en la base de **Zattia**, donde el freno de «un
reclamo abierto por orden» compara `(store, orden_tn)`: dos órdenes distintas —una de Zattia y una
de Stunned— pueden tener **el mismo número**, y ahí el freno le contestaría a una persona **el token
del reclamo de otra**. ⇒ la tercera puerta se abre con **la columna que las separa**, ⛔ no con una
línea en la lista. Está escrito en `TIENDAS_DEL_ALTA` y atado por test.

### Cómo se probó

- **19 mutantes, 19 muertos, 2 controles inocuos vivos** (un texto de ayuda, un comentario). El que
  escapó en la primera vuelta era real: el guard del código HTTP **del alta** ⛔ no se ejercía, porque
  el error que probaba el test venía sin `ok:true` adentro.
- **Se MONTA la pantalla, ⛔ no se lee el fuente** (`tests/reclamos-alta-publica-pantalla.test.tsx`,
  jsdom + `createRoot` + `act`): los pasos existen recién después de que la persona toca, y
  `renderToStaticMarkup` ⛔ no corre efectos ni eventos.
- **La regla y el cable**: `tests/reclamo-publico-fotos-del-caso.test.tsx` prueba la pantalla del
  portal, `paraElCliente` corriendo, y **compara las dos caras de la regla motivo por motivo**.
- ⚠️ **⛔ Sin migración**, ⛔ sin función serverless nueva (el build sigue con una sola ruta dinámica).
- 📌 De paso: `npm run lint` estaba **en rojo en `main`** desde `890b1eb` por un ternario como
  sentencia en `scripts/caminar-alta-publica.mjs`. Arreglado acá.
