# Retornos — ficha de sección

Sección `retornos`, área Depósito (**cuelga también del menú de Local**, con rótulo propio: *"Lo que
tiene que volver"*). La bandeja de **lo que estamos esperando que vuelva**: lo que el cliente
despachó de vuelta, lo que va a traer al mostrador, lo de los cambios, y lo que ya llegó y todavía
no volvió al stock.

No reemplaza a nada: es el nivel que faltaba. Los datos ya existían —`via_retorno`,
`seguimiento_vuelta`, los estados `en_transito`/`recibido`, la alerta a los 15 días— pero **adentro
de la fila de cada reclamo**, así que para saber qué estábamos esperando había que abrirlos de a uno.
Es la **capa de la vuelta** del chasis de Postventa (resolución → movimientos → *la vuelta* → cierre):
un reintegro se hace y se termina, una vuelta **dura**.

📄 **Auditoría de punta a punta del 28-ago-2026: `docs/postventa-auditoria-2026-08-28.md`.**
✅ De ahí salió el único arreglado hasta ahora: **el botón «Despaché» le contestaba 403 a Depósito**
—`despachado` ⛔ no estaba en `ACCIONES_DE_LA_BANDEJA`, y el andén se había construido justamente
porque Depósito ⛔ no puede abrir Reclamos—. El relato, en «Lo que ya se rompió acá».

## Dónde vive

`components/retornos/Retornos.tsx` (la pantalla, sólo lectura + dos botones) ·
`lib/reclamos/retornos.ts` (los dos andenes, el orden y las trabas) ·
`lib/reclamos/cliente.ts` (`leerRetornos`, `marcarRecibido`) ·
handler `api/_reclamos.js` (`vista=retornos` y la acción `recibir`), que entra por `api/postventa.js`.
Tabla `devoluciones`, la misma de Reclamos — **no hay tabla propia y no la va a haber**.
Tests: `tests/retornos.test.ts`.

## ⛔ Lo que comparte con otras secciones

- **Es la misma tabla y el mismo registro que Reclamos y Cambios.** Un retorno no es una entidad:
  es un reclamo en `estado='en_transito'`. Leer `docs/secciones/reclamos.md` antes de tocar nada
  que decida plata o destino — acá no se decide **nada** de eso.
- **`desdeQueEsta` y `diasDesde` viven en `lib/reclamos/tipos.ts`, no acá.** La alerta "hace N días
  que no llega" cuenta exactamente el mismo número que la columna de la bandeja. ⛔ No copiarlas:
  ya pasó una vez y la copia se quedó sin el piso en cero **sin que ningún test lo viera**, porque
  cada test miraba su propia copia.
- **La acción `recibir` la usan las tres pantallas** (la bandeja, Reclamos y Cambios): los botones
  "Volvió" de las otras dos apuntan acá. Antes cada una llamaba a `estado: 'recibido'` por su lado.

## Reglas que el código no dice

- 🔴 **`estado='en_transito'` es lo único que significa "todavía no está acá".** ⛔ No derivar el
  andén del pendiente de reingreso: `procesar` (la venta de un cambio en GN) deja `en_transito` **y**
  `reingreso_estado='pendiente'` a la vez, así que un cambio recién facturado aparecería como
  "llegó, guardalo" el mismo día en que el cliente todavía no despachó nada.
- 🔴 **Los días se cuentan desde el historial, no desde `updated_at`.** `updated_at` lo pisa
  cualquier acción sobre el reclamo, y el toque más probable sobre un retorno que se demora es
  justamente **ir a ver por qué se demora** ⇒ cargarle el código de seguimiento ponía el contador en
  cero y la alerta desaparecía cuando alguien se estaba ocupando. → `desdeQueEsta` (`tipos.ts`).
- 🔑 **Un paquete "en camino" sin código de seguimiento no está en camino: está parado, y la traba
  es NUESTRA** (falta mandar la etiqueta). Por eso la traba va en la fila y no como alerta por
  tiempo: no es que tarde, es que nadie lo despachó. ⚠️ El cadete y "la trae al local" no piden
  etiqueta — pedirla ahí sería inventar un pendiente que nadie puede tildar.
- 🔑 **El orden es al revés que el de Reclamos**: primero lo más viejo. En una cola de reclamos
  importa lo último que entró; en una bandeja de espera importa lo que hace más tiempo que no
  aparece.
- 🔑 **Se ve el nombre del cliente y NO el relato, los montos ni el token.** La lectura entra por
  `vista=retornos`, una puerta con columnas propias: Depósito abre una caja, no revisa un caso. Con
  el permiso de la sección se puede hacer eso y **los tres gestos físicos** (`recibir`, `reingreso`,
  `despachado`), nada más — la acción `estado` genérica acepta los ocho estados, cerrar y anular
  incluidos, y por eso ⛔ no entra.
- ⚠️ **`recibir` sólo acepta filas en `en_transito`.** Recibir algo que no estábamos esperando no es
  un error de tipeo: es que el reclamo no está donde el que lo recibe cree, y taparlo con un update
  deja la fila diciendo que volvió algo que nunca salió.
- ⚠️ **Reingresar es a mano en Gestión Nube** (no acepta escribir stock negativo por API), igual que
  anular. El botón es una **traza**, no una escritura.

## Lo que ya se rompió acá

- 🔴 ✅ **El botón «Despaché» le contestaba 403 a la persona que despacha** (arreglado el
  28-ago-2026). `ACCIONES_DE_LA_BANDEJA` (`api/_reclamos.js`) es lo único que un perfil de
  **Depósito** puede hacer acá, y decía `['recibir', 'reingreso']`. El tercer andén se construyó el
  26-ago **exactamente porque Depósito ⛔ no puede abrir Reclamos** —el botón estaba del lado
  equivocado de la puerta—; el botón se mudó y la lista se quedó en dos. **Cuarta vuelta del agujero
  propio del módulo**, y ⛔ no lo vio ningún test porque **los dos lados estaban bien**: el agujero
  vivía en la pregunta del medio.
  🔑 **Lo que lo cierra ⛔ no es la línea de la lista, son los dos cables**: `tests/retornos.test.ts`
  ata las acciones que la pantalla puede disparar a la lista del servidor, y
  `tests/handlers-autorizacion.test.ts` **corre el handler de verdad** con un perfil de Depósito y
  fija las dos mitades — que los tres gestos pasen, y que `decidir`, `estado`, `eliminar` y compañía
  ⛔ no.
  ⚠️ Y como el verbo pasó a ser alcanzable por la puerta angosta, se le agregó el guard que le
  faltaba: **sólo sella si el pendiente está** (409 si no) y es idempotente. Mismo «el cero afirma»
  que ya frenaban `recibir` y `descontado`. Caminado en vivo contra BDI, **11 de 11**
  (`scripts/caminar-despacho-deposito.mjs`: una fila sembrada y borrada, las 2 reales intactas).

- 🔴 **La alerta "hace N días que no llega" se reiniciaba sola** — ver arriba. Estaba desde que
  existe `alertasDe`; se arregló el 25-ago-2026 junto con esta sección, y el mutante que la cuida
  es *"la alerta vuelve a contar desde el último toque"*.
- 🔴 **Dos `diasDesde`**, uno por archivo. Los tests daban verde igual porque cada uno miraba el
  suyo. Lo cazó un mutante sobre la copia de `tipos.ts`, no la relectura.

## Pendiente

- ▶️ **Nunca se caminó con una fila real**: al 25-ago-2026 BDI tiene 10 reclamos y **ninguno llegó
  jamás a `en_transito`** (todos quedaron en borrador/esperando cliente desde el 28-jul, cuando el
  módulo estuvo frenado), y Zattia tiene 0. La bandeja nace vacía **a propósito**, no rota.
- ✅ **El paquete que SALE ya está acá** (26-ago-2026). Era el *«no muestra el envío de ida ni lo
  que se le mandó al cliente»*, y abajo había algo más grande que un dato faltante:

  🔴 🔑 **El botón para tildar «Despaché» existía sólo en Reclamos, que es de Administración — y
  despachar lo hace Depósito, que ⛔ no puede abrir esa pantalla.** El handler ya estaba bien
  (`action: 'despachado'`, deliberadamente fuera de `DE_ADMIN`); lo que faltaba era **dónde
  apretarlo**. Es la segunda vuelta del mismo agujero: el 24-ago el pendiente no tenía botón, y
  desde el 25 el botón quedó del lado equivocado de la puerta. Un pendiente que la persona que lo
  hace no puede tildar se lee igual que uno que nadie hizo.

  - **Tercer andén, «Falta despachar»** (`faltaDespachar`): mira **el pendiente, ⛔ no el estado**.
    Un cambio queda `en_transito` y un reenvío sin retorno queda `resuelto`; filtrando por estado,
    el caso más común de «hay que mandarle algo» no aparecería nunca.
  - **Qué sale** (`detalleDeLoQueSale`) es la misma trampa que `deDondeVuelve`, del otro lado: en
    un **cambio** sale `items_nuevos`, y en una **reposición** o un **reenvío** sale `items` — lo
    que compró, incluso en un `mal_armado`, donde es justo el único que nunca salió del depósito.
  - ⚠️ **Un cambio está en DOS andenes a la vez y no es un error**: esperamos lo que devuelve *y*
    le tenemos que mandar lo que se lleva. La fila de los otros dos andenes lo dice igual
    (`↗ Le mandamos: …`), así que quien abre la caja se entera aunque no le toque a él.
  - 🔴 **El reloj cuenta desde la DECISIÓN** (`desdeQueSeDecidio`), no desde el último evento del
    estado: en un caso vivo se apilan varios `resuelto` —la plata, el cupón, la anulación— y
    contando desde el último, **ocuparse de otra cosa del caso apagaría la alarma de que nadie
    despachó**. Es el mismo defecto que ya tuvo `desdeQueEsta` con `updated_at`, una vuelta más
    adentro.
  - El plazo es **2 días** (`DIAS_ALERTA.despacho`), ⛔ no los 15 de un tránsito del correo:
    despachar es trabajo del día siguiente. ⚠️ Es lo único de acá que salió de una propuesta y no
    de la operación — se cambia en una línea de `tipos.ts`.
  - ⛔ **`envio_ida_costo` NO entró al `select`**: es plata, y por esta puerta angosta Depósito ⛔ no
    ve montos. Sí entraron `items_nuevos`, `seguimiento_ida` y `envio_nuevo_estado`, que **ya
    existían en la tabla** ⇒ sin migración.
  - 🔑 **Y quedó un guard nuevo**: `RetornoRow` es un `Pick` de TypeScript y `COLS_RETORNO` un
    string para PostgREST, y **nada los ataba**. Una columna que el tipo pide y el `select` no trae
    llega `undefined` y la pantalla dibuja un guión: ⛔ no falla, no avisa, y se pierde justo el
    dato por el que alguien iba a mirar. El test lee los dos archivos y los compara.
- ✅ **Se recibe de a UNA** (25-ago-2026). Cada unidad lleva su `recibida_at` y el reclamo **sigue en
  tránsito mientras falte una**: darlo por recibido con la caja a medias era lo que dejaba a la otra
  sin que la buscara nadie. Con dos o más esperadas, la bandeja muestra un botón por producto y uno
  de "llegaron los N". La regla vive en `lib/reclamos/unidades.core.js`.
- 🔴 ✅ **Y lo que la bandeja mostraba estaba MAL en un caso**: en `mal_armado` listaba `items` —lo
  que el cliente **compró**— cuando lo que vuelve es lo que se le mandó **por error**
  (`items_correctos`), que es el único producto que sí salió del depósito. Depósito abría la caja
  esperando otra cosa. Por eso `COLS_RETORNO` ahora trae `items_correctos` y `retorno_decidido`:
  ⛔ no son columnas de más, sin las dos la puerta angosta le muestra el producto equivocado.
- ⚠️ **Si nadie cargó qué le llegó por error, la vuelta queda TRABADA y lo dice** — ⛔ no se puede
  recibir: sin unidades esperadas, "llegó todo" sería verdad sobre una lista vacía y el reclamo
  pasaría a `recibido` sin que nadie haya abierto una caja.

## Cómo se prueba

`npx vitest run tests/retornos.test.ts --reporter=dot`.

Lo que los tests **no** cubren y hay que ejercer a mano, con una fila real:
- **Que `recibir` escriba**: se comprueba **en la base** (la fila queda en `recibido` y el historial
  suma el evento), no por el toast de la pantalla.
- **Que Depósito vea la sección y NO vea Reclamos**: el permiso nuevo se hereda por función
  (`ACCESO_POR_FUNCION.deposito` la toma por área; Local y Administración por `keys`), así que hay
  que abrirla con un usuario que **no** sea admin.
- **Que la puerta angosta sea angosta**: pedir `vista=retornos` con un perfil que sólo tenga
  `retornos` tiene que traer las columnas mínimas, y `vista=token` sobre el mismo perfil tiene que
  dar **403**.

## 🆕 🔴 La bandeja ya avisa, y el código de seguimiento tiene piso (29-ago-2026)

📄 El recorrido entero está en `docs/postventa-mapa-operativo.md`.

### 🔴 Los dos relojes se calculaban acá y ⛔ no salían a ninguna parte

`avisosDeReclamo` (`lib/notificaciones/derivar.ts`) arranca con `puedeVer(…, 'postventa')` —a
propósito, porque manda a esa pantalla— y **Depósito ⛔ no tiene esa sección**: este andén se
construyó justamente porque ⛔ no puede abrir Reclamos. ⇒ *«quince días sin aparecer»* y *«dos sin
despachar»* se dibujaban **sólo adentro de esta pantalla**, o sea que quien hace el trabajo se
enteraba **únicamente si entraba a mirar**. Es la **quinta vuelta del agujero propio del módulo**: el
trabajo de un lado de la puerta y la señal del otro ⇒
[[feedback_areben_dos_lados_bien_y_la_pregunta_del_medio]].

✅ **`avisosDeRetorno`**, con su lectura por la **puerta angosta** (`vista=retornos`, que es la única
que Depósito puede pedir). ⛔ **No hay reglas nuevas**: los andenes, los plazos y el «tarde» salen
enteros de `bandejaDeRetornos`.

- 🔑 **⛔ No le avisa dos veces al mismo**: quien puede abrir `postventa` ya recibe el aviso del
  reclamo, que cuenta los mismos días con el mismo reloj. Dos avisos por la misma fila, con dos rutas
  distintas, es peor que uno.
- ⚠️ **«Para guardar» ⛔ no avisa, a propósito**: ⛔ no tiene plazo. Lo que llegó está adentro del
  depósito ⇒ ⛔ no hay a quién ir a buscar, y ponerle un reloj sería apurar a quien ya hizo su parte.
- El `id` distingue los dos andenes, porque **un cambio está en los dos a la vez**.

### 🔴 El código de seguimiento ⛔ no guarda un dato: mueve el caso

`seguimiento_vuelta` decide **cuatro cosas a la vez**: el rótulo del estado, el mensaje que se le
ofrece al cliente, y **cuál de los dos relojes corre** —el nuestro, rojo a los 2 días, o el del
transporte, amarillo a los 15—. ⇒ **un código mal tipeado cambia a quién estamos yendo a buscar**, y
⛔ no rompe ninguna pantalla.

✅ **`lib/reclamos/seguimiento.core.js`**, y lo aplican **las dos puertas del servidor** (`editar` y
`cambio`) además de la pantalla: *una pantalla que valida es una sugerencia, ⛔ no una regla*.

- 🔑 **Es un PISO, ⛔ no un formato.** Andreani y Correo ⛔ no publican uno estable y este repo ⛔ no
  midió ninguno —los únicos códigos de la base son de prueba—. Un regex inventado rechazaría códigos
  buenos, que es peor: deja a alguien sin poder cargar lo que tiene en la mano.
- ⛔ **Vaciarlo es legítimo y ⛔ no se frena**: se carga el equivocado, se borra, se pone el bueno.

### ⚠️ Andreani ⛔ no toma el código por URL

`trackingUrl` devuelve **la misma dirección con código o sin él**, así que el link abría una pantalla
vacía y había que volver a seleccionar el código a mano — chico, y **todas** las veces. Ahora al lado
va el botón para copiarlo, y **`elCodigoNoViajaEnElLink` se DERIVA de las dos funciones**, ⛔ no es
una segunda lista de transportistas: el día que Andreani lo acepte, esto se contesta solo.

### Los rótulos

Los tres gestos pasaron a infinitivo —**Recibir · Reingresar · Despachar**— y los dos andenes dejaron
de llamarse con `falta`, que §1.2 del glosario ⛔ no permite como nombre de un bloque: **Para guardar**
y **Para despachar**. Los «Sí, ya lo cargué» de los diálogos se quedan: son la cuarta voz. El relato,
en `docs/secciones/reclamos.md`.
