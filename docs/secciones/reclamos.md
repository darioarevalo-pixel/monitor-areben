# Reclamos y Cambios — ficha de sección

Secciones `reclamos` y `cambios`, área Administración / Local. Todo lo que sale mal después de la
venta: llegó fallado, faltó algo, llegó otra cosa, nunca llegó, no era lo que esperaba, no le entró
el talle, se arrepintió, o no teníamos el producto. Reemplazó a **Fallas-con-envío** y a
**Devoluciones**, que eran dos pantallas con dos motores.

**Un registro, dos pantallas.** Cambios sigue siendo su propia pantalla porque es una operación de
mostrador, pero escribe sobre la misma tabla: **un cambio no es un tipo de caso, es un caso con
`compensacion='otro_producto'`**. Por eso no hay tabla `cambios`.

## Dónde vive

`components/reclamos/` (`Reclamos.tsx` 44k · `ArmarCambio.tsx` 50k · `DecidirReclamo.tsx` 31k ·
`ReclamoPublico.tsx`) · `components/postventa/` (Fallas, otra cosa: el ledger) ·
`lib/reclamos/tipos.ts` (**1.4k líneas, leer por rango**) · `lib/reclamos/efectos.core.js` ·
`lib/reclamos/mensajes.ts` · `lib/reclamos/cliente.ts`.

Handler `api/_reclamos.js` (entra por `api/postventa.js`) y el portal público `api/_reclamo.js`.
La venta en Gestión Nube la crea `api/crear-venta.js`, **que corre en PROD también desde localhost**
(los tokens de ventas viven ahí).

Tabla `devoluciones` (`sql/migrate-devoluciones*.sql`, `sql/migrate-reclamos-efectos.sql`). Tests:
`tests/reclamos.test.ts` (1.2k líneas), `tests/reclamos-mensajes.test.ts`, `tests/reclamo-publico.test.ts`.

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

- 🔴 **`sql/migrate-reclamos-efectos.sql` está SIN CORRER.** El bloque 2 (la columna
  `envio_nuevo_estado`) **va antes de deployar**: el código la escribe al decidir y sin la columna
  falla el `update` entero. Va en BDI **y** en ZATTIA.
- ▶️ **El rediseño en curso: los 8 motivos pasan a 11 casos** y el módulo se reorganiza como un
  chasis de tres bandas — inicio común, **el escenario** (el nivel que hoy no existe: se va del
  motivo a la decisión de una), final común. Entran producto ≠ a lo informado, excedente y demora;
  cancelación es un escenario de arrepentimiento, no un caso.
- ▶️ **Falta la bandeja de retornos**: hoy `via_retorno`, `seguimiento_vuelta` y la alerta a los 15
  días viven adentro de cada fila, así que para saber qué estamos esperando hay que abrirlos de a
  uno. La ven Depósito **y** Local.
- ⚠️ **`no_esperaba` mezcla dos casos** y por eso su `errorPropio` está en `false`: adentro conviven
  "no me gustó" (no es nuestro) y "la publicación está mal" (sí lo es). Cuando se separe en dos
  motivos, el segundo va en `true` — hoy poner `true` regalaría el envío en cada "no me gustó".
- ⚠️ **El cupón no es un pendiente**: `cupon_codigo` se tipea a mano y nada avisa si nunca se creó en
  la tienda.
- ⚠️ **Un solo `destino_prenda` para los DOS productos de `mal_armado`** — el que compró y el que
  salió por error pueden terminar distinto, y hoy se decide uno solo para los dos.

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
