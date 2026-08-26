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

## Cómo se prueba

`npx vitest run tests/reclamos.test.ts --reporter=dot` — es el único lugar del módulo con tests
exhaustivos, porque **acá vive la plata** y un error no rompe ninguna pantalla: se ve recién en la
caja o en el stock.

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
