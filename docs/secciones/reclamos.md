# Reclamos y Cambios — ficha de sección

Secciones `reclamos` y `cambios`, área Administración / Local. Todo lo que sale mal después de la
venta: llegó fallado, faltó algo, llegó otra cosa, nunca llegó, no era lo que esperaba, no le entró
el talle, se arrepintió, o no teníamos el producto. Reemplazó a **Fallas-con-envío** y a
**Devoluciones**, que eran dos pantallas con dos motores.

**Un registro, dos pantallas.** Cambios sigue siendo su propia pantalla porque es una operación de
mostrador, pero escribe sobre la misma tabla: **un cambio no es un tipo de caso, es un caso con
`compensacion='otro_producto'`**. Por eso no hay tabla `cambios`.

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

Handler `api/_reclamos.js` (entra por `api/postventa.js`) y el portal público `api/_reclamo.js`.
La venta en Gestión Nube la crea `api/crear-venta.js`, **que corre en PROD también desde localhost**
(los tokens de ventas viven ahí).

Tabla `devoluciones` (`sql/migrate-devoluciones*.sql`, `sql/migrate-reclamos-efectos.sql`,
`sql/migrate-reclamos-escenario.sql`). Tests: `tests/reclamos.test.ts` (1.2k líneas),
`tests/reclamos-escenarios.test.ts`, `tests/reclamos-mensajes.test.ts`, `tests/reclamo-publico.test.ts`.

## ⛔ Lo que comparte con otras secciones

- **`lib/reclamos/efectos.core.js` lo lee el handler Y la app.** Va en `.js` plano por lo mismo que
  `lib/permisos.core.js`. La cara tipada está en `tipos.ts` — ⛔ no duplicar la derivación en ningún
  otro lado: ése es exactamente el bug que arregló.
- **Las fallas que nacen de un reclamo van al ledger de Post-venta** (`falla_ids`). Tocar cómo se
  valúa una falla acá mueve esa sección.
- **`/reclamo/<token>` es un portal ABIERTO**, sin sesión, resuelto antes del guard de permisos. Es
  lo único de este módulo expuesto a internet.

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
- ⚠️ **En GN el descuento a nivel venta es `discount_amount`, NO `discount`** — `discount` se ignora
  en el POST aunque al leer aparezca poblado. Verificado con probes en prod.

## Pendiente

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
- ▶️ **Falta lo que la partición NO resuelve: la venta técnica de una unidad sana sale a nombre de
  «Reclamo», no del cliente de Fallas — pero el excedente que salió de OTRA venta sigue sin abrirle
  el faltante a esa otra venta.** Lo dice el escenario (`otra_venta`) y lo hace una persona.
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

## Cómo se prueba

`npx vitest run tests/reclamos.test.ts --reporter=dot` — es el único lugar del módulo con tests
exhaustivos, porque **acá vive la plata** y un error no rompe ninguna pantalla: se ve recién en la
caja o en el stock.

Lo que los tests **no** cubren y hay que ejercer a mano:

- **Crear la venta en GN.** `api/crear-venta.js` pega a PROD. Se prueba con una venta real y se
  borra después; las de prueba viejas de BDI están anotadas en la memoria del proyecto.
- **El portal del cliente** (`/reclamo/<token>`): que el link llegue, que suba fotos, y que el token
  venza. Nada de eso pasa por la app logueada.
- **Los pendientes en la pantalla.** Los tests fijan `pendientesDe()`; que la columna los muestre y
  que tildarlos escriba (acción `pendiente` del handler) se camina en Reclamos con una fila real.
