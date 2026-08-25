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
  el permiso de la sección se puede hacer eso y **dos** acciones (`recibir`, `reingreso`), nada más
  — la acción `estado` genérica acepta los ocho estados, cerrar y anular incluidos.
- ⚠️ **`recibir` sólo acepta filas en `en_transito`.** Recibir algo que no estábamos esperando no es
  un error de tipeo: es que el reclamo no está donde el que lo recibe cree, y taparlo con un update
  deja la fila diciendo que volvió algo que nunca salió.
- ⚠️ **Reingresar es a mano en Gestión Nube** (no acepta escribir stock negativo por API), igual que
  anular. El botón es una **traza**, no una escritura.

## Lo que ya se rompió acá

- 🔴 **La alerta "hace N días que no llega" se reiniciaba sola** — ver arriba. Estaba desde que
  existe `alertasDe`; se arregló el 25-ago-2026 junto con esta sección, y el mutante que la cuida
  es *"la alerta vuelve a contar desde el último toque"*.
- 🔴 **Dos `diasDesde`**, uno por archivo. Los tests daban verde igual porque cada uno miraba el
  suyo. Lo cazó un mutante sobre la copia de `tipos.ts`, no la relectura.

## Pendiente

- ▶️ **Nunca se caminó con una fila real**: al 25-ago-2026 BDI tiene 10 reclamos y **ninguno llegó
  jamás a `en_transito`** (todos quedaron en borrador/esperando cliente desde el 28-jul, cuando el
  módulo estuvo frenado), y Zattia tiene 0. La bandeja nace vacía **a propósito**, no rota.
- ▶️ **No muestra el envío de ida ni lo que se le mandó al cliente.** Si un reenvío o un cambio
  también tiene un paquete saliendo, eso se sigue en Reclamos.
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
